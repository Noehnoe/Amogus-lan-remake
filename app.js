/* ─────────────────────────────────────────────────────────────
   VOIDSHIP — Solo Drift
   A self-contained single-player demo of the Voidship concept.
   Top-down 2D survival: complete six ship-systems while an
   impostor stalks the corridors. No server required — just open
   index.html in a browser.
   ───────────────────────────────────────────────────────────── */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════

const CFG = {
  MAP_W: 2000,
  MAP_H: 1200,
  PLAYER_SPEED: 200,
  SPRINT_MULT: 1.6,
  PLAYER_RADIUS: 16,
  VISION_RADIUS: 320,
  VISION_FALLOFF: 120,
  TASK_RANGE: 60,
  KILL_RANGE: 46,
  IMPOSTOR_HUNT_SPEED: 235,
  IMPOSTOR_VISION: 380,
  NPC_SPEED: 110,
  TICK_RATE: 60,
  STAR_COUNT: 240,
};

const COLORS = {
  red:    '#ff4d5a',
  blue:   '#3498db',
  green:  '#2ecc71',
  orange: '#ffb347',
  purple: '#9b59b6',
  teal:   '#1abc9c',
  pink:   '#e91e63',
  yellow: '#f1c40f',
  white:  '#e0e6f0',
  brown:  '#a07050',
};

// ═══════════════════════════════════════════════════════════════
//  MAP — Rooms, walls, vents, task stations
// ═══════════════════════════════════════════════════════════════

const ROOMS = [
  { id: 'bridge',     name: 'BRIDGE',      x: 700,  y: 60,  w: 600, h: 220, tint: '#1a2a44' },
  { id: 'medbay',     name: 'MEDBAY',      x: 1450, y: 80,  w: 340, h: 280, tint: '#2a1a3a' },
  { id: 'engineering',name: 'ENGINEERING', x: 80,   y: 350, w: 380, h: 280, tint: '#3a2a1a' },
  { id: 'cafeteria',  name: 'CAFETERIA',   x: 700,  y: 380, w: 600, h: 260, tint: '#1e3a2a' },
  { id: 'comms',      name: 'COMMS',       x: 1500, y: 460, w: 300, h: 280, tint: '#2a2a4a' },
  { id: 'storage',    name: 'STORAGE',     x: 200,  y: 750, w: 380, h: 280, tint: '#1e2a3a' },
  { id: 'reactor',    name: 'REACTOR',     x: 760,  y: 760, w: 480, h: 280, tint: '#3a1a1a' },
  { id: 'security',   name: 'SECURITY',    x: 1380, y: 820, w: 360, h: 240, tint: '#1a2a3a' },
];

// Build walls + door rects. Walls are always-impassable rectangles. Doors
// are the gaps between rooms — passable normally, but become impassable
// during a door-sabotage. Both share the same { x, y, w, h } shape so they
// can be appended together when sabotage is active.
function buildMap() {
  const walls = [];
  const doors = [];
  const t = 8; // wall thickness

  // outer hull
  walls.push({ x: 40,  y: 40,  w: CFG.MAP_W - 80, h: t });          // top
  walls.push({ x: 40,  y: CFG.MAP_H - 48, w: CFG.MAP_W - 80, h: t });// bottom
  walls.push({ x: 40,  y: 40,  w: t, h: CFG.MAP_H - 80 });           // left
  walls.push({ x: CFG.MAP_W - 48, y: 40, w: t, h: CFG.MAP_H - 80 }); // right

  // gaps = array of {side:'top'|'bottom'|'left'|'right', start, length}
  function room(r, gaps = []) {
    const sides = [
      { side: 'top',    x: r.x,         y: r.y,         w: r.w, h: t },
      { side: 'bottom', x: r.x,         y: r.y + r.h,   w: r.w, h: t },
      { side: 'left',   x: r.x,         y: r.y,         w: t,   h: r.h },
      { side: 'right',  x: r.x + r.w,   y: r.y,         w: t,   h: r.h },
    ];
    for (const s of sides) {
      const gap = gaps.find(g => g.side === s.side);
      if (!gap) { walls.push(s); continue; }
      // Record the door's rectangle.
      if (s.side === 'top' || s.side === 'bottom') {
        doors.push({ x: gap.start, y: s.y, w: gap.length, h: t, side: s.side });
        if (gap.start - s.x > 0) walls.push({ ...s, w: gap.start - s.x });
        const right = s.x + s.w;
        const after = gap.start + gap.length;
        if (right - after > 0) walls.push({ ...s, x: after, w: right - after });
      } else {
        doors.push({ x: s.x, y: gap.start, w: t, h: gap.length, side: s.side });
        if (gap.start - s.y > 0) walls.push({ ...s, h: gap.start - s.y });
        const bot = s.y + s.h;
        const after = gap.start + gap.length;
        if (bot - after > 0) walls.push({ ...s, y: after, h: bot - after });
      }
    }
  }

  // Each room with doorway gaps (length 80) positioned so corridors connect.
  room(ROOMS[0], [ // bridge: door bottom-center to cafeteria
    { side: 'bottom', start: 950, length: 100 },
  ]);
  room(ROOMS[1], [ // medbay: door bottom and left
    { side: 'bottom', start: 1550, length: 100 },
    { side: 'left',   start: 180,  length: 100 },
  ]);
  room(ROOMS[2], [ // engineering: door right, bottom
    { side: 'right',  start: 460,  length: 100 },
    { side: 'bottom', start: 200,  length: 100 },
  ]);
  room(ROOMS[3], [ // cafeteria: doors all four sides
    { side: 'top',    start: 950,  length: 100 },
    { side: 'bottom', start: 950,  length: 100 },
    { side: 'left',   start: 460,  length: 100 },
    { side: 'right',  start: 480,  length: 100 },
  ]);
  room(ROOMS[4], [ // comms: door left, bottom
    { side: 'left',   start: 560,  length: 100 },
    { side: 'bottom', start: 1580, length: 100 },
  ]);
  room(ROOMS[5], [ // storage: door right, top
    { side: 'right',  start: 850,  length: 100 },
    { side: 'top',    start: 320,  length: 100 },
  ]);
  room(ROOMS[6], [ // reactor: doors all four sides
    { side: 'top',    start: 920,  length: 100 },
    { side: 'left',   start: 850,  length: 100 },
    { side: 'right',  start: 880,  length: 100 },
  ]);
  room(ROOMS[7], [ // security: door left, top
    { side: 'left',   start: 880,  length: 100 },
    { side: 'top',    start: 1450, length: 100 },
  ]);

  return { walls, doors };
}

const _map = buildMap();
const WALLS = _map.walls;
const DOORS = _map.doors;

// Position of the in-world emergency-meeting button (center of cafeteria).
const MEETING_BUTTON = { x: 1000, y: 510, r: 28 };

// Emergency Backup Battery — crewmates interact here to end any active sabotage.
const BATTERY_CONSOLE = { x: 1000, y: 620, r: 22 };

// Vents — placed in room corners so impostor can escape stealthily.
// Linked pairs: 0↔1 (engineering↔reactor), 2↔3 (medbay↔security),
//               4↔5 (bridge↔storage),     6↔7 (cafeteria↔comms).
const VENTS = [
  { x: 110,  y: 590, link: 1 },  // engineering bottom-left corner
  { x: 800,  y: 1000, link: 0 }, // reactor bottom-left corner
  { x: 1750, y: 120, link: 3 },  // medbay top-right corner
  { x: 1700, y: 1020, link: 2 }, // security bottom-right corner
  { x: 750,  y: 100, link: 5 },  // bridge top-left corner
  { x: 240,  y: 990, link: 4 },  // storage bottom-left corner
  { x: 1260, y: 600, link: 7 },  // cafeteria bottom-right corner
  { x: 1760, y: 700, link: 6 },  // comms bottom-right corner
];

const TASK_DEFS = [
  { id: 'wires_eng',   name: 'FIX WIRING',         room: 'engineering', x: 220,  y: 500, type: 'wires' },
  { id: 'calib_bridge',name: 'CALIBRATE COMPASS',  room: 'bridge',      x: 1100, y: 170, type: 'calibrate' },
  { id: 'reactor',     name: 'START REACTOR',      room: 'reactor',     x: 1000, y: 880, type: 'reactor' },
  { id: 'numpad_med',  name: 'AUTHORIZE MEDBAY',   room: 'medbay',      x: 1620, y: 250, type: 'numpad' },
  { id: 'wires_comm',  name: 'REROUTE COMMS',      room: 'comms',       x: 1650, y: 600, type: 'wires' },
  { id: 'calib_sec',   name: 'ALIGN CAMERAS',      room: 'security',    x: 1560, y: 940, type: 'calibrate' },
];

// ═══════════════════════════════════════════════════════════════
//  MULTIPLAYER  (active only when served via the Node server)
// ═══════════════════════════════════════════════════════════════

const MP = {
  enabled: false,
  socket: null,
  selfId: null,
  selfColor: null,
  selfSpawn: null,
  remotes: new Map(),        // id → remote-player record
  preDoneTasks: [],          // task ids already completed at join time
  lastEmit: 0,
  emitInterval: 0.05,        // 20Hz position updates
  role: null,                // 'crewmate' | 'impostor' | null
  isHost: false,             // first connected player is the host; only they can start
  welcomed: false,           // true once the server has assigned identity / role
  killCooldown: 0,           // local-only display value (server is authoritative)
  KILL_RANGE: 70,
  KILL_COOLDOWN: 25,
  sabotageEndedAt: 0,        // performance.now() when last sabotage was fixed (for 30s cooldown display)
  SABOTAGE_COOLDOWN: 30,
};

function getRoomCodeFromURL() {
  // URL form: /r/CODE  — extract the CODE segment.
  const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{1,12})/);
  return m ? m[1].toUpperCase() : null;
}

