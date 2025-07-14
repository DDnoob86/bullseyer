import { supabase } from './supabase.js';
import { Leg } from './scorer.js';

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
      
      // Prüfe, ob der Score möglich ist
      let rem = window.localCurrentPlayer === 'p1' ? window.localRemainingP1 : window.localRemainingP2;
      if (score > rem) {
        console.log('[Bullseyer] Score zu hoch:', score, 'Remaining:', rem);
        return;
      }
      
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
            dart1: score,
            dart2: null,
            dart3: null,
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
        // Leg automatisch beenden
        console.log('[Bullseyer] Leg beendet - automatischer Übergang ins nächste Leg');
        
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
          // Set gewonnen - Erhöhe Set-Zähler und Reset für neues Set
          if (window.localLegsWon.p1 >= bestLeg) {
            window.localSetsWon.p1++;
          } else {
            window.localSetsWon.p2++;
          }
          console.log('[Bullseyer] Set automatisch gewonnen durch', legWinner);
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
      <div class="flex flex-row justify-between gap-4 mb-4 items-center">
        <button id="backToMatchSelect" class="bg-gray-400 px-3 py-1 rounded">&larr; Zurück</button>
        <div class="player1-box w-1/2 bg-blue-50 border-2 border-blue-300 rounded-lg p-4 flex flex-col items-center">
          <div class="text-center font-semibold text-lg text-blue-900">${p1Name}</div>
          <div class="text-sm font-bold text-center mb-1 text-blue-800 bg-blue-100 px-2 py-1 rounded" id="avgP1Leg">Leg: Ø -</div>
          <div class="text-sm font-bold text-center mb-1 text-blue-800 bg-blue-200 px-2 py-1 rounded" id="avgP1Match">Match: Ø -</div>
          <div class="text-center text-4xl mt-2 font-bold text-blue-600" id="restP1">${localRemainingP1}</div>
          <div class="text-xs mt-1 text-blue-700" id="p1SetsDisplay">Sets: ${localSetsWon.p1}/${bestSet}</div>
          <div class="text-xs text-blue-700" id="p1LegsDisplay">Legs: ${localLegsWon.p1}/${bestLeg}</div>
        </div>
        <div class="player2-box w-1/2 bg-red-50 border-2 border-red-300 rounded-lg p-4 flex flex-col items-center">
          <div class="text-center font-semibold text-lg text-red-900">${p2Name}</div>
          <div class="text-sm font-bold text-center mb-1 text-red-800 bg-red-100 px-2 py-1 rounded" id="avgP2Leg">Leg: Ø -</div>
          <div class="text-sm font-bold text-center mb-1 text-red-800 bg-red-200 px-2 py-1 rounded" id="avgP2Match">Match: Ø -</div>
          <div class="text-center text-4xl mt-2 font-bold text-red-600" id="restP2">${localRemainingP2}</div>
          <div class="text-xs mt-1 text-red-700" id="p2SetsDisplay">Sets: ${localSetsWon.p2}/${bestSet}</div>
          <div class="text-xs text-red-700" id="p2LegsDisplay">Legs: ${localLegsWon.p2}/${bestLeg}</div>
        </div>
      </div>
      
      <!-- Startspieler-Auswahl für das erste Leg -->
      ${localGameStarter === null ? `
      <div id="starterSelection" class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-4 text-center">
        <div class="text-lg font-bold mb-3">Wer soll das erste Leg beginnen?</div>
        <div class="flex gap-4 justify-center">
          <button id="startP1" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">${p1Name} beginnt</button>
          <button id="startP2" class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-bold">${p2Name} beginnt</button>
        </div>
      </div>
      ` : ''}
      
      <div class="flex flex-col items-center mb-2">
        <div class="text-sm mb-4">Set ${localSetNo}/${bestSet} &nbsp; Leg ${localLegNo}/${bestLeg} &nbsp; 
          ${localGameStarter ? `<span class="text-green-600">⬆ ${localLegStarter === 'p1' ? p1Name : p2Name} ist dran</span>` : ''}
        </div>
        
        <!-- Score-Eingabe Bereich: Ziffernblock und Quick-Scores nebeneinander -->
        <div class="flex gap-4 mb-4">
          <!-- Digitaler Ziffernblock für Score-Eingabe -->
          <div class="p-4 bg-white rounded-lg border-2 border-gray-300">
            <div class="text-center mb-2">
              <div class="text-lg font-bold">Score eingeben</div>
              <div id="scoreDisplay" class="text-3xl font-mono bg-gray-100 border rounded px-4 py-2 min-w-[120px] text-center">0</div>
            </div>
            
            <!-- Ziffernblock -->
            <div class="grid grid-cols-3 gap-2 mb-3">
              <button type="button" data-digit="1" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">1</button>
              <button type="button" data-digit="2" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">2</button>
              <button type="button" data-digit="3" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">3</button>
              <button type="button" data-digit="4" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">4</button>
              <button type="button" data-digit="5" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">5</button>
              <button type="button" data-digit="6" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">6</button>
              <button type="button" data-digit="7" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">7</button>
              <button type="button" data-digit="8" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">8</button>
              <button type="button" data-digit="9" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">9</button>
              <button type="button" id="clearBtn" class="bg-red-100 hover:bg-red-200 border rounded text-lg font-bold py-3 px-4">C</button>
              <button type="button" data-digit="0" class="keypad-btn bg-blue-100 hover:bg-blue-200 border rounded text-xl font-bold py-3 px-4">0</button>
              <button type="button" id="backspaceBtn" class="bg-yellow-100 hover:bg-yellow-200 border rounded text-lg font-bold py-3 px-4">⌫</button>
            </div>
            
            <!-- Submit Button -->
            <button type="button" id="submitScore" class="w-full bg-green-500 hover:bg-green-600 text-white text-xl font-bold py-4 rounded">Score eingeben</button>
          </div>
          
          <!-- Quick-Score Auswahl -->
          <div class="p-4 bg-white rounded-lg border-2 border-gray-300">
            <div class="text-center mb-3">
              <div class="text-lg font-bold">Schnellauswahl</div>
            </div>
            <div id="quickScores" class="grid grid-cols-3 gap-2">
              <button data-score="26" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">26</button>
              <button data-score="41" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">41</button>
              <button data-score="45" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">45</button>
              <button data-score="60" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">60</button>
              <button data-score="81" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">81</button>
              <button data-score="83" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">83</button>
              <button data-score="85" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">85</button>
              <button data-score="95" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">95</button>
              <button data-score="100" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">100</button>
              <button data-score="121" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">121</button>
              <button data-score="140" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">140</button>
              <button data-score="180" class="bg-blue-100 hover:bg-blue-200 border rounded text-lg font-bold py-3 px-4">180</button>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="p-4 bg-white rounded-lg border-2 border-gray-300 flex flex-col gap-3">
            <div class="text-center mb-1">
              <div class="text-lg font-bold">Aktionen</div>
            </div>
            <button id="undoBtn" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-bold">⏪ Rückgängig</button>
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
    
    // Score Display zurücksetzen
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (scoreDisplay) scoreDisplay.textContent = '0';
    
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
  
  // 2. Ziffernblock für Score-Eingabe - nur einmal pro Session initialisieren
  const scoreDisplay = app.querySelector('#scoreDisplay');
  const keypadBtns = app.querySelectorAll('.keypad-btn');
  const clearBtn = app.querySelector('#clearBtn');
  const backspaceBtn = app.querySelector('#backspaceBtn');
  const submitScoreBtn = app.querySelector('#submitScore');
  const quickScores = app.querySelector('#quickScores');
  const undoBtn = app.querySelector('#undoBtn');

  // Prüfe, ob Ziffernblock bereits initialisiert wurde
  const keypadContainer = app.querySelector('.grid.grid-cols-3.gap-2.mb-3');
  if (keypadContainer && !keypadContainer.hasAttribute('data-bullseyer-initialized')) {
    keypadContainer.setAttribute('data-bullseyer-initialized', 'true');
    
    // Ziffernblock Event-Handler - nur einmal hinzufügen
    if (keypadBtns && scoreDisplay) {
      keypadBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); // Verhindere Event-Bubbling
          const digit = btn.getAttribute('data-digit');
          let currentValue = scoreDisplay.textContent;
          console.log('[Bullseyer] Ziffernblock-Klick:', digit, 'Aktueller Wert:', currentValue);
          if (currentValue === '0') {
            scoreDisplay.textContent = digit;
          } else if (currentValue.length < 3) {
            const newValue = parseInt(currentValue + digit);
            if (newValue <= 180) {
              scoreDisplay.textContent = newValue.toString();
            }
          }
          console.log('[Bullseyer] Neuer Wert nach Klick:', scoreDisplay.textContent);
        });
      });
    }

    // Clear Button - nur einmal hinzufügen
    if (clearBtn && scoreDisplay) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scoreDisplay.textContent = '0';
        console.log('[Bullseyer] Clear-Button geklickt - Score zurückgesetzt');
      });
    }

    // Backspace Button - nur einmal hinzufügen
    if (backspaceBtn && scoreDisplay) {
      backspaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let currentValue = scoreDisplay.textContent;
        if (currentValue.length > 1) {
          scoreDisplay.textContent = currentValue.slice(0, -1);
        } else {
          scoreDisplay.textContent = '0';
        }
        console.log('[Bullseyer] Backspace-Button geklickt - Neuer Wert:', scoreDisplay.textContent);
      });
    }

    // Submit Score Button - nur einmal hinzufügen
    if (submitScoreBtn && scoreDisplay) {
      submitScoreBtn.addEventListener('click', async (e) => {        e.stopPropagation();
        const score = parseInt(scoreDisplay.textContent);
        console.log('[Bullseyer] Ziffernblock-Submit:', score);
        
        if (isNaN(score) || score < 0 || score > 180) {
          scoreDisplay.style.backgroundColor = '#fecaca'; // red-200
          setTimeout(() => scoreDisplay.style.backgroundColor = '#f3f4f6', 1000); // gray-100
          return;
        }
        
        // Verwende die aktuellen window-Variablen
        const currentP1 = window.localCurrentPlayer;
        const currentRemainingP1 = window.localRemainingP1;
        const currentRemainingP2 = window.localRemainingP2;
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
        
        // Prüfe, ob der Score möglich ist
        let rem = currentP1 === 'p1' ? currentRemainingP1 : currentRemainingP2;
        if (score > rem) {
          console.log('[Bullseyer] Score zu hoch - Ziffernblock:', score, 'Remaining:', rem);
          scoreDisplay.style.backgroundColor = '#fecaca'; // red-200
          setTimeout(() => scoreDisplay.style.backgroundColor = '#f3f4f6', 1000); // gray-100
          return;
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
              dart1: score,
              dart2: null,
              dart3: null,
              total: score,
              score: score,
              is_finish: (rem - score === 0),
              order_no: currentThrowHistory.length,
              order: currentThrowHistory.length,
              created_at: new Date().toISOString()
            };
            
            console.log('[Bullseyer] Insert Throw (Ziffernblock) mit neuer Leg-ID:', insertObj);
            const { error, data } = await supabase.from('throws').insert([insertObj]);
            if (error) {
              console.error('Supabase Insert Error:', error);
            } else {
              console.log('[Bullseyer] Ziffernblock-Wurf erfolgreich gespeichert:', data);
            }
          } else {
            // Normale Speicherung mit vorhandener Leg-ID
            const insertObj = {
              id: (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : uuidv4()),
              match_id: currentMatch.id,
              leg_id: legId,
              player_id: playerId,
              dart1: score,
              dart2: null,
              dart3: null,
              total: score,
              score: score,
              is_finish: (rem - score === 0),
              order_no: currentThrowHistory.length,
              order: currentThrowHistory.length,
              created_at: new Date().toISOString()
            };
            
            console.log('[Bullseyer] Insert Throw (Ziffernblock):', insertObj);
            const { error, data } = await supabase.from('throws').insert([insertObj]);
            if (error) {
              console.error('Supabase Insert Error:', error);
            } else {
              console.log('[Bullseyer] Ziffernblock-Wurf erfolgreich gespeichert:', data);
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
        
        // Synchronisiere die lokalen Variablen
        if (typeof window.syncLocalVars === 'function') {
          window.syncLocalVars();
        }
        
        console.log('[Bullseyer] Ziffernblock-Score verarbeitet - Neue Werte:', {
          localRemainingP1: window.localRemainingP1,
          localRemainingP2: window.localRemainingP2,
          localCurrentPlayer: window.localCurrentPlayer
        });
        
        // Score Display zurücksetzen
        scoreDisplay.textContent = '0';
        
        // Leg/Set-Ende prüfen und automatisch behandeln
        if (window.localRemainingP1 === 0 || window.localRemainingP2 === 0) {
          // Leg automatisch beenden
          console.log('[Bullseyer] Leg beendet - automatischer Übergang ins nächste Leg (Ziffernblock)');
          
          // Leg in Datenbank speichern
          if (currentMatch && currentLeg) {
            try {
              await saveLeg(currentMatch, currentLeg, window.localSetNo, window.localLegNo, window.localRemainingP1, false);
              console.log('[Bullseyer] Leg automatisch gespeichert (Ziffernblock)');
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
            // Set gewonnen - Erhöhe Set-Zähler und Reset für neues Set
            if (window.localLegsWon.p1 >= bestLeg) {
              window.localSetsWon.p1++;
            } else {
              window.localSetsWon.p2++;
            }
            console.log('[Bullseyer] Set automatisch gewonnen durch', legWinner, '(Ziffernblock)');
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
          
          console.log('[Bullseyer] Neues Leg automatisch gestartet (Ziffernblock) - Leg', window.localLegNo, 'Set', window.localSetNo, 'Starter:', window.localLegStarter);
          
          // Erstelle neues Leg für die Datenbank
          const newLeg = resetLeg(currentMatch, window.localSetNo, window.localLegNo);
          window._lastRenderArgs.currentLeg = newLeg;
          
          // UI aktualisieren
          if (typeof window.syncLocalVars === 'function') {
            window.syncLocalVars();
          }
          if (typeof window.updateSetsLegsUI === 'function') {
            window.updateSetsLegsUI();
          }
          
          // Score Display zurücksetzen
          scoreDisplay.textContent = '0';
          
          // UI für neues Leg neu rendern
          setTimeout(() => {
            if (typeof window.renderLiveScorer === 'function') {
              window.renderLiveScorer(window._lastRenderArgs);
            }
          }, 100);
          
          return; // Beende hier, da Leg automatisch beendet wurde
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
