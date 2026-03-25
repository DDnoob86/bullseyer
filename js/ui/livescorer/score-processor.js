// Zentrale Score-Verarbeitung - eliminiert Duplikation zwischen events.js und keypad.js
import * as store from '../../state/store.js';
import { saveThrow } from '../../services/match.js';
import { getPlayerId, switchPlayer } from '../../utils/players.js';
import { distributeDarts } from '../../utils/constants.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { handleLegEnd } from './game-logic.js';
import { updateAllDisplays } from './display.js';
import { showCheckoutDialog, showBustToast } from './dialogs.js';

/**
 * Verarbeitet einen Score (von Quick-Score ODER Numpad)
 * @param {number} score - Geworfener Score
 * @param {Object} options
 * @param {number} options.bestSet
 * @param {number} options.bestLeg
 * @param {boolean} options.askCheckoutDialog - true = bei Finish den Checkout-Dialog zeigen
 * @param {number} [options.finishDarts=3] - Nur relevant wenn askCheckoutDialog=false
 * @param {boolean} [options.bullfinish=false] - Nur relevant wenn askCheckoutDialog=false
 */
export async function processScore(score, options = {}) {
  const {
    bestSet = 3,
    bestLeg = 3,
    askCheckoutDialog = true,
    finishDarts: presetFinishDarts = 3,
    bullfinish: presetBullfinish = false
  } = options;

  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);
  const isDoubleOut = match?.double_out;
  const newRemaining = remaining - score;

  // === BUST CHECKS ===
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

  if (isFinish && isDoubleOut && !isValidCheckout(remaining)) {
    showBustToast('BUST! Kein Checkout 💥');
    store.setCurrentPlayer(switchPlayer(currentPlayer));
    updateAllDisplays(bestSet, bestLeg);
    return;
  }

  // === CHECKOUT DIALOG ===
  let finishDarts = presetFinishDarts;
  let bullfinish = presetBullfinish;

  if (isFinish && askCheckoutDialog) {
    const result = await showCheckoutDialog(remaining);
    finishDarts = result.darts;
    bullfinish = result.bullfinish;
  }

  if (bullfinish) {
    store.setBullfinish(true);
  }

  // === WURF SPEICHERN ===
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

  // === STATE AKTUALISIEREN ===
  store.setRemaining(currentPlayer, newRemaining);
  store.setCurrentPlayer(switchPlayer(currentPlayer));

  // UI aktualisieren
  updateAllDisplays(bestSet, bestLeg);

  // === LEG-ENDE PRÜFEN ===
  if (isFinish) {
    if (leg) leg.finishDarts = finishDarts;
    await handleLegEnd('Score', { finishDarts, bullfinish });
  }
}