function initMultiplayer() {
  if (typeof io === 'undefined' || window.__NO_SOCKETIO) {
    return;
  }
  MP.enabled  = true;
  MP.roomCode = getRoomCodeFromURL();
  MP.socket   = io({ query: { room: MP.roomCode || '' } });

  MP.socket.on('welcome', (data) => {
    MP.selfId    = data.selfId;
    MP.selfColor = data.self.color;
    MP.selfSpawn = { x: data.self.x, y: data.self.y };
    MP.preDoneTasks = [];          // tasks are per-player now
    MP.lanIps    = data.lanIps || [];
    MP.serverPort = data.port || 3000;
    MP.isHost    = !!data.isHost;
    MP.welcomed  = true;
    MP.selfName  = data.self.name;          // server-assigned default
    if (data.role) {
      MP.role = data.role;
      showRoleBanner(data.role);   // mid-game joiners get a role reveal too
    }
    // pick up players already in the room
    for (const p of data.state.players) {
      if (p.id !== MP.selfId) addRemote(p);
    }
    // if the game is already running locally, apply state retroactively
    if (G.player) {
      G.player.color = MP.selfColor;
      for (const id of MP.preDoneTasks) markTaskDoneById(id, false);
    }
    updateMenuStatus();
    updateStartButton();
  });

  MP.socket.on('player_joined', (p) => {
    if (p.id === MP.selfId) return;
    addRemote(p);
    updateMenuStatus();
  });

  MP.socket.on('player_left', (id) => {
    MP.remotes.delete(id);
    updateMenuStatus();
  });

  MP.socket.on('pos', (d) => {
    const r = MP.remotes.get(d.id);
    if (!r) return;
    r.tx = d.x; r.ty = d.y;
    r.facing = d.facing; r.sprinting = d.sprinting;
  });

  MP.socket.on('task_done', ({ taskId }) => {
    if (G.tasks.length === 0) {
      if (!MP.preDoneTasks.includes(taskId)) MP.preDoneTasks.push(taskId);
      return;
    }
    markTaskDoneById(taskId, true);
  });

  MP.socket.on('reset', () => {
    if (G.phase === 'playing') return;
    // server restart — leave it to the user to press BOOT SEQUENCE
  });

  MP.socket.on('role', ({ role }) => {
    MP.role = role;
    MP.killCooldown = 0;
    showRoleBanner(role);
    updateKillIndicator();
  });

  MP.socket.on('start', () => {
    // Server says the round has begun. If we're still on the menu, jump
    // straight into the game — the host already pressed BOOT SEQUENCE
    // for everyone.
    if (G.phase === 'playing') return;
    startLocalRound();
  });

  MP.socket.on('host', ({ isHost }) => {
    MP.isHost = !!isHost;
    updateMenuStatus();
    updateStartButton();
  });

  // ── Emergency meeting ───────────────────────────────────
  MP.socket.on('meeting_start', (data) => {
    G.meeting = {
      calledBy: data.calledBy,
      players:  data.players,    // [{ id, name, color }]
      votes:    {},              // voterId → '?' once we know they voted
      myVote:   null,
      startedAt: performance.now(),
      duration:  data.duration,
    };
    // Drop any open task panel.
    if (G.activeTask) {
      document.getElementById('taskPanel').classList.add('hidden');
      G.activeTask = null;
    }
    SFX.alarm();
    G.cam.shake = 12;
    flashScreen('red');
    showMeetingOverlay();
  });

  MP.socket.on('vote_cast', ({ voter }) => {
    if (!G.meeting) return;
    G.meeting.votes[voter] = '?';
    updateMeetingUI();
  });

  MP.socket.on('meeting_end', ({ ejectedId, wasImpostor }) => {
    const ejected = G.meeting && G.meeting.players.find(p => p.id === ejectedId);
    showEjectionReveal(ejected, wasImpostor);

    // Mark the ejected player dead locally.
    if (ejectedId === MP.selfId) {
      handleLocalDeath(G.player.x, G.player.y);
    } else if (ejectedId) {
      const r = MP.remotes.get(ejectedId);
      if (r) {
        r.alive = false;
        G.bloodSplats.push({ x: r.x, y: r.y });
      }
    }
    G.meeting = null;

    // Close the meeting modal after a brief reveal.
    setTimeout(() => {
      document.getElementById('meetingOverlay').classList.add('hidden');
      document.getElementById('ejectionOverlay').classList.add('hidden');
    }, 3200);
  });

  // ── Name change broadcast (from other players) ─────────
  MP.socket.on('name_change', ({ id, name }) => {
    if (id === MP.selfId) return;
    const r = MP.remotes.get(id);
    if (r) r.name = name;
  });

  // ── Sabotage (impostor calls; everyone sees the effect) ─
  MP.socket.on('sabotage_start', ({ type }) => {
    G.sabotages[type] = true;
    if (type === 'lights') {
      // Lights sabotage: force flashlight off. F key is blocked until fixed.
      G.vision.active = false;
    }
    MP.sabotageEndedAt = 0;
    SFX.alarm();
    flashScreen('red');
    G.cam.shake = 10;
  });

  MP.socket.on('sabotage_end', ({ type }) => {
    G.sabotages[type] = false;
    MP.sabotageEndedAt = performance.now();
    flashScreen('white');
  });

  MP.socket.on('killed', ({ victimId, x, y }) => {
    if (victimId === MP.selfId) {
      handleLocalDeath(x, y);
    } else {
      const r = MP.remotes.get(victimId);
      if (r) {
        r.alive = false;
        r.x = x; r.y = y; r.tx = x; r.ty = y;
      }
      G.bloodSplats.push({ x, y });
      spawnBurst(x, y, 24, { color: '#9b1d28', speed: 200, life: 1.0, size: 3, gravity: 200, drag: 0.95 });
      G.cam.shake = 8;
      flashScreen('red');
    }
    SFX.kill();
    if (MP.role === 'impostor' && victimId !== MP.selfId) {
      MP.killCooldown = MP.KILL_COOLDOWN;
    }
  });

  MP.socket.on('game_over', ({ result }) => {
    if (G.phase !== 'playing') return;
    const crewWon = result === 'crew_win';
    const iWon = (crewWon && MP.role !== 'impostor') || (!crewWon && MP.role === 'impostor');
    G.phase = iWon ? 'won' : 'lost';
    if (iWon) { flashScreen('green'); SFX.win(); }
    else      { flashScreen('red'); }
    scheduleMenu(iWon ? 'win' : 'lose', result, 1200);
  });

  MP.socket.on('disconnect', () => updateMenuStatus());
  MP.socket.on('connect',    () => updateMenuStatus());
}

function showRoleBanner(role) {
  const banner = document.getElementById('roleBanner');
  const name   = document.getElementById('roleName');
  const desc   = document.getElementById('roleDesc');
  if (!banner) return;
  if (role === 'impostor') {
    name.textContent = 'IMPOSTOR';
    name.className   = 'role-name impostor';
    desc.textContent = 'eliminate the crew · press Q to kill nearby crewmates';
  } else {
    name.textContent = 'CREWMATE';
    name.className   = 'role-name';
    desc.textContent = 'complete tasks · stay alive · trust no one';
  }
  // restart the CSS animation by toggling .hidden
  banner.classList.add('hidden');
  void banner.offsetWidth; // force reflow
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3100);
}

function handleLocalDeath(x, y) {
  if (!G.player || !G.player.alive) return;
  G.player.alive = false;
  G.killedAt = { x: G.player.x, y: G.player.y };
  for (let i = 0; i < 30; i++) {
    spawnParticle(G.player.x, G.player.y, {
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 1.2 + Math.random() * 0.5,
      size: 3 + Math.random() * 3,
      color: '#9b1d28', gravity: 200, drag: 0.95,
    });
  }
  G.bloodSplats.push({ x: G.player.x, y: G.player.y });
  G.cam.shake = 22;
  flashScreen('red');
}

// ── Emergency meeting helpers (client-side UI / input) ────

function findNearestBody() {
  let nearest = null, bd = 70;
  if (MP.enabled) {
    for (const r of MP.remotes.values()) {
      if (r.alive !== false) continue;
      const d = Math.hypot(r.x - G.player.x, r.y - G.player.y);
      if (d < bd) { bd = d; nearest = r; }
    }
  } else {
    for (const b of G.bodies) {
      const d = Math.hypot(b.x - G.player.x, b.y - G.player.y);
      if (d < bd) { bd = d; nearest = b; }
    }
  }
  return nearest;
}

function nearMeetingButton() {
  const mb = MEETING_BUTTON;
  return Math.hypot(mb.x - G.player.x, mb.y - G.player.y) < 70;
}

// R does double duty: report a body if you're standing on one, otherwise
// trigger an emergency meeting if you're standing on the cafeteria button.
function tryReportOrMeeting() {
  if (G.phase !== 'playing') return;
  if (!G.player || !G.player.alive) return;
  if (G.meeting) return;

  const body = findNearestBody();
  if (body) {
    if (MP.enabled) {
      MP.socket.emit('report_body', { victimId: body.id });
    } else {
      G.bodies = G.bodies.filter(b => b.id !== body.id);
      startSoloMeeting('player');
    }
    return;
  }
  if (!nearMeetingButton()) return;
  if (MP.enabled) {
    if (MP.meetingUsed) return;
    MP.meetingUsed = true;
    MP.socket.emit('meeting_call');
  } else {
    if (G.soloMeetingUsed) return;
    G.soloMeetingUsed = true;
    startSoloMeeting('player');
  }
}

// ── Solo meeting system ───────────────────────────────────────

function startSoloMeeting(calledById) {
  SFX.alarm();
  flashScreen('white');
  G.cam.shake = 8;

  // Build player list from alive participants.
  const players = [];
  players.push({ id: 'player', name: 'YOU', color: G.player.color });
  for (const npc of G.npcs) {
    if (npc.alive) players.push({ id: npc.id, name: npc.name, color: npc.color });
  }

  G.meeting = {
    solo: true,
    calledBy: calledById,
    players,
    votes: {},
    myVote: null,
    startedAt: performance.now(),
    duration: 30000,
    timer: setTimeout(() => endSoloMeeting(), 30000),
  };

  showMeetingOverlay();

  // Schedule each NPC's vote randomly over the 30s window.
  for (const npc of G.npcs) {
    if (!npc.alive) continue;
    const delay = 2000 + Math.random() * 12000;
    setTimeout(() => {
      if (!G.meeting || !G.meeting.solo) return;
      if (G.meeting.votes[npc.id]) return;
      // Impostor always votes for a random crewmate.
      // Crewmates: 40% vote for impostor if they know, else random alive target.
      const alive = G.meeting.players.filter(p => p.id !== npc.id);
      const impostor = G.npcs.find(n => n.isImpostor && n.alive);
      let vote;
      if (npc.isImpostor) {
        const targets = alive.filter(p => p.id !== npc.id && p.id !== 'player');
        vote = targets.length ? targets[Math.floor(Math.random() * targets.length)].id : 'skip';
      } else {
        const suspicion = Math.random();
        if (impostor && suspicion < 0.35) {
          vote = impostor.id;
        } else {
          vote = alive[Math.floor(Math.random() * alive.length)]?.id || 'skip';
        }
      }
      G.meeting.votes[npc.id] = vote;
      updateMeetingUI();
      checkAllSoloVoted();
    }, delay);
  }
}

function checkAllSoloVoted() {
  if (!G.meeting || !G.meeting.solo) return;
  const alive = G.meeting.players;
  if (alive.every(p => G.meeting.votes[p.id])) endSoloMeeting();
}

function castSoloVote(target) {
  if (!G.meeting || G.meeting.myVote) return;
  if (!G.player || !G.player.alive) return;
  G.meeting.myVote = target;
  G.meeting.votes['player'] = target;
  updateMeetingUI();
  SFX.click();
  checkAllSoloVoted();
}

function endSoloMeeting() {
  if (!G.meeting) return;
  if (G.meeting.timer) clearTimeout(G.meeting.timer);

  // Tally votes.
  const tally = {};
  for (const v of Object.values(G.meeting.votes)) {
    tally[v] = (tally[v] || 0) + 1;
  }
  let maxVotes = 0, ejectedId = null, tied = false;
  for (const [target, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; ejectedId = target; tied = false; }
    else if (count === maxVotes) { tied = true; }
  }
  if (tied || ejectedId === 'skip' || !ejectedId) ejectedId = null;

  // Apply ejection.
  let wasImpostor = false;
  let ejectedPlayer = null;
  if (ejectedId === 'player') {
    G.player.alive = false;
    ejectedPlayer = { name: 'YOU', color: G.player.color };
  } else if (ejectedId) {
    const npc = G.npcs.find(n => n.id === ejectedId);
    if (npc) {
      npc.alive = false;
      wasImpostor = npc.isImpostor;
      ejectedPlayer = { name: npc.name, color: npc.color };
    }
  }

  showEjectionReveal(ejectedPlayer, wasImpostor);
  G.meeting = null;

  setTimeout(() => {
    document.getElementById('meetingOverlay').classList.add('hidden');
    document.getElementById('ejectionOverlay').classList.add('hidden');
    if (wasImpostor) {
      G.phase = 'won';
      SFX.win();
      flashScreen('green');
      scheduleMenu('win', null, 800);
    } else if (ejectedId === 'player') {
      G.phase = 'lost';
      scheduleMenu('lose', null, 800);
    } else {
      checkWinLose();
    }
  }, 3200);
}

function showMeetingOverlay() {
  const overlay = document.getElementById('meetingOverlay');
  const list    = document.getElementById('meetingPlayers');
  const caller  = document.getElementById('meetingCaller');

  list.innerHTML = '';
  const callerPlayer = G.meeting.players.find(p => p.id === G.meeting.calledBy);
  caller.textContent = `called by ${callerPlayer ? callerPlayer.name : '???'}`;

  for (const p of G.meeting.players) {
    const isMe = G.meeting.solo ? p.id === 'player' : p.id === MP.selfId;
    const isMeAlive = G.player && G.player.alive;
    const btn = document.createElement('button');
    btn.className = 'meeting-player' + (isMe ? ' is-me' : '');
    btn.style.color = p.color;
    btn.dataset.id = p.id;
    btn.innerHTML = `
      <span class="meeting-player-color" style="background:${p.color}; color:${p.color}"></span>
      <span class="meeting-player-name">${p.name}</span>
      <span class="meeting-player-vote">VOTE</span>
    `;
    if (isMeAlive && !isMe) btn.addEventListener('click', () => castVote(p.id));
    list.appendChild(btn);
  }

  const skip = document.getElementById('skipVoteBtn');
  skip.classList.remove('voted', 'disabled');
  skip.onclick = () => castVote('skip');

  // Dead spectators can watch but not vote.
  if (!G.player || !G.player.alive) {
    list.querySelectorAll('.meeting-player').forEach(b => b.classList.add('disabled'));
    skip.classList.add('disabled');
  }

  overlay.classList.remove('hidden');
  updateMeetingUI();
  tickMeetingTimer();
}

function castVote(target) {
  if (!G.meeting || G.meeting.myVote) return;
  if (!G.player || !G.player.alive) return;
  if (G.meeting.solo) {
    castSoloVote(target);
  } else {
    G.meeting.myVote = target;
    MP.socket.emit('vote', { target });
    updateMeetingUI();
    SFX.click();
  }
}

function updateMeetingUI() {
  if (!G.meeting) return;
  // Highlight my vote and disable further clicks.
  document.querySelectorAll('.meeting-player').forEach(el => {
    const id = el.dataset.id;
    el.classList.remove('voted');
    if (G.meeting.myVote === id) el.classList.add('voted');
    if (G.meeting.myVote) el.classList.add('disabled');
  });
  const skip = document.getElementById('skipVoteBtn');
  skip.classList.toggle('voted', G.meeting.myVote === 'skip');
  if (G.meeting.myVote) skip.classList.add('disabled');

  const voted = Object.keys(G.meeting.votes).length;
  const total = G.meeting.players.length;
  document.getElementById('meetingStatus').textContent = `${voted} / ${total} VOTED`;
}

