import { login, signUp } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';

// -----------------------------
// Hash‑basierter Mini‑Router
// -----------------------------
const routes = {
  login: renderLogin,
  register: renderRegister,
  dashboard: renderDashboard,
  scorer: renderScorer,
  stats: renderStats
};

window.addEventListener('hashchange', updateRoute);
updateRoute();

function updateRoute() {
  const hash = window.location.hash.slice(2) || 'login';
  (routes[hash] || routes.login)();
}

// --------------------------------------------------
// 1) LOGIN‑ & REGISTRIER‑FLOW  (unverändert)
// --------------------------------------------------
async function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="max-w-sm mx-auto">
      <h2 class="text-xl font-semibold mb-4 text-center">Login</h2>
      <form id="loginForm" class="flex flex-col gap-4">
        <input type="email" id="email" class="input" placeholder="E-Mail" required>
        <input type="password" id="password" class="input" placeholder="Passwort" required>
        <button class="btn">Login</button>
      </form>
      <p class="mt-4 text-center">
        Noch kein Konto? <a href="#/register" class="text-blue-500 underline">Registrieren</a>
      </p>
    </div>`;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await login({ email, password });
      location.hash = '#/dashboard';
    } catch (error) {
      alert(`Login fehlgeschlagen: ${error.message}`);
    }
  };
}

async function renderRegister() {
  document.getElementById('app').innerHTML = `
    <div class="max-w-sm mx-auto">
      <h2 class="text-xl font-semibold mb-4 text-center">Registrieren</h2>
      <form id="registerForm" class="flex flex-col gap-4">
        <input type="text" id="displayName" class="input" placeholder="Name" required>
        <input type="email" id="email" class="input" placeholder="E-Mail" required>
        <input type="password" id="password" class="input" placeholder="Passwort" required>
        <button class="btn">Registrieren</button>
      </form>
      <p class="mt-4 text-center">
        Schon ein Konto? <a href="#/login" class="text-blue-500 underline">Login</a>
      </p>
    </div>`;

  document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('displayName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await signUp({ email, password, displayName });
      alert('Registrierung erfolgreich! Bitte einloggen.');
      location.hash = '#/login';
    } catch (error) {
      alert(`Registrierung fehlgeschlagen: ${error.message}`);
    }
  };
}

// --------------------------------------------------
// 2) DASHBOARD  (unverändert)
// --------------------------------------------------
async function renderDashboard() { /* ... wie zuvor ... */ }

// --------------------------------------------------
// 3) NEU: SCORER‑MODUL (MVP)
// --------------------------------------------------
// Lokaler Zustand des gerade laufenden Legs / Matches
let currentBoard  = localStorage.getItem('bullseyer_board') || null;
let currentMatch  = null; // {id, p1_id, p2_id, p1, p2, ...}
let currentLeg    = null; // Instanz der Leg‑Klasse
let remainingP1   = 501;
let remainingP2   = 501;

async function renderScorer() {
  const app = document.getElementById('app');

  // 1) Board wählen (nur einmal pro Gerät)
  if (!currentBoard) {
    const boards = await fetchBoardsForToday();
    if (!boards.length) {
      app.innerHTML = '<p class="text-center mt-8">Für heute wurden noch keine Matches angelegt.</p>';
      return;
    }
    app.innerHTML = `
      <div class="max-w-sm mx-auto mt-8 flex flex-col gap-4">
        <h2 class="text-xl font-semibold text-center">Welches Board bist du?</h2>
        ${boards.map(b => `<button class="btn" data-board="${b}">${b}</button>`).join('')}
      </div>`;

    app.querySelectorAll('button[data-board]').forEach(btn => {
      btn.onclick = () => {
        currentBoard = btn.dataset.board;
        localStorage.setItem('bullseyer_board', currentBoard);
        renderScorer();
      };
    });
    return;
  }

  // 2) Wenn noch kein Match läuft → Liste offener Matches auf diesem Board
  if (!currentMatch) {
    const matches = await fetchOpenMatches(currentBoard);
    if (!matches.length) {
      app.innerHTML = `<div class="text-center mt-8">
        <p>Auf <strong>${currentBoard}</strong> sind alle Matches erledigt 🎉</p>
        <button class="btn mt-4" id="changeBoard">Anderes Board wählen</button>
      </div>`;
      document.getElementById('changeBoard').onclick = () => {
        localStorage.removeItem('bullseyer_board');
        currentBoard = null;
        renderScorer();
      };
      return;
    }

    app.innerHTML = `
      <h2 class="text-xl font-semibold text-center mt-6">Matches auf ${currentBoard}</h2>
      <div class="max-w-md mx-auto flex flex-col gap-2 mt-4" id="matchList"></div>`;

    const list = document.getElementById('matchList');
    matches.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'btn flex justify-between';
      btn.innerHTML = `<span>${m.p1.name} vs ${m.p2.name}</span><span>Start</span>`;
      btn.onclick = () => startMatch(m);
      list.appendChild(btn);
    });
    return;
  }

  // 3) Match läuft – Score‑Eingabe
  renderLiveScorer(app);
}

// ---------- Hilfsfunktionen ----------
async function fetchBoardsForToday() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('matches')
    .select('board')
    .eq('finished_at', null)
    .in('gameday_id', await todayGamedayIds())
    .neq('board', null);
  if (error) { console.error(error); return []; }
  return [...new Set(data.map(d => d.board))];
}

async function todayGamedayIds() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('gamedays')
    .select('id')
    .eq('date', today);
  if (error) { console.error(error); return []; }
  return data.map(d => d.id);
}

async function fetchOpenMatches(board) {
  const { data, error } = await supabase
    .from('matches')
    .select('*, p1:p1_id(name), p2:p2_id(name)')
    .eq('board', board)
    .is('finished_at', null)
    .order('created_at');
  if (error) { console.error(error); return []; }
  return data;
}

function startMatch(m) {
  currentMatch = m;
  remainingP1 = 501;
  remainingP2 = 501;
  currentLeg  = new Leg({
    legId: crypto.randomUUID(),
    doubleIn: false,
    doubleOut: true
  });
  renderScorer();
}

function renderLiveScorer(app) {
  const p1 = currentMatch.p1.name;
  const p2 = currentMatch.p2.name;

  app.innerHTML = `
    <div class="max-w-md mx-auto mt-6 flex flex-col gap-4">
      <h2 class="text-xl font-semibold text-center">${p1} vs ${p2}</h2>
      <div class="grid grid-cols-2 text-center text-lg">
        <div><strong id="remP1">${remainingP1}</strong><br>${p1}</div>
        <div><strong id="remP2">${remainingP2}</strong><br>${p2}</div>
      </div>
      <form id="throwForm" class="flex gap-2 justify-center">
        <input type="number" name="d1" class="input w-16" placeholder="D1" required />
        <input type="number" name="d2" class="input w-16" placeholder="D2" />
        <input type="number" name="d3" class="input w-16" placeholder="D3" />
        <button class="btn">OK</button>
      </form>
      <button id="legWon" class="btn bg-green-600 text-white hidden">Leg gewonnen – bestätigen</button>
    </div>`;

  const form = document.getElementById('throwForm');
  form.onsubmit = e => {
    e.preventDefault();
    const d1 = parseInt(form.d1.value || 0, 10);
    const d2 = parseInt(form.d2.value || 0, 10);
    const d3 = parseInt(form.d3.value || 0, 10);
    form.reset();

    const total = d1 + d2 + d3;
    // Einfacher alternierender Wurf – P1 startet immer
    const isP1Turn = currentLeg.scores.length % 2 === 0;
    const remaining = isP1Turn ? remainingP1 - total : remainingP2 - total;
    if (remaining < 0) {
      alert('Bust!');
      return; // Bust – Score bleibt gleich
    }

    currentLeg.addThrow({ playerId: isP1Turn ? currentMatch.p1_id : currentMatch.p2_id, darts: [d1, d2, d3] });
    if (isP1Turn) {
      remainingP1 = remaining;
      document.getElementById('remP1').textContent = remainingP1;
    } else {
      remainingP2 = remaining;
      document.getElementById('remP2').textContent = remainingP2;
    }

    if (remaining === 0) {
      document.getElementById('legWon').classList.remove('hidden');
    }
  };

  document.getElementById('legWon').onclick = async () => {
    const winnerId = remainingP1 === 0 ? currentMatch.p1_id : currentMatch.p2_id;
    const legRow = {
      id: currentLeg.id,
      match_id: currentMatch.id,
      leg_no: 1, // MVP: nur ein Leg
      starter: currentMatch.p1_id,
      start_score: 501,
      finish_darts: currentLeg.scores.length * 3,
      duration_s: currentLeg.durationSeconds,
      winner_id: winnerId
    };
    await supabase.from('legs').insert(legRow);
    await supabase.from('matches').update({ finished_at: new Date().toISOString() }).eq('id', currentMatch.id);

    alert('Leg gespeichert! Weiter zum nächsten Match.');
    currentMatch = null;
    currentLeg   = null;
    renderScorer();
  };
}

// --------------------------------------------------
// 4) STATISTIK‑PLATZHALTER
// --------------------------------------------------
function renderStats() {
  document.getElementById('app').innerHTML = '<h2 class="text-xl text-center mt-8">Statistiken (folgen später)</h2>';
}

