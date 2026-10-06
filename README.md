# Kvíz Live – Kahoot-like aplikácia

Živá kvízová hra: hostiteľ vytvorí kvíz a zobrazí PIN, hráči sa pripoja z mobilov a odpovedajú v reálnom čase.

## Spustenie

```bash
npm install
npm start
```

Server beží na `http://localhost:3000` (port zmeníš premennou `PORT`).

- **Hostiteľ:** otvor `/host.html` (editor kvízu, uloží sa do prehliadača), klikni „Spustiť hru“.
- **Hráči:** otvoria `/`, zadajú PIN a prezývku. Na jednej Wi-Fi použi IP adresu počítača, napr. `http://192.168.1.20:3000`.

## Ako hra funguje

1. Hostiteľ vidí PIN a zoznam pripojených hráčov, spustí hru tlačidlom „Štart“.
2. Každá otázka má 2–4 odpovede a časový limit. Otázka sa skončí, keď vyprší čas, odpovedia všetci, alebo hostiteľ klikne „Preskočiť čas“.
3. Body: až 1000 za správnu odpoveď (čím rýchlejšie, tým viac) + bonus 100 za každú správnu odpoveď v sérii (max +500).
4. Po každej otázke sa ukáže graf odpovedí a top 5; na konci pódium.

## Súbory

- `server.js` – herná logika (Express + Socket.IO), stav hier v pamäti
- `public/host.html` – obrazovka hostiteľa
- `public/index.html` – obrazovka hráča
- `public/style.css` – spoločné štýly
- `test/smoke.js` – automatický test (`npm test`)

## Poznámky

- Hry sú len v pamäti servera; po reštarte zanikajú. Pri odpojení hostiteľa sa hra ukončí.
- Pre nasadenie na internet stačí hocijaký hosting s Node.js a podporou WebSocketov.
