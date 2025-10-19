// ⚠️ MOCK-MODUS FÜR TESTS - Ändere zu './supabase.js' für echtes Backend
import { supabase } from './supabase-mock.js';
import { Leg } from './scorer.js';

// Gemeinsame Leg-End-Handler-Funktion (vermeidet Code-Duplizierung)
async function handleLegEnd(source) {
  console.log(`[Bullseyer] Leg beendet - automatischer Übergang ins nächste Leg (${source})`);

  // Leg in Datenbank speichern
  if (window.currentMatch && window._lastRenderArgs?.currentLeg) {
    try {
      await saveLeg(window.currentMatch, window._lastRenderArgs.currentLeg, window.localSetNo, window.localLegNo, window.localRemainingP1, false);
      console.log('[Bullseyer] Leg automatisch gespeichert');
    } catch (error) {
      console.error('[Bullseyer] Fehler beim Speichern des Legs:', error);
    }
  }

  // Bestimme den Gewinner des Legs
  const legWinner = window.localRemainingP1 === 0 ? 'p1' : 'p2';

  // Erhöhe Leg-Zähler für den Gewinner
  if (legWinner === 'p1') {
    window.localLegsWon.p1++;
  } else {
    window.localLegsWon.p2++;
  }

  // Prüfe, ob Set gewonnen
  const bestLeg = window._lastRenderArgs?.bestLeg || 3;
  const setWon = window.localLegsWon.p1 >= bestLeg || window.localLegsWon.p2 >= bestLeg;

  if (setWon) {
    // Set gewonnen - Erhöhe Set-Zähler
    if (window.localLegsWon.p1 >= bestLeg) {
      window.localSetsWon.p1++;
    } else {
      window.localSetsWon.p2++;
    }
    console.log('[Bullseyer] Set automatisch gewonnen durch', legWinner, `(${source})`);

    // MATCH-END-CHECK: Prüfe ob Match gewonnen
    const bestSet = window._lastRenderArgs?.bestSet || 3;
    const matchWinner = checkMatchEnd(window.localSetsWon, bestSet);

    if (matchWinner) {
      // Match ist beendet!
      console.log('[Bullseyer] MATCH GEWONNEN von', matchWinner, `(${source})`);
      await finishMatch(window.currentMatch, matchWinner, window.localSetsWon, window.allMatchThrows);
      return true; // Signalisiert: Match beendet
    }

    // Kein Match-Ende: Neues Set starten
    window.localSetNo++;
    window.localLegNo = 1;
    window.localLegsWon = { p1: 0, p2: 0 }; // Reset Legs für neues Set
  } else {
    // Nur Leg gewonnen - nächstes Leg
    window.localLegNo++;
  }

  // Globale Variablen für neues Leg zurücksetzen
  window.localRemainingP1 = 501;
  window.localRemainingP2 = 501;

  // Startspieler für nächstes Leg wechseln
  window.localLegStarter = window.localLegStarter === 'p1' ? 'p2' : 'p1';
  window.localCurrentPlayer = window.localLegStarter;

  window.throwHistory = []; // Nur aktuelles Leg zurücksetzen
  // allMatchThrows bleibt erhalten für Match-Average
  window.localBullfinish = false;
  window.localLegSaved = true; // Leg ist gespeichert

  console.log('[Bullseyer] Neues Leg automatisch gestartet - Leg', window.localLegNo, 'Set', window.localSetNo, 'Starter:', window.localLegStarter);

  // Erstelle neues Leg für die Datenbank
  const newLeg = resetLeg(window.currentMatch, window.localSetNo, window.localLegNo);
  window._lastRenderArgs.currentLeg = newLeg;

  // UI aktualisieren
  if (typeof window.syncLocalVars === 'function') {
    window.syncLocalVars();
  }
  if (typeof window.updateRestpunkteUI === 'function') {
    window.updateRestpunkteUI();
  }
  if (typeof window.updateSetsLegsUI === 'function') {
    window.updateSetsLegsUI();
  }
  if (typeof window.updateAverages === 'function') {
    window.updateAverages(window.throwHistory);
  }

  // UI für neues Leg neu rendern
  setTimeout(() => {
    if (typeof window.renderLiveScorer === 'function') {
      window.renderLiveScorer(window._lastRenderArgs);
    }
  }, 100);

  return false; // Signalisiert: Leg beendet, aber Match läuft weiter
}

// Delegation-Handler für alle Livescorer-Buttons (robust, nur EINMAL pro Session, auch bei Hot-Reload)
(function() {
  if (window._bullseyerDelegationHandler) {
    document.body.removeEventListener('click', window._bullseyerDelegationHandler);
    console.log('[Bullseyer] Alter Delegation-Handler entfernt');
  }
  window._bullseyerDelegationHandler = async function(e) {
    console.log('[Bullseyer] Delegation-Handler ausgeführt - Event:', e.type, 'Target:', e.target.tagName, 'ID:', e.target.id);
    console.log('[Bullseyer] Delegation-Handler Zustand:', {
      target: e.target,
      localBullfinish: window.localBullfinish,
      localSetsWon: window.localSetsWon,
      localLegNo: window.localLegNo,
      localSetNo: window.localSetNo,
      localCurrentPlayer: window.localCurrentPlayer
    });
    // Nur Buttons innerhalb des aktuellen app-Containers
    const appEl = document.getElementById('app');
    if (!appEl || !appEl.contains(e.target)) return;
    const btn = e.target.closest('button');
    if (!btn) {
      console.log('[Bullseyer] Kein Button gefunden - Target:', e.target.tagName);
      return;
    }
    console.log('[Bullseyer] Button-Klick erkannt:', btn.id, 'Classes:', btn.className);
    
    // Ziffernblock-Buttons komplett ausschließen - haben eigene Event-Handler
    const isKeypadBtn = btn.classList.contains('keypad-btn') || btn.id === 'clearBtn' || btn.id === 'backspaceBtn' || btn.id === 'submitScore';
    if (isKeypadBtn) {
      console.log('[Bullseyer] Ziffernblock-Button erkannt - wird von eigenem Handler behandelt');
      return; // Früher Exit, um doppelte Verarbeitung zu vermeiden
    }
    
    // Nur Quick-Score-Buttons behandeln (haben data-score Attribut)
    const hasDataScore = btn.hasAttribute('data-score');
    const isLivescorerButton = hasDataScore;
    
    if (!isLivescorerButton) {
      console.log('[Bullseyer] Button nicht für Livescorer relevant:', btn.id);
      return;
    }
    
    // Quick-Score-Buttons behandeln (haben data-score Attribut)
    if (hasDataScore) {
      console.log('[Bullseyer] Quick-Score Button geklickt:', btn.dataset.score);
      const score = parseInt(btn.dataset.score, 10);

      // Direkt den Score verarbeiten (ohne Formular)
      if (isNaN(score) || score < 0 || score > 180) {
        console.error('[Bullseyer] Ungültiger Score:', score);
        return;
      }

      // Befülle die 3-Dart-Displays mit realistischen Werten
      const dartValues = distributeDarts(score);

      // Prüfe Bust-Bedingungen
      let rem = window.localCurrentPlayer === 'p1' ? window.localRemainingP1 : window.localRemainingP2;
      const newRemaining = rem - score;

      // BUST: Score zu hoch
      if (score > rem) {
        console.log('[Bullseyer] BUST: Score zu hoch (Quick-Score)');
        alert('BUST! Score zu hoch.');
        return;
      }

      // BUST: Remaining = 1
      if (newRemaining === 1) {
        console.log('[Bullseyer] BUST: Remaining = 1 (Quick-Score)');
        alert('BUST! Kann nicht auf 1 finishen.');
        return;
      }

      // BUST: Remaining < 0
      if (newRemaining < 0) {
        console.log('[Bullseyer] BUST: Score unter 0 (Quick-Score)');
        alert('BUST! Score unter 0.');
        return;
      }

      // Double-Out Validierung
      if (newRemaining === 0 && window.currentMatch?.double_out) {
        const lastDart = dartValues[2];
        const isValidDouble = (lastDart >= 2 && lastDart <= 40 && lastDart % 2 === 0) || lastDart === 50;

        if (!isValidDouble) {
          console.log('[Bullseyer] BUST: Kein Double-Out (Quick-Score) - letzter Dart:', lastDart);
          alert('BUST! Muss mit Double finishen.');
          return;
        }

        console.log('[Bullseyer] ✅ Gültiges Double-Out (Quick-Score) mit Dart:', lastDart);
      }

      // Befülle die 3-Dart-Displays
      window.darts[0] = dartValues[0];
      window.darts[1] = dartValues[1];
      window.darts[2] = dartValues[2];
      window.currentDartIndex = 2; // Setze auf letzten Dart
      if (window.updateDartDisplays) window.updateDartDisplays();

      const submitBtn = document.querySelector('#submitScore');
      if (submitBtn) submitBtn.textContent = 'Score eingeben';
      console.log('[Bullseyer] Quick-Score verteilt auf Darts:', dartValues);
      
      // Speichere Wurf im Undo-Stack
      window.throwHistory.push({
        player: window.localCurrentPlayer,
        score,
        remP1: window.localRemainingP1,
        remP2: window.localRemainingP2,
        legsWon: { ...window.localLegsWon },
        setsWon: { ...window.localSetsWon },
        legNo: window.localLegNo,
        setNo: window.localSetNo,
        bullfinish: window.localBullfinish,
        legStarter: window.localLegStarter,
        gameStarter: window.localGameStarter
      });

      // Aktualisiere detaillierte Statistiken
      if (window.updateDetailedStats) window.updateDetailedStats();

      // Speichere Wurf auch in Match-History für persistente Averages
      window.allMatchThrows.push({
        player: window.localCurrentPlayer,
        score,
        legNo: window.localLegNo,
        setNo: window.localSetNo
      });
      
      // Wurf in Supabase speichern
      (async () => {
        try {
          const currentLeg = window._lastRenderArgs?.currentLeg;
          const currentMatch = window.currentMatch;
          const legId = currentLeg?.id || null;
          const playerId = window.localCurrentPlayer === 'p1' ? currentMatch.p1_id : currentMatch.p2_id;
          
          if (!legId || !playerId || !currentMatch) {
            console.warn('[Bullseyer] Fehlende Daten für Wurf-Speicherung:', { legId, playerId, currentMatch });
            return;
          }
          
          const insertObj = {
            id: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : uuidv4()),
            match_id: currentMatch.id,
            leg_id: legId,
            player_id: playerId,
            dart1: dartValues[0] || 0,
            dart2: dartValues[1] || 0,
            dart3: dartValues[2] || 0,
            total: score,
            score: score,
            is_finish: (rem - score === 0),
            order_no: window.throwHistory.length,
            order: window.throwHistory.length,
            created_at: new Date().toISOString()
          };
          
          console.log('[Bullseyer] Insert Throw (Quick-Score):', insertObj);
          const { error, data } = await supabase.from('throws').insert([insertObj]);
          if (error) {
            console.error('[Bullseyer] Supabase Insert Error:', error);
          } else {
            console.log('[Bullseyer] Quick-Score Wurf erfolgreich gespeichert:', data);
          }
        } catch (err) {
          console.error('[Bullseyer] Fehler beim Speichern des Quick-Score Wurfs:', err);
        }
      })();
      
      // Update Restpunkte beim aktuellen Spieler
      if (window.localCurrentPlayer === 'p1') {
        window.localRemainingP1 -= score;
      } else {
        window.localRemainingP2 -= score;
      }
      
      // Spielerwechsel NACH dem Score-Update
      window.localCurrentPlayer = window.localCurrentPlayer === 'p1' ? 'p2' : 'p1';
      
      console.log('[Bullseyer] Quick-Score verarbeitet - Neue Werte:', {
        localRemainingP1: window.localRemainingP1,
        localRemainingP2: window.localRemainingP2,
        localCurrentPlayer: window.localCurrentPlayer
      });
      
      // Synchronisiere auch die lokalen Variablen im renderLiveScorer Scope
      // Das ist wichtig, damit alle Funktionen die aktuellen Werte verwenden
      if (typeof window.syncLocalVars === 'function') {
        window.syncLocalVars();
      }
      
      // UI sofort aktualisieren
      if (typeof window.updateRestpunkteUI === 'function') {
        window.updateRestpunkteUI();
      }
      if (typeof window.updateSetsLegsUI === 'function') {
        window.updateSetsLegsUI();
      }
      if (typeof window.updateAverages === 'function') {
        window.updateAverages(window.throwHistory);
      }
      
      // Leg/Set-Ende prüfen und automatisch behandeln
      if (window.localRemainingP1 === 0 || window.localRemainingP2 === 0) {
        const matchEnded = await handleLegEnd('Quick-Score');
        if (matchEnded) return; // Match beendet - nicht weiter ausführen
      }
      
      return; // Quick-Score-Buttons werden hier behandelt
    }
  };
  document.body.addEventListener('click', window._bullseyerDelegationHandler);
  console.log('[Bullseyer] Delegation-Handler registriert');
})();

