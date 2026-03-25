// Statistik-Seite - Rangliste, Historie, Spieler-Detail, CSV
import { supabase } from '../supabase-mock.js';

/**
 * Rendert die komplette Statistik-Seite
 */
export async function renderStats() {
  const app = document.getElementById('app');
  app.innerHTML = '<p class="text-center mt-8">Lade Statistiken…</p>';

  // Alle Daten parallel laden
  const [usersRes, matchesRes, legsRes, throwsRes, gamedaysRes] = await Promise.all([
    supabase.from('users').select('id, name').order('name'),
    supabase.from('matches').select('id, p1_id, p2_id, winner_id, finished_at, gameday_id, best_of_sets, best_of_legs'),
    supabase.from('legs').select('id, match_id, winner_id, set_no, leg_no, finish_darts, bullfinish, duration_s'),
    supabase.from('throws').select('id, match_id, leg_id, player_id, score, is_finish'),
    supabase.from('gamedays').select('id, date').order('date', { ascending: false }),
  ]);

  const players = usersRes.data || [];
  const allMatches = matchesRes.data || [];
  const allLegs = legsRes.data || [];
  const allThrows = throwsRes.data || [];
  const gamedays = gamedaysRes.data || [];

  if (!players.length) {
    app.innerHTML = '<p class="text-center mt-8 text-gray-500">Keine Spieler vorhanden</p>';
    return;
  }

  // State
  let filter = 'all'; // 'all' oder gameday-ID
  let selectedPlayer = null; // null = Gruppenansicht, oder player-ID

  function render() {
    // Daten filtern
    const filteredMatches = filter === 'all'
      ? allMatches.filter(m => m.finished_at)
      : allMatches.filter(m => m.finished_at && m.gameday_id === filter);
    const matchIds = new Set(filteredMatches.map(m => m.id));
    const filteredLegs = allLegs.filter(l => matchIds.has(l.match_id));
    const filteredThrows = allThrows.filter(t => matchIds.has(t.match_id));

    // Stats pro Spieler berechnen
    const stats = calcPlayerStats(players, filteredMatches, filteredLegs, filteredThrows);

    // Rangliste sortieren (Punkte → Diff → Avg)
    const ranking = [...stats.values()]
      .filter(s => s.matchesPlayed > 0)
      .sort((a, b) => b.points - a.points || b.diff - a.diff || b.avg - a.avg);
    ranking.forEach((s, i) => s.rank = i + 1);

    // Spieltag-Label
    const filterLabel = filter === 'all'
      ? 'Gesamt'
      : gamedays.find(g => g.id === filter)?.date || 'Spieltag';

    app.innerHTML = `
      <div class="max-w-6xl mx-auto mt-4 p-4">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">📊 Statistiken</h1>
          <button id="csvExportBtn" class="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-4 py-2 rounded-lg font-semibold shadow-lg transition-all text-sm flex items-center gap-1">
            📥 CSV Export
          </button>
        </div>

        <!-- Filter: Spieltag-Auswahl -->
        <div class="flex flex-wrap gap-2 mb-4">
          <button data-filter="all" class="filter-btn px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === 'all' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'}">
            Gesamt
          </button>
          ${gamedays.slice(0, 10).map(g => `
            <button data-filter="${g.id}" class="filter-btn px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === g.id ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'}">
              ${g.date}
            </button>
          `).join('')}
        </div>

        <!-- Ansicht-Toggle -->
        ${selectedPlayer ? buildPlayerDetail(selectedPlayer, stats, filteredMatches, filteredLegs, filteredThrows, players, filterLabel) : buildGroupView(ranking, stats, filterLabel, players)}
      </div>
    `;

    // Event-Handler
    document.getElementById('csvExportBtn')?.addEventListener('click', () => {
      downloadCSV(buildCSV(ranking, stats, filterLabel, filteredMatches, filteredLegs, players));
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.filter;
        filter = val === 'all' ? 'all' : val;
        selectedPlayer = null;
        render();
      });
    });

    document.querySelectorAll('[data-player-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPlayer = btn.dataset.playerId;
        render();
      });
    });

    document.getElementById('backToGroup')?.addEventListener('click', () => {
      selectedPlayer = null;
      render();
    });
  }

  render();
}

