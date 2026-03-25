// Livescorer Haupt-Modul - koordiniert alle Sub-Module
import * as store from '../../state/store.js';
import { createLeg } from '../../services/match.js';
import { getPlayerNames } from '../../utils/players.js';
import { START_SCORE, DEFAULT_BEST_OF_LEGS, DEFAULT_BEST_OF_SETS } from '../../utils/constants.js';
import { updateAllDisplays, updatePlayerIndicator, updateCheckoutHint } from './display.js';
import { initScoreInput, resetScoreInput } from './keypad.js';
import { initEventDelegation, initUndoHandler, initStarterSelection, initBackButton, initStatsToggle } from './events.js';

// Re-exports für Kompatibilität
export { createLeg as resetLeg } from '../../services/match.js';
export { saveLeg } from '../../services/match.js';

/**
 * Rendert die Livescorer-UI
 */
export function renderLiveScorer(params) {
  const {
    app,
    currentMatch,
    bestSet = DEFAULT_BEST_OF_SETS,
    bestLeg = DEFAULT_BEST_OF_LEGS
  } = params;

  if (!app) {
    console.error('[Livescorer] Kein App-Container');
    return;
  }

  if (currentMatch && store.getCurrentMatch()?.id !== currentMatch.id) {
    store.initNewMatch(currentMatch);
  }

  const match = store.getCurrentMatch();
  if (!match) {
    console.error('[Livescorer] Kein Match im Store');
    return;
  }

  if (!store.getCurrentLeg()) {
    const leg = createLeg(match, store.getCurrentSetNo(), store.getCurrentLegNo());
    store.setCurrentLeg(leg);
  }

  const names = getPlayerNames(match);
  const gameStarter = store.getGameStarter();

  // HTML rendern
  app.innerHTML = buildLivescorerHTML(match, names, bestSet, bestLeg, gameStarter);

  // Event-Handler initialisieren
  initEventDelegation({ bestSet, bestLeg });
  initScoreInput(app, { bestSet, bestLeg });
  initUndoHandler(app, () => {
    updateAllDisplays(bestSet, bestLeg);
    updateCheckoutHint();
  });
  initStarterSelection(app, () => {
    renderLiveScorer(params);
  });
  initBackButton(app);
  initStatsToggle(app);

  // Initiale UI-Updates
  setTimeout(() => {
    updateAllDisplays(bestSet, bestLeg);
    updateCheckoutHint();
    updatePlayerIndicator();
  }, 10);

  // Header ausblenden
  const mainHeader = document.getElementById('mainHeader');
  if (mainHeader) mainHeader.style.display = 'none';

  document.title = 'Livescorer';
  console.log('[Livescorer] Render abgeschlossen');
}

/**
 * Baut das HTML für den Livescorer
 */
