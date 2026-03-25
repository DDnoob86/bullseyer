// Display-Funktionen für den Livescorer
import * as store from '../../state/store.js';
import { calculateLegAverage, calculateMatchAverage, formatAverage } from '../../services/stats.js';
import { PLAYER } from '../../utils/constants.js';
import { isValidCheckout, getCheckoutSuggestion } from '../../utils/checkouts.js';

/**
 * Aktualisiert die Restpunkte-Anzeige
 */
export function updateRestpunkteUI() {
  const restP1El = document.getElementById('restP1');
  const restP2El = document.getElementById('restP2');

  if (restP1El) restP1El.textContent = store.getRemainingP1();
  if (restP2El) restP2El.textContent = store.getRemainingP2();

  updatePlayerIndicator();
}

/**
 * Aktualisiert die Sets/Legs Anzeige
 */
export function updateSetsLegsUI(bestSet, bestLeg) {
  const p1SetsEl = document.getElementById('p1SetsDisplay');
  const p1LegsEl = document.getElementById('p1LegsDisplay');
  const p2SetsEl = document.getElementById('p2SetsDisplay');
  const p2LegsEl = document.getElementById('p2LegsDisplay');

  const setsWon = store.getSetsWon();
  const legsWon = store.getLegsWon();

  if (p1SetsEl) p1SetsEl.textContent = `Sets: ${setsWon.p1}`;
  if (p1LegsEl) p1LegsEl.textContent = `Legs: ${legsWon.p1}`;
  if (p2SetsEl) p2SetsEl.textContent = `Sets: ${setsWon.p2}`;
  if (p2LegsEl) p2LegsEl.textContent = `Legs: ${legsWon.p2}`;
}

/**
 * Aktualisiert die Average-Anzeige
 */
export function updateAverages() {
  const throwHistory = store.getThrowHistory();
  const allMatchThrows = store.getAllMatchThrows();
  const legNo = store.getCurrentLegNo();
  const setNo = store.getCurrentSetNo();

  const legAvgP1 = calculateLegAverage(throwHistory, PLAYER.P1, legNo, setNo);
  const legAvgP2 = calculateLegAverage(throwHistory, PLAYER.P2, legNo, setNo);
  const matchAvgP1 = calculateMatchAverage(allMatchThrows, PLAYER.P1);
  const matchAvgP2 = calculateMatchAverage(allMatchThrows, PLAYER.P2);

  const avgP1LegEl = document.getElementById('avgP1Leg');
  const avgP1MatchEl = document.getElementById('avgP1Match');
  const avgP2LegEl = document.getElementById('avgP2Leg');
  const avgP2MatchEl = document.getElementById('avgP2Match');

  if (avgP1LegEl) avgP1LegEl.textContent = `Leg: Ø ${formatAverage(legAvgP1)}`;
  if (avgP1MatchEl) avgP1MatchEl.textContent = `Match: Ø ${formatAverage(matchAvgP1)}`;
  if (avgP2LegEl) avgP2LegEl.textContent = `Leg: Ø ${formatAverage(legAvgP2)}`;
  if (avgP2MatchEl) avgP2MatchEl.textContent = `Match: Ø ${formatAverage(matchAvgP2)}`;
}

/**
 * Aktualisiert den visuellen Indikator für den aktiven Spieler
 */
export function updatePlayerIndicator() {
  const player1Box = document.querySelector('.player1-box');
  const player2Box = document.querySelector('.player2-box');

  if (!player1Box || !player2Box) return;

  const currentPlayer = store.getCurrentPlayer();

  const activeClasses = (color) =>
    `${color}-box flex-1 bg-gradient-to-br from-${color === 'player1' ? 'emerald' : 'rose'}-50 to-${color === 'player1' ? 'emerald' : 'rose'}-100 dark:from-${color === 'player1' ? 'emerald' : 'rose'}-900/40 dark:to-${color === 'player1' ? 'emerald' : 'rose'}-800/40 border-4 border-${color === 'player1' ? 'emerald' : 'rose'}-600 rounded-xl p-4 flex flex-col items-center shadow-xl`;

  const inactiveClasses = (color) =>
    `${color}-box flex-1 bg-gradient-to-br from-${color === 'player1' ? 'emerald' : 'rose'}-50 to-${color === 'player1' ? 'emerald' : 'rose'}-100 dark:from-${color === 'player1' ? 'emerald' : 'rose'}-900/20 dark:to-${color === 'player1' ? 'emerald' : 'rose'}-800/20 border-2 border-gray-300 dark:border-slate-600 rounded-xl p-4 flex flex-col items-center opacity-50`;

  if (currentPlayer === PLAYER.P1) {
    player1Box.className = activeClasses('player1');
    player2Box.className = inactiveClasses('player2');
  } else {
    player2Box.className = activeClasses('player2');
    player1Box.className = inactiveClasses('player1');
  }
}

/**
 * Aktualisiert die detaillierten Match-Statistiken
 */
export function updateDetailedStats() {
  const allMatchThrows = store.getAllMatchThrows();

  const stats = {
    p1: { count180: 0, count140Plus: 0, highScore: 0, dartsMatch: 0 },
    p2: { count180: 0, count140Plus: 0, highScore: 0, dartsMatch: 0 }
  };

  allMatchThrows.forEach(th => {
    const player = th.player;
    const score = th.score;
    if (player === 'p1' || player === 'p2') {
      stats[player].dartsMatch += 3;
      if (score === 180) stats[player].count180++;
      if (score >= 140) stats[player].count140Plus++;
      if (score > stats[player].highScore) stats[player].highScore = score;
    }
  });

  const els = {
    p1_180s: document.getElementById('p1_180s'),
    p1_140plus: document.getElementById('p1_140plus'),
    p1_highscore: document.getElementById('p1_highscore'),
    p1_darts_match: document.getElementById('p1_darts_match'),
    p2_180s: document.getElementById('p2_180s'),
    p2_140plus: document.getElementById('p2_140plus'),
    p2_highscore: document.getElementById('p2_highscore'),
    p2_darts_match: document.getElementById('p2_darts_match')
  };

  if (els.p1_180s) els.p1_180s.textContent = stats.p1.count180;
  if (els.p1_140plus) els.p1_140plus.textContent = stats.p1.count140Plus;
  if (els.p1_highscore) els.p1_highscore.textContent = stats.p1.highScore;
  if (els.p1_darts_match) els.p1_darts_match.textContent = stats.p1.dartsMatch;
  if (els.p2_180s) els.p2_180s.textContent = stats.p2.count180;
  if (els.p2_140plus) els.p2_140plus.textContent = stats.p2.count140Plus;
  if (els.p2_highscore) els.p2_highscore.textContent = stats.p2.highScore;
  if (els.p2_darts_match) els.p2_darts_match.textContent = stats.p2.dartsMatch;
}

/**
 * Aktualisiert den Checkout-Hinweis für den aktiven Spieler
 */
export function updateCheckoutHint() {
  const hintEl = document.getElementById('checkoutHint');
  if (!hintEl) return;

  const match = store.getCurrentMatch();
  const currentPlayer = store.getCurrentPlayer();
  const remaining = store.getRemaining(currentPlayer);

  if (match?.double_out && remaining <= 170 && isValidCheckout(remaining)) {
    const suggestion = getCheckoutSuggestion(remaining);
    if (suggestion) {
      hintEl.textContent = `🎯 ${suggestion}`;
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
    }
  } else {
    hintEl.classList.add('hidden');
  }
}

/**
 * Aktualisiert alle Display-Elemente
 */
export function updateAllDisplays(bestSet, bestLeg) {
  updateRestpunkteUI();
  updateSetsLegsUI(bestSet, bestLeg);
  updateAverages();
  updateDetailedStats();
  updatePlayerIndicator();
  updateCheckoutHint();
}