// ============================================================
// STATS BERECHNUNG
// ============================================================

function calcPlayerStats(players, matches, legs, throws) {
  const stats = new Map();

  players.forEach(p => {
    stats.set(p.id, {
      id: p.id,
      name: p.name,
      rank: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      diff: 0,
      points: 0,       // 2 pro Sieg, 0 pro Niederlage
      legsWon: 0,
      legsLost: 0,
      setsWon: 0,
      setsLost: 0,
      avg: 0,
      totalScore: 0,
      totalDarts: 0,    // Aufnahmen (throws) — jede = 3 Darts
      _180s: 0,
      _140plus: 0,
      _100plus: 0,
      highScore: 0,
      highFinishes: [],  // checkouts > 100
      bullFinishes: 0,
      bestLeg: Infinity, // wenigste Darts in einem gewonnenen Leg
      highCheckout: 0,
    });
  });

  // Matches
  matches.forEach(m => {
    if (!m.winner_id) return;
    const p1 = stats.get(m.p1_id);
    const p2 = stats.get(m.p2_id);
    if (!p1 || !p2) return;

    p1.matchesPlayed++;
    p2.matchesPlayed++;

    if (m.winner_id === m.p1_id) {
      p1.matchesWon++; p1.points += 2;
      p2.matchesLost++;
    } else {
      p2.matchesWon++; p2.points += 2;
      p1.matchesLost++;
    }
  });

  // Legs
  legs.forEach(l => {
    if (!l.winner_id) return;
    const winner = stats.get(l.winner_id);
    if (winner) {
      winner.legsWon++;
      if (l.finish_darts && l.finish_darts < winner.bestLeg) {
        winner.bestLeg = l.finish_darts;
      }
      if (l.bullfinish) winner.bullFinishes++;
    }

    // Match finden um den Verlierer zu bestimmen
    const match = matches.find(m => m.id === l.match_id);
    if (match) {
      const loserId = match.p1_id === l.winner_id ? match.p2_id : match.p1_id;
      const loser = stats.get(loserId);
      if (loser) loser.legsLost++;
    }
  });

  // Throws
  throws.forEach(t => {
    const s = stats.get(t.player_id);
    if (!s) return;
    s.totalScore += t.score;
    s.totalDarts++;
    if (t.score === 180) s._180s++;
    if (t.score >= 140) s._140plus++;
    if (t.score >= 100) s._100plus++;
    if (t.score > s.highScore) s.highScore = t.score;
  });

  // High Finishes aus Legs (checkout > 100)
  legs.forEach(l => {
    if (!l.winner_id) return;
    // Finde den letzten Throw des Gewinners in diesem Leg
    const legThrows = throws.filter(t => t.leg_id === l.id && t.player_id === l.winner_id);
    if (legThrows.length === 0) return;
    // Der letzte Wurf des Gewinners (nach order_no oder einfach letzter)
    const lastThrow = legThrows[legThrows.length - 1];
    // Checkout-Score = der Score des letzten Wurfs (der den Rest auf 0 bringt)
    // Alternative: wir berechnen es aus dem Remaining vor dem letzten Wurf
    // Da wir das nicht direkt haben, nutzen wir die Leg-Daten
    // Vereinfacht: Summiere alle Throws des Gewinners, Checkout = 501 - Summe aller vorherigen
    const winnerLegThrows = throws.filter(t => t.leg_id === l.id && t.player_id === l.winner_id);
    if (winnerLegThrows.length > 0) {
      const allButLast = winnerLegThrows.slice(0, -1);
      const sumBefore = allButLast.reduce((s, t) => s + t.score, 0);
      const checkoutScore = 501 - sumBefore; // = was der letzte Wurf gebracht hat
      if (checkoutScore > 100) {
        const s = stats.get(l.winner_id);
        if (s) {
          s.highFinishes.push({ score: checkoutScore, matchId: l.match_id });
          if (checkoutScore > s.highCheckout) s.highCheckout = checkoutScore;
        }
      }
    }
  });

  // Diff + Avg berechnen
  stats.forEach(s => {
    s.diff = s.legsWon - s.legsLost;
    s.avg = s.totalDarts > 0 ? parseFloat((s.totalScore / s.totalDarts).toFixed(2)) : 0;
  });

  return stats;
}

