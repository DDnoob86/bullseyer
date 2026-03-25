// Event-Handler für den Livescorer
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { distributeDarts, PLAYER } from '../../utils/constants.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { handleLegEnd } from './game-logic.js';
import { updateAllDisplays, updateCheckoutHint } from './display.js';
import { showCheckoutDialog, showBustToast } from './dialogs.js';

// Delegation Handler Reference
let delegationHandler = null;

/**
 * Initialisiert den globalen Event-Delegation-Handler für Quick-Score Buttons
 */
export function initEventDelegation(options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

  if (delegationHandler) {
    document.body.removeEventListener('click', delegationHandler);
  }

  delegationHandler = async function(e) {
    const btn = e.target.closest('button.quick-score-btn');
    if (!btn) return;

    const score = parseInt(btn.dataset.score, 10);
    if (isNaN(score) || score < 0 || score > 180) return;

    await handleQuickScore(score, bestSet, bestLeg);
  };

  document.body.addEventListener('click', delegationHandler);
}

export function cleanupEventDelegation() {
  if (delegationHandler) {
    document.body.removeEventListener('click', delegationHandler);
    delegationHandler = null;
  }
}

/**
 * Behandelt Quick-Score Button-Klicks
 */
async function handleQuickScore(score, bestSet, bestLeg) {
  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);
  const isDoubleOut = match?.double_out;
  const newRemaining = remaining - score;

  // Bust-Checks
  if (score > remaining) {
    showBustToast('BUST! Zu hoch 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    return;
  }

  if (newRemaining === 1 && isDoubleOut) {
    showBustToast('BUST! Rest = 1 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    return;
  }

  const isFinish = newRemaining === 0;
  let finishDarts = 3;
  let bullfinish = false;

  // Checkout?
  if (isFinish) {
    if (isDoubleOut && !isValidCheckout(remaining)) {
      showBustToast('BUST! Kein Checkout 💥');
      store.setCurrentPlayer(switchPlayer(currentPlayer));
      updateAllDisplays(bestSet, bestLeg);
      return;
    }

    // Checkout-Dialog mit smarter Dart-Begrenzung + Bullfinish
    const result = await showCheckoutDialog(remaining);
    finishDarts = result.darts;
    bullfinish = result.bullfinish;
  }

  // Bullfinish im Store
  if (bullfinish) {
    store.setBullfinish(true);
  }

  // Wurf speichern
  store.addThrow({
    player: currentPlayer,
    score,
    remP1: store.getRemainingP1(),
    remP2: store.getRemainingP2(),
    legsWon: store.getLegsWon(),
    setsWon: store.getSetsWon(),
    legNo: store.getCurrentLegNo(),
    setNo: store.getCurrentSetNo(),
    bullfinish: bullfinish || store.getBullfinish(),
    legStarter: store.getLegStarter(),
    gameStarter: store.getGameStarter()
  });

  // Wurf in DB
  const leg = store.getCurrentLeg();
  const dartValues = distributeDarts(score);
  if (match && leg) {
    await saveThrow({
      matchId: match.id,
      legId: leg.id,
      playerId: getPlayerId(match, currentPlayer),
      dart1: dartValues[0],
      dart2: dartValues[1],
      dart3: dartValues[2],
      total: score,
      isFinish,
      orderNo: store.getThrowHistory().length
    });
  }

  // Remaining aktualisieren
  store.setRemaining(currentPlayer, newRemaining);
  store.setCurrentPlayer(switchPlayer(currentPlayer));

  // UI aktualisieren
  updateAllDisplays(bestSet, bestLeg);

  // Leg-Ende prüfen
  if (isFinish) {
    if (leg) leg.finishDarts = finishDarts;
    await handleLegEnd('Quick-Score', { finishDarts, bullfinish });
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
