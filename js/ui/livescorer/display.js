// Display-Funktionen für den Livescorer
import * as store from '../../state/store.js';
import { calculateLegAverage, calculateMatchAverage, formatAverage } from '../../services/stats.js';
import { PLAYER } from '../../utils/constants.js';

/**
 * Aktualisiert die Restpunkte-Anzeige
 */
export function updateRestpunkteUI() {
  const restP1El = document.getElementById('restP1');
  const restP2El = document.getElementById('restP2');

  if (!restP1El || !restP2El) {
    console.warn('[Display] Restpunkte-Elemente nicht gefunden');
    return;
  }

  restP1El.textContent = store.getRemainingP1();
  restP2El.textContent = store.getRemainingP2();

  console.log('[Display] Restpunkte aktualisiert - P1:', store.getRemainingP1(), 'P2:', store.getRemainingP2());

  // Player-Indicator aktualisieren
  updatePlayerIndicator();
}

/**
 * Aktualisiert die Sets/Legs Anzeige
 * @param {number} bestSet - Best-of-Sets
 * @param {number} bestLeg - Best-of-Legs
 */
export function updateSetsLegsUI(bestSet, bestLeg) {
  const p1SetsEl = document.getElementById('p1SetsDisplay');
  const p1LegsEl = document.getElementById('p1LegsDisplay');
  const p2SetsEl = document.getElementById('p2SetsDisplay');
  const p2LegsEl = document.getElementById('p2LegsDisplay');

  const setsWon = store.getSetsWon();
  const legsWon = store.getLegsWon();
  const setNo = store.getCurrentSetNo();
  const legNo = store.getCurrentLegNo();

  if (p1SetsEl) p1SetsEl.textContent = `Sets: ${setsWon.p1}/${bestSet}`;
  if (p1LegsEl) p1LegsEl.textContent = `Legs: ${legsWon.p1}/${bestLeg}`;
  if (p2SetsEl) p2SetsEl.textContent = `Sets: ${setsWon.p2}/${bestSet}`;
  if (p2LegsEl) p2LegsEl.textContent = `Legs: ${legsWon.p2}/${bestLeg}`;

  console.log('[Display] Sets/Legs aktualisiert:', { setsWon, legsWon, setNo, legNo });
}

/**
 * Aktualisiert die Average-Anzeige
 */
export function updateAverages() {
  const throwHistory = store.getThrowHistory();
  const allMatchThrows = store.getAllMatchThrows();
  const legNo = store.getCurrentLegNo();
  const setNo = store.getCurrentSetNo();

  // Leg-Averages berechnen
  const legAvgP1 = calculateLegAverage(throwHistory, PLAYER.P1, legNo, setNo);
  const legAvgP2 = calculateLegAverage(throwHistory, PLAYER.P2, legNo, setNo);

  // Match-Averages berechnen
  const matchAvgP1 = calculateMatchAverage(allMatchThrows, PLAYER.P1);
  const matchAvgP2 = calculateMatchAverage(allMatchThrows, PLAYER.P2);

  // UI-Elemente aktualisieren
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

  if (currentPlayer === PLAYER.P1) {
    // P1 ist aktiv
    player1Box.className = 'player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/40 dark:to-emerald-800/40 border-4 border-emerald-600 rounded-xl p-6 flex flex-col items-center shadow-xl animate-pulse';
    player2Box.className = 'player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 border-2 border-gray-300 dark:border-slate-600 rounded-xl p-6 flex flex-col items-center opacity-50';
  } else {
    // P2 ist aktiv
    player2Box.className = 'player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/40 dark:to-rose-800/40 border-4 border-rose-600 rounded-xl p-6 flex flex-col items-center shadow-xl animate-pulse';
    player1Box.className = 'player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-2 border-gray-300 dark:border-slate-600 rounded-xl p-6 flex flex-col items-center opacity-50';
  }
}

/**
 * Aktualisiert die detaillierten Match-Statistiken
 */
export function updateDetailedStats() {
  const allMatchThrows = store.getAllMatchThrows();

  const stats = {
    p1: { count180: 0, count140Plus: 0, highScore: 0, dartsLeg: 0, dartsMatch: 0 },
    p2: { count180: 0, count140Plus: 0, highScore: 0, dartsLeg: 0, dartsMatch: 0 }
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

  // UI aktualisieren (wenn Elemente existieren)
  const elements = {
    p1_180s: document.getElementById('p1_180s'),
    p1_140plus: document.getElementById('p1_140plus'),
    p1_highscore: document.getElementById('p1_highscore'),
    p1_darts_match: document.getElementById('p1_darts_match'),
    p2_180s: document.getElementById('p2_180s'),
    p2_140plus: document.getElementById('p2_140plus'),
    p2_highscore: document.getElementById('p2_highscore'),
    p2_darts_match: document.getElementById('p2_darts_match')
  };

  if (elements.p1_180s) elements.p1_180s.textContent = stats.p1.count180;
  if (elements.p1_140plus) elements.p1_140plus.textContent = stats.p1.count140Plus;
  if (elements.p1_highscore) elements.p1_highscore.textContent = stats.p1.highScore;
  if (elements.p1_darts_match) elements.p1_darts_match.textContent = stats.p1.dartsMatch;

  if (elements.p2_180s) elements.p2_180s.textContent = stats.p2.count180;
  if (elements.p2_140plus) elements.p2_140plus.textContent = stats.p2.count140Plus;
  if (elements.p2_highscore) elements.p2_highscore.textContent = stats.p2.highScore;
  if (elements.p2_darts_match) elements.p2_darts_match.textContent = stats.p2.dartsMatch;
}

/**
 * Aktualisiert alle Display-Elemente
 * @param {number} bestSet - Best-of-Sets
 * @param {number} bestLeg - Best-of-Legs
 */
export function updateAllDisplays(bestSet, bestLeg) {
  updateRestpunkteUI();
  updateSetsLegsUI(bestSet, bestLeg);
  updateAverages();
  updateDetailedStats();
  updatePlayerIndicator();
}