// Hilfsfunktion zum Speichern eines Legs
export async function saveLeg(currentMatch, currentLeg, setNo, legNo, remainingP1, bullfinish) {
  const { error } = await supabase.from('legs').update({
    match_id: currentMatch.id,
    set_no: setNo,
    leg_no: legNo,
    starter: currentMatch.p1_id,
    start_score: 501,
    finish_darts: currentLeg.throwCount,
    duration_s: currentLeg.durationSeconds,
    winner_id: remainingP1 === 0 ? currentMatch.p1_id : currentMatch.p2_id,
    bullfinish: !!bullfinish
  }).eq('id', currentLeg.id);
  if (error) {
    console.error('Fehler beim Speichern des Legs:', error);
    alert('Fehler beim Speichern des Legs: ' + (error.message || error.details || error));
  }
}

// Undo-Stack für Würfe und State-Variablen (global, damit sie zwischen Renders erhalten bleiben)
let throwHistory = [];
let allMatchThrows = []; // Persistenter Wurf-Speicher für gesamtes Match
let localRemainingP1 = 501;
let localRemainingP2 = 501;
let localCurrentPlayer = 'p1';
let localLegsWon = { p1: 0, p2: 0 }; // Gewonnene Legs pro Spieler im aktuellen Set
let localSetsWon = { p1: 0, p2: 0 }; // Gewonnene Sets pro Spieler
let localLegNo = 1;
let localSetNo = 1;
let localBullfinish = false;
let localLegSaved = false;
let lastMatchId = null;
let localLegStarter = 'p1'; // Wer das aktuelle Leg gestartet hat
let localGameStarter = null; // Wer das Match gestartet hat (initial null = noch nicht gewählt)

// Helper: Verteile Gesamt-Score auf 3 realistische Darts
function distributeDarts(totalScore) {
  const distributions = {
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

  if (distributions[totalScore]) {
    return distributions[totalScore];
  }

  // Fallback: Verteile gleichmäßig (max 60 pro Dart)
  let remaining = totalScore;
  const result = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    if (remaining >= 60) {
      result[i] = 60;
      remaining -= 60;
    } else {
      result[i] = remaining;
      remaining = 0;
    }
  }

  return result;
}

