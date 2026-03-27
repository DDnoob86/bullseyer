// Bullseyer Unit Tests
// Ausführen: tests/test-runner.html im Browser öffnen

import { isValidCheckout, getCheckoutSuggestion, getMinCheckoutDarts, isBullfinishPossible } from '../js/utils/checkouts.js';
import { isValidDoubleOut, distributeDarts, escapeHTML, PLAYER, START_SCORE } from '../js/utils/constants.js';
import { generateRoundRobin, generateRoundRobinRounds, distributeToBoards } from '../js/pairing.js';
import { Leg } from '../js/scorer.js';

// === Mini Test Framework ===
let totalPassed = 0;
let totalFailed = 0;
const results = document.getElementById('results');
const summary = document.getElementById('summary');

function suite(name, fn) {
  const div = document.createElement('div');
  div.className = 'suite';
  div.innerHTML = `<div class="suite-name">${name}</div>`;
  results.appendChild(div);
  const ctx = { container: div };
  fn(ctx);
}

function test(ctx, description, fn) {
  const div = document.createElement('div');
  div.className = 'test';
  try {
    fn();
    div.innerHTML = `<span class="pass">✓</span> ${description}`;
    totalPassed++;
  } catch (err) {
    div.innerHTML = `<span class="fail">✗</span> ${description} — <span class="fail">${err.message}</span>`;
    totalFailed++;
  }
  ctx.container.appendChild(div);
}

