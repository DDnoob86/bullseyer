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
import { renderStats as renderStatsPage } from './ui/stats.js';

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

  // Spieltage und Matches laden
  let allMatches = [];
  let allGamedays = [];
  try {
    const [matchRes, gamedayRes] = await Promise.all([
      supabase
        .from('matches')
        .select('id, finished_at, gameday_id, board, best_of_sets, best_of_legs, double_out, round_no, p1_id, p2_id, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name), gameday:gamedays(date)')
        .order('gameday_id', { ascending: false }),
      supabase
        .from('gamedays')
        .select('id, date')
        .order('date', { ascending: false })
    ]);
    allMatches = matchRes.data || [];
    allGamedays = gamedayRes.data || [];
  } catch (e) {
    console.error('[Dashboard] Fehler beim Laden:', e);
  }
  const openMatches = allMatches.filter(m => !m.finished_at);

  // 2) Spieler aus Supabase holen
  const { data: players, error } = await supabase
    .from('users')
    .select('id,name')
    .order('name');
  if (error) {
    app.innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return;
  }

  // 3) Spieltage nach Gameday gruppieren
  const gamedayMap = new Map();
  allGamedays.forEach(gd => gamedayMap.set(gd.id, { ...gd, matches: [] }));
  allMatches.forEach(m => {
    if (gamedayMap.has(m.gameday_id)) {
      gamedayMap.get(m.gameday_id).matches.push(m);
    }
  });

  // 4) Formular anzeigen (offene Spiele werden jetzt UNTER dem Button angezeigt)
  app.innerHTML = `
    <div class="max-w-6xl mx-auto p-6">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">🎯 Bullseyer Dashboard</h1>
        <button id="logoutBtn3" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all transform hover:scale-105">Logout</button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Spieltag-Verwaltung (links) -->
        <div class="lg:col-span-1 space-y-4">
          <!-- Quick-Action: Zu den Matches -->
          ${openMatches.length ? `
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-emerald-400 p-4">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-lg font-bold text-emerald-800 dark:text-emerald-400">🎲 ${openMatches.length} offene Matches</span>
              </div>
              <button id="gotoScorerBtn" class="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-4 py-2 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 text-sm">
                Starten →
              </button>
            </div>
          </div>
          ` : ''}

          <!-- Spieltage Liste -->
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-blue-400 p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold text-blue-800 dark:text-blue-400 flex items-center gap-2">
                <span>📅</span> Spieltage
              </h2>
              ${allGamedays.length > 0 ? `
              <button id="deleteAllGamedays" class="bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1" title="Alle Spieltage löschen">
                🗑️ Alle löschen
              </button>
              ` : ''}
            </div>
            <div id="gamedayList" class="space-y-4 max-h-[600px] overflow-y-auto">
              ${allGamedays.length === 0 ? '<div class="text-center text-gray-400 py-8">Noch keine Spieltage</div>' :
                allGamedays.map(gd => {
                  const gdData = gamedayMap.get(gd.id);
                  const gdMatches = gdData?.matches || [];
                  const openCount = gdMatches.filter(m => !m.finished_at).length;
                  const finishedCount = gdMatches.filter(m => m.finished_at).length;
                  const firstMatch = gdMatches[0];
                  const settings = firstMatch ? `BO${firstMatch.best_of_sets}S / BO${firstMatch.best_of_legs}L${firstMatch.double_out ? ' • DO' : ''}` : '';

                  return `
                  <div class="border-2 ${openCount > 0 ? 'border-emerald-300 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-600'} rounded-xl overflow-hidden" data-gameday-id="${gd.id}">
                    <!-- Spieltag Header -->
                    <div class="bg-gradient-to-r ${openCount > 0 ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30' : 'from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-600/50'} p-3 flex items-center justify-between">
                      <div>
                        <div class="font-bold text-gray-800 dark:text-gray-200 text-sm">${gd.date || '?'}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">${gdMatches.length} Matches • ${settings}</div>
                        <div class="text-xs mt-0.5">
                          ${openCount > 0 ? `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">${openCount} offen</span>` : ''}
                          ${finishedCount > 0 ? `<span class="text-gray-400 ml-1">${finishedCount} fertig</span>` : ''}
                        </div>
                      </div>
                      <div class="flex gap-1">
                        <button class="gameday-toggle-btn bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-400 w-8 h-8 rounded-lg text-sm font-bold transition-all flex items-center justify-center" data-gameday-toggle="${gd.id}" title="Details anzeigen">▼</button>
                        <button class="gameday-edit-btn bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/40 text-amber-700 dark:text-amber-400 w-8 h-8 rounded-lg text-sm font-bold transition-all flex items-center justify-center" data-gameday-edit="${gd.id}" title="Bearbeiten">✏️</button>
                        <button class="gameday-delete-btn bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-700 dark:text-red-400 w-8 h-8 rounded-lg text-sm font-bold transition-all flex items-center justify-center" data-gameday-delete="${gd.id}" title="Spieltag löschen">🗑️</button>
                      </div>
                    </div>

                    <!-- Spieltag Matches (eingeklappt) -->
                    <div class="gameday-matches hidden" id="gameday-matches-${gd.id}">
                      <!-- Edit-Panel (versteckt) -->
                      <div class="gameday-edit-panel hidden bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 p-3" id="gameday-edit-${gd.id}">
                        <div class="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">⚙️ Einstellungen ändern</div>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label class="text-xs text-gray-600 dark:text-gray-400">BO Sets</label>
                            <input type="number" min="1" max="21" value="${firstMatch?.best_of_sets || 1}" class="w-full px-2 py-1 border rounded text-sm edit-bo-sets" />
                          </div>
                          <div>
                            <label class="text-xs text-gray-600 dark:text-gray-400">BO Legs</label>
                            <input type="number" min="1" max="11" value="${firstMatch?.best_of_legs || 5}" class="w-full px-2 py-1 border rounded text-sm edit-bo-legs" />
                          </div>
                        </div>
                        <label class="flex items-center gap-2 text-xs mb-2 cursor-pointer">
                          <input type="checkbox" class="edit-double-out" ${firstMatch?.double_out ? 'checked' : ''} />
                          <span class="text-gray-700 dark:text-gray-300">Double Out</span>
                        </label>
                        <div class="flex gap-2">
                          <button class="gameday-save-edit bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold transition-all" data-gameday-save="${gd.id}">💾 Speichern</button>
                          <button class="gameday-cancel-edit bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold transition-all" data-gameday-cancel="${gd.id}">Abbrechen</button>
                        </div>
                      </div>

                      ${gdMatches.length === 0 ? '<div class="p-3 text-center text-gray-400 text-sm">Keine Matches</div>' :
                        gdMatches.map(m => `
                        <div class="flex items-center justify-between p-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors" data-match-row="${m.id}">
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                              ${m.p1?.name || '?'} <span class="text-gray-400">vs</span> ${m.p2?.name || '?'}
                            </div>
                            <div class="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>Board ${m.board}</span>
                              ${m.round_no ? `<span>R${m.round_no}</span>` : ''}
                              <span class="${m.finished_at ? 'text-gray-400' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}">${m.finished_at ? '✓ fertig' : '● offen'}</span>
                            </div>
                          </div>
                          <button class="match-delete-btn bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-600 dark:text-red-400 w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ml-2 flex-shrink-0" data-match-delete="${m.id}" data-gameday-ref="${gd.id}" title="Match löschen">✕</button>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                  `;
                }).join('')}
            </div>
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
            <input name="boSets" type="number" min="1" max="21" value="1" class="w-full px-4 py-3 border-2 border-rose-300 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition text-lg font-semibold" />
          </div>
          <div>
            <label class="block mb-2 text-sm font-semibold text-gray-700">Best of Legs</label>
            <input name="boLegs" type="number" min="1" max="11" value="5" class="w-full px-4 py-3 border-2 border-rose-300 rounded-lg focus:border-rose-500 focus:ring-2 focus:ring-rose-200 transition text-lg font-semibold" />
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

  // Button-Handler: Wechselt zur Scorer-Seite
  const gotoScorerBtn = document.getElementById('gotoScorerBtn');
  if (gotoScorerBtn) gotoScorerBtn.onclick = () => { window.location.hash = '#/scorer'; };

  // Logout im Formular
  document.getElementById('logoutBtn3').onclick = async () => {
    await logout();
    window.location.hash = '#/login';
  };

  // ---- SPIELTAG-VERWALTUNG Event-Handler ----

  // Toggle: Matches ein-/ausklappen
  document.querySelectorAll('[data-gameday-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gdId = btn.dataset.gamedayToggle;
      const matchesDiv = document.getElementById(`gameday-matches-${gdId}`);
      if (matchesDiv) {
        matchesDiv.classList.toggle('hidden');
        btn.textContent = matchesDiv.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  });

  // Edit: Einstellungen bearbeiten
  document.querySelectorAll('[data-gameday-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gdId = btn.dataset.gamedayEdit;
      const matchesDiv = document.getElementById(`gameday-matches-${gdId}`);
      const editPanel = document.getElementById(`gameday-edit-${gdId}`);
      if (matchesDiv) matchesDiv.classList.remove('hidden');
      if (editPanel) editPanel.classList.toggle('hidden');
      // Toggle-Button aktualisieren
      const toggleBtn = document.querySelector(`[data-gameday-toggle="${gdId}"]`);
      if (toggleBtn) toggleBtn.textContent = '▲';
    });
  });

  // Edit: Speichern
  document.querySelectorAll('[data-gameday-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gdId = btn.dataset.gamedaySave;
      const editPanel = document.getElementById(`gameday-edit-${gdId}`);
      if (!editPanel) return;

      const newBoSets = parseInt(editPanel.querySelector('.edit-bo-sets').value, 10);
      const newBoLegs = parseInt(editPanel.querySelector('.edit-bo-legs').value, 10);
      const newDoubleOut = editPanel.querySelector('.edit-double-out').checked;

      if (newBoSets % 2 === 0 || newBoLegs % 2 === 0) {
        alert('Best-of muss ungerade sein (1, 3, 5...)');
        return;
      }

      // Alle offenen Matches dieses Spieltags aktualisieren
      const gdMatches = allMatches.filter(m => m.gameday_id === gdId && !m.finished_at);
      let errorCount = 0;
      for (const m of gdMatches) {
        const { error } = await supabase
          .from('matches')
          .update({ best_of_sets: newBoSets, best_of_legs: newBoLegs, double_out: newDoubleOut })
          .eq('id', m.id);
        if (error) errorCount++;
      }

      if (errorCount > 0) {
        alert(`${errorCount} Matches konnten nicht aktualisiert werden.`);
      }

      // Dashboard neu laden
      renderDashboard();
    });
  });

  // Edit: Abbrechen
  document.querySelectorAll('[data-gameday-cancel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gdId = btn.dataset.gamedayCancel;
      const editPanel = document.getElementById(`gameday-edit-${gdId}`);
      if (editPanel) editPanel.classList.add('hidden');
    });
  });

  // Einzelnes Match löschen
  document.querySelectorAll('[data-match-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const matchId = btn.dataset.matchDelete;
      const gdId = btn.dataset.gamedayRef;

      // Match-Name für Bestätigung
      const match = allMatches.find(m => m.id === matchId);
      const matchName = match ? `${match.p1?.name || '?'} vs ${match.p2?.name || '?'}` : 'dieses Match';

      if (!confirm(`"${matchName}" wirklich löschen?\n\nAlle zugehörigen Legs und Würfe werden ebenfalls gelöscht.`)) return;

      // Zugehörige Throws und Legs löschen
      await supabase.from('throws').delete().eq('match_id', matchId);
      await supabase.from('legs').delete().eq('match_id', matchId);
      const { error } = await supabase.from('matches').delete().eq('id', matchId);

      if (error) {
        alert('Fehler beim Löschen: ' + error.message);
        return;
      }

      // Match-Zeile aus UI entfernen
      const row = document.querySelector(`[data-match-row="${matchId}"]`);
      if (row) {
        row.style.transition = 'opacity 0.3s, transform 0.3s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(50px)';
        setTimeout(() => {
          row.remove();
          // Prüfen ob der Spieltag noch Matches hat
          const remaining = document.querySelectorAll(`#gameday-matches-${gdId} [data-match-row]`);
          if (remaining.length === 0) {
            // Spieltag auch löschen wenn keine Matches mehr da sind
            supabase.from('gamedays').delete().eq('id', gdId).then(() => {
              renderDashboard();
            });
          }
        }, 300);
      }
    });
  });

  // Ganzen Spieltag löschen
  document.querySelectorAll('[data-gameday-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gdId = btn.dataset.gamedayDelete;
      const gdData = gamedayMap.get(gdId);
      const matchCount = gdData?.matches?.length || 0;

      if (!confirm(`Spieltag "${gdData?.date || '?'}" mit ${matchCount} Matches wirklich komplett löschen?\n\nAlle Matches, Legs und Würfe werden unwiderruflich gelöscht!`)) return;

      // Alle zugehörigen Daten löschen
      const matchIds = (gdData?.matches || []).map(m => m.id);
      for (const mid of matchIds) {
        await supabase.from('throws').delete().eq('match_id', mid);
        await supabase.from('legs').delete().eq('match_id', mid);
      }
      // Matches löschen
      for (const mid of matchIds) {
        await supabase.from('matches').delete().eq('id', mid);
      }
      // Spieltag löschen
      await supabase.from('gamedays').delete().eq('id', gdId);

      // Dashboard neu laden
      renderDashboard();
    });
  });

  // Alle Spieltage löschen
  const deleteAllBtn = document.getElementById('deleteAllGamedays');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      const totalMatches = allMatches.length;
      const totalGamedays = allGamedays.length;

      if (!confirm(`Wirklich ALLE ${totalGamedays} Spieltage mit insgesamt ${totalMatches} Matches löschen?\n\nAlle Daten (Matches, Legs, Würfe) werden unwiderruflich gelöscht!`)) return;

      deleteAllBtn.textContent = '⏳ Lösche...';
      deleteAllBtn.disabled = true;

      // Alle Throws, Legs, Matches, Gamedays löschen
      for (const m of allMatches) {
        await supabase.from('throws').delete().eq('match_id', m.id);
        await supabase.from('legs').delete().eq('match_id', m.id);
      }
      for (const m of allMatches) {
        await supabase.from('matches').delete().eq('id', m.id);
      }
      for (const gd of allGamedays) {
        await supabase.from('gamedays').delete().eq('id', gd.id);
      }

      renderDashboard();
    });
  }

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
          form.elements.boSets.value = t.boSets || 1;
          form.elements.boLegs.value = t.boLegs || 5;
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
      boSets: parseInt(form.elements.boSets.value) || 1,
      boLegs: parseInt(form.elements.boLegs.value) || 5,
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

  // "Alle Matches löschen"-Button
  scorerContent.innerHTML = `
    <div class="flex justify-end mb-3">
      <button id="deleteAllBoardMatches" class="bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
        🗑️ Alle Matches löschen (Board ${currentBoard})
      </button>
    </div>
  ` + sortedRounds.map(([roundNo, roundMatches]) => {
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
            <div class="relative group">
              <button type="button" class="w-full bg-gradient-to-br ${isCurrentRound ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-400 dark:border-emerald-500' : 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-300 dark:border-blue-500'} border-2 rounded-xl p-4 hover:shadow-2xl hover:scale-[1.02] transition-all duration-200 text-left" data-mid="${m.id}">
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
              <button type="button" class="scorer-match-delete absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10" data-delete-mid="${m.id}" title="Match löschen">✕</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  // --- Einzelnes Match löschen (✕ Button) ---
  scorerContent.querySelectorAll('.scorer-match-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const matchId = btn.dataset.deleteMid;
      const match = matches.find(x => String(x.id) === String(matchId));
      const matchName = match ? `${match.p1?.name || '?'} vs ${match.p2?.name || '?'}` : 'dieses Match';

      if (!confirm(`"${matchName}" wirklich löschen?`)) return;

      await supabase.from('throws').delete().eq('match_id', matchId);
      await supabase.from('legs').delete().eq('match_id', matchId);
      await supabase.from('matches').delete().eq('id', matchId);

      // Scorer neu laden
      renderScorer();
    });
  });

  // --- Alle Matches dieses Boards löschen ---
  const deleteAllBoardBtn = document.getElementById('deleteAllBoardMatches');
  if (deleteAllBoardBtn) {
    deleteAllBoardBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!confirm(`Alle ${matches.length} offenen Matches auf Board ${currentBoard} löschen?`)) return;

      deleteAllBoardBtn.textContent = '⏳ Lösche...';
      deleteAllBoardBtn.disabled = true;

      for (const m of matches) {
        await supabase.from('throws').delete().eq('match_id', m.id);
        await supabase.from('legs').delete().eq('match_id', m.id);
        await supabase.from('matches').delete().eq('id', m.id);
      }

      renderScorer();
    });
  }

  // --- Match starten (Event-Delegation, ignoriert Lösch-Buttons) ---
  let matchSelectLock = false;
  function handleMatchSelect(e) {
    // Lösch-Buttons ignorieren
    if (e.target.closest('.scorer-match-delete') || e.target.closest('#deleteAllBoardMatches')) return;

    e.preventDefault();
    e.stopPropagation();
    if (matchSelectLock) return;
    matchSelectLock = true;
    setTimeout(() => matchSelectLock = false, 400);
    const btn = e.target.closest('button[data-mid]');
    if (!btn) return;
    const m = matches.find(x => String(x.id).trim() === String(btn.dataset.mid).trim());
    if (m) startMatch(m);
  }
  scorerContent.addEventListener('click', handleMatchSelect);
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
  renderStatsPage();
}
