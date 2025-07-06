// Fisher‑Yates Shuffle → zufällige Startreihenfolge (optional)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ~~(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateRoundRobin(players) {
  if (players.length % 2) players.push(null); // bye
  const n = players.length;
  const half = n / 2;
  const rounds = n - 1;
  const schedule = [];

  let p = players.slice();
  for (let r = 0; r < rounds; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const home = p[i];
      const away = p[n - 1 - i];
      if (home && away) round.push([home, away]);
    }
    schedule.push(round);
    p = [p[0], ...p.slice(-1), ...p.slice(1, -1)]; // rotate clock‑wise
  }
  return schedule;
}