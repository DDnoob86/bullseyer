// Vereinfachte Score-Eingabe - Gesamtpunktzahl statt Einzeldarts
// Wie DartCounter: Zahl eintippen → OK → bei Checkout: "Wie viele Darts?"
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { distributeDarts } from '../../utils/constants.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { checkBust, handleLegEnd } from './game-logic.js';
import { updateAllDisplays, updateCheckoutHint } from './display.js';

// Eingabe-State
let currentInput = '';

/**
 * Setzt die Score-Eingabe zurück
 */
export function resetScoreInput() {
  currentInput = '';
  updateScoreDisplay();
}

/**
 * Gibt den aktuellen Eingabewert zurück
 */
export function getCurrentInput() {
  return currentInput;
}

function updateScoreDisplay() {
  const display = document.getElementById('scoreDisplay');
  if (display) {
    display.textContent = currentInput || '0';
  }
}

/**
 * Zeigt einen Bust-Toast an
 */
function showBustToast(message) {
  const toast = document.getElementById('bustToast');
  if (!toast) return;

  const textEl = toast.querySelector('div');
  if (textEl) textEl.textContent = message || 'BUST! 💥';

  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1200);
}

/**
 * Verarbeitet einen Score (von Numpad oder Quick-Score)
 * @param {number} score - Gesamtpunktzahl der Aufnahme
 * @param {Object} options - { bestSet, bestLeg, finishDarts }
 */
async function processScore(score, options = {}) {
  const { bestSet = 3, bestLeg = 3, finishDarts = 3 } = options;

  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);
  const isDoubleOut = match?.double_out;

  // Bust-Check
  const newRemaining = remaining - score;

  if (score > remaining) {
    showBustToast('BUST! Zu hoch 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    updateCheckoutHint();
    return;
  }

  if (newRemaining === 1 && isDoubleOut) {
    showBustToast('BUST! Rest = 1 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    updateCheckoutHint();
    return;
  }

  if (newRemaining === 0 && isDoubleOut && !isValidCheckout(remaining)) {
    showBustToast('BUST! Kein Checkout 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    updateCheckoutHint();
    return;
  }

  const isFinish = newRemaining === 0;

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

  // Spieler wechseln
  store.setCurrentPlayer(switchPlayer(currentPlayer));

  // UI aktualisieren
  updateAllDisplays(bestSet, bestLeg);
  updateCheckoutHint();

  console.log('[Keypad] Score verarbeitet:', score, 'Finish:', isFinish, 'Darts:', finishDarts);

  // Leg-Ende prüfen
  if (isFinish) {
    // Finish-Darts am Leg speichern
    if (leg) leg.finishDarts = finishDarts;
    await handleLegEnd('Score Input');
    updateCheckoutHint();
  }
}

/**
 * Öffnet den Checkout-Dialog und wartet auf Dart-Auswahl
 * @param {number} remaining - Der Reststand der gecheckt wird
 * @returns {Promise<number>} Anzahl Darts (1, 2 oder 3)
 */
function showCheckoutDialog(remaining) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('checkoutDialog');
    const text = document.getElementById('checkoutText');
    if (!dialog) { resolve(3); return; }

    text.textContent = `${remaining} ausgecheckt! Wie viele Darts?`;

    dialog.classList.remove('hidden');
    dialog.classList.add('flex');

    // Handler für Dart-Buttons
    const buttons = dialog.querySelectorAll('.checkout-dart-btn');
    const handler = (e) => {
      const darts = parseInt(e.target.dataset.darts);
      // Cleanup
      buttons.forEach(b => b.removeEventListener('click', handler));
      dialog.classList.add('hidden');
      dialog.classList.remove('flex');
      resolve(darts);
    };

    buttons.forEach(b => b.addEventListener('click', handler));
  });
}

/**
 * Verarbeitet eine Score-Eingabe mit Checkout-Dialog wenn nötig
 */
async function handleScoreSubmit(score, options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;
  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);
  const isDoubleOut = match?.double_out;
  const newRemaining = remaining - score;

  // Ist es ein Checkout?
  if (newRemaining === 0) {
    if (isDoubleOut && !isValidCheckout(remaining)) {
      // Unmöglicher Checkout → Bust
      showBustToast('BUST! Kein Checkout 💥');
      store.setCurrentPlayer(switchPlayer(currentPlayer));
      updateAllDisplays(bestSet, bestLeg);
      updateCheckoutHint();
      return;
    }

    // Checkout-Dialog anzeigen
    const finishDarts = await showCheckoutDialog(remaining);
    await processScore(score, { ...options, finishDarts });
  } else {
    // Normaler Score
    await processScore(score, { ...options, finishDarts: 3 });
  }
}

/**
 * Initialisiert die vereinfachte Score-Eingabe
 */
export function initScoreInput(container, options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

  // Prüfe ob schon initialisiert
  const inputArea = container.querySelector('#scoreInputArea');
  if (!inputArea || inputArea.hasAttribute('data-bullseyer-initialized')) return;
  inputArea.setAttribute('data-bullseyer-initialized', 'true');

  currentInput = '';
  updateScoreDisplay();

  // --- Numpad Ziffern ---
  container.querySelectorAll('.numpad-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const digit = btn.getAttribute('data-digit');
      if (digit === null) return;

      const newInput = currentInput + digit;
      const newValue = parseInt(newInput, 10);

      // Max 180 Punkte pro Aufnahme
      if (newValue > 180) return;

      currentInput = newInput;
      updateScoreDisplay();
    });
  });

  // --- Clear ---
  const clearBtn = container.querySelector('#clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentInput = '';
      updateScoreDisplay();
    });
  }

  // --- Backspace ---
  const backspaceBtn = container.querySelector('#backspaceBtn');
  if (backspaceBtn) {
    backspaceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentInput = currentInput.slice(0, -1);
      updateScoreDisplay();
    });
  }

  // --- OK / Submit ---
  const submitBtn = container.querySelector('#submitScore');
  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const score = parseInt(currentInput, 10);

      if (isNaN(score) || score < 0) {
        currentInput = '';
        updateScoreDisplay();
        return;
      }

      if (score > 180) {
        showBustToast('Max 180! 💥');
        currentInput = '';
        updateScoreDisplay();
        return;
      }

      currentInput = '';
      updateScoreDisplay();

      await handleScoreSubmit(score, { bestSet, bestLeg });
    });
  }

  // --- No Score / Bust Button ---
  const bustBtn = container.querySelector('#bustBtn');
  if (bustBtn) {
    bustBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      currentInput = '';
      updateScoreDisplay();

      // 0 Punkte eingeben = Spieler hat nichts getroffen / Bust
      await processScore(0, { bestSet, bestLeg });
    });
  }
}
