export function aggregateStats(throws) {
  /*
    throws = [{playerId, darts:[d1,d2,d3], legId, isFinish} ...]
  */
  const stats = new Map();
  const get = id => stats.get(id) || (stats.set(id, empty()), stats.get(id));

  const empty = () => ({
    wins: 0, legsWon: 0, setsWon: 0, avg3: 0,
    first9Avg: 0, bestAvg: 0, checkoutPct: 0,
    highFinish: 0, bullFin: 0, shortGames: 0,
    _180s: 0, _140s: 0, _100s: 0
  });

  // … Berechnungen hier …
  return Object.fromEntries(stats);
}