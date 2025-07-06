// js/scorer.js

export class Leg {
  constructor({ legId, startingScore = 501, doubleIn = false, doubleOut = true }) {
    this.id = legId;
    this.startingScore = startingScore;
    this.doubleIn = doubleIn;
    this.doubleOut = doubleOut;
    this.scores = []; // { playerId, darts: [v1, v2, v3], remaining }
    this.startTime = Date.now();
    this.winner = null;
  }

  addThrow({ playerId, darts }) {
    const total = darts.reduce((a, v) => a + v, 0);
    const prev = this.currentScore(playerId);
    const remaining = prev - total;

    // Bust: Wurf ignorieren, wenn Rest < 0
    if (remaining < 0) return;

    // Double-In: Erstes Leg nur mit Doppel starten
    if (this.scores.length === 0 && this.doubleIn) {
      const openedWithDouble = darts.some(v => v % 2 === 0);
      if (!openedWithDouble) {
        // ungültiges Öffnen → ignorieren
        return;
      }
    }

    this.scores.push({ playerId, darts, remaining });

    // Double-Out: Letzter Dart muss ein Doppel sein
    const lastDart = darts[darts.length - 1];
    if (remaining === 0) {
      if (this.doubleOut && lastDart % 2 !== 0) {
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
    const lastEntry = [...this.scores].reverse().find(s => s.playerId === playerId);
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
    // durchschnitt auf 3 Darts hochgerechnet
    return (totalScore / (this.scores.length)).toFixed(2);
  }
}