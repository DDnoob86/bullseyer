// Zentraler State Manager - ersetzt Window Globals und Module-Level Variables
import { START_SCORE, PLAYER, STORAGE_KEYS } from '../utils/constants.js';

// Privater State (nicht direkt von außen zugänglich)
const state = {
  // Match-Daten
  currentMatch: null,
  currentLeg: null,

  // Spielstand
  remaining: {
    [PLAYER.P1]: START_SCORE,
    [PLAYER.P2]: START_SCORE
  },
  legsWon: {
    [PLAYER.P1]: 0,
    [PLAYER.P2]: 0
  },
  setsWon: {
    [PLAYER.P1]: 0,
    [PLAYER.P2]: 0
  },

  // Aktueller Zustand
  currentPlayer: PLAYER.P1,
  currentLegNo: 1,
  currentSetNo: 1,
  legStarter: PLAYER.P1,
  gameStarter: null,

  // Flags
  bullfinish: false,
  currentLegSaved: false,

  // Board
  currentBoard: null,

  // History
  throwHistory: [],
  allMatchThrows: []
};

// Subscribers für State-Änderungen
const subscribers = new Set();

/**
 * Benachrichtigt alle Subscriber über State-Änderungen
 */
function notifySubscribers(changedKeys) {
  subscribers.forEach(callback => {
    try {
      callback(changedKeys, state);
    } catch (err) {
      console.error('[Store] Subscriber error:', err);
    }
  });
}

/**
 * Registriert einen Subscriber für State-Änderungen
 * @param {Function} callback - Wird bei Änderungen aufgerufen
 * @returns {Function} Unsubscribe-Funktion
 */
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// === GETTERS ===

export function getCurrentMatch() {
  return state.currentMatch;
}

export function getCurrentLeg() {
  return state.currentLeg;
}

export function getRemaining(player) {
  return state.remaining[player];
}

export function getRemainingP1() {
  return state.remaining[PLAYER.P1];
}

export function getRemainingP2() {
  return state.remaining[PLAYER.P2];
}

export function getLegsWon() {
  return { ...state.legsWon };
}

export function getSetsWon() {
  return { ...state.setsWon };
}

export function getCurrentPlayer() {
  return state.currentPlayer;
}

export function getCurrentLegNo() {
  return state.currentLegNo;
}

export function getCurrentSetNo() {
  return state.currentSetNo;
}

export function getLegStarter() {
  return state.legStarter;
}

export function getGameStarter() {
  return state.gameStarter;
}

export function getBullfinish() {
  return state.bullfinish;
}

export function isCurrentLegSaved() {
  return state.currentLegSaved;
}

export function getCurrentBoard() {
  return state.currentBoard;
}

export function getThrowHistory() {
  return [...state.throwHistory];
}

export function getAllMatchThrows() {
  return [...state.allMatchThrows];
}

/**
 * Gibt den kompletten State zurück (readonly Kopie)
 */
export function getState() {
  return {
    currentMatch: state.currentMatch,
    currentLeg: state.currentLeg,
    remaining: { ...state.remaining },
    legsWon: { ...state.legsWon },
    setsWon: { ...state.setsWon },
    currentPlayer: state.currentPlayer,
    currentLegNo: state.currentLegNo,
    currentSetNo: state.currentSetNo,
    legStarter: state.legStarter,
    gameStarter: state.gameStarter,
    bullfinish: state.bullfinish,
    currentLegSaved: state.currentLegSaved,
    currentBoard: state.currentBoard,
    throwHistory: [...state.throwHistory],
    allMatchThrows: [...state.allMatchThrows]
  };
}

// === SETTERS ===

export function setCurrentMatch(match) {
  state.currentMatch = match;
  if (match?.id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_MATCH_ID, match.id);
  }
  notifySubscribers(['currentMatch']);
}

export function setCurrentLeg(leg) {
  state.currentLeg = leg;
  notifySubscribers(['currentLeg']);
}

export function setRemaining(player, value) {
  state.remaining[player] = value;
  notifySubscribers(['remaining']);
}

export function setRemainingP1(value) {
  state.remaining[PLAYER.P1] = value;
  notifySubscribers(['remaining']);
}

export function setRemainingP2(value) {
  state.remaining[PLAYER.P2] = value;
  notifySubscribers(['remaining']);
}

export function setLegsWon(legsWon) {
  state.legsWon = { ...legsWon };
  notifySubscribers(['legsWon']);
}

