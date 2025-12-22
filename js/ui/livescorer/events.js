// Event-Handler für den Livescorer
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { distributeDarts, PLAYER } from '../../utils/constants.js';
import { checkBust, isValidQuickScoreDoubleOut, handleLegEnd } from './game-logic.js';
import { updateRestpunkteUI, updateSetsLegsUI, updateAverages, updateDetailedStats } from './display.js';

// Delegation Handler Reference
let delegationHandler = null;

/**
 * Initialisiert den globalen Event-Delegation-Handler
 * @param {Object} options - { bestSet, bestLeg }
 */
export function initEventDelegation(options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

  // Alten Handler entfernen
  if (delegationHandler) {
    document.body.removeEventListener('click', delegationHandler);
    console.log('[Events] Alter Delegation-Handler entfernt');
  }

  delegationHandler = async function(e) {
    const appEl = document.getElementById('app');
    if (!appEl || !appEl.contains(e.target)) return;

    const btn = e.target.closest('button');
    if (!btn) return;

    // Keypad-Buttons ausschließen (haben eigene Handler)
    const isKeypadBtn = btn.classList.contains('keypad-btn') ||
                        btn.id === 'clearBtn' ||
                        btn.id === 'backspaceBtn' ||
                        btn.id === 'submitScore';
    if (isKeypadBtn) return;

    // Quick-Score Buttons behandeln
    if (btn.hasAttribute('data-score')) {
      await handleQuickScore(btn, bestSet, bestLeg);
    }
  };

  document.body.addEventListener('click', delegationHandler);
  console.log('[Events] Delegation-Handler registriert');
}

/**
 * Entfernt den Delegation-Handler
 */
export function cleanupEventDelegation() {
  if (delegationHandler) {
    document.body.removeEventListener('click', delegationHandler);
    delegationHandler = null;
    console.log('[Events] Delegation-Handler entfernt');
  }
}

/**
 * Behandelt Quick-Score Button-Klicks
 */
async function handleQuickScore(btn, bestSet, bestLeg) {
  const score = parseInt(btn.dataset.score, 10);
  if (isNaN(score) || score < 0 || score > 180) {
    console.error('[Events] Ungültiger Quick-Score:', score);
    return;
  }

  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);

  // Dart-Verteilung berechnen
  const dartValues = distributeDarts(score);

  // Bust-Check
  const bustResult = checkBust(score, remaining, match?.double_out);
  if (bustResult.isBust) {
    alert(bustResult.reason);
    return;
  }

  // Double-Out Validierung für Quick-Scores
  if (remaining - score === 0 && match?.double_out) {
    if (!isValidQuickScoreDoubleOut(score, remaining, dartValues)) {
      alert('BUST! Muss mit Double finishen.');
      return;
    }
  }

  // Wurf in History speichern
  store.addThrow({
    player: currentPlayer,
    score,
    remP1: store.getRemainingP1(),
    remP2: store.getRemainingP2(),
    legsWon: store.getLegsWon(),
    setsWon: store.getSetsWon(),
    legNo: store.getCurrentLegNo(),
    setNo: store.getCurrentSetNo(),
    bullfinish: store.getBullfinish(),
    legStarter: store.getLegStarter(),
    gameStarter: store.getGameStarter()
  });

  // Wurf in DB speichern
  const leg = store.getCurrentLeg();
  if (match && leg) {
    await saveThrow({
      matchId: match.id,
      legId: leg.id,
      playerId: getPlayerId(match, currentPlayer),
      dart1: dartValues[0],
      dart2: dartValues[1],
      dart3: dartValues[2],
      total: score,
      isFinish: remaining - score === 0,
      orderNo: store.getThrowHistory().length
    });
  }

  // Remaining aktualisieren
  store.setRemaining(currentPlayer, remaining - score);

  // Spieler wechseln
  store.setCurrentPlayer(switchPlayer(currentPlayer));

  // UI aktualisieren
  updateRestpunkteUI();
  updateSetsLegsUI(bestSet, bestLeg);
  updateAverages();
  updateDetailedStats();

  console.log('[Events] Quick-Score verarbeitet:', score, 'Neuer Spieler:', store.getCurrentPlayer());

  // Leg-Ende prüfen
  if (store.getRemainingP1() === 0 || store.getRemainingP2() === 0) {
    await handleLegEnd('Quick-Score');
  }
}

