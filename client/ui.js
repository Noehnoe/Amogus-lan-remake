// ui.js — HUD, task modals, vote screen, chat (Phase 2+)
// Phase 1 stub.

// Screen switcher — called by main.js when game phase changes
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// Expose globally so main.js can call it
window.showScreen = showScreen;
