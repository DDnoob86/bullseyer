// Event-Handler für den Livescorer
import * as store from '../../state/store.js';
import { PLAYER } from '../../utils/constants.js';
import { processScore } from './score-processor.js';
import { updateAllDisplays, updateCheckoutHint } from './display.js';
import { showUndoLegDialog } from './dialogs.js';
import { getPlayerNames } from '../../utils/players.js';
import { createLeg } from '../../services/match.js';

// Delegation Handler Reference (für Cleanup)
let delegationHandler = null;

/**
 * Initialisiert den globalen Event-Delegation-Handler für Quick-Score Buttons
 */
export function initEventDelegation(options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

  // Vorherigen Handler entfernen
  cleanupEventDelegation();

  delegationHandler = async function(e) {
    const btn = e.target.closest('button.quick-score-btn');
    if (!btn) return;

    const score = parseInt(btn.dataset.score, 10);
    if (isNaN(score) || score < 0 || score > 180) return;

    await processScore(score, { bestSet, bestLeg, askCheckoutDialog: true });
  };

  document.body.addEventListener('click', delegationHandler);
}

/**
 * Entfernt den Event-Delegation-Handler (wird beim Routenwechsel aufgerufen)
 */
export function cleanupEventDelegation() {
  if (delegationHandler) {
    document.body.removeEventListener('click', delegationHandler);
    delegationHandler = null;
  }
}

/**
 * Initialisiert den Undo-Button Handler
 */
export function initUndoHandler(container, onUndo) {
  const undoBtn = container.querySelector('#undoBtn');
  if (!undoBtn) return;

  const undoContainer = undoBtn.parentElement;
  if (undoContainer?.hasAttribute('data-bullseyer-undo-initialized')) return;
  if (undoContainer) undoContainer.setAttribute('data-bullseyer-undo-initialized', 'true');

  undoBtn.addEventListener('click', async () => {
    // 1. Normaler Undo: letzten Wurf rückgängig machen
    const lastThrow = store.undoLastThrow();
    if (lastThrow) {
      console.log('[Events] Undo Wurf:', lastThrow);
      if (onUndo) onUndo(lastThrow);
      return;
    }

    // 2. Leg Undo: Wenn kein Wurf da, aber ein Leg-Ergebnis existiert → anbieten
    const legResults = store.getLegResults();
    if (legResults.length === 0) return;

    const lastLeg = legResults[legResults.length - 1];
    const match = store.getCurrentMatch();
    const names = match ? getPlayerNames(match) : { p1: 'Spieler 1', p2: 'Spieler 2' };

    const confirmed = await showUndoLegDialog(lastLeg, names);
    if (!confirmed) return;

    const removedLeg = store.undoLastLeg();
    if (removedLeg) {
      console.log('[Events] Undo Leg:', removedLeg);
      // Neues Leg-Objekt erstellen für die DB-Referenz
      const newLeg = createLeg(match, store.getCurrentSetNo(), store.getCurrentLegNo());
      store.setCurrentLeg(newLeg);
      if (onUndo) onUndo(removedLeg);
    }
  });
}

/**
 * Initialisiert die Startspieler-Auswahl
 */
export function initStarterSelection(container, onStarterSelected) {
  const startP1Btn = container.querySelector('#startP1');
  const startP2Btn = container.querySelector('#startP2');
  const starterSelection = container.querySelector('#starterSelection');
  const inputArea = container.querySelector('#scoreInputArea');

  if (store.getGameStarter() === null && inputArea) {
    inputArea.style.opacity = '0.3';
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

function selectStarter(player, starterSelection, inputArea, callback) {
  store.setGameStarter(player);
  store.setLegStarter(player);
  store.setCurrentPlayer(player);

  if (starterSelection) starterSelection.style.display = 'none';
  if (inputArea) {
    inputArea.style.opacity = '1';
    inputArea.style.pointerEvents = 'auto';
  }

  if (callback) callback(player);
}

export function initBackButton(container) {
  const backBtn = container.querySelector('#backToMatchSelect');
  if (!backBtn) return;

  backBtn.onclick = () => {
    cleanupEventDelegation();
    store.resetState();
    localStorage.removeItem('bullseyer_currentMatchId');
    const mainHeader = document.getElementById('mainHeader');
    if (mainHeader) mainHeader.style.display = 'block';
    window.location.hash = '#/scorer';
  };
}

export function initStatsToggle(container) {
  const toggleStatsBtn = container.querySelector('#toggleStats');
  const closeStatsBtn = container.querySelector('#closeStats');
  const statsDetails = container.querySelector('#statsDetails');
  if (!statsDetails) return;

  const toggle = () => statsDetails.classList.toggle('hidden');

  if (toggleStatsBtn) toggleStatsBtn.addEventListener('click', toggle);
  if (closeStatsBtn) closeStatsBtn.addEventListener('click', toggle);
}
