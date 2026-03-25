// Game Logic für den Livescorer - Leg/Set/Match Ende Handling
import * as store from '../../state/store.js';
import { saveLeg as saveMatchLeg, finishMatch as finishMatchDb, createLeg } from '../../services/match.js';
import { updateSeasonStats, exportMatchToCSV, downloadCSV } from '../../services/stats.js';
import { PLAYER, START_SCORE } from '../../utils/constants.js';
import { getPlayerNames, getPlayerId, switchPlayer, getMatchWinner, getSetWinner } from '../../utils/players.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { updateAllDisplays } from './display.js';

/**
 * Prüft auf Bust-Bedingungen (vereinfacht - Double-Out wird über Checkout-Tabelle geprüft)
 */
export function checkBust(score, remaining, doubleOut = true) {
  const newRemaining = remaining - score;

  if (score > remaining) {
    return { isBust: true, reason: 'BUST! Score zu hoch.' };
  }

  if (newRemaining === 1 && doubleOut) {
    return { isBust: true, reason: 'BUST! Kann nicht auf 1 finishen.' };
  }

  if (newRemaining < 0) {
    return { isBust: true, reason: 'BUST! Score unter 0.' };
  }

  // Bei Double-Out und Finish: Prüfe ob Checkout möglich war
  if (newRemaining === 0 && doubleOut && !isValidCheckout(remaining)) {
    return { isBust: true, reason: 'BUST! Kein gültiger Checkout möglich.' };
  }

  return { isBust: false, reason: null };
}

/**
 * Behandelt das Ende eines Legs
 */
export async function handleLegEnd(source) {
  console.log(`[GameLogic] Leg beendet - ${source}`);

  const match = store.getCurrentMatch();
  const leg = store.getCurrentLeg();

  // Leg in DB speichern
  if (match && leg) {
    try {
      await saveMatchLeg(
        match,
        leg,
        store.getCurrentSetNo(),
        store.getCurrentLegNo(),
        store.getRemainingP1(),
        store.getBullfinish()
      );
      console.log('[GameLogic] Leg gespeichert');
    } catch (error) {
      console.error('[GameLogic] Fehler beim Speichern des Legs:', error);
    }
  }

  // Gewinner bestimmen
  const legWinner = store.getRemainingP1() === 0 ? PLAYER.P1 : PLAYER.P2;
  store.incrementLegsWon(legWinner);

  // Prüfe ob Set gewonnen
  const bestLeg = match?.best_of_legs || 3;
  const legsWon = store.getLegsWon();
  const setWinner = getSetWinner(legsWon, bestLeg);

  if (setWinner) {
    store.incrementSetsWon(setWinner);
    console.log('[GameLogic] Set gewonnen von', setWinner);

    // Prüfe ob Match gewonnen
    const bestSet = match?.best_of_sets || 3;
    const setsWon = store.getSetsWon();
    const matchWinner = getMatchWinner(setsWon, bestSet);

    if (matchWinner) {
      console.log('[GameLogic] MATCH GEWONNEN von', matchWinner);
      await handleMatchEnd(matchWinner);
      return true;
    }

    // Neues Set
    store.startNewSet();
  } else {
    // Nächstes Leg
    store.startNewLeg();
  }

  // Neues Leg erstellen
  const newLeg = createLeg(match, store.getCurrentSetNo(), store.getCurrentLegNo());
  store.setCurrentLeg(newLeg);

  // UI aktualisieren
  updateAllDisplays(match?.best_of_sets || 3, match?.best_of_legs || 3);

  console.log('[GameLogic] Neues Leg - Set', store.getCurrentSetNo(), 'Leg', store.getCurrentLegNo());
  return false;
}

/**
 * Behandelt das Ende eines Matches
 */
async function handleMatchEnd(winner) {
  const match = store.getCurrentMatch();
  const setsWon = store.getSetsWon();
  const allMatchThrows = store.getAllMatchThrows();
  const winnerId = getPlayerId(match, winner);

  await finishMatchDb(match.id, winnerId);
  await updateSeasonStats(match, winner, setsWon, allMatchThrows);

  localStorage.removeItem('bullseyer_currentMatchId');
  showMatchEndScreen(match, winner, setsWon, allMatchThrows);
}

/**
 * Zeigt den Match-End-Screen an
 */
