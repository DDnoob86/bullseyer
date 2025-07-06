import { login, signUp, logout } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';
import { exportGameDay } from './export.js';

// -----------------------------
// Mini-Router (#/login, #/dashboard, #/scorer, #/stats)
// -----------------------------
const routes = { login: renderLogin, register: renderRegister, dashboard: renderDashboard, scorer: renderScorer, stats: renderStats };
window.addEventListener('hashchange', updateRoute);
updateRoute();
function updateRoute() {
  const hash = window.location.hash.slice(2) || 'login';
  (routes[hash] || renderLogin)();
}

// --------------------------------------------------
// 1) LOGIN / REGISTRIERUNG
// --------------------------------------------------
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="loginForm" class="max-w-sm mx-auto flex flex-col gap-4 mt-8">
      <input name="email" type="email" placeholder="E-Mail" class="input" required />
      <input name="pw" type="password" placeholder="Passwort" class="input" required />
      <button class="btn">Login</button>
      <p class="text-sm text-center">Noch kein Konto? <a href="#/register">Registrieren</a></p>
    </form>`;
  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const { email, pw: password } = e.target.elements;
    try {
      await login({ email: email.value.trim(), password: password.value });
      window.location.hash = '#/dashboard';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="regForm" class="max-w-sm mx-auto flex flex-col gap-4 mt-8">
      <input name="name" type="text" placeholder="Anzeigename" class="input" required />
      <input name="email" type="email" placeholder="E-Mail" class="input" required />
      <input name="pw" type="password" placeholder="Passwort" class="input" required />
      <button class="btn">Konto erstellen</button>
      <p class="text-sm text-center">Bereits registriert? <a href="#/login">Login</a></p>
    </form>`;
  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.pw.value;
    try {
      let { user } = await signUp({ email, password, displayName: name });
      if (!user) {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      }
      if (!user) {
        alert('Bitte E-Mail bestätigen.');
        return;
      }
      const { error } = await supabase.from('users').insert({ id: user.id, name });
      if (error) throw error;
      alert('Registrierung erfolgreich. Bitte einloggen.');
      window.location.hash = '#/login';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

// --------------------------------------------------
// 2) DASHBOARD
// --------------------------------------------------
async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="relative">
      <button id="logoutBtn" class="absolute top-4 right-4">Logout</button>
      <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    </div>
    <p class="text-center mt-4">Lade Spieler…</p>`;
  document.getElementById('logoutBtn').onclick = async () => { await logout(); window.location.hash = '#/login'; };

  const { data: players, error } = await supabase.from('users').select('id,name').order('name');
  if (error) {
    app.innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return;
  }
  if (!players.length) {
    app.innerHTML = `
      <div class="relative">
        <button id="logoutBtn2" class="absolute top-4 right-4">Logout</button>
      </div>
      <p class="text-center mt-8">Noch keine Spieler.</p>`;
    document.getElementById('logoutBtn2').onclick = async () => { await logout(); window.location.hash = '#/login'; };
    return;
  }

  app.innerHTML = `
    <div class="relative">
      <button id="logoutBtn3" class="absolute top-4 right-4">Logout</button>
      <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    </div>
    <form id="dayForm" class="max-w-lg mx-auto mt-6 space-y-4">
      <h3 class="text-xl text-center">Spieler für heute</h3>
      <div id="playerList" class="grid grid-cols-2 gap-2 p-4 border rounded"></div>
      <label class="flex items-center gap-2">
        <span>Bretter:</span>
        <input name="boards" type="number" value="2" min="1" class="input w-16" />
      </label>
      <button class="btn w-full">Spieltag starten</button>
    </form>`;
  document.getElementById('logoutBtn3').onclick = async () => { await logout(); window.location.hash = '#/login'; };

  const list = document.getElementById('playerList');
  players.forEach(p => {
    const lbl = document.createElement('label');
    lbl.className = 'flex items-center gap-2';
    lbl.innerHTML = `<input type="checkbox" name="player" value="${p.id}" /> <span>${p.name}</span>`;
    list.appendChild(lbl);
  });

  document.getElementById('dayForm').onsubmit = async e => {
    e.preventDefault();
    const ids = [...e.target.querySelectorAll('input[name=player]:checked')].map(i => i.value);
    const boards = parseInt(e.target.boards.value, 10) || 1;
    if (ids.length < 2) { alert('Mindestens 2 Spieler'); return; }
    try {
      const { data: gd } = await supabase.from('gamedays').insert({ date: new Date().toISOString().slice(0,10) }).select().single();
      const matches = generateRoundRobin(ids).flatMap((rnd,i) =>
        rnd.map((pair,j) => ({
          gameday_id: gd.id,
          board: `Board ${(i * rnd.length + j) % boards + 1}`,
          p1_id: pair[0], p2_id: pair[1], best_of_sets: 1, best_of_legs: 3
        }))
      );
      await supabase.from('matches').insert(matches);
      window.location.hash = '#/scorer';
    } catch (err) {
      alert(err.message);
    }
  };
}

// --------------------------------------------------
// 3) SCORER mit Sets & Legs & Turn Toggle
// --------------------------------------------------
let currentBoard = localStorage.getItem('bullseyer_board') || null;
let currentMatch = null;
let currentLeg = null;
let currentLegNo = 0;
let currentSetNo = 0;
let setsWon = { p1: 0, p2: 0 };
let remainingP1 = 501;
let remainingP2 = 501;
let currentPlayer = 'p1';

async function renderScorer() {
  const app = document.getElementById('app');

  // Board-Auswahl
  if (!currentBoard) {
    const boards = await fetchBoardsForToday();
    if (!boards.length) { app.innerHTML = '<p class="text-center mt-8">Keine Spiele heute</p>'; return; }
    app.innerHTML = `<div class="max-w-sm mx-auto mt-8 space-y-4"><h3 class="text-xl text-center">Welches Board?</h3>${boards.map(b=>`<button class="btn w-full" data-board="${b}">${b}</button>`).join('')}</div>`;
    app.querySelectorAll('[data-board]').forEach(btn => btn.onclick = () => { currentBoard = btn.dataset.board; localStorage.setItem('bullseyer_board', currentBoard); renderScorer(); });
    return;
  }

  // Match-Auswahl
  if (!currentMatch) {
    const matches = await fetchOpenMatches(currentBoard);
    if (!matches.length) { app.innerHTML = `<p class="text-center mt-8">Board ${currentBoard} fertig</p>`; return; }
    app.innerHTML = `<h3 class="text-xl text-center mt-6">Matches auf ${currentBoard}</h3><div id="matchList" class="max-w-md mx-auto mt-4 space-y-2"></div>`;
    matches.forEach(m => {
      const b = document.createElement('button');
      b.className = 'btn flex justify-between';
      b.textContent = `${m.p1.name} vs ${m.p2.name}`;
      b.onclick = () => startMatch(m);
      document.getElementById('matchList').appendChild(b);
    });
    return;
  }

  // Live-Scorer
  renderLiveScorer(app);
}

function startMatch(m) {
  currentMatch = m;
  currentSetNo = 1;
  currentLegNo = 1;
  setsWon = { p1:0, p2:0 };
  currentPlayer = 'p1';
  resetLeg();
  renderScorer();
}

function resetLeg() {
  remainingP1 = remainingP2 = 501;
  currentLeg = new Leg({ legId: crypto.randomUUID(), doubleIn: false, doubleOut: true });
}

function renderLiveScorer(app) {
  const p1 = currentMatch.p1.name, p2 = currentMatch.p2.name;
  const bestLeg = currentMatch.best_of_legs, bestSet = currentMatch.best_of_sets;
  const isP1Turn = currentPlayer === 'p1';

  app.innerHTML = `
    <div class="max-w-md mx-auto mt-6 space-y-4">
      <h2 class="text-xl text-center">${p1} vs ${p2}</h2>
      <div class="flex justify-center gap-4"><span>Set ${currentSetNo}/${bestSet}</span><span>Leg ${currentLegNo}/${bestLeg}</span></div>
      <div class="grid grid-cols-2 text-center gap-4">
        <div style="${isP1Turn?'font-size:2em;font-weight:bold;':''}"><strong id="remP1">${remainingP1}</strong><br>${p1}</div>
        <div style="${!isP1Turn?'font-size:2em;font-weight:bold;':''}"><strong id="remP2">${remainingP2}</strong><br>${p2}</div>
      </div>
      <form id="throwForm" class="flex justify-center gap-2">
        <input type="number" name="score" class="input w-32 text-lg text-center" placeholder="Score" required />
        <button class="btn">OK</button>
      </form>
      <div class="flex justify-center gap-2">
        <button id="legWon" class="btn bg-green-600 text-white hidden">Leg gewonnen</button>
        <button id="setWon" class="btn bg-blue-600 text-white hidden">Set gewonnen</button>
      </div>
    </div>`;

  const form = document.getElementById('throwForm');
  form.onsubmit = e => {
    e.preventDefault();
    const sc = parseInt(form.score.value,10)||0;
    form.reset();
    const prev = isP1Turn?remainingP1:remainingP2;
    const rem = prev - sc;
    if(rem<0){ alert('Bust!'); return; }

    // Punktabzug
    if(isP1Turn){ remainingP1 = rem; document.getElementById('remP1').textContent = rem; }
    else        { remainingP2 = rem; document.getElementById('remP2').textContent = rem; }

    currentLeg.addThrow({ playerId: isP1Turn?currentMatch.p1_id:currentMatch.p2_id, darts:[sc] });

    if(rem===0){
      document.getElementById('legWon').classList.remove('hidden');
    } else {
      currentPlayer = isP1Turn?'p2':'p1';
      renderLiveScorer(app);
    }
  };

  document.getElementById('legWon').onclick = () => {
    const win = remainingP1===0?'p1':'p2'; setsWon[win]++;
    saveLeg(currentSetNo, currentLegNo);
    document.getElementById('legWon').classList.add('hidden');
    if(setsWon.p1>bestLeg/2||setsWon.p2>bestLeg/2||currentLegNo>=bestLeg){
      document.getElementById('setWon').classList.remove('hidden');
    } else {
      currentLegNo++;
      currentPlayer = 'p1';
      resetLeg();
      renderScorer();
    }
  };

  document.getElementById('setWon').onclick = async () => {
    if(setsWon.p1>bestSet/2||setsWon.p2>bestSet/2||currentSetNo>=bestSet){
      alert('Match beendet!');
      await supabase.from('matches').update({ finished_at: new Date().toISOString() }).eq('id',currentMatch.id);
      currentMatch = null;
      renderScorer();
    } else {
      currentSetNo++;
      currentLegNo=1;
      setsWon={p1:0,p2:0};
      currentPlayer='p1';
      resetLeg();
      renderScorer();
    }
  };
}

async function saveLeg(setNo,legNo){
  await supabase.from('legs').insert({
    id: currentLeg.id,
    match_id: currentMatch.id,
    set_no: setNo,
    leg_no: legNo,
    starter: currentMatch.p1_id,
    start_score: 501,
    finish_darts: currentLeg.throwCount,
    duration_s: currentLeg.durationSeconds,
    winner_id: remainingP1===0?currentMatch.p1_id:currentMatch.p2_id
  });
}

async function fetchBoardsForToday(){
  const today=new Date().toISOString().slice(0,10);
  const { data: gs, error: gdErr } = await supabase.from('gamedays').select('id').eq('date', today);
  if(gdErr){ console.error(gdErr); return []; }
  const ids = (gs||[]).map(g=>g.id);
  const { data: ms, error: mErr } = await supabase.from('matches').select('board').is('finished_at',null).in('gameday_id', ids);
  if(mErr){ console.error(mErr); return []; }
  return [...new Set(ms.map(m=>m.board))];
}

async function fetchOpenMatches(board){
  const today=new Date().toISOString().slice(0,10);
  const { data: gds, error: gdErr } = await supabase.from('gamedays').select('id').eq('date',today);
  if(gdErr){ console.error(gdErr); return []; }
  const ids = (gds||[]).map(g=>g.id);
  const { data: matches, error: mErr } = await supabase.from('matches').select('*, p1:p1_id(name), p2:p2_id(name)').eq('board',board).is('finished_at',null).in('gameday_id',ids);
  if(mErr){ console.error(mErr); return []; }
  return matches||[];
}

function renderStats(){
  // Platzhalter für Statistik-View
}