// Live-Scoring-UI und Logik
export function renderLiveScorer({
  app,
  currentMatch,
  currentSetNo,
  bestSet,
  currentLegNo,
  bestLeg,
  setsWon,
  currentPlayer,
  remainingP1,
  remainingP2,
  isP1Turn,
  bullfinish,
  currentLeg,
  currentLegSaved,
  saveLegFn,
  resetLegFn,
  updateStateFn
}) {
  // Debug: Props und lokale Variablen vor UI-Render
  console.log('[Bullseyer] UI-Render DEBUG:', {
    props: {
      remainingP1,
      remainingP2,
      currentPlayer,
      setsWon,
      currentLegNo,
      currentSetNo,
      bullfinish,
      currentLegSaved
    },
    locals: {
      localRemainingP1,
      localRemainingP2,
      localCurrentPlayer,
      localSetsWon,
      localLegNo,
      localSetNo,
      localBullfinish,
      localLegSaved
    }
  });
  // State-Reset nur bei Matchwechsel!
  if (currentMatch && lastMatchId !== currentMatch.id) {
    throwHistory = [];
    allMatchThrows = []; // Match-Wechsel: Auch Match-History zurücksetzen
    // Nur beim echten Matchwechsel initialisieren, sonst Werte behalten
    lastMatchId = currentMatch.id;
    localGameStarter = null; // Bei neuem Match Startspieler zurücksetzen
  }

  // Synchronisiere lokale Variablen mit window-Variablen, falls diese bereits gesetzt sind
  if (window.localRemainingP1 !== undefined) {
    localRemainingP1 = window.localRemainingP1;
    localRemainingP2 = window.localRemainingP2;
    localCurrentPlayer = window.localCurrentPlayer;
    localLegsWon = window.localLegsWon || { p1: 0, p2: 0 };
    localSetsWon = window.localSetsWon || { p1: 0, p2: 0 };
    localLegNo = window.localLegNo;
    localSetNo = window.localSetNo;
    localBullfinish = window.localBullfinish;
    localLegSaved = window.localLegSaved;
    localLegStarter = window.localLegStarter || 'p1';
    localGameStarter = window.localGameStarter;
    throwHistory = window.throwHistory;
    allMatchThrows = window.allMatchThrows || []; // Match-weite History
    console.log('[Bullseyer] Lokale Variablen mit window-Variablen synchronisiert vor Render');
  }

  // Debug: Werte vor UI-Render
  console.log('[Bullseyer] UI-Render mit:', {
    localRemainingP1,
    localRemainingP2,
    localCurrentPlayer,
    localSetsWon,
    localLegNo,
    localSetNo,
    localBullfinish,
    localLegSaved
  });

  // State-Variablen auf window mappen, damit der globale Handler immer die aktuellen Werte hat
  window.throwHistory = throwHistory;
  window.allMatchThrows = allMatchThrows; // Match-weite Wurf-History
  window.localRemainingP1 = localRemainingP1;
  window.localRemainingP2 = localRemainingP2;
  window.localCurrentPlayer = localCurrentPlayer;
  window.localLegsWon = localLegsWon;
  window.localSetsWon = localSetsWon;
  window.localLegNo = localLegNo;
  window.localSetNo = localSetNo;
  window.localBullfinish = localBullfinish;
  window.localLegSaved = localLegSaved;
  window.localLegStarter = localLegStarter;
  window.localGameStarter = localGameStarter;
  window.currentMatch = currentMatch;
  window.saveLegFn = saveLegFn;
  window.updateStatsSeason = updateStatsSeason;
  window.updateState = updateState;
  window.updateAverages = updateAverages;
  window.updateRestpunkteUI = updateRestpunkteUI;
  window.updateSetsLegsUI = updateSetsLegsUI;
  window.syncLocalVars = syncLocalVars;
  window.updatePlayerIndicator = updatePlayerIndicator;
  window.renderLiveScorer = renderLiveScorer;
  
  // Stelle sicher, dass currentLeg existiert
  if (!currentLeg && currentMatch) {
    currentLeg = resetLeg(currentMatch, localSetNo, localLegNo);
    console.log('[Bullseyer] Neues Leg erstellt:', currentLeg);
  }
  window._lastRenderArgs = {
    app,
    currentMatch,
    currentSetNo: localSetNo,
    bestSet,
    currentLegNo: localLegNo,
    bestLeg,
    setsWon: localLegsWon, // Das sollte die Legs im aktuellen Set sein
    currentPlayer: localCurrentPlayer,
    remainingP1: localRemainingP1,
    remainingP2: localRemainingP2,
    isP1Turn: localCurrentPlayer === 'p1',
    bullfinish: localBullfinish,
    currentLeg,
    currentLegSaved: localLegSaved,
    saveLegFn,
    resetLegFn,
    updateStateFn
  };

  // Average-Elemente sicherstellen - nach dem UI-Aufbau
  let avgP1LegEl = document.getElementById('avgP1Leg');
  let avgP1MatchEl = document.getElementById('avgP1Match');
  let avgP2LegEl = document.getElementById('avgP2Leg');
  let avgP2MatchEl = document.getElementById('avgP2Match');

  // Livescorer-UI: Player-Boxen und Spielstand dynamisch erzeugen, falls sie fehlen
  let player1Box = app.querySelector('.player1-box');
  let player2Box = app.querySelector('.player2-box');
  let backBtn = null;
  if (!player1Box || !player2Box) {
    // Fallback für Spielernamen
    let p1Name = (currentMatch && currentMatch.p1_name) ? currentMatch.p1_name : '[Spieler 1 fehlt]';
    let p2Name = (currentMatch && currentMatch.p2_name) ? currentMatch.p2_name : '[Spieler 2 fehlt]';
    let nameWarn = (!currentMatch || !currentMatch.p1_name || !currentMatch.p2_name)
      ? `<div class='text-red-600 text-center font-bold mb-2'>Achtung: Spielernamen fehlen! Match-Objekt ungültig.</div>`
      : '';
    if (!currentMatch || !currentMatch.p1_name || !currentMatch.p2_name) {
      console.warn('Warnung: currentMatch oder Spielernamen fehlen im Livescorer!', currentMatch);
    }
    app.innerHTML = `
      ${nameWarn}
      <div class="flex flex-row justify-between gap-6 mb-6 items-stretch">
        <button id="backToMatchSelect" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg shadow-md transition-all font-semibold self-start">&larr; Zurück</button>
        <div class="player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 border-4 border-emerald-600 rounded-xl p-6 flex flex-col items-center shadow-xl">
          <div class="text-center font-bold text-2xl text-emerald-900 mb-3">${p1Name}</div>
          <div class="text-sm font-semibold text-center mb-2 text-emerald-800 bg-emerald-200 px-3 py-1.5 rounded-lg" id="avgP1Leg">Leg Ø: -</div>
          <div class="text-sm font-semibold text-center mb-3 text-emerald-800 bg-emerald-300 px-3 py-1.5 rounded-lg" id="avgP1Match">Match Ø: -</div>
          <div class="text-center text-6xl mt-2 font-bold text-emerald-700 tabular-nums" id="restP1">${localRemainingP1}</div>
          <div class="text-sm mt-4 font-semibold text-emerald-800 bg-white px-3 py-1 rounded-full" id="p1SetsDisplay">Sets: ${localSetsWon.p1}/${bestSet}</div>
          <div class="text-sm mt-1 font-semibold text-emerald-800 bg-white px-3 py-1 rounded-full" id="p1LegsDisplay">Legs: ${localLegsWon.p1}/${bestLeg}</div>
        </div>
        <div class="player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 border-4 border-rose-600 rounded-xl p-6 flex flex-col items-center shadow-xl">
          <div class="text-center font-bold text-2xl text-rose-900 mb-3">${p2Name}</div>
          <div class="text-sm font-semibold text-center mb-2 text-rose-800 bg-rose-200 px-3 py-1.5 rounded-lg" id="avgP2Leg">Leg Ø: -</div>
          <div class="text-sm font-semibold text-center mb-3 text-rose-800 bg-rose-300 px-3 py-1.5 rounded-lg" id="avgP2Match">Match Ø: -</div>
          <div class="text-center text-6xl mt-2 font-bold text-rose-700 tabular-nums" id="restP2">${localRemainingP2}</div>
          <div class="text-sm mt-4 font-semibold text-rose-800 bg-white px-3 py-1 rounded-full" id="p2SetsDisplay">Sets: ${localSetsWon.p2}/${bestSet}</div>
          <div class="text-sm mt-1 font-semibold text-rose-800 bg-white px-3 py-1 rounded-full" id="p2LegsDisplay">Legs: ${localLegsWon.p2}/${bestLeg}</div>
        </div>
      </div>

      <!-- Live Statistics Panel -->
      <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 mb-6 shadow-2xl border-2 border-gray-700">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-2xl font-bold text-white flex items-center gap-2">
            📊 Match Statistiken
          </h3>
          <button id="toggleStats" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition">
            <span id="toggleStatsText">Details ▼</span>
          </button>
        </div>

        <div id="statsDetails" class="hidden">
          <div class="grid grid-cols-2 gap-6">
            <!-- Player 1 Stats -->
            <div class="bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 rounded-lg p-4 border-2 border-emerald-600">
              <h4 class="text-lg font-bold text-emerald-300 mb-3 text-center">${p1Name}</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between text-gray-200">
                  <span>🎯 180s:</span>
                  <span id="p1_180s" class="font-bold text-amber-400">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>💯 140+:</span>
                  <span id="p1_140plus" class="font-bold text-emerald-400">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🏆 Highscore:</span>
                  <span id="p1_highscore" class="font-bold text-white">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🎲 Würfe (Leg):</span>
                  <span id="p1_darts_leg" class="font-bold">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🎲 Würfe (Match):</span>
                  <span id="p1_darts_match" class="font-bold">0</span>
                </div>
              </div>
            </div>

            <!-- Player 2 Stats -->
            <div class="bg-gradient-to-br from-rose-900/50 to-rose-800/30 rounded-lg p-4 border-2 border-rose-600">
              <h4 class="text-lg font-bold text-rose-300 mb-3 text-center">${p2Name}</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between text-gray-200">
                  <span>🎯 180s:</span>
                  <span id="p2_180s" class="font-bold text-amber-400">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>💯 140+:</span>
                  <span id="p2_140plus" class="font-bold text-rose-400">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🏆 Highscore:</span>
                  <span id="p2_highscore" class="font-bold text-white">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🎲 Würfe (Leg):</span>
                  <span id="p2_darts_leg" class="font-bold">0</span>
                </div>
                <div class="flex justify-between text-gray-200">
                  <span>🎲 Würfe (Match):</span>
                  <span id="p2_darts_match" class="font-bold">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Startspieler-Auswahl für das erste Leg -->
      ${localGameStarter === null ? `
      <div id="starterSelection" class="bg-gradient-to-r from-amber-100 to-yellow-100 border-4 border-amber-500 rounded-xl p-6 mb-6 text-center shadow-xl">
        <div class="text-2xl font-bold mb-4 text-amber-900">Wer beginnt das erste Leg?</div>
        <div class="flex gap-6 justify-center">
          <button id="startP1" class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${p1Name} beginnt</button>
          <button id="startP2" class="bg-rose-600 hover:bg-rose-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">${p2Name} beginnt</button>
        </div>
      </div>
      ` : ''}
      
      <div class="flex flex-col items-center mb-4">
        <div class="text-lg font-bold mb-6 bg-gray-800 text-white px-6 py-3 rounded-xl shadow-lg">
          Set ${localSetNo}/${bestSet} • Leg ${localLegNo}/${bestLeg}
          ${localGameStarter ? `<span class="ml-4 text-emerald-400">▶ ${localLegStarter === 'p1' ? p1Name : p2Name}</span>` : ''}
        </div>

        <!-- Score-Eingabe Bereich: Ziffernblock und Quick-Scores nebeneinander -->
        <div class="flex gap-6 mb-6">
          <!-- Digitaler Ziffernblock für 3-Dart-Eingabe -->
          <div class="p-6 bg-white rounded-xl border-4 border-gray-300 shadow-xl">
            <div class="text-center mb-4">
              <div class="text-xl font-bold text-gray-800 mb-3">3-Dart-Eingabe</div>
              <div class="flex gap-3 justify-center mb-3">
                <div class="flex flex-col items-center">
                  <div class="text-xs font-semibold text-gray-600 mb-2">DART 1</div>
                  <div id="dart1Display" class="text-3xl font-mono bg-gray-50 border-4 border-emerald-500 rounded-lg px-4 py-3 w-20 text-center shadow-md">0</div>
                  <div class="flex gap-1 mt-2">
                    <button type="button" data-dart="0" data-mult="1" class="mult-btn active bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-blue-600 transition">S</button>
                    <button type="button" data-dart="0" data-mult="2" class="mult-btn bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-emerald-600 transition">D</button>
                    <button type="button" data-dart="0" data-mult="3" class="mult-btn bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-amber-600 transition">T</button>
                  </div>
                </div>
                <div class="flex flex-col items-center">
                  <div class="text-xs font-semibold text-gray-600 mb-2">DART 2</div>
                  <div id="dart2Display" class="text-3xl font-mono bg-gray-50 border-2 border-gray-300 rounded-lg px-4 py-3 w-20 text-center">0</div>
                  <div class="flex gap-1 mt-2">
                    <button type="button" data-dart="1" data-mult="1" class="mult-btn active bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-blue-600 transition">S</button>
                    <button type="button" data-dart="1" data-mult="2" class="mult-btn bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-emerald-600 transition">D</button>
                    <button type="button" data-dart="1" data-mult="3" class="mult-btn bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-amber-600 transition">T</button>
                  </div>
                </div>
                <div class="flex flex-col items-center">
                  <div class="text-xs font-semibold text-gray-600 mb-2">DART 3</div>
                  <div id="dart3Display" class="text-3xl font-mono bg-gray-50 border-2 border-gray-300 rounded-lg px-4 py-3 w-20 text-center">0</div>
                  <div class="flex gap-1 mt-2">
                    <button type="button" data-dart="2" data-mult="1" class="mult-btn active bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-blue-600 transition">S</button>
                    <button type="button" data-dart="2" data-mult="2" class="mult-btn bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-emerald-600 transition">D</button>
                    <button type="button" data-dart="2" data-mult="3" class="mult-btn bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded hover:bg-amber-600 transition">T</button>
                  </div>
                </div>
              </div>
              <div class="text-lg font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-lg">Total: <span id="totalDisplay" class="text-2xl text-emerald-700">0</span></div>
            </div>

            <!-- Ziffernblock -->
            <div class="grid grid-cols-3 gap-3 mb-4">
              <button type="button" data-digit="1" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">1</button>
              <button type="button" data-digit="2" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">2</button>
              <button type="button" data-digit="3" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">3</button>
              <button type="button" data-digit="4" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">4</button>
              <button type="button" data-digit="5" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">5</button>
              <button type="button" data-digit="6" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">6</button>
              <button type="button" data-digit="7" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">7</button>
              <button type="button" data-digit="8" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">8</button>
              <button type="button" data-digit="9" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">9</button>
              <button type="button" id="clearBtn" class="bg-gradient-to-br from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white border-2 border-red-600 rounded-lg text-xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">C</button>
              <button type="button" data-digit="0" class="keypad-btn bg-gradient-to-br from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 border-2 border-slate-300 rounded-lg text-2xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">0</button>
              <button type="button" id="backspaceBtn" class="bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white border-2 border-amber-600 rounded-lg text-xl font-bold py-4 px-5 shadow-md transition-all transform hover:scale-105">⌫</button>
            </div>

            <!-- Submit Button -->
            <button type="button" id="submitScore" class="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xl font-bold py-5 rounded-xl shadow-lg transition-all transform hover:scale-105">Weiter →</button>
          </div>
          
          <!-- Quick-Score Auswahl -->
          <div class="p-6 bg-white rounded-xl border-4 border-gray-300 shadow-xl">
            <div class="text-center mb-4">
              <div class="text-xl font-bold text-gray-800">Schnellauswahl</div>
            </div>
            <div id="quickScores" class="grid grid-cols-3 gap-3">
              <button data-score="26" class="bg-gradient-to-br from-cyan-100 to-cyan-200 hover:from-cyan-200 hover:to-cyan-300 border-2 border-cyan-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">26</button>
              <button data-score="41" class="bg-gradient-to-br from-cyan-100 to-cyan-200 hover:from-cyan-200 hover:to-cyan-300 border-2 border-cyan-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">41</button>
              <button data-score="45" class="bg-gradient-to-br from-cyan-100 to-cyan-200 hover:from-cyan-200 hover:to-cyan-300 border-2 border-cyan-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">45</button>
              <button data-score="60" class="bg-gradient-to-br from-sky-100 to-sky-200 hover:from-sky-200 hover:to-sky-300 border-2 border-sky-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">60</button>
              <button data-score="81" class="bg-gradient-to-br from-sky-100 to-sky-200 hover:from-sky-200 hover:to-sky-300 border-2 border-sky-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">81</button>
              <button data-score="83" class="bg-gradient-to-br from-sky-100 to-sky-200 hover:from-sky-200 hover:to-sky-300 border-2 border-sky-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">83</button>
              <button data-score="85" class="bg-gradient-to-br from-blue-100 to-blue-200 hover:from-blue-200 hover:to-blue-300 border-2 border-blue-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">85</button>
              <button data-score="95" class="bg-gradient-to-br from-blue-100 to-blue-200 hover:from-blue-200 hover:to-blue-300 border-2 border-blue-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">95</button>
              <button data-score="100" class="bg-gradient-to-br from-indigo-100 to-indigo-200 hover:from-indigo-200 hover:to-indigo-300 border-2 border-indigo-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">100</button>
              <button data-score="121" class="bg-gradient-to-br from-purple-100 to-purple-200 hover:from-purple-200 hover:to-purple-300 border-2 border-purple-400 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">121</button>
              <button data-score="140" class="bg-gradient-to-br from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 border-2 border-amber-500 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">140</button>
              <button data-score="180" class="bg-gradient-to-br from-amber-200 to-amber-300 hover:from-amber-300 hover:to-amber-400 border-2 border-amber-600 rounded-lg text-lg font-bold py-3 px-4 shadow-md transition-all transform hover:scale-105">180</button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="p-6 bg-white rounded-xl border-4 border-gray-300 shadow-xl flex flex-col gap-4">
            <div class="text-center">
              <div class="text-xl font-bold text-gray-800 mb-4">Aktionen</div>
            </div>
            <button id="undoBtn" class="bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">⏪ Rückgängig</button>
          </div>
        </div>
      `;
    // Nach dem Einfügen die neuen Elemente referenzieren
    player1Box = app.querySelector('.player1-box');
    player2Box = app.querySelector('.player2-box');
    backBtn = app.querySelector('#backToMatchSelect');
  } else {
    // UI bereits vorhanden - nur Inhalte aktualisieren
    const restP1El = document.getElementById('restP1');
    const restP2El = document.getElementById('restP2');
    if (restP1El) restP1El.textContent = localRemainingP1;
    if (restP2El) restP2El.textContent = localRemainingP2;
    
    // Average-Elemente aktualisieren (falls sie existieren)
    const avgP1LegEl = document.getElementById('avgP1Leg');
    const avgP1MatchEl = document.getElementById('avgP1Match');
    const avgP2LegEl = document.getElementById('avgP2Leg');
    const avgP2MatchEl = document.getElementById('avgP2Match');
    
    // Sicherstellen, dass Average-Elemente den korrekten Text haben
    if (avgP1LegEl && !avgP1LegEl.textContent.includes('Leg: Ø')) {
      avgP1LegEl.textContent = 'Leg: Ø -';
    }
    if (avgP1MatchEl && !avgP1MatchEl.textContent.includes('Match: Ø')) {
      avgP1MatchEl.textContent = 'Match: Ø -';
    }
    if (avgP2LegEl && !avgP2LegEl.textContent.includes('Leg: Ø')) {
      avgP2LegEl.textContent = 'Leg: Ø -';
    }
    if (avgP2MatchEl && !avgP2MatchEl.textContent.includes('Match: Ø')) {
      avgP2MatchEl.textContent = 'Match: Ø -';
    }
    
    // Sets/Legs Anzeige aktualisieren
    const p1SetsEl = document.getElementById('p1SetsDisplay');
    const p1LegsEl = document.getElementById('p1LegsDisplay');
    const p2SetsEl = document.getElementById('p2SetsDisplay');
    const p2LegsEl = document.getElementById('p2LegsDisplay');
    const setLegEl = app.querySelector('.text-sm');
    if (p1SetsEl) p1SetsEl.textContent = `Sets: ${localSetsWon.p1}/${bestSet}`;
    if (p1LegsEl) p1LegsEl.textContent = `Legs: ${localLegsWon.p1}/${bestLeg}`;
    if (p2SetsEl) p2SetsEl.textContent = `Sets: ${localSetsWon.p2}/${bestSet}`;
    if (p2LegsEl) p2LegsEl.textContent = `Legs: ${localLegsWon.p2}/${bestLeg}`;
    if (setLegEl) setLegEl.textContent = `Set ${localSetNo}/${bestSet}   Leg ${localLegNo}/${bestLeg}`;

    // Dart Displays sind bereits mit "0" initialisiert im HTML
    backBtn = app.querySelector('#backToMatchSelect');
  }

  // Helper: Synchronisiere lokale Variablen mit window-Variablen
  function syncLocalVars() {
    localRemainingP1 = window.localRemainingP1;
    localRemainingP2 = window.localRemainingP2;
    localCurrentPlayer = window.localCurrentPlayer;
    localLegsWon = window.localLegsWon || { p1: 0, p2: 0 };
    localSetsWon = window.localSetsWon || { p1: 0, p2: 0 };
    localLegNo = window.localLegNo;
    localSetNo = window.localSetNo;
    localBullfinish = window.localBullfinish;
    localLegSaved = window.localLegSaved;
    localLegStarter = window.localLegStarter || 'p1';
    localGameStarter = window.localGameStarter;
    throwHistory = window.throwHistory;
    allMatchThrows = window.allMatchThrows || []; // Match-weite History
    console.log('[Bullseyer] Lokale Variablen synchronisiert:', {
      localRemainingP1,
      localRemainingP2,
      localCurrentPlayer,
      localLegStarter
    });
  }

  // Helper: Visueller Indikator für aktiven Spieler
  function updatePlayerIndicator() {
    const player1Box = document.querySelector('.player1-box');
    const player2Box = document.querySelector('.player2-box');
    if (!player1Box || !player2Box) return;

    const currentPlayer = window.localCurrentPlayer || localCurrentPlayer;

    if (currentPlayer === 'p1') {
      // P1 ist aktiv: leuchtender emerald Border + Pulseffekt
      player1Box.className = 'player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 border-4 border-emerald-600 rounded-xl p-6 flex flex-col items-center shadow-xl animate-pulse';
      // P2 ist inaktiv: grauer Border + ausgegraut
      player2Box.className = 'player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 border-2 border-gray-300 rounded-xl p-6 flex flex-col items-center opacity-50';
    } else {
      // P2 ist aktiv: leuchtender rose Border + Pulseffekt
      player2Box.className = 'player2-box w-1/2 bg-gradient-to-br from-rose-50 to-rose-100 border-4 border-rose-600 rounded-xl p-6 flex flex-col items-center shadow-xl animate-pulse';
      // P1 ist inaktiv: grauer Border + ausgegraut
      player1Box.className = 'player1-box w-1/2 bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-gray-300 rounded-xl p-6 flex flex-col items-center opacity-50';
    }
  }

  // Helper: State-Update
  function updateState(partial) {
    if (typeof updateStateFn === 'function') updateStateFn(partial);
  }

  // Helper: Average-Berechnung
  function updateAverages(throwHistory) {
    // Leg-Average: Nur Würfe vom aktuellen Leg
    const currentLegThrows = throwHistory.filter(t => t.legNo === localLegNo && t.setNo === localSetNo);
    const legScoresP1 = currentLegThrows.filter(t => t.player === 'p1').map(t => t.score);
    const legScoresP2 = currentLegThrows.filter(t => t.player === 'p2').map(t => t.score);
    
    // Match-Average: Alle Würfe vom gesamten Match aus allMatchThrows
    const matchScoresP1 = allMatchThrows.filter(t => t.player === 'p1').map(t => t.score);
    const matchScoresP2 = allMatchThrows.filter(t => t.player === 'p2').map(t => t.score);
    
    // Berechne Averages
    const legAvgP1 = legScoresP1.length ? (legScoresP1.reduce((a, b) => a + b, 0) / legScoresP1.length).toFixed(2) : '-';
    const legAvgP2 = legScoresP2.length ? (legScoresP2.reduce((a, b) => a + b, 0) / legScoresP2.length).toFixed(2) : '-';
    const matchAvgP1 = matchScoresP1.length ? (matchScoresP1.reduce((a, b) => a + b, 0) / matchScoresP1.length).toFixed(2) : '-';
    const matchAvgP2 = matchScoresP2.length ? (matchScoresP2.reduce((a, b) => a + b, 0) / matchScoresP2.length).toFixed(2) : '-';
    
    // UI-Elemente aktualisieren
    const avgP1LegEl = document.getElementById('avgP1Leg');
    const avgP1MatchEl = document.getElementById('avgP1Match');
    const avgP2LegEl = document.getElementById('avgP2Leg');
    const avgP2MatchEl = document.getElementById('avgP2Match');
    
    if (avgP1LegEl) avgP1LegEl.textContent = `Leg: Ø ${legAvgP1}`;
    if (avgP1MatchEl) avgP1MatchEl.textContent = `Match: Ø ${matchAvgP1}`;
    if (avgP2LegEl) avgP2LegEl.textContent = `Leg: Ø ${legAvgP2}`;
    if (avgP2MatchEl) avgP2MatchEl.textContent = `Match: Ø ${matchAvgP2}`;
  }

  // Helper: Restpunkte-Anzeige aktualisieren
  function updateRestpunkteUI() {
    const restP1El = document.getElementById('restP1');
    const restP2El = document.getElementById('restP2');
    if (!restP1El || !restP2El) {
      // UI fehlt, neu rendern
      if (typeof window.renderLiveScorer === 'function') {
        window.renderLiveScorer(window._lastRenderArgs);
      }
      return;
    }
    // Verwende die aktuellen window-Variablen, da diese von den Quick-Score-Buttons aktualisiert werden
    const currentP1 = window.localRemainingP1 !== undefined ? window.localRemainingP1 : localRemainingP1;
    const currentP2 = window.localRemainingP2 !== undefined ? window.localRemainingP2 : localRemainingP2;
    restP1El.textContent = currentP1;
    restP2El.textContent = currentP2;
    console.log('[Bullseyer] UI aktualisiert - P1:', currentP1, 'P2:', currentP2);

    // Aktualisiere auch den Player-Indicator
    if (typeof window.updatePlayerIndicator === 'function') {
      window.updatePlayerIndicator();
    }
  }

  // Helper: Sets/Legs Anzeige aktualisieren
  function updateSetsLegsUI() {
    const p1SetsEl = document.getElementById('p1SetsDisplay');
    const p1LegsEl = document.getElementById('p1LegsDisplay');
    const p2SetsEl = document.getElementById('p2SetsDisplay');
    const p2LegsEl = document.getElementById('p2LegsDisplay');
    const setLegEl = app.querySelector('.text-sm');
    
    // Verwende die aktuellen window-Variablen
    const currentSetsWon = window.localSetsWon || localSetsWon;
    const currentLegsWon = window.localLegsWon || localLegsWon;
    const currentSetNo = window.localSetNo || localSetNo;
    const currentLegNo = window.localLegNo || localLegNo;
    
    // Nur die spezifischen Sets/Legs-Elemente aktualisieren, NICHT die Average-Elemente
    if (p1SetsEl && p1SetsEl.id === 'p1SetsDisplay') p1SetsEl.textContent = `Sets: ${currentSetsWon.p1}/${bestSet}`;
    if (p1LegsEl && p1LegsEl.id === 'p1LegsDisplay') p1LegsEl.textContent = `Legs: ${currentLegsWon.p1}/${bestLeg}`;
    if (p2SetsEl && p2SetsEl.id === 'p2SetsDisplay') p2SetsEl.textContent = `Sets: ${currentSetsWon.p2}/${bestSet}`;
    if (p2LegsEl && p2LegsEl.id === 'p2LegsDisplay') p2LegsEl.textContent = `Legs: ${currentLegsWon.p2}/${bestLeg}`;
    if (setLegEl) setLegEl.textContent = `Set ${currentSetNo}/${bestSet}   Leg ${currentLegNo}/${bestLeg}`;
    
    // Sicherstellen, dass Average-Elemente NICHT überschrieben werden
    const avgP1LegEl = document.getElementById('avgP1Leg');
    const avgP1MatchEl = document.getElementById('avgP1Match');
    const avgP2LegEl = document.getElementById('avgP2Leg');
    const avgP2MatchEl = document.getElementById('avgP2Match');
    
    // Falls Average-Elemente versehentlich überschrieben wurden, korrigieren
    if (avgP1LegEl && !avgP1LegEl.textContent.includes('Leg: Ø')) {
      avgP1LegEl.textContent = 'Leg: Ø -';
    }
    if (avgP1MatchEl && !avgP1MatchEl.textContent.includes('Match: Ø')) {
      avgP1MatchEl.textContent = 'Match: Ø -';
    }
    if (avgP2LegEl && !avgP2LegEl.textContent.includes('Leg: Ø')) {
      avgP2LegEl.textContent = 'Leg: Ø -';
    }
    if (avgP2MatchEl && !avgP2MatchEl.textContent.includes('Match: Ø')) {
      avgP2MatchEl.textContent = 'Match: Ø -';
    }
    
    console.log('[Bullseyer] Sets/Legs UI aktualisiert:', {
      setsWon: currentSetsWon,
      legsWon: currentLegsWon,
      setNo: currentSetNo,
      legNo: currentLegNo
    });
  }

  // Average-Elemente sind jetzt direkt im HTML Template enthalten
  // Keine dynamische Erstellung mehr nötig

  // Average-Elemente nach dem HTML-Aufbau explizit referenzieren
  avgP1LegEl = document.getElementById('avgP1Leg');
  avgP1MatchEl = document.getElementById('avgP1Match');
  avgP2LegEl = document.getElementById('avgP2Leg');
  avgP2MatchEl = document.getElementById('avgP2Match');

  // Average beim initialen Rendern anzeigen (NACH dem Erstellen der Elemente)
  updateAverages(throwHistory);
  
  // Restpunkte-Anzeige NACH dem Render aktualisieren
  setTimeout(updateRestpunkteUI, 0);
  setTimeout(updateSetsLegsUI, 0);
  
  // Sicherstellen, dass Averages nach allem anderen gesetzt werden
  setTimeout(() => {
    updateAverages(throwHistory);
  }, 10);

  // Player-Indicator beim initialen Render setzen
  setTimeout(updatePlayerIndicator, 15);

  // Setze den Seitentitel auf Livescorer
  document.title = 'Livescorer';

  // Header-Logo ausblenden für Livescoring
  const mainHeader = document.getElementById('mainHeader');
  if (mainHeader) {
    mainHeader.style.display = 'none';
  }

  // Event-Handler nach jedem Render neu setzen
  // 1. Startspieler-Auswahl (nur beim ersten Leg)
  const startP1Btn = app.querySelector('#startP1');
  const startP2Btn = app.querySelector('#startP2');
  const starterSelection = app.querySelector('#starterSelection');
  
  // Deaktiviere Eingabe-Bereich, wenn noch kein Startspieler gewählt wurde
  const inputArea = app.querySelector('.flex.gap-4.mb-4');
  if (localGameStarter === null && inputArea) {
    inputArea.style.opacity = '0.5';
    inputArea.style.pointerEvents = 'none';
  }
  
  if (startP1Btn && startP2Btn) {
    startP1Btn.addEventListener('click', () => {
      localGameStarter = 'p1';
      localLegStarter = 'p1';
      localCurrentPlayer = 'p1';
      window.localGameStarter = localGameStarter;
      window.localLegStarter = localLegStarter;
      window.localCurrentPlayer = localCurrentPlayer;
      
      // Startspieler-Auswahl ausblenden und Eingabe-Bereich aktivieren
      if (starterSelection) starterSelection.style.display = 'none';
      if (inputArea) {
        inputArea.style.opacity = '1';
        inputArea.style.pointerEvents = 'auto';
      }
      
      // UI aktualisieren
      renderLiveScorer(window._lastRenderArgs);
      console.log('[Bullseyer] Startspieler gewählt: P1');
    });
    
    startP2Btn.addEventListener('click', () => {
      localGameStarter = 'p2';
      localLegStarter = 'p2';
      localCurrentPlayer = 'p2';
      window.localGameStarter = localGameStarter;
      window.localLegStarter = localLegStarter;
      window.localCurrentPlayer = localCurrentPlayer;
      
      // Startspieler-Auswahl ausblenden und Eingabe-Bereich aktivieren
      if (starterSelection) starterSelection.style.display = 'none';
      if (inputArea) {
        inputArea.style.opacity = '1';
        inputArea.style.pointerEvents = 'auto';
      }
      
      // UI aktualisieren
      renderLiveScorer(window._lastRenderArgs);
      console.log('[Bullseyer] Startspieler gewählt: P2');
    });
  }
  
  // 2. 3-Dart-Eingabe - nur einmal pro Session initialisieren
  const dart1Display = app.querySelector('#dart1Display');
  const dart2Display = app.querySelector('#dart2Display');
  const dart3Display = app.querySelector('#dart3Display');
  const totalDisplay = app.querySelector('#totalDisplay');
  const dartDisplays = [dart1Display, dart2Display, dart3Display];

  const keypadBtns = app.querySelectorAll('.keypad-btn');
  const clearBtn = app.querySelector('#clearBtn');
  const backspaceBtn = app.querySelector('#backspaceBtn');
  const submitScoreBtn = app.querySelector('#submitScore');
  const quickScores = app.querySelector('#quickScores');
  const undoBtn = app.querySelector('#undoBtn');

  // 3-Dart-Eingabe State (pro Render) - im window-Objekt speichern für Quick-Score-Handler
  window.currentDartIndex = 0; // 0=Dart1, 1=Dart2, 2=Dart3
  window.darts = [0, 0, 0]; // Die 3 Dart-Werte
  window.dartMultipliers = window.dartMultipliers || [1, 1, 1]; // Die 3 Multiplier (1=Single, 2=Double, 3=Triple)
  let currentDartIndex = window.currentDartIndex;
  let darts = window.darts;

  // Helper: Aktualisiere Dart-Displays und Highlight
  function updateDartDisplays() {
    dartDisplays.forEach((display, i) => {
      if (display) {
        const value = window.darts[i];
        const mult = window.dartMultipliers[i];

        // Prefix je nach Multiplier
        let prefix = '';
        if (value > 0) {
          if (mult === 2) prefix = 'D';
          else if (mult === 3) prefix = 'T';
          else prefix = 'S';
        }

        display.textContent = value > 0 ? prefix + value : value;

        // Highlight current dart
        if (i === window.currentDartIndex) {
          display.classList.add('border-2', 'border-blue-500');
          display.classList.remove('border');
        } else {
          display.classList.remove('border-2', 'border-blue-500');
          display.classList.add('border');
        }
      }
    });
    if (totalDisplay) {
      // Berechne Total mit Multipliers
      const total = (window.darts[0] * window.dartMultipliers[0]) +
                    (window.darts[1] * window.dartMultipliers[1]) +
                    (window.darts[2] * window.dartMultipliers[2]);
      totalDisplay.textContent = total;
    }
  }
  window.updateDartDisplays = updateDartDisplays;

  // Helper: Aktualisiere detaillierte Statistiken
  function updateDetailedStats() {
    const currentThrowHistory = window.throwHistory || [];

    // Initialisiere Stats
    const stats = {
      p1: { count180: 0, count140Plus: 0, highScore: 0, dartsLeg: 0, dartsMatch: 0 },
      p2: { count180: 0, count140Plus: 0, highScore: 0, dartsLeg: 0, dartsMatch: 0 }
    };

    // Berechne Stats aus der Throw-History
    currentThrowHistory.forEach(th => {
      const player = th.player;
      const score = th.score;

      if (player === 'p1' || player === 'p2') {
        stats[player].dartsMatch += 3; // Jeder Wurf = 3 Darts

        if (score === 180) stats[player].count180++;
        if (score >= 140) stats[player].count140Plus++;
        if (score > stats[player].highScore) stats[player].highScore = score;
      }
    });

    // Darts im aktuellen Leg (seit letztem Leg-Start)
    let dartsLegP1 = 0, dartsLegP2 = 0;
    for (let i = currentThrowHistory.length - 1; i >= 0; i--) {
      const th = currentThrowHistory[i];
      if (th.legStart) break; // Leg-Start gefunden
      if (th.player === 'p1') dartsLegP1 += 3;
      if (th.player === 'p2') dartsLegP2 += 3;
    }
    stats.p1.dartsLeg = dartsLegP1;
    stats.p2.dartsLeg = dartsLegP2;

    // Aktualisiere UI
    const statP1_180 = app.querySelector('#statP1_180');
    const statP1_140 = app.querySelector('#statP1_140');
    const statP1_high = app.querySelector('#statP1_high');
    const statP1_dartsLeg = app.querySelector('#statP1_dartsLeg');
    const statP1_dartsMatch = app.querySelector('#statP1_dartsMatch');

    const statP2_180 = app.querySelector('#statP2_180');
    const statP2_140 = app.querySelector('#statP2_140');
    const statP2_high = app.querySelector('#statP2_high');
    const statP2_dartsLeg = app.querySelector('#statP2_dartsLeg');
    const statP2_dartsMatch = app.querySelector('#statP2_dartsMatch');

    if (statP1_180) statP1_180.textContent = stats.p1.count180;
    if (statP1_140) statP1_140.textContent = stats.p1.count140Plus;
    if (statP1_high) statP1_high.textContent = stats.p1.highScore;
    if (statP1_dartsLeg) statP1_dartsLeg.textContent = stats.p1.dartsLeg;
    if (statP1_dartsMatch) statP1_dartsMatch.textContent = stats.p1.dartsMatch;

    if (statP2_180) statP2_180.textContent = stats.p2.count180;
    if (statP2_140) statP2_140.textContent = stats.p2.count140Plus;
    if (statP2_high) statP2_high.textContent = stats.p2.highScore;
    if (statP2_dartsLeg) statP2_dartsLeg.textContent = stats.p2.dartsLeg;
    if (statP2_dartsMatch) statP2_dartsMatch.textContent = stats.p2.dartsMatch;
  }
  window.updateDetailedStats = updateDetailedStats;

  // Prüfe, ob Ziffernblock bereits initialisiert wurde
  const keypadContainer = app.querySelector('.grid.grid-cols-3.gap-3.mb-4');
  if (keypadContainer && !keypadContainer.hasAttribute('data-bullseyer-initialized')) {
    keypadContainer.setAttribute('data-bullseyer-initialized', 'true');
    
    // Ziffernblock Event-Handler - nur einmal hinzufügen
    if (keypadBtns) {
      keypadBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Verhindere Event-Bubbling
          const digit = btn.getAttribute('data-digit');
          let currentValue = window.darts[window.currentDartIndex];
          console.log('[Bullseyer] Ziffernblock-Klick:', digit, 'Dart', window.currentDartIndex + 1, 'Wert:', currentValue);

          // Baue neuen Wert auf
          if (currentValue === 0) {
            window.darts[window.currentDartIndex] = parseInt(digit);
          } else {
            const newValue = parseInt(currentValue.toString() + digit);
            // Max 60 pro Dart (T20 = Triple 20)
            if (newValue <= 60) {
              window.darts[window.currentDartIndex] = newValue;
            }
          }

          updateDartDisplays();
          console.log('[Bullseyer] Dart', window.currentDartIndex + 1, 'Wert:', window.darts[window.currentDartIndex]);
        });
      });
    }

    // Multiplier Buttons (S/D/T) - nur einmal hinzufügen
    const multBtns = app.querySelectorAll('.mult-btn');
    if (multBtns) {
      multBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dartIndex = parseInt(btn.getAttribute('data-dart'));
          const mult = parseInt(btn.getAttribute('data-mult'));

          // Setze Multiplier für diesen Dart
          window.dartMultipliers[dartIndex] = mult;

          // Update Button-Styles: Nur der geklickte Button bekommt "active"-Highlight
          const dartGroup = btn.parentElement;
          dartGroup.querySelectorAll('.mult-btn').forEach(b => {
            if (b === btn) {
              b.classList.add('ring-2', 'ring-white', 'ring-offset-2');
            } else {
              b.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
            }
          });

          updateDartDisplays();
          console.log('[Bullseyer] Multiplier gesetzt - Dart', dartIndex + 1, 'Mult:', mult);
        });
      });
    }

    // Clear Button - nur einmal hinzufügen
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.darts = [0, 0, 0];
        window.dartMultipliers = [1, 1, 1];
        window.currentDartIndex = 0;

        // Reset Multiplier-Button Highlights
        app.querySelectorAll('.mult-btn').forEach(btn => {
          const mult = parseInt(btn.getAttribute('data-mult'));
          if (mult === 1) {
            btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
          } else {
            btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
          }
        });

        updateDartDisplays();
        console.log('[Bullseyer] Clear-Button geklickt - Alle Darts zurückgesetzt');
      });
    }

    // Backspace Button - nur einmal hinzufügen
    if (backspaceBtn) {
      backspaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let currentValue = window.darts[window.currentDartIndex];
        if (currentValue >= 10) {
          // Entferne letzte Ziffer
          window.darts[window.currentDartIndex] = Math.floor(currentValue / 10);
        } else {
          window.darts[window.currentDartIndex] = 0;
        }
        updateDartDisplays();
        console.log('[Bullseyer] Backspace-Button geklickt - Dart', window.currentDartIndex + 1, 'Wert:', window.darts[window.currentDartIndex]);
      });
    }

    // Submit Score Button - nur einmal hinzufügen
    if (submitScoreBtn) {
      submitScoreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        // Wenn noch nicht alle 3 Darts eingegeben: Springe zum nächsten Dart
        if (window.currentDartIndex < 2) {
          window.currentDartIndex++;
          updateDartDisplays();
          submitScoreBtn.textContent = window.currentDartIndex === 2 ? 'Score eingeben' : 'Weiter →';
          console.log('[Bullseyer] Nächster Dart:', window.currentDartIndex + 1);
          return;
        }

        // Alle 3 Darts eingegeben - jetzt submitten
        const score = (window.darts[0] * window.dartMultipliers[0]) +
                      (window.darts[1] * window.dartMultipliers[1]) +
                      (window.darts[2] * window.dartMultipliers[2]);
        console.log('[Bullseyer] 3-Dart-Submit:', window.darts, 'Multipliers:', window.dartMultipliers, 'Total:', score);

        if (isNaN(score) || score < 0 || score > 180) {
          if (totalDisplay) {
            totalDisplay.style.color = '#dc2626'; // red-600
            setTimeout(() => totalDisplay.style.color = '', 1000);
          }
          return;
        }

        // Verwende die aktuellen window-Variablen
        const currentP1 = window.localCurrentPlayer;
        const currentRemainingP1 = window.localRemainingP1;
        const currentRemainingP2 = window.localRemainingP2;
        const currentMatch = window.currentMatch;
        const currentSetsWon = window.localSetsWon;
        const currentLegNo = window.localLegNo;
        const currentSetNo = window.localSetNo;
        const currentBullfinish = window.localBullfinish;
        const currentLegSaved = window.localLegSaved;
        const currentThrowHistory = window.throwHistory;
        
        console.log('[Bullseyer] Ziffernblock verwendet aktuelle Werte:', {
          currentP1,
          currentRemainingP1,
          currentRemainingP2,
          score
        });
        
        // Prüfe Bust-Bedingungen
        let rem = currentP1 === 'p1' ? currentRemainingP1 : currentRemainingP2;
        const newRemaining = rem - score;

        // BUST Bedingung 1: Score zu hoch
        if (score > rem) {
          console.log('[Bullseyer] BUST: Score zu hoch -', score, 'Remaining:', rem);
          if (totalDisplay) {
            totalDisplay.style.color = '#dc2626'; // red-600
            setTimeout(() => totalDisplay.style.color = '', 1000);
          }
          // Zeige BUST-Nachricht
          alert('BUST! Score zu hoch.');
          // Dart-Eingabe zurücksetzen
          window.darts = [0, 0, 0];
          window.dartMultipliers = [1, 1, 1];
          window.currentDartIndex = 0;

          // Reset Multiplier-Button Highlights
          app.querySelectorAll('.mult-btn').forEach(btn => {
            const mult = parseInt(btn.getAttribute('data-mult'));
            if (mult === 1) {
              btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
            } else {
              btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
            }
          });

          updateDartDisplays();
          submitScoreBtn.textContent = 'Weiter →';
          // Spieler wechseln ohne Score zu ändern
          window.localCurrentPlayer = currentP1 === 'p1' ? 'p2' : 'p1';
          renderLiveScorer(window._lastRenderArgs);
          return;
        }

        // BUST Bedingung 2: Remaining = 1 (kann nicht mit Double finishen)
        if (newRemaining === 1) {
          console.log('[Bullseyer] BUST: Remaining = 1 (unmöglich zu finishen)');
          if (totalDisplay) {
            totalDisplay.style.color = '#dc2626'; // red-600
            setTimeout(() => totalDisplay.style.color = '', 1000);
          }
          alert('BUST! Kann nicht auf 1 finishen (nur Double möglich).');
          window.darts = [0, 0, 0];
          window.dartMultipliers = [1, 1, 1];
          window.currentDartIndex = 0;

          // Reset Multiplier-Button Highlights
          app.querySelectorAll('.mult-btn').forEach(btn => {
            const mult = parseInt(btn.getAttribute('data-mult'));
            if (mult === 1) {
              btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
            } else {
              btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
            }
          });

          updateDartDisplays();
          submitScoreBtn.textContent = 'Weiter →';
          window.localCurrentPlayer = currentP1 === 'p1' ? 'p2' : 'p1';
          renderLiveScorer(window._lastRenderArgs);
          return;
        }

        // BUST Bedingung 3: Remaining < 0
        if (newRemaining < 0) {
          console.log('[Bullseyer] BUST: Score unter 0 -', newRemaining);
          if (totalDisplay) {
            totalDisplay.style.color = '#dc2626'; // red-600
            setTimeout(() => totalDisplay.style.color = '', 1000);
          }
          alert('BUST! Score unter 0.');
          window.darts = [0, 0, 0];
          window.dartMultipliers = [1, 1, 1];
          window.currentDartIndex = 0;

          // Reset Multiplier-Button Highlights
          app.querySelectorAll('.mult-btn').forEach(btn => {
            const mult = parseInt(btn.getAttribute('data-mult'));
            if (mult === 1) {
              btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
            } else {
              btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
            }
          });

          updateDartDisplays();
          submitScoreBtn.textContent = 'Weiter →';
          window.localCurrentPlayer = currentP1 === 'p1' ? 'p2' : 'p1';
          renderLiveScorer(window._lastRenderArgs);
          return;
        }

        // Double-Out Validierung: Bei Finish (remaining = 0) prüfe ob letzter Dart ein Double ist
        if (newRemaining === 0 && currentMatch?.double_out) {
          // Prüfe den Multiplier des 3. Darts (Index 2)
          const lastDartMultiplier = window.dartMultipliers[2];
          const lastDartValue = window.darts[2];

          // Gültiges Double: Multiplier muss 2 sein
          const isValidDouble = lastDartMultiplier === 2;

          if (!isValidDouble) {
            console.log('[Bullseyer] BUST: Kein Double-Out - letzter Dart:', lastDartValue, 'Multiplier:', lastDartMultiplier);
            if (totalDisplay) {
              totalDisplay.style.color = '#dc2626'; // red-600
              setTimeout(() => totalDisplay.style.color = '', 1000);
            }
            alert('BUST! Muss mit Double finishen (D-Button drücken).');
            window.darts = [0, 0, 0];
            window.dartMultipliers = [1, 1, 1];
            window.currentDartIndex = 0;

            // Reset Multiplier-Button Highlights
            app.querySelectorAll('.mult-btn').forEach(btn => {
              const mult = parseInt(btn.getAttribute('data-mult'));
              if (mult === 1) {
                btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
              } else {
                btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
              }
            });

            updateDartDisplays();
            submitScoreBtn.textContent = 'Weiter →';
            window.localCurrentPlayer = currentP1 === 'p1' ? 'p2' : 'p1';
            renderLiveScorer(window._lastRenderArgs);
            return;
          }

          console.log('[Bullseyer] ✅ Gültiges Double-Out mit Dart:', lastDartValue, 'Multiplier:', lastDartMultiplier);
        }
        
        // Speichere Wurf im Undo-Stack
        currentThrowHistory.push({
          player: currentP1,
          score,
          remP1: currentRemainingP1,
          remP2: currentRemainingP2,
          legsWon: { ...window.localLegsWon },
          setsWon: { ...window.localSetsWon },
          legNo: currentLegNo,
          setNo: currentSetNo,
          bullfinish: currentBullfinish,
          legStarter: window.localLegStarter,
          gameStarter: window.localGameStarter
        });
        
        // Speichere Wurf auch in Match-History für persistente Averages
        window.allMatchThrows.push({
          player: currentP1,
          score,
          legNo: currentLegNo,
          setNo: currentSetNo
        });
        
        // DB-Speicherung (wie beim Formular)
        try {
          const legId = currentLeg?.id || null;
          const playerId = currentP1 === 'p1' ? currentMatch.p1_id : currentMatch.p2_id;
          
          console.log('[Bullseyer] Ziffernblock DB-Speicherung - Validierung:', {
            legId,
            playerId,
            currentMatch: !!currentMatch,
            currentLeg: !!currentLeg
          });
          
          // Erweiterte Validierung mit besserer Fehlerbehandlung
          if (!currentMatch?.id) {
            console.error('[Bullseyer] currentMatch fehlt oder ungültig:', currentMatch);
            // Trotzdem Score verarbeiten, nur DB-Speicherung überspringen
          } else if (!legId) {
            console.error('[Bullseyer] currentLeg fehlt oder ungültig:', currentLeg);
            // Erstelle ein neues Leg, falls keines vorhanden
            const newLeg = resetLeg(currentMatch, currentSetNo, currentLegNo);
            window._lastRenderArgs.currentLeg = newLeg;
            console.log('[Bullseyer] Neues Leg für Ziffernblock erstellt:', newLeg);
            // Verwende die neue Leg-ID
            const insertObj = {
              id: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : uuidv4()),
              match_id: currentMatch.id,
              leg_id: newLeg.id,
              player_id: playerId,
              dart1: window.darts[0] || 0,
              dart2: window.darts[1] || 0,
              dart3: window.darts[2] || 0,
              total: score,
              score: score,
              is_finish: (rem - score === 0),
              order_no: currentThrowHistory.length,
              order: currentThrowHistory.length,
              created_at: new Date().toISOString()
            };

            console.log('[Bullseyer] Insert Throw (3-Dart) mit neuer Leg-ID:', insertObj);
            const { error, data } = await supabase.from('throws').insert([insertObj]);
            if (error) {
              console.error('Supabase Insert Error:', error);
            } else {
              console.log('[Bullseyer] 3-Dart-Wurf erfolgreich gespeichert:', data);
            }
          } else {
            // Normale Speicherung mit vorhandener Leg-ID
            const insertObj = {
              id: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : uuidv4()),
              match_id: currentMatch.id,
              leg_id: legId,
              player_id: playerId,
              dart1: window.darts[0] || 0,
              dart2: window.darts[1] || 0,
              dart3: window.darts[2] || 0,
              total: score,
              score: score,
              is_finish: (rem - score === 0),
              order_no: currentThrowHistory.length,
              order: currentThrowHistory.length,
              created_at: new Date().toISOString()
            };
            
            console.log('[Bullseyer] Insert Throw (3-Dart):', insertObj);
            const { error, data } = await supabase.from('throws').insert([insertObj]);
            if (error) {
              console.error('Supabase Insert Error:', error);
            } else {
              console.log('[Bullseyer] 3-Dart-Wurf erfolgreich gespeichert:', data);
            }
          }
        } catch (err) {
          console.error('Fehler beim Speichern des Wurfs:', err);
          // Nicht abbrechen wegen DB-Fehler, Score trotzdem verarbeiten
        }
        
        // Update Restpunkte beim aktuellen Spieler
        if (currentP1 === 'p1') {
          window.localRemainingP1 -= score;
        } else {
          window.localRemainingP2 -= score;
        }
        
        // Spielerwechsel NACH dem Score-Update
        window.localCurrentPlayer = currentP1 === 'p1' ? 'p2' : 'p1';
        
        // Aktualisiere throwHistory
        window.throwHistory = currentThrowHistory;
        window.localLegSaved = currentLegSaved;

        // Aktualisiere detaillierte Statistiken
        if (window.updateDetailedStats) window.updateDetailedStats();

        // Synchronisiere die lokalen Variablen
        if (typeof window.syncLocalVars === 'function') {
          window.syncLocalVars();
        }
        
        console.log('[Bullseyer] 3-Dart-Score verarbeitet - Neue Werte:', {
          localRemainingP1: window.localRemainingP1,
          localRemainingP2: window.localRemainingP2,
          localCurrentPlayer: window.localCurrentPlayer
        });

        // Dart-Eingabe zurücksetzen für nächsten Wurf
        window.darts = [0, 0, 0];
        window.dartMultipliers = [1, 1, 1];
        window.currentDartIndex = 0;

        // Reset Multiplier-Button Highlights
        app.querySelectorAll('.mult-btn').forEach(btn => {
          const mult = parseInt(btn.getAttribute('data-mult'));
          if (mult === 1) {
            btn.classList.add('ring-2', 'ring-white', 'ring-offset-2');
          } else {
            btn.classList.remove('ring-2', 'ring-white', 'ring-offset-2');
          }
        });

        updateDartDisplays();
        submitScoreBtn.textContent = 'Weiter →';

        // Leg/Set-Ende prüfen und automatisch behandeln
        if (window.localRemainingP1 === 0 || window.localRemainingP2 === 0) {
          const matchEnded = await handleLegEnd('3-Dart-Eingabe');
          if (matchEnded) return; // Match beendet - nicht weiter ausführen
          return; // Leg beendet - nicht weiter ausführen
        }
        
        updateState({
          remainingP1: window.localRemainingP1,
          remainingP2: window.localRemainingP2,
          currentPlayer: window.localCurrentPlayer,
          setsWon: window.localLegsWon, // Das ist für die UI
          currentLegNo: window.localLegNo,
          currentSetNo: window.localSetNo,
          bullfinish: window.localBullfinish,
          currentLegSaved: window.localLegSaved
        });
        updateRestpunkteUI();
        updateSetsLegsUI();
        updateAverages(window.throwHistory);
        
        console.log('[Bullseyer] Ziffernblock-Score beendet - Finale Werte:', {
          localRemainingP1: window.localRemainingP1,
          localRemainingP2: window.localRemainingP2,
          localCurrentPlayer: window.localCurrentPlayer,
          localSetsWon: window.localSetsWon,
          localLegNo: window.localLegNo,
          localSetNo: window.localSetNo,
          localBullfinish: window.localBullfinish,
          localLegSaved: window.localLegSaved
        });
        
        // UI sofort aktualisieren
        updateRestpunkteUI();
        updateSetsLegsUI();
      });
    }
  }

  // Quick-Score-Buttons (werden vom Delegation-Handler behandelt)
  // Undo-Button - nur hinzufügen, wenn noch nicht initialisiert  
  const undoContainer = undoBtn?.parentElement;
  if (undoBtn && undoContainer && !undoContainer.hasAttribute('data-bullseyer-undo-initialized')) {
    undoContainer.setAttribute('data-bullseyer-undo-initialized', 'true');
    
    const handleUndo = () => {
      if (throwHistory.length === 0) return;
      const last = throwHistory.pop();
      localCurrentPlayer = last.player;
      localRemainingP1 = last.remP1;
      localRemainingP2 = last.remP2;
      localLegsWon = { ...last.legsWon };
      localSetsWon = { ...last.setsWon };
      localLegNo = last.legNo;
      localSetNo = last.setNo;
      localBullfinish = last.bullfinish;
      localLegStarter = last.legStarter || localLegStarter;
      localGameStarter = last.gameStarter || localGameStarter;
      
      // Window-Variablen aktualisieren
      window.localCurrentPlayer = localCurrentPlayer;
      window.localRemainingP1 = localRemainingP1;
      window.localRemainingP2 = localRemainingP2;
      window.localLegsWon = localLegsWon;
      window.localSetsWon = localSetsWon;
      window.localLegNo = localLegNo;
      window.localSetNo = localSetNo;
      window.localBullfinish = localBullfinish;
      window.localLegStarter = localLegStarter;
      window.localGameStarter = localGameStarter;
      window.throwHistory = throwHistory;
      
      // State-Update
      updateState({
        remainingP1: localRemainingP1,
        remainingP2: localRemainingP2,
        currentPlayer: localCurrentPlayer,
        setsWon: localLegsWon, // Das ist für die UI
        currentLegNo: localLegNo,
        currentSetNo: localSetNo,
        bullfinish: localBullfinish
      });
      // Average nach Undo aktualisieren
      updateAverages(throwHistory);
      if (window.updateDetailedStats) window.updateDetailedStats();
      updateRestpunkteUI();
      updateSetsLegsUI();
      console.log('[Bullseyer] Render-Call nach Undo:', {
        localRemainingP1,
        localRemainingP2,
        localCurrentPlayer,
        localSetsWon,
        localLegNo,
        localSetNo,
        localBullfinish,
        localLegSaved,
        localLegStarter
      });
      renderLiveScorer({
        app,
        currentMatch,
        currentSetNo: localSetNo,
        bestSet,
        currentLegNo: localLegNo,
        bestLeg,
        setsWon: localLegsWon, // Das ist für die UI
        currentPlayer: localCurrentPlayer,
        remainingP1: localRemainingP1,
        remainingP2: localRemainingP2,
        isP1Turn: localCurrentPlayer === 'p1',
        bullfinish: localBullfinish,
        currentLeg,
        currentLegSaved: localLegSaved,
        saveLegFn,
        resetLegFn,
        updateStateFn
      });
    };
    undoBtn.removeEventListener('click', handleUndo);
    undoBtn.addEventListener('click', handleUndo);
  }

  // Toggle Stats Button
  const toggleStatsBtn = app.querySelector('#toggleStats');
  if (toggleStatsBtn) {
    toggleStatsBtn.addEventListener('click', () => {
      const statsDetails = app.querySelector('#statsDetails');
      const toggleText = app.querySelector('#toggleStatsText');

      if (statsDetails && toggleText) {
        if (statsDetails.classList.contains('hidden')) {
          statsDetails.classList.remove('hidden');
          toggleText.textContent = 'Details ▲';
        } else {
          statsDetails.classList.add('hidden');
          toggleText.textContent = 'Details ▼';
        }
      }
    });
  }

  // Zurück-Button
  if (backBtn) {
    backBtn.onclick = () => {
      if (typeof window.removeDebugOverlay === 'function') {
        window.removeDebugOverlay();
      }
      if (typeof updateStateFn === 'function') {
        updateStateFn({ currentMatch: null });
      }
      if (window.currentMatch !== undefined) {
        window.currentMatch = null;
      }
      localStorage.removeItem('bullseyer_currentMatchId');
      if (app && app.innerHTML !== undefined) app.innerHTML = '';
      
      // Header-Logo wieder einblenden
      const mainHeader = document.getElementById('mainHeader');
      if (mainHeader) {
        mainHeader.style.display = 'block';
      }
      
      setTimeout(() => { window.location.hash = '#/scorer'; }, 50);
    };
  }
}

