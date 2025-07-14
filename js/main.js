import { login, signUp, logout } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';
import { renderLiveScorer, resetLeg } from './livescoring.js';

const DEV = true;

// Auth-Listener aktivieren
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN')  window.location.hash = '#/dashboard';
  if (event === 'SIGNED_OUT') window.location.hash = '#/login';
});

// -----------------------------
// Mini-Router (#/login, #/dashboard, #/scorer, #/stats, #/livescorer)
// -----------------------------
window.onhashchange = () => {
  const page = window.location.hash || '#/login';
  if (page.startsWith('#/login'))      renderLogin();
  else if (page.startsWith('#/register')) renderRegister();
  else if (page.startsWith('#/dashboard')) renderDashboard();
  else if (page.startsWith('#/scorer'))   renderScorer();
  else if (page.startsWith('#/livescorer')) renderScorer(); // Livescorer zeigt das Live-Scoring
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
    <div id="openMatches" class="mt-6 max-w-md mx-auto">${openMatchesHtml}</div>
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
    div.className = 'cursor-pointer text-2xl text-center my-2';
    div.onclick = () => {
      const id = p.id; // <-- KEIN Number()!
      if (selectedPlayers.has(id)) {
        selectedPlayers.delete(id);
        div.classList.remove('text-blue-500');
      } else {
        selectedPlayers.add(id);
        div.classList.add('text-blue-500');
      }
    };
    playerListEl.appendChild(div); // <--- Das war vermutlich auch vergessen!
  }); // <--- Diese schließende Klammer MUSS hier hin!

  // 5) Form-Submit → Spieltag & Matches anlegen
  document.getElementById('cfgForm').onsubmit = async e => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"], button:not([type])');
    const defaultBtnText = submitBtn ? submitBtn.textContent : '';

    const { boSets, boLegs, doubleOut } = e.target.elements;

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

    const { error: matchErr } = await supabase
      .from('matches')
      .insert(
        validPairings.map(([p1, p2], i) => {
          const [a, b] = [p1, p2].sort(); // IDs sortieren für pair_key
          return {
            gameday_id: gd.id,
            p1_id: p1,
            p2_id: p2,
            best_of_sets: boS,
            best_of_legs: boL,
            double_out: doubleOut.checked,
            board: 1, // <-- Alle auf Board 1!
            pair_key: `${a}:${b}` // NEU: Eindeutige Paarung pro Spieltag
          };
        })
      );
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
  // Immer nur Board 1 zurückgeben, da alle Matches auf Board 1 angelegt werden
  return ['1'];
}

// Holt offene Matches für ein Board, optional mit Datum
async function fetchOpenMatches(board, withDate = false) {
  let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
  if (withDate) selectStr += ', gameday:gamedays(date)';
  const { data, error } = await supabase
    .from('matches')
    .select(selectStr)
    .eq('board', Number(board)) // <-- Board als Zahl vergleichen!
    .is('finished_at', null);
  console.log('fetchOpenMatches:', board, data, error); // Debug
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