function assert(condition, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Erwartet: ${expected}, Bekommen: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Erwartet: ${JSON.stringify(expected)}, Bekommen: ${JSON.stringify(actual)}`);
  }
}

// =============================================================
// TEST SUITES
// =============================================================

suite('isValidDoubleOut', (ctx) => {
  test(ctx, 'D1 (2) ist gültig', () => assert(isValidDoubleOut(2)));
  test(ctx, 'D20 (40) ist gültig', () => assert(isValidDoubleOut(40)));
  test(ctx, 'Bull (50) ist gültig', () => assert(isValidDoubleOut(50)));
  test(ctx, 'D10 (20) ist gültig', () => assert(isValidDoubleOut(20)));
  test(ctx, '1 ist ungültig (ungerade)', () => assert(!isValidDoubleOut(1)));
  test(ctx, '3 ist ungültig (ungerade)', () => assert(!isValidDoubleOut(3)));
  test(ctx, '42 ist ungültig (> 40, nicht 50)', () => assert(!isValidDoubleOut(42)));
  test(ctx, '60 ist ungültig (T20, kein Double)', () => assert(!isValidDoubleOut(60)));
  test(ctx, '0 ist ungültig', () => assert(!isValidDoubleOut(0)));
  test(ctx, '25 ist ungültig (Single Bull)', () => assert(!isValidDoubleOut(25)));
  test(ctx, '-2 ist ungültig (negativ)', () => assert(!isValidDoubleOut(-2)));
});

suite('isValidCheckout', (ctx) => {
  test(ctx, '2 ist gültiger Checkout (D1)', () => assert(isValidCheckout(2)));
  test(ctx, '170 ist gültiger Checkout (T20 T20 Bull)', () => assert(isValidCheckout(170)));
  test(ctx, '40 ist gültiger Checkout (D20)', () => assert(isValidCheckout(40)));
  test(ctx, '1 ist ungültig (zu niedrig)', () => assert(!isValidCheckout(1)));
  test(ctx, '171 ist ungültig (zu hoch)', () => assert(!isValidCheckout(171)));
  test(ctx, '159 ist unmöglicher Checkout', () => assert(!isValidCheckout(159)));
  test(ctx, '162 ist unmöglicher Checkout', () => assert(!isValidCheckout(162)));
  test(ctx, '163 ist unmöglicher Checkout', () => assert(!isValidCheckout(163)));
  test(ctx, '165 ist unmöglicher Checkout', () => assert(!isValidCheckout(165)));
  test(ctx, '166 ist unmöglicher Checkout', () => assert(!isValidCheckout(166)));
  test(ctx, '168 ist unmöglicher Checkout', () => assert(!isValidCheckout(168)));
  test(ctx, '169 ist unmöglicher Checkout', () => assert(!isValidCheckout(169)));
  test(ctx, '100 ist gültiger Checkout', () => assert(isValidCheckout(100)));
});

suite('getMinCheckoutDarts', (ctx) => {
  test(ctx, '2 (D1) braucht 1 Dart', () => assertEqual(getMinCheckoutDarts(2), 1));
  test(ctx, '40 (D20) braucht 1 Dart', () => assertEqual(getMinCheckoutDarts(40), 1));
  test(ctx, '50 (Bull) braucht 1 Dart', () => assertEqual(getMinCheckoutDarts(50), 1));
  test(ctx, '3 braucht 2 Darts (S1 D1)', () => assertEqual(getMinCheckoutDarts(3), 2));
  test(ctx, '110 braucht 2 Darts', () => assertEqual(getMinCheckoutDarts(110), 2));
  test(ctx, '111 braucht 3 Darts', () => assertEqual(getMinCheckoutDarts(111), 3));
  test(ctx, '170 braucht 3 Darts', () => assertEqual(getMinCheckoutDarts(170), 3));
});

suite('getCheckoutSuggestion', (ctx) => {
  test(ctx, '170 → T20 T20 Bull', () => assertEqual(getCheckoutSuggestion(170), 'T20 T20 Bull'));
  test(ctx, '40 → D20', () => assertEqual(getCheckoutSuggestion(40), 'D20'));
  test(ctx, '2 → D1', () => assertEqual(getCheckoutSuggestion(2), 'D1'));
  test(ctx, '50 → Bull', () => assertEqual(getCheckoutSuggestion(50), 'Bull'));
  test(ctx, '180 → null (kein Checkout)', () => assertEqual(getCheckoutSuggestion(180), null));
});

suite('isBullfinishPossible', (ctx) => {
  test(ctx, '50 → ja (Bull direkt)', () => assert(isBullfinishPossible(50)));
  test(ctx, '170 → ja', () => assert(isBullfinishPossible(170)));
  test(ctx, '49 → nein (< 50)', () => assert(!isBullfinishPossible(49)));
  test(ctx, '2 → nein (< 50)', () => assert(!isBullfinishPossible(2)));
});

suite('distributeDarts', (ctx) => {
  test(ctx, '180 → [60, 60, 60]', () => assertDeepEqual(distributeDarts(180), [60, 60, 60]));
  test(ctx, '140 → [60, 60, 20]', () => assertDeepEqual(distributeDarts(140), [60, 60, 20]));
  test(ctx, '26 → [20, 6, 0]', () => assertDeepEqual(distributeDarts(26), [20, 6, 0]));
  test(ctx, '0 → [0, 0, 0] (Fallback)', () => assertDeepEqual(distributeDarts(0), [0, 0, 0]));
  test(ctx, '150 → [60, 60, 30] (Fallback)', () => assertDeepEqual(distributeDarts(150), [60, 60, 30]));
  test(ctx, '61 → [60, 1, 0] (Fallback)', () => assertDeepEqual(distributeDarts(61), [60, 1, 0]));
});

suite('escapeHTML', (ctx) => {
  test(ctx, 'Escaped & korrekt', () => assertEqual(escapeHTML('A & B'), 'A &amp; B'));
  test(ctx, 'Escaped < korrekt', () => assertEqual(escapeHTML('<script>'), '&lt;script&gt;'));
  test(ctx, 'Escaped " korrekt', () => assertEqual(escapeHTML('"test"'), '&quot;test&quot;'));
  test(ctx, "Escaped ' korrekt", () => assertEqual(escapeHTML("it's"), "it&#039;s"));
  test(ctx, 'Normaler Text bleibt unverändert', () => assertEqual(escapeHTML('Hello World'), 'Hello World'));
  test(ctx, 'null → leerer String', () => assertEqual(escapeHTML(null), ''));
  test(ctx, 'undefined → leerer String', () => assertEqual(escapeHTML(undefined), ''));
  test(ctx, 'Zahl → String', () => assertEqual(escapeHTML(42), '42'));
});

suite('Leg Klasse - Basis', (ctx) => {
  test(ctx, 'Neues Leg hat startingScore 501', () => {
    const leg = new Leg({ legId: 'test-1' });
    assertEqual(leg.startingScore, 501);
  });

  test(ctx, 'Neues Leg hat keinen Winner', () => {
    const leg = new Leg({ legId: 'test-2' });
    assertEqual(leg.winner, null);
  });

  test(ctx, 'currentScore für neuen Spieler = startingScore', () => {
    const leg = new Leg({ legId: 'test-3' });
    assertEqual(leg.currentScore('player1'), 501);
  });

  test(ctx, 'throwCount startet bei 0', () => {
    const leg = new Leg({ legId: 'test-4' });
    assertEqual(leg.throwCount, 0);
  });
});

suite('Leg Klasse - Scoring', (ctx) => {
  test(ctx, 'Wurf reduziert Score korrekt', () => {
    const leg = new Leg({ legId: 'test-5' });
    leg.addThrow({ playerId: 'p1', darts: [60, 60, 60] }); // 180
    assertEqual(leg.currentScore('p1'), 321);
  });

  test(ctx, 'Zwei Spieler haben unabhängige Scores', () => {
    const leg = new Leg({ legId: 'test-6' });
    leg.addThrow({ playerId: 'p1', darts: [60, 60, 60] }); // 180
    leg.addThrow({ playerId: 'p2', darts: [20, 20, 20] }); // 60
    assertEqual(leg.currentScore('p1'), 321);
    assertEqual(leg.currentScore('p2'), 441);
  });

  test(ctx, 'Bust: Score > remaining wird ignoriert', () => {
    const leg = new Leg({ legId: 'test-7', startingScore: 50 });
    leg.addThrow({ playerId: 'p1', darts: [20, 20, 20] }); // 60 > 50 → Bust
    assertEqual(leg.currentScore('p1'), 50); // Unverändert
    assertEqual(leg.throwCount, 0);
  });

  test(ctx, 'Bust: remaining = 1 wird ignoriert', () => {
    const leg = new Leg({ legId: 'test-8', startingScore: 61 });
    leg.addThrow({ playerId: 'p1', darts: [60, 0, 0] }); // Rest = 1 → Bust
    assertEqual(leg.currentScore('p1'), 61); // Unverändert
  });

  test(ctx, 'Finish: Score exakt 0 → Winner gesetzt', () => {
    const leg = new Leg({ legId: 'test-9', startingScore: 60 });
    leg.addThrow({ playerId: 'p1', darts: [20, 20, 20] }); // 60 → 0
    assertEqual(leg.winner, 'p1');
  });

  test(ctx, '3-Dart-Average wird korrekt berechnet', () => {
    const leg = new Leg({ legId: 'test-10' });
    leg.addThrow({ playerId: 'p1', darts: [60, 60, 60] }); // 180
    leg.addThrow({ playerId: 'p2', darts: [20, 20, 20] }); // 60
    assertEqual(leg.threeDartAverage, '120.00'); // (180+60)/2
  });

  test(ctx, 'Leg-Dauer wird bei Finish berechnet', () => {
    const leg = new Leg({ legId: 'test-11', startingScore: 60 });
    leg.addThrow({ playerId: 'p1', darts: [20, 20, 20] });
    assert(leg.durationSeconds !== null);
    assert(leg.durationSeconds >= 0);
  });
});

suite('Leg Klasse - Double-Out Validierung (Advanced Mode)', (ctx) => {
  test(ctx, 'Simple Mode: Jedes Finish erlaubt', () => {
    const leg = new Leg({ legId: 'test-12', startingScore: 60, skipDoubleValidation: true });
    leg.addThrow({ playerId: 'p1', darts: [20, 20, 20] }); // Letzter Dart 20 (S20, kein Double)
    assertEqual(leg.winner, 'p1'); // Trotzdem erlaubt
  });

  test(ctx, 'Advanced Mode: Finish mit D20 (40) erlaubt', () => {
    const leg = new Leg({ legId: 'test-13', startingScore: 40, skipDoubleValidation: false, doubleOut: true });
    leg.addThrow({ playerId: 'p1', darts: [0, 0, 40] }); // Letzter Dart D20 = 40
    assertEqual(leg.winner, 'p1');
  });

  test(ctx, 'Advanced Mode: Finish mit Bull (50) erlaubt', () => {
    const leg = new Leg({ legId: 'test-14', startingScore: 50, skipDoubleValidation: false, doubleOut: true });
    leg.addThrow({ playerId: 'p1', darts: [0, 0, 50] }); // Bull
    assertEqual(leg.winner, 'p1');
  });

  test(ctx, 'Advanced Mode: Finish mit ungültigem Double (60 = T20) → Bust', () => {
    const leg = new Leg({ legId: 'test-15', startingScore: 60, skipDoubleValidation: false, doubleOut: true });
    leg.addThrow({ playerId: 'p1', darts: [0, 0, 60] }); // T20, kein Double
    assertEqual(leg.winner, null); // Bust!
    assertEqual(leg.currentScore('p1'), 60);
  });

  test(ctx, 'Advanced Mode: Finish mit 42 (ungültig, > D20) → Bust', () => {
    const leg = new Leg({ legId: 'test-16', startingScore: 42, skipDoubleValidation: false, doubleOut: true });
    leg.addThrow({ playerId: 'p1', darts: [0, 0, 42] }); // Kein gültiges Double
    assertEqual(leg.winner, null);
  });

  test(ctx, 'Advanced Mode: Finish mit 25 (Single Bull) → Bust', () => {
    const leg = new Leg({ legId: 'test-17', startingScore: 25, skipDoubleValidation: false, doubleOut: true });
    leg.addThrow({ playerId: 'p1', darts: [0, 0, 25] });
    assertEqual(leg.winner, null);
  });
});

suite('Round-Robin Pairing', (ctx) => {
  test(ctx, '4 Spieler → 6 Paarungen', () => {
    const pairs = generateRoundRobin(['A', 'B', 'C', 'D']);
    assertEqual(pairs.length, 6);
  });

  test(ctx, '3 Spieler → 3 Paarungen', () => {
    const pairs = generateRoundRobin(['A', 'B', 'C']);
    assertEqual(pairs.length, 3);
  });

  test(ctx, '2 Spieler → 1 Paarung', () => {
    const pairs = generateRoundRobin(['A', 'B']);
    assertEqual(pairs.length, 1);
  });

  test(ctx, '1 Spieler → 0 Paarungen', () => {
    const pairs = generateRoundRobin(['A']);
    assertEqual(pairs.length, 0);
  });

  test(ctx, 'Jeder spielt gegen jeden (4 Spieler)', () => {
    const pairs = generateRoundRobin(['A', 'B', 'C', 'D']);
    const pairSet = new Set(pairs.map(([a, b]) => [a, b].sort().join('-')));
    assert(pairSet.has('A-B'), 'A-B fehlt');
    assert(pairSet.has('A-C'), 'A-C fehlt');
    assert(pairSet.has('A-D'), 'A-D fehlt');
    assert(pairSet.has('B-C'), 'B-C fehlt');
    assert(pairSet.has('B-D'), 'B-D fehlt');
    assert(pairSet.has('C-D'), 'C-D fehlt');
  });

  test(ctx, 'Runden: Kein Spieler spielt doppelt pro Runde', () => {
    const rounds = generateRoundRobinRounds(['A', 'B', 'C', 'D']);
    for (const round of rounds) {
      const playersInRound = round.matches.flat();
      const unique = new Set(playersInRound);
      assertEqual(playersInRound.length, unique.size, `Runde ${round.round}: Spieler doppelt`);
    }
  });
});

suite('distributeToBoards', (ctx) => {
  test(ctx, 'Verteilt auf 2 Boards korrekt', () => {
    const rounds = [{ round: 1, matches: [['A', 'B'], ['C', 'D']] }];
    const result = distributeToBoards(rounds, 2);
    assertEqual(result[0].board, 1);
    assertEqual(result[1].board, 2);
  });

  test(ctx, '1 Board: alle auf Board 1', () => {
    const rounds = [{ round: 1, matches: [['A', 'B'], ['C', 'D']] }];
    const result = distributeToBoards(rounds, 1);
    assert(result.every(m => m.board === 1));
  });

  test(ctx, 'numBoards = 0 → Fallback auf 1', () => {
    const rounds = [{ round: 1, matches: [['A', 'B']] }];
    const result = distributeToBoards(rounds, 0);
    assertEqual(result[0].board, 1);
  });

  test(ctx, 'numBoards = null → Fallback auf 1', () => {
    const rounds = [{ round: 1, matches: [['A', 'B']] }];
    const result = distributeToBoards(rounds, null);
    assertEqual(result[0].board, 1);
  });
});

// === Summary ===
const allPassed = totalFailed === 0;
summary.className = `summary ${allPassed ? 'all-pass' : 'has-fail'}`;
summary.textContent = allPassed
  ? `✓ Alle ${totalPassed} Tests bestanden!`
  : `✗ ${totalFailed} von ${totalPassed + totalFailed} Tests fehlgeschlagen`;