export function setSetsWon(setsWon) {
  state.setsWon = { ...setsWon };
  notifySubscribers(['setsWon']);
}

export function incrementLegsWon(player) {
  state.legsWon[player]++;
  notifySubscribers(['legsWon']);
}

export function incrementSetsWon(player) {
  state.setsWon[player]++;
  notifySubscribers(['setsWon']);
}

export function setCurrentPlayer(player) {
  state.currentPlayer = player;
  notifySubscribers(['currentPlayer']);
}

export function setCurrentLegNo(legNo) {
  state.currentLegNo = legNo;
  notifySubscribers(['currentLegNo']);
}

export function setCurrentSetNo(setNo) {
  state.currentSetNo = setNo;
  notifySubscribers(['currentSetNo']);
}

export function setLegStarter(player) {
  state.legStarter = player;
  notifySubscribers(['legStarter']);
}

export function setGameStarter(player) {
  state.gameStarter = player;
  notifySubscribers(['gameStarter']);
}

export function setBullfinish(value) {
  state.bullfinish = value;
  notifySubscribers(['bullfinish']);
}

export function setCurrentLegSaved(value) {
  state.currentLegSaved = value;
  notifySubscribers(['currentLegSaved']);
}

export function setCurrentBoard(board) {
  state.currentBoard = String(board);
  localStorage.setItem(STORAGE_KEYS.BOARD, state.currentBoard);
  notifySubscribers(['currentBoard']);
}

// === HISTORY MANAGEMENT ===

export function addThrow(throwData) {
  state.throwHistory.push(throwData);
  state.allMatchThrows.push({
    player: throwData.player,
    score: throwData.score,
    legNo: state.currentLegNo,
    setNo: state.currentSetNo
  });
  notifySubscribers(['throwHistory', 'allMatchThrows']);
}

export function undoLastThrow() {
  if (state.throwHistory.length === 0) return null;

  const last = state.throwHistory.pop();

  // State wiederherstellen
  state.currentPlayer = last.player;
  state.remaining[PLAYER.P1] = last.remP1;
  state.remaining[PLAYER.P2] = last.remP2;
  state.legsWon = { ...last.legsWon };
  state.setsWon = { ...last.setsWon };
  state.currentLegNo = last.legNo;
  state.currentSetNo = last.setNo;
  state.bullfinish = last.bullfinish;
  state.legStarter = last.legStarter || state.legStarter;
  state.gameStarter = last.gameStarter || state.gameStarter;

  notifySubscribers(['throwHistory', 'remaining', 'legsWon', 'setsWon', 'currentPlayer', 'currentLegNo', 'currentSetNo', 'bullfinish']);

  return last;
}

export function clearThrowHistory() {
  state.throwHistory = [];
  notifySubscribers(['throwHistory']);
}

export function clearAllMatchThrows() {
  state.allMatchThrows = [];
  notifySubscribers(['allMatchThrows']);
}

// === BATCH UPDATES ===

/**
 * Aktualisiert mehrere State-Werte auf einmal
 * @param {Object} updates - Objekt mit zu aktualisierenden Werten
 */
export function updateState(updates) {
  const changedKeys = [];

  if ('currentMatch' in updates) {
    state.currentMatch = updates.currentMatch;
    changedKeys.push('currentMatch');
  }
  if ('currentLeg' in updates) {
    state.currentLeg = updates.currentLeg;
    changedKeys.push('currentLeg');
  }
  if ('remainingP1' in updates) {
    state.remaining[PLAYER.P1] = updates.remainingP1;
    changedKeys.push('remaining');
  }
  if ('remainingP2' in updates) {
    state.remaining[PLAYER.P2] = updates.remainingP2;
    changedKeys.push('remaining');
  }
  if ('legsWon' in updates) {
    state.legsWon = { ...updates.legsWon };
    changedKeys.push('legsWon');
  }
  if ('setsWon' in updates) {
    state.setsWon = { ...updates.setsWon };
    changedKeys.push('setsWon');
  }
  if ('currentPlayer' in updates) {
    state.currentPlayer = updates.currentPlayer;
    changedKeys.push('currentPlayer');
  }
  if ('currentLegNo' in updates) {
    state.currentLegNo = updates.currentLegNo;
    changedKeys.push('currentLegNo');
  }
  if ('currentSetNo' in updates) {
    state.currentSetNo = updates.currentSetNo;
    changedKeys.push('currentSetNo');
  }
  if ('legStarter' in updates) {
    state.legStarter = updates.legStarter;
    changedKeys.push('legStarter');
  }
  if ('gameStarter' in updates) {
    state.gameStarter = updates.gameStarter;
    changedKeys.push('gameStarter');
  }
  if ('bullfinish' in updates) {
    state.bullfinish = updates.bullfinish;
    changedKeys.push('bullfinish');
  }
  if ('currentLegSaved' in updates) {
    state.currentLegSaved = updates.currentLegSaved;
    changedKeys.push('currentLegSaved');
  }

  if (changedKeys.length > 0) {
    notifySubscribers(changedKeys);
  }
}

