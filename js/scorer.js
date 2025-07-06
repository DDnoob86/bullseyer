export class Leg {
  constructor({ legId, startingScore = 501, doubleIn = false, doubleOut = true }) {
    this.id = legId;
    this.startingScore = startingScore;
    this.doubleIn = doubleIn;
    this.doubleOut = doubleOut;
    this.scores = []; // {playerId, darts:[v1,v2,v3], remaining}
    this.startTime = Date.now();
    this.winner = null;
  }

  addThrow({ playerId, darts }) {
    const total = darts.reduce((a, v) => a + v, 0);
    const prev = this.currentScore(playerId);
    const remaining = prev - total;
    // Handle bust / double‑in/out etc. here …
    this.scores.push({ playerId, darts, remaining });
    if (remaining === 0 /* plus Double‑Out Check */) {
      this.winner = playerId;
      this.endTime = Date.now();
    }
  }

  currentScore(playerId) {
    const last = [...this.scores].reverse().find(s => s.playerId === playerId);
    return last ? last.remaining : this.startingScore;
  }

  get durationSeconds() {
    return this.winner ? Math.round((this.endTime - this.startTime) / 1000) : null;
  }
}