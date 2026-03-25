// Zentrale Konstanten - eliminiert Magic Numbers/Strings

// Spielkonfiguration
export const START_SCORE = 501;
export const DEFAULT_BEST_OF_LEGS = 5;
export const DEFAULT_BEST_OF_SETS = 1;
export const DEFAULT_BOARD = 1;

// Spieler-Keys
export const PLAYER = {
  P1: 'p1',
  P2: 'p2'
};

// LocalStorage Keys
export const STORAGE_KEYS = {
  BOARD: 'bullseyer_board',
  CURRENT_MATCH_ID: 'bullseyer_currentMatchId',
  GAMEDAY: 'bullseyer_gameday',
  THEME: 'bullseyer_theme',
  MOCK_USER: 'mock_currentUser'
};

// Score-Kategorien
export const SCORE_THRESHOLDS = {
  MAX_SINGLE_DART: 60,
  HIGHSCORE_MIN: 101,
  SCORE_140_PLUS: 140,
  SCORE_180: 180
};

// Dart-Multiplikatoren
export const MULTIPLIER = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3
};

// Quick-Score Voreinstellungen mit Dart-Verteilung
export const QUICK_SCORE_DISTRIBUTIONS = {
  180: [60, 60, 60],
  140: [60, 60, 20],
  121: [60, 41, 20],
  100: [60, 20, 20],
  95: [60, 25, 10],
  85: [60, 20, 5],
  83: [60, 20, 3],
  81: [60, 20, 1],
  60: [20, 20, 20],
  45: [25, 20, 0],
  41: [20, 20, 1],
  26: [20, 6, 0]
};

// UI Timing (Debounce, Delays)
export const TIMING = {
  DEBOUNCE_MS: 400,
  UI_UPDATE_DELAY: 10,
  PLAYER_INDICATOR_DELAY: 15,
  BUTTON_ERROR_DISPLAY_MS: 3000
};

// Validiert ob ein Score ein gültiges Double-Out ist
export function isValidDoubleOut(score) {
  return (score >= 2 && score <= 40 && score % 2 === 0) || score === 50;
}

// Verteilt einen Gesamt-Score auf 3 Darts
export function distributeDarts(totalScore) {
  if (QUICK_SCORE_DISTRIBUTIONS[totalScore]) {
    return QUICK_SCORE_DISTRIBUTIONS[totalScore];
  }

  // Fallback: Verteile gleichmäßig (max 60 pro Dart)
  let remaining = totalScore;
  const result = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    if (remaining >= SCORE_THRESHOLDS.MAX_SINGLE_DART) {
      result[i] = SCORE_THRESHOLDS.MAX_SINGLE_DART;
      remaining -= SCORE_THRESHOLDS.MAX_SINGLE_DART;
    } else {
      result[i] = remaining;
      remaining = 0;
    }
  }

  return result;
}
