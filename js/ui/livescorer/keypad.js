// Score-Eingabe via Numpad - Score-Modus und Rest-Modus
import * as store from '../../state/store.js';
import { processScore } from './score-processor.js';
import { showBustToast } from './dialogs.js';

// Eingabe-State
let currentInput = '';
let inputMode = 'score'; // 'score' oder 'rest'

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

/**
 * Gibt den aktuellen Eingabemodus zurück
 */
export function getInputMode() {
  return inputMode;
}

/**
 * Wechselt den Eingabemodus zwischen 'score' und 'rest'
 */
export function toggleInputMode() {
  inputMode = inputMode === 'score' ? 'rest' : 'score';
  currentInput = '';
  updateScoreDisplay();
  updateModeToggleUI();
}

// ============================================================
// DISPLAY UPDATES
// ============================================================

function updateScoreDisplay() {
  const display = document.getElementById('scoreDisplay');
  if (display) display.textContent = currentInput || '0';

  const calcEl = document.getElementById('calculatedScore');
  if (!calcEl) return;

  if (inputMode === 'rest' && currentInput) {
    const remaining = store.getRemaining(store.getCurrentPlayer());
    const restValue = parseInt(currentInput, 10);
    const calculatedScore = remaining - restValue;

    if (calculatedScore >= 0 && calculatedScore <= 180) {
      calcEl.textContent = `= ${calculatedScore} geworfen`;
      calcEl.classList.remove('hidden', 'text-red-500');
      calcEl.classList.add('text-emerald-600', 'dark:text-emerald-400');
    } else if (restValue > remaining) {
      calcEl.textContent = 'Ungültig!';
      calcEl.classList.remove('hidden', 'text-emerald-600');
      calcEl.classList.add('text-red-500');
    } else {
      calcEl.textContent = `= ${calculatedScore} (>180!)`;
      calcEl.classList.remove('hidden', 'text-emerald-600');
      calcEl.classList.add('text-red-500');
    }
  } else {
    calcEl.classList.add('hidden');
  }
}

function updateModeToggleUI() {
  const modeToggle = document.getElementById('inputModeToggle');
  const modeLabel = document.getElementById('inputModeLabel');
  const modeDesc = document.getElementById('inputModeDesc');
  const scoreDisplay = document.getElementById('scoreDisplay');

  const isRest = inputMode === 'rest';

  if (modeToggle) {
    modeToggle.classList.toggle('bg-blue-500', !isRest);
    modeToggle.classList.toggle('hover:bg-blue-600', !isRest);
    modeToggle.classList.toggle('bg-amber-500', isRest);
    modeToggle.classList.toggle('hover:bg-amber-600', isRest);
  }
  if (modeLabel) modeLabel.textContent = isRest ? 'Rest' : 'Score';
  if (modeDesc) modeDesc.textContent = isRest ? 'Verbleibende Punkte eingeben' : 'Geworfene Punkte eingeben';
  if (scoreDisplay) {
    scoreDisplay.classList.toggle('border-gray-300', !isRest);
    scoreDisplay.classList.toggle('dark:border-slate-500', !isRest);
    scoreDisplay.classList.toggle('border-amber-400', isRest);
    scoreDisplay.classList.toggle('dark:border-amber-500', isRest);
  }
}

// ============================================================
// SCORE UMRECHNUNG
// ============================================================

/**
 * Rechnet den Eingabewert in einen Score um (je nach Modus)
 * @returns {{ score: number, valid: boolean, errorMsg?: string }}
 */
function resolveScore(rawValue) {
  if (isNaN(rawValue) || rawValue < 0) {
    return { score: 0, valid: false };
  }

  if (inputMode === 'rest') {
    const remaining = store.getRemaining(store.getCurrentPlayer());
    const score = remaining - rawValue;
    if (score < 0) return { score: 0, valid: false, errorMsg: 'Rest zu hoch! 💥' };
    if (score > 180) return { score: 0, valid: false, errorMsg: 'Max 180 pro Aufnahme! 💥' };
    return { score, valid: true };
  }

  if (rawValue > 180) {
    return { score: 0, valid: false, errorMsg: 'Max 180! 💥' };
  }

  return { score: rawValue, valid: true };
}

// ============================================================
// INITIALISIERUNG
// ============================================================

/**
 * Initialisiert die Score-Eingabe
 */
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

      if (inputMode === 'rest') {
        const remaining = store.getRemaining(store.getCurrentPlayer());
        if (newValue > remaining) return;
      } else {
        if (newValue > 180) return;
      }

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

  // OK / Submit
  container.querySelector('#submitScore')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rawValue = parseInt(currentInput, 10);
    const { score, valid, errorMsg } = resolveScore(rawValue);

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

  // Modus-Toggle
  container.querySelector('#inputModeToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleInputMode();
  });

  updateModeToggleUI();
}
