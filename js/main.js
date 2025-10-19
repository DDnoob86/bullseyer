import { login, signUp, logout } from './auth.js';
// ⚠️ MOCK-MODUS FÜR TESTS - Ändere zu './supabase.js' für echtes Backend
import { supabase } from './supabase-mock.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';
import { renderLiveScorer, resetLeg } from './livescoring.js';

const DEV = true;

// ⚠️ MOCK-MODUS: AUTO-LOGIN FÜR TESTS (überspringt Login-Page)
// Kommentar diese Zeilen aus, wenn du echtes Login willst
(async function autoLoginForTesting() {
  console.log('🧪 MOCK-MODUS: Auto-Login als Demo-User...');
  const demoUser = { id: 'demo-user-id', email: 'demo@test.com' };
  localStorage.setItem('mock_currentUser', JSON.stringify(demoUser));

  // Simuliere SIGNED_IN Event nach kurzer Verzögerung
  setTimeout(() => {
    if (!window.location.hash || window.location.hash === '#/login') {
      window.location.hash = '#/dashboard';
    }
  }, 100);
})();

// Auth-Listener aktivieren (wird im Mock-Modus nicht verwendet)
supabase.auth.onAuthStateChange((event, session) => {
  // Im Mock-Modus deaktiviert
  // if (event === 'SIGNED_IN')  window.location.hash = '#/dashboard';
  // if (event === 'SIGNED_OUT') window.location.hash = '#/login';
});

// -----------------------------
// Mini-Router (#/login, #/dashboard, #/scorer, #/stats, #/livescorer)
// -----------------------------
window.onhashchange = () => {
  const page = window.location.hash || '#/dashboard'; // ⚠️ MOCK: Direkt zu Dashboard statt Login
  if (page.startsWith('#/login'))      window.location.hash = '#/dashboard'; // ⚠️ MOCK: Login umleiten
  else if (page.startsWith('#/register')) window.location.hash = '#/dashboard'; // ⚠️ MOCK: Register umleiten
  else if (page.startsWith('#/dashboard')) renderDashboard();
  else if (page.startsWith('#/scorer'))   renderScorer();
  else if (page.startsWith('#/livescorer')) renderScorer(); // Livescorer zeigt das Live-Scoring
  else if (page.startsWith('#/stats'))    renderStats();
  else renderDashboard(); // ⚠️ MOCK: Default zu Dashboard
};

// Sofort aufrufen
window.onhashchange();