function buildLivescorerHTML(match, names, bestSet, bestLeg, gameStarter) {
  const state = store.getState();

  return `
    <div class="max-w-5xl mx-auto px-2">

      <!-- Top Bar: Zurück + Set/Leg Info -->
      <div class="flex items-center justify-between mb-3">
        <button id="backToMatchSelect" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-semibold text-sm flex items-center gap-1 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Zurück
        </button>
        <div class="text-sm font-bold bg-gray-800 dark:bg-gray-900 text-white px-4 py-1.5 rounded-full shadow">
          Set ${state.currentSetNo} • Leg ${state.currentLegNo}
          ${gameStarter ? ` <span class="text-emerald-400 ml-1">▶ ${state.legStarter === 'p1' ? names.p1 : names.p2}</span>` : ''}
        </div>
        <div class="w-16"></div>
      </div>

      <!-- Spieler-Boxen: Kompakt nebeneinander -->
      <div class="grid grid-cols-2 gap-3 mb-3">
        ${buildPlayerBox(names.p1, 'p1', 'emerald', state)}
        ${buildPlayerBox(names.p2, 'p2', 'rose', state)}
      </div>

      <!-- Checkout Hint -->
      <div id="checkoutHint" class="hidden text-center mb-2 text-lg lg:text-xl font-bold text-amber-600 dark:text-amber-400 animate-pulse"></div>

      <!-- Startspieler-Auswahl -->
      ${gameStarter === null ? buildStarterSelection(names) : ''}

      <!-- Stats Panel (eingeklappt) -->
      ${buildStatsPanel(names)}

      <!-- Score-Eingabe -->
      <div id="scoreInputArea" class="bg-white dark:bg-slate-800 rounded-2xl border-2 border-gray-200 dark:border-slate-600 shadow-xl overflow-hidden">

        <!-- Score Display Bar -->
        <div class="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800 px-4 py-3 border-b border-gray-200 dark:border-slate-600">
          <div class="flex items-center justify-between">
            <!-- Modus-Toggle -->
            <button type="button" id="inputModeToggle" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95 flex items-center gap-1.5">
              <span>🔄</span>
              <span id="inputModeLabel">Score</span>
            </button>

            <!-- Score Anzeige -->
            <div class="flex-1 text-center">
              <div id="scoreDisplay" class="text-5xl lg:text-6xl font-bold text-gray-800 dark:text-gray-100 tabular-nums inline-block min-w-[140px] border-b-4 border-gray-300 dark:border-slate-500 pb-1 transition-colors">
                0
              </div>
              <div id="calculatedScore" class="hidden text-sm font-semibold mt-0.5"></div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5" id="inputModeDesc">Geworfene Punkte eingeben</div>
            </div>

            <!-- Undo + No Score -->
            <div class="flex flex-col gap-1.5">
              <button id="undoBtn" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95">
                ⏪ Undo
              </button>
              <button id="bustBtn" class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95">
                0 Punkte
              </button>
            </div>
          </div>
        </div>

        <!-- Numpad + Quick Scores -->
        <div class="flex">
          <!-- Numpad -->
          <div class="flex-1 p-3 lg:p-4">
            <div class="grid grid-cols-3 gap-2 lg:gap-2.5">
              ${[1,2,3,4,5,6,7,8,9].map(d => `
                <button type="button" data-digit="${d}" class="numpad-btn bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-500 rounded-xl text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white py-4 lg:py-5 shadow-sm transition-all active:scale-95 active:bg-gray-200">${d}</button>
              `).join('')}
              <button type="button" id="clearBtn" class="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-xl lg:text-2xl font-bold py-4 lg:py-5 shadow-sm transition-all active:scale-95">C</button>
              <button type="button" data-digit="0" class="numpad-btn bg-white dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-500 rounded-xl text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white py-4 lg:py-5 shadow-sm transition-all active:scale-95 active:bg-gray-200">0</button>
              <button type="button" id="backspaceBtn" class="bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl text-xl lg:text-2xl font-bold py-4 lg:py-5 shadow-sm transition-all active:scale-95">⌫</button>
            </div>
            <button type="button" id="submitScore" class="w-full mt-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xl lg:text-2xl font-bold py-4 lg:py-5 rounded-xl shadow-lg transition-all active:scale-95">
              OK ✓
            </button>
          </div>

          <!-- Quick Scores (rechte Spalte) -->
          <div class="w-28 lg:w-36 bg-gray-50 dark:bg-slate-750 border-l border-gray-200 dark:border-slate-600 p-2 lg:p-3 flex flex-col gap-1.5 lg:gap-2">
            <div class="text-[10px] lg:text-xs font-bold text-gray-400 dark:text-gray-500 text-center tracking-wider uppercase">Quick</div>
            ${buildQuickScoreButtons()}
          </div>
        </div>
      </div>

      <!-- Hidden Overlays -->
      <div id="checkoutDialog" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 hidden items-center justify-center">
        <div class="dialog-inner bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-amber-400 p-8 mx-4 w-full max-w-sm text-center"></div>
      </div>
      <div id="legWonOverlay" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden items-center justify-center"></div>
      <div id="bustToast" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 hidden">
        <div class="bg-red-600 text-white text-3xl font-bold px-10 py-6 rounded-2xl shadow-2xl animate-bounce">BUST! 💥</div>
      </div>
    </div>
  `;
}

function buildPlayerBox(name, key, color, state) {
  const remaining = state.remaining[key];
  const setsWon = state.setsWon[key];
  const legsWon = state.legsWon[key];
  const prefix = key === 'p1' ? 'P1' : 'P2';
  const idPrefix = key === 'p1' ? 'p1' : 'p2';

  return `
    <div class="${key === 'p1' ? 'player1' : 'player2'}-box bg-gradient-to-br from-${color}-50 to-${color}-100 dark:from-${color}-900/40 dark:to-${color}-800/30 border-3 border-${color}-500 dark:border-${color}-600 rounded-2xl p-3 lg:p-5 flex flex-col items-center shadow-lg transition-all">
      <!-- Name -->
      <div class="font-bold text-lg lg:text-xl text-${color}-900 dark:text-${color}-100 truncate max-w-full">${name}</div>
      <!-- Restpunkte -->
      <div class="text-6xl lg:text-8xl font-black text-${color}-700 dark:text-${color}-300 tabular-nums leading-none my-1 lg:my-3" id="rest${prefix}">${remaining}</div>
      <!-- Averages -->
      <div class="flex items-center gap-1.5 lg:gap-2 flex-wrap justify-center">
        <span class="text-[10px] lg:text-xs font-semibold bg-${color}-200/80 dark:bg-${color}-800/50 text-${color}-800 dark:text-${color}-200 px-1.5 py-0.5 rounded" id="avg${prefix}Leg">Leg Ø -</span>
        <span class="text-[10px] lg:text-xs font-semibold bg-${color}-300/60 dark:bg-${color}-700/50 text-${color}-800 dark:text-${color}-200 px-1.5 py-0.5 rounded" id="avg${prefix}Match">Match Ø -</span>
      </div>
      <!-- Darts + Sets/Legs -->
      <div class="flex gap-1.5 mt-1.5 text-[10px] lg:text-xs flex-wrap justify-center">
        <span class="font-semibold text-${color}-700 dark:text-${color}-300 bg-white/70 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-full" id="${idPrefix}SetsDisplay">S: ${setsWon}</span>
        <span class="font-semibold text-${color}-700 dark:text-${color}-300 bg-white/70 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-full" id="${idPrefix}LegsDisplay">L: ${legsWon}</span>
        <span class="font-semibold text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-full" id="${idPrefix}DartsLeg" title="Darts im aktuellen Leg">🎯 0</span>
        <span class="font-semibold text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-full" id="${idPrefix}DartsMatch" title="Darts im Match">Σ 0</span>
      </div>
    </div>
  `;
}