// ============================================================
// GRUPPEN-ANSICHT
// ============================================================

function buildGroupView(ranking, stats, filterLabel, players) {
  // Gesamtzahlen
  const totals = { matches: 0, _180s: 0, _100plus: 0, bullFinishes: 0 };
  stats.forEach(s => {
    totals.matches += s.matchesWon; // jeder Sieg = 1 Match für Gesamtzählung
    totals._180s += s._180s;
    totals._100plus += s._100plus;
    totals.bullFinishes += s.bullFinishes;
  });

  return `
    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      ${summaryCard('🏆', ranking.length, 'Spieler', 'emerald')}
      ${summaryCard('🎯', totals._180s, '180er', 'rose')}
      ${summaryCard('💯', totals._100plus, '100+', 'blue')}
      ${summaryCard('🐂', totals.bullFinishes, 'Bullfinish', 'amber')}
    </div>

    <!-- Rangliste -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-2 border-gray-200 dark:border-gray-700 p-4 mb-4">
      <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">🏅 Rangliste — ${filterLabel}</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs">
              <th class="py-2 px-2 text-left">#</th>
              <th class="py-2 px-2 text-left">Spieler</th>
              <th class="py-2 px-2 text-center">Sp</th>
              <th class="py-2 px-2 text-center">S</th>
              <th class="py-2 px-2 text-center">N</th>
              <th class="py-2 px-2 text-center">Legs +/-</th>
              <th class="py-2 px-2 text-center">Diff</th>
              <th class="py-2 px-2 text-center">Pkt</th>
              <th class="py-2 px-2 text-center">Ø</th>
              <th class="py-2 px-2 text-center">180</th>
              <th class="py-2 px-2 text-center">100+</th>
              <th class="py-2 px-2 text-center">🐂</th>
              <th class="py-2 px-2 text-center">HF</th>
              <th class="py-2 px-2 text-center">Best</th>
            </tr>
          </thead>
          <tbody>
            ${ranking.length === 0
              ? '<tr><td colspan="14" class="text-center py-6 text-gray-400">Keine Spieldaten vorhanden</td></tr>'
              : ranking.map((s, i) => {
                const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];
                const medal = i < 3 ? `<span class="${medalColors[i]} text-lg">${['🥇','🥈','🥉'][i]}</span>` : `<span class="text-gray-500">${s.rank}</span>`;
                const rowBg = i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/30' : '';
                return `
                  <tr class="${rowBg} border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition" data-player-id="${s.id}">
                    <td class="py-2.5 px-2">${medal}</td>
                    <td class="py-2.5 px-2 font-bold text-gray-900 dark:text-gray-100">${s.name}</td>
                    <td class="py-2.5 px-2 text-center">${s.matchesPlayed}</td>
                    <td class="py-2.5 px-2 text-center font-bold text-emerald-600">${s.matchesWon}</td>
                    <td class="py-2.5 px-2 text-center text-rose-600">${s.matchesLost}</td>
                    <td class="py-2.5 px-2 text-center text-gray-600 dark:text-gray-400">${s.legsWon}:${s.legsLost}</td>
                    <td class="py-2.5 px-2 text-center font-bold ${s.diff > 0 ? 'text-emerald-600' : s.diff < 0 ? 'text-rose-600' : 'text-gray-500'}">${s.diff > 0 ? '+' : ''}${s.diff}</td>
                    <td class="py-2.5 px-2 text-center font-bold text-blue-700 dark:text-blue-400">${s.points}</td>
                    <td class="py-2.5 px-2 text-center font-semibold text-emerald-700 dark:text-emerald-400">${s.avg.toFixed(2)}</td>
                    <td class="py-2.5 px-2 text-center ${s._180s > 0 ? 'font-bold text-amber-600' : 'text-gray-400'}">${s._180s}</td>
                    <td class="py-2.5 px-2 text-center">${s._100plus}</td>
                    <td class="py-2.5 px-2 text-center">${s.bullFinishes || 0}</td>
                    <td class="py-2.5 px-2 text-center ${s.highCheckout > 100 ? 'font-bold text-amber-600' : 'text-gray-400'}">${s.highCheckout || '-'}</td>
                    <td class="py-2.5 px-2 text-center ${s.bestLeg < Infinity ? 'font-semibold' : 'text-gray-400'}">${s.bestLeg < Infinity ? s.bestLeg + 'd' : '-'}</td>
                  </tr>
                `;
              }).join('')
            }
          </tbody>
        </table>
      </div>
      <p class="text-xs text-gray-400 mt-2">Sp=Spiele S=Siege N=Niederlagen Pkt=Punkte(2/Sieg) Ø=3-Dart-Average HF=High Finish Best=Bestes Leg(Darts) 🐂=Bullfinish</p>
    </div>

    <!-- Klick-Hinweis -->
    <p class="text-center text-sm text-gray-400 mb-4">💡 Klicke auf einen Spieler für die Detail-Ansicht</p>
  `;
}

