const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const MAX_PLAYERS = 200;
const games = new Map(); // pin -> game

function makePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (games.has(pin));
  return pin;
}

function sanitizeQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) return null;
  const questions = [];
  for (const x of quiz.questions.slice(0, 50)) {
    const text = String((x && x.text) || '').trim().slice(0, 200);
    const raw = ((x && x.answers) || []).slice(0, 4).map(a => String(a).trim().slice(0, 100));
    const keep = [];
    raw.forEach((t, i) => { if (t) keep.push(i); });
    const answers = keep.map(i => raw[i]);
    const correct = keep.indexOf(Number(x && x.correct));
    if (!text || answers.length < 2 || correct < 0) return null;
    const time = Math.min(120, Math.max(5, Number(x.time) || 20));
    questions.push({ text, answers, correct, time });
  }
  return { title: String(quiz.title || 'Kvíz').trim().slice(0, 100), questions };
}

function leaderboard(g) {
  return [...g.players.entries()]
    .map(([id, p]) => ({ id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

function toHost(g, event, data) {
  io.to(g.hostId).emit(event, data);
}

function sendLobby(g) {
  toHost(g, 'lobby:update', [...g.players.values()].map(p => p.name));
}

function counts(g) {
  const connected = [...g.players.values()].filter(p => p.connected);
  return { answered: connected.filter(p => p.answer).length, total: connected.length };
}

function sendCount(g) {
  toHost(g, 'question:count', counts(g));
}

function startQuestion(g) {
  const q = g.quiz.questions[g.index];
  g.state = 'question';
  g.startedAt = Date.now();
  for (const p of g.players.values()) {
    p.answer = null;
    p.points = 0;
  }
  const payload = {
    index: g.index,
    total: g.quiz.questions.length,
    text: q.text,
    answers: q.answers,
    time: q.time,
  };
  toHost(g, 'question:start', payload);
  io.to(g.pin).emit('question:start', payload);
  sendCount(g);
  clearTimeout(g.timer);
  g.timer = setTimeout(() => endQuestion(g), q.time * 1000 + 500);
}

function endQuestion(g) {
  if (g.state !== 'question') return;
  clearTimeout(g.timer);
  g.state = 'results';
  const q = g.quiz.questions[g.index];
  const cnt = q.answers.map(() => 0);

  for (const p of g.players.values()) {
    p.result = 'none';
    p.points = 0;
    if (p.answer) {
      cnt[p.answer.choice]++;
      if (p.answer.choice === q.correct) {
        p.streak++;
        const base = Math.round(1000 * (1 - p.answer.elapsed / q.time / 2));
        const bonus = Math.min(p.streak - 1, 5) * 100;
        p.points = base + bonus;
        p.score += p.points;
        p.result = 'correct';
      } else {
        p.streak = 0;
        p.result = 'wrong';
      }
    } else {
      p.streak = 0;
    }
  }

  const board = leaderboard(g);
  const isLast = g.index >= g.quiz.questions.length - 1;
  toHost(g, 'question:end', {
    correct: q.correct,
    counts: cnt,
    leaderboard: board.slice(0, 5).map(({ name, score, rank }) => ({ name, score, rank })),
    isLast,
  });
  for (const entry of board) {
    const p = g.players.get(entry.id);
    io.to(entry.id).emit('question:end', {
      result: p.result,
      points: p.points,
      score: p.score,
      rank: entry.rank,
      streak: p.streak,
      correct: q.correct,
      total: board.length,
    });
  }
}

function endGame(g) {
  g.state = 'ended';
  const board = leaderboard(g);
  toHost(g, 'game:end', board.slice(0, 10).map(({ name, score, rank }) => ({ name, score, rank })));
  for (const entry of board) {
    io.to(entry.id).emit('game:end', { rank: entry.rank, score: entry.score, total: board.length });
  }
}

function checkAllAnswered(g) {
  if (g.state !== 'question') return;
  const c = counts(g);
  if (c.answered >= c.total) endQuestion(g);
}

io.on('connection', socket => {
  socket.on('host:create', (data, cb) => {
    if (typeof cb !== 'function') return;
    const quiz = sanitizeQuiz(data && data.quiz);
    if (!quiz) return cb({ ok: false, error: 'Neplatný kvíz. Skontroluj otázky a odpovede.' });
    const pin = makePin();
    const g = {
      pin,
      hostId: socket.id,
      quiz,
      players: new Map(),
      state: 'lobby',
      index: -1,
      startedAt: 0,
      timer: null,
    };
    games.set(pin, g);
    socket.data = { role: 'host', pin };
    cb({ ok: true, pin });
  });

  socket.on('host:start', () => {
    const g = hostGame(socket);
    if (!g || g.state !== 'lobby' || g.players.size === 0) return;
    g.index = 0;
    startQuestion(g);
  });

  socket.on('host:showResults', () => {
    const g = hostGame(socket);
    if (g) endQuestion(g);
  });

  socket.on('host:next', () => {
    const g = hostGame(socket);
    if (!g || g.state !== 'results') return;
    if (g.index >= g.quiz.questions.length - 1) return endGame(g);
    g.index++;
    startQuestion(g);
  });

  socket.on('player:join', (data, cb) => {
    if (typeof cb !== 'function') return;
    const pin = String((data && data.pin) || '').trim();
    const name = String((data && data.name) || '').trim().slice(0, 20);
    const g = games.get(pin);
    if (!g) return cb({ ok: false, error: 'Hra s týmto PINom neexistuje.' });
    if (g.state !== 'lobby') return cb({ ok: false, error: 'Hra už začala.' });
    if (!name) return cb({ ok: false, error: 'Zadaj prezývku.' });
    if (socket.data && socket.data.pin) return cb({ ok: false, error: 'Už si pripojený.' });
    if (g.players.size >= MAX_PLAYERS) return cb({ ok: false, error: 'Hra je plná.' });
    const taken = [...g.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase());
    if (taken) return cb({ ok: false, error: 'Táto prezývka je už obsadená.' });
    g.players.set(socket.id, { name, score: 0, streak: 0, answer: null, points: 0, result: null, connected: true });
    socket.join(pin);
    socket.data = { role: 'player', pin };
    cb({ ok: true, name });
    sendLobby(g);
  });

  socket.on('player:answer', data => {
    const g = games.get(socket.data && socket.data.pin);
    if (!g || socket.data.role !== 'player' || g.state !== 'question') return;
    const p = g.players.get(socket.id);
    if (!p || p.answer) return;
    const q = g.quiz.questions[g.index];
    const choice = Number(data && data.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.answers.length) return;
    const elapsed = Math.min((Date.now() - g.startedAt) / 1000, q.time);
    p.answer = { choice, elapsed };
    sendCount(g);
    checkAllAnswered(g);
  });

  socket.on('disconnect', () => {
    const { role, pin } = socket.data || {};
    const g = games.get(pin);
    if (!g) return;
    if (role === 'host') {
      clearTimeout(g.timer);
      io.to(pin).emit('game:closed');
      games.delete(pin);
    } else if (role === 'player') {
      if (g.state === 'lobby') {
        g.players.delete(socket.id);
        sendLobby(g);
      } else {
        const p = g.players.get(socket.id);
        if (p) {
          p.connected = false;
          if (g.state === 'question') {
            sendCount(g);
            checkAllAnswered(g);
          }
        }
      }
    }
  });
});

function hostGame(socket) {
  const d = socket.data || {};
  if (d.role !== 'host') return null;
  return games.get(d.pin) || null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Kvíz beží na http://localhost:${PORT}`));