// Universelle UUID-Funktion (Fallback für crypto.randomUUID)
function uuidv4() {
  // https://stackoverflow.com/a/2117523/2228771
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Optional: resetLeg als Hilfsfunktion exportieren, falls benötigt
export function resetLeg(currentMatch, currentSetNo, currentLegNo) {
  const currentLeg = new Leg({ legId: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : uuidv4()), doubleIn: false, doubleOut: true });
  // Leg sofort mit Minimaldaten in DB anlegen, damit Foreign Key für throws existiert
  (async () => {
    try {
      const { error } = await supabase.from('legs').insert({
        id: currentLeg.id,
        match_id: currentMatch?.id || null,
        set_no: currentSetNo || 1,
        leg_no: currentLegNo || 1,
        starter: currentMatch?.p1_id || null,
        start_score: 501
      });
      if (error) {
        console.error('Fehler beim Anlegen des Legs:', error);
      }
    } catch (err) {
      console.error('Fehler beim Anlegen des Legs:', err);
    }
  })();
  return currentLeg;
}

// Prüft, ob das Match gewonnen wurde (z.B. Best-of-3-Sets: 2 Sets gewonnen)
function checkMatchEnd(setsWon, bestSet) {
  const setsToWin = Math.ceil(bestSet / 2);
  if (setsWon.p1 >= setsToWin) return 'p1';
  if (setsWon.p2 >= setsToWin) return 'p2';
  return null;
}

