// server.js — Express + Socket.IO entry point for Voidship multiplayer.
// Run with: npm start  (or: node server/server.js)
//
// Multiplayer model:
//   - Server is a thin relay + authoritative task state.
//   - Each connected client is a player. We assign a color and a spawn.
//   - Clients broadcast their position ~20Hz; we rebroadcast to others.
//   - When a client completes a task we mark it server-side and broadcast.
//   - When all 6 tasks done, server emits 'win'. Disconnect removes player.

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const os          = require('os');

const PORT = 3000;
const ROOT = path.join(__dirname, '..');

// ── HTTP server ──────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ── Routing ──────────────────────────────────────────────────────────────
// /         → generate a fresh room code and redirect to /r/<code>
// /r/<code> → serve the game; client connects to that room
// /app.js, /style.css → static assets

// Serve the two static assets at both the root and the /r/ prefix so they
// work whether the page is at "/" or "/r/<code>" (the browser resolves
// relative "style.css" / "app.js" against the URL it's currently on).
app.get(['/app.js',    '/r/app.js'],    (req, res) => res.sendFile(path.join(ROOT, 'app.js')));
app.get(['/style.css', '/r/style.css'], (req, res) => res.sendFile(path.join(ROOT, 'style.css')));
app.use('/SFX',   express.static(path.join(ROOT, 'SFX')));
app.use('/r/SFX', express.static(path.join(ROOT, 'SFX')));

function generateRoomCode() {
  // 4 chars, omit ambiguous ones (0/O, 1/I, etc.)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

app.get('/', (req, res) => {
  res.redirect('/r/' + generateRoomCode());
});

app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// ── Game state ───────────────────────────────────────────────────────────

const COLORS = [
  '#ff4d5a', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#ffb347', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e91e63', // pink
  '#f1c40f', // yellow
];
const SPAWNS = [
  { x: 980,  y: 480 },
  { x: 1020, y: 520 },
  { x: 940,  y: 520 },
  { x: 1060, y: 480 },
  { x: 920,  y: 460 },
  { x: 1080, y: 540 },
  { x: 900,  y: 540 },
  { x: 1100, y: 460 },
];

const TASK_IDS = [
  'wires_eng', 'calib_bridge', 'reactor', 'numpad_med', 'wires_comm', 'calib_sec',
];

const KILL_RANGE       = 70;        // px, server-validated kill distance
const KILL_COOLDOWN_MS = 25000;     // 25s between impostor kills
const MEETING_DURATION = 30000;     // 30s voting window
const MEETINGS_PER_PLAYER = 1;      // emergency meetings per player per round

// Detect LAN IPs once at startup so we can send them to clients for "share link"
// generation (so localhost users get a URL their friends can actually reach).
const LAN_IPS = [];
{
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) LAN_IPS.push(net.address);
    }
  }
}

// All active rooms keyed by uppercase code.
const rooms = new Map();

function makeRoom(code) {
  return {
    code,
    players: {},                  // id → player record (tasks are per-player now)
    phase: 'lobby',               // 'lobby' | 'playing' | 'won' | 'lost'
    impostorId: null,             // socket.id of the impostor for this round
    hostId:     null,             // socket.id of the host (first player; transfers on disconnect)
    meeting:    null,             // null or { calledBy, votes, startedAt, duration, timer }
    sabotages:  { lights: 0, doors: 0 },  // expiry timestamps (Date.now ms)
    sabotageTimers: { lights: null, doors: null },
  };
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, makeRoom(code));
    console.log(`[room] created ${code}`);
  }
  return rooms.get(code);
}

function publicPlayer(p) {
  return { id: p.id, color: p.color, name: p.name, x: p.x, y: p.y, facing: p.facing, sprinting: p.sprinting, alive: p.alive };
}

function snapshot(room) {
  return {
    players: Object.values(room.players).map(publicPlayer),
    phase: room.phase,
    code: room.code,
    hostId: room.hostId,
  };
}

