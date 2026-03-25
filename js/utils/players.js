// Zentrale Spieler-Utilities - eliminiert Duplikation

/**
 * Holt die Spielernamen aus einem Match-Objekt
 * @param {Object} match - Das Match-Objekt aus Supabase
 * @returns {Object} { p1: string, p2: string }
 */
export function getPlayerNames(match) {
  if (!match) {
    return { p1: 'Spieler 1', p2: 'Spieler 2' };
  }

  return {
    p1: match.p1_name || match.p1?.name || match.users_p1?.name || 'Spieler 1',
    p2: match.p2_name || match.p2?.name || match.users_p2?.name || 'Spieler 2'
  };
}

/**
 * Holt die Spieler-ID für einen Spieler-Key
 * @param {Object} match - Das Match-Objekt aus Supabase
 * @param {string} playerKey - 'p1' oder 'p2'
 * @returns {string|null} Die Spieler-ID
 */
export function getPlayerId(match, playerKey) {
  if (!match) return null;

  if (playerKey === 'p1') {
    return match.p1_id || match.p1?.id || null;
  }
  if (playerKey === 'p2') {
    return match.p2_id || match.p2?.id || null;
  }
  return null;
}

/**
 * Setzt die Spielernamen auf dem Match-Objekt (für Kompatibilität)
 * @param {Object} match - Das Match-Objekt
 * @returns {Object} Das modifizierte Match-Objekt
 */
export function ensurePlayerNames(match) {
  if (!match) return match;

  const names = getPlayerNames(match);
  match.p1_name = names.p1;
  match.p2_name = names.p2;

  return match;
}

/**
 * Gibt den Gewinner-Key basierend auf dem Spielstand zurück
 * @param {Object} setsWon - { p1: number, p2: number }
 * @param {number} bestOfSets - Anzahl Sets zum Gewinnen
 * @returns {string|null} 'p1', 'p2' oder null
 */
export function getMatchWinner(setsWon, bestOfSets) {
  const setsToWin = Math.ceil(bestOfSets / 2);
  if (setsWon.p1 >= setsToWin) return 'p1';
  if (setsWon.p2 >= setsToWin) return 'p2';
  return null;
}

/**
 * Gibt den Gewinner-Key für ein Leg zurück
 * @param {Object} legsWon - { p1: number, p2: number }
 * @param {number} bestOfLegs - Anzahl Legs zum Gewinnen
 * @returns {string|null} 'p1', 'p2' oder null
 */
export function getSetWinner(legsWon, bestOfLegs) {
  const legsToWin = Math.ceil(bestOfLegs / 2);
  if (legsWon.p1 >= legsToWin) return 'p1';
  if (legsWon.p2 >= legsToWin) return 'p2';
  return null;
}

/**
 * Wechselt den aktuellen Spieler
 * @param {string} currentPlayer - 'p1' oder 'p2'
 * @returns {string} Der andere Spieler
 */
export function switchPlayer(currentPlayer) {
  return currentPlayer === 'p1' ? 'p2' : 'p1';
}
