// Dashboard UI - Spieltag-Verwaltung, Konfiguration, Vorlagen
import { supabase } from '../supabase-mock.js';
import { logout } from '../auth.js';
import { generateRoundRobinRounds, distributeToBoards } from '../pairing.js';
import { navigateTo } from '../router.js';
import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * Rendert das Dashboard
 */
export async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="relative">
      <button id="logoutBtn" class="absolute top-4 right-4">Logout</button>
      <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    </div>
    <p class="text-center mt-4">Lade Spieler...</p>
    <div id="openMatches" class="mt-6"></div>
  `;

  document.getElementById('logoutBtn').onclick = async () => {
    await logout();
    navigateTo('#/login');
  };

  // Daten parallel laden
  const [allMatches, allGamedays, players] = await loadDashboardData();
  if (players === null) return; // Fehler bereits angezeigt

  const openMatches = allMatches.filter(m => !m.finished_at);
  const gamedayMap = buildGamedayMap(allGamedays, allMatches);

  // UI rendern
  app.innerHTML = buildDashboardHTML(allGamedays, openMatches, players, gamedayMap);

  // Event-Handler initialisieren
  initDashboardEvents(app, allMatches, allGamedays, gamedayMap, players, openMatches);
}

// ============================================================
// DATEN LADEN
// ============================================================

async function loadDashboardData() {
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

  // Leere Spieltage aufräumen (keine Matches mehr vorhanden)
  const gamedayIdsWithMatches = new Set(allMatches.map(m => m.gameday_id));
  const emptyGamedays = allGamedays.filter(gd => !gamedayIdsWithMatches.has(gd.id));
  if (emptyGamedays.length > 0) {
    console.log(`[Dashboard] ${emptyGamedays.length} leere Spieltage werden gelöscht`);
    for (const gd of emptyGamedays) {
      await supabase.from('gamedays').delete().eq('id', gd.id);
    }
    allGamedays = allGamedays.filter(gd => gamedayIdsWithMatches.has(gd.id));
  }

  const { data: players, error } = await supabase
    .from('users')
    .select('id,name')
    .order('name');

  if (error) {
    document.getElementById('app').innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return [[], [], null];
  }

  return [allMatches, allGamedays, players];
}

function buildGamedayMap(allGamedays, allMatches) {
  const gamedayMap = new Map();
  allGamedays.forEach(gd => gamedayMap.set(gd.id, { ...gd, matches: [] }));
  allMatches.forEach(m => {
    if (gamedayMap.has(m.gameday_id)) {
      gamedayMap.get(m.gameday_id).matches.push(m);
    }
  });
  return gamedayMap;
}

// ============================================================
// HTML BUILDING
// ============================================================

function buildDashboardHTML(allGamedays, openMatches, players, gamedayMap) {
  return `
    <div class="max-w-6xl mx-auto p-6">
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">🎯 Bullseyer Dashboard</h1>
        <button id="logoutBtn3" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all transform hover:scale-105">Logout</button>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 space-y-4">
          ${buildOpenMatchesBanner(openMatches)}
          ${buildGamedayList(allGamedays, gamedayMap, players)}
        </div>
        ${buildConfigForm(players)}
      </div>
    </div>
  `;
}

function buildOpenMatchesBanner(openMatches) {
  if (!openMatches.length) return '';
  return `
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
  `;
}

function buildGamedayList(allGamedays, gamedayMap, players) {
  return `
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
        ${allGamedays.length === 0
          ? '<div class="text-center text-gray-400 py-8">Noch keine Spieltage</div>'
          : allGamedays.map(gd => buildGamedayCard(gd, gamedayMap)).join('')}
      </div>
    </div>
  `;
}

function buildGamedayCard(gd, gamedayMap) {
  const gdData = gamedayMap.get(gd.id);
  const gdMatches = gdData?.matches || [];
  const openCount = gdMatches.filter(m => !m.finished_at).length;
  const finishedCount = gdMatches.filter(m => m.finished_at).length;
  const firstMatch = gdMatches[0];
  const settings = firstMatch ? `BO${firstMatch.best_of_sets}S / BO${firstMatch.best_of_legs}L${firstMatch.double_out ? ' • DO' : ''}` : '';

  return `
    <div class="border-2 ${openCount > 0 ? 'border-emerald-300 dark:border-emerald-600' : 'border-gray-200 dark:border-gray-600'} rounded-xl overflow-hidden" data-gameday-id="${gd.id}">
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
      <div class="gameday-matches hidden" id="gameday-matches-${gd.id}">
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
        ${gdMatches.length === 0
          ? '<div class="p-3 text-center text-gray-400 text-sm">Keine Matches</div>'
          : gdMatches.map(m => `
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
}

function buildConfigForm(players) {
  return `
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
        ${buildTemplateSection()}
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
  `;
}

function buildTemplateSection() {
  return `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg font-bold text-gray-800 dark:text-gray-200">📋 Spieltag-Vorlage</h3>
      </div>
      <div id="templateArea" class="flex flex-wrap gap-2 mb-3"></div>
      <div class="flex gap-2">
        <input id="templateNameInput" type="text" placeholder="Vorlagenname..." maxlength="30" class="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-200" />
        <button type="button" id="saveTemplateBtn" class="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow transition-all">
          💾 Speichern
        </button>
      </div>
      <p class="text-xs text-gray-500 mt-1">Speichert ausgewählte Spieler + Einstellungen als Vorlage</p>
    </div>
  `;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function initDashboardEvents(app, allMatches, allGamedays, gamedayMap, players, openMatches) {
  // Logout
  document.getElementById('logoutBtn3')?.addEventListener('click', async () => {
    await logout();
    navigateTo('#/login');
  });

  // Scorer-Link
  document.getElementById('gotoScorerBtn')?.addEventListener('click', () => navigateTo('#/scorer'));

  // Spieltag-Verwaltung (Event-Delegation auf dem ganzen Dashboard)
  initGamedayManagement(allMatches, allGamedays, gamedayMap);

  // Spieler-Auswahl
  const selectedPlayers = initPlayerSelection(players);

  // Vorlagen
  initTemplates(players, selectedPlayers);

  // Formular Submit
  initConfigForm(players, selectedPlayers);
}

function initGamedayManagement(allMatches, allGamedays, gamedayMap) {
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

      const gdMatches = allMatches.filter(m => m.gameday_id === gdId && !m.finished_at);
      for (const m of gdMatches) {
        await supabase.from('matches').update({ best_of_sets: newBoSets, best_of_legs: newBoLegs, double_out: newDoubleOut }).eq('id', m.id);
      }
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
      const match = allMatches.find(m => m.id === matchId);
      const matchName = match ? `${match.p1?.name || '?'} vs ${match.p2?.name || '?'}` : 'dieses Match';

      if (!confirm(`"${matchName}" wirklich löschen?\n\nAlle zugehörigen Legs und Würfe werden ebenfalls gelöscht.`)) return;

      await supabase.from('throws').delete().eq('match_id', matchId);
      await supabase.from('legs').delete().eq('match_id', matchId);
      const { error } = await supabase.from('matches').delete().eq('id', matchId);
      if (error) { alert('Fehler beim Löschen: ' + error.message); return; }

      const row = document.querySelector(`[data-match-row="${matchId}"]`);
      if (row) {
        row.style.transition = 'opacity 0.3s, transform 0.3s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(50px)';
        setTimeout(() => {
          row.remove();
          const remaining = document.querySelectorAll(`#gameday-matches-${gdId} [data-match-row]`);
          if (remaining.length === 0) {
            supabase.from('gamedays').delete().eq('id', gdId).then(() => renderDashboard());
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

      if (!confirm(`Spieltag "${gdData?.date || '?'}" mit ${matchCount} Matches wirklich komplett löschen?`)) return;

      const matchIds = (gdData?.matches || []).map(m => m.id);
      for (const mid of matchIds) {
        await supabase.from('throws').delete().eq('match_id', mid);
        await supabase.from('legs').delete().eq('match_id', mid);
        await supabase.from('matches').delete().eq('id', mid);
      }
      await supabase.from('gamedays').delete().eq('id', gdId);
      renderDashboard();
    });
  });

  // Alle Spieltage löschen
  const deleteAllBtn = document.getElementById('deleteAllGamedays');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (!confirm(`Wirklich ALLE ${allGamedays.length} Spieltage mit ${allMatches.length} Matches löschen?`)) return;
      deleteAllBtn.textContent = '⏳ Lösche...';
      deleteAllBtn.disabled = true;

      for (const m of allMatches) {
        await supabase.from('throws').delete().eq('match_id', m.id);
        await supabase.from('legs').delete().eq('match_id', m.id);
        await supabase.from('matches').delete().eq('id', m.id);
      }
      for (const gd of allGamedays) {
        await supabase.from('gamedays').delete().eq('id', gd.id);
      }
      renderDashboard();
    });
  }
}