function tickMeetingTimer() {
  if (!G.meeting) return;
  const elapsed = performance.now() - G.meeting.startedAt;
  const remaining = Math.max(0, Math.ceil((G.meeting.duration - elapsed) / 1000));
  document.getElementById('meetingTimer').textContent = remaining;
  if (G.meeting) requestAnimationFrame(tickMeetingTimer);
}

function showEjectionReveal(player, wasImpostor) {
  const overlay = document.getElementById('ejectionOverlay');
  const text    = document.getElementById('ejectionText');
  if (!player) {
    text.innerHTML = `<div class="ejected-name" style="color:#888">NO ONE WAS EJECTED</div>
                      <div class="ejected-role">tied or skip vote</div>`;
  } else {
    text.innerHTML = `
      <div class="ejected-name" style="color:${player.color}">${player.name}</div>
      <div class="ejected-role ${wasImpostor ? 'impostor' : ''}">${wasImpostor ? 'WAS THE IMPOSTOR' : 'was not the impostor'}</div>`;
  }
  overlay.classList.remove('hidden');
}

function updateKillIndicator() {
  const el = document.getElementById('killIndicator');
  const val = document.getElementById('killValue');
  if (!el || !val) return;
  if (!MP.enabled || MP.role !== 'impostor' || G.phase !== 'playing' || !G.player || !G.player.alive) {
    el.classList.remove('show', 'ready');
    return;
  }
  el.classList.add('show');
  if (MP.killCooldown > 0) {
    el.classList.remove('ready');
    val.className = 'value cooling';
    val.textContent = MP.killCooldown.toFixed(1) + 's';
  } else {
    el.classList.add('ready');
    val.className = 'value ready';
    val.textContent = '[Q] READY';
  }
}

function addRemote(p) {
  MP.remotes.set(p.id, {
    id: p.id,
    x: p.x, y: p.y, tx: p.x, ty: p.y,
    color: p.color, name: p.name,
    facing: p.facing, sprinting: p.sprinting,
    walkPhase: 0,
    radius: CFG.PLAYER_RADIUS,
    alive: p.alive !== false,
  });
}

function markTaskDoneById(taskId, withFx) {
  const t = G.tasks.find(x => x.id === taskId);
  if (!t || t.done) return;
  t.done = true;
  document.getElementById('task-' + t.id)?.classList.add('done');
  if (withFx) {
    spawnBurst(t.x, t.y, 30, { color: '#4ade80', speed: 180, size: 4, life: 1.0 });
    spawnPulse(t.x, t.y, '#4ade80', 0.7, 80);
    SFX.taskOk();
  }
}

function updateRemotes(dt) {
  for (const r of MP.remotes.values()) {
    // smooth toward latest server position
    const lerp = 1 - Math.pow(0.0001, dt);
    const ox = r.x, oy = r.y;
    r.x += (r.tx - r.x) * lerp;
    r.y += (r.ty - r.y) * lerp;
    const moved = Math.hypot(r.x - ox, r.y - oy);
    if (moved > 0.4) r.walkPhase += dt * 8;
    else r.walkPhase = 0;
  }
}

function emitPosition(dt) {
  if (!MP.enabled || !MP.socket || !MP.socket.connected) return;
  MP.lastEmit += dt;
  if (MP.lastEmit < MP.emitInterval) return;
  MP.lastEmit = 0;
  const p = G.player; if (!p) return;
  MP.socket.emit('pos', { x: p.x, y: p.y, facing: p.facing, sprinting: p.sprinting });
}

function buildShareURL() {
  // If we're on localhost/127.0.0.1, substitute the server's first LAN IP
  // so the URL works from other devices on the same Wi-Fi.
  const path = window.location.pathname; // /r/CODE
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal && MP.lanIps && MP.lanIps.length) {
    return `http://${MP.lanIps[0]}:${MP.serverPort || 3000}${path}`;
  }
  return window.location.origin + path;
}

function updateMenuStatus() {
  const el = document.getElementById('mpStatus');
  if (!el) return;
  if (!MP.enabled) { el.textContent = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const connected = MP.socket && MP.socket.connected;
  const total = MP.remotes.size + 1;
  const code  = MP.roomCode || '?';
  if (!connected) {
    el.innerHTML = `<span class="dot red"></span> DISCONNECTED FROM SERVER`;
  } else {
    const shareUrl = buildShareURL();
    const myName = MP.selfName || (MP.selfId ? MP.selfId.slice(0,4).toUpperCase() : '????');
    el.innerHTML = `
      <div class="mp-line"><span class="dot green"></span> CONNECTED · ${total} ${total === 1 ? 'PLAYER' : 'PLAYERS'} IN ROOM</div>
      <div class="name-row">
        <span class="name-label">YOUR NAME</span>
        <span class="name-color-chip" style="background:${MP.selfColor || '#888'}"></span>
        <input class="name-input" id="nameInput" maxlength="10" value="${myName}" placeholder="ENTER NAME">
        <button class="copy-btn" id="saveNameBtn">SAVE</button>
      </div>
      <div class="room-code-row">
        <span class="room-code-label">ROOM CODE</span>
        <span class="room-code" id="roomCode">${code}</span>
      </div>
      <div class="share-row">
        <span class="share-label">SHARE LINK</span>
        <span class="share-url" id="shareUrl">${shareUrl}</span>
        <button class="copy-btn" id="copyLinkBtn" title="Copy join link">COPY</button>
      </div>`;
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyJoinLink);
    const nameInput = document.getElementById('nameInput');
    const saveBtn   = document.getElementById('saveNameBtn');
    if (saveBtn && nameInput) {
      const submit = () => {
        const val = nameInput.value.replace(/[^A-Za-z0-9 _\-]/g, '').slice(0,10).trim().toUpperCase();
        if (!val) return;
        MP.selfName = val;
        if (G.player) G.player.name = val;
        if (MP.socket && MP.socket.connected) MP.socket.emit('name_change', val);
        saveBtn.textContent = 'SAVED';
        saveBtn.classList.add('flash-ok');
        setTimeout(() => { saveBtn.textContent = 'SAVE'; saveBtn.classList.remove('flash-ok'); }, 1200);
      };
      saveBtn.addEventListener('click', submit);
      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }
  }
}

function copyJoinLink() {
  const url = buildShareURL();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => flashCopyButton('COPIED!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    flashCopyButton('COPIED!');
  }
}

function flashCopyButton(text) {
  const btn = document.getElementById('copyLinkBtn');
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = text;
  btn.classList.add('flash-ok');
  setTimeout(() => { btn.textContent = old; btn.classList.remove('flash-ok'); }, 1400);
}

// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════

const G = {
  phase: 'menu',          // 'menu' | 'playing' | 'won' | 'lost'
  startTime: 0,
  player: null,
  npcs: [],
  particles: [],
  bloodSplats: [],
  tasks: [],
  cam: { x: 0, y: 0, shake: 0 },
  vision: { active: true, intensity: 1 },
  prompt: '',
  promptUrgent: false,
  activeTask: null,
  ambient: { lightsOut: false, lightsOutT: 0, flicker: 0 },
  threatLevel: 0,         // 0..1
  stars: [],
  nebula: [],
  lastTime: 0,
  pulseT: 0,
  pulseEvents: [],        // visible pulse rings (e.g. footsteps, vent steam)
  killedAt: null,
  pendingMenuTimeout: null,
  meeting: null,             // active meeting state: { calledBy, players, votes, myVote, startedAt, duration }
  bodies: [],                // [{ id, x, y, name, color }] reportable corpses (solo + MP)
  sabotages: { lights: false, doors: false },  // active booleans — cleared by fix_sabotage
  soloMeetingUsed: false,    // player's emergency meeting button (solo mode)
};

// Current solid set — walls always, doors only when door-sabotage is active.
function solids() {
  return G.sabotages.doors ? WALLS.concat(DOORS) : WALLS;
}

// Schedule the post-game menu to appear after `delay` ms. If a new round
// starts before it fires (e.g. host pressed BOOT), the timeout is cancelled
// so the menu doesn't pop over the just-started game.
function scheduleMenu(kind, result, delay) {
  if (G.pendingMenuTimeout) clearTimeout(G.pendingMenuTimeout);
  G.pendingMenuTimeout = setTimeout(() => {
    G.pendingMenuTimeout = null;
    showMenu(kind, result);
  }, delay);
}
function cancelPendingMenu() {
  if (G.pendingMenuTimeout) {
    clearTimeout(G.pendingMenuTimeout);
    G.pendingMenuTimeout = null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════

const keys = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e' || e.key === 'E') tryInteract();
  if (e.key === 'f' || e.key === 'F') {
    if (!G.sabotages.lights) G.vision.active = !G.vision.active;
  }
  if (e.key === 'q' || e.key === 'Q') tryKill();
  if (e.key === 'r' || e.key === 'R') tryReportOrMeeting();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ═══════════════════════════════════════════════════════════════
//  AUDIO  (Web Audio API — no asset files needed)
// ═══════════════════════════════════════════════════════════════

let actx = null;
function audioCtx() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio unavailable', e);
    }
  }
  return actx;
}

