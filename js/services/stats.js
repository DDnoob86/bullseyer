// Stats Service - alle Statistik-bezogenen Operationen
import { supabase } from '../supabase-mock.js';

/**
 * Berechnet den Leg-Average für einen Spieler
 * @param {Array} throwHistory - Die Wurf-Historie
 * @param {string} player - 'p1' oder 'p2'
 * @param {number} legNo - Aktuelle Leg-Nummer
 * @param {number} setNo - Aktuelle Set-Nummer
 * @returns {number|null} Der Average oder null
 */
export function calculateLegAverage(throwHistory, player, legNo, setNo) {
  const legThrows = throwHistory.filter(t =>
    t.player === player &&
    t.legNo === legNo &&
    t.setNo === setNo
  );

  if (legThrows.length === 0) return null;

  const total = legThrows.reduce((sum, t) => sum + t.score, 0);
  return total / legThrows.length;
}

/**
 * Berechnet den Match-Average für einen Spieler
 * @param {Array} allMatchThrows - Alle Würfe des Matches
 * @param {string} player - 'p1' oder 'p2'
 * @returns {number|null} Der Average oder null
 */
export function calculateMatchAverage(allMatchThrows, player) {
  const playerThrows = allMatchThrows.filter(t => t.player === player);

  if (playerThrows.length === 0) return null;

  const total = playerThrows.reduce((sum, t) => sum + t.score, 0);
  return total / playerThrows.length;
}

/**
 * Berechnet detaillierte Statistiken für einen Spieler
 * @param {Array} throwHistory - Die Wurf-Historie
 * @param {string} player - 'p1' oder 'p2'
 * @returns {Object} Die Statistiken
 */
export function calculatePlayerStats(throwHistory, player) {
  const playerThrows = throwHistory.filter(t => t.player === player);

  return {
    count180: playerThrows.filter(t => t.score === 180).length,
    count140Plus: playerThrows.filter(t => t.score >= 140).length,
    count100Plus: playerThrows.filter(t => t.score >= 100).length,
    highScore: playerThrows.length ? Math.max(...playerThrows.map(t => t.score)) : 0,
    dartsThrown: playerThrows.length * 3,
    throwCount: playerThrows.length
  };
}

/**
 * Formatiert einen Average-Wert für die Anzeige
 * @param {number|null} avg - Der Average
 * @returns {string} Formatierter String
 */
export function formatAverage(avg) {
  if (avg === null || avg === undefined) return '-';
  return avg.toFixed(2);
}

/**
 * Aktualisiert die Season-Statistiken für beide Spieler nach Match-Ende
 * @param {Object} match - Das Match-Objekt
 * @param {string} winner - 'p1' oder 'p2'
 * @param {Object} setsWon - { p1: number, p2: number }
 * @param {Array} allMatchThrows - Alle Würfe des Matches
 */
export async function updateSeasonStats(match, winner, setsWon, allMatchThrows) {
  for (const player of ['p1', 'p2']) {
    const playerId = player === 'p1' ? match.p1_id : match.p2_id;
    const playerThrows = allMatchThrows.filter(t => t.player === player);

    // Berechnungen
    const totalScore = playerThrows.reduce((sum, t) => sum + t.score, 0);
    const avg3 = playerThrows.length ? (totalScore / playerThrows.length) : 0;
    const _180s = playerThrows.filter(t => t.score === 180).length;
    const _140s = playerThrows.filter(t => t.score >= 140 && t.score < 180).length;
    const _100s = playerThrows.filter(t => t.score >= 100 && t.score < 140).length;

    const matchWon = (player === winner) ? 1 : 0;
    const setsWonCount = player === 'p1' ? setsWon.p1 : setsWon.p2;

    try {
      // Hole bestehende Stats
      const { data, error } = await supabase
        .from('stats_season')
        .select('*')
        .eq('player_id', playerId)
        .single();

      const stats = data || {
        player_id: playerId,
        avg3: 0,
        legs_won: 0,
        sets_won: 0,
        matches_played: 0,
        matches_won: 0,
        high_finish: 0,
        bull_finishes: 0,
        short_games: 0,
        _180s: 0,
        _140s: 0,
        _100s: 0
      };

      // Update Stats
      stats.matches_played = (stats.matches_played || 0) + 1;
      stats.matches_won = (stats.matches_won || 0) + matchWon;
      stats.sets_won = (stats.sets_won || 0) + setsWonCount;
      stats._180s = (stats._180s || 0) + _180s;
      stats._140s = (stats._140s || 0) + _140s;
      stats._100s = (stats._100s || 0) + _100s;

      // Average als laufender Durchschnitt
      const prevAvg = stats.avg3 || 0;
      const prevMatches = (stats.matches_played || 1) - 1;
      stats.avg3 = prevMatches > 0
        ? ((prevAvg * prevMatches) + avg3) / (prevMatches + 1)
        : avg3;

      // Upsert
      await supabase.from('stats_season').upsert(stats, { onConflict: 'player_id' });

      console.log('[StatsService] Stats aktualisiert für Spieler', playerId);
    } catch (err) {
      console.error('[StatsService] Fehler beim Stats-Update für', playerId, err);
    }
  }
}