// ============================================================
// SPIELER-AUSWAHL
// ============================================================

const PLAYER_CLASS_DEFAULT = 'cursor-pointer text-center py-3 px-4 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 font-semibold text-gray-800 dark:text-gray-200';
const PLAYER_CLASS_SELECTED = 'cursor-pointer text-center py-3 px-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 border-2 border-blue-600 dark:border-blue-500 rounded-lg hover:shadow-2xl transition-all duration-200 font-bold text-blue-700 dark:text-blue-300 ring-4 ring-blue-300 dark:ring-blue-500/50 shadow-xl scale-105';

function initPlayerSelection(players) {
  const selectedPlayers = new Set();
  const playerListEl = document.getElementById('playerList');
  if (!playerListEl) return selectedPlayers;

  playerListEl.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.textContent = p.name;
    div.className = PLAYER_CLASS_DEFAULT;
    div.dataset.playerId = p.id;
    div.onclick = () => {
      if (selectedPlayers.has(p.id)) {
        selectedPlayers.delete(p.id);
        div.className = PLAYER_CLASS_DEFAULT;
      } else {
        selectedPlayers.add(p.id);
        div.className = PLAYER_CLASS_SELECTED;
      }
    };
    playerListEl.appendChild(div);
  });

  return selectedPlayers;
}

