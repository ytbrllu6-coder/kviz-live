// Smoke test: spustí server, pripojí hostiteľa a 2 hráčov a prejde celú hru.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const server = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
let failed = false;
function check(cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + msg);
  if (!cond) failed = true;
}
const once = (s, ev) => new Promise(r => s.once(ev, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  await sleep(800);
  const quiz = { title: 'T', questions: [
    { text: 'Q1', answers: ['a', 'b', 'c', 'd'], correct: 1, time: 10 },
    { type: 'tf', text: 'Q2', correct: 0, time: 10 },
  ] };
  const host = io(URL), p1 = io(URL), p2 = io(URL);
  await Promise.all([once(host, 'connect'), once(p1, 'connect'), once(p2, 'connect')]);

  const { pin } = await new Promise(r => host.emit('host:create', { quiz }, r));
  check(/^\d{6}$/.test(pin), 'PIN vytvorený: ' + pin);

  const bad = await new Promise(r => p1.emit('player:join', { pin: '000000', name: 'x' }, r));
  check(!bad.ok, 'Zlý PIN je odmietnutý');
  const j1 = await new Promise(r => p1.emit('player:join', { pin, name: 'Anna' }, r));
  const j2 = await new Promise(r => p2.emit('player:join', { pin, name: 'Boris' }, r));
  check(j1.ok && j2.ok, 'Dvaja hráči sa pripojili');
  const dup = await new Promise(r => io(URL).emit('player:join', { pin, name: 'anna' }, r));
  check(!dup.ok, 'Duplicitná prezývka odmietnutá');

  // Otázka 1: Anna správne, Boris zle -> koniec otázky skôr, lebo odpovedali obaja
  let q = Promise.all([once(host, 'question:start'), once(p1, 'question:start')]);
  host.emit('host:start');
  await q;
  const endHost = once(host, 'question:end'), e1 = once(p1, 'question:end'), e2 = once(p2, 'question:end');
  p1.emit('player:answer', { choice: 1 });
  p2.emit('player:answer', { choice: 0 });
  const [h1, r1, r2] = await Promise.all([endHost, e1, e2]);
  check(r1.result === 'correct' && r1.points > 500, 'Anna: správne, body ' + r1.points);
  check(r2.result === 'wrong' && r2.points === 0, 'Boris: nesprávne');
  check(h1.counts[1] === 1 && h1.counts[0] === 1 && !h1.isLast, 'Hostiteľ vidí počty odpovedí');

  // Otázka 2 (posledná)
  q = once(p1, 'question:start');
  host.emit('host:next');
  const q2 = await q;
  check(q2.type === 'tf' && q2.text === 'Q2' && q2.answers.join() === 'Pravda,Nepravda', 'Hráč dostane text a odpovede otázky Pravda/Nepravda');
  const end2 = once(host, 'question:end');
  p1.emit('player:answer', { choice: 0 });
  p2.emit('player:answer', { choice: 0 });
  const h2 = await end2;
  check(h2.isLast, 'Posledná otázka označená');
  check(h2.leaderboard[0].name === 'Anna', 'Anna vedie rebríček');

  const fin = once(host, 'game:end'), fp = once(p1, 'game:end');
  host.emit('host:next');
  const [board, mine] = await Promise.all([fin, fp]);
  check(board.length === 2 && mine.rank === 1, 'Koniec hry, Anna 1. miesto');
  [host, p1, p2].forEach(s => s.close());
}

run().catch(e => { console.error(e); failed = true; }).finally(() => {
  server.kill();
  console.log(failed ? 'TEST ZLYHAL' : 'VŠETKY TESTY PREŠLI');
  process.exit(failed ? 1 : 0);
});
