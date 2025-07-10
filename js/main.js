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
    <div id="openMatches" class="mt-6"></div>
  `;
  // Logout-Handler
  document.getElementById('logoutBtn').onclick = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  // NEU: Offene Spiele mit Datum anzeigen
  const { data: openMatches, error: openErr } = await supabase
    .from('matches')
    .select('id, finished_at, gameday_id, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name), gameday:gamedays(date)')
    .is('finished_at', null)
    .order('gameday_id', { ascending: false });
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
  if (!currentBoard || !boards.includes(currentBoard)) {
    currentBoard = boards[0];
    localStorage.setItem('bullseyer_board', currentBoard);
  }

  // Board-Auswahl-Buttons
  app.innerHTML = `
    <div class="max-w-sm mx-auto mt-8 space-y-4">
      <div class="flex gap-2 justify-center mb-4">
        ${boards.map(b => `
          <button class="btn ${b == currentBoard ? 'bg-blue-600 text-white' : ''}" data-board="${b}">
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
    window.location.hash = '#/dashboard';
  };

  // Board-Wechsel-Handler
  app.querySelectorAll('[data-board]').forEach(btn => btn.onclick = () => {
    currentBoard = btn.dataset.board;
    localStorage.setItem('bullseyer_board', currentBoard);
    // State zurücksetzen beim Board-Wechsel
    currentMatch = null;
    currentLeg = null;
    currentLegNo = 0;
    currentSetNo = 0;
    setsWon = { p1: 0, p2: 0 };
    remainingP1 = 501;
    remainingP2 = 501;
    currentPlayer = 'p1';
    renderScorer();
  });

  // Wenn ein Match aktiv ist, direkt das Live-Scoring anzeigen
  if (currentMatch) {
    renderLiveScorer(app);
    return;
  }

  // 2) Match-Auswahl
  const scorerContent = document.getElementById('scorerContent');
  // NEU: Offene Matches mit Datum anzeigen
  const matches = await fetchOpenMatches(currentBoard, true); // true = mit Datum
  if (!matches.length) {
    scorerContent.innerHTML = '<p class="text-center mt-8">Kein offenes Match</p>';
    return;
  }
  scorerContent.innerHTML = matches.map(m =>
    `<button class="btn w-full mb-2 flex flex-col items-start" data-mid="${m.id}">
      <span>${m.p1.name}&nbsp;vs&nbsp;${m.p2.name}</span>
      <span class="text-xs text-gray-500">${m.gameday?.date || ''}</span>
    </button>`
  ).join('');
  // Event-Delegation für Touch/Click: Funktioniert jetzt auf allen Geräten (iPad/iOS Fix)
  let matchSelectLock = false;
  function handleMatchSelect(e) {
    if (matchSelectLock) return;
    const btn = e.target.closest('button[data-mid]');
    if (!btn) return;
    const m = matches.find(x => String(x.id).trim() === String(btn.dataset.mid).trim());
    if (m) startMatch(m);
    else alert('Match nicht gefunden!');
    matchSelectLock = true;
    setTimeout(() => { matchSelectLock = false; }, 300);
  }
  scorerContent.addEventListener('pointerdown', handleMatchSelect);
  scorerContent.addEventListener('click', function(e) {
    // Doppelauslösung verhindern
    if (matchSelectLock) return;
    handleMatchSelect(e);
  });
}

function startMatch(m) {
  currentMatch = m;
  currentSetNo = 1;
  currentLegNo = 1;
  setsWon = { p1: 0, p2: 0 };
  currentPlayer = 'p1';
  resetLeg();
  renderScorer(); // Zeigt jetzt direkt das Live-Scoring, weil currentMatch gesetzt ist
}

function resetLeg() {
  remainingP1 = remainingP2 = 501;
  currentLeg = new Leg({ legId: crypto.randomUUID(), doubleIn: false, doubleOut: true });
  bullfinish = false;
  currentLegSaved = false;
  // Leg sofort mit Minimaldaten in DB anlegen, damit Foreign Key für throws existiert
  (async () => {
    try {
      const { error } = await supabase.from('legs').insert({
        id: currentLeg.id,
        match_id: currentMatch?.id || null,
        set_no: currentSetNo || 1,
        leg_no: currentLegNo || 1,
        starter: currentMatch?.p1_id || null,
        start_score: 501
      });
      if (error && !String(error.message).includes('duplicate key')) {
        console.error('Fehler beim Anlegen des Legs (resetLeg):', error);
      } else {
        currentLegSaved = true;
      }
    } catch (err) {
      console.error('Fehler beim Anlegen des Legs (resetLeg):', err);
    }
  })();
}

function renderLiveScorer(app) {
  const p1 = currentMatch.p1.name,
        p2 = currentMatch.p2.name;
  const bestLeg = currentMatch.best_of_legs,
        bestSet = currentMatch.best_of_sets;
  const isP1Turn = currentPlayer === 'p1';

  let bullBtnHtml = '';
  // Bullfinish- und Kein Bullfinish-Button anzeigen, wenn einer der Spieler 0 Rest hat (Leg gewonnen)
  if (remainingP1 === 0 || remainingP2 === 0) {
    bullBtnHtml = `
      <button id="bullfinishBtn" class="rounded-full bg-red-600 text-white px-4 py-2 text-lg font-bold shadow-lg animate-pulse" type="button">Bullfinish</button>
      <button id="noBullfinishBtn" class="rounded-full bg-gray-400 text-white px-4 py-2 text-lg font-bold shadow-lg ml-2" type="button">Kein Bullfinish</button>
    `;
  }
  app.innerHTML = `
  <div class="max-w-md mx-auto mt-6 space-y-4">
    <div class="flex justify-between items-center mb-2">
      <button id="backToMatchSelect" class="btn btn-sm bg-gray-400 hover:bg-gray-500 text-white">← Zurück zur Auswahl</button>
      <h2 class="text-xl text-center flex-1">${p1} vs ${p2}</h2>
    </div>
    <div class="flex justify-center gap-4">
      <span>Set ${currentSetNo}/${bestSet}</span>
      <span>Leg ${currentLegNo}/${bestLeg}</span>
    </div>
    <div class="flex justify-between items-center mt-4 text-lg">
      <div class="flex flex-col items-center w-1/3">
        <span class="font-semibold mb-1">${p1}</span>
        <span id="legsP1" class="text-sm mb-1">Sets: ${setsWon.p1}</span>
        <strong id="remP1" class="${isP1Turn ? 'text-4xl' : 'text-2xl'}">${remainingP1}</strong>
      </div>
      <div class="flex flex-col items-center w-1/3">
        <!-- Leer für Abstand -->
      </div>
      <div class="flex flex-col items-center w-1/3">
        <span class="font-semibold mb-1">${p2}</span>
        <span id="legsP2" class="text-sm mb-1">Sets: ${setsWon.p2}</span>
        <strong id="remP2" class="${!isP1Turn ? 'text-4xl' : 'text-2xl'}">${remainingP2}</strong>
      </div>
    </div>
    <form id="throwForm" class="flex justify-center gap-2">
      <input type="number" name="score" class="input w-32 text-lg text-center" placeholder="Score" required />
      <button class="btn">OK</button>
    </form>
    <div class="grid grid-cols-4 gap-3 justify-center max-w-xs mx-auto mt-2" id="quickScores">
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="26">26</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="41">41</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="45">45</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="60">60</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="81">81</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="83">83</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="85">85</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="95">95</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="100">100</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="121">121</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="140">140</button>
      <button type="button" class="btn bg-gray-200 hover:bg-blue-200 text-2xl py-4" data-score="180">180</button>
    </div>
    <div class="flex justify-center gap-2 mt-2">
      <button id="legWon" class="btn bg-green-600 text-white hidden">Leg gewonnen</button>
      <button id="setWon" class="btn bg-blue-600 text-white hidden">Set gewonnen</button>
      <button id="undoBtn" class="bg-red-500 hover:bg-red-600 text-white rounded-full py-1 px-3 transition ml-2">← Rückgängig</button>
      ${bullBtnHtml}
    </div>
  </div>`;

  // Hilfsfunktion für Leg/Set-Wechsel (vor den Button-Handlern deklarieren!)
  function nextLegOrSet() {
    if (setsWon.p1 > bestLeg / 2 || setsWon.p2 > bestLeg / 2 || currentLegNo >= bestLeg) {
      document.getElementById('setWon').classList.remove('hidden');
    } else {
      currentLegNo++;
      currentPlayer = 'p1';
      resetLeg();
      renderScorer();
    }
  }

  // Bullfinish- und Kein Bullfinish-Button Handler
  if (document.getElementById('bullfinishBtn')) {
    document.getElementById('bullfinishBtn').onclick = async () => {
      bullfinish = true;
      await saveLeg(currentSetNo, currentLegNo);
      nextLegOrSet();
    };
  }
  if (document.getElementById('noBullfinishBtn')) {
    document.getElementById('noBullfinishBtn').onclick = async () => {
      bullfinish = false;
      await saveLeg(currentSetNo, currentLegNo);
      nextLegOrSet();
    };
  }

  // Zurück zur Matchauswahl
  document.getElementById('backToMatchSelect').onclick = () => {
    currentMatch = null;
    renderScorer();
  };

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
  document.getElementById('throwForm').onsubmit = async e => {
    e.preventDefault();
    const sc = parseInt(e.target.score.value, 10);
    if (sc > 180) { alert('😡 Maximal 180 Punkte erlaubt!'); return; }
    e.target.reset();
    e.target.score.focus(); // <-- Diese Zeile sorgt für den Fokus!
    const prev = isP1Turn ? remainingP1 : remainingP2;
    const rem = prev - sc;
    if (rem < 0) { alert('Bust!'); return; }
    if (isP1Turn) { remainingP1 = rem; document.getElementById('remP1').textContent = rem; }
    else          { remainingP2 = rem; document.getElementById('remP2').textContent = rem; }
    currentLeg.addThrow({ playerId: isP1Turn ? currentMatch.p1_id : currentMatch.p2_id, darts: [sc] });

    // NEU: Leg vor dem ersten Wurf speichern, falls noch nicht geschehen
    if (!currentLegSaved) {
      try {
        const { error: legErr } = await supabase.from('legs').insert({
          id: currentLeg.id,
          match_id: currentMatch.id,
          set_no: currentSetNo,
          leg_no: currentLegNo,
          starter: currentMatch.p1_id,
          start_score: 501,
          // finish_darts, duration_s, winner_id, bullfinish werden am Leg-Ende gesetzt
        });
        if (legErr) {
          console.error('Fehler beim Anlegen des Legs:', legErr);
          alert('Fehler beim Anlegen des Legs: ' + (legErr.message || legErr.details || legErr));
          return;
        }
        currentLegSaved = true;
      } catch (err) {
        console.error('Fehler beim Anlegen des Legs:', err);
        alert('Fehler beim Anlegen des Legs: ' + err.message);
        return;
      }
    }

    // Wurf in Tabelle throws speichern
    try {
      const throwObj = {
        id: crypto.randomUUID(),
        leg_id: currentLeg.id,
        player_id: isP1Turn ? currentMatch.p1_id : currentMatch.p2_id,
        score: sc,
        order_no: currentLeg.scores.length, // 1-basiert, da nach addThrow
        created_at: new Date().toISOString()
      };
      const { error: throwErr } = await supabase.from('throws').insert(throwObj);
      if (throwErr) {
        console.error('Fehler beim Speichern des Wurfs:', throwErr);
        alert('Fehler beim Speichern des Wurfs: ' + (throwErr.message || throwErr.details || throwErr));
      }
    } catch (err) {
      console.error('Fehler beim Eintragen des Wurfs:', err);
    }

    if (rem === 0) {
      renderLiveScorer(app); // Neu rendern, damit Leg-Gewonnen- und Bullfinish-Button erscheinen
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

  // Quick-Score-Buttons: Wert ins Eingabefeld übernehmen
  setTimeout(() => {
    const scoreInput = document.querySelector('input[name="score"]');
    const throwForm = document.getElementById('throwForm');
    if (scoreInput) scoreInput.focus();
    document.querySelectorAll('#quickScores button[data-score]').forEach(btn => {
      btn.onclick = () => {
        if (scoreInput) {
          scoreInput.value = btn.dataset.score;
          scoreInput.focus();
        }
        if (throwForm) {
          throwForm.requestSubmit();
        }
      };
    });
  }, 0);

  // Setze den Fokus nach jedem Render auf das Score-Eingabefeld
  setTimeout(() => {
    const scoreInput = document.querySelector('input[name="score"]');
    if (scoreInput) scoreInput.focus();
  }, 0);
}

// --------------------------------------------------
// Datenbank-Helper
// --------------------------------------------------
async function saveLeg(setNo, legNo) {
  const { error } = await supabase.from('legs').update({
    match_id: currentMatch.id,
    set_no: setNo,
    leg_no: legNo,
    starter: currentMatch.p1_id,
    start_score: 501,
    finish_darts: currentLeg.throwCount,
    duration_s: currentLeg.durationSeconds,
    winner_id: remainingP1 === 0 ? currentMatch.p1_id : currentMatch.p2_id,
    bullfinish: !!bullfinish
  }).eq('id', currentLeg.id);
  if (error) {
    console.error('Fehler beim Speichern des Legs:', error);
    alert('Fehler beim Speichern des Legs: ' + (error.message || error.details || error));
  }
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
  // Boards als Strings zurückgeben
  return [...new Set(ms.map(m => m.board))];
}

// Holt offene Matches für ein Board, optional mit Datum
async function fetchOpenMatches(board, withDate = false) {
  let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
  if (withDate) selectStr += ', gameday:gamedays(date)';
  const { data, error } = await supabase
    .from('matches')
    .select(selectStr)
    .eq('board', board)
    .is('finished_at', null);
  console.log('fetchOpenMatches:', data, error);
  return data || [];
}

function renderStats() {
  // NEU: Statistik aus Tabelle legs und throws
  document.getElementById('app').innerHTML = '<p class="text-center mt-8">Lade Statistik…</p>';
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
  html += `<div class="mt-6">
    <h3 class="text-lg mb-2">Highscores (Wurf ≥ 101)</h3>
    <p>${throws.length} Highscores</p>
    <h3 class="text-lg mt-4 mb-2">Highfinishes (180)</h3>
    <p>${finishes.length} Highfinishes</p>
    <h3 class="text-lg mt-4 mb-2">Shortlegs (≤ 18 Darts)</h3>
    <p>${shortlegs.length} Shortlegs</p>
  </div>`;
  document.getElementById('app').innerHTML = html;
}