// Beendet das Match: Datenbank-Update, Stats speichern, UI anzeigen
async function finishMatch(currentMatch, winner, setsWon, allMatchThrows) {
  const winnerId = winner === 'p1' ? currentMatch.p1_id : currentMatch.p2_id;

  console.log('[Bullseyer] Match beendet! Gewinner:', winner, 'Winner-ID:', winnerId);

  try {
    // 1. Match als beendet markieren
    const { error: matchError } = await supabase.from('matches').update({
      finished_at: new Date().toISOString(),
      winner_id: winnerId
    }).eq('id', currentMatch.id);

    if (matchError) {
      console.error('[Bullseyer] Fehler beim Match-Update:', matchError);
      alert('Fehler beim Speichern des Match-Endes: ' + matchError.message);
      return false;
    }

    // 2. Season-Stats aktualisieren
    await updateMatchStats(currentMatch, winner, setsWon, allMatchThrows);

    // 3. Match aus localStorage entfernen
    localStorage.removeItem('bullseyer_currentMatchId');

    // 4. Match-End-Screen anzeigen
    showMatchEndScreen(currentMatch, winner, setsWon, allMatchThrows);

    return true;
  } catch (err) {
    console.error('[Bullseyer] Fehler beim Match-Abschluss:', err);
    alert('Fehler beim Beenden des Matches: ' + (err.message || err));
    return false;
  }
}

