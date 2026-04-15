// Score-Eingabe via Numpad
// OK = geworfene Punkte | Restscore = verbleibende Punkte
// Long-Press auf 1/2/3 = Finish-Shortcut mit X Darts
import * as store from '../../state/store.js';
import { processScore } from './score-processor.js';
import { showBustToast, showFinishConfirmDialog } from './dialogs.js';
import { isValidCheckout, getMinCheckoutDarts, isBullfinishPossible } from '../../utils/checkouts.js';

let currentInput = '';

/**
 * Setzt die Score-Eingabe zurück
 */
export function resetScoreInput() {
  currentInput = '';
  updateScoreDisplay();
}

export function getCurrentInput() {
  return currentInput;
}

// ============================================================
// DISPLAY
// ============================================================

function updateScoreDisplay() {
  const display = document.getElementById('scoreDisplay');
  if (display) display.textContent = currentInput || '0';
}

// ============================================================
// SCORE UMRECHNUNG
// ============================================================

/**
 * Interpretiert die Eingabe als geworfene Punkte
 */
function resolveAsScore(rawValue) {
  if (isNaN(rawValue) || rawValue < 0) return { score: 0, valid: false };
  if (rawValue > 180) return { score: 0, valid: false, errorMsg: 'Max 180! 💥' };
  return { score: rawValue, valid: true };
}

/**
 * Interpretiert die Eingabe als Restscore → berechnet geworfene Punkte
 */
function resolveAsRest(rawValue) {
  if (isNaN(rawValue) || rawValue < 0) return { score: 0, valid: false };

  const remaining = store.getRemaining(store.getCurrentPlayer());
  const score = remaining - rawValue;

  if (score < 0) return { score: 0, valid: false, errorMsg: 'Rest zu hoch! 💥' };
  if (score > 180) return { score: 0, valid: false, errorMsg: 'Max 180 pro Aufnahme! 💥' };
  return { score, valid: true };
}

// ============================================================
// INITIALISIERUNG
// ============================================================

export function initScoreInput(container, options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

  const inputArea = container.querySelector('#scoreInputArea');
  if (!inputArea || inputArea.hasAttribute('data-bullseyer-initialized')) return;
  inputArea.setAttribute('data-bullseyer-initialized', 'true');

  currentInput = '';
  updateScoreDisplay();

  // Long-Press Tracking
  const LONG_PRESS_MS = 500;
  let longPressTimer = null;
  let longPressTriggered = false;

  /**
   * Long-Press auf 1/2/3: Finish-Shortcut
   * Interpretiert den aktuellen Score-Display als geworfene Punkte,
   * und die gedrückte Ziffer als Anzahl Finish-Darts.
   */
  async function handleFinishLongPress(darts) {
    const currentPlayer = store.getCurrentPlayer();
    const remaining = store.getRemaining(currentPlayer);
    const match = store.getCurrentMatch();
    const isDoubleOut = match?.double_out;

    // Score aus Display holen (was bisher eingegeben wurde)
    const rawScore = parseInt(currentInput, 10);

    // Wenn kein Score eingegeben: remaining direkt als Checkout-Score nehmen
    const score = isNaN(rawScore) || rawScore === 0 ? remaining : rawScore;

    // Validierung: Score muss genau remaining treffen
    if (score !== remaining) {
      showBustToast('Score muss genau Rest treffen! 💥');
      return;
    }

    // Double-Out Validierung
    if (isDoubleOut && !isValidCheckout(remaining)) {
      showBustToast('Kein gültiger Checkout! 💥');
      return;
    }

    // Min-Darts Validierung
    const minDarts = getMinCheckoutDarts(remaining);
    if (darts < minDarts) {
      showBustToast(`Minimum ${minDarts} Dart${minDarts > 1 ? 's' : ''} nötig! 💥`);
      return;
    }

    // Bestätigungsdialog anzeigen
    const { confirmed, bullfinish } = await showFinishConfirmDialog(score, remaining, darts);
    if (!confirmed) return;

    // Score verarbeiten (ohne Checkout-Dialog, da Darts schon bekannt)
    currentInput = '';
    updateScoreDisplay();
    await processScore(score, {
      bestSet, bestLeg,
      askCheckoutDialog: false,
      finishDarts: darts,
      bullfinish
    });
  }

  // Numpad Ziffern
  container.querySelectorAll('.numpad-btn').forEach(btn => {
    const digit = btn.getAttribute('data-digit');

    // Long-Press für 1, 2, 3
    if (digit === '1' || digit === '2' || digit === '3') {
      const startLongPress = (e) => {
        e.preventDefault();
        longPressTriggered = false;
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          handleFinishLongPress(parseInt(digit, 10));
        }, LONG_PRESS_MS);
      };

      const cancelLongPress = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      // Touch events
      btn.addEventListener('touchstart', startLongPress, { passive: false });
      btn.addEventListener('touchend', (e) => {
        cancelLongPress();
        if (longPressTriggered) {
          e.preventDefault();
          return;
        }
        // touchstart hat preventDefault() → kein synthetischer click
        // Daher Ziffer hier manuell eintragen
        e.preventDefault();
        const newInput = currentInput + digit;
        const newValue = parseInt(newInput, 10);
        if (newValue <= 501) {
          currentInput = newInput;
          updateScoreDisplay();
        }
      });
      btn.addEventListener('touchmove', cancelLongPress);
      btn.addEventListener('touchcancel', cancelLongPress);

      // Mouse events (Desktop)
      btn.addEventListener('mousedown', startLongPress);
      btn.addEventListener('mouseup', cancelLongPress);
      btn.addEventListener('mouseleave', cancelLongPress);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Long-Press wurde ausgelöst → Click ignorieren
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }
      if (digit === null) return;

      const newInput = currentInput + digit;
      const newValue = parseInt(newInput, 10);

      // Max 501 erlauben (könnte Score oder Rest sein)
      if (newValue > 501) return;

      currentInput = newInput;
      updateScoreDisplay();
    });
  });

  // Clear
  container.querySelector('#clearBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentInput = '';
    updateScoreDisplay();
  });

  // Backspace
  container.querySelector('#backspaceBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentInput = currentInput.slice(0, -1);
    updateScoreDisplay();
  });

  // OK = geworfene Punkte
  container.querySelector('#submitScore')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rawValue = parseInt(currentInput, 10);
    const { score, valid, errorMsg } = resolveAsScore(rawValue);

    currentInput = '';
    updateScoreDisplay();

    if (!valid) {
      if (errorMsg) showBustToast(errorMsg);
      return;
    }

    await processScore(score, { bestSet, bestLeg, askCheckoutDialog: true });
  });

  // Restscore = verbleibende Punkte → Score berechnen
  container.querySelector('#submitRest')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rawValue = parseInt(currentInput, 10);
    const { score, valid, errorMsg } = resolveAsRest(rawValue);

    currentInput = '';
    updateScoreDisplay();

    if (!valid) {
      if (errorMsg) showBustToast(errorMsg);
      return;
    }

    await processScore(score, { bestSet, bestLeg, askCheckoutDialog: true });
  });

  // No Score (0 Punkte)
  container.querySelector('#bustBtn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    currentInput = '';
    updateScoreDisplay();
    await processScore(0, { bestSet, bestLeg, askCheckoutDialog: false });
  });
}
