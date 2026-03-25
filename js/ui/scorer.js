// Scorer UI - Match-Auswahl und Board-Selektion
import { supabase } from '../supabase-mock.js';
import * as store from '../state/store.js';
import { createLeg } from '../services/match.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { ensurePlayerNames } from '../utils/players.js';
import { navigateTo } from '../router.js';
import { renderLiveScorer } from './livescorer/index.js';
import { cleanupEventDelegation } from './livescorer/events.js';

let currentBoard = localStorage.getItem(STORAGE_KEYS.BOARD) || null;

/**
 * Rendert die Scorer-Seite (Board-Auswahl + Match-Liste oder Livescorer)
 * @returns {Function} Cleanup-Funktion
 */
export async function renderScorer() {
  const app = document.getElementById('app');

  const boards = await fetchBoards();
  if (!boards.length) {
    app.innerHTML = '<p class="text-center mt-8">Keine Spiele heute</p>';
    return () => {};
  }

  // Board-Default setzen
  if (!currentBoard || !boards.includes(String(currentBoard))) {
    currentBoard = boards[0];
    localStorage.setItem(STORAGE_KEYS.BOARD, currentBoard);
  }

  // Layout rendern
  app.innerHTML = buildScorerShell(boards);

  // Events
  initScorerEvents(app, boards);

  // Prüfe ob ein aktives Match vorliegt
  const activeMatch = await resolveActiveMatch();
  if (activeMatch) {
    renderLiveScorer({
      app,
      bestSet: activeMatch.best_of_sets,
      bestLeg: activeMatch.best_of_legs
    });
    return () => cleanupEventDelegation();
  }

  // Match-Liste anzeigen
  await renderMatchList();

  return () => cleanupEventDelegation();
}

// ============================================================
// AKTIVES MATCH AUFLÖSEN
// ============================================================

async function resolveActiveMatch() {
  // Bereits im Store?
  const storeMatch = store.getCurrentMatch();
  if (storeMatch) {
    ensurePlayerNames(storeMatch);
    return storeMatch;
  }

  // Aus localStorage?
  const matchId = localStorage.getItem(STORAGE_KEYS.CURRENT_MATCH_ID);
  if (!matchId) return null;

  const matches = await fetchOpenMatches(currentBoard, true);
  const m = matches.find(x => String(x.id) === String(matchId));
  if (!m) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_MATCH_ID);
    return null;
  }

  ensurePlayerNames(m);
  store.initNewMatch(m);
  store.setCurrentLeg(createLeg(m, 1, 1));
  return m;
}

// ============================================================
// MATCH-LISTE
// ============================================================

async function renderMatchList() {
  const scorerContent = document.getElementById('scorerContent');
  if (!scorerContent) return;

  const matches = await fetchOpenMatches(currentBoard, true);
  if (!matches.length) {
    scorerContent.innerHTML = `<p class="text-center mt-8 text-gray-500">Keine offenen Matches für Board ${currentBoard}</p>`;
    return;
  }

  // Nach Runden gruppieren
  const roundsMap = new Map();
  matches.forEach(m => {
    const rNo = m.round_no || 0;
    if (!roundsMap.has(rNo)) roundsMap.set(rNo, []);
    roundsMap.get(rNo).push(m);
  });
  const sortedRounds = [...roundsMap.entries()].sort((a, b) => a[0] - b[0]);
  const firstRound = sortedRounds[0]?.[0];

  scorerContent.innerHTML = buildDeleteAllButton(matches.length) + sortedRounds.map(([roundNo, roundMatches]) => {
    const isCurrentRound = roundNo === firstRound;
    return buildRoundSection(roundNo, roundMatches, isCurrentRound);
  }).join('');

  // Event-Handler
  initMatchListEvents(scorerContent, matches);
}