function buildQuickScoreButtons() {
  const scores = [
    { val: 180, bg: 'bg-amber-500 hover:bg-amber-600 text-white' },
    { val: 140, bg: 'bg-amber-400 hover:bg-amber-500 text-white' },
    { val: 100, bg: 'bg-indigo-500 hover:bg-indigo-600 text-white' },
    { val: 85,  bg: 'bg-blue-400 hover:bg-blue-500 text-white' },
    { val: 60,  bg: 'bg-sky-400 hover:bg-sky-500 text-white' },
    { val: 45,  bg: 'bg-cyan-400 hover:bg-cyan-500 text-white' },
    { val: 41,  bg: 'bg-teal-400 hover:bg-teal-500 text-white' },
    { val: 26,  bg: 'bg-gray-400 hover:bg-gray-500 text-white' },
  ];

  return scores.map(s =>
    `<button data-score="${s.val}" class="quick-score-btn ${s.bg} rounded-lg text-base lg:text-lg font-bold py-2 lg:py-2.5 shadow-sm transition-all active:scale-95">${s.val}</button>`
  ).join('');
}

function buildStatsPanel(names) {
  return `
    <div class="bg-gray-800 dark:bg-gray-900 rounded-xl p-3 mb-3 shadow-lg border border-gray-700">
      <div class="flex justify-between items-center">
        <span class="text-sm font-bold text-gray-300 flex items-center gap-1.5">📊 Stats</span>
        <button id="toggleStats" class="text-gray-400 hover:text-white text-xs font-semibold transition-colors">
          <span id="toggleStatsText">▼ Details</span>
        </button>
      </div>
      <div id="statsDetails" class="hidden mt-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-emerald-900/40 rounded-lg p-2.5 border border-emerald-700/50">
            <div class="text-xs font-bold text-emerald-400 mb-1.5 text-center">${names.p1}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-300">
              <span>🎯 180s</span><span id="p1_180s" class="text-right font-bold text-amber-400">0</span>
              <span>💯 140+</span><span id="p1_140plus" class="text-right font-bold text-emerald-400">0</span>
              <span>🏆 High</span><span id="p1_highscore" class="text-right font-bold text-white">0</span>
              <span>🎲 Darts</span><span id="p1_darts_match" class="text-right font-bold">0</span>
            </div>
          </div>
          <div class="bg-rose-900/40 rounded-lg p-2.5 border border-rose-700/50">
            <div class="text-xs font-bold text-rose-400 mb-1.5 text-center">${names.p2}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-300">
              <span>🎯 180s</span><span id="p2_180s" class="text-right font-bold text-amber-400">0</span>
              <span>💯 140+</span><span id="p2_140plus" class="text-right font-bold text-rose-400">0</span>
              <span>🏆 High</span><span id="p2_highscore" class="text-right font-bold text-white">0</span>
              <span>🎲 Darts</span><span id="p2_darts_match" class="text-right font-bold">0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStarterSelection(names) {
  return `
    <div id="starterSelection" class="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/40 dark:to-yellow-900/40 border-2 border-amber-400 dark:border-amber-600 rounded-xl p-4 mb-3 text-center shadow-lg">
      <div class="text-base font-bold mb-3 text-amber-900 dark:text-amber-100">Wer beginnt?</div>
      <div class="flex gap-3 justify-center">
        <button id="startP1" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">${names.p1}</button>
        <button id="startP2" class="bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">${names.p2}</button>
      </div>
    </div>
  `;
}
