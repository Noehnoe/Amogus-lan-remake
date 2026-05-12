# VOIDSHIP — Solo Drift / Coop Drift

A top-down 2D Among-Us-style game. Runs single-player from a file, or coop
multiplayer through a small Node server.

## Single-player (no install)

Just double-click `index.html`. The game runs entirely in the browser. Press
**BOOT SEQUENCE** and complete the 6 ship systems while the impostor stalks
the corridors.

## 2-player coop (requires Node.js)

```bash
npm install
npm start
```

The server prints something like:

```
Local:   http://localhost:3000
LAN:     http://192.168.1.42:3000  ← share with another browser
```

1. Open `http://localhost:3000` in **two browser tabs** (or two different
   devices on the same network using the LAN URL).
2. In each tab, press **BOOT SEQUENCE**.
3. You'll see each other moving around with name tags. Task progress is
   shared — work together to finish all six systems.

The menu shows `MULTIPLAYER · N PLAYERS CONNECTED` when the server connection
is live. The impostor mechanic is disabled in multiplayer (this is a pure
coop test mode for now).

## Controls

| Key | Action |
| --- | ------ |
| WASD | Move |
| Shift | Sprint |
| E | Interact with task station |
| F | Toggle flashlight (dim vision when off) |

## Files

- `index.html` / `app.js` / `style.css` — the game (single-page client)
- `server/server.js` — multiplayer relay server
- `package.json` — npm scripts and dependencies
- `client/` and `server/{lobby,game,rooms,roles}.js` — the original Phase-1
  scaffolds, kept for reference but unused by the current game.
