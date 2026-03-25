// Checkout-Tabelle für Double-Out
// Alle gültigen Checkouts von 2-170 (3 Darts, letzter Dart muss Double sein)
// Unmögliche Checkouts: 159, 162, 163, 165, 166, 168, 169

const IMPOSSIBLE_CHECKOUTS = new Set([159, 162, 163, 165, 166, 168, 169]);

/**
 * Prüft ob ein Reststand ein gültiger Checkout ist (Double-Out, max 3 Darts)
 * @param {number} remaining - Der Reststand
 * @returns {boolean}
 */
export function isValidCheckout(remaining) {
  if (remaining < 2 || remaining > 170) return false;
  return !IMPOSSIBLE_CHECKOUTS.has(remaining);
}

/**
 * Gibt den Checkout-Vorschlag zurück (z.B. "T20 T20 D20" für 170)
 * @param {number} remaining - Der Reststand
 * @returns {string|null} Checkout-Vorschlag oder null
 */
export function getCheckoutSuggestion(remaining) {
  return CHECKOUT_SUGGESTIONS[remaining] || null;
}

// Checkout-Vorschläge für gängige Reststände
const CHECKOUT_SUGGESTIONS = {
  170: 'T20 T20 Bull',
  167: 'T20 T19 Bull',
  164: 'T20 T18 Bull',
  161: 'T20 T17 Bull',
  160: 'T20 T20 D20',
  158: 'T20 T20 D19',
  157: 'T20 T19 D20',
  156: 'T20 T20 D18',
  155: 'T20 T19 D19',
  154: 'T20 T18 D20',
  153: 'T20 T19 D18',
  152: 'T20 T20 D16',
  151: 'T20 T17 D20',
  150: 'T20 T18 D18',
  149: 'T20 T19 D16',
  148: 'T20 T16 D20',
  147: 'T20 T17 D18',
  146: 'T20 T18 D16',
  145: 'T20 T15 D20',
  144: 'T20 T18 D15',
  143: 'T20 T17 D16',
  142: 'T20 T14 D20',
  141: 'T20 T19 D12',
  140: 'T20 T16 D16',
  139: 'T20 T13 D20',
  138: 'T20 T18 D12',
  137: 'T20 T15 D16',
  136: 'T20 T20 D8',
  135: 'T20 T17 D12',
  134: 'T20 T14 D16',
  133: 'T20 T19 D8',
  132: 'T20 T16 D12',
  131: 'T20 T13 D16',
  130: 'T20 T18 D8',
  129: 'T19 T16 D12',
  128: 'T18 T14 D16',
  127: 'T20 T17 D8',
  126: 'T19 T19 D6',
  125: 'T20 T15 D10',  // oder 25 T20 D20
  124: 'T20 T16 D8',
  123: 'T19 T16 D9',
  122: 'T18 T18 D7',
  121: 'T20 T11 D14',
  120: 'T20 S20 D20',
  119: 'T19 T12 D13',
  118: 'T20 S18 D20',
  117: 'T20 S17 D20',
  116: 'T20 S16 D20',
  115: 'T20 S15 D20',
  114: 'T20 S14 D20',
  113: 'T20 S13 D20',
  112: 'T20 S12 D20',
  111: 'T20 S11 D20',  // oder T19 S14 D20
  110: 'T20 S10 D20',  // oder T20 Bull
  109: 'T20 S9 D20',
  108: 'T20 S8 D20',
  107: 'T20 S7 D20',   // oder T19 Bull
  106: 'T20 S6 D20',
  105: 'T20 S5 D20',
  104: 'T20 S4 D20',   // oder T18 Bull
  103: 'T20 S3 D20',
  102: 'T20 S2 D20',
  101: 'T20 S1 D20',   // oder T17 Bull
  100: 'T20 D20',
  99: 'T19 S10 D16',
  98: 'T20 D19',
  97: 'T19 D20',
  96: 'T20 D18',
  95: 'T19 D19',       // oder 25 T20 D5 / Bull S5 D20
  94: 'T18 D20',
  93: 'T19 D18',
  92: 'T20 D16',
  91: 'T17 D20',
  90: 'T18 D18',       // oder T20 D15
  89: 'T19 D16',
  88: 'T16 D20',
  87: 'T17 D18',
  86: 'T18 D16',
  85: 'T15 D20',
  84: 'T20 D12',
  83: 'T17 D16',
  82: 'T14 D20',       // oder Bull D16
  81: 'T19 D12',
  80: 'T20 D10',
  79: 'T13 D20',       // oder T19 D11
  78: 'T18 D12',
  77: 'T15 D16',
  76: 'T20 D8',
  75: 'T17 D12',
  74: 'T14 D16',
  73: 'T19 D8',
  72: 'T16 D12',
  71: 'T13 D16',
  70: 'T18 D8',        // oder T10 D20
  69: 'T19 D6',
  68: 'T20 D4',        // oder T16 D10
  67: 'T17 D8',
  66: 'T10 D18',       // oder T14 D12
  65: 'T19 D4',        // oder 25 D20
  64: 'T16 D8',
  63: 'T13 D12',
  62: 'T10 D16',
  61: 'T15 D8',
  60: 'S20 D20',
  59: 'S19 D20',
  58: 'S18 D20',
  57: 'S17 D20',
  56: 'S16 D20',       // oder T16 D4
  55: 'S15 D20',
  54: 'S14 D20',
  53: 'S13 D20',
  52: 'S12 D20',       // oder T12 D8
  51: 'S11 D20',       // oder S19 D16
  50: 'Bull',          // oder S10 D20, S18 D16
  49: 'S9 D20',        // oder S17 D16
  48: 'S8 D20',        // oder S16 D16
  47: 'S7 D20',        // oder S15 D16
  46: 'S6 D20',        // oder S14 D16
  45: 'S5 D20',        // oder S13 D16
  44: 'S4 D20',        // oder S12 D16
  43: 'S3 D20',        // oder S11 D16
  42: 'S2 D20',        // oder S10 D16
  41: 'S1 D20',        // oder S9 D16
  40: 'D20',
  39: 'S7 D16',        // oder S19 D10
  38: 'D19',
  37: 'S5 D16',        // oder S17 D10
  36: 'D18',
  35: 'S3 D16',
  34: 'D17',
  33: 'S1 D16',        // oder S17 D8
  32: 'D16',
  31: 'S15 D8',        // oder S7 D12
  30: 'D15',
  29: 'S13 D8',        // oder S5 D12
  28: 'D14',
  27: 'S11 D8',        // oder S3 D12
  26: 'D13',
  25: 'S9 D8',         // oder S1 D12
  24: 'D12',
  23: 'S7 D8',
  22: 'D11',
  21: 'S5 D8',         // oder S1 D10
  20: 'D10',
  19: 'S3 D8',         // oder S7 D6
  18: 'D9',
  17: 'S1 D8',         // oder S5 D6
  16: 'D8',
  15: 'S7 D4',         // oder S3 D6
  14: 'D7',
  13: 'S5 D4',         // oder S1 D6
  12: 'D6',
  11: 'S3 D4',
  10: 'D5',
  9: 'S1 D4',
  8: 'D4',
  7: 'S3 D2',
  6: 'D3',
  5: 'S1 D2',          // oder S3 D1
  4: 'D2',
  3: 'S1 D1',
  2: 'D1',
};
