// Round-Robin Scheduling mit echten Runden
// Kein Spieler spielt doppelt pro Runde → ermöglicht simultane Matches auf mehreren Boards

/**
 * Erzeugt alle Paarungen als flache Liste (für Kompatibilität)
 * @param {Array} players - Array von Spieler-IDs
 * @returns {Array<[string,string]>} Alle Paarungen
 */
export function generateRoundRobin(players) {
  const rounds = generateRoundRobinRounds(players);
  // Flache Liste aller Paarungen (mit Rundeninfo)
  return rounds.flatMap(r => r.matches);
}

/**
 * Erzeugt Round-Robin Runden: Jede Runde enthält Matches die gleichzeitig gespielt werden können.
 * Verwendet den "Circle Method" Algorithmus.
 *
 * Beispiel für 4 Spieler (A, B, C, D):
 *   Runde 1: A-D, B-C
 *   Runde 2: A-C, D-B
 *   Runde 3: A-B, C-D
 *
 * @param {Array} players - Array von Spieler-IDs
 * @returns {Array<{round: number, matches: Array<[string,string]>}>}
 */
export function generateRoundRobinRounds(players) {
  if (players.length < 2) return [];

  // Bei ungerader Anzahl: Dummy hinzufügen (Freilos)
  const list = [...players];
  const hasBye = list.length % 2 !== 0;
  if (hasBye) list.push(null); // null = Freilos

  const n = list.length;
  const rounds = [];
  const numRounds = n - 1;

  // Circle Method: Spieler 0 bleibt fix, die anderen rotieren
  // Array: [fixed, slot1, slot2, ..., slotN-1]
  const slots = list.slice(1); // Alle außer dem ersten

  for (let r = 0; r < numRounds; r++) {
    const roundMatches = [];

    // Erstes Match: fixed vs letzter Slot
    const p1 = list[0];
    const p2 = slots[slots.length - 1];
    if (p1 !== null && p2 !== null) {
      roundMatches.push([p1, p2]);
    }

    // Restliche Matches: Slot i vs Slot (n-2-i)
    for (let i = 0; i < Math.floor((n - 1) / 2); i++) {
      const a = slots[i];
      const b = slots[slots.length - 2 - i];
      if (a !== null && b !== null) {
        roundMatches.push([a, b]);
      }
    }

    if (roundMatches.length > 0) {
      rounds.push({
        round: r + 1,
        matches: roundMatches
      });
    }

    // Rotation: Letztes Element → vorne
    slots.unshift(slots.pop());
  }

  return rounds;
}

/**
 * Verteilt Runden-Matches auf Boards
 * Jede Runde hat N simultane Matches → diese werden auf min(N, boards) Boards verteilt
 *
 * @param {Array} rounds - Output von generateRoundRobinRounds()
 * @param {number} numBoards - Anzahl verfügbarer Boards
 * @returns {Array<{round: number, board: number, p1: string, p2: string}>}
 */
export function distributeToBoards(rounds, numBoards) {
  const result = [];

  for (const round of rounds) {
    round.matches.forEach(([p1, p2], i) => {
      result.push({
        round: round.round,
        board: (i % numBoards) + 1,
        p1,
        p2
      });
    });
  }

  return result;
}