// --------------------------------------------------
// 1) LOGIN / REGISTRIEREN
// --------------------------------------------------
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="max-w-sm mx-auto mt-8">
      <div class="bg-yellow-100 border-2 border-yellow-400 rounded p-3 mb-4 text-sm">
        🧪 <strong>MOCK-MODUS:</strong> Login mit beliebigem Namen (z.B. "Alice")
      </div>
      <form id="loginForm" class="flex flex-col gap-4">
        <input name="email" type="text" placeholder="Name (z.B. Alice, Bob, Charlie, Diana)" class="input" required />
        <input name="pw" type="password" placeholder="Passwort (egal)" class="input" required />
        <button class="btn">Login</button>
        <p class="text-sm text-center">Noch kein Konto? <a href="#/register">Registrieren</a></p>
      </form>
    </div>`;
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
    <div class="max-w-sm mx-auto mt-8">
      <div class="bg-yellow-100 border-2 border-yellow-400 rounded p-3 mb-4 text-sm">
        🧪 <strong>MOCK-MODUS:</strong> Erstelle einen Account mit beliebigem Namen
      </div>
      <form id="regForm" class="flex flex-col gap-4">
        <input name="name" type="text" placeholder="Spielername (z.B. Max)" class="input" required />
        <input name="email" type="text" placeholder="Name nochmal (egal)" class="input" required />
        <input name="pw" type="password" placeholder="Passwort (egal)" class="input" required />
        <button class="btn">Konto erstellen</button>
        <p class="text-sm text-center"><a href="#/login">Zurück zum Login</a></p>
      </form>
    </div>`;
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
    <div id="openMatches" class="mt-6"></div>
  `;
  // Logout-Handler
  document.getElementById('logoutBtn').onclick = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  // NEU: Offene Spiele mit Datum anzeigen
  let openMatches = [];
  let openErr = null;
  try {
    const res = await supabase
      .from('matches')
      .select('id, finished_at, gameday_id, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name), gameday:gamedays(date)')
      .is('finished_at', null)
      .order('gameday_id', { ascending: false });
    openMatches = res.data || [];
    openErr = res.error;
  } catch (e) {
    openErr = e;
    openMatches = [];
  }
  if (!openErr && openMatches && openMatches.length) {
    document.getElementById('openMatches').innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg">Offene Spiele</h3>
        <button id="gotoScorerBtn" class="btn btn-sm bg-blue-600 text-white flex items-center gap-1">
          Zu den Matches
          <span aria-hidden="true">&#8594;</span>
        </button>
      </div>
      <ul class="space-y-1">
        ${openMatches.map(m => `<li class="border rounded p-2 flex justify-between items-center">
          <span>${m.p1?.name || '?'} vs ${m.p2?.name || '?'}<br><span class="text-xs text-gray-500">${m.gameday?.date || ''}</span></span>
          <span class="text-xs">Board ${m.board}</span>
        </li>`).join('')}
      </ul>
    `;
    // Button-Handler: Wechselt zur Scorer-Seite
    document.getElementById('gotoScorerBtn').onclick = () => {
      window.location.hash = '#/scorer';
    };
  }

  // 2) Spieler aus Supabase holen
  const { data: players, error } = await supabase
    .from('users')
    .select('id,name')
    .order('name');
  if (error) {
    app.innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return;
  }

  // 3) Offene Spiele HTML vorbereiten
  let openMatchesHtml = '';
  openMatchesHtml = `
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-lg">Offene Spiele</h3>
      <button id="gotoScorerBtn" class="btn btn-sm bg-blue-600 text-white flex items-center gap-1">
        Zu den Matches
        <span aria-hidden="true">&#8594;</span>
      </button>
    </div>
    <ul class="space-y-1">
      ${(openMatches && openMatches.length) ? openMatches.map(m => `<li class="border rounded p-2 flex justify-between items-center">
        <span>${m.p1?.name || '?'} vs ${m.p2?.name || '?'}<br><span class="text-xs text-gray-500">${m.gameday?.date || ''}</span></span>
        <span class="text-xs">Board ${m.board}</span>
      </li>`).join('') : '<li class="text-center text-gray-400 py-2">Keine offenen Spiele</li>'}
    </ul>
  `;

  // 4) Formular anzeigen (offene Spiele werden jetzt UNTER dem Button angezeigt)
  app.innerHTML = `
    <div class="max-w-6xl mx-auto p-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-800">🎯 Bullseyer Dashboard</h1>
        <button id="logoutBtn3" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all transform hover:scale-105">Logout</button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Offene Matches (links) -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-xl shadow-xl border-4 border-emerald-400 p-6">
            <h2 class="text-2xl font-bold text-emerald-800 mb-4 flex items-center gap-2">
              <span>🎲</span> Offene Matches
            </h2>
            ${(openMatches && openMatches.length) ? `
              <div class="space-y-3 mb-4">
                ${openMatches.map(m => `
                  <div class="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-center">
                      <div>
                        <div class="font-semibold text-gray-800">${m.p1?.name || '?'} <span class="text-emerald-600">vs</span> ${m.p2?.name || '?'}</div>
                        <div class="text-xs text-gray-600 mt-1">${m.gameday?.date || ''}</div>
                      </div>
                      <div class="bg-emerald-600 text-white px-3 py-1 rounded-full text-sm font-bold">Board ${m.board}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
              <button id="gotoScorerBtn" class="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">
                Matches starten →
              </button>
            ` : '<div class="text-center text-gray-400 py-8">Keine offenen Matches</div>'}
          </div>
        </div>

        <!-- Spieltag konfigurieren (rechts) -->
    <form id="cfgForm" class="lg:col-span-2">
      <div class="bg-white rounded-xl shadow-xl border-4 border-rose-400 p-6">
        <h2 class="text-2xl font-bold text-rose-800 mb-6 flex items-center gap-2">
          <span>⚙️</span> Neuer Spieltag
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label class="block mb-2 text-sm font-semibold text-gray-700">Best of Sets</label>
            <input name="boSets" type="number" min="1" max="21" value="3" class="w-full px-4 py-3 border-2 border-rose-300 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition text-lg font-semibold" />
          </div>
          <div>
            <label class="block mb-2 text-sm font-semibold text-gray-700">Best of Legs</label>
            <input name="boLegs" type="number" min="1" max="11" value="3" class="w-full px-4 py-3 border-2 border-rose-300 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition text-lg font-semibold" />
          </div>
        </div>

        <div class="mb-6">
          <label class="flex items-center gap-3 cursor-pointer bg-rose-50 border-2 border-rose-300 rounded-lg p-4 hover:bg-rose-100 transition">
            <input name="doubleOut" type="checkbox" class="w-5 h-5 text-rose-600 border-2 border-rose-400 rounded focus:ring-2 focus:ring-rose-200" checked />
            <span class="text-gray-800 font-semibold">Double Out aktivieren</span>
          </label>
        </div>
        <div class="mb-6">
          <label class="block mb-2 text-sm font-semibold text-gray-700">Anzahl Boards</label>
          <select name="numBoards" class="w-full px-4 py-3 border-2 border-rose-300 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition text-lg font-semibold bg-white">
            <option value="1">1 Board</option>
            <option value="2">2 Boards</option>
            <option value="3">3 Boards</option>
            <option value="4">4 Boards</option>
            <option value="6">6 Boards</option>
            <option value="8">8 Boards</option>
          </select>
          <p class="text-xs text-gray-500 mt-2">Matches werden gleichmäßig auf Boards verteilt</p>
        </div>

        <div class="mb-6">
          <h3 class="text-lg font-bold text-gray-800 mb-3">Spieler auswählen</h3>
          <div id="playerList" class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-4 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300 rounded-lg"></div>
          <p class="text-xs text-gray-500 mt-2">💡 Anklicken zum Auswählen (wird blau)</p>
        </div>

        <button type="submit" class="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">
          🎯 Spieltag starten
        </button>
      </div>
    </form>
      </div>
    </div>
  `;

  // Button-Handler: Wechselt zur Scorer-Seite (nach dem Render!)
  if (openMatchesHtml) {
    const btn = document.getElementById('gotoScorerBtn');
    if (btn) btn.onclick = () => { window.location.hash = '#/scorer'; };
  }

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
    div.className = 'cursor-pointer text-center py-3 px-4 bg-white border-2 border-gray-300 rounded-lg hover:border-blue-400 hover:shadow-md transition font-semibold text-gray-800';
    div.onclick = () => {
      const id = p.id; // <-- KEIN Number()!
      if (selectedPlayers.has(id)) {
        selectedPlayers.delete(id);
        div.classList.remove('text-blue-500', 'border-blue-600', 'bg-blue-50');
      } else {
        selectedPlayers.add(id);
        div.classList.add('text-blue-500', 'border-blue-600', 'bg-blue-50');
      }
    };
    playerListEl.appendChild(div); // <--- Das war vermutlich auch vergessen!
  }); // <--- Diese schließende Klammer MUSS hier hin!

  // 5) Form-Submit → Spieltag & Matches anlegen
  document.getElementById('cfgForm').onsubmit = async e => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"], button:not([type])');
    const defaultBtnText = submitBtn ? submitBtn.textContent : '';

    const { boSets, boLegs, doubleOut, numBoards } = e.target.elements;

    if (selectedPlayers.size < 2) {
      if (submitBtn) {
        submitBtn.textContent = 'Mindestens zwei Spieler wählen!';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 3000);
      } else {
        alert('Mindestens zwei Spieler auswählen');
      }
      return;
    }

    const boS = parseInt(boSets.value, 10);
    const boL = parseInt(boLegs.value, 10);

    if (boS % 2 === 0 || boL % 2 === 0) {
      if (submitBtn) {
        submitBtn.textContent = 'Best-of muss ungerade sein!';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 3000);
      } else {
        alert('Best‑of muss ungerade sein (1,3,5…)');
      }
      return;
    }

    // 1) Spieltag speichern
    const { data: gd, error: gdErr } = await supabase
      .from('gamedays')
      .insert({ date: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (gdErr) { 
      if (submitBtn) {
        submitBtn.textContent = 'Fehler beim Anlegen des Spieltags';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 4000);
      } else {
        alert(`Fehler beim Anlegen der Matches:\n${gdErr.message}`);
      }
      return;
    }
    localStorage.setItem('bullseyer_gameday', gd.id);

    // Paarungen aus Round-Robin → nur Zweier-Arrays
    const pairings = generateRoundRobin([...selectedPlayers]);
    console.log('Pairings aus generateRoundRobin:', pairings);

    // Filtere ungültige Paarungen raus (z.B. [id, null] oder [null, id])
    const validPairings = pairings.filter(([p1, p2]) => p1 && p2);

    // NEU: Prüfe, ob für den Tag bereits Paarungen existieren (egal ob offen oder beendet)
    const { data: matchesToday, error: matchesTodayErr } = await supabase
      .from('matches')
      .select('p1_id, p2_id, gameday_id')
      .in('gameday_id', [gd.id]);
    if (matchesTodayErr) {
      if (submitBtn) {
        submitBtn.textContent = 'Fehler beim Prüfen der Paarungen';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 4000);
      } else {
        alert('Fehler beim Prüfen auf bestehende Paarungen: ' + matchesTodayErr.message);
      }
      return;
    }
    // Vergleiche beide Richtungen (p1-p2 und p2-p1)
    const alreadyExists = validPairings.filter(([p1, p2]) =>
      matchesToday.some(m => (m.p1_id === p1 && m.p2_id === p2) || (m.p1_id === p2 && m.p2_id === p1))
    );
    if (alreadyExists.length) {
      if (submitBtn) {
        submitBtn.textContent = 'Spielerpaarungen schon angelegt!';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 5000);
      } else {
        alert('Für folgende Paarungen existiert heute bereits ein Match (offen oder beendet):\n' +
          alreadyExists.map(([p1, p2]) => `${players.find(x=>x.id===p1)?.name || p1} vs ${players.find(x=>x.id===p2)?.name || p2}`).join('\n') +
          '\nJede Paarung darf pro Spieltag nur einmal existieren!');
      }
      return;
    }

    const boards = parseInt(numBoards.value, 10) || 1;

    const matchesToInsert = validPairings.map(([p1, p2], i) => {
      const [a, b] = [p1, p2].sort(); // IDs sortieren für pair_key
      // Verteile Matches gleichmäßig auf Boards (Round-Robin)
      const boardNum = (i % boards) + 1;
      return {
        gameday_id: gd.id,
        p1_id: p1,
        p2_id: p2,
        best_of_sets: boS,
        best_of_legs: boL,
        double_out: doubleOut.checked,
        board: boardNum, // Dynamische Board-Zuweisung
        pair_key: `${a}:${b}`, // NEU: Eindeutige Paarung pro Spieltag
        finished_at: null, // Explizit auf null setzen für offene Matches
        winner_id: null
      };
    });

    console.log('[DEBUG] Creating matches:', matchesToInsert);
    console.log('[DEBUG] Gameday ID:', gd.id);
    console.log('[DEBUG] Number of boards:', boards);

    const { error: matchErr } = await supabase
      .from('matches')
      .insert(matchesToInsert);
    if (matchErr) {
      if (submitBtn) {
        // Prüfe auf Unique-Fehler (doppelte Paarung)
        if (matchErr.message && matchErr.message.includes('duplicate key value') && matchErr.message.includes('pair_key')) {
          submitBtn.textContent = 'Spielerpaarungen schon angelegt!';
          submitBtn.classList.add('bg-red-600', 'hover:bg-red-700');
          setTimeout(() => {
            submitBtn.textContent = defaultBtnText;
            submitBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
          }, 5000);
        } else {
          submitBtn.textContent = 'Fehler beim Anlegen der Matches!';
          submitBtn.classList.add('bg-red-600', 'hover:bg-red-700');
          setTimeout(() => {
            submitBtn.textContent = defaultBtnText;
            submitBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
          }, 4000);
        }
      } else {
        alert(`Fehler beim Anlegen der Matches:\n${matchErr.message}`);
      }
      return;
    }

    // Nach erfolgreichem Anlegen weiterleiten:
    window.location.hash = '#/scorer'; // Erst in die Matchauswahl
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
let bullfinish = false;
let currentLegSaved = false; // NEU: Flag, ob das aktuelle Leg schon gespeichert wurde

async function renderScorer() {
  const app = document.getElementById('app');

  // Board-Auswahl immer anzeigen
  const boards = await fetchBoardsForToday();
  if (!boards.length) {
    app.innerHTML = '<p class="text-center mt-8">Keine Spiele heute</p>';
    return;
  }

  // Aktuelles Board aus localStorage oder erstes Board als Default
  if (!currentBoard || !boards.includes(String(currentBoard))) { // <-- Vergleich als String!
    currentBoard = boards[0];
    localStorage.setItem('bullseyer_board', currentBoard);
  }

  // Board-Auswahl-Buttons
  app.innerHTML = `
    <div class="max-w-sm mx-auto mt-8 space-y-4">
      <div class="flex gap-2 justify-center mb-4">
        ${boards.map(b => `
          <button class="btn ${String(b) == String(currentBoard) ? 'bg-blue-600 text-white' : ''}" data-board="${b}">
            Board ${b}
          </button>
        `).join('')}
      </div>
      <div class="flex justify-between items-center mb-4">
        <button id="backToDashboard" class="btn btn-sm bg-gray-400 hover:bg-gray-500 text-white">← Zurück</button>
      </div>
      <div id="scorerContent"></div>
    </div>
  `;

  // Zurück-Button Handler
  document.getElementById('backToDashboard').onclick = () => {
    currentMatch = null; // <--- Wichtig: Match-State zurücksetzen!
    localStorage.removeItem('bullseyer_currentMatchId'); // Match-ID aus localStorage entfernen
    window.location.hash = '#/dashboard';
  };

  // Board-Wechsel-Handler
  app.querySelectorAll('[data-board]').forEach(btn => btn.onclick = () => {
    currentBoard = String(btn.dataset.board); // <-- Board als String speichern!
    localStorage.setItem('bullseyer_board', currentBoard);
    // State zurücksetzen beim Board-Wechsel
    currentMatch = null;
    localStorage.removeItem('bullseyer_currentMatchId');
    currentLeg = null;
    currentLegNo = 0;
    currentSetNo = 0;
    setsWon = { p1: 0, p2: 0 };
    remainingP1 = 501;
    remainingP2 = 501;
    currentPlayer = 'p1';
    renderScorer();
  });

  // Prüfe, ob ein Match aktiv ist (aus localStorage)
  if (!currentMatch) {
    const matchId = localStorage.getItem('bullseyer_currentMatchId');
    if (matchId) {
      // Hole offene Matches für das aktuelle Board
      const matches = await fetchOpenMatches(currentBoard, true);
      const m = matches.find(x => String(x.id) === String(matchId));
      if (m) {
        currentMatch = m;
        currentSetNo = 1;
        currentLegNo = 1;
        setsWon = { p1: 0, p2: 0 };
        currentPlayer = 'p1';
        remainingP1 = 501;
        remainingP2 = 501;
        bullfinish = false;
        currentLegSaved = false;
        localStorage.setItem('bullseyer_currentMatchId', m.id); // <-- Korrigiert: m.id statt data.id
        currentLeg = resetLeg();
        window.location.hash = '#/livescorer'; // Route für Livescorer setzen
        // renderScorer(); // ENTFERNT: Hash-Change übernimmt das Rendern
      } else {
        // Falls das Match nicht mehr existiert, entferne die ID
        localStorage.removeItem('bullseyer_currentMatchId');
      }
    }
  }

  // Wenn ein Match aktiv ist, direkt das Live-Scoring anzeigen
  if (currentMatch) {
    // Spielernamen ergänzen, falls sie fehlen
    if (!currentMatch.p1_name) {
      currentMatch.p1_name = currentMatch.p1?.name || '[Spieler 1 fehlt]';
    }
    if (!currentMatch.p2_name) {
      currentMatch.p2_name = currentMatch.p2?.name || '[Spieler 2 fehlt]';
    }
    renderLiveScorer({
      app,
      currentMatch,
      currentSetNo,
      bestSet: currentMatch.best_of_sets,
      currentLegNo,
      bestLeg: currentMatch.best_of_legs,
      setsWon,
      currentPlayer,
      remainingP1,
      remainingP2,
      isP1Turn: currentPlayer === 'p1',
      bullfinish,
      currentLeg,
      currentLegSaved,
      saveLegFn: (...args) => saveLeg(currentMatch, currentLeg, ...args, remainingP1, bullfinish),
      resetLegFn: () => {
        currentLeg = resetLeg(currentMatch, currentSetNo, currentLegNo);
        return currentLeg;
      },
      updateStateFn: (updates) => {
        // State-Änderungen aus livescoring.js übernehmen
        if (updates) {
          if ('currentMatch' in updates) currentMatch = updates.currentMatch;
          if ('currentSetNo' in updates) currentSetNo = updates.currentSetNo;
          if ('currentLegNo' in updates) currentLegNo = updates.currentLegNo;
          if ('setsWon' in updates) setsWon = updates.setsWon;
          if ('currentPlayer' in updates) currentPlayer = updates.currentPlayer;
          if ('remainingP1' in updates) remainingP1 = updates.remainingP1;
          if ('remainingP2' in updates) remainingP2 = updates.remainingP2;
          if ('bullfinish' in updates) bullfinish = updates.bullfinish;
          if ('currentLeg' in updates) currentLeg = updates.currentLeg;
          if ('currentLegSaved' in updates) currentLegSaved = updates.currentLegSaved;
        }
      }
    });
    return;
  }

  // 2) Match-Auswahl
  const scorerContent = document.getElementById('scorerContent'); // <-- jetzt nach app.innerHTML!
  // NEU: Offene Matches mit Datum anzeigen
  const matches = await fetchOpenMatches(currentBoard, true); // true = mit Datum
  console.log('Matches für Board', currentBoard, matches); // Debug: Zeige geladene Matches
  if (!matches.length) {
    scorerContent.innerHTML = '<p class="text-center mt-8">Kein offenes Match</p>';
    return;
  }
  scorerContent.innerHTML = matches.map(m =>
    `<button type="button" class="btn w-full mb-2 flex flex-col items-start bg-blue-200 text-blue-900 hover:bg-blue-300 border-blue-300 border-2 rounded-lg py-3 px-4 transition" data-mid="${m.id}">
      <span class="font-semibold text-lg">${m.p1.name}&nbsp;vs&nbsp;${m.p2.name}</span>
      <span class="text-xs text-blue-700">${m.gameday?.date || ''}</span>
    </button>`
  ).join('');
  // Event-Delegation für Touch/Click: Nur noch click-Event (iPad/iOS Fix)
  let matchSelectLock = false;
  function handleMatchSelect(e) {
    e.preventDefault();
    e.stopPropagation();
    if (matchSelectLock) return;
    matchSelectLock = true;
    setTimeout(() => matchSelectLock = false, 400); // Doppelauslösung verhindern
    const btn = e.target.closest('button[data-mid]');
    if (!btn) return;
    const m = matches.find(x => String(x.id).trim() === String(btn.dataset.mid).trim());
    if (m) startMatch(m);
  }
  scorerContent.addEventListener('click', handleMatchSelect);
}

function startMatch(m) {
  // Matchdaten inkl. Spielernamen aus Supabase nachladen
  (async () => {
    const { data, error } = await supabase
      .from('matches')
      .select(`*, p1:users!matches_p1_id_fkey(id, name), p2:users!matches_p2_id_fkey(id, name)`)
      .eq('id', m.id)
      .single();
    if (error || !data) {
      alert('Fehler beim Laden des Matches!');
      return;
    }
    // Spielernamen ins Match-Objekt kopieren
    data.p1_name = data.p1?.name || '[Spieler 1 fehlt]';
    data.p2_name = data.p2?.name || '[Spieler 2 fehlt]';
    currentMatch = data;
    currentSetNo = 1;
    currentLegNo = 1;
    setsWon = { p1: 0, p2: 0 };
    currentPlayer = 'p1';
    remainingP1 = 501;
    remainingP2 = 501;
    bullfinish = false;
    currentLegSaved = false;
    localStorage.setItem('bullseyer_currentMatchId', data.id); // Match-ID persistieren
    currentLeg = resetLeg();
    window.location.hash = '#/livescorer'; // Route für Livescorer setzen
    // renderScorer(); // ENTFERNT: Hash-Change übernimmt das Rendern
  })();
}

// --------------------------------------------------
// Datenbank-Helper
// --------------------------------------------------
async function fetchBoardsForToday() {
  // Hole alle Boards mit offenen Matches vom heutigen Spieltag
  const { data, error } = await supabase
    .from('matches')
    .select('board')
    .is('finished_at', null);

  if (error) {
    console.error('Fehler beim Laden der Boards:', error);
    return ['1']; // Fallback
  }

  if (!data || data.length === 0) {
    return ['1']; // Default: Board 1
  }

  // Extrahiere unique Boards und sortiere
  const boards = [...new Set(data.map(m => String(m.board)))].sort((a, b) => Number(a) - Number(b));
  return boards.length > 0 ? boards : ['1'];
}

// Holt offene Matches für ein Board, optional mit Datum
async function fetchOpenMatches(board, withDate = false) {
  console.log('[DEBUG] fetchOpenMatches called with board:', board, 'type:', typeof board);
  let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
  if (withDate) selectStr += ', gameday:gamedays(date)';
  const { data, error } = await supabase
    .from('matches')
    .select(selectStr)
    .eq('board', Number(board)) // <-- Board als Zahl vergleichen!
    .is('finished_at', null);
  console.log('[DEBUG] fetchOpenMatches result:', {
    board,
    dataCount: data?.length || 0,
    data,
    error
  });
  if (data?.length > 0) {
    console.log('[DEBUG] First match:', data[0]);
    console.log('[DEBUG] Player names:', data[0].p1, data[0].p2);
  }
  return data || [];
}

function renderNav() {
  const app = document.getElementById('app');
  if (!app) return;
  const nav = document.createElement('nav');
  nav.className = 'flex justify-center gap-4 mb-4';
  nav.innerHTML = `
    <button id="navDashboard" class="btn">Dashboard</button>
    <button id="navScorer" class="btn">Scorer</button>
    <button id="navStats" class="btn">Statistik</button>
  `;
  app.parentNode.insertBefore(nav, app);
  document.getElementById('navDashboard').onclick = () => window.location.hash = '#/dashboard';
  document.getElementById('navScorer').onclick = () => window.location.hash = '#/scorer';
  document.getElementById('navStats').onclick = () => window.location.hash = '#/stats';
}

function renderStats() {
  // NEU: Statistik aus Tabelle legs und throws
  document.getElementById('app').innerHTML = '<p class="text-center mt-8">Lade Statistik…</p>';
  renderNav();
  loadStats();
}

async function loadStats() {
  // Highscore (Wurf >= 101), Highfinish (180), Shortleg (<= 18 Darts)
  let html = '<h2 class="text-2xl text-center mt-8">Statistik</h2>';
  // Highscores
  const { data: throws, error: throwsErr } = await supabase
    .from('throws')
    .select('player_id, score')
    .gte('score', 101);
  if (throwsErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Highscores: ' + throwsErr.message + '</p>';
    return;
  }
  // Highfinishes
  const { data: finishes, error: finishErr } = await supabase
    .from('throws')
    .select('player_id, score')
    .eq('score', 180);
  if (finishErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Highfinishes: ' + finishErr.message + '</p>';
    return;
  }
  // Shortlegs (Legs mit <= 18 Darts)
  const { data: shortlegs, error: shortErr } = await supabase
    .from('legs')
    .select('winner_id, finish_darts')
    .lte('finish_darts', 18);
  if (shortErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Shortlegs: ' + shortErr.message + '</p>';
    return;
  }
  // 3-Dart-Average pro Spieler berechnen
  const { data: allThrows, error: allThrowsErr } = await supabase
    .from('throws')
    .select('player_id, score');
  if (allThrowsErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Würfe: ' + allThrowsErr.message + '</p>';
    return;
  }
  // Spieler laden
  const { data: players, error: playersErr } = await supabase
    .from('users')
    .select('id, name');
  if (playersErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Spieler: ' + playersErr.message + '</p>';
    return;
  }
  // Durchschnitt berechnen
  const playerStats = {};
  allThrows.forEach(t => {
    if (!playerStats[t.player_id]) playerStats[t.player_id] = { sum: 0, count: 0 };
    playerStats[t.player_id].sum += t.score;
    playerStats[t.player_id].count++;
  });
  html += `<div class="mt-6">
    <h3 class="text-lg mb-2">3-Dart-Average</h3>
    <table class="w-full text-left mb-4">
      <thead><tr><th class="pr-2">Spieler</th><th>Ø</th></tr></thead>
      <tbody>
        ${players.map(p => {
          const s = playerStats[p.id];
          const avg = s && s.count ? (s.sum / s.count * 3).toFixed(2) : '-';
          return `<tr><td class="pr-2">${p.name}</td><td>${avg}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <h3 class="text-lg mb-2">Highscores (Wurf ≥ 101)</h3>
    <p>${throws.length} Highscores</p>
    <h3 class="text-lg mt-4 mb-2">Highfinishes (180)</h3>
    <p>${finishes.length} Highfinishes</p>
    <h3 class="text-lg mt-4 mb-2">Shortlegs (≤ 18 Darts)</h3>
    <p>${shortlegs.length} Shortlegs</p>
  </div>`;
  document.getElementById('app').innerHTML = html;
}
