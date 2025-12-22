// Keypad-Logik für den Livescorer
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { SCORE_THRESHOLDS, MULTIPLIER } from '../../utils/constants.js';
import { checkBust, handleLegEnd } from './game-logic.js';
import { updateRestpunkteUI, updateSetsLegsUI, updateAverages, updateDetailedStats } from './display.js';

// Keypad State
let currentDartIndex = 0;
let darts = [0, 0, 0];
let dartMultipliers = [MULTIPLIER.SINGLE, MULTIPLIER.SINGLE, MULTIPLIER.SINGLE];

/**
 * Initialisiert den Keypad-State
 */
export function initKeypadState() {
  currentDartIndex = 0;
  darts = [0, 0, 0];
  dartMultipliers = [MULTIPLIER.SINGLE, MULTIPLIER.SINGLE, MULTIPLIER.SINGLE];
}

/**
 * Gibt den aktuellen Keypad-State zurück
 */
export function getKeypadState() {
  return {
    currentDartIndex,
    darts: [...darts],
    dartMultipliers: [...dartMultipliers]
  };
}

/**
 * Setzt den Wert eines Darts
 */
export function setDartValue(dartIndex, value) {
  if (dartIndex >= 0 && dartIndex < 3) {
    darts[dartIndex] = Math.min(value, SCORE_THRESHOLDS.MAX_SINGLE_DART);
  }
}

/**
 * Setzt den Multiplier eines Darts
 */
export function setDartMultiplier(dartIndex, multiplier) {
  if (dartIndex >= 0 && dartIndex < 3) {
    dartMultipliers[dartIndex] = multiplier;
  }
}

/**
 * Fügt eine Ziffer zum aktuellen Dart hinzu
 */
export function addDigitToCurrentDart(digit) {
  const currentValue = darts[currentDartIndex];
  if (currentValue === 0) {
    darts[currentDartIndex] = parseInt(digit);
  } else {
    const newValue = parseInt(currentValue.toString() + digit);
    if (newValue <= SCORE_THRESHOLDS.MAX_SINGLE_DART) {
      darts[currentDartIndex] = newValue;
    }
  }
  return darts[currentDartIndex];
}

/**
 * Entfernt die letzte Ziffer vom aktuellen Dart
 */
export function backspaceCurrentDart() {
  const currentValue = darts[currentDartIndex];
  if (currentValue >= 10) {
    darts[currentDartIndex] = Math.floor(currentValue / 10);
  } else {
    darts[currentDartIndex] = 0;
  }
  return darts[currentDartIndex];
}

/**
 * Setzt alle Darts zurück
 */
export function clearAllDarts() {
  darts = [0, 0, 0];
  dartMultipliers = [MULTIPLIER.SINGLE, MULTIPLIER.SINGLE, MULTIPLIER.SINGLE];
  currentDartIndex = 0;
}

/**
 * Wechselt zum nächsten Dart
 * @returns {boolean} True wenn alle Darts eingegeben wurden
 */
export function nextDart() {
  if (currentDartIndex < 2) {
    currentDartIndex++;
    return false;
  }
  return true;
}

/**
 * Berechnet den Gesamt-Score
 */
export function calculateTotalScore() {
  return (darts[0] * dartMultipliers[0]) +
         (darts[1] * dartMultipliers[1]) +
         (darts[2] * dartMultipliers[2]);
}

/**
 * Findet den Multiplier des letzten eingegebenen Darts
 * @returns {number} Multiplier des letzten Darts mit Wert > 0
 */
function getLastEnteredDartMultiplier() {
  for (let i = currentDartIndex; i >= 0; i--) {
    if (darts[i] > 0) {
      return dartMultipliers[i];
    }
  }
  return MULTIPLIER.SINGLE; // Fallback
}

/**
 * Prüft ob der aktuelle Score ein gültiges Finish ist
 * @returns {boolean} True wenn Finish erreicht (Score = Remaining und Double-Out erfüllt)
 */
function isCurrentScoreFinish() {
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);
  const currentScore = calculateTotalScore();
  const match = store.getCurrentMatch();

  // Kein Finish wenn Score != Remaining
  if (currentScore !== remaining || currentScore === 0) return false;

  // Bei Double-Out: Letzter eingegebener Dart muss Double sein
  if (match?.double_out) {
    // Finde den letzten eingegebenen Dart (nicht 0)
    for (let i = currentDartIndex; i >= 0; i--) {
      if (darts[i] > 0) {
        return dartMultipliers[i] === MULTIPLIER.DOUBLE;
      }
    }
    return false;
  }

  return true;
}

/**
 * Aktualisiert die Dart-Displays im UI
 * @param {HTMLElement} container - Der Container mit den Dart-Displays
 */
export function updateDartDisplays(container) {
  const displays = [
    container.querySelector('#dart1Display'),
    container.querySelector('#dart2Display'),
    container.querySelector('#dart3Display')
  ];
  const totalDisplay = container.querySelector('#totalDisplay');

  displays.forEach((display, i) => {
    if (display) {
      const value = darts[i];
      const mult = dartMultipliers[i];

      // Prefix je nach Multiplier
      let prefix = '';
      if (value > 0) {
        if (mult === MULTIPLIER.DOUBLE) prefix = 'D';
        else if (mult === MULTIPLIER.TRIPLE) prefix = 'T';
        else prefix = 'S';
      }

      display.textContent = value > 0 ? prefix + value : value;

      // Highlight current dart
      if (i === currentDartIndex) {
        display.classList.add('border-4', 'border-emerald-500');
        display.classList.remove('border-2', 'border-gray-300');
      } else {
        display.classList.remove('border-4', 'border-emerald-500');
        display.classList.add('border-2', 'border-gray-300');
      }
    }
  });

  if (totalDisplay) {
    totalDisplay.textContent = calculateTotalScore();
  }
}