function buildRoundSection(roundNo, roundMatches, isCurrentRound) {
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
        ${roundMatches.map(m => buildMatchCard(m, isCurrentRound)).join('')}
      </div>
    </div>
  `;
}

function buildMatchCard(m, isCurrentRound) {
  const colorClass = isCurrentRound
    ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-400 dark:border-emerald-500'
    : 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-300 dark:border-blue-500';
  const accentColor = isCurrentRound ? 'text-emerald-600' : 'text-blue-600';
  const arrowColor = isCurrentRound ? 'text-emerald-500' : 'text-blue-400';

  return `
    <div class="relative group">
      <button type="button" class="w-full bg-gradient-to-br ${colorClass} border-2 rounded-xl p-4 hover:shadow-2xl hover:scale-[1.02] transition-all duration-200 text-left" data-mid="${m.id}">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
              ${m.p1?.name || '?'} <span class="${accentColor} mx-2">vs</span> ${m.p2?.name || '?'}
            </div>
            <div class="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>${m.gameday?.date || ''}</span>
              <span>BO${m.best_of_legs} Legs</span>
            </div>
          </div>
          <svg class="w-6 h-6 ${arrowColor} group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
          </svg>
        </div>
      </button>
      <button type="button" class="scorer-match-delete absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10" data-delete-mid="${m.id}" title="Match löschen">✕</button>
    </div>
  `;
}

function buildDeleteAllButton(matchCount) {
  return `
    <div class="flex justify-end mb-3">
      <button id="deleteAllBoardMatches" class="bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
        🗑️ Alle Matches löschen (Board ${currentBoard})
      </button>
    </div>
  `;
}

function initMatchListEvents(container, matches) {
  // Einzelnes Match löschen
  container.querySelectorAll('.scorer-match-delete').forEach(btn => {
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
      renderScorer();
    });
  });

  // Alle Matches löschen
  const deleteAllBtn = document.getElementById('deleteAllBoardMatches');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Alle ${matches.length} offenen Matches auf Board ${currentBoard} löschen?`)) return;

      deleteAllBtn.textContent = '⏳ Lösche...';
      deleteAllBtn.disabled = true;

      for (const m of matches) {
        await supabase.from('throws').delete().eq('match_id', m.id);
        await supabase.from('legs').delete().eq('match_id', m.id);
        await supabase.from('matches').delete().eq('id', m.id);
      }
      renderScorer();
    });
  }

  // Match starten (Event-Delegation)
  let matchSelectLock = false;
  container.addEventListener('click', (e) => {
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
  });
}

// ============================================================
// MATCH STARTEN
// ============================================================

async function startMatch(m) {
  const { data, error } = await supabase
    .from('matches')
    .select(`*, p1:users!matches_p1_id_fkey(id, name), p2:users!matches_p2_id_fkey(id, name)`)
    .eq('id', m.id)
    .single();

  if (error || !data) {
    alert('Fehler beim Laden des Matches!');
    return;
  }

  ensurePlayerNames(data);
  store.initNewMatch(data);
  store.setCurrentLeg(createLeg(data, 1, 1));
  localStorage.setItem(STORAGE_KEYS.CURRENT_MATCH_ID, data.id);
  navigateTo('#/livescorer');
}

// ============================================================
// SCORER SHELL
// ============================================================

function buildScorerShell(boards) {
  return `
    <div class="max-w-4xl mx-auto mt-6">
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
      <div id="scorerContent"></div>
    </div>
  `;
}

function initScorerEvents(app, boards) {
  document.getElementById('backToDashboard')?.addEventListener('click', () => {
    store.resetState();
    navigateTo('#/dashboard');
  });

  app.querySelectorAll('[data-board]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentBoard = String(btn.dataset.board);
      localStorage.setItem(STORAGE_KEYS.BOARD, currentBoard);
      store.resetState();
      renderScorer();
    });
  });
}

// ============================================================
// DB HELPERS
// ============================================================

async function fetchBoards() {
  const { data, error } = await supabase
    .from('matches')
    .select('board')
    .is('finished_at', null);

  if (error || !data?.length) return ['1'];

  const boards = [...new Set(data.map(m => String(m.board)))].sort((a, b) => Number(a) - Number(b));
  return boards.length > 0 ? boards : ['1'];
}

async function fetchOpenMatches(board, withDate = false) {
  let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, round_no, double_out, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
  if (withDate) selectStr += ', gameday:gamedays(date)';

  const { data, error } = await supabase
    .from('matches')
    .select(selectStr)
    .eq('board', Number(board))
    .is('finished_at', null)
    .order('round_no', { ascending: true });

  return data || [];
}
