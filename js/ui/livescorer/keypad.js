// Score-Eingabe via Numpad
// OK = geworfene Punkte | Restscore = verbleibende Punkte
import * as store from '../../state/store.js';
import { processScore } from './score-processor.js';
import { showBustToast } from './dialogs.js';

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

  // Numpad Ziffern
  container.querySelectorAll('.numpad-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const digit = btn.getAttribute('data-digit');
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
