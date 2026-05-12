// lobby.js — pre-game lobby logic (Phase 2)
// Phase 1 stub: exports no-op hooks so server.js can require it safely.

let _io = null;

function init(io) {
  _io = io;
}

function onConnect(socket) {
  // Phase 2: will handle nickname/color selection, host assignment, settings
}

function onDisconnect(socket) {
  // Phase 2: will remove player from lobby, transfer host if needed
}

module.exports = { init, onConnect, onDisconnect };