function showMatchEndScreen(match, winner, setsWon, allMatchThrows) {
  const app = document.getElementById('app');
  if (!app) return;

  const names = getPlayerNames(match);
  const winnerName = winner === PLAYER.P1 ? names.p1 : names.p2;

  const p1Throws = allMatchThrows.filter(t => t.player === PLAYER.P1);
  const p2Throws = allMatchThrows.filter(t => t.player === PLAYER.P2);

  const p1Avg = p1Throws.length ? (p1Throws.reduce((s, t) => s + t.score, 0) / p1Throws.length).toFixed(2) : '0.00';
  const p2Avg = p2Throws.length ? (p2Throws.reduce((s, t) => s + t.score, 0) / p2Throws.length).toFixed(2) : '0.00';

  const p1_180s = p1Throws.filter(t => t.score === 180).length;
  const p2_180s = p2Throws.filter(t => t.score === 180).length;
  const p1_140s = p1Throws.filter(t => t.score >= 140).length;
  const p2_140s = p2Throws.filter(t => t.score >= 140).length;
  const p1HighScore = p1Throws.length ? Math.max(...p1Throws.map(t => t.score)) : 0;
  const p2HighScore = p2Throws.length ? Math.max(...p2Throws.map(t => t.score)) : 0;
  const p1Darts = p1Throws.length * 3;
  const p2Darts = p2Throws.length * 3;

  const matchExportData = {
    matchId: match.id,
    date: new Date().toISOString().slice(0, 10),
    p1Name: names.p1, p2Name: names.p2,
    winner: winnerName,
    setsP1: setsWon.p1, setsP2: setsWon.p2,
    p1Avg, p2Avg, p1_180s, p2_180s, p1_140s, p2_140s,
    p1HighScore, p2HighScore, p1Darts, p2Darts,
    allThrows: allMatchThrows
  };

  const winnerColor = winner === PLAYER.P1
    ? 'from-emerald-50 via-white to-emerald-50 border-emerald-400'
    : 'from-rose-50 via-white to-rose-50 border-rose-400';

  app.innerHTML = `
    <div class="max-w-4xl mx-auto mt-8 p-8 bg-gradient-to-br ${winnerColor} rounded-2xl shadow-2xl border-4">
      <!-- Gewinner-Banner -->
      <div class="text-center mb-8 p-6 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-xl shadow-lg">
        <div class="text-5xl mb-3">🏆</div>
        <h1 class="text-5xl font-bold text-gray-900 mb-3">${winnerName}</h1>
        <p class="text-3xl font-semibold text-gray-800">gewinnt das Match!</p>
        <p class="text-2xl font-bold text-gray-700 mt-2">${setsWon.p1} : ${setsWon.p2} Sets</p>
      </div>

      <!-- Statistiken -->
      <div class="bg-white rounded-xl p-6 mb-6 shadow-xl border-2 border-gray-200">
        <h2 class="text-3xl font-bold mb-6 text-center text-gray-800">Match-Statistiken</h2>
        <div class="grid grid-cols-3 gap-6">
          <div class="text-center font-bold text-xl text-emerald-700 pb-3 border-b-2 border-emerald-300">${names.p1}</div>
          <div class="text-center font-bold text-xl text-gray-600 pb-3 border-b-2 border-gray-300">Statistik</div>
          <div class="text-center font-bold text-xl text-rose-700 pb-3 border-b-2 border-rose-300">${names.p2}</div>

          <div class="text-center text-3xl font-bold text-emerald-600">${setsWon.p1}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Sets gewonnen</div>
          <div class="text-center text-3xl font-bold text-rose-600">${setsWon.p2}</div>

          <div class="text-center text-2xl font-bold text-emerald-700">${p1Avg}</div>
          <div class="text-center text-lg font-semibold text-gray-600">3-Dart Average</div>
          <div class="text-center text-2xl font-bold text-rose-700">${p2Avg}</div>

          <div class="text-center text-2xl font-bold">${p1HighScore}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Höchster Score</div>
          <div class="text-center text-2xl font-bold">${p2HighScore}</div>

          <div class="text-center text-2xl font-bold">${p1_180s}</div>
          <div class="text-center text-lg font-semibold text-gray-600">180er</div>
          <div class="text-center text-2xl font-bold">${p2_180s}</div>

          <div class="text-center text-xl font-bold">${p1_140s}</div>
          <div class="text-center text-lg font-semibold text-gray-600">140+ Scores</div>
          <div class="text-center text-xl font-bold">${p2_140s}</div>

          <div class="text-center text-lg font-semibold">${p1Darts}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Darts geworfen</div>
          <div class="text-center text-lg font-semibold">${p2Darts}</div>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-6 justify-center">
        <button id="backToDashboard" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">← Dashboard</button>
        <button id="exportMatch" class="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">📊 Export</button>
      </div>
    </div>
  `;

  // Event-Handler
  document.getElementById('backToDashboard').onclick = () => {
    store.resetState();
    window.location.hash = '#/dashboard';
  };

  document.getElementById('exportMatch').onclick = () => {
    const csv = exportMatchToCSV(matchExportData);
    downloadCSV(csv, `bullseyer_match_${names.p1}_vs_${names.p2}_${matchExportData.date}.csv`);
  };

  // Header wieder einblenden
  const mainHeader = document.getElementById('mainHeader');
  if (mainHeader) mainHeader.style.display = 'block';
}
