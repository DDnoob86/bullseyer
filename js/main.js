import { login, signUp, logout } from './auth.js';
// ⚠️ MOCK-MODUS FÜR TESTS - Ändere zu './supabase.js' für echtes Backend
import { supabase } from './supabase-mock.js';
import { generateRoundRobin, generateRoundRobinRounds, distributeToBoards } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';
// Neue modulare Livescorer-Imports
import { renderLiveScorer } from './ui/livescorer/index.js';
import { createLeg } from './services/match.js';
import * as store from './state/store.js';
import { START_SCORE, PLAYER, STORAGE_KEYS } from './utils/constants.js';
import { ensurePlayerNames } from './utils/players.js';
import { renderPlayers } from './ui/players.js';

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
  else if (page.startsWith('#/players'))   renderPlayers();
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
      alert('Bestätigungs-Mail verschickt!');
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
    <p class="text-center mt-4">Lade Spieler...</p>
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
        <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">🎯 Bullseyer Dashboard</h1>
        <button id="logoutBtn3" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all transform hover:scale-105">Logout</button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Offene Matches (links) -->
        <div class="lg:col-span-1">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-emerald-400 p-6">
            <h2 class="text-2xl font-bold text-emerald-800 mb-4 flex items-center gap-2">
              <span>🎲</span> Offene Matches
            </h2>
            ${(openMatches && openMatches.length) ? `
              <div class="space-y-3 mb-4">
                ${openMatches.map(m => `
                  <div class="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-center">
                      <div>
                        <div class="font-semibold text-gray-800 dark:text-gray-200">${m.p1?.name || '?'} <span class="text-emerald-600">vs</span> ${m.p2?.name || '?'}</div>
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
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-rose-400 p-6">
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
          <label class="flex items-center gap-3 cursor-pointer bg-gradient-to-r from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 border-2 border-rose-300 dark:border-rose-500 rounded-lg p-4 hover:shadow-lg hover:scale-[1.02] transition-all duration-200">
            <input name="doubleOut" type="checkbox" class="w-6 h-6 text-rose-600 dark:text-rose-500 bg-white dark:bg-gray-700 border-2 border-rose-400 dark:border-rose-500 rounded focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 cursor-pointer" checked />
            <div class="flex-1">
              <span class="text-gray-900 dark:text-gray-100 font-bold text-lg">Double Out aktivieren</span>
              <p class="text-xs text-rose-600 dark:text-rose-400 mt-1">Match muss mit Double beendet werden</p>
            </div>
            <svg class="w-6 h-6 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
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

        <!-- Spieltag-Vorlagen -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-200">📋 Spieltag-Vorlage</h3>
          </div>
          <div id="templateArea" class="flex flex-wrap gap-2 mb-3">
            <!-- Wird dynamisch befüllt -->
          </div>
          <div class="flex gap-2">
            <input id="templateNameInput" type="text" placeholder="Vorlagenname..." maxlength="30" class="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-200" />
            <button type="button" id="saveTemplateBtn" class="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow transition-all">
              💾 Speichern
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-1">Speichert ausgewählte Spieler + Einstellungen als Vorlage</p>
        </div>

        <div class="mb-6">
          <h3 class="text-lg font-bold text-gray-800 dark:text-gray-200 mb-3">Spieler auswählen</h3>
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
    div.className = 'cursor-pointer text-center py-3 px-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 font-semibold text-gray-800 dark:text-gray-200';
    div.onclick = () => {
      const id = p.id;
      if (selectedPlayers.has(id)) {
        selectedPlayers.delete(id);
        // Deselect: Zurück zu Standardfarben
        div.className = 'cursor-pointer text-center py-3 px-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 font-semibold text-gray-800 dark:text-gray-200';
      } else {
        selectedPlayers.add(id);
        // Select: Blau mit Ring und Glow
        div.className = 'cursor-pointer text-center py-3 px-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 border-2 border-blue-600 dark:border-blue-500 rounded-lg hover:shadow-2xl transition-all duration-200 font-bold text-blue-700 dark:text-blue-300 ring-4 ring-blue-300 dark:ring-blue-500/50 shadow-xl scale-105';
      }
    };
    playerListEl.appendChild(div);
  });

  // ---- SPIELTAG-VORLAGEN ----
  const TEMPLATE_KEY = 'bullseyer_gameday_templates';

  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveTemplates(templates) {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  }

  // Hilfsfunktion: Spieler-Auswahl programmatisch setzen
  function applyPlayerSelection(playerIds) {
    selectedPlayers.clear();
    // Alle Spieler-DIVs zurücksetzen
    playerListEl.querySelectorAll('div').forEach(div => {
      div.className = 'cursor-pointer text-center py-3 px-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 font-semibold text-gray-800 dark:text-gray-200';
    });
    // Gewünschte Spieler selektieren
    playerIds.forEach(id => {
      const player = players.find(p => p.id === id);
      if (!player) return;
      selectedPlayers.add(id);
      // Finde das passende DIV
      const divs = playerListEl.querySelectorAll('div');
      divs.forEach(div => {
        if (div.textContent === player.name) {
          div.className = 'cursor-pointer text-center py-3 px-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 border-2 border-blue-600 dark:border-blue-500 rounded-lg hover:shadow-2xl transition-all duration-200 font-bold text-blue-700 dark:text-blue-300 ring-4 ring-blue-300 dark:ring-blue-500/50 shadow-xl scale-105';
        }
      });
    });
  }

  function renderTemplates() {
    const templates = loadTemplates();
    const area = document.getElementById('templateArea');
    if (!area) return;

    if (templates.length === 0) {
      area.innerHTML = '<p class="text-sm text-gray-400">Keine Vorlagen gespeichert</p>';
      return;
    }

    area.innerHTML = templates.map((t, i) => {
      const playerNames = t.playerIds
        .map(id => players.find(p => p.id === id)?.name)
        .filter(Boolean);
      return `
        <div class="group relative">
          <button type="button" data-template-idx="${i}" class="template-load-btn bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-900/40 dark:to-violet-800/40 border-2 border-violet-400 dark:border-violet-500 rounded-lg px-4 py-2.5 hover:shadow-lg hover:scale-105 transition-all text-left">
            <div class="font-bold text-violet-800 dark:text-violet-300 text-sm">${t.name}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">${playerNames.join(', ')}</div>
            <div class="text-xs text-violet-600 dark:text-violet-400 mt-0.5">BO${t.boSets} Sets / BO${t.boLegs} Legs${t.doubleOut ? ' • DO' : ''} • ${t.boards}B</div>
          </button>
          <button type="button" data-template-del="${i}" class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-full text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
        </div>
      `;
    }).join('');

    // Lade-Handler
    area.querySelectorAll('.template-load-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.templateIdx);
        const t = templates[idx];
        if (!t) return;

        // Spieler-Auswahl setzen
        applyPlayerSelection(t.playerIds);

        // Formular-Werte setzen
        const form = document.getElementById('cfgForm');
        if (form) {
          form.elements.boSets.value = t.boSets || 3;
          form.elements.boLegs.value = t.boLegs || 3;
          form.elements.doubleOut.checked = t.doubleOut !== false;
          form.elements.numBoards.value = t.boards || 1;
        }
      });
    });

    // Löschen-Handler
    area.querySelectorAll('[data-template-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.templateDel);
        const templates = loadTemplates();
        templates.splice(idx, 1);
        saveTemplates(templates);
        renderTemplates();
      });
    });
  }

  // Vorlage speichern
  document.getElementById('saveTemplateBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('templateNameInput');
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add('border-red-500');
      nameInput.placeholder = 'Name eingeben!';
      setTimeout(() => {
        nameInput.classList.remove('border-red-500');
        nameInput.placeholder = 'Vorlagenname…';
      }, 2000);
      return;
    }

    if (selectedPlayers.size < 2) {
      nameInput.value = '';
      nameInput.placeholder = 'Erst Spieler wählen!';
      nameInput.classList.add('border-red-500');
      setTimeout(() => {
        nameInput.classList.remove('border-red-500');
        nameInput.placeholder = 'Vorlagenname…';
      }, 2000);
      return;
    }

    const form = document.getElementById('cfgForm');
    const template = {
      name,
      playerIds: [...selectedPlayers],
      boSets: parseInt(form.elements.boSets.value) || 3,
      boLegs: parseInt(form.elements.boLegs.value) || 3,
      doubleOut: form.elements.doubleOut.checked,
      boards: parseInt(form.elements.numBoards.value) || 1,
      createdAt: new Date().toISOString()
    };

    const templates = loadTemplates();
    // Überschreibe existierende Vorlage mit gleichem Namen
    const existingIdx = templates.findIndex(t => t.name === name);
    if (existingIdx >= 0) {
      templates[existingIdx] = template;
    } else {
      templates.push(template);
    }
    saveTemplates(templates);

    nameInput.value = '';
    renderTemplates();
  });

  // Initiales Rendering der Vorlagen
  renderTemplates();

  // 5) Form-Submit → Spieltag & Matches anlegen
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
        alert('Best-of muss ungerade sein (1,3,5...)');
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

    // Round-Robin mit echten Runden (kein Spieler doppelt pro Runde)
    const boards = parseInt(numBoards.value, 10) || 1;
    const rounds = generateRoundRobinRounds([...selectedPlayers]);
    const distributed = distributeToBoards(rounds, boards);

    console.log('[Schedule] Runden:', rounds.length, 'Matches:', distributed.length, 'Boards:', boards);
    rounds.forEach(r => console.log(`  Runde ${r.round}:`, r.matches.length, 'simultane Matches'));

    const matchesToInsert = distributed.map(m => ({
      gameday_id: gd.id,
      p1_id: m.p1,
      p2_id: m.p2,
      best_of_sets: boS,
      best_of_legs: boL,
      double_out: doubleOut.checked,
      board: m.board,
      round_no: m.round,
      finished_at: null,
      winner_id: null
    }));

    console.log('[DEBUG] Creating matches:', matchesToInsert);
    console.log('[DEBUG] Gameday ID:', gd.id);
    console.log('[DEBUG] Number of boards:', boards);

    const { error: matchErr } = await supabase
      .from('matches')
      .insert(matchesToInsert);
    if (matchErr) {
      if (submitBtn) {
        submitBtn.textContent = 'Fehler beim Anlegen der Matches!';
        submitBtn.classList.add('bg-red-600');
        setTimeout(() => {
          submitBtn.textContent = defaultBtnText;
          submitBtn.classList.remove('bg-red-600');
        }, 4000);
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
// State wird jetzt über den zentralen Store verwaltet (js/state/store.js)
let currentBoard = localStorage.getItem(STORAGE_KEYS.BOARD) || null;

async function renderScorer() {
  const app = document.getElementById('app');

  // Board-Auswahl immer anzeigen
  const boards = await fetchBoardsForToday();
  if (!boards.length) {
    app.innerHTML = '<p class="text-center mt-8">Keine Spiele heute</p>';
    return;
  }

  // Aktuelles Board aus localStorage oder erstes Board als Default
  if (!currentBoard || !boards.includes(String(currentBoard))) {
    currentBoard = boards[0];
    localStorage.setItem(STORAGE_KEYS.BOARD, currentBoard);
  }

  // Board-Auswahl-Buttons - Modernes Design
  app.innerHTML = `
    <div class="max-w-4xl mx-auto mt-6">
      <!-- Header Card -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-blue-400 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-blue-800 dark:text-blue-400 flex items-center gap-2">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            Match Auswahl
          </h2>
          <button id="backToDashboard" class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg">
            ← Dashboard
          </button>
        </div>

        <!-- Board Selection -->
        <div class="flex gap-3 justify-center flex-wrap">
          ${boards.map(b => `
            <button class="px-6 py-3 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg ${
              String(b) == String(currentBoard)
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white ring-4 ring-blue-300 dark:ring-blue-500'
                : 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-800 dark:text-gray-100 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500'
            }" data-board="${b}">
              🎯 Board ${b}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Match List -->
      <div id="scorerContent"></div>
    </div>
  `;

  // Zurück-Button Handler
  document.getElementById('backToDashboard').onclick = () => {
    store.resetState();
    window.location.hash = '#/dashboard';
  };

  // Board-Wechsel-Handler
  app.querySelectorAll('[data-board]').forEach(btn => btn.onclick = () => {
    currentBoard = String(btn.dataset.board);
    localStorage.setItem(STORAGE_KEYS.BOARD, currentBoard);
    store.resetState();
    renderScorer();
  });

  // Prüfe, ob ein Match aktiv ist (aus localStorage oder Store)
  const currentMatch = store.getCurrentMatch();
  if (!currentMatch) {
    const matchId = localStorage.getItem(STORAGE_KEYS.CURRENT_MATCH_ID);
    if (matchId) {
      // Hole offene Matches für das aktuelle Board
      const matches = await fetchOpenMatches(currentBoard, true);
      const m = matches.find(x => String(x.id) === String(matchId));
      if (m) {
        // Match im Store initialisieren
        ensurePlayerNames(m);
        store.initNewMatch(m);
        store.setCurrentLeg(createLeg(m, 1, 1));
        window.location.hash = '#/livescorer';
        return;
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_MATCH_ID);
      }
    }
  }

  // Wenn ein Match aktiv ist, direkt das Live-Scoring anzeigen
  if (currentMatch) {
    ensurePlayerNames(currentMatch);
    renderLiveScorer({
      app,
      bestSet: currentMatch.best_of_sets,
      bestLeg: currentMatch.best_of_legs
    });
    return;
  }

  // 2) Match-Auswahl
  const scorerContent = document.getElementById('scorerContent'); // <-- jetzt nach app.innerHTML!
  // NEU: Offene Matches mit Datum anzeigen
  const matches = await fetchOpenMatches(currentBoard, true);
  if (!matches.length) {
    scorerContent.innerHTML = '<p class="text-center mt-8 text-gray-500">Keine offenen Matches für Board ' + currentBoard + '</p>';
    return;
  }

  // Matches nach Runden gruppieren
  const roundsMap = new Map();
  matches.forEach(m => {
    const rNo = m.round_no || 0;
    if (!roundsMap.has(rNo)) roundsMap.set(rNo, []);
    roundsMap.get(rNo).push(m);
  });
  const sortedRounds = [...roundsMap.entries()].sort((a, b) => a[0] - b[0]);

  // Erste nicht-leere Runde hervorheben (= nächste zu spielende Runde)
  const firstRound = sortedRounds[0]?.[0];

  scorerContent.innerHTML = sortedRounds.map(([roundNo, roundMatches]) => {
    const isCurrentRound = roundNo === firstRound;
    return `
      <div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <div class="text-sm font-bold ${isCurrentRound ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}">
            ${roundNo > 0 ? `Runde ${roundNo}` : 'Matches'}
          </div>
          ${isCurrentRound ? '<span class="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">▶ Aktuelle Runde</span>' : ''}
          <div class="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
          <div class="text-xs text-gray-400">${roundMatches.length} ${roundMatches.length === 1 ? 'Match' : 'Matches'}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${roundMatches.map(m => `
            <button type="button" class="group relative bg-gradient-to-br ${isCurrentRound ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-400 dark:border-emerald-500' : 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-300 dark:border-blue-500'} border-2 rounded-xl p-4 hover:shadow-2xl hover:scale-[1.02] transition-all duration-200 text-left" data-mid="${m.id}">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                    ${m.p1?.name || '?'}
                    <span class="${isCurrentRound ? 'text-emerald-600' : 'text-blue-600'} mx-2">vs</span>
                    ${m.p2?.name || '?'}
                  </div>
                  <div class="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>${m.gameday?.date || ''}</span>
                    <span>BO${m.best_of_legs} Legs</span>
                  </div>
                </div>
                <svg class="w-6 h-6 ${isCurrentRound ? 'text-emerald-500' : 'text-blue-400'} group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                </svg>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  // Event-Delegation für Touch/Click: Nur noch click-Event (iPad/iOS Fix)
  let matchSelectLock = false;
  function handleMatchSelect(e) {
    console.log('[Match-Select] Click detected', e.target);
    e.preventDefault();
    e.stopPropagation();
    if (matchSelectLock) {
      console.log('[Match-Select] Locked, ignoring');
      return;
    }
    matchSelectLock = true;
    setTimeout(() => matchSelectLock = false, 400); // Doppelauslösung verhindern
    const btn = e.target.closest('button[data-mid]');
    console.log('[Match-Select] Button found:', btn, 'data-mid:', btn?.dataset?.mid);
    if (!btn) return;
    const m = matches.find(x => String(x.id).trim() === String(btn.dataset.mid).trim());
    console.log('[Match-Select] Match found:', m);
    if (m) startMatch(m);
  }
  scorerContent.addEventListener('click', handleMatchSelect);
  console.log('[Match-Select] Event handler registered on scorerContent');
}

async function startMatch(m) {
  // Matchdaten inkl. Spielernamen aus Supabase nachladen
  const { data, error } = await supabase
    .from('matches')
    .select(`*, p1:users!matches_p1_id_fkey(id, name), p2:users!matches_p2_id_fkey(id, name)`)
    .eq('id', m.id)
    .single();

  if (error || !data) {
    alert('Fehler beim Laden des Matches!');
    return;
  }

  // Spielernamen ergänzen
  ensurePlayerNames(data);

  // Match im zentralen Store initialisieren
  store.initNewMatch(data);
  store.setCurrentLeg(createLeg(data, 1, 1));

  // Match-ID persistieren
  localStorage.setItem(STORAGE_KEYS.CURRENT_MATCH_ID, data.id);

  // Route für Livescorer setzen
  window.location.hash = '#/livescorer';
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
  let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, round_no, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
  if (withDate) selectStr += ', gameday:gamedays(date)';
  const { data, error } = await supabase
    .from('matches')
    .select(selectStr)
    .eq('board', Number(board))
    .is('finished_at', null)
    .order('round_no', { ascending: true });
  return data || [];
}

// Navigation is now in the header (index.html)
// function renderNav() {
//   const app = document.getElementById('app');
//   if (!app) return;
//   const nav = document.createElement('nav');
//   nav.className = 'flex justify-center gap-4 mb-4';
//   nav.innerHTML = `
//     <button id="navDashboard" class="btn">Dashboard</button>
//     <button id="navScorer" class="btn">Scorer</button>
//     <button id="navStats" class="btn">Statistik</button>
//   `;
//   app.parentNode.insertBefore(nav, app);
//   document.getElementById('navDashboard').onclick = () => window.location.hash = '#/dashboard';
//   document.getElementById('navScorer').onclick = () => window.location.hash = '#/scorer';
//   document.getElementById('navStats').onclick = () => window.location.hash = '#/stats';
// }

function renderStats() {
  // NEU: Statistik aus Tabelle legs und throws
  document.getElementById('app').innerHTML = '<p class="text-center mt-8">Lade Statistik...</p>';
  loadStats();
}

async function loadStats() {
  // Alle Daten laden
  const { data: throws, error: throwsErr } = await supabase
    .from('throws')
    .select('player_id, score')
    .gte('score', 101);

  const { data: finishes, error: finishErr } = await supabase
    .from('throws')
    .select('player_id, score')
    .eq('score', 180);

  const { data: shortlegs, error: shortErr } = await supabase
    .from('legs')
    .select('winner_id, finish_darts')
    .lte('finish_darts', 18);

  const { data: allThrows, error: allThrowsErr } = await supabase
    .from('throws')
    .select('player_id, score');

  const { data: players, error: playersErr } = await supabase
    .from('users')
    .select('id, name');

  if (throwsErr || finishErr || shortErr || allThrowsErr || playersErr) {
    document.getElementById('app').innerHTML = '<p class="text-red-600 text-center mt-8">Fehler beim Laden der Statistiken</p>';
    return;
  }

  // Durchschnitt berechnen
  const playerStats = {};
  allThrows.forEach(t => {
    if (!playerStats[t.player_id]) playerStats[t.player_id] = { sum: 0, count: 0, highscores: 0, finishes180: 0 };
    playerStats[t.player_id].sum += t.score;
    playerStats[t.player_id].count++;
  });

  // Highscores & 180s zählen
  throws.forEach(t => {
    if (playerStats[t.player_id]) playerStats[t.player_id].highscores++;
  });
  finishes.forEach(t => {
    if (playerStats[t.player_id]) playerStats[t.player_id].finishes180++;
  });

  // Shortlegs zählen
  shortlegs.forEach(l => {
    if (playerStats[l.winner_id]) {
      if (!playerStats[l.winner_id].shortlegs) playerStats[l.winner_id].shortlegs = 0;
      playerStats[l.winner_id].shortlegs++;
    }
  });

  // Stats-Objekt für CSV-Export global speichern
  window.bullseyerStatsData = {
    players,
    playerStats,
    highscoresTotal: throws.length,
    finishes180Total: finishes.length,
    shortlegsTotal: shortlegs.length
  };

  // Modernes Design
  const html = `
    <div class="max-w-6xl mx-auto mt-6">
      <!-- Header Card -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-emerald-400 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Statistiken
          </h2>
          <button id="exportStatsCSV" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            CSV Export
          </button>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-2 border-emerald-300 dark:border-emerald-500 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-emerald-700 dark:text-emerald-400">${throws.length}</div>
            <div class="text-sm text-emerald-600 dark:text-emerald-300">Highscores (≥101)</div>
          </div>
          <div class="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 border-2 border-rose-300 dark:border-rose-500 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-rose-700 dark:text-rose-400">${finishes.length}</div>
            <div class="text-sm text-rose-600 dark:text-rose-300">180er</div>
          </div>
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-500 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-blue-700 dark:text-blue-400">${shortlegs.length}</div>
            <div class="text-sm text-blue-600 dark:text-blue-300">Shortlegs (≤18 Darts)</div>
          </div>
        </div>
      </div>

      <!-- Player Stats Table -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-blue-400 p-6">
        <h3 class="text-xl font-bold text-blue-800 dark:text-blue-400 mb-4 flex items-center gap-2">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
          </svg>
          Spieler-Statistiken
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b-2 border-blue-300 dark:border-blue-600">
                <th class="text-left py-3 px-4 font-bold text-blue-900 dark:text-blue-100">Spieler</th>
                <th class="text-center py-3 px-4 font-bold text-blue-900 dark:text-blue-100">3-Dart-Ø</th>
                <th class="text-center py-3 px-4 font-bold text-blue-900 dark:text-blue-100">Highscores</th>
                <th class="text-center py-3 px-4 font-bold text-blue-900 dark:text-blue-100">180er</th>
                <th class="text-center py-3 px-4 font-bold text-blue-900 dark:text-blue-100">Shortlegs</th>
              </tr>
            </thead>
            <tbody>
              ${players.map(p => {
                const s = playerStats[p.id] || { sum: 0, count: 0, highscores: 0, finishes180: 0, shortlegs: 0 };
                const avg = s.count ? (s.sum / s.count).toFixed(2) : '-';
                return `
                  <tr class="border-b border-blue-100 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition">
                    <td class="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">${p.name}</td>
                    <td class="text-center py-3 px-4 text-emerald-700 dark:text-emerald-400 font-bold">${avg}</td>
                    <td class="text-center py-3 px-4 text-gray-700 dark:text-gray-300">${s.highscores}</td>
                    <td class="text-center py-3 px-4 text-rose-700 dark:text-rose-400 font-bold">${s.finishes180}</td>
                    <td class="text-center py-3 px-4 text-blue-700 dark:text-blue-400">${s.shortlegs}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;

  // CSV Export Handler
  document.getElementById('exportStatsCSV').addEventListener('click', exportStatsToCSV);
}

// CSV Export Funktion
function exportStatsToCSV() {
  const data = window.bullseyerStatsData;
  if (!data) return;

  // CSV Header
  let csv = 'Spieler,3-Dart-Average,Highscores (≥101),180er,Shortlegs\n';

  // CSV Rows
  data.players.forEach(p => {
    const s = data.playerStats[p.id] || { sum: 0, count: 0, highscores: 0, finishes180: 0, shortlegs: 0 };
    const avg = s.count ? (s.sum / s.count).toFixed(2) : '0';
    csv += `${p.name},${avg},${s.highscores},${s.finishes180},${s.shortlegs}\n`;
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `bullseyer_stats_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