// ============================================================
// SPIELER-DETAIL
// ============================================================

function buildPlayerDetail(playerId, stats, matches, legs, throws, players, filterLabel) {
  const s = stats.get(playerId);
  if (!s) return '<p class="text-center text-gray-500 mt-8">Spieler nicht gefunden</p>';

  // Match-Historie
  const playerMatches = matches
    .filter(m => (m.p1_id === playerId || m.p2_id === playerId) && m.finished_at)
    .sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));

  const nameMap = {};
  players.forEach(p => nameMap[p.id] = p.name);

  // High Finishes Detail
  const highFinishDetails = [];
  legs.forEach(l => {
    if (l.winner_id !== playerId) return;
    const wThrows = throws.filter(t => t.leg_id === l.id && t.player_id === playerId);
    if (wThrows.length === 0) return;
    const allButLast = wThrows.slice(0, -1);
    const sumBefore = allButLast.reduce((sum, t) => sum + t.score, 0);
    const checkout = 501 - sumBefore;
    if (checkout > 100) {
      highFinishDetails.push({ score: checkout, matchId: l.match_id });
    }
  });
  highFinishDetails.sort((a, b) => b.score - a.score);

  const winRate = s.matchesPlayed > 0 ? ((s.matchesWon / s.matchesPlayed) * 100).toFixed(0) : 0;

  return `
    <div>
      <button id="backToGroup" class="mb-4 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm shadow transition-all">← Zurück zur Übersicht</button>

      <!-- Spieler-Header -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-2 border-violet-400 p-6 mb-4">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
            ${s.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${s.name}</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">${filterLabel} — Platz ${s.rank || '-'}</p>
          </div>
          <div class="ml-auto text-right">
            <div class="text-3xl font-bold text-blue-700 dark:text-blue-400">${s.points}</div>
            <div class="text-xs text-gray-500">Punkte</div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${miniStat('Spiele', s.matchesPlayed, '')}
          ${miniStat('Siege', s.matchesWon, 'text-emerald-600')}
          ${miniStat('Niederlagen', s.matchesLost, 'text-rose-600')}
          ${miniStat('Siegquote', winRate + '%', 'text-blue-600')}
          ${miniStat('3-Dart Ø', s.avg.toFixed(2), 'text-emerald-600')}
          ${miniStat('180er', s._180s, 'text-amber-600')}
          ${miniStat('100+', s._100plus, '')}
          ${miniStat('Highscore', s.highScore, '')}
          ${miniStat('Legs +/-', s.legsWon + ':' + s.legsLost, '')}
          ${miniStat('Diff', (s.diff > 0 ? '+' : '') + s.diff, s.diff > 0 ? 'text-emerald-600' : s.diff < 0 ? 'text-rose-600' : '')}
          ${miniStat('🐂 Bullfinish', s.bullFinishes, 'text-red-600')}
          ${miniStat('Best Leg', s.bestLeg < Infinity ? s.bestLeg + 'd' : '-', 'text-violet-600')}
          ${miniStat('High Finish', s.highCheckout || '-', 'text-amber-600')}
          ${miniStat('Darts gesamt', s.totalDarts * 3, '')}
        </div>
      </div>

      ${highFinishDetails.length > 0 ? `
      <!-- High Finishes -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-2 border-amber-300 dark:border-amber-600 p-4 mb-4">
        <h3 class="text-lg font-bold text-amber-800 dark:text-amber-400 mb-3">🔥 High Finishes (100+)</h3>
        <div class="flex flex-wrap gap-2">
          ${highFinishDetails.map(hf => `
            <span class="bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 border-2 border-amber-400 rounded-lg px-3 py-1.5 font-bold text-amber-700 dark:text-amber-400">${hf.score}</span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Match-Historie -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-2 border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">📋 Match-Historie</h3>
        ${playerMatches.length === 0
          ? '<p class="text-center text-gray-400 py-4">Keine Matches gespielt</p>'
          : `<div class="space-y-2">
              ${playerMatches.map(m => {
                const isP1 = m.p1_id === playerId;
                const opponentId = isP1 ? m.p2_id : m.p1_id;
                const opponentName = nameMap[opponentId] || '?';
                const won = m.winner_id === playerId;
                const date = m.finished_at ? new Date(m.finished_at).toLocaleDateString('de-DE') : '';
                return `
                  <div class="flex items-center justify-between py-2 px-3 rounded-lg ${won ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500' : 'bg-rose-50 dark:bg-rose-900/20 border-l-4 border-rose-500'}">
                    <div>
                      <span class="font-bold ${won ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}">${won ? 'Sieg' : 'Niederlage'}</span>
                      <span class="text-gray-700 dark:text-gray-300 ml-2">vs ${opponentName}</span>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400">${date}</span>
                  </div>
                `;
              }).join('')}
            </div>`
        }
      </div>
    </div>
  `;
}

// ============================================================
// HELPERS
// ============================================================

function summaryCard(icon, value, label, color) {
  return `
    <div class="bg-gradient-to-br from-${color}-50 to-${color}-100 dark:from-${color}-900/20 dark:to-${color}-800/20 border-2 border-${color}-300 dark:border-${color}-500 rounded-xl p-4 text-center">
      <div class="text-2xl mb-1">${icon}</div>
      <div class="text-2xl font-bold text-${color}-700 dark:text-${color}-400">${value}</div>
      <div class="text-xs text-${color}-600 dark:text-${color}-300">${label}</div>
    </div>
  `;
}

function miniStat(label, value, colorClass) {
  return `
    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
      <div class="text-xl font-bold ${colorClass || 'text-gray-800 dark:text-gray-100'}">${value}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400">${label}</div>
    </div>
  `;
}

// ============================================================
// CSV EXPORT
// ============================================================

function buildCSV(ranking, stats, filterLabel, matches, legs, players) {
  const nameMap = {};
  players.forEach(p => nameMap[p.id] = p.name);

  let csv = `Bullseyer Statistik - ${filterLabel} - ${new Date().toLocaleDateString('de-DE')}\n\n`;

  // Rangliste
  csv += 'RANGLISTE\n';
  csv += 'Platz,Spieler,Spiele,Siege,Niederlagen,Legs+,Legs-,Diff,Punkte,3-Dart-Avg,180er,100+,Bullfinish,High Finish,Best Leg\n';
  ranking.forEach(s => {
    csv += `${s.rank},${s.name},${s.matchesPlayed},${s.matchesWon},${s.matchesLost},${s.legsWon},${s.legsLost},${s.diff},${s.points},${s.avg.toFixed(2)},${s._180s},${s._100plus},${s.bullFinishes},${s.highCheckout || ''},${s.bestLeg < Infinity ? s.bestLeg : ''}\n`;
  });

  // Match-Historie
  csv += '\nMATCH-HISTORIE\n';
  csv += 'Datum,Spieler 1,Spieler 2,Gewinner\n';
  matches
    .filter(m => m.finished_at)
    .sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at))
    .forEach(m => {
      const date = new Date(m.finished_at).toLocaleDateString('de-DE');
      csv += `${date},${nameMap[m.p1_id] || '?'},${nameMap[m.p2_id] || '?'},${nameMap[m.winner_id] || '?'}\n`;
    });

  // High Finishes
  const allHighFinishes = [];
  legs.forEach(l => {
    if (!l.winner_id) return;
    // Simplified - we don't have full throw data in the CSV context
    // but we have it from the stats
  });

  stats.forEach(s => {
    if (s.highFinishes.length > 0) {
      csv += `\nHIGH FINISHES - ${s.name}\n`;
      s.highFinishes.forEach(hf => csv += `${hf.score}\n`);
    }
  });

  return csv;
}

function downloadCSV(content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `bullseyer_stats_${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
