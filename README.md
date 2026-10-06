# Kvíz Live – Kahoot-like aplikácia

Živá kvízová hra: hostiteľ vytvorí kvíz a zobrazí PIN, hráči sa pripoja z mobilov a odpovedajú v reálnom čase.

## Verejná hra cez internet (Render.com, zadarmo)

Aplikácia nahraná na hosting dostane vlastnú adresu (napr. `https://moj-kviz.onrender.com`), ktorú otvorí hocikto.

1. Vytvor si bezplatný účet na **github.com** a nový repozitár (napr. `kviz-live`). Klikni „uploading an existing file“ a nahraj **obsah rozbaleného priečinka** (server.js, package.json, public, test, README.md). Priečinok `node_modules` nenahrávaj.
2. Vytvor si bezplatný účet na **render.com** (prihlásiť sa dá cez GitHub).
3. V Renderi: **New → Web Service**, vyber repozitár `kviz-live`.
4. Vyplň: **Language** `Node`, **Build Command** `npm install`, **Start Command** `npm start`, **Instance Type** `Free`.
5. Klikni **Create Web Service**. Po pár minútach dostaneš adresu `https://…onrender.com`.
6. Hostiteľ otvorí `https://…onrender.com/host.html`, hráči `https://…onrender.com`.

Obmedzenia bezplatného plánu:
- Po 15 minútach bez prevádzky sa služba uspí a prebúdzanie trvá okolo minúty. **Otvor adresu pár minút pred hrou.**
- Pri uspatí alebo novom nasadení sa zrušia rozbehnuté hry (sú len v pamäti).

## Spustenie na vlastnom počítači

```bash
npm install
npm start
```

Server beží na `http://localhost:3000` (port zmeníš premennou `PORT`).

- **Hostiteľ:** `/host.html` (editor kvízu, uloží sa do prehliadača), klikni „Spustiť hru“.
- **Hráči:** `/`, zadajú PIN a prezývku. Na jednej Wi-Fi použi IP adresu počítača, napr. `http://192.168.1.20:3000`.

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
