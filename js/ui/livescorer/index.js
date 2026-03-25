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
    <div class="max-w-2xl mx-auto">
      <!-- Zurück-Button -->
      <div class="mb-3">
        <button id="backToMatchSelect" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg shadow-md transition-all font-semibold text-sm">← Zurück</button>
      </div>

      <!-- Spieler-Boxen -->
      <div class="flex flex-row justify-between gap-4 mb-4 items-stretch">
        <!-- Player 1 -->
        <div class="player1-box flex-1 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/40 dark:to-emerald-800/40 border-4 border-emerald-600 rounded-xl p-4 flex flex-col items-center shadow-xl">
          <div class="text-center font-bold text-xl text-emerald-900 dark:text-emerald-100 mb-2">${names.p1}</div>
          <div class="text-center text-7xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums my-2" id="restP1">${state.remaining.p1}</div>
          <div class="flex gap-2 text-xs">
            <span class="font-semibold text-emerald-800 dark:text-emerald-100 bg-emerald-200 dark:bg-emerald-700/60 px-2 py-1 rounded" id="avgP1Leg">Leg: Ø -</span>
            <span class="font-semibold text-emerald-800 dark:text-emerald-100 bg-emerald-300 dark:bg-emerald-600/60 px-2 py-1 rounded" id="avgP1Match">Match: Ø -</span>
          </div>
          <div class="flex gap-2 mt-2 text-xs">
            <span class="font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-700 px-2 py-1 rounded-full" id="p1SetsDisplay">Sets: ${state.setsWon.p1}</span>
            <span class="font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-700 px-2 py-1 rounded-full" id="p1LegsDisplay">Legs: ${state.legsWon.p1}</span>
          </div>
        </div>

        <!-- Player 2 -->
        <div class="player2-box flex-1 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/40 dark:to-rose-800/40 border-4 border-rose-600 rounded-xl p-4 flex flex-col items-center shadow-xl">
          <div class="text-center font-bold text-xl text-rose-900 dark:text-rose-100 mb-2">${names.p2}</div>
          <div class="text-center text-7xl font-bold text-rose-700 dark:text-rose-300 tabular-nums my-2" id="restP2">${state.remaining.p2}</div>
          <div class="flex gap-2 text-xs">
            <span class="font-semibold text-rose-800 dark:text-rose-100 bg-rose-200 dark:bg-rose-700/60 px-2 py-1 rounded" id="avgP2Leg">Leg: Ø -</span>
            <span class="font-semibold text-rose-800 dark:text-rose-100 bg-rose-300 dark:bg-rose-600/60 px-2 py-1 rounded" id="avgP2Match">Match: Ø -</span>
          </div>
          <div class="flex gap-2 mt-2 text-xs">
            <span class="font-semibold text-rose-800 dark:text-rose-200 bg-white dark:bg-slate-700 px-2 py-1 rounded-full" id="p2SetsDisplay">Sets: ${state.setsWon.p2}</span>
            <span class="font-semibold text-rose-800 dark:text-rose-200 bg-white dark:bg-slate-700 px-2 py-1 rounded-full" id="p2LegsDisplay">Legs: ${state.legsWon.p2}</span>
          </div>
        </div>
      </div>

      <!-- Set/Leg Info + Checkout Hint -->
      <div class="text-center mb-3">
        <div class="inline-block text-sm font-bold bg-gray-800 text-white px-4 py-2 rounded-lg shadow">
          Set ${state.currentSetNo} • Leg ${state.currentLegNo}
          ${gameStarter ? ` — <span class="text-emerald-400">▶ ${state.legStarter === 'p1' ? names.p1 : names.p2}</span>` : ''}
        </div>
        <div id="checkoutHint" class="hidden mt-2 text-lg font-bold text-amber-600 dark:text-amber-400 animate-pulse"></div>
      </div>

      <!-- Stats Panel (collapsible) -->
      ${buildStatsPanel(names)}

      <!-- Startspieler-Auswahl -->
      ${gameStarter === null ? buildStarterSelection(names) : ''}

      <!-- Score-Eingabe -->
      <div id="scoreInputArea" class="bg-white dark:bg-slate-800 rounded-xl border-4 border-gray-300 dark:border-slate-600 shadow-xl p-4">
        <!-- Score-Display -->
        <div class="text-center mb-4">
          <div id="scoreDisplay" class="text-5xl font-bold text-gray-800 dark:text-gray-100 tabular-nums bg-gray-100 dark:bg-slate-700 rounded-xl py-4 px-6 inline-block min-w-[200px] border-2 border-gray-300 dark:border-slate-500">
            0
          </div>
        </div>

        <!-- Numpad + Quick Scores -->
        <div class="flex gap-4">
          <!-- Numpad -->
          <div class="flex-1">
            <div class="grid grid-cols-3 gap-2 mb-3">
              ${[1,2,3,4,5,6,7,8,9].map(d => `
                <button type="button" data-digit="${d}" class="numpad-btn bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-600 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-500 dark:hover:to-slate-600 border-2 border-slate-300 dark:border-slate-500 rounded-lg text-2xl font-bold text-gray-900 dark:text-white py-4 shadow-md transition-all active:scale-95">${d}</button>
              `).join('')}
            </div>
            <div class="grid grid-cols-3 gap-2 mb-3">
              <button type="button" id="clearBtn" class="bg-gradient-to-br from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white border-2 border-red-600 rounded-lg text-xl font-bold py-4 shadow-md transition-all active:scale-95">C</button>
              <button type="button" data-digit="0" class="numpad-btn bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-600 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-500 dark:hover:to-slate-600 border-2 border-slate-300 dark:border-slate-500 rounded-lg text-2xl font-bold text-gray-900 dark:text-white py-4 shadow-md transition-all active:scale-95">0</button>
              <button type="button" id="backspaceBtn" class="bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white border-2 border-amber-600 rounded-lg text-xl font-bold py-4 shadow-md transition-all active:scale-95">⌫</button>
            </div>
            <button type="button" id="submitScore" class="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xl font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
              OK ✓
            </button>
          </div>

          <!-- Quick Scores + Aktionen -->
          <div class="flex flex-col gap-2 w-36">
            <div class="text-xs font-bold text-gray-500 dark:text-gray-400 text-center mb-1">Schnellwahl</div>
            ${buildQuickScoreButtons()}
            <div class="mt-auto pt-2 border-t border-gray-200 dark:border-gray-600">
              <button id="undoBtn" class="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-3 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all active:scale-95">
                ⏪ Undo
              </button>
              <button id="bustBtn" class="w-full mt-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-3 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all active:scale-95">
                ✖ No Score
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Checkout Dialog (hidden) -->
      <div id="checkoutDialog" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 hidden items-center justify-center">
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-amber-400 p-8 mx-4 w-full max-w-sm text-center">
          <div class="text-5xl mb-3">🎯</div>
          <h3 class="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-2">Checkout!</h3>
          <p class="text-lg text-gray-600 dark:text-gray-300 mb-6" id="checkoutText">Wie viele Darts zum Finish?</p>
          <div class="flex gap-4 justify-center">
            <button data-darts="1" class="checkout-dart-btn flex-1 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-4 rounded-xl font-bold text-2xl shadow-lg transition-all transform hover:scale-105">1</button>
            <button data-darts="2" class="checkout-dart-btn flex-1 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 rounded-xl font-bold text-2xl shadow-lg transition-all transform hover:scale-105">2</button>
            <button data-darts="3" class="checkout-dart-btn flex-1 bg-gradient-to-br from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white py-4 rounded-xl font-bold text-2xl shadow-lg transition-all transform hover:scale-105">3</button>
          </div>
          <p class="text-xs text-gray-400 mt-4">Anzahl Darts für die Statistik</p>
        </div>
      </div>

      <!-- Bust Toast (hidden) -->
      <div id="bustToast" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 hidden">
        <div class="bg-red-600 text-white text-3xl font-bold px-10 py-6 rounded-2xl shadow-2xl animate-bounce">
          BUST! 💥
        </div>
      </div>
    </div>
  `;
}

function buildQuickScoreButtons() {
  const scores = [
    { val: 180, color: 'from-amber-500 to-amber-600 text-white border-amber-700' },
    { val: 140, color: 'from-amber-400 to-amber-500 text-white border-amber-600' },
    { val: 100, color: 'from-indigo-500 to-indigo-600 text-white border-indigo-700' },
    { val: 85,  color: 'from-blue-400 to-blue-500 text-white border-blue-600' },
    { val: 60,  color: 'from-sky-400 to-sky-500 text-white border-sky-600' },
    { val: 45,  color: 'from-cyan-400 to-cyan-500 text-white border-cyan-600' },
    { val: 41,  color: 'from-teal-400 to-teal-500 text-white border-teal-600' },
    { val: 26,  color: 'from-gray-400 to-gray-500 text-white border-gray-600' },
  ];

  return scores.map(s =>
    `<button data-score="${s.val}" class="quick-score-btn bg-gradient-to-br ${s.color} border-2 rounded-lg text-lg font-bold py-2.5 shadow-md transition-all active:scale-95">${s.val}</button>`
  ).join('');
}

function buildStatsPanel(names) {
  return `
    <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 mb-3 shadow-2xl border-2 border-gray-700">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">📊 Statistiken</h3>
        <button id="toggleStats" class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg font-semibold transition text-sm">
          <span id="toggleStatsText">Details ▼</span>
        </button>
      </div>

      <div id="statsDetails" class="hidden mt-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 rounded-lg p-3 border-2 border-emerald-600">
            <h4 class="text-sm font-bold text-emerald-300 mb-2 text-center">${names.p1}</h4>
            <div class="space-y-1 text-xs">
              <div class="flex justify-between text-gray-200"><span>🎯 180s:</span><span id="p1_180s" class="font-bold text-amber-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>💯 140+:</span><span id="p1_140plus" class="font-bold text-emerald-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>🏆 High:</span><span id="p1_highscore" class="font-bold text-white">0</span></div>
              <div class="flex justify-between text-gray-200"><span>🎲 Darts:</span><span id="p1_darts_match" class="font-bold">0</span></div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-rose-900/50 to-rose-800/30 rounded-lg p-3 border-2 border-rose-600">
            <h4 class="text-sm font-bold text-rose-300 mb-2 text-center">${names.p2}</h4>
            <div class="space-y-1 text-xs">
              <div class="flex justify-between text-gray-200"><span>🎯 180s:</span><span id="p2_180s" class="font-bold text-amber-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>💯 140+:</span><span id="p2_140plus" class="font-bold text-rose-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>🏆 High:</span><span id="p2_highscore" class="font-bold text-white">0</span></div>
              <div class="flex justify-between text-gray-200"><span>🎲 Darts:</span><span id="p2_darts_match" class="font-bold">0</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStarterSelection(names) {
  return `
    <div id="starterSelection" class="bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/50 border-4 border-amber-500 dark:border-amber-600 rounded-xl p-6 mb-4 text-center shadow-xl">
      <div class="text-xl font-bold mb-4 text-amber-900 dark:text-amber-100">Wer beginnt?</div>
      <div class="flex gap-4 justify-center">
        <button id="startP1" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${names.p1}</button>
        <button id="startP2" class="bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${names.p2}</button>
      </div>
    </div>
  `;
}
