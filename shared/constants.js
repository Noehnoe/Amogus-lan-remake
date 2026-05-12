// Shared constants — loaded by both server (require) and client (script tag)
// Keep this file free of Node-specific APIs so the browser can use it directly.

const CONSTANTS = {
  // Server
  PORT: 3000,

  // Map dimensions (pixels)
  MAP_WIDTH: 1600,
  MAP_HEIGHT: 1200,

  // Player physics
  PLAYER_SPEED: 160,       // px/s default
  PLAYER_RADIUS: 18,       // collision circle radius

  // Vision
  CREWMATE_VISION: 180,    // radius in px
  IMPOSTOR_VISION: 260,
  GHOST_VISION: 9999,      // ghosts see everything

  // Kill
  KILL_RANGE: 50,          // px from center to center
  KILL_COOLDOWN_DEFAULT: 30, // seconds

  // Tasks
  TASK_INTERACT_RANGE: 60, // px — how close to press E
  TASK_COUNT_DEFAULT: 5,

  // Meetings
  DISCUSSION_TIME_DEFAULT: 45, // seconds
  VOTING_TIME_DEFAULT: 30,

  // Sabotage
  LIGHTS_DURATION: 30,          // seconds
  REACTOR_COUNTDOWN: 45,        // seconds
  REACTOR_HOLD_TIME: 3,         // seconds both players must hold

  // Networking
  TICK_RATE: 20,           // server broadcasts per second
  RECONCILE_INTERVAL: 100, // ms between server reconciliation
  RECONNECT_GRACE: 30000,  // ms to keep slot on disconnect

  // Lobby
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 10,

  // Fixed color palette — hex strings, no duplicates allowed
  PLAYER_COLORS: [
    '#e74c3c', // red
    '#3498db', // blue
    '#2ecc71', // green
    '#f39c12', // orange
    '#9b59b6', // purple
    '#1abc9c', // teal
    '#e91e63', // pink
    '#795548', // brown
    '#607d8b', // grey-blue
    '#f1c40f', // yellow
  ],

  // Game phases
  PHASE: {
    LOBBY:      'lobby',
    PLAYING:    'playing',
    MEETING:    'meeting',
    VOTE_REVEAL:'vote_reveal',
    END:        'end',
  },

  // Roles
  ROLE: {
    CREWMATE: 'crewmate',
    IMPOSTOR: 'impostor',
  },

  // Win reasons
  WIN: {
    TASKS_DONE:       'tasks_done',
    IMPOSTORS_EJECTED:'impostors_ejected',
    IMPOSTORS_OUTNUMBER:'impostors_outnumber',
    REACTOR:          'reactor_meltdown',
  },
};

// Allow both: browser (window.CONSTANTS) and Node (module.exports)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
} else {
  window.CONSTANTS = CONSTANTS;
}
