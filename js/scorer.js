// js/scorer.js

export class Leg {
  constructor({ legId, startingScore = 501, doubleIn = false, doubleOut = true, skipDoubleValidation = true }) {
    this.id = legId;
    this.startingScore = startingScore;
    this.doubleIn = doubleIn;
    this.doubleOut = doubleOut;
    this.skipDoubleValidation = skipDoubleValidation; // true = Simple Mode, false = Advanced Mode mit echter Double-Validierung
    this.scores = []; // { playerId, darts: [v1, v2, v3], remaining }
    this.startTime = Date.now();
    this.winner = null;
  }

  addThrow({ playerId, darts }) {
    const total = darts.reduce((a, v) => a + v, 0);
    const prev = this.currentScore(playerId);
    const remaining = prev - total;

    // Bust: Wurf ignorieren, wenn Rest < 0 oder === 1 (unmöglich zu finishen)
    if (remaining < 0 || remaining === 1) return;

    // Double-In: Erstes Leg nur mit Doppel starten (nur im Advanced Mode)
    if (!this.skipDoubleValidation && this.scores.length === 0 && this.doubleIn) {
      // TODO: Echte Double-Erkennung für Advanced Mode (erfordert Dart-Details wie "D20")
      // Temporär deaktiviert - wird in Phase 2 implementiert
      const openedWithDouble = darts.some(v => v % 2 === 0);
      if (!openedWithDouble) {
        // ungültiges Öffnen → ignorieren
        return;
      }
    }

    this.scores.push({ playerId, darts, remaining });

    // Double-Out: Letzter Dart muss ein Doppel sein (nur im Advanced Mode)
    const lastDart = darts[darts.length - 1];
    if (remaining === 0) {
      if (!this.skipDoubleValidation && this.doubleOut && lastDart % 2 !== 0) {
        // TODO: Echte Double-Erkennung für Advanced Mode
        // Temporär: Simple Mode erlaubt jedes Finish
        // ungültiges Auschecken → Bust
        this.scores.pop();
        return;
      }
      this.winner = playerId;
      this.endTime = Date.now();
    }
  }

  currentScore(playerId) {
    // Gibt den letzten Restscore für playerId zurück oder startingScore
    const lastEntry = this.scores.slice().reverse().find(s => s.playerId === playerId);
    return lastEntry ? lastEntry.remaining : this.startingScore;
  }

  get durationSeconds() {
    if (!this.winner) return null;
    return Math.round((this.endTime - this.startTime) / 1000);
  }

  get throwCount() {
    return this.scores.length;
  }

  get threeDartAverage() {
    if (!this.scores.length) return null;
    const totalScore = this.scores
      .reduce((sum, s) => sum + s.darts.reduce((a, b) => a + b, 0), 0);
    // 3-Dart-Average: Annahme dass jeder Wurf 3 Darts ist (wird in Advanced Mode präziser)
    // Formel: (Gesamtpunktzahl / Anzahl Würfe) = Average pro Wurf = 3-Dart-Average
    // Im Simple Mode ist jeder Score ein "Wurf" von 3 Darts
    return (totalScore / this.scores.length).toFixed(2);
  }
}