function pickColor(room) {
  const used = new Set(Object.values(room.players).map(p => p.color));
  for (const c of COLORS) if (!used.has(c)) return c;
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function pickSpawn(idx) {
  return SPAWNS[idx % SPAWNS.length];
}

function resetGame(room) {
  room.phase = 'playing';
  if (room.meeting && room.meeting.timer) clearTimeout(room.meeting.timer);
  room.meeting = null;
  for (const k of ['lights', 'doors']) {
    if (room.sabotageTimers[k]) clearTimeout(room.sabotageTimers[k]);
    room.sabotageTimers[k] = null;
    room.sabotages[k] = 0;
  }
  for (const p of Object.values(room.players)) {
    p.alive = true;
    p.lastKill = 0;
    p.tasksDone = new Set();          // per-player task progress
    p.meetingsUsed = 0;
  }
  const ids = Object.keys(room.players);
  room.impostorId = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
  for (const id of ids) {
    io.to(id).emit('role', { role: id === room.impostorId ? 'impostor' : 'crewmate' });
  }
  // Auto-start the round on every connected client.
  io.to(room.code).emit('start');
  console.log(`[room ${room.code}] round start — impostor: ${room.impostorId ? room.impostorId.slice(0,4) : 'NONE'}, players: ${ids.length}`);
}

function checkWinConditions(room) {
  if (room.phase !== 'playing') return;
  const players = Object.values(room.players);
  const crew = players.filter(p => p.id !== room.impostorId);
  const aliveCrew = crew.filter(p => p.alive);
  const aliveImpostor = room.impostorId && room.players[room.impostorId] && room.players[room.impostorId].alive;

  // Crew win: impostor was ejected (or otherwise died).
  if (room.impostorId && !aliveImpostor) {
    room.phase = 'won';
    io.to(room.code).emit('game_over', { result: 'crew_win', reason: 'impostor_ejected' });
    console.log(`[room ${room.code}] crew wins — impostor ejected`);
    return;
  }
  // Crew win: every alive crewmate has finished ALL their tasks.
  const everyoneDone = aliveCrew.length > 0 && aliveCrew.every(p => p.tasksDone && p.tasksDone.size >= TASK_IDS.length);
  if (everyoneDone) {
    room.phase = 'won';
    io.to(room.code).emit('game_over', { result: 'crew_win', reason: 'tasks_done' });
    console.log(`[room ${room.code}] crew wins — all crewmates finished tasks`);
    return;
  }
  // Impostor win: no crewmates left alive.
  if (aliveImpostor && aliveCrew.length === 0) {
    room.phase = 'won';
    io.to(room.code).emit('game_over', { result: 'impostor_win', reason: 'crew_eliminated' });
    console.log(`[room ${room.code}] impostor wins — crew eliminated`);
  }
}

// ── Emergency meeting ────────────────────────────────────────────────────

function startMeeting(room, calledBy) {
  const alive = Object.values(room.players).filter(p => p.alive)
                  .map(p => ({ id: p.id, name: p.name, color: p.color }));
  room.meeting = {
    calledBy,
    votes: {},               // voterId → targetId | 'skip'
    startedAt: Date.now(),
    duration: MEETING_DURATION,
    timer: setTimeout(() => endMeeting(room), MEETING_DURATION),
  };
  io.to(room.code).emit('meeting_start', {
    calledBy,
    duration: MEETING_DURATION,
    players: alive,
  });
  console.log(`[room ${room.code}] meeting called by ${calledBy.slice(0,4)}`);
}

function endMeeting(room) {
  if (!room.meeting) return;
  if (room.meeting.timer) clearTimeout(room.meeting.timer);

  // Tally votes.
  const tally = {};
  for (const target of Object.values(room.meeting.votes)) {
    tally[target] = (tally[target] || 0) + 1;
  }
  let maxVotes = 0, ejectedId = null, tied = false;
  for (const [target, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; ejectedId = target; tied = false; }
    else if (count === maxVotes) { tied = true; }
  }
  if (tied || ejectedId === 'skip' || !ejectedId) {
    ejectedId = null;
  } else {
    const victim = room.players[ejectedId];
    if (victim) victim.alive = false;
  }
  const wasImpostor = ejectedId && ejectedId === room.impostorId;

  io.to(room.code).emit('meeting_end', {
    votes: room.meeting.votes,
    tally,
    ejectedId,
    wasImpostor,
  });
  console.log(`[room ${room.code}] meeting end — ejected: ${ejectedId ? ejectedId.slice(0,4) : 'NONE'} (impostor: ${wasImpostor})`);
  room.meeting = null;

  // Win conditions may have changed.
  checkWinConditions(room);
}

// ── Connections ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // The client passes the room code as a connection query param.
  const rawCode = (socket.handshake.query.room || '').toString().toUpperCase();
  const code    = /^[A-Z0-9]{1,12}$/.test(rawCode) ? rawCode : 'LOBBY';
  const room    = getRoom(code);
  socket.join(code);
  socket.roomCode = code;

  console.log(`[+] ${socket.id.slice(0,4)} joined room ${code} (${Object.keys(room.players).length + 1} total)`);

  const color = pickColor(room);
  const spawn = pickSpawn(Object.keys(room.players).length);

  const player = {
    id: socket.id,
    color,
    name: socket.id.slice(0, 4).toUpperCase(),
    x: spawn.x, y: spawn.y,
    facing: 1, sprinting: false, alive: true,
    tasksDone: new Set(),
  };
  room.players[socket.id] = player;

  // First player becomes the host. Host gates the start button.
  if (!room.hostId) {
    room.hostId = socket.id;
    console.log(`[room ${code}] host = ${socket.id.slice(0,4)}`);
  }

  socket.emit('welcome', {
    selfId: socket.id,
    self: publicPlayer(player),
    state: snapshot(room),
    isHost: socket.id === room.hostId,
    role: room.phase === 'playing'
      ? (socket.id === room.impostorId ? 'impostor' : 'crewmate')
      : null,
    lanIps: LAN_IPS,
    port: PORT,
  });

  // If a round is already in progress, drop this player straight into it as
  // a fresh crewmate (no role banner). They'll spawn in the cafeteria.
  if (room.phase === 'playing') {
    socket.emit('start');
  }

  socket.broadcast.to(code).emit('player_joined', publicPlayer(player));

  // ── Position broadcast (scoped to this room) ──────────────
  socket.on('pos', (data) => {
    const p = room.players[socket.id]; if (!p) return;
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      p.x = data.x; p.y = data.y;
      p.facing = data.facing === -1 ? -1 : 1;
      p.sprinting = !!data.sprinting;
      socket.broadcast.to(code).volatile.emit('pos', {
        id: socket.id, x: p.x, y: p.y, facing: p.facing, sprinting: p.sprinting,
      });
    }
  });

  // ── Task completion (per-player; impostor submissions ignored) ─
  socket.on('task_done', (taskId) => {
    if (!TASK_IDS.includes(taskId)) return;
    if (room.meeting) return;
    if (socket.id === room.impostorId) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    me.tasksDone.add(taskId);
    checkWinConditions(room);
  });

  // ── Impostor kill ─────────────────────────────────────────
  socket.on('kill', () => {
    if (room.phase !== 'playing') return;
    if (room.meeting) return;
    if (socket.id !== room.impostorId) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    const now = Date.now();
    if (me.lastKill && now - me.lastKill < KILL_COOLDOWN_MS) return;
    let victim = null, bestD = KILL_RANGE;
    for (const other of Object.values(room.players)) {
      if (other.id === socket.id || !other.alive) continue;
      const d = Math.hypot(other.x - me.x, other.y - me.y);
      if (d < bestD) { bestD = d; victim = other; }
    }
    if (!victim) return;
    me.lastKill = now;
    victim.alive = false;
    io.to(code).emit('killed', { victimId: victim.id, by: socket.id, x: victim.x, y: victim.y });
    console.log(`[room ${code}] ${socket.id.slice(0,4)} killed ${victim.id.slice(0,4)}`);
    checkWinConditions(room);
  });

  // ── Emergency meeting ─────────────────────────────────────
  socket.on('meeting_call', () => {
    if (room.phase !== 'playing') return;
    if (room.meeting) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    if ((me.meetingsUsed || 0) >= MEETINGS_PER_PLAYER) return;
    me.meetingsUsed = (me.meetingsUsed || 0) + 1;
    startMeeting(room, socket.id);
  });

  // ── Report a dead body (anyone alive standing next to one) ─
  socket.on('report_body', ({ victimId }) => {
    if (room.phase !== 'playing') return;
    if (room.meeting) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    if (!victimId) return;
    const victim = room.players[victimId];
    if (!victim || victim.alive) return;
    if (Math.hypot(me.x - victim.x, me.y - victim.y) > 110) return;
    // Body-report is "free" — does NOT consume the reporter's meeting count.
    startMeeting(room, socket.id);
  });

  // ── Sabotage (impostor only) ──────────────────────────────
  socket.on('sabotage', ({ type }) => {
    if (room.phase !== 'playing') return;
    if (socket.id !== room.impostorId) return;
    if (room.meeting) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    if (type !== 'lights' && type !== 'doors') return;
    const now = Date.now();
    if (room.sabotages[type] > now) return;        // already active
    const duration = type === 'lights' ? 25000 : 15000;
    room.sabotages[type] = now + duration;
    io.to(code).emit('sabotage_start', { type, duration });
    if (room.sabotageTimers[type]) clearTimeout(room.sabotageTimers[type]);
    room.sabotageTimers[type] = setTimeout(() => {
      room.sabotages[type] = 0;
      room.sabotageTimers[type] = null;
      io.to(code).emit('sabotage_end', { type });
    }, duration);
    console.log(`[room ${code}] sabotage: ${type} (${duration}ms)`);
  });

  socket.on('vote', ({ target }) => {
    if (!room.meeting) return;
    const me = room.players[socket.id];
    if (!me || !me.alive) return;
    if (room.meeting.votes[socket.id]) return;        // one vote per meeting
    if (target !== 'skip') {
      const t = room.players[target];
      if (!t || !t.alive) return;
    }
    room.meeting.votes[socket.id] = target;
    io.to(code).emit('vote_cast', { voter: socket.id });
    // End early if all alive players have voted.
    const alive = Object.values(room.players).filter(p => p.alive);
    if (alive.length > 0 && alive.every(p => room.meeting.votes[p.id])) {
      endMeeting(room);
    }
  });

  // ── Name change (lobby + in-game) ─────────────────────────
  socket.on('name_change', (name) => {
    const me = room.players[socket.id];
    if (!me) return;
    if (typeof name !== 'string') return;
    // sanitize + cap length
    const clean = name.replace(/[^A-Za-z0-9 _\-]/g, '').slice(0, 10).toUpperCase().trim();
    if (!clean) return;
    me.name = clean;
    io.to(code).emit('name_change', { id: socket.id, name: clean });
  });

  // ── Start request (host only) ─────────────────────────────
  socket.on('restart', () => {
    if (socket.id !== room.hostId) return;          // only the host can start
    resetGame(room);
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id.slice(0,4)} left room ${code}`);
    const wasImpostor = socket.id === room.impostorId;
    const wasHost     = socket.id === room.hostId;
    delete room.players[socket.id];
    if (wasImpostor) room.impostorId = null;

    // Transfer host to the next remaining player if needed.
    if (wasHost) {
      const remaining = Object.keys(room.players);
      room.hostId = remaining[0] || null;
      if (room.hostId) {
        io.to(room.hostId).emit('host', { isHost: true });
        console.log(`[room ${code}] host transferred to ${room.hostId.slice(0,4)}`);
      }
    }

    io.to(code).emit('player_left', socket.id);

    // If a meeting is active, drop their vote and end the meeting early if
    // all remaining alive players have already voted.
    if (room.meeting) {
      delete room.meeting.votes[socket.id];
      const alive = Object.values(room.players).filter(p => p.alive);
      if (alive.length > 0 && alive.every(p => room.meeting.votes[p.id])) {
        endMeeting(room);
      }
    }

    if (room.phase === 'playing') checkWinConditions(room);
    // Garbage-collect empty rooms so memory doesn't grow forever.
    if (Object.keys(room.players).length === 0) {
      if (room.meeting && room.meeting.timer) clearTimeout(room.meeting.timer);
      rooms.delete(code);
      console.log(`[room ${code}] empty — removed`);
    }
  });
});

// ── Start ────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== Voidship Server ===');
  console.log(`Local:   http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`LAN:     http://${net.address}:${PORT}  ← share with another browser`);
      }
    }
  }
  console.log('\nEach visit to / creates a fresh room with a unique 4-char code.');
  console.log('Share the full URL with the /r/<code> path so friends join YOUR room.');
  console.log('Different rooms are fully isolated — players never see each other.\n');
});
