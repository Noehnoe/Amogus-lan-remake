// game.js — authoritative game state and tick loop (Phase 3+)
// Phase 1 stub.

let _io = null;

function init(io) {
  _io = io;
}

function onDisconnect(socket) {
  // Phase 3+: handle in-game disconnects
}

module.exports = { init, onDisconnect };