function applyPlayerSelection(playerIds, players, selectedPlayers) {
  const playerListEl = document.getElementById('playerList');
  if (!playerListEl) return;

  selectedPlayers.clear();
  playerListEl.querySelectorAll('div').forEach(div => {
    div.className = PLAYER_CLASS_DEFAULT;
  });

  playerIds.forEach(id => {
    const player = players.find(p => p.id === id);
    if (!player) return;
    selectedPlayers.add(id);
    const div = playerListEl.querySelector(`[data-player-id="${id}"]`);
    if (div) div.className = PLAYER_CLASS_SELECTED;
  });
}

// ============================================================
// VORLAGEN
// ============================================================

const TEMPLATE_KEY = 'bullseyer_gameday_templates';

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); }
  catch { return []; }
}

function saveTemplatesStorage(templates) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function initTemplates(players, selectedPlayers) {
  renderTemplateList(players, selectedPlayers);

  document.getElementById('saveTemplateBtn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('templateNameInput');
    const name = nameInput.value.trim();

    if (!name) {
      flashError(nameInput, 'Name eingeben!');
      return;
    }
    if (selectedPlayers.size < 2) {
      flashError(nameInput, 'Erst Spieler wählen!');
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
    const existingIdx = templates.findIndex(t => t.name === name);
    if (existingIdx >= 0) templates[existingIdx] = template;
    else templates.push(template);
    saveTemplatesStorage(templates);

    nameInput.value = '';
    renderTemplateList(players, selectedPlayers);
  });
}

function renderTemplateList(players, selectedPlayers) {
  const templates = loadTemplates();
  const area = document.getElementById('templateArea');
  if (!area) return;

  if (templates.length === 0) {
    area.innerHTML = '<p class="text-sm text-gray-400">Keine Vorlagen gespeichert</p>';
    return;
  }

  area.innerHTML = templates.map((t, i) => {
    const playerNames = t.playerIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean);
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
      const t = templates[parseInt(btn.dataset.templateIdx)];
      if (!t) return;
      applyPlayerSelection(t.playerIds, players, selectedPlayers);
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
      const t = loadTemplates();
      t.splice(idx, 1);
      saveTemplatesStorage(t);
      renderTemplateList(players, selectedPlayers);
    });
  });
}

// ============================================================
// FORMULAR SUBMIT
// ============================================================

function initConfigForm(players, selectedPlayers) {
  const form = document.getElementById('cfgForm');
  if (!form) return;

  form.onsubmit = async e => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const defaultBtnText = submitBtn?.textContent || '';
    const { boSets, boLegs, doubleOut, numBoards } = e.target.elements;

    if (selectedPlayers.size < 2) {
      showBtnError(submitBtn, 'Mindestens zwei Spieler wählen!', defaultBtnText);
      return;
    }

    const boS = parseInt(boSets.value, 10);
    const boL = parseInt(boLegs.value, 10);

    if (boS % 2 === 0 || boL % 2 === 0) {
      showBtnError(submitBtn, 'Best-of muss ungerade sein!', defaultBtnText);
      return;
    }

    // Spieltag anlegen
    const { data: gd, error: gdErr } = await supabase
      .from('gamedays')
      .insert({ date: new Date().toISOString().slice(0, 10) })
      .select()
      .single();

    if (gdErr) {
      showBtnError(submitBtn, 'Fehler beim Anlegen des Spieltags', defaultBtnText);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.GAMEDAY, gd.id);

    // Matches generieren
    const boards = parseInt(numBoards.value, 10) || 1;
    const rounds = generateRoundRobinRounds([...selectedPlayers]);
    const distributed = distributeToBoards(rounds, boards);

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

    const { error: matchErr } = await supabase.from('matches').insert(matchesToInsert);
    if (matchErr) {
      showBtnError(submitBtn, 'Fehler beim Anlegen der Matches!', defaultBtnText);
      return;
    }

    navigateTo('#/scorer');
  };
}

// ============================================================
// HELPERS
// ============================================================

function flashError(input, message) {
  input.classList.add('border-red-500');
  const oldPlaceholder = input.placeholder;
  input.placeholder = message;
  input.value = '';
  setTimeout(() => {
    input.classList.remove('border-red-500');
    input.placeholder = oldPlaceholder;
  }, 2000);
}

function showBtnError(btn, message, defaultText) {
  if (!btn) { alert(message); return; }
  btn.textContent = message;
  btn.classList.add('bg-red-600');
  setTimeout(() => {
    btn.textContent = defaultText;
    btn.classList.remove('bg-red-600');
  }, 3000);
}
