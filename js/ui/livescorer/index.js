// Livescorer Haupt-Modul - koordiniert alle Sub-Module
import * as store from '../../state/store.js';
import { createLeg } from '../../services/match.js';
import { getPlayerNames } from '../../utils/players.js';
import { START_SCORE, DEFAULT_BEST_OF_LEGS, DEFAULT_BEST_OF_SETS } from '../../utils/constants.js';

import { updateAllDisplays, updatePlayerIndicator } from './display.js';
import { initKeypadState, initKeypadHandlers, updateDartDisplays } from './keypad.js';
import { initEventDelegation, initUndoHandler, initStarterSelection, initBackButton, initStatsToggle } from './events.js';

// Re-exports für Kompatibilität
export { createLeg as resetLeg } from '../../services/match.js';
export { saveLeg } from '../../services/match.js';

/**
 * Rendert die Livescorer-UI
 * @param {Object} params - Render-Parameter
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

  // Store mit Match-Daten synchronisieren (falls von main.js aufgerufen)
  if (currentMatch && store.getCurrentMatch()?.id !== currentMatch.id) {
    store.initNewMatch(currentMatch);
  }

  const match = store.getCurrentMatch();
  if (!match) {
    console.error('[Livescorer] Kein Match im Store');
    return;
  }

  // Leg erstellen falls keines existiert
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
  initKeypadState();
  initKeypadHandlers(app, { bestSet, bestLeg });
  initUndoHandler(app, () => {
    // Nach Undo: UI komplett aktualisieren
    updateAllDisplays(bestSet, bestLeg);
  });
  initStarterSelection(app, () => {
    // Nach Startspieler-Auswahl: Neu rendern
    renderLiveScorer(params);
  });
  initBackButton(app);
  initStatsToggle(app);

  // Initiale UI-Updates
  setTimeout(() => {
    updateAllDisplays(bestSet, bestLeg);
    updateDartDisplays(app);
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
    <div class="flex flex-row justify-between gap-6 mb-6 items-stretch">
      <button id="backToMatchSelect" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg shadow-md transition-all font-semibold self-start">&#8592; Zurück</button>

      <!-- Player 1 Box -->
      <div class="player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/40 dark:to-emerald-800/40 border-4 border-emerald-600 rounded-xl p-6 flex flex-col items-center shadow-xl">
        <div class="text-center font-bold text-2xl text-emerald-900 dark:text-emerald-100 mb-3">${names.p1}</div>
        <div class="text-sm font-semibold text-center mb-2 text-emerald-800 dark:text-emerald-100 bg-emerald-200 dark:bg-emerald-700/60 px-3 py-1.5 rounded-lg" id="avgP1Leg">Leg: Ø -</div>
        <div class="text-sm font-semibold text-center mb-3 text-emerald-800 dark:text-emerald-100 bg-emerald-300 dark:bg-emerald-600/60 px-3 py-1.5 rounded-lg" id="avgP1Match">Match: Ø -</div>
        <div class="text-center text-6xl mt-2 font-bold text-emerald-700 dark:text-emerald-300 tabular-nums" id="restP1">${state.remaining.p1}</div>
        <div class="text-sm mt-4 font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-700 px-3 py-1 rounded-full" id="p1SetsDisplay">Sets: ${state.setsWon.p1}/${bestSet}</div>
        <div class="text-sm mt-1 font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-700 px-3 py-1 rounded-full" id="p1LegsDisplay">Legs: ${state.legsWon.p1}/${bestLeg}</div>
      </div>

      <!-- Player 2 Box -->
      <div class="player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/40 dark:to-rose-800/40 border-4 border-rose-600 rounded-xl p-6 flex flex-col items-center shadow-xl">
        <div class="text-center font-bold text-2xl text-rose-900 dark:text-rose-100 mb-3">${names.p2}</div>
        <div class="text-sm font-semibold text-center mb-2 text-rose-800 dark:text-rose-100 bg-rose-200 dark:bg-rose-700/60 px-3 py-1.5 rounded-lg" id="avgP2Leg">Leg: Ø -</div>
        <div class="text-sm font-semibold text-center mb-3 text-rose-800 dark:text-rose-100 bg-rose-300 dark:bg-rose-600/60 px-3 py-1.5 rounded-lg" id="avgP2Match">Match: Ø -</div>
        <div class="text-center text-6xl mt-2 font-bold text-rose-700 dark:text-rose-300 tabular-nums" id="restP2">${state.remaining.p2}</div>
        <div class="text-sm mt-4 font-semibold text-rose-800 dark:text-rose-200 bg-white dark:bg-slate-700 px-3 py-1 rounded-full" id="p2SetsDisplay">Sets: ${state.setsWon.p2}/${bestSet}</div>
        <div class="text-sm mt-1 font-semibold text-rose-800 dark:text-rose-200 bg-white dark:bg-slate-700 px-3 py-1 rounded-full" id="p2LegsDisplay">Legs: ${state.legsWon.p2}/${bestLeg}</div>
      </div>
    </div>

    <!-- Stats Panel -->
    ${buildStatsPanel(names)}

    <!-- Startspieler-Auswahl -->
    ${gameStarter === null ? buildStarterSelection(names) : ''}

    <!-- Score-Eingabe -->
    <div class="flex flex-col items-center mb-4">
      <div class="text-lg font-bold mb-6 bg-gray-800 text-white px-6 py-3 rounded-xl shadow-lg">
        Set ${state.currentSetNo}/${bestSet} &bull; Leg ${state.currentLegNo}/${bestLeg}
        ${gameStarter ? `<span class="ml-4 text-emerald-400">&#9654; ${state.legStarter === 'p1' ? names.p1 : names.p2}</span>` : ''}
      </div>

      <div class="flex gap-6 mb-6">
        ${buildKeypadHTML()}
        ${buildQuickScoresHTML()}
        ${buildActionsHTML()}
      </div>
    </div>
  `;
}

function buildStatsPanel(names) {
  return `
    <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 mb-6 shadow-2xl border-2 border-gray-700">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-2xl font-bold text-white flex items-center gap-2">
          &#128202; Match Statistiken
        </h3>
        <button id="toggleStats" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition">
          <span id="toggleStatsText">Details ▼</span>
        </button>
      </div>

      <div id="statsDetails" class="hidden">
        <div class="grid grid-cols-2 gap-6">
          <div class="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 rounded-lg p-4 border-2 border-emerald-600">
            <h4 class="text-lg font-bold text-emerald-300 mb-3 text-center">${names.p1}</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between text-gray-200"><span>&#127919; 180s:</span><span id="p1_180s" class="font-bold text-amber-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#128175; 140+:</span><span id="p1_140plus" class="font-bold text-emerald-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#127942; Highscore:</span><span id="p1_highscore" class="font-bold text-white">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#127922; Würfe (Match):</span><span id="p1_darts_match" class="font-bold">0</span></div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-rose-900/50 to-rose-800/30 rounded-lg p-4 border-2 border-rose-600">
            <h4 class="text-lg font-bold text-rose-300 mb-3 text-center">${names.p2}</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between text-gray-200"><span>&#127919; 180s:</span><span id="p2_180s" class="font-bold text-amber-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#128175; 140+:</span><span id="p2_140plus" class="font-bold text-rose-400">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#127942; Highscore:</span><span id="p2_highscore" class="font-bold text-white">0</span></div>
              <div class="flex justify-between text-gray-200"><span>&#127922; Würfe (Match):</span><span id="p2_darts_match" class="font-bold">0</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStarterSelection(names) {
  return `
    <div id="starterSelection" class="bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/50 border-4 border-amber-500 dark:border-amber-600 rounded-xl p-6 mb-6 text-center shadow-xl">
      <div class="text-2xl font-bold mb-4 text-amber-900 dark:text-amber-100">Wer beginnt das erste Leg?</div>
      <div class="flex gap-6 justify-center">
        <button id="startP1" class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${names.p1} beginnt</button>
        <button id="startP2" class="bg-rose-600 hover:bg-rose-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${names.p2} beginnt</button>
      </div>
    </div>
  `;
}

function buildKeypadHTML() {
  return `
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border-4 border-gray-300 dark:border-slate-600 shadow-xl">
      <div class="text-center mb-4">
        <div class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">3-Dart-Eingabe</div>
        <div class="flex gap-3 justify-center mb-3">
          ${buildDartInputHTML(0, 'DART 1')}
          ${buildDartInputHTML(1, 'DART 2')}
          ${buildDartInputHTML(2, 'DART 3')}
        </div>
        <div class="text-lg font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 px-4 py-2 rounded-lg">Total: <span id="totalDisplay" class="text-2xl text-emerald-600 dark:text-emerald-400">0</span></div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-4">
        ${[1,2,3,4,5,6,7,8,9].map(d => `<button type="button" data-digit="${d}" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-600 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-500 dark:hover:to-slate-600 border-2 border-slate-300 dark:border-slate-500 rounded-lg text-2xl font-bold text-gray-900 dark:text-white py-4 px-5 shadow-md transition-all transform hover:scale-105">${d}</button>`).join('')}
        <button type="button" id="clearBtn" class="bg-gradient-to-br from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white border-2 border-red-600 rounded-lg text-xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">C</button>
        <button type="button" data-digit="0" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-600 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-500 dark:hover:to-slate-600 border-2 border-slate-300 dark:border-slate-500 rounded-lg text-2xl font-bold text-gray-900 dark:text-white py-4 px-5 shadow-md transition-all transform hover:scale-105">0</button>
        <button type="button" id="backspaceBtn" class="bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white border-2 border-amber-600 rounded-lg text-xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">&#9003;</button>
      </div>

      <button type="button" id="submitScore" class="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xl font-bold py-5 rounded-xl shadow-lg transition-all transform hover:scale-105">Weiter &#8594;</button>
    </div>
  `;
}

function buildDartInputHTML(dartIndex, label) {
  return `
    <div class="flex flex-col items-center">
      <div class="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">${label}</div>
      <div id="dart${dartIndex + 1}Display" class="text-3xl font-mono bg-gray-50 dark:bg-slate-700 dark:text-white border-2 border-gray-300 dark:border-slate-500 rounded-lg px-4 py-3 w-20 text-center">0</div>
      <div class="flex gap-1 mt-2">
        <button type="button" data-dart="${dartIndex}" data-mult="1" class="mult-btn active bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-blue-600 transition ring-2 ring-white ring-offset-2">S</button>
        <button type="button" data-dart="${dartIndex}" data-mult="2" class="mult-btn bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-emerald-600 transition">D</button>
        <button type="button" data-dart="${dartIndex}" data-mult="3" class="mult-btn bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-amber-600 transition">T</button>
      </div>
    </div>
  `;
}

function buildQuickScoresHTML() {
  const quickScores = [26, 41, 45, 60, 81, 83, 85, 95, 100, 121, 140, 180];
  const colorClasses = {
    26: 'from-cyan-100 to-cyan-200 dark:from-cyan-800 dark:to-cyan-900 border-cyan-400 dark:border-cyan-600 text-cyan-900 dark:text-cyan-100',
    41: 'from-cyan-100 to-cyan-200 dark:from-cyan-800 dark:to-cyan-900 border-cyan-400 dark:border-cyan-600 text-cyan-900 dark:text-cyan-100',
    45: 'from-cyan-100 to-cyan-200 dark:from-cyan-800 dark:to-cyan-900 border-cyan-400 dark:border-cyan-600 text-cyan-900 dark:text-cyan-100',
    60: 'from-sky-100 to-sky-200 dark:from-sky-800 dark:to-sky-900 border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-100',
    81: 'from-sky-100 to-sky-200 dark:from-sky-800 dark:to-sky-900 border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-100',
    83: 'from-sky-100 to-sky-200 dark:from-sky-800 dark:to-sky-900 border-sky-400 dark:border-sky-600 text-sky-900 dark:text-sky-100',
    85: 'from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-900 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100',
    95: 'from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-900 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100',
    100: 'from-indigo-100 to-indigo-200 dark:from-indigo-800 dark:to-indigo-900 border-indigo-400 dark:border-indigo-600 text-indigo-900 dark:text-indigo-100',
    121: 'from-purple-100 to-purple-200 dark:from-purple-800 dark:to-purple-900 border-purple-400 dark:border-purple-600 text-purple-900 dark:text-purple-100',
    140: 'from-amber-100 to-amber-200 dark:from-amber-700 dark:to-amber-800 border-amber-500 dark:border-amber-500 text-amber-900 dark:text-amber-100',
    180: 'from-amber-200 to-amber-300 dark:from-amber-600 dark:to-amber-700 border-amber-600 dark:border-amber-400 text-amber-900 dark:text-white'
  };

  return `
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border-4 border-gray-300 dark:border-slate-600 shadow-xl">
      <div class="text-center mb-4">
        <div class="text-xl font-bold text-gray-800 dark:text-gray-100">Schnellauswahl</div>
      </div>
      <div id="quickScores" class="grid grid-cols-3 gap-3">
        ${quickScores.map(score => `<button data-score="${score}" class="bg-gradient-to-br ${colorClasses[score]} border-2 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">${score}</button>`).join('')}
      </div>
    </div>
  `;
}

function buildActionsHTML() {
  return `
    <div class="p-6 bg-white dark:bg-slate-800 rounded-xl border-4 border-gray-300 dark:border-slate-600 shadow-xl flex flex-col gap-4">
      <div class="text-center">
        <div class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Aktionen</div>
      </div>
      <button id="undoBtn" class="bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">&#9194; Rückgängig</button>
    </div>
  `;
}