function blip(freq, dur = 0.08, type = 'square', vol = 0.08) {
  const ctx = audioCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function sweep(f1, f2, dur, type = 'sawtooth', vol = 0.05) {
  const ctx = audioCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function noise(dur = 0.2, vol = 0.04) {
  const ctx = audioCtx(); if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

// HTML5 audio sources for the recorded clips in /SFX. Loaded once and
// rewound on each play so they can fire rapidly without garbage churn.
const SFX_AUDIO = {
  meeting:  null,
  task:     null,
  taskOpen: null,
  walk:     null,
};
(function loadSfx() {
  try {
    const base = '/SFX/';
    SFX_AUDIO.meeting  = new Audio(base + 'Meeting.mp3');
    SFX_AUDIO.task     = new Audio(base + 'Task.mp3');
    SFX_AUDIO.taskOpen = new Audio(base + 'TaskOpen.mp3');
    SFX_AUDIO.walk     = new Audio(base + 'Walk.mp3');
    for (const k in SFX_AUDIO) { if (SFX_AUDIO[k]) SFX_AUDIO[k].volume = 0.65; }
  } catch (e) { /* file:// or no audio */ }
})();
function playClip(name, vol) {
  const a = SFX_AUDIO[name]; if (!a) return;
  try {
    const node = a.cloneNode();
    node.volume = vol == null ? a.volume : vol;
    node.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

const SFX = {
  // Procedural fallbacks; recorded clips used when available.
  step:    () => blip(180 + Math.random() * 40, 0.04, 'triangle', 0.025),
  taskOk:  () => { if (SFX_AUDIO.task) playClip('task'); else { blip(880, 0.08, 'sine', 0.08); setTimeout(() => blip(1320, 0.12, 'sine', 0.08), 70); } },
  taskBad: () => { blip(220, 0.12, 'square', 0.06); },
  taskOpen:() => { if (SFX_AUDIO.taskOpen) playClip('taskOpen'); else sweep(220, 660, 0.18, 'sine', 0.06); },
  taskClose: () => sweep(660, 220, 0.14, 'sine', 0.05),
  kill:    () => { sweep(660, 60, 0.5, 'sawtooth', 0.12); noise(0.3, 0.06); },
  vent:    () => { sweep(120, 60, 0.3, 'sine', 0.05); noise(0.15, 0.03); },
  alarm:   () => { if (SFX_AUDIO.meeting) playClip('meeting'); else { sweep(440, 880, 0.18, 'sawtooth', 0.05); setTimeout(() => sweep(880, 440, 0.18, 'sawtooth', 0.05), 200); } },
  win:     () => { blip(523, 0.15, 'sine', 0.08); setTimeout(() => blip(659, 0.15, 'sine', 0.08), 150); setTimeout(() => blip(784, 0.3, 'sine', 0.1), 300); },
  click:   () => blip(700, 0.04, 'square', 0.03),
};

// ═══════════════════════════════════════════════════════════════
//  ENTITIES
// ═══════════════════════════════════════════════════════════════

function makePlayer(x, y, color) {
  return {
    type: 'player',
    x, y, vx: 0, vy: 0,
    color,
    speed: CFG.PLAYER_SPEED,
    radius: CFG.PLAYER_RADIUS,
    facing: 1,    // -1 left, 1 right
    walkPhase: 0,
    sprinting: false,
    alive: true,
    lastStepX: x, lastStepY: y,
  };
}

function makeNPC(x, y, color, name, isImpostor = false, id = '') {
  return {
    type: 'npc',
    x, y, vx: 0, vy: 0,
    id, color, name,
    speed: CFG.NPC_SPEED,
    huntSpeed: isImpostor ? CFG.IMPOSTOR_HUNT_SPEED : 0,
    radius: CFG.PLAYER_RADIUS,
    facing: 1,
    walkPhase: 0,
    isImpostor,
    state: 'wander',     // 'wander' | 'hunt' | 'vent'
    target: null,
    taskT: 0,
    killCooldown: isImpostor ? 6 : 0,
    sabotageT: isImpostor ? 30 : 0,  // time until next sabotage attempt
    huntT: 0,
    ventT: 0,
    alive: true,
    lastStepX: x, lastStepY: y,
  };
}

function initGame() {
  G.startTime = performance.now();

  // In multiplayer the server picks our color/spawn; otherwise default red.
  const startColor = MP.enabled && MP.selfColor ? MP.selfColor : COLORS.red;
  const spawn      = MP.enabled && MP.selfSpawn ? MP.selfSpawn : { x: 1000, y: 500 };
  G.player = makePlayer(spawn.x, spawn.y, startColor);
  G.npcs = [];

  // NPCs only exist in single-player. In MP, other humans replace them.
  if (!MP.enabled) {
    const palette = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.teal, COLORS.yellow, COLORS.pink];
    const names = ['BLU', 'GRN', 'ORG', 'PRP', 'TEL', 'YLW', 'PNK'];
    const positions = [
      { x: 300,  y: 470 }, // engineering
      { x: 900,  y: 450 }, // cafeteria
      { x: 1100, y: 500 }, // cafeteria
      { x: 1580, y: 600 }, // comms
      { x: 350,  y: 850 }, // storage
      { x: 1500, y: 900 }, // security
    ];

    // pick which NPC is the impostor
    const impostorIdx = Math.floor(Math.random() * positions.length);

    for (let i = 0; i < positions.length; i++) {
      const npc = makeNPC(positions[i].x, positions[i].y, palette[i], names[i], i === impostorIdx, `npc_${i}`);
      G.npcs.push(npc);
    }
  }
  G.soloMeetingUsed = false;
  G.bodies = [];

  G.tasks = TASK_DEFS.map(t => ({ ...t, done: false, progress: 0 }));

  // Apply any task completions that already happened on the server before we joined.
  if (MP.enabled && MP.preDoneTasks.length) {
    for (const id of MP.preDoneTasks) {
      const t = G.tasks.find(x => x.id === id);
      if (t) t.done = true;
    }
  }

  // Reset remote players' alive flag at round start (server will re-broadcast deaths).
  if (MP.enabled) {
    for (const r of MP.remotes.values()) r.alive = true;
    MP.killCooldown = 0;
    MP.meetingUsed = false;
    MP.sabotageEndedAt = 0;
    G.meeting = null;
    document.getElementById('meetingOverlay')?.classList.add('hidden');
    document.getElementById('ejectionOverlay')?.classList.add('hidden');
  }
  G.particles = [];
  G.bloodSplats = [];
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
  G.cam.shake = 0;
  G.ambient.lightsOut = false;
  G.ambient.lightsOutT = 0;
  G.threatLevel = 0;
  G.killedAt = null;
  G.sabotages = { lights: false, doors: false };

  // Background stars
  G.stars = [];
  for (let i = 0; i < CFG.STAR_COUNT; i++) {
    G.stars.push({
      x: Math.random() * CFG.MAP_W * 2 - CFG.MAP_W * 0.5,
      y: Math.random() * CFG.MAP_H * 2 - CFG.MAP_H * 0.5,
      r: Math.random() * 1.6 + 0.3,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.5 + Math.random() * 2,
      depth: Math.random() * 0.7 + 0.1,
      hue: Math.random() < 0.15 ? '#b3eaff' : '#ffffff',
    });
  }

  // Nebula puffs
  G.nebula = [];
  for (let i = 0; i < 7; i++) {
    G.nebula.push({
      x: Math.random() * CFG.MAP_W * 1.5 - CFG.MAP_W * 0.25,
      y: Math.random() * CFG.MAP_H * 1.5 - CFG.MAP_H * 0.25,
      r: 400 + Math.random() * 600,
      hue: ['#1a3a6a', '#3a1a5a', '#1a5a4a', '#5a1a3a'][i % 4],
      a: 0.05 + Math.random() * 0.08,
    });
  }

  G.phase = 'playing';
  G.lastTime = performance.now();
}

// ═══════════════════════════════════════════════════════════════
//  PHYSICS — collision against axis-aligned walls
// ═══════════════════════════════════════════════════════════════

function circleVsRect(cx, cy, cr, rx, ry, rw, rh) {
  // closest point on rect to circle
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - px, dy = cy - py;
  return dx * dx + dy * dy < cr * cr;
}

function moveWithCollision(entity, dx, dy) {
  const cols = solids();
  let nx = entity.x + dx;
  let ny = entity.y + dy;

  let blockedX = false, blockedY = false;
  for (const w of cols) {
    if (circleVsRect(nx, entity.y, entity.radius, w.x, w.y, w.w, w.h)) { blockedX = true; break; }
  }
  if (!blockedX) entity.x = nx;

  for (const w of cols) {
    if (circleVsRect(entity.x, ny, entity.radius, w.x, w.y, w.w, w.h)) { blockedY = true; break; }
  }
  if (!blockedY) entity.y = ny;

  entity.x = Math.max(60, Math.min(CFG.MAP_W - 60, entity.x));
  entity.y = Math.max(60, Math.min(CFG.MAP_H - 60, entity.y));
}

function lineOfSight(x1, y1, x2, y2) {
  const cols = solids();
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 12);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t, y = y1 + dy * t;
    for (const w of cols) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return false;
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════════════════════════

function spawnParticle(x, y, opts = {}) {
  G.particles.push({
    x, y,
    vx: opts.vx ?? (Math.random() - 0.5) * 60,
    vy: opts.vy ?? (Math.random() - 0.5) * 60,
    life: opts.life ?? 0.8,
    age: 0,
    size: opts.size ?? 3,
    color: opts.color ?? '#fff',
    glow: opts.glow ?? false,
    drag: opts.drag ?? 0.92,
    gravity: opts.gravity ?? 0,
    shrink: opts.shrink ?? true,
  });
}

function spawnBurst(x, y, count, opts = {}) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (opts.speed ?? 100) * (0.4 + Math.random() * 0.8);
    spawnParticle(x, y, {
      ...opts,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: (opts.life ?? 0.8) * (0.6 + Math.random() * 0.6),
      size: (opts.size ?? 3) * (0.5 + Math.random() * 0.8),
    });
  }
}

function spawnPulse(x, y, color, life = 0.6, maxR = 60) {
  G.pulseEvents.push({ x, y, color, age: 0, life, maxR });
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE — main game tick
// ═══════════════════════════════════════════════════════════════

function update(dt) {
  if (G.phase !== 'playing') return;

  G.pulseT += dt;
  if (MP.killCooldown > 0) MP.killCooldown = Math.max(0, MP.killCooldown - dt);

  updatePlayer(dt);
  for (const npc of G.npcs) updateNPC(npc, dt);
  if (MP.enabled) {
    updateRemotes(dt);
    emitPosition(dt);
  }
  updateParticles(dt);
  updatePulses(dt);
  updateThreat(dt);
  updateAmbient(dt);
  updateCamera(dt);
  updateInteractionPrompt();
  updateKillIndicator();
  updateMeetingButton();
  updateSabotagePanel();
  checkWinLose();
  updateHUD();
}

function updatePlayer(dt) {
  const p = G.player;
  if (!p.alive) return;
  if (G.meeting) { p.vx = 0; p.vy = 0; p.walkPhase = 0; return; }  // frozen during meeting

  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup'])    dy -= 1;
  if (keys['s'] || keys['arrowdown'])  dy += 1;
  if (keys['a'] || keys['arrowleft'])  dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  if (G.activeTask) { dx = 0; dy = 0; }

  p.sprinting = !!keys['shift'] && (dx !== 0 || dy !== 0);
  const sp = p.speed * (p.sprinting ? CFG.SPRINT_MULT : 1);

  if (dx !== 0 || dy !== 0) {
    const mag = Math.hypot(dx, dy);
    dx /= mag; dy /= mag;
    if (dx < 0) p.facing = -1;
    else if (dx > 0) p.facing = 1;

    moveWithCollision(p, dx * sp * dt, dy * sp * dt);
    p.walkPhase += dt * (p.sprinting ? 14 : 9);

    // footstep particles
    const ddx = p.x - p.lastStepX, ddy = p.y - p.lastStepY;
    if (ddx * ddx + ddy * ddy > 900) {
      p.lastStepX = p.x; p.lastStepY = p.y;
      spawnParticle(p.x, p.y + p.radius * 0.7, {
        vx: -dx * 30 + (Math.random() - 0.5) * 20,
        vy: -dy * 30 + (Math.random() - 0.5) * 20,
        life: 0.5, size: 2,
        color: '#5a708a', drag: 0.88,
      });
      SFX.step();
    }
  } else {
    p.walkPhase = 0;
  }

  // Vent check (player can use vents! but only as the survivor it's just visual fast travel)
  for (const v of VENTS) {
    if (Math.hypot(p.x - v.x, p.y - v.y) < 30) {
      // ambient steam from nearby vents
      if (Math.random() < 0.3) {
        spawnParticle(v.x + (Math.random() - 0.5) * 10, v.y - 4, {
          vx: 0, vy: -30 - Math.random() * 20,
          life: 1.2, size: 3 + Math.random() * 2,
          color: 'rgba(180, 200, 220, 0.35)', drag: 0.95,
        });
      }
    }
  }
}

function updateNPC(npc, dt) {
  if (!npc.alive) return;

  npc.killCooldown = Math.max(0, npc.killCooldown - dt);

  if (npc.isImpostor) {
    updateImpostor(npc, dt);
  } else {
    updateCrewmate(npc, dt);
  }

  // walk animation
  const moving = Math.abs(npc.vx) + Math.abs(npc.vy) > 1;
  if (moving) {
    npc.walkPhase += dt * 8;
    if (npc.vx < -1) npc.facing = -1;
    else if (npc.vx > 1) npc.facing = 1;
  } else {
    npc.walkPhase = 0;
  }
}

function updateCrewmate(npc, dt) {
  // simple wander: pick a target, walk to it, hang out, pick another
  if (!npc.target || Math.hypot(npc.target.x - npc.x, npc.target.y - npc.y) < 30) {
    // arrived (or no target) — wait, then pick new
    if (!npc.target || npc.taskT <= 0) {
      const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
      npc.target = {
        x: room.x + 40 + Math.random() * (room.w - 80),
        y: room.y + 40 + Math.random() * (room.h - 80),
      };
      npc.taskT = 2 + Math.random() * 4;
    } else {
      // stand idle
      npc.taskT -= dt;
      npc.vx = 0; npc.vy = 0;
      return;
    }
  }

  // step towards target via simple direct movement
  const dx = npc.target.x - npc.x;
  const dy = npc.target.y - npc.y;
  const d = Math.hypot(dx, dy);
  const nx = dx / d, ny = dy / d;
  npc.vx = nx * npc.speed;
  npc.vy = ny * npc.speed;

  const before = { x: npc.x, y: npc.y };
  moveWithCollision(npc, npc.vx * dt, npc.vy * dt);

  // if stuck, pick a new target
  const moved = Math.hypot(npc.x - before.x, npc.y - before.y);
  if (moved < 1) {
    npc.target = null;
    npc.taskT = 0;
  }
}

function updateImpostor(npc, dt) {
  const p = G.player;

  // Sabotage timer — periodically trigger a sabotage if none active.
  npc.sabotageT = Math.max(0, npc.sabotageT - dt);
  if (npc.sabotageT <= 0 && !G.meeting) {
    if (!G.sabotages.lights && !G.sabotages.doors) {
      const type = Math.random() < 0.5 ? 'lights' : 'doors';
      G.sabotages[type] = true;
      if (type === 'lights') G.vision.active = false;
      SFX.alarm();
      flashScreen('red');
      G.cam.shake = 8;
    }
    npc.sabotageT = 35 + Math.random() * 20;  // next attempt in 35-55s
  }

  // Find best hunt target: player or isolated crewmate NPC.
  let huntTarget = null, huntDist = Infinity;
  if (p.alive && npc.killCooldown <= 0) {
    const d = Math.hypot(p.x - npc.x, p.y - npc.y);
    let alone = true;
    for (const other of G.npcs) {
      if (other === npc || !other.alive || other.isImpostor) continue;
      if (Math.hypot(other.x - p.x, other.y - p.y) < 240) { alone = false; break; }
    }
    if (alone && d < CFG.IMPOSTOR_VISION && lineOfSight(npc.x, npc.y, p.x, p.y)) {
      huntTarget = p; huntDist = d;
    }
  }
  // Also consider killing isolated crewmate NPCs.
  for (const other of G.npcs) {
    if (!other.alive || other.isImpostor || npc.killCooldown > 0) continue;
    const d = Math.hypot(other.x - npc.x, other.y - npc.y);
    if (d < CFG.IMPOSTOR_VISION && d < huntDist && lineOfSight(npc.x, npc.y, other.x, other.y)) {
      let alone = true;
      for (const w of G.npcs) {
        if (w === npc || w === other || !w.alive || w.isImpostor) continue;
        if (Math.hypot(w.x - other.x, w.y - other.y) < 200) { alone = false; break; }
      }
      if (alone) { huntTarget = other; huntDist = d; }
    }
  }

  if (huntTarget) {
    npc.state = 'hunt';
    npc.huntTarget = huntTarget;
    npc.huntT = 4;
  } else if (npc.huntT > 0) {
    npc.huntT -= dt;
    if (npc.huntT <= 0) { npc.state = 'wander'; npc.huntTarget = null; }
  }

  if (npc.state === 'hunt' && npc.huntTarget) {
    const target = npc.huntTarget;
    const dx = target.x - npc.x;
    const dy = target.y - npc.y;
    const d = Math.hypot(dx, dy) || 1;
    npc.vx = (dx / d) * npc.huntSpeed;
    npc.vy = (dy / d) * npc.huntSpeed;
    moveWithCollision(npc, npc.vx * dt, npc.vy * dt);

    if (d < CFG.KILL_RANGE && npc.killCooldown <= 0) {
      if (target === p) {
        killPlayer();
      } else {
        killNPC(target, npc);
      }
      npc.killCooldown = 25;
      npc.state = 'wander';
      npc.huntTarget = null;
    }

    // menacing trail
    if (Math.random() < 0.4) {
      spawnParticle(npc.x + (Math.random() - 0.5) * 18, npc.y + 4, {
        vx: 0, vy: -20, life: 0.6, size: 3,
        color: 'rgba(255, 60, 80, 0.5)',
      });
    }
  } else if (npc.state === 'vent') {
    // currently venting
    npc.ventT -= dt;
    if (npc.ventT <= 0) {
      // emerge at linked vent
      const v = VENTS[npc.ventTarget];
      npc.x = v.x; npc.y = v.y;
      npc.state = 'wander';
      // steam burst
      spawnBurst(npc.x, npc.y, 14, { color: 'rgba(200,220,240,0.6)', life: 1.2, speed: 80, size: 4 });
      SFX.vent();
    }
  } else {
    // wander like a crewmate sometimes, sometimes go to a vent and teleport
    if (Math.random() < 0.001 && npc.huntT <= 0) {
      // find nearest vent
      let nearest = 0, bd = Infinity;
      for (let i = 0; i < VENTS.length; i++) {
        const d = Math.hypot(VENTS[i].x - npc.x, VENTS[i].y - npc.y);
        if (d < bd) { bd = d; nearest = i; }
      }
      npc.target = { x: VENTS[nearest].x, y: VENTS[nearest].y };
      npc.ventEnter = nearest;
    }
    if (npc.ventEnter !== undefined && npc.target &&
        Math.hypot(npc.target.x - npc.x, npc.target.y - npc.y) < 20) {
      npc.state = 'vent';
      npc.ventTarget = VENTS[npc.ventEnter].link;
      npc.ventT = 2;
      spawnBurst(npc.x, npc.y, 12, { color: 'rgba(200,220,240,0.6)', life: 1.0, speed: 80, size: 4 });
      SFX.vent();
      npc.ventEnter = undefined;
      npc.target = null;
      return;
    }
    updateCrewmate(npc, dt);
  }
}

function killPlayer() {
  if (!G.player.alive) return;
  G.player.alive = false;
  G.killedAt = { x: G.player.x, y: G.player.y };
  // blood splat
  for (let i = 0; i < 30; i++) {
    spawnParticle(G.player.x, G.player.y, {
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 1.2 + Math.random() * 0.5,
      size: 3 + Math.random() * 3,
      color: '#9b1d28', gravity: 200, drag: 0.95,
    });
  }
  G.bloodSplats.push({ x: G.player.x, y: G.player.y });
  G.cam.shake = 20;
  flashScreen('red');
  SFX.kill();

  G.phase = 'lost';
  scheduleMenu('lose', null, 1500);
}

function killNPC(npc, killer) {
  if (!npc.alive) return;
  npc.alive = false;
  for (let i = 0; i < 20; i++) {
    spawnParticle(npc.x, npc.y, {
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 200,
      life: 1 + Math.random() * 0.5,
      size: 2 + Math.random() * 3,
      color: '#9b1d28', gravity: 180, drag: 0.95,
    });
  }
  G.bloodSplats.push({ x: npc.x, y: npc.y });
  G.bodies.push({ id: npc.id, x: npc.x, y: npc.y, name: npc.name, color: npc.color });
  SFX.kill();
}

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.age += dt;
    if (p.age >= p.life) { G.particles.splice(i, 1); continue; }
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function updatePulses(dt) {
  for (let i = G.pulseEvents.length - 1; i >= 0; i--) {
    const r = G.pulseEvents[i];
    r.age += dt;
    if (r.age >= r.life) G.pulseEvents.splice(i, 1);
  }
}

function updateThreat(dt) {
  // proximity to impostor builds threat
  let nearest = Infinity;
  for (const npc of G.npcs) {
    if (npc.isImpostor && npc.alive) {
      nearest = Math.min(nearest, Math.hypot(npc.x - G.player.x, npc.y - G.player.y));
    }
  }
  let target = 0;
  if (nearest < 600) target = Math.max(0, 1 - nearest / 600);
  // ease threat
  G.threatLevel += (target - G.threatLevel) * dt * 2;
  if (G.threatLevel > 0.6 && Math.random() < dt * 0.5) {
    // distant heartbeat
    blip(60 + Math.random() * 10, 0.18, 'sine', 0.04 * G.threatLevel);
  }
}

function updateAmbient(dt) {
  G.ambient.flicker = Math.max(0, G.ambient.flicker - dt);
  if (G.ambient.lightsOut) {
    G.ambient.lightsOutT -= dt;
    if (G.ambient.lightsOutT <= 0) {
      G.ambient.lightsOut = false;
      flashScreen('white');
    }
  } else if (!MP.enabled && Math.random() < dt * 0.012) {
    // solo-only: rare random lights flicker based on threat level
    if (G.threatLevel > 0.5) {
      G.ambient.lightsOut = true;
      G.ambient.lightsOutT = 6;
      G.ambient.flicker = 0.4;
      SFX.alarm();
    }
  }
}

function updateCamera(dt) {
  // smooth follow with shake
  const lerp = 1 - Math.pow(0.001, dt);
  G.cam.x += (G.player.x - G.cam.x) * lerp;
  G.cam.y += (G.player.y - G.cam.y) * lerp;
  G.cam.shake *= Math.pow(0.001, dt);
}

function updateInteractionPrompt() {
  if (G.activeTask)        { setPrompt(''); return; }
  if (!G.player.alive)     { setPrompt(''); return; }
  if (G.meeting)           { setPrompt(''); return; }

  // Body report — highest priority for crewmates.
  {
    const body = findNearestBody();
    if (body) {
      setPrompt(`PRESS [R] — REPORT BODY (${body.name || '???'})`, true);
      return;
    }
  }

  // Battery console — crewmate only, when a sabotage is active.
  {
    const anyActive = G.sabotages.lights || G.sabotages.doors;
    const isImpostor = MP.enabled && MP.role === 'impostor';
    if (anyActive && !isImpostor) {
      const bc = BATTERY_CONSOLE;
      if (Math.hypot(bc.x - G.player.x, bc.y - G.player.y) < 60) {
        const which = G.sabotages.lights ? 'LIGHTS' : 'DOORS';
        setPrompt(`PRESS [E] — FIX ${which} SABOTAGE`, true);
        return;
      }
    }
  }

  // Meeting button (proximity).
  if (nearMeetingButton()) {
    if (MP.enabled) {
      if (MP.meetingUsed) setPrompt('MEETING ALREADY USED');
      else                setPrompt('PRESS [R] — EMERGENCY MEETING', true);
    } else {
      if (G.soloMeetingUsed) setPrompt('MEETING ALREADY USED');
      else                   setPrompt('PRESS [R] — EMERGENCY MEETING', true);
    }
    return;
  }

  // Impostor: kill prompt.
  if (MP.enabled && MP.role === 'impostor') {
    if (MP.killCooldown > 0) { setPrompt(''); return; }
    let nearVictim = null, bd = MP.KILL_RANGE;
    for (const r of MP.remotes.values()) {
      if (!r.alive) continue;
      const d = Math.hypot(r.x - G.player.x, r.y - G.player.y);
      if (d < bd) { bd = d; nearVictim = r; }
    }
    if (nearVictim) setPrompt(`PRESS [Q] — KILL ${nearVictim.name}`, true);
    else            setPrompt('');
    return;
  }

  // Crewmate / single-player: nearest task within range.
  let near = null, bd = CFG.TASK_RANGE;
  for (const t of G.tasks) {
    if (t.done) continue;
    const d = Math.hypot(t.x - G.player.x, t.y - G.player.y);
    if (d < bd) { bd = d; near = t; }
  }
  if (near) setPrompt(`PRESS [E] — ${near.name}`);
  else      setPrompt('');
}

function checkWinLose() {
  // In MP mode the server is authoritative — it emits 'game_over'.
  if (MP.enabled) return;
  if (G.phase !== 'playing') return;

  const impostor = G.npcs.find(n => n.isImpostor);

  // Crew wins: impostor is dead.
  if (impostor && !impostor.alive) {
    G.phase = 'won';
    SFX.win();
    flashScreen('green');
    scheduleMenu('win', null, 800);
    return;
  }

  // Crew wins: all tasks done.
  if (G.tasks.every(t => t.done)) {
    G.phase = 'won';
    SFX.win();
    flashScreen('green');
    scheduleMenu('win', null, 800);
    return;
  }

  // Impostor wins: player dead AND all crewmate NPCs dead.
  if (!G.player.alive) {
    const aliveCrew = G.npcs.filter(n => !n.isImpostor && n.alive);
    if (aliveCrew.length === 0) {
      G.phase = 'lost';
      scheduleMenu('lose', null, 800);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function viewW() { return canvas.width / (window.devicePixelRatio || 1); }
function viewH() { return canvas.height / (window.devicePixelRatio || 1); }

function applyCamera() {
  const vw = viewW(), vh = viewH();
  const shakeX = (Math.random() - 0.5) * G.cam.shake;
  const shakeY = (Math.random() - 0.5) * G.cam.shake;
  ctx.translate(vw / 2 - G.cam.x + shakeX, vh / 2 - G.cam.y + shakeY);
}

function render() {
  const vw = viewW(), vh = viewH();
  ctx.save();
  ctx.fillStyle = '#04060e';
  ctx.fillRect(0, 0, vw, vh);

  if (!G.player) { ctx.restore(); return; }

  // ── 1. background nebula (parallax slow)
  ctx.save();
  ctx.translate(vw / 2 - G.cam.x * 0.05, vh / 2 - G.cam.y * 0.05);
  for (const n of G.nebula) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.hue + '55');
    g.addColorStop(0.6, n.hue + '22');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = n.a;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 2. starfield (parallax based on depth)
  for (const s of G.stars) {
    const px = vw / 2 - G.cam.x * s.depth + s.x;
    const py = vh / 2 - G.cam.y * s.depth + s.y;
    if (px < -20 || px > vw + 20 || py < -20 || py > vh + 20) continue;
    const tw = (Math.sin(G.pulseT * s.twSpeed + s.tw) + 1) * 0.5;
    ctx.fillStyle = s.hue;
    ctx.globalAlpha = 0.4 + tw * 0.6;
    ctx.beginPath();
    ctx.arc(px, py, s.r * (0.8 + tw * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── 3. ship world (camera-transformed)
  ctx.save();
  applyCamera();

  renderShipHull();
  renderFloors();
  renderRoomLabels();
  renderVents();
  renderTasks();
  renderMeetingButton();
  renderBatteryConsole();
  renderBloodSplats();
  renderWalls();
  renderClosedDoors();
  renderEntities();
  renderParticles();
  renderPulses();

  ctx.restore();

  // ── 4. fog of war / vision
  renderFog();

  // ── 5. lighting overlay for dark mode (lights out)
  if (G.ambient.lightsOut) renderLightsOutOverlay();

  // ── 6. flicker
  if (G.ambient.flicker > 0 && Math.random() < 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, vw, vh);
  }

  // ── 7. threat tint
  if (G.threatLevel > 0.15) {
    ctx.fillStyle = `rgba(255, 30, 50, ${G.threatLevel * 0.18})`;
    ctx.fillRect(0, 0, vw, vh);
  }

  ctx.restore();
}

function renderShipHull() {
  // The hull is a metallic outline encompassing all rooms.
  // Draw a big rounded rect with metallic gradient.
  const g = ctx.createLinearGradient(0, 0, 0, CFG.MAP_H);
  g.addColorStop(0, '#15192a');
  g.addColorStop(0.5, '#0d1120');
  g.addColorStop(1, '#080a14');
  ctx.fillStyle = g;
  roundRect(40, 40, CFG.MAP_W - 80, CFG.MAP_H - 80, 30);
  ctx.fill();

  // panel lines
  ctx.strokeStyle = 'rgba(60, 80, 110, 0.25)';
  ctx.lineWidth = 1;
  for (let x = 100; x < CFG.MAP_W - 100; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 50); ctx.lineTo(x, CFG.MAP_H - 50);
    ctx.stroke();
  }
  for (let y = 120; y < CFG.MAP_H - 100; y += 120) {
    ctx.beginPath();
    ctx.moveTo(50, y); ctx.lineTo(CFG.MAP_W - 50, y);
    ctx.stroke();
  }

  // rivets at corners
  ctx.fillStyle = 'rgba(120, 150, 180, 0.4)';
  for (const [x, y] of [[60, 60], [CFG.MAP_W - 60, 60], [60, CFG.MAP_H - 60], [CFG.MAP_W - 60, CFG.MAP_H - 60]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderFloors() {
  for (const r of ROOMS) {
    // tinted floor
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, r.tint);
    g.addColorStop(1, shadeColor(r.tint, -20));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = r.x + 40; x < r.x + r.w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h);
      ctx.stroke();
    }
    for (let y = r.y + 40; y < r.y + r.h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y);
      ctx.stroke();
    }

    // ambient floor glow from ceiling lights
    const ambGrad = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) / 1.5);
    ambGrad.addColorStop(0, 'rgba(127, 219, 255, 0.07)');
    ambGrad.addColorStop(1, 'rgba(127, 219, 255, 0)');
    ctx.fillStyle = ambGrad;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

function renderRoomLabels() {
  ctx.font = 'bold 18px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of ROOMS) {
    ctx.fillStyle = 'rgba(127, 219, 255, 0.18)';
    ctx.fillText(r.name, r.x + r.w / 2, r.y + 22);
  }
}

function renderVents() {
  for (const v of VENTS) {
    ctx.save();
    // glow
    const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 40);
    g.addColorStop(0, 'rgba(80, 200, 255, 0.25)');
    g.addColorStop(1, 'rgba(80, 200, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(v.x - 40, v.y - 40, 80, 80);

    // grate
    ctx.fillStyle = '#1a2535';
    roundRect(v.x - 22, v.y - 22, 44, 44, 4);
    ctx.fill();
    ctx.strokeStyle = '#3a5575';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#2a3a55';
    ctx.lineWidth = 1.5;
    for (let i = -16; i <= 16; i += 8) {
      ctx.beginPath();
      ctx.moveTo(v.x - 16, v.y + i);
      ctx.lineTo(v.x + 16, v.y + i);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function renderTasks() {
  for (const t of G.tasks) {
    ctx.save();
    if (t.done) {
      // subtle green pulse for completed
      ctx.fillStyle = 'rgba(74, 222, 128, 0.06)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      // checkmark
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x - 7, t.y);
      ctx.lineTo(t.x - 2, t.y + 6);
      ctx.lineTo(t.x + 8, t.y - 6);
      ctx.stroke();
    } else {
      const pulse = (Math.sin(G.pulseT * 3) + 1) / 2;
      // ground glow
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 60 + pulse * 14);
      g.addColorStop(0, 'rgba(255, 200, 60, 0.5)');
      g.addColorStop(0.5, 'rgba(255, 200, 60, 0.18)');
      g.addColorStop(1, 'rgba(255, 200, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 60 + pulse * 14, 0, Math.PI * 2);
      ctx.fill();

      // station body
      ctx.fillStyle = '#2a2538';
      roundRect(t.x - 18, t.y - 18, 36, 36, 4);
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.stroke();

      // pulsing icon (square inside)
      ctx.fillStyle = `rgba(255, 200, 60, ${0.4 + pulse * 0.6})`;
      ctx.fillRect(t.x - 7, t.y - 7, 14, 14);

      // "!" floating above
      const bob = Math.sin(G.pulseT * 4) * 3;
      ctx.fillStyle = 'rgba(255, 200, 60, 0.9)';
      ctx.font = 'bold 14px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', t.x, t.y - 32 + bob);
    }
    ctx.restore();
  }
}

function renderMeetingButton() {
  const mb = MEETING_BUTTON;
  const used = MP.enabled ? MP.meetingUsed : G.soloMeetingUsed;
  const pulse = (Math.sin(G.pulseT * 2.5) + 1) / 2;

  // Ground glow.
  const g = ctx.createRadialGradient(mb.x, mb.y, 0, mb.x, mb.y, 90 + pulse * 10);
  if (used) {
    g.addColorStop(0, 'rgba(120, 120, 120, 0.25)');
  } else {
    g.addColorStop(0, `rgba(255, 77, 90, ${0.5 + pulse * 0.3})`);
  }
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(mb.x - 90, mb.y - 90, 180, 180);

  // Pedestal ring.
  ctx.fillStyle = '#15102a';
  ctx.beginPath();
  ctx.arc(mb.x, mb.y, mb.r + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = used ? '#555' : '#ff4d5a';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Button face with radial shading.
  const face = ctx.createRadialGradient(mb.x - 6, mb.y - 6, 0, mb.x, mb.y, mb.r);
  if (used) {
    face.addColorStop(0, '#888'); face.addColorStop(1, '#444');
  } else {
    face.addColorStop(0, '#ff8090'); face.addColorStop(1, '#cc1a2a');
  }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(mb.x, mb.y, mb.r, 0, Math.PI * 2);
  ctx.fill();

  // Exclamation.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', mb.x, mb.y + 2);

  // Label.
  ctx.font = 'bold 11px Courier New';
  ctx.fillStyle = used ? 'rgba(120, 120, 120, 0.7)' : 'rgba(255, 77, 90, 0.95)';
  ctx.fillText('EMERGENCY', mb.x, mb.y + mb.r + 16);
}

function renderBatteryConsole() {
  const anyActive = G.sabotages.lights || G.sabotages.doors;
  const bc = BATTERY_CONSOLE;
  const pulse = (Math.sin(G.pulseT * 4) + 1) / 2;

  // Always render a dim console; glow + label only when a sabotage is active.
  const glowAlpha = anyActive ? 0.55 + pulse * 0.35 : 0.15;
  const glowColor = anyActive ? `rgba(255, 200, 50, ${glowAlpha})` : `rgba(80,80,80,0.2)`;
  const g = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 70);
  g.addColorStop(0, glowColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(bc.x - 70, bc.y - 70, 140, 140);

  // Housing.
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(bc.x, bc.y, bc.r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = anyActive ? `rgba(255,200,50,${0.7 + pulse * 0.3})` : '#333';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Face.
  const face = ctx.createRadialGradient(bc.x - 4, bc.y - 4, 0, bc.x, bc.y, bc.r);
  if (anyActive) {
    face.addColorStop(0, '#ffe066'); face.addColorStop(1, '#b87700');
  } else {
    face.addColorStop(0, '#444'); face.addColorStop(1, '#222');
  }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(bc.x, bc.y, bc.r, 0, Math.PI * 2);
  ctx.fill();

  // Lightning bolt icon.
  ctx.fillStyle = anyActive ? '#1a1a2e' : '#555';
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', bc.x, bc.y + 1);

  // Label — only shown when active.
  if (anyActive) {
    ctx.font = 'bold 10px Courier New';
    ctx.fillStyle = `rgba(255,200,50,${0.8 + pulse * 0.2})`;
    ctx.fillText('BACKUP BATTERY', bc.x, bc.y + bc.r + 15);
  }
}

function renderClosedDoors() {
  if (!G.sabotages.doors) return;
  const flash = Math.sin(performance.now() / 150) > 0;
  for (const d of DOORS) {
    ctx.fillStyle = flash ? '#cc1a2a' : '#a01020';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#ff4d5a';
    if (d.h === 8) {
      ctx.fillRect(d.x, d.y, d.w, 2);
    } else {
      ctx.fillRect(d.x, d.y, 2, d.h);
    }
  }
}

function renderBloodSplats() {
  for (const b of G.bloodSplats) {
    ctx.fillStyle = '#5a0d18';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9b1d28';
    ctx.beginPath();
    ctx.arc(b.x - 4, b.y - 2, 16, 0, Math.PI * 2);
    ctx.fill();
    // splatter
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const d = 28 + (i % 2) * 8;
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(ang) * d, b.y + Math.sin(ang) * d, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderWalls() {
  for (const w of WALLS) {
    // base wall
    ctx.fillStyle = '#2a3550';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    // top highlight
    ctx.fillStyle = '#3e4d6f';
    ctx.fillRect(w.x, w.y, w.w, Math.min(2, w.h));
    // shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(w.x, w.y + w.h - 2, w.w, 2);
  }
}

function renderEntities() {
  // collect (player + alive npcs + remote players), sort by Y for occlusion
  const entities = [...G.npcs];
  if (G.player.alive) entities.push(G.player);
  if (MP.enabled) {
    for (const r of MP.remotes.values()) {
      entities.push({
        type: 'remote', x: r.x, y: r.y, vx: 0, vy: 0,
        color: r.color, name: r.name,
        facing: r.facing, walkPhase: r.walkPhase,
        radius: r.radius, isImpostor: false, alive: r.alive !== false,
        _isMoving: r.alive !== false && r.walkPhase !== 0,
      });
    }
  }
  entities.sort((a, b) => a.y - b.y);

  for (const e of entities) {
    // LOS occlusion: only see things in line of sight from local player (skip during meeting).
    if (G.player && e !== G.player && !G.meeting) {
      if (!lineOfSight(G.player.x, G.player.y, e.x, e.y)) continue;
    }
    // Override color per role.
    const displayColor = displayColorFor(e);
    const original = e.color;
    e.color = displayColor;
    if (e.type === 'remote' && e.alive === false) {
      drawCrewmateBody(e.x, e.y, e.color, e.facing, 0, false, true, false);
    } else {
      drawCrewmate(e);
      if (e.type === 'remote' && e.name) drawNameTag(e);
    }
    e.color = original;
  }

  // dead player visual (if killed)
  if (!G.player.alive && G.killedAt) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    drawCrewmateBody(G.killedAt.x, G.killedAt.y, G.player.color, 1, 0, false, true);
    ctx.restore();
  }
}

// In MP, everyone is rendered blue EXCEPT the local player if they're the
// impostor — they see themselves red. Single-player keeps the original
// per-entity colors so the NPC variety stays.
const CREWMATE_BLUE = '#3a7fd6';
const IMPOSTOR_RED  = '#e74c3c';
function displayColorFor(e) {
  if (!MP.enabled) return e.color;
  if (e.type === 'player') {
    return MP.role === 'impostor' ? IMPOSTOR_RED : CREWMATE_BLUE;
  }
  return CREWMATE_BLUE;
}

function drawCrewmate(e) {
  // shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.9, e.radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  const isMoving = e._isMoving === true
    || Math.abs(e.vx) + Math.abs(e.vy) > 1
    || (e.type === 'player' && (keys['w'] || keys['a'] || keys['s'] || keys['d']));
  const bob = isMoving ? Math.sin(e.walkPhase) * 1.5 : 0;
  drawCrewmateBody(e.x, e.y + bob, e.color, e.facing, e.walkPhase, isMoving, false, e.isImpostor);
}

function drawNameTag(e) {
  ctx.save();
  ctx.font = 'bold 10px Courier New';
  ctx.textAlign = 'center';
  const text = e.name;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(e.x - tw / 2 - 5, e.y - e.radius - 24, tw + 10, 14, 2);
  ctx.fill();
  ctx.fillStyle = e.color;
  ctx.fillText(text, e.x, e.y - e.radius - 13);
  ctx.restore();
}

function drawCrewmateBody(x, y, color, facing, walkPhase, isMoving, dead, impostor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);

  const r = CFG.PLAYER_RADIUS;

  // legs (two ovals offset for walk animation)
  if (!dead) {
    const lphase = isMoving ? walkPhase : 0;
    const legOffsetA = Math.sin(lphase) * 3;
    const legOffsetB = -legOffsetA;
    ctx.fillStyle = shadeColor(color, -30);
    ctx.beginPath();
    ctx.ellipse(-5, r * 0.95 + legOffsetA * 0.3, 4, 8 + Math.abs(legOffsetA) * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5, r * 0.95 + legOffsetB * 0.3, 4, 8 + Math.abs(legOffsetB) * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // body — rounded bean
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.85, r, 0, 0, Math.PI * 2);
  ctx.fill();

  // body shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(r * 0.35, r * 0.1, r * 0.4, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // body highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.25, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // backpack
  ctx.fillStyle = shadeColor(color, -25);
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, r * 0.1, 4, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // visor (eye)
  if (dead) {
    // X eye
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -r * 0.35); ctx.lineTo(3, -r * 0.15);
    ctx.moveTo(3, -r * 0.35); ctx.lineTo(-3, -r * 0.15);
    ctx.stroke();
  } else {
    const visorGrad = ctx.createLinearGradient(0, -r * 0.5, 0, -r * 0.1);
    visorGrad.addColorStop(0, '#8ec5d6');
    visorGrad.addColorStop(0.5, '#4a90a9');
    visorGrad.addColorStop(1, '#2a5a6d');
    ctx.fillStyle = visorGrad;
    ctx.beginPath();
    ctx.ellipse(2, -r * 0.3, r * 0.55, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(-2, -r * 0.4, r * 0.15, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // outline
  ctx.strokeStyle = shadeColor(color, -50);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.85, r, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Subtle aura for impostor when in hunt state - reveal a hint
  if (impostor && G.threatLevel > 0.7 && !dead) {
    const t = (Math.sin(G.pulseT * 6) + 1) / 2;
    ctx.strokeStyle = `rgba(255, 60, 80, ${0.2 + t * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, CFG.PLAYER_RADIUS * 1.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function renderParticles() {
  for (const p of G.particles) {
    const t = 1 - p.age / p.life;
    const size = p.shrink ? p.size * t : p.size;
    if (p.glow) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - size * 3, p.y - size * 3, size * 6, size * 6);
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = t;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderPulses() {
  for (const r of G.pulseEvents) {
    const t = r.age / r.life;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, t * r.maxR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Fog of war using radial gradient mask ──────────────────────
function renderFog() {
  if (!G.vision.active) {
    // flashlight off: very dim view, still some light around player
    drawFog(80, 30, 'rgba(0,0,0,0.92)');
    return;
  }
  drawFog(CFG.VISION_RADIUS, CFG.VISION_FALLOFF, 'rgba(0,0,0,0.78)');
}

function drawFog(radius, falloff, outerColor) {
  const vw = viewW(), vh = viewH();
  const shakeX = (Math.random() - 0.5) * G.cam.shake;
  const shakeY = (Math.random() - 0.5) * G.cam.shake;
  const px = vw / 2 + shakeX;
  const py = vh / 2 + shakeY;

  ctx.save();
  // soft circular vision
  const g = ctx.createRadialGradient(px, py, radius * 0.4, px, py, radius);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, outerColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // secondary outer band — much darker
  const g2 = ctx.createRadialGradient(px, py, radius, px, py, radius + falloff);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

function renderLightsOutOverlay() {
  const vw = viewW(), vh = viewH();
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, vw, vh);
  // red emergency flicker
  if (Math.floor(G.pulseT * 4) % 2 === 0) {
    ctx.fillStyle = 'rgba(180, 30, 40, 0.18)';
    ctx.fillRect(0, 0, vw, vh);
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shadeColor(hex, percent) {
  // hex like '#aabbcc' shift each channel by percent (-100..100)
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0xff) + percent;
  let b = (num & 0xff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

function flashScreen(kind) {
  const f = document.getElementById('flash');
  f.className = 'flash ' + kind + ' show';
  setTimeout(() => { f.className = 'flash ' + kind; }, 130);
}

// ═══════════════════════════════════════════════════════════════
//  HUD / DOM updates
// ═══════════════════════════════════════════════════════════════

function buildHUD() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  for (const t of G.tasks) {
    const li = document.createElement('div');
    li.className = 'task-item' + (t.done ? ' done' : '');
    li.id = 'task-' + t.id;
    li.innerHTML = `<span class="checkbox"></span>${t.name}`;
    list.appendChild(li);
  }
  // The old HUD meeting button is replaced by an in-world button rendered
  // at MEETING_BUTTON. Keep the DOM element hidden permanently.
  const mBtn = document.getElementById('meetingBtn');
  if (mBtn) mBtn.style.display = 'none';
}

function updateMeetingButton() { /* no-op — using in-world button now */ }

// Sabotage panel — visible only to the impostor.
let _sabHooked = false;
function updateSabotagePanel() {
  const panel = document.getElementById('sabotagePanel');
  if (!panel) return;
  const visible = MP.enabled && MP.role === 'impostor' && G.phase === 'playing' && G.player && G.player.alive;
  panel.style.display = visible ? 'flex' : 'none';
  if (!visible) return;

  if (!_sabHooked) {
    panel.querySelectorAll('.sab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (!type) return;
        if (G.sabotages.lights || G.sabotages.doors) return;     // one at a time
        const cooldownLeft = MP.SABOTAGE_COOLDOWN - (performance.now() - MP.sabotageEndedAt) / 1000;
        if (MP.sabotageEndedAt > 0 && cooldownLeft > 0) return;  // cooldown active
        MP.socket.emit('sabotage', { type });
      });
    });
    _sabHooked = true;
  }

  const anyActive = G.sabotages.lights || G.sabotages.doors;
  const cooldownLeft = MP.sabotageEndedAt > 0
    ? Math.max(0, MP.SABOTAGE_COOLDOWN - (performance.now() - MP.sabotageEndedAt) / 1000)
    : 0;

  for (const type of ['lights', 'doors']) {
    const btn = panel.querySelector(`.sab-btn[data-type="${type}"]`);
    const status = panel.querySelector(`.sab-status[data-status="${type}"]`);
    if (!btn || !status) continue;

    if (G.sabotages[type]) {
      // This sabotage is currently active — waiting for crew to fix.
      btn.classList.add('active');
      btn.disabled = true;
      status.textContent = 'ACTIVE';
    } else if (anyActive) {
      // Other sabotage is active — can't stack.
      btn.classList.remove('active');
      btn.disabled = true;
      status.textContent = 'BUSY';
    } else if (cooldownLeft > 0) {
      // Post-fix cooldown.
      btn.classList.remove('active');
      btn.disabled = true;
      status.textContent = cooldownLeft.toFixed(1) + 's';
    } else {
      btn.classList.remove('active');
      btn.disabled = false;
      status.textContent = 'READY';
    }
  }
}

function updateHUD() {
  const elapsed = (performance.now() - G.startTime) / 1000;
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  document.getElementById('clock').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const done = G.tasks.filter(t => t.done).length;
  const pct = Math.round(done / G.tasks.length * 100);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '%';

  // threat label
  const thr = document.getElementById('threat');
  if (G.threatLevel > 0.75) {
    thr.textContent = 'IMPOSTOR PROXIMATE — RUN';
    thr.className = 'hud-sublabel danger';
  } else if (G.threatLevel > 0.4) {
    thr.textContent = 'MOVEMENT DETECTED';
    thr.className = 'hud-sublabel warn';
  } else {
    thr.textContent = 'SECTOR CLEAR';
    thr.className = 'hud-sublabel';
  }

  // minimap
  drawMinimap();
}

function drawMinimap() {
  const mm = document.getElementById('minimap');
  const mc = mm.getContext('2d');
  const w = mm.width, h = mm.height;
  const sx = w / CFG.MAP_W, sy = h / CFG.MAP_H;

  mc.fillStyle = 'rgba(0,0,0,0.4)';
  mc.fillRect(0, 0, w, h);

  // rooms
  for (const r of ROOMS) {
    mc.fillStyle = 'rgba(40, 60, 90, 0.6)';
    mc.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);
  }
  // walls (very faint, just outline)
  mc.fillStyle = 'rgba(127, 219, 255, 0.25)';
  for (const wl of WALLS) {
    mc.fillRect(wl.x * sx, wl.y * sy, Math.max(0.5, wl.w * sx), Math.max(0.5, wl.h * sy));
  }
  // tasks
  for (const t of G.tasks) {
    if (t.done) {
      mc.fillStyle = '#4ade80';
    } else {
      const pulse = (Math.sin(G.pulseT * 3) + 1) / 2;
      mc.fillStyle = `rgba(255, 200, 60, ${0.5 + pulse * 0.5})`;
    }
    mc.fillRect(t.x * sx - 2, t.y * sy - 2, 4, 4);
  }
  // npcs as gray dots
  for (const n of G.npcs) {
    if (!n.alive) continue;
    mc.fillStyle = n.color;
    mc.globalAlpha = 0.5;
    mc.beginPath();
    mc.arc(n.x * sx, n.y * sy, 2, 0, Math.PI * 2);
    mc.fill();
  }
  mc.globalAlpha = 1;
  // player as bright red dot
  if (G.player.alive) {
    mc.fillStyle = G.player.color;
    mc.beginPath();
    mc.arc(G.player.x * sx, G.player.y * sy, 3, 0, Math.PI * 2);
    mc.fill();
    mc.strokeStyle = '#fff';
    mc.lineWidth = 1;
    mc.stroke();
  }
}

function setPrompt(text, urgent = false) {
  if (G.prompt === text && G.promptUrgent === urgent) return;
  G.prompt = text; G.promptUrgent = urgent;
  const el = document.getElementById('prompt');
  el.textContent = text;
  el.className = 'hud-prompt' + (text ? ' show' : '') + (urgent ? ' urgent' : '');
}

// ═══════════════════════════════════════════════════════════════
//  TASK INTERACTION + MINI-GAMES
// ═══════════════════════════════════════════════════════════════

function tryInteract() {
  if (G.phase !== 'playing') return;
  if (G.meeting) return;
  if (G.activeTask) return;
  if (!G.player.alive) return;

  // Battery console — crewmates only, fixes any active sabotage.
  const anyActive = G.sabotages.lights || G.sabotages.doors;
  const isImpostor = MP.enabled && MP.role === 'impostor';
  if (anyActive && !isImpostor) {
    const bc = BATTERY_CONSOLE;
    if (Math.hypot(bc.x - G.player.x, bc.y - G.player.y) < 60) {
      if (MP.enabled) {
        MP.socket.emit('fix_sabotage');
      } else {
        // Solo mode: fix locally.
        G.sabotages.lights = false;
        G.sabotages.doors  = false;
        flashScreen('white');
        G.cam.shake = 4;
      }
      return;
    }
  }

  if (MP.enabled && MP.role === 'impostor') return;   // impostors can't do tasks
  // find nearest task in range
  let near = null, bd = CFG.TASK_RANGE;
  for (const t of G.tasks) {
    if (t.done) continue;
    const d = Math.hypot(t.x - G.player.x, t.y - G.player.y);
    if (d < bd) { bd = d; near = t; }
  }
  if (near) openTask(near);
}

function tryKill() {
  if (!MP.enabled || MP.role !== 'impostor') return;
  if (G.phase !== 'playing' || !G.player || !G.player.alive) return;
  if (G.meeting) return;
  if (MP.killCooldown > 0) return;
  // The server is authoritative — we just send the request.
  MP.socket.emit('kill');
}

function openTask(task) {
  G.activeTask = task;
  document.getElementById('task-' + task.id)?.classList.add('active');
  const panel = document.getElementById('taskPanel');
  const title = document.getElementById('taskPanelTitle');
  const body = document.getElementById('taskPanelBody');
  title.textContent = task.name;
  body.innerHTML = '';
  panel.classList.remove('hidden');
  SFX.taskOpen();

  if (task.type === 'wires')     buildWiresGame(body, task);
  else if (task.type === 'reactor')   buildReactorGame(body, task);
  else if (task.type === 'numpad')    buildNumpadGame(body, task);
  else if (task.type === 'calibrate') buildCalibrateGame(body, task);
}

function closeTask(success) {
  if (!G.activeTask) return;
  const task = G.activeTask;
  document.getElementById('task-' + task.id)?.classList.remove('active');

  if (success) {
    task.done = true;
    document.getElementById('task-' + task.id)?.classList.add('done');
    spawnBurst(task.x, task.y, 30, { color: '#4ade80', speed: 180, size: 4, life: 1.0 });
    spawnPulse(task.x, task.y, '#4ade80', 0.7, 80);
    SFX.taskOk();
    flashScreen('green');
    if (MP.enabled && MP.socket && MP.socket.connected) {
      MP.socket.emit('task_done', task.id);
    }
  }

  document.getElementById('taskPanel').classList.add('hidden');
  G.activeTask = null;
  SFX.taskClose();
}

document.getElementById('taskCancel').addEventListener('click', () => closeTask(false));

// ── Wires: match 4 colored nodes left to right ─────────────────
function buildWiresGame(body, task) {
  body.innerHTML = `
    <p style="font-size:11px; color:#889; text-align:center; margin-bottom:10px; letter-spacing:0.15em;">
      MATCH WIRES BY COLOR
    </p>
    <div class="wires" id="wires"></div>
  `;
  const wires = body.querySelector('#wires');
  const palette = ['#ff4d5a', '#3498db', '#f1c40f', '#4ade80'];
  const left  = palette.slice().sort(() => Math.random() - 0.5);
  const right = palette.slice().sort(() => Math.random() - 0.5);

  const leftCol  = document.createElement('div'); leftCol.className = 'wire-col';
  const rightCol = document.createElement('div'); rightCol.className = 'wire-col';

  const leftNodes = left.map((c, i) => {
    const n = document.createElement('div');
    n.className = 'wire-node';
    n.style.background = c; n.style.color = c;
    n.dataset.color = c;
    n.dataset.side = 'L';
    leftCol.appendChild(n);
    return n;
  });
  const rightNodes = right.map((c, i) => {
    const n = document.createElement('div');
    n.className = 'wire-node';
    n.style.background = c; n.style.color = c;
    n.dataset.color = c;
    n.dataset.side = 'R';
    rightCol.appendChild(n);
    return n;
  });

  wires.appendChild(leftCol);
  wires.appendChild(rightCol);

  let selected = null;
  let matched = 0;

  function pick(n) {
    if (n.classList.contains('matched')) return;
    SFX.click();
    if (!selected) {
      selected = n;
      n.classList.add('selected');
      return;
    }
    if (selected === n) {
      selected.classList.remove('selected');
      selected = null;
      return;
    }
    if (selected.dataset.side === n.dataset.side) {
      // can't match same side, switch selection
      selected.classList.remove('selected');
      selected = n;
      n.classList.add('selected');
      return;
    }
    // attempt match
    if (selected.dataset.color === n.dataset.color) {
      selected.classList.add('matched');
      n.classList.add('matched');
      selected.classList.remove('selected');
      matched++;
      SFX.taskOk();
      if (matched === palette.length) {
        setTimeout(() => closeTask(true), 400);
      }
    } else {
      // brief wrong flash
      selected.style.outline = '2px solid #ff4d5a';
      n.style.outline = '2px solid #ff4d5a';
      SFX.taskBad();
      const prev = selected;
      setTimeout(() => {
        prev.style.outline = '';
        n.style.outline = '';
      }, 300);
      selected.classList.remove('selected');
      selected = null;
    }
  }

  leftNodes.forEach(n => n.addEventListener('click', () => pick(n)));
  rightNodes.forEach(n => n.addEventListener('click', () => pick(n)));
}

// ── Reactor: hold the core for 3 seconds ───────────────────────
function buildReactorGame(body, task) {
  body.innerHTML = `
    <div class="reactor">
      <div class="reactor-ring">
        <div class="reactor-core" id="reactorCore"></div>
        <div class="reactor-progress"><div id="reactorBar"></div></div>
      </div>
      <p class="reactor-instr">HOLD CORE TO STABILIZE</p>
    </div>
  `;
  const core = body.querySelector('#reactorCore');
  const bar  = body.querySelector('#reactorBar');
  let holding = false;
  let prog = 0;
  const target = 3000;
  let lastTs = 0;
  let raf;

  function tick(ts) {
    if (lastTs) {
      const d = ts - lastTs;
      if (holding) prog = Math.min(target, prog + d);
      else prog = Math.max(0, prog - d * 0.5);
      bar.style.width = (prog / target * 100) + '%';
      if (prog >= target) {
        closeTask(true);
        cancelAnimationFrame(raf);
        return;
      }
    }
    lastTs = ts;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  core.addEventListener('mousedown', () => { holding = true; SFX.click(); });
  core.addEventListener('mouseup',   () => { holding = false; });
  core.addEventListener('mouseleave',() => { holding = false; });

  // store cleanup
  const cancel = document.getElementById('taskCancel');
  const handler = () => { cancelAnimationFrame(raf); cancel.removeEventListener('click', handler); };
  cancel.addEventListener('click', handler);
}

// ── Numpad: repeat the displayed sequence ──────────────────────
function buildNumpadGame(body, task) {
  body.innerHTML = `
    <div class="sequence-display" id="seqDisplay">WATCH SEQUENCE…</div>
    <div class="numpad" id="numpad"></div>
  `;
  const seqDisplay = body.querySelector('#seqDisplay');
  const numpad = body.querySelector('#numpad');

  const length = 4;
  const sequence = Array.from({ length }, () => 1 + Math.floor(Math.random() * 9));
  const userInput = [];

  const btns = [];
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button');
    b.className = 'numpad-btn';
    b.textContent = i;
    b.dataset.n = i;
    numpad.appendChild(b);
    btns.push(b);
  }

  function light(n, dur = 350) {
    return new Promise(res => {
      const b = btns[n - 1];
      b.classList.add('lit');
      blip(220 + n * 50, 0.12, 'sine', 0.06);
      setTimeout(() => { b.classList.remove('lit'); res(); }, dur);
    });
  }

  async function playSequence() {
    seqDisplay.textContent = 'WATCH SEQUENCE…';
    for (const n of sequence) {
      await light(n, 380);
      await new Promise(r => setTimeout(r, 120));
    }
    seqDisplay.textContent = 'REPEAT NOW';
  }

  btns.forEach(b => b.addEventListener('click', () => {
    if (seqDisplay.textContent === 'WATCH SEQUENCE…') return;
    const n = parseInt(b.dataset.n);
    userInput.push(n);
    b.classList.add('lit');
    blip(220 + n * 50, 0.1, 'sine', 0.06);
    setTimeout(() => b.classList.remove('lit'), 200);

    const idx = userInput.length - 1;
    if (userInput[idx] !== sequence[idx]) {
      // wrong — flash and reset
      b.classList.remove('lit'); b.classList.add('wrong');
      SFX.taskBad();
      setTimeout(() => {
        b.classList.remove('wrong');
        userInput.length = 0;
        playSequence();
      }, 500);
      return;
    }
    if (userInput.length === sequence.length) {
      seqDisplay.textContent = 'AUTHORIZED';
      setTimeout(() => closeTask(true), 400);
    }
  }));

  setTimeout(playSequence, 300);
}

// ── Calibrate: stop the moving needle in the green zone ────────
function buildCalibrateGame(body, task) {
  body.innerHTML = `
    <div class="calibrate">
      <div class="calibrate-track" id="calTrack">
        <div class="calibrate-target" id="calTarget"></div>
        <div class="calibrate-needle" id="calNeedle"></div>
      </div>
      <p class="calibrate-instr">CLICK TO LOCK NEEDLE IN GREEN ZONE — 3 TIMES</p>
    </div>
  `;
  const track  = body.querySelector('#calTrack');
  const target = body.querySelector('#calTarget');
  const needle = body.querySelector('#calNeedle');

  let raf, lastTs = 0;
  let pos = 0, dir = 1;
  let zoneStart = 30 + Math.random() * 40, zoneW = 18;
  let locked = 0;
  const required = 3;

  target.style.left = zoneStart + '%';
  target.style.width = zoneW + '%';

  function tick(ts) {
    if (lastTs) {
      const dt = (ts - lastTs) / 1000;
      pos += dir * 70 * dt;
      if (pos > 100) { pos = 100; dir = -1; }
      if (pos < 0)   { pos = 0; dir = 1; }
      needle.style.left = pos + '%';
    }
    lastTs = ts;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  track.addEventListener('click', () => {
    if (pos >= zoneStart && pos <= zoneStart + zoneW) {
      locked++;
      SFX.taskOk();
      // flash green
      track.style.boxShadow = '0 0 18px #4ade80';
      setTimeout(() => track.style.boxShadow = '', 200);
      if (locked >= required) {
        cancelAnimationFrame(raf);
        closeTask(true);
        return;
      }
      // tighten zone
      zoneW = Math.max(8, zoneW - 4);
      zoneStart = 10 + Math.random() * (88 - zoneW);
      target.style.left = zoneStart + '%';
      target.style.width = zoneW + '%';
    } else {
      SFX.taskBad();
      track.style.boxShadow = '0 0 18px #ff4d5a';
      setTimeout(() => track.style.boxShadow = '', 200);
    }
  });

  const cancel = document.getElementById('taskCancel');
  const handler = () => { cancelAnimationFrame(raf); cancel.removeEventListener('click', handler); };
  cancel.addEventListener('click', handler);
}

// ═══════════════════════════════════════════════════════════════
//  MENU / FLOW
// ═══════════════════════════════════════════════════════════════

const menu = document.getElementById('menu');
const menuBrief = document.getElementById('menuBrief');
const startBtn = document.getElementById('startBtn');
const hud = document.getElementById('hud');

function showMenu(kind, result) {
  menu.classList.remove('hidden', 'win', 'lose');
  hud.classList.add('hidden');
  if (kind === 'win') {
    menu.classList.add('win');
    if (MP.enabled && MP.role === 'impostor' && result === 'impostor_win') {
      document.querySelector('.title').textContent = 'KILL CONFIRMED';
      document.querySelector('.subtitle').textContent = '— the crew is dead —';
      menuBrief.innerHTML = `You eliminated the crew. No witnesses. No tasks finished.<br><br>Time: <strong>${document.getElementById('clock').textContent}</strong>`;
    } else {
      document.querySelector('.title').textContent = 'SHIP STABLE';
      document.querySelector('.subtitle').textContent = '— all systems online —';
      menuBrief.innerHTML = `You restarted every system. The drift ends.<br><br>Time: <strong>${document.getElementById('clock').textContent}</strong>`;
    }
    startBtn.textContent = MP.enabled ? 'PLAY AGAIN' : 'DRIFT AGAIN';
  } else if (kind === 'lose') {
    menu.classList.add('lose');
    if (MP.enabled && MP.role === 'impostor' && result === 'crew_win') {
      document.querySelector('.title').textContent = 'EXPOSED';
      document.querySelector('.subtitle').textContent = '— the crew won —';
      menuBrief.innerHTML = `They finished the tasks before you could finish them.<br><br>Tasks done: <strong>${G.tasks.filter(t => t.done).length} / ${G.tasks.length}</strong>`;
    } else {
      document.querySelector('.title').textContent = 'DECEASED';
      document.querySelector('.subtitle').textContent = '— another body found —';
      menuBrief.innerHTML = `The impostor caught you alone.<br><br>Tasks done: <strong>${G.tasks.filter(t => t.done).length} / ${G.tasks.length}</strong>`;
    }
    startBtn.textContent = 'RETRY';
  } else {
    document.querySelector('.title').textContent = 'VOIDSHIP';
    if (MP.enabled) {
      document.querySelector('.subtitle').textContent = '— social deduction —';
      menuBrief.innerHTML = `One player is the impostor. Crewmates: complete six systems.<br>Impostor: press <strong>Q</strong> to kill nearby crewmates.<br>Roles are assigned when you press BOOT SEQUENCE.`;
    } else {
      document.querySelector('.subtitle').textContent = '— solo drift —';
      menuBrief.innerHTML = `Your ship is dead. Restart six systems before the thing in the vents finds you alone.<br>Stay near other crew. The dark is not your friend.`;
    }
    startBtn.textContent = 'BOOT SEQUENCE';
  }
  updateMenuStatus();
  updateStartButton();
}

// Local game start — runs on the host's machine when they click, and on
// every other client when the server emits 'start'.
function startLocalRound() {
  cancelPendingMenu();
  audioCtx();
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  initGame();
  buildHUD();
  sweep(110, 440, 0.6, 'sawtooth', 0.04);
  // In solo mode always show crewmate role banner.
  if (!MP.enabled) showRoleBanner('crewmate');
}

// In multiplayer, hide the BOOT SEQUENCE button for non-hosts and show a
// "waiting for host" message instead. Before the welcome event arrives we
// don't know our status, so just hide the button quietly.
function updateStartButton() {
  let waitEl = document.getElementById('hostWaitMsg');
  if (!MP.enabled || MP.isHost) {
    startBtn.style.display = '';
    if (waitEl) waitEl.remove();
    return;
  }
  startBtn.style.display = 'none';
  if (!MP.welcomed) {
    if (waitEl) waitEl.remove();
    return;
  }
  if (!waitEl) {
    waitEl = document.createElement('div');
    waitEl.id = 'hostWaitMsg';
    waitEl.className = 'host-wait';
    startBtn.parentNode.insertBefore(waitEl, startBtn.nextSibling);
  }
  waitEl.innerHTML = `<span class="host-wait-dot"></span> WAITING FOR HOST TO START`;
}

startBtn.addEventListener('click', () => {
  audioCtx(); // unlock audio
  if (MP.enabled) {
    if (!MP.isHost) return;                            // safety: only host starts
    if (!MP.socket || !MP.socket.connected) return;
    MP.socket.emit('restart');
    // Don't start locally — wait for the server's 'start' event. This
    // guarantees we don't race ahead of the role assignment.
    return;
  }
  // Single-player: just go.
  startLocalRound();
});

// ═══════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════

function loop(now) {
  const dt = Math.min(0.05, (now - G.lastTime) / 1000);
  G.lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Kick off the multiplayer connection if the Socket.IO client is available
// (i.e. this page was served by `npm start` rather than opened as a file).
initMultiplayer();
showMenu(null); // refresh menu text to reflect mode