// === LIFECYCLE ===

/**
 * Initialisiert den State für ein neues Match
 */
export function initNewMatch(match) {
  state.currentMatch = match;
  state.currentLeg = null;
  state.remaining = { [PLAYER.P1]: START_SCORE, [PLAYER.P2]: START_SCORE };
  state.legsWon = { [PLAYER.P1]: 0, [PLAYER.P2]: 0 };
  state.setsWon = { [PLAYER.P1]: 0, [PLAYER.P2]: 0 };
  state.currentPlayer = PLAYER.P1;
  state.currentLegNo = 1;
  state.currentSetNo = 1;
  state.legStarter = PLAYER.P1;
  state.gameStarter = null;
  state.bullfinish = false;
  state.currentLegSaved = false;
  state.throwHistory = [];
  state.allMatchThrows = [];

  if (match?.id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_MATCH_ID, match.id);
  }

  notifySubscribers(['all']);
}

/**
 * Startet ein neues Leg
 */
export function startNewLeg() {
  state.remaining = { [PLAYER.P1]: START_SCORE, [PLAYER.P2]: START_SCORE };
  state.legStarter = state.legStarter === PLAYER.P1 ? PLAYER.P2 : PLAYER.P1;
  state.currentPlayer = state.legStarter;
  state.throwHistory = [];
  state.bullfinish = false;
  state.currentLegSaved = false;
  state.currentLegNo++;

  notifySubscribers(['remaining', 'legStarter', 'currentPlayer', 'throwHistory', 'bullfinish', 'currentLegSaved', 'currentLegNo']);
}

/**
 * Startet ein neues Set
 */
export function startNewSet() {
  state.legsWon = { [PLAYER.P1]: 0, [PLAYER.P2]: 0 };
  state.currentSetNo++;
  state.currentLegNo = 1;

  // Auch die Leg-State zurücksetzen
  state.remaining = { [PLAYER.P1]: START_SCORE, [PLAYER.P2]: START_SCORE };
  state.legStarter = state.legStarter === PLAYER.P1 ? PLAYER.P2 : PLAYER.P1;
  state.currentPlayer = state.legStarter;
  state.throwHistory = [];
  state.bullfinish = false;
  state.currentLegSaved = false;

  notifySubscribers(['legsWon', 'currentSetNo', 'currentLegNo', 'remaining', 'legStarter', 'currentPlayer', 'throwHistory', 'bullfinish', 'currentLegSaved']);
}

/**
 * Setzt den State komplett zurück
 */
export function resetState() {
  state.currentMatch = null;
  state.currentLeg = null;
  state.remaining = { [PLAYER.P1]: START_SCORE, [PLAYER.P2]: START_SCORE };
  state.legsWon = { [PLAYER.P1]: 0, [PLAYER.P2]: 0 };
  state.setsWon = { [PLAYER.P1]: 0, [PLAYER.P2]: 0 };
  state.currentPlayer = PLAYER.P1;
  state.currentLegNo = 1;
  state.currentSetNo = 1;
  state.legStarter = PLAYER.P1;
  state.gameStarter = null;
  state.bullfinish = false;
  state.currentLegSaved = false;
  state.throwHistory = [];
  state.allMatchThrows = [];

  localStorage.removeItem(STORAGE_KEYS.CURRENT_MATCH_ID);

  notifySubscribers(['all']);
}

/**
 * Lädt den Board aus localStorage
 */
export function loadBoardFromStorage() {
  const board = localStorage.getItem(STORAGE_KEYS.BOARD);
  if (board) {
    state.currentBoard = board;
  }
  return state.currentBoard;
}

/**
 * Lädt die Match-ID aus localStorage
 */
export function getStoredMatchId() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_MATCH_ID);
}

// Initialisiere Board aus localStorage beim Import
loadBoardFromStorage();