/**
 * Initialisiert den Undo-Button Handler
 * @param {HTMLElement} container - Der App-Container
 * @param {Function} onUndo - Callback nach Undo
 */
export function initUndoHandler(container, onUndo) {
  const undoBtn = container.querySelector('#undoBtn');
  const undoContainer = undoBtn?.parentElement;

  if (!undoBtn || !undoContainer || undoContainer.hasAttribute('data-bullseyer-undo-initialized')) {
    return;
  }
  undoContainer.setAttribute('data-bullseyer-undo-initialized', 'true');

  undoBtn.addEventListener('click', () => {
    const lastThrow = store.undoLastThrow();
    if (!lastThrow) {
      console.log('[Events] Keine Würfe zum Rückgängig machen');
      return;
    }

    console.log('[Events] Undo ausgeführt:', lastThrow);

    // UI aktualisieren
    updateRestpunkteUI();
    updateSetsLegsUI(3, 3); // TODO: bestSet/bestLeg übergeben
    updateAverages();
    updateDetailedStats();

    if (onUndo) {
      onUndo(lastThrow);
    }
  });
}

/**
 * Initialisiert die Startspieler-Auswahl
 * @param {HTMLElement} container - Der App-Container
 * @param {Function} onStarterSelected - Callback wenn Startspieler gewählt
 */
export function initStarterSelection(container, onStarterSelected) {
  const startP1Btn = container.querySelector('#startP1');
  const startP2Btn = container.querySelector('#startP2');
  const starterSelection = container.querySelector('#starterSelection');
  const inputArea = container.querySelector('.flex.gap-6.mb-6');

  // Eingabe deaktivieren bis Startspieler gewählt
  if (store.getGameStarter() === null && inputArea) {
    inputArea.style.opacity = '0.5';
    inputArea.style.pointerEvents = 'none';
  }

  if (startP1Btn) {
    startP1Btn.addEventListener('click', () => {
      selectStarter(PLAYER.P1, starterSelection, inputArea, onStarterSelected);
    });
  }

  if (startP2Btn) {
    startP2Btn.addEventListener('click', () => {
      selectStarter(PLAYER.P2, starterSelection, inputArea, onStarterSelected);
    });
  }
}

/**
 * Setzt den Startspieler
 */
function selectStarter(player, starterSelection, inputArea, callback) {
  store.setGameStarter(player);
  store.setLegStarter(player);
  store.setCurrentPlayer(player);

  // UI aktualisieren
  if (starterSelection) starterSelection.style.display = 'none';
  if (inputArea) {
    inputArea.style.opacity = '1';
    inputArea.style.pointerEvents = 'auto';
  }

  console.log('[Events] Startspieler gewählt:', player);

  if (callback) {
    callback(player);
  }
}

/**
 * Initialisiert den Zurück-Button Handler
 * @param {HTMLElement} container - Der App-Container
 */
export function initBackButton(container) {
  const backBtn = container.querySelector('#backToMatchSelect');
  if (!backBtn) return;

  backBtn.onclick = () => {
    store.resetState();

    // Header wieder einblenden
    const mainHeader = document.getElementById('mainHeader');
    if (mainHeader) mainHeader.style.display = 'block';

    window.location.hash = '#/scorer';
  };
}

/**
 * Initialisiert den Toggle-Stats Button
 * @param {HTMLElement} container - Der App-Container
 */
export function initStatsToggle(container) {
  const toggleStatsBtn = container.querySelector('#toggleStats');
  if (!toggleStatsBtn) return;

  toggleStatsBtn.addEventListener('click', () => {
    const statsDetails = container.querySelector('#statsDetails');
    const toggleText = container.querySelector('#toggleStatsText');

    if (statsDetails && toggleText) {
      if (statsDetails.classList.contains('hidden')) {
        statsDetails.classList.remove('hidden');
        toggleText.textContent = 'Details ▲';
      } else {
        statsDetails.classList.add('hidden');
        toggleText.textContent = 'Details ▼';
      }
    }
  });
}
