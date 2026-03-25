// Game Logic für den Livescorer - Leg/Set/Match Ende Handling
import * as store from '../../state/store.js';
import { saveLeg as saveMatchLeg, finishMatch as finishMatchDb, createLeg } from '../../services/match.js';
import { updateSeasonStats, exportMatchToCSV, downloadCSV } from '../../services/stats.js';
import { PLAYER, START_SCORE } from '../../utils/constants.js';
import { getPlayerNames, getPlayerId, switchPlayer, getMatchWinner, getSetWinner } from '../../utils/players.js';
import { isValidCheckout } from '../../utils/checkouts.js';
import { updateAllDisplays } from './display.js';
import { showLegWonOverlay, showSetWonOverlay } from './dialogs.js';

/**
 * Prüft auf Bust-Bedingungen
 */
export function checkBust(score, remaining, doubleOut = true) {
  const newRemaining = remaining - score;
  if (score > remaining) return { isBust: true, reason: 'BUST! Score zu hoch.' };
  if (newRemaining === 1 && doubleOut) return { isBust: true, reason: 'BUST! Kann nicht auf 1 finishen.' };
  if (newRemaining < 0) return { isBust: true, reason: 'BUST! Score unter 0.' };
  if (newRemaining === 0 && doubleOut && !isValidCheckout(remaining)) return { isBust: true, reason: 'BUST! Kein gültiger Checkout möglich.' };
  return { isBust: false, reason: null };
}

/**
 * Behandelt das Ende eines Legs
 * @param {string} source - Quelle (für Logging)
 * @param {Object} details - { finishDarts, bullfinish }
 */
export async function handleLegEnd(source, details = {}) {
  console.log(`[GameLogic] Leg beendet - ${source}`, details);

  const match = store.getCurrentMatch();
  const leg = store.getCurrentLeg();
  const { finishDarts = 3, bullfinish = false } = details;
  const throwHistory = store.getThrowHistory();
  const allMatchThrows = store.getAllMatchThrows();

  // Gewinner bestimmen
  const legWinner = store.getRemainingP1() === 0 ? PLAYER.P1 : PLAYER.P2;

  // Checkout-Score berechnen (der Reststand VOR dem letzten Wurf)
  const winnerThrows = throwHistory.filter(t => t.player === legWinner);
  const lastWinnerThrow = winnerThrows[winnerThrows.length - 1];
  const checkoutScore = lastWinnerThrow
    ? (legWinner === PLAYER.P1 ? lastWinnerThrow.remP1 : lastWinnerThrow.remP2)
    : 0;

  // Darts pro Spieler in diesem Leg berechnen
  const legThrows = throwHistory;
  const p1LegThrows = legThrows.filter(t => t.player === PLAYER.P1);
  const p2LegThrows = legThrows.filter(t => t.player === PLAYER.P2);

  // Bei einem Finish: der Gewinner hat im letzten Wurf finishDarts benutzt, alle anderen Würfe 3
  const p1Darts = legWinner === PLAYER.P1
    ? (p1LegThrows.length - 1) * 3 + finishDarts
    : p1LegThrows.length * 3;
  const p2Darts = legWinner === PLAYER.P2
    ? (p2LegThrows.length - 1) * 3 + finishDarts
    : p2LegThrows.length * 3;

  const p1Total = p1LegThrows.reduce((s, t) => s + t.score, 0);
  const p2Total = p2LegThrows.reduce((s, t) => s + t.score, 0);

  // Leg-Ergebnis im Store speichern
  store.addLegResult({
    setNo: store.getCurrentSetNo(),
    legNo: store.getCurrentLegNo(),
    winner: legWinner,
    finishDarts,
    checkoutScore,
    bullfinish,
    p1Darts,
    p2Darts,
    p1Avg: p1LegThrows.length ? (p1Total / p1LegThrows.length).toFixed(2) : '0.00',
    p2Avg: p2LegThrows.length ? (p2Total / p2LegThrows.length).toFixed(2) : '0.00',
    p1Score: p1Total,
    p2Score: p2Total
  });

  // Leg in DB speichern
  if (match && leg) {
    try {
      await saveMatchLeg(match, leg, store.getCurrentSetNo(), store.getCurrentLegNo(), store.getRemainingP1(), bullfinish);
    } catch (error) {
      console.error('[GameLogic] Fehler beim Speichern des Legs:', error);
    }
  }

  // Legs-Counter erhöhen
  store.incrementLegsWon(legWinner);

  const bestLeg = match?.best_of_legs || 3;
  const bestSet = match?.best_of_sets || 3;
  const legsWon = store.getLegsWon();
  const setWinner = getSetWinner(legsWon, bestLeg);

  if (setWinner) {
    store.incrementSetsWon(setWinner);
    const setsWon = store.getSetsWon();

    const matchWinner = getMatchWinner(setsWon, bestSet);
    if (matchWinner) {
      await handleMatchEnd(matchWinner);
      return true;
    }

    await showSetWonOverlay(setWinner, setsWon);
    store.startNewSet();
  } else {
    await showLegWonOverlay(legWinner, {
      legNo: store.getCurrentLegNo(),
      setNo: store.getCurrentSetNo(),
      legsWon: store.getLegsWon(),
      setsWon: store.getSetsWon()
    });
    store.startNewLeg();
  }

  const newLeg = createLeg(match, store.getCurrentSetNo(), store.getCurrentLegNo());
  store.setCurrentLeg(newLeg);
  store.setBullfinish(false);

  updateAllDisplays(bestSet, bestLeg);
  return false;
}

