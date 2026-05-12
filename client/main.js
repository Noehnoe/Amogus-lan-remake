// main.js — Socket.IO connection, input handling, client game loop
// Phase 1: establishes connection and wires up the echo test.

// ── Connect to the server (same host that served this page) ────────────────
const socket = io();

// ── Connection state UI ────────────────────────────────────────────────────
const connDot    = document.getElementById('connDot');
const connStatus = document.getElementById('connStatus');
const pingBtn    = document.getElementById('pingBtn');
const echoLog    = document.getElementById('echoLog');

function logEcho(text, type = '') {
  const ts   = new Date().toLocaleTimeString('en-US', { hour12: false });
  const div  = document.createElement('div');
  div.className = `entry ${type}`;
  div.innerHTML = `<span class="ts">${ts}</span>${text}`;
  echoLog.appendChild(div);
  echoLog.scrollTop = echoLog.scrollHeight;
}

socket.on('connect', () => {
  connDot.className    = 'dot green';
  connStatus.textContent = `Connected — socket id: ${socket.id}`;
  pingBtn.disabled     = false;
  logEcho(`Socket connected (${socket.id})`, 'recv');
});

socket.on('disconnect', (reason) => {
  connDot.className    = 'dot red';
  connStatus.textContent = `Disconnected: ${reason}`;
  pingBtn.disabled     = true;
  logEcho(`Disconnected: ${reason}`, 'err');
});

socket.on('connect_error', (err) => {
  connDot.className    = 'dot yellow';
  connStatus.textContent = `Connection error: ${err.message}`;
  logEcho(`Error: ${err.message}`, 'err');
});

// ── Phase 1 echo test ──────────────────────────────────────────────────────
pingBtn.addEventListener('click', () => {
  const payload = { msg: 'ping!', clientTime: Date.now() };
  logEcho(`Sent: ${JSON.stringify(payload)}`, 'sent');
  socket.emit('ping_test', payload);
});

socket.on('pong_test', (data) => {
  const rtt = Date.now() - data.echo.clientTime;
  logEcho(`Recv: ${data.serverMsg} — RTT ${rtt}ms`, 'recv');
});

// ── Phase 2+: lobby and game events will be registered in ui.js ───────────
// (nothing to register here yet)