// Aktualisiert die Season-Stats für beide Spieler nach Match-Ende
async function updateMatchStats(currentMatch, winner, setsWon, allMatchThrows) {
  for (const player of ['p1', 'p2']) {
    const playerId = player === 'p1' ? currentMatch.p1_id : currentMatch.p2_id;
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

      console.log('[Bullseyer] Stats aktualisiert für Spieler', playerId, stats);
    } catch (err) {
      console.error('[Bullseyer] Fehler beim Stats-Update für', playerId, err);
    }
  }
}

// Zeigt den Match-End-Screen an
function showMatchEndScreen(currentMatch, winner, setsWon, allMatchThrows) {
  const app = document.getElementById('app');
  if (!app) return;

  const winnerName = winner === 'p1' ? currentMatch.p1_name : currentMatch.p2_name;
  const loserName = winner === 'p1' ? currentMatch.p2_name : currentMatch.p1_name;
  const winnerColor = winner === 'p1' ? 'emerald' : 'rose';

  // Match-Stats berechnen
  const p1Throws = allMatchThrows.filter(t => t.player === 'p1');
  const p2Throws = allMatchThrows.filter(t => t.player === 'p2');

  const p1Avg = p1Throws.length ? (p1Throws.reduce((s, t) => s + t.score, 0) / p1Throws.length).toFixed(2) : '0.00';
  const p2Avg = p2Throws.length ? (p2Throws.reduce((s, t) => s + t.score, 0) / p2Throws.length).toFixed(2) : '0.00';

  const p1_180s = p1Throws.filter(t => t.score === 180).length;
  const p2_180s = p2Throws.filter(t => t.score === 180).length;

  const p1_140s = p1Throws.filter(t => t.score >= 140).length;
  const p2_140s = p2Throws.filter(t => t.score >= 140).length;

  const p1HighScore = p1Throws.length ? Math.max(...p1Throws.map(t => t.score)) : 0;
  const p2HighScore = p2Throws.length ? Math.max(...p2Throws.map(t => t.score)) : 0;

  const p1Darts = p1Throws.length * 3; // Annahme: jeder Throw = 3 Darts
  const p2Darts = p2Throws.length * 3;

  app.innerHTML = `
    <div class="max-w-4xl mx-auto mt-8 p-8 bg-gradient-to-br from-${winnerColor}-50 via-white to-${winnerColor}-50 rounded-2xl shadow-2xl border-4 border-${winnerColor}-400">
      <!-- Gewinner-Banner -->
      <div class="text-center mb-8 p-6 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-xl shadow-lg">
        <div class="text-5xl mb-3">🏆</div>
        <h1 class="text-5xl font-bold text-gray-900 mb-3">${winnerName}</h1>
        <p class="text-3xl font-semibold text-gray-800">gewinnt das Match!</p>
        <p class="text-2xl font-bold text-gray-700 mt-2">${setsWon.p1} : ${setsWon.p2} Sets</p>
      </div>

      <!-- Statistiken-Tabelle -->
      <div class="bg-white rounded-xl p-6 mb-6 shadow-xl border-2 border-gray-200">
        <h2 class="text-3xl font-bold mb-6 text-center text-gray-800">Match-Statistiken</h2>
        <div class="grid grid-cols-3 gap-6">
          <!-- Header -->
          <div class="text-center font-bold text-xl text-emerald-700 pb-3 border-b-2 border-emerald-300">${currentMatch.p1_name}</div>
          <div class="text-center font-bold text-xl text-gray-600 pb-3 border-b-2 border-gray-300">Statistik</div>
          <div class="text-center font-bold text-xl text-rose-700 pb-3 border-b-2 border-rose-300">${currentMatch.p2_name}</div>

          <!-- Sets -->
          <div class="text-center text-3xl font-bold text-emerald-600">${setsWon.p1}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Sets gewonnen</div>
          <div class="text-center text-3xl font-bold text-rose-600">${setsWon.p2}</div>

          <!-- 3-Dart Average -->
          <div class="text-center text-2xl font-bold text-emerald-700">${p1Avg}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Ø 3-Dart</div>
          <div class="text-center text-2xl font-bold text-rose-700">${p2Avg}</div>

          <!-- Höchster Score -->
          <div class="text-center text-2xl font-bold ${p1HighScore === 180 ? 'text-amber-600' : 'text-emerald-600'}">${p1HighScore}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Höchster Score</div>
          <div class="text-center text-2xl font-bold ${p2HighScore === 180 ? 'text-amber-600' : 'text-rose-600'}">${p2HighScore}</div>

          <!-- 180s -->
          <div class="text-center text-2xl font-bold ${p1_180s > 0 ? 'text-amber-600' : 'text-gray-400'}">${p1_180s}</div>
          <div class="text-center text-lg font-semibold text-gray-600">180er</div>
          <div class="text-center text-2xl font-bold ${p2_180s > 0 ? 'text-amber-600' : 'text-gray-400'}">${p2_180s}</div>

          <!-- 140+ -->
          <div class="text-center text-xl font-bold text-emerald-600">${p1_140s}</div>
          <div class="text-center text-lg font-semibold text-gray-600">140+ Scores</div>
          <div class="text-center text-xl font-bold text-rose-600">${p2_140s}</div>

          <!-- Darts geworfen -->
          <div class="text-center text-lg font-semibold text-gray-700">${p1Darts}</div>
          <div class="text-center text-lg font-semibold text-gray-600">Darts geworfen</div>
          <div class="text-center text-lg font-semibold text-gray-700">${p2Darts}</div>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-6 justify-center">
        <button id="backToDashboard" class="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">
          ← Dashboard
        </button>
        <button id="exportMatch" class="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-105">
          📊 Export
        </button>
      </div>
    </div>
  `;

  // Event-Handler
  document.getElementById('backToDashboard').onclick = () => {
    window.location.hash = '#/dashboard';
  };

  document.getElementById('exportMatch').onclick = () => {
    alert('Export-Funktion wird in Phase 4 implementiert');
    // TODO: Export-Funktion aufrufen
  };

  // Header-Logo wieder einblenden
  const mainHeader = document.getElementById('mainHeader');
  if (mainHeader) mainHeader.style.display = 'block';
}