// ============================================================
// MATCH ENDE
// ============================================================

async function handleMatchEnd(winner) {
  const match = store.getCurrentMatch();
  const setsWon = store.getSetsWon();
  const allMatchThrows = store.getAllMatchThrows();
  const legResults = store.getLegResults();
  const winnerId = getPlayerId(match, winner);

  await finishMatchDb(match.id, winnerId);
  await updateSeasonStats(match, winner, setsWon, allMatchThrows);
  localStorage.removeItem('bullseyer_currentMatchId');

  showMatchEndScreen(match, winner, setsWon, allMatchThrows, legResults);
}

function showMatchEndScreen(match, winner, setsWon, allMatchThrows, legResults) {
  const app = document.getElementById('app');
  if (!app) return;

  const mainHeader = document.getElementById('mainHeader');
  if (mainHeader) mainHeader.style.display = 'block';

  const names = getPlayerNames(match);
  const winnerName = winner === PLAYER.P1 ? names.p1 : names.p2;

  // --- Gesamtstatistiken berechnen ---
  const p1Throws = allMatchThrows.filter(t => t.player === PLAYER.P1);
  const p2Throws = allMatchThrows.filter(t => t.player === PLAYER.P2);

  // Gesamt-Darts aus Leg-Results (korrekt mit finishDarts)
  const p1TotalDarts = legResults.reduce((s, l) => s + l.p1Darts, 0);
  const p2TotalDarts = legResults.reduce((s, l) => s + l.p2Darts, 0);

  const p1TotalScore = p1Throws.reduce((s, t) => s + t.score, 0);
  const p2TotalScore = p2Throws.reduce((s, t) => s + t.score, 0);

  // 3-Dart Average basierend auf echten Darts (nicht Aufnahmen * 3)
  const p1Avg = p1TotalDarts > 0 ? ((p1TotalScore / p1TotalDarts) * 3).toFixed(2) : '0.00';
  const p2Avg = p2TotalDarts > 0 ? ((p2TotalScore / p2TotalDarts) * 3).toFixed(2) : '0.00';

  const p1_180s = p1Throws.filter(t => t.score === 180).length;
  const p2_180s = p2Throws.filter(t => t.score === 180).length;
  const p1_140s = p1Throws.filter(t => t.score >= 140).length;
  const p2_140s = p2Throws.filter(t => t.score >= 140).length;
  const p1_100s = p1Throws.filter(t => t.score >= 100).length;
  const p2_100s = p2Throws.filter(t => t.score >= 100).length;
  const p1High = p1Throws.length ? Math.max(...p1Throws.map(t => t.score)) : 0;
  const p2High = p2Throws.length ? Math.max(...p2Throws.map(t => t.score)) : 0;

  // Legs gewonnen
  const p1LegsTotal = legResults.filter(l => l.winner === PLAYER.P1).length;
  const p2LegsTotal = legResults.filter(l => l.winner === PLAYER.P2).length;

  // High Finishes (Checkouts > 100)
  const highFinishes = legResults
    .filter(l => l.checkoutScore > 100)
    .map(l => ({
      player: l.winner === PLAYER.P1 ? names.p1 : names.p2,
      playerKey: l.winner,
      score: l.checkoutScore,
      darts: l.finishDarts,
      setNo: l.setNo,
      legNo: l.legNo
    }))
    .sort((a, b) => b.score - a.score);

  // Bullfinishes
  const bullFinishes = legResults
    .filter(l => l.bullfinish)
    .map(l => ({
      player: l.winner === PLAYER.P1 ? names.p1 : names.p2,
      playerKey: l.winner,
      setNo: l.setNo,
      legNo: l.legNo
    }));

  const p1BullFinishes = bullFinishes.filter(b => b.playerKey === PLAYER.P1).length;
  const p2BullFinishes = bullFinishes.filter(b => b.playerKey === PLAYER.P2).length;

  // Best leg (wenigste Darts)
  const p1BestLeg = legResults.filter(l => l.winner === PLAYER.P1).reduce((min, l) => Math.min(min, l.p1Darts), Infinity);
  const p2BestLeg = legResults.filter(l => l.winner === PLAYER.P2).reduce((min, l) => Math.min(min, l.p2Darts), Infinity);

  // Highest checkout
  const p1HighCheckout = legResults.filter(l => l.winner === PLAYER.P1).reduce((max, l) => Math.max(max, l.checkoutScore), 0);
  const p2HighCheckout = legResults.filter(l => l.winner === PLAYER.P2).reduce((max, l) => Math.max(max, l.checkoutScore), 0);

  // Export-Daten
  const matchExportData = {
    matchId: match.id,
    date: new Date().toISOString().slice(0, 10),
    p1Name: names.p1, p2Name: names.p2,
    winner: winnerName,
    setsP1: setsWon.p1, setsP2: setsWon.p2,
    p1Avg, p2Avg, p1_180s, p2_180s, p1_140s, p2_140s,
    p1HighScore: p1High, p2HighScore: p2High,
    p1Darts: p1TotalDarts, p2Darts: p2TotalDarts,
    allThrows: allMatchThrows, legResults
  };

  app.innerHTML = `
    <div class="max-w-4xl mx-auto mt-4 p-4">
      <!-- Gewinner-Banner -->
      <div class="text-center mb-6 p-6 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-2xl shadow-2xl relative overflow-hidden">
        <div class="relative">
          <div class="text-4xl mb-2">🏆</div>
          <h1 class="text-4xl font-bold text-gray-900 mb-1">${winnerName}</h1>
          <p class="text-xl font-semibold text-gray-800">gewinnt das Match!</p>
          <p class="text-3xl font-bold text-gray-700 mt-2">
            <span class="text-emerald-700">${setsWon.p1}</span>
            <span class="mx-2">:</span>
            <span class="text-rose-700">${setsWon.p2}</span>
            <span class="text-base ml-2">Sets</span>
          </p>
          <p class="text-sm text-gray-600 mt-1">${names.p1} vs ${names.p2}</p>
        </div>
      </div>

      <!-- Übersicht-Statistiken -->
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 shadow-xl border-2 border-gray-200 dark:border-gray-700">
        <h2 class="text-xl font-bold mb-4 text-center text-gray-800 dark:text-gray-100">📊 Match-Übersicht</h2>
        <div class="grid grid-cols-3 gap-1 text-center">
          <div class="font-bold text-emerald-700 dark:text-emerald-400 text-sm pb-2 border-b border-gray-200">${names.p1}</div>
          <div class="font-bold text-gray-500 dark:text-gray-400 text-sm pb-2 border-b border-gray-200"></div>
          <div class="font-bold text-rose-700 dark:text-rose-400 text-sm pb-2 border-b border-gray-200">${names.p2}</div>
        </div>
        <div class="space-y-0">
          ${statRow(setsWon.p1, 'Sets', setsWon.p2)}
          ${statRow(p1LegsTotal, 'Legs', p2LegsTotal)}
          ${statRow(p1Avg, '3-Dart Ø', p2Avg)}
          ${statRow(p1High, 'Highscore', p2High)}
          ${statRow(p1_180s, '180er', p2_180s)}
          ${statRow(p1_140s, '140+', p2_140s)}
          ${statRow(p1_100s, '100+', p2_100s)}
          ${statRow(p1TotalDarts, 'Darts', p2TotalDarts)}
          ${statRow(p1BestLeg === Infinity ? '-' : p1BestLeg, 'Best Leg', p2BestLeg === Infinity ? '-' : p2BestLeg, true)}
          ${statRow(p1HighCheckout || '-', 'High Finish', p2HighCheckout || '-')}
          ${statRow(p1BullFinishes, 'Bullfinish', p2BullFinishes)}
        </div>
      </div>

      <!-- Leg-für-Leg Aufstellung -->
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 shadow-xl border-2 border-blue-300 dark:border-blue-600">
        <h2 class="text-xl font-bold mb-4 text-center text-blue-800 dark:text-blue-400">🎯 Leg-Übersicht</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b-2 border-blue-200 dark:border-blue-700 text-gray-600 dark:text-gray-400">
                <th class="py-2 px-1 text-left">Set</th>
                <th class="py-2 px-1 text-left">Leg</th>
                <th class="py-2 px-1 text-center">Gewinner</th>
                <th class="py-2 px-1 text-center" title="Darts ${names.p1}">${names.p1.substring(0,8)}</th>
                <th class="py-2 px-1 text-center" title="Darts ${names.p2}">${names.p2.substring(0,8)}</th>
                <th class="py-2 px-1 text-center">Ø P1</th>
                <th class="py-2 px-1 text-center">Ø P2</th>
                <th class="py-2 px-1 text-center">Checkout</th>
                <th class="py-2 px-1 text-center">🎯</th>
              </tr>
            </thead>
            <tbody>
              ${legResults.map((l, i) => {
                const isP1 = l.winner === PLAYER.P1;
                const winColor = isP1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
                const bgColor = i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/30' : '';
                const wName = isP1 ? names.p1 : names.p2;
                return `
                  <tr class="${bgColor} border-b border-gray-100 dark:border-gray-700">
                    <td class="py-2 px-1 text-gray-600 dark:text-gray-400">${l.setNo}</td>
                    <td class="py-2 px-1 text-gray-600 dark:text-gray-400">${l.legNo}</td>
                    <td class="py-2 px-1 text-center font-bold ${winColor}">${wName}</td>
                    <td class="py-2 px-1 text-center ${isP1 ? 'font-bold text-emerald-600' : ''}">${l.p1Darts}d</td>
                    <td class="py-2 px-1 text-center ${!isP1 ? 'font-bold text-rose-600' : ''}">${l.p2Darts}d</td>
                    <td class="py-2 px-1 text-center text-gray-700 dark:text-gray-300">${l.p1Avg}</td>
                    <td class="py-2 px-1 text-center text-gray-700 dark:text-gray-300">${l.p2Avg}</td>
                    <td class="py-2 px-1 text-center font-semibold ${l.checkoutScore > 100 ? 'text-amber-600 dark:text-amber-400' : ''}">${l.checkoutScore}</td>
                    <td class="py-2 px-1 text-center">${l.bullfinish ? '🐂' : ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${highFinishes.length > 0 ? `
      <!-- High Finishes -->
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 shadow-xl border-2 border-amber-300 dark:border-amber-600">
        <h2 class="text-xl font-bold mb-3 text-center text-amber-800 dark:text-amber-400">🔥 High Finishes (100+)</h2>
        <div class="space-y-2">
          ${highFinishes.map(hf => {
            const color = hf.playerKey === PLAYER.P1 ? 'emerald' : 'rose';
            return `
              <div class="flex items-center justify-between bg-gradient-to-r from-${color}-50 to-${color}-100 dark:from-${color}-900/30 dark:to-${color}-800/30 border-l-4 border-${color}-500 rounded-r-lg p-3">
                <div>
                  <span class="font-bold text-${color}-700 dark:text-${color}-400">${hf.player}</span>
                  <span class="text-gray-500 dark:text-gray-400 text-sm ml-2">Set ${hf.setNo} Leg ${hf.legNo}</span>
                </div>
                <div class="text-right">
                  <span class="text-2xl font-bold text-amber-600 dark:text-amber-400">${hf.score}</span>
                  <span class="text-gray-500 dark:text-gray-400 text-sm ml-1">(${hf.darts}d)</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${bullFinishes.length > 0 ? `
      <!-- Bullfinishes -->
      <div class="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 shadow-xl border-2 border-red-300 dark:border-red-600">
        <h2 class="text-xl font-bold mb-3 text-center text-red-800 dark:text-red-400">🐂 Bullfinishes</h2>
        <div class="flex flex-wrap gap-2 justify-center">
          ${bullFinishes.map(bf => {
            const color = bf.playerKey === PLAYER.P1 ? 'emerald' : 'rose';
            return `
              <div class="bg-gradient-to-br from-${color}-100 to-${color}-200 dark:from-${color}-900/40 dark:to-${color}-800/40 border-2 border-${color}-400 rounded-lg px-3 py-2 text-center">
                <div class="font-bold text-${color}-700 dark:text-${color}-400">${bf.player}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">S${bf.setNo} L${bf.legNo}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Buttons -->
      <div class="flex gap-3 justify-center mb-8">
        <button id="backToDashboard" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-5 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">← Dashboard</button>
        <button id="backToScorer" class="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-5 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">🎯 Nächstes Match</button>
        <button id="exportMatch" class="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-5 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">📊 Export</button>
      </div>
    </div>
  `;

  // Event-Handler
  document.getElementById('backToDashboard').onclick = () => {
    store.resetState();
    window.location.hash = '#/dashboard';
  };
  document.getElementById('backToScorer').onclick = () => {
    store.resetState();
    window.location.hash = '#/scorer';
  };
  document.getElementById('exportMatch').onclick = () => {
    const csv = buildDetailedCSV(matchExportData, names, legResults, highFinishes, bullFinishes);
    downloadCSV(csv, `bullseyer_${names.p1}_vs_${names.p2}_${matchExportData.date}.csv`);
  };
}

// ============================================================
// HELPERS
// ============================================================

function statRow(val1, label, val2, lowerIsBetter = false) {
  const v1 = parseFloat(val1) || 0;
  const v2 = parseFloat(val2) || 0;
  const d1 = val1 === '-' || val1 === Infinity;
  const d2 = val2 === '-' || val2 === Infinity;

  let isP1Better, isP2Better;
  if (lowerIsBetter) {
    isP1Better = !d1 && (d2 || v1 < v2);
    isP2Better = !d2 && (d1 || v2 < v1);
  } else {
    isP1Better = !d1 && v1 > v2;
    isP2Better = !d2 && v2 > v1;
  }

  return `
    <div class="grid grid-cols-3 gap-1 py-2 border-b border-gray-100 dark:border-gray-700">
      <div class="text-center text-lg font-bold ${isP1Better ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">${val1}</div>
      <div class="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 self-center">${label}</div>
      <div class="text-center text-lg font-bold ${isP2Better ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-300'}">${val2}</div>
    </div>
  `;
}

function buildDetailedCSV(data, names, legResults, highFinishes, bullFinishes) {
  let csv = '=== MATCH ===\n';
  csv += `Datum,${data.date}\n`;
  csv += `${names.p1} vs ${names.p2}\n`;
  csv += `Gewinner,${data.winner}\n`;
  csv += `Sets,${data.setsP1}:${data.setsP2}\n\n`;

  csv += '=== ÜBERSICHT ===\n';
  csv += `Statistik,${names.p1},${names.p2}\n`;
  csv += `3-Dart Average,${data.p1Avg},${data.p2Avg}\n`;
  csv += `180er,${data.p1_180s},${data.p2_180s}\n`;
  csv += `140+,${data.p1_140s},${data.p2_140s}\n`;
  csv += `Highscore,${data.p1HighScore},${data.p2HighScore}\n`;
  csv += `Darts gesamt,${data.p1Darts},${data.p2Darts}\n\n`;

  csv += '=== LEG-ÜBERSICHT ===\n';
  csv += `Set,Leg,Gewinner,Darts ${names.p1},Darts ${names.p2},Avg ${names.p1},Avg ${names.p2},Checkout,Bullfinish\n`;
  legResults.forEach(l => {
    const w = l.winner === PLAYER.P1 ? names.p1 : names.p2;
    csv += `${l.setNo},${l.legNo},${w},${l.p1Darts},${l.p2Darts},${l.p1Avg},${l.p2Avg},${l.checkoutScore},${l.bullfinish ? 'Ja' : ''}\n`;
  });

  if (highFinishes.length) {
    csv += '\n=== HIGH FINISHES (100+) ===\n';
    csv += 'Spieler,Checkout,Darts,Set,Leg\n';
    highFinishes.forEach(hf => {
      csv += `${hf.player},${hf.score},${hf.darts},${hf.setNo},${hf.legNo}\n`;
    });
  }

  if (bullFinishes.length) {
    csv += '\n=== BULLFINISHES ===\n';
    csv += 'Spieler,Set,Leg\n';
    bullFinishes.forEach(bf => {
      csv += `${bf.player},${bf.setNo},${bf.legNo}\n`;
    });
  }

  return csv;
}
