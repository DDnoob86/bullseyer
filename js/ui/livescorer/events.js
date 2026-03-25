// Event-Handler für den Livescorer
import * as store from '../../state/store.js';
import { PLAYER } from '../../utils/constants.js';
import { processScore } from './score-processor.js';
import { updateAllDisplays, updateCheckoutHint } from './display.js';

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

  undoBtn.addEventListener('click', () => {
    const lastThrow = store.undoLastThrow();
    if (!lastThrow) return;
    console.log('[Events] Undo:', lastThrow);
    if (onUndo) onUndo(lastThrow);
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
  if (!toggleStatsBtn) return;

  toggleStatsBtn.addEventListener('click', () => {
    const statsDetails = container.querySelector('#statsDetails');
    const toggleText = container.querySelector('#toggleStatsText');
    if (statsDetails && toggleText) {
      const isHidden = statsDetails.classList.toggle('hidden');
      toggleText.textContent = isHidden ? 'Details ▼' : 'Details ▲';
    }
  });
}