// Statistiken nach Leg-Ende aktualisieren (stats_season)
async function updateStatsSeason(currentMatch, throwHistory, setNo, legNo, remainingP1, remainingP2, bullfinish) {
  // Hilfsfunktionen für Statistiken
  function calcAvg(player) {
    const scores = throwHistory.filter(t => t.player === player).map(t => t.score);
    return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }
  function countHighs(player, min) {
    return throwHistory.filter(t => t.player === player && t.score >= min).length;
  }
  function getHighFinish(player) {
    // Höchster letzter Score eines Legs
    const scores = throwHistory.filter(t => t.player === player).map(t => t.score);
    return scores.length ? Math.max(...scores) : 0;
  }
  function isShortGame(player) {
    // Short Game: Leg in <=15 Darts
    return throwHistory.filter(t => t.player === player).length <= 5;
  }
  // Für beide Spieler aktualisieren
  for (const player of ['p1', 'p2']) {
    const playerId = player === 'p1' ? currentMatch.p1_id : currentMatch.p2_id;
    const avg3 = calcAvg(player) * 3;
    const _180s = countHighs(player, 180);
    const _140s = countHighs(player, 140);
    const _100s = countHighs(player, 100);
    const high_finish = getHighFinish(player);
    const short_games = isShortGame(player) ? 1 : 0;
    const bull_finishes = bullfinish ? 1 : 0;
    // Update oder Insert in stats_season
    try {
      // Hole bestehenden Eintrag
      const { data, error } = await supabase.from('stats_season').select('*').eq('player_id', playerId).single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = Not found
      const stats = data || {
        player_id: playerId,
        avg3: 0,
        legs_won: 0,
        sets_won: 0,
        high_finish: 0,
        bull_finishes: 0,
        short_games: 0,
        _180s: 0,
        _140s: 0,
        _100s: 0
      };
      stats._180s += _180s;
      stats._140s += _140s;
      stats._100s += _100s;
      // Upsert
      await supabase.from('stats_season').upsert(stats, { onConflict: ['player_id'] });
    } catch (err) {
      console.error('Fehler beim Aktualisieren der Statistiken:', err);
      alert('Fehler beim Aktualisieren der Statistiken: ' + (err.message || err.details || err));
    }
  }
}