/**
 * Lädt alle Statistiken für die Stats-Seite
 * @returns {Promise<Object>} Die aggregierten Statistiken
 */
export async function loadAllStats() {
  try {
    const [throwsRes, finishesRes, shortlegsRes, allThrowsRes, playersRes] = await Promise.all([
      supabase.from('throws').select('player_id, score').gte('score', 101),
      supabase.from('throws').select('player_id, score').eq('score', 180),
      supabase.from('legs').select('winner_id, finish_darts').lte('finish_darts', 18),
      supabase.from('throws').select('player_id, score'),
      supabase.from('users').select('id, name')
    ]);

    if (throwsRes.error || finishesRes.error || shortlegsRes.error || allThrowsRes.error || playersRes.error) {
      throw new Error('Fehler beim Laden der Statistiken');
    }

    const throws = throwsRes.data || [];
    const finishes = finishesRes.data || [];
    const shortlegs = shortlegsRes.data || [];
    const allThrows = allThrowsRes.data || [];
    const players = playersRes.data || [];

    // Statistiken pro Spieler berechnen
    const playerStats = {};

    allThrows.forEach(t => {
      if (!playerStats[t.player_id]) {
        playerStats[t.player_id] = { sum: 0, count: 0, highscores: 0, finishes180: 0, shortlegs: 0 };
      }
      playerStats[t.player_id].sum += t.score;
      playerStats[t.player_id].count++;
    });

    throws.forEach(t => {
      if (playerStats[t.player_id]) {
        playerStats[t.player_id].highscores++;
      }
    });

    finishes.forEach(t => {
      if (playerStats[t.player_id]) {
        playerStats[t.player_id].finishes180++;
      }
    });

    shortlegs.forEach(l => {
      if (playerStats[l.winner_id]) {
        playerStats[l.winner_id].shortlegs++;
      }
    });

    return {
      players,
      playerStats,
      totals: {
        highscores: throws.length,
        finishes180: finishes.length,
        shortlegs: shortlegs.length
      }
    };
  } catch (err) {
    console.error('[StatsService] Fehler beim Laden aller Stats:', err);
    throw err;
  }
}

/**
 * Exportiert Statistiken als CSV-String
 * @param {Object} statsData - Die Statistik-Daten
 * @returns {string} CSV-String
 */
export function exportStatsToCSV(statsData) {
  const { players, playerStats } = statsData;

  let csv = 'Spieler,3-Dart-Average,Highscores (>=101),180er,Shortlegs\n';

  players.forEach(p => {
    const s = playerStats[p.id] || { sum: 0, count: 0, highscores: 0, finishes180: 0, shortlegs: 0 };
    const avg = s.count ? (s.sum / s.count).toFixed(2) : '0';
    csv += `${p.name},${avg},${s.highscores},${s.finishes180},${s.shortlegs}\n`;
  });

  return csv;
}

/**
 * Exportiert Match-Daten als CSV-String
 * @param {Object} matchData - Die Match-Daten
 * @returns {string} CSV-String
 */
export function exportMatchToCSV(matchData) {
  const {
    date, p1Name, p2Name, winner,
    setsP1, setsP2, p1Avg, p2Avg,
    p1_180s, p2_180s, p1_140s, p2_140s,
    p1HighScore, p2HighScore, p1Darts, p2Darts,
    allThrows
  } = matchData;

  let csv = '=== MATCH ZUSAMMENFASSUNG ===\n';
  csv += 'Datum,Spieler 1,Spieler 2,Gewinner,Sets P1,Sets P2\n';
  csv += `${date},${p1Name},${p2Name},${winner},${setsP1},${setsP2}\n\n`;

  csv += '=== STATISTIKEN ===\n';
  csv += `Statistik,${p1Name},${p2Name}\n`;
  csv += `3-Dart Average,${p1Avg},${p2Avg}\n`;
  csv += `180er,${p1_180s},${p2_180s}\n`;
  csv += `140+ Scores,${p1_140s},${p2_140s}\n`;
  csv += `Hoechster Score,${p1HighScore},${p2HighScore}\n`;
  csv += `Darts geworfen,${p1Darts},${p2Darts}\n\n`;

  csv += '=== WURF-HISTORIE ===\n';
  csv += 'Wurf Nr.,Spieler,Score,Set,Leg\n';
  allThrows.forEach((t, i) => {
    const playerName = t.player === 'p1' ? p1Name : p2Name;
    csv += `${i + 1},${playerName},${t.score},${t.setNo || 1},${t.legNo || 1}\n`;
  });

  return csv;
}

/**
 * Triggert einen CSV-Download im Browser
 * @param {string} csvContent - Der CSV-Inhalt
 * @param {string} filename - Der Dateiname
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