/**
 * Initialisiert die Keypad Event-Handler
 * @param {HTMLElement} container - Der App-Container
 * @param {Object} options - Optionen { bestSet, bestLeg, onScoreSubmitted }
 */
export function initKeypadHandlers(container, options = {}) {
  const { bestSet = 3, bestLeg = 3, onScoreSubmitted } = options;

  const keypadContainer = container.querySelector('.grid.grid-cols-3.gap-3.mb-4');
  if (!keypadContainer || keypadContainer.hasAttribute('data-bullseyer-initialized')) {
    return;
  }
  keypadContainer.setAttribute('data-bullseyer-initialized', 'true');

  // Hilfsfunktion: Submit-Button Text aktualisieren
  const updateSubmitButtonText = () => {
    const submitBtn = container.querySelector('#submitScore');
    if (submitBtn) {
      if (isCurrentScoreFinish()) {
        submitBtn.textContent = 'Finish! ✓';
        submitBtn.classList.add('bg-gradient-to-r', 'from-amber-500', 'to-amber-600');
        submitBtn.classList.remove('from-emerald-500', 'to-emerald-600');
      } else {
        submitBtn.textContent = currentDartIndex === 2 ? 'Score eingeben' : 'Weiter →';
        submitBtn.classList.remove('from-amber-500', 'to-amber-600');
        submitBtn.classList.add('from-emerald-500', 'to-emerald-600');
      }
    }
  };

  // Ziffern-Buttons
  const keypadBtns = container.querySelectorAll('.keypad-btn');
  keypadBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const digit = btn.getAttribute('data-digit');
      if (digit !== null) {
        addDigitToCurrentDart(digit);
        updateDartDisplays(container);
        updateSubmitButtonText();
      }
    });
  });

  // Multiplier Buttons
  const multBtns = container.querySelectorAll('.mult-btn');
  multBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dartIndex = parseInt(btn.getAttribute('data-dart'));
      const mult = parseInt(btn.getAttribute('data-mult'));

      setDartMultiplier(dartIndex, mult);

      // Button-Highlight aktualisieren
      const dartGroup = btn.parentElement;
      dartGroup.querySelectorAll('.mult-btn').forEach(b => {
        if (b === btn) {
          b.classList.add('ring-2', 'ring-white', 'ring-offset-2');
        } else {
          b.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
        }
      });

      updateDartDisplays(container);
      updateSubmitButtonText();
    });
  });

  // Clear Button
  const clearBtn = container.querySelector('#clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllDarts();
      resetMultiplierButtons(container);
      updateDartDisplays(container);
    });
  }

  // Backspace Button
  const backspaceBtn = container.querySelector('#backspaceBtn');
  if (backspaceBtn) {
    backspaceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      backspaceCurrentDart();
      updateDartDisplays(container);
    });
  }

  // Submit Button
  const submitBtn = container.querySelector('#submitScore');
  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Prüfe ob aktueller Score ein Finish ist
      const isFinish = isCurrentScoreFinish();

      // Wenn noch nicht alle 3 Darts UND kein Finish: zum nächsten Dart wechseln
      if (!isFinish && !nextDart()) {
        updateDartDisplays(container);
        // Prüfe nach Dart-Wechsel ob jetzt ein Finish möglich ist
        const finishPossible = isCurrentScoreFinish();
        submitBtn.textContent = finishPossible ? 'Finish! ✓' : (currentDartIndex === 2 ? 'Score eingeben' : 'Weiter →');
        return;
      }

      // Score berechnen und verarbeiten
      const score = calculateTotalScore();
      const match = store.getCurrentMatch();
      const currentPlayer = store.getCurrentPlayer();
      const remaining = store.getRemaining(currentPlayer);

      // Bust-Check - verwende den Multiplier des letzten eingegebenen Darts
      const lastMultiplier = getLastEnteredDartMultiplier();
      const bustResult = checkBust(score, remaining, match?.double_out, lastMultiplier);
      if (bustResult.isBust) {
        alert(bustResult.reason);
        clearAllDarts();
        resetMultiplierButtons(container);
        updateDartDisplays(container);
        submitBtn.textContent = 'Weiter →';

        // Spieler wechseln bei Bust
        store.setCurrentPlayer(switchPlayer(currentPlayer));
        updateRestpunkteUI();
        return;
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
          dart1: darts[0] * dartMultipliers[0],
          dart2: darts[1] * dartMultipliers[1],
          dart3: darts[2] * dartMultipliers[2],
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

      // Keypad zurücksetzen
      clearAllDarts();
      resetMultiplierButtons(container);
      updateDartDisplays(container);
      submitBtn.textContent = 'Weiter →';

      // Leg-Ende prüfen
      if (store.getRemainingP1() === 0 || store.getRemainingP2() === 0) {
        const matchEnded = await handleLegEnd('Keypad Submit');
        if (matchEnded) return;
      }

      // Callback aufrufen
      if (onScoreSubmitted) {
        onScoreSubmitted(score);
      }
    });
  }
}

/**
 * Setzt die Multiplier-Buttons auf Single zurück
 */
function resetMultiplierButtons(container) {
  container.querySelectorAll('.mult-btn').forEach(btn => {
    const mult = parseInt(btn.getAttribute('data-mult'));
    if (mult === MULTIPLIER.SINGLE) {
      btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
    } else {
      btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
    }
  });
}
