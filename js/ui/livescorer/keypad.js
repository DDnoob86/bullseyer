// Vereinfachte Score-Eingabe - Gesamtpunktzahl statt Einzeldarts
// Unterstützt Score-Modus (geworfene Punkte) und Rest-Modus (verbleibende Punkte)
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { distributeDarts } from '../../utils/constants.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { handleLegEnd } from './game-logic.js';
import { updateAllDisplays, updateCheckoutHint } from './display.js';
import { showCheckoutDialog, showBustToast } from './dialogs.js';

// Eingabe-State
let currentInput = '';

// Eingabe-Modus: 'score' (geworfene Punkte) oder 'rest' (verbleibende Punkte)
let inputMode = 'score';

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

function updateScoreDisplay() {
  const display = document.getElementById('scoreDisplay');
  if (display) {
    display.textContent = currentInput || '0';
  }

  // Zeige den berechneten Score an wenn im Rest-Modus
  const calcEl = document.getElementById('calculatedScore');
  if (calcEl) {
    if (inputMode === 'rest' && currentInput) {
      const currentPlayer = store.getCurrentPlayer();
      const remaining = store.getRemaining(currentPlayer);
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
}

function updateModeToggleUI() {
  const modeToggle = document.getElementById('inputModeToggle');
  const modeLabel = document.getElementById('inputModeLabel');
  const modeDesc = document.getElementById('inputModeDesc');
  const scoreDisplay = document.getElementById('scoreDisplay');

  if (modeToggle) {
    if (inputMode === 'rest') {
      modeToggle.classList.remove('bg-blue-500', 'hover:bg-blue-600');
      modeToggle.classList.add('bg-amber-500', 'hover:bg-amber-600');
    } else {
      modeToggle.classList.remove('bg-amber-500', 'hover:bg-amber-600');
      modeToggle.classList.add('bg-blue-500', 'hover:bg-blue-600');
    }
  }
  if (modeLabel) {
    modeLabel.textContent = inputMode === 'score' ? 'Score' : 'Rest';
  }
  if (modeDesc) {
    modeDesc.textContent = inputMode === 'score'
      ? 'Geworfene Punkte eingeben'
      : 'Verbleibende Punkte eingeben';
  }
  if (scoreDisplay) {
    if (inputMode === 'rest') {
      scoreDisplay.classList.remove('border-gray-300', 'dark:border-slate-500');
      scoreDisplay.classList.add('border-amber-400', 'dark:border-amber-500');
    } else {
      scoreDisplay.classList.remove('border-amber-400', 'dark:border-amber-500');
      scoreDisplay.classList.add('border-gray-300', 'dark:border-slate-500');
    }
  }
}

/**
 * Verarbeitet einen Score (von Numpad oder Quick-Score)
 */
async function processScore(score, options = {}) {
  const { bestSet = 3, bestLeg = 3, finishDarts = 3, bullfinish = false } = options;

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

  if (newRemaining === 0 && isDoubleOut && !isValidCheckout(remaining)) {
    showBustToast('BUST! Kein Checkout 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    return;
  }

  const isFinish = newRemaining === 0;

  if (bullfinish) {
    store.setBullfinish(true);
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
    bullfinish: bullfinish || store.getBullfinish(),
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

  console.log('[Keypad] Score:', score, 'Finish:', isFinish, 'Darts:', finishDarts, 'Bull:', bullfinish);

  // Leg-Ende prüfen
  if (isFinish) {
    if (leg) leg.finishDarts = finishDarts;
    await handleLegEnd('Score Input', { finishDarts, bullfinish });
  }
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
      showBustToast('BUST! Kein Checkout 💥');
      store.setCurrentPlayer(switchPlayer(currentPlayer));
      updateAllDisplays(bestSet, bestLeg);
      return;
    }

    const result = await showCheckoutDialog(remaining);
    await processScore(score, {
      ...options,
      finishDarts: result.darts,
      bullfinish: result.bullfinish
    });
  } else {
    await processScore(score, { ...options, finishDarts: 3, bullfinish: false });
  }
}

/**
 * Initialisiert die vereinfachte Score-Eingabe
 */
export function initScoreInput(container, options = {}) {
  const { bestSet = 3, bestLeg = 3 } = options;

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

      if (inputMode === 'rest') {
        // Im Rest-Modus: Max ist der aktuelle Reststand des Spielers
        const currentPlayer = store.getCurrentPlayer();
        const remaining = store.getRemaining(currentPlayer);
        if (newValue > remaining) return;
      } else {
        if (newValue > 180) return;
      }

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
      const rawValue = parseInt(currentInput, 10);

      if (isNaN(rawValue) || rawValue < 0) {
        currentInput = '';
        updateScoreDisplay();
        return;
      }

      let score;
      if (inputMode === 'rest') {
        // Rest-Modus: Score = aktueller Rest - eingegebener Rest
        const currentPlayer = store.getCurrentPlayer();
        const remaining = store.getRemaining(currentPlayer);
        score = remaining - rawValue;

        if (score < 0) {
          showBustToast('Rest zu hoch! 💥');
          currentInput = '';
          updateScoreDisplay();
          return;
        }
        if (score > 180) {
          showBustToast('Max 180 pro Aufnahme! 💥');
          currentInput = '';
          updateScoreDisplay();
          return;
        }
      } else {
        score = rawValue;
        if (score > 180) {
          showBustToast('Max 180! 💥');
          currentInput = '';
          updateScoreDisplay();
          return;
        }
      }

      currentInput = '';
      updateScoreDisplay();
      await handleScoreSubmit(score, { bestSet, bestLeg });
    });
  }

  // --- No Score Button ---
  const bustBtn = container.querySelector('#bustBtn');
  if (bustBtn) {
    bustBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      currentInput = '';
      updateScoreDisplay();
      await processScore(0, { bestSet, bestLeg });
    });
  }

  // --- Eingabe-Modus Toggle ---
  const modeToggle = container.querySelector('#inputModeToggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInputMode();
    });
  }

  // Initiales UI-Update für den Modus
  updateModeToggleUI();
}
