import { login, signUp, logout } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';

const DEV = true;

// Auth-Listener aktivieren
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN')  window.location.hash = '#/dashboard';
  if (event === 'SIGNED_OUT') window.location.hash = '#/login';
});

// -----------------------------
// Mini-Router (#/login, #/dashboard, #/scorer, #/stats)
// -----------------------------
window.onhashchange = () => {
  const page = window.location.hash || '#/login';
  if (page.startsWith('#/login'))      renderLogin();
  else if (page.startsWith('#/register')) renderRegister();
  else if (page.startsWith('#/dashboard')) renderDashboard();
  else if (page.startsWith('#/scorer'))   renderScorer();
  else if (page.startsWith('#/stats'))    renderStats();
  else renderLogin();
};

// Sofort aufrufen
window.onhashchange();

// --------------------------------------------------
// 1) LOGIN / REGISTRIEREN
// --------------------------------------------------
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="loginForm" class="max-w-sm mx-auto flex flex-col gap-4 mt-8">
      <input name="email" type="email" placeholder="E-Mail" class="input" required />
      <input name="pw" type="password" placeholder="Passwort" class="input" required />
      <button class="btn">Login</button>
      <p class="text-sm text-center">Noch kein Konto? <a href="#/register">Registrieren</a></p>
    </form>`;
  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const { email, pw: password } = e.target.elements;
    try {
      await login({ email: email.value.trim(), password: password.value });
      window.location.hash = '#/dashboard';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="regForm" class="max-w-sm mx-auto flex flex-col gap-4 mt-8">
      <input name="name" type="text" placeholder="Anzeigename" class="input" required />
      <input name="email" type="email" placeholder="E-Mail" class="input" required />
      <input name="pw" type="password" placeholder="Passwort" class="input" required />
      <button class="btn">Konto erstellen</button>
    </form>`;
  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault();
    const { name, email, pw: password } = e.target.elements;
    try {
      await signUp({
        email: email.value.trim(),
        password: password.value,
        options: { data: { name: name.value.trim() } }
      });
      alert('Bestätigungs‑Mail verschickt!');
      window.location.hash = '#/login';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

// --------------------------------------------------
// 2) DASHBOARD
// --------------------------------------------------
async function renderDashboard() {
  const app = document.getElementById('app');
  // 1) Lade-State anzeigen
  app.innerHTML = `
    <div class="relative">
      <button id="logoutBtn" class="absolute top-4 right-4">Logout</button>
      <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    </div>
    <p class="text-center mt-4">Lade Spieler…</p>
  `;
  // Logout-Handler
  document.getElementById('logoutBtn').onclick = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  // 2) Spieler aus Supabase holen
  const { data: players, error } = await supabase
    .from('users')
    .select('id,name')
    .order('name');
  if (error) {
    app.innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return;
  }

  // 3) Formular anzeigen
  app.innerHTML = `
    <div class="relative">
      <button id="logoutBtn3" class="absolute top-4 right-4">Logout</button>
      <h2 class="text-2xl text-center mt-8">Spieltag konfigurieren</h2>
    </div>
    <form id="cfgForm" class="max-w-md mx-auto mt-6 space-y-4">
      <div>
        <label class="block mb-1">Best of Sets</label>
        <input name="boSets" type="number" min="1" max="21" value="3" class="input w-full" />
      </div>
      <div>
        <label class="block mb-1">Best of Legs</label>
        <input name="boLegs" type="number" min="1" max="11" value="3" class="input w-full" />
      </div>
      <div>
        <label class="block mb-1">Double Out</label>
        <input name="doubleOut" type="checkbox" class="mr-2 align-middle" checked /> Double out nötig
      </div>
      <h3 class="text-lg mt-6 mb-2">Spieler (blau&nbsp;= gewählt)</h3>
      <div id="playerList" class="border rounded p-4 max-h-64 overflow-y-auto"></div>
      <button class="bg-green-500 hover:bg-green-600 text-white rounded-full w-full py-2 transition">
        Spieltag starten
      </button>
    </form>
  `;

  // Logout im Formular
  document.getElementById('logoutBtn3').onclick = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  // 4) Player-Divs anlegen (vertikal übereinander, klickbar, blau beim Klick)
  const selectedPlayers = new Set();
  const playerListEl = document.getElementById('playerList');
  playerListEl.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.textContent = p.name;
    div.className = 'cursor-pointer text-2xl text-center my-2';
    div.onclick = () => {
      if (selectedPlayers.has(p.id)) {
        selectedPlayers.delete(p.id);
        div.classList.remove('text-blue-500');
      } else {
        selectedPlayers.add(p.id);
        div.classList.add('text-blue-500');
      }
    };
    playerListEl.appendChild(div);
  });

  // 5) Form-Submit → Spieltag & Matches anlegen
  document.getElementById('cfgForm').onsubmit = async e => {
    e.preventDefault();
    const { boSets, boLegs, doubleOut } = e.target.elements;

    if (selectedPlayers.size < 2) {
      alert('Mindestens zwei Spieler auswählen');
      return;
    }

    const boS = parseInt(boSets.value, 10);
    const boL = parseInt(boLegs.value, 10);

    if (boS % 2 === 0 || boL % 2 === 0) {
      alert('Best‑of muss ungerade sein (1,3,5…)');
      return;
    }

    // 1) Spieltag speichern
    const { data: gd, error: gdErr } = await supabase
      .from('gamedays')
      .insert({ date: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (gdErr) { 
      alert(`Fehler beim Anlegen der Matches:\n${gdErr.message}`);
      return;
    }
    localStorage.setItem('bullseyer_gameday', gd.id);

    // Paarungen aus Round-Robin → nur Zweier-Arrays
    const pairings = generateRoundRobin([...selectedPlayers]).flat();

    // Filtere ungültige Paarungen raus (z.B. [id, null] oder [null, id])
    const validPairings = pairings.filter(([p1, p2]) => p1 && p2);

    console.log('SelectedPlayers:', [...selectedPlayers]);
    console.log('ValidPairings:', validPairings);

    const { error: matchErr } = await supabase
      .from('matches')
      .insert(
        validPairings.map(([p1, p2], i) => ({
          gameday_id: gd.id,
          p1_id: p1,
          p2_id: p2,
          best_of_sets: boS,
          best_of_legs: boL,
          double_out: doubleOut.checked,
          board: (i % 4) + 1
        }))
      );
    if (matchErr) {
      alert(`Fehler beim Anlegen der Matches:\n${matchErr.message}`);
      return;
    }

    // Nach erfolgreichem Anlegen weiterleiten:
    window.location.hash = '#/scorer';
  };
} // <-- Die schließende Klammer der Funktion steht jetzt korrekt!

// --------------------------------------------------
// 3) SCORER mit Sets & Legs & Turn Toggle
// --------------------------------------------------
let currentBoard = localStorage.getItem('bullseyer_board') || null;
let currentMatch = null;
let currentLeg = null;
let currentLegNo = 0;
let currentSetNo = 0;
let setsWon = { p1: 0, p2: 0 };
let remainingP1 = 501;
let remainingP2 = 501;
let currentPlayer = 'p1';

async function renderScorer() {
  const app = document.getElementById('app');

  // 1) Board-Auswahl
  if (!currentBoard) {
    const boards = await fetchBoardsForToday();
    if (!boards.length) { app.innerHTML = '<p class="text-center mt-8">Keine Spiele heute</p>'; return; }
    app.innerHTML = `<div class="max-w-sm mx-auto mt-8 space-y-4">
    ${boards.map(b => `<button class="btn w-full" data-board="${b}">Board ${b}</button>`).join('')}
</div>`;
    app.querySelectorAll('[data-board]').forEach(btn => btn.onclick = () => { currentBoard = btn.dataset.board; localStorage.setItem('bullseyer_board', currentBoard); renderScorer(); });
    return;
  }

  // 2) Match-Auswahl
  if (!currentMatch) {
    const matches = await fetchOpenMatches(currentBoard);
    if (!matches.length) { app.innerHTML = '<p class="text-center mt-8">Kein offenes Match</p>'; return; }
    app.innerHTML = `<div class="max-w-sm mx-auto mt-8 space-y-4">${matches.map(m => `<button class="btn w-full" data-mid="${m.id}">${m.p1.name} vs ${m.p2.name}</button>`).join('')}</div>`;
    app.querySelectorAll('[data-mid]').forEach(btn => btn.onclick = () => { const m = matches.find(x=>x.id === btn.dataset.mid); startMatch(m); });
    return;
  }

  // 3) Live-Scorer
  renderLiveScorer(app);
}

function startMatch(m) {
  currentMatch = m;
  currentSetNo = 1;
  currentLegNo = 1;
  setsWon = { p1: 0, p2: 0 };
  currentPlayer = 'p1';
  resetLeg();
  renderScorer();
}

function resetLeg() {
  remainingP1 = remainingP2 = 501;
  currentLeg = new Leg({ legId: crypto.randomUUID(), doubleIn: false, doubleOut: true });
}

function renderLiveScorer(app) {
  const p1 = currentMatch.p1.name,
        p2 = currentMatch.p2.name;
  const bestLeg = currentMatch.best_of_legs,
        bestSet = currentMatch.best_of_sets;
  const isP1Turn = currentPlayer === 'p1';

  app.innerHTML = `
    <div class="max-w-md mx-auto mt-6 space-y-4">
      <h2 class="text-xl text-center">${p1} vs ${p2}</h2>
      <div class="flex justify-center gap-4">
        <span>Set ${currentSetNo}/${bestSet}</span>
        <span>Leg ${currentLegNo}/${bestLeg}</span>
      </div>
      <div class="grid grid-cols-2 gap-8 mt-4 text-lg">
        <div class="text-left">
          <div class="flex items-center gap-1">
            <span id="legsP1" class="font-semibold">${setsWon.p1}</span>
            <span>${p1}</span>
          </div>
          <strong id="remP1">${remainingP1}</strong>
        </div>
        <div class="text-right">
          <strong id="remP2">${remainingP2}</strong><br>
          <div class="flex items-center gap-1 justify-end">
            <span>${p2}</span>
            <span id="legsP2" class="font-semibold">${setsWon.p2}</span>
          </div>
        </div>
      </div>
      <form id="throwForm" class="flex justify-center gap-2">
        <input type="number" name="score" class="input w-32 text-lg text-center" placeholder="Score" required />
        <button class="btn">OK</button>
      </form>
      <div class="flex justify-center gap-2">
        <button id="legWon" class="btn bg-green-600 text-white hidden">Leg gewonnen</button>
        <button id="setWon" class="btn bg-blue-600 text-white hidden">Set gewonnen</button>
        <button id="undoBtn" class="bg-red-500 hover:bg-red-600 text-white rounded-full py-1 px-3 transition ml-2">← Rückgängig</button>
      </div>
    </div>`;

  // Rückgängig-Handler: letzten Wurf entfernen
  document.getElementById('undoBtn').onclick = () => {
    const last = currentLeg.scores.pop();
    if (!last) return;
    currentPlayer = last.playerId === currentMatch.p1_id ? 'p1' : 'p2';
    if (currentPlayer === 'p1') {
      remainingP1 = currentLeg.currentScore(currentMatch.p1_id);
      document.getElementById('remP1').textContent = remainingP1;
    } else {
      remainingP2 = currentLeg.currentScore(currentMatch.p2_id);
      document.getElementById('remP2').textContent = remainingP2;
    }
    renderLiveScorer(app);
  };

  // Score eintragen
  document.getElementById('throwForm').onsubmit = e => {
    e.preventDefault();
    const sc = parseInt(e.target.score.value, 10);
    if (sc > 180) { alert('😡 Maximal 180 Punkte erlaubt!'); return; }
    e.target.reset();
    const prev = isP1Turn ? remainingP1 : remainingP2;
    const rem = prev - sc;
    if (rem < 0) { alert('Bust!'); return; }
    if (isP1Turn) { remainingP1 = rem; document.getElementById('remP1').textContent = rem; }
    else          { remainingP2 = rem; document.getElementById('remP2').textContent = rem; }
    currentLeg.addThrow({ playerId: isP1Turn ? currentMatch.p1_id : currentMatch.p2_id, darts: [sc] });
    if (rem === 0) {
      document.getElementById('legWon').classList.remove('hidden');
    } else {
      currentPlayer = isP1Turn ? 'p2' : 'p1';
      renderLiveScorer(app);
    }
  };

  // Leg gewonnen
  document.getElementById('legWon').onclick = () => {
    const win = remainingP1 === 0 ? 'p1' : 'p2';
    setsWon[win]++;
    document.getElementById('legsP1').textContent = setsWon.p1;
    document.getElementById('legsP2').textContent = setsWon.p2;

    saveLeg(currentSetNo, currentLegNo);
    document.getElementById('legWon').classList.add('hidden');

    if (setsWon.p1 > bestLeg / 2 || setsWon.p2 > bestLeg / 2 || currentLegNo >= bestLeg) {
      document.getElementById('setWon').classList.remove('hidden');
    } else {
      currentLegNo++;
      currentPlayer = 'p1';
      resetLeg();
      renderScorer();
    }
  };

  // Set gewonnen / Match beendet
  document.getElementById('setWon').onclick = async () => {
    if (setsWon.p1 > bestSet / 2 || setsWon.p2 > bestSet / 2 || currentSetNo >= bestSet) {
      alert('Match beendet!');
      await supabase
        .from('matches')
        .update({ finished_at: new Date().toISOString() })
        .eq('id', currentMatch.id);
      currentMatch = null;
      renderScorer();
    } else {
      currentSetNo++;
      currentLegNo = 1;
      setsWon = { p1: 0, p2: 0 };
      currentPlayer = 'p1';
      resetLeg();
      renderScorer();
    }
  };
}

// --------------------------------------------------
// Datenbank-Helper
// --------------------------------------------------
async function saveLeg(setNo, legNo) {
  await supabase.from('legs').insert({
    id: currentLeg.id,
    match_id: currentMatch.id,
    set_no: setNo,
    leg_no: legNo,
    starter: currentMatch.p1_id,
    start_score: 501,
    finish_darts: currentLeg.throwCount,
    duration_s: currentLeg.durationSeconds,
    winner_id: remainingP1 === 0 ? currentMatch.p1_id : currentMatch.p2_id
  });
}

async function fetchBoardsForToday() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: gs, error: gdErr } = 
    await supabase
    .from('gamedays')
    .select('id')
    .eq('date', today);
  if (gdErr) { console.error(gdErr); return []; }
  const ids = (gs || []).map(g => g.id);
  const { data: ms, error: mErr } = await supabase.from('matches').select('board').is('finished_at', null).in('gameday_id', ids);
  if (mErr) { console.error(mErr); return []; }
  return [...new Set(ms.map(m => m.board))];
}

async function fetchOpenMatches(board) {
  const gamedayId = localStorage.getItem('bullseyer_gameday');
  if (!gamedayId) {
    console.log('fetchOpenMatches:', { board, gamedayId });
    return [];
  }

  const boardNo = Number(board);            // ← String → Zahl
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*, p1:p1_id(name), p2:p2_id(name)')
    .eq('board', boardNo)                   // ← jetzt gleicher Typ
    .eq('gameday_id', gamedayId)
    .is('finished_at', null);
  if (error) { console.error(error); return []; }
  console.log('fetchOpenMatches:', { board, gamedayId, matches }); // <-- Hier siehst du die Matches!
  return matches;
}

function renderStats() {
  document.getElementById('app').innerHTML = '<p class="text-center mt-8">Statistik folgt…</p>';
}
