
import { login, signUp, logout } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';

const DEV = true;

// Auth listener
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') window.location.hash = '#/dashboard';
  if (event === 'SIGNED_OUT') window.location.hash = '#/login';
});

// Router
const routes = {
  login: renderLogin,
  register: renderRegister,
  dashboard: renderDashboard,
  scorer: renderScorer,
  stats: renderStats
};

window.addEventListener('hashchange', updateRoute);
updateRoute();

function updateRoute() {
  let hash = window.location.hash.slice(2);
  if (!hash) {
    hash = DEV ? 'dashboard' : 'login';
    window.location.hash = '#/' + hash;
    return;
  }
  (routes[hash] || renderLogin)();
}

/* ---------------- Login ---------------- */
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="loginForm" class="max-w-sm mx-auto mt-8 space-y-4">
      <input name="email" type="email" placeholder="E-Mail" class="input" required>
      <input name="pw" type="password" placeholder="Passwort" class="input" required>
      <button class="btn w-full">Login</button>
      <p class="text-sm text-center">Noch kein Konto? <a href="#/register">Registrieren</a></p>
    </form>`;
  app.querySelector('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const { email, pw } = e.target.elements;
    try {
      await login({ email: email.value.trim(), password: pw.value });
      window.location.hash = '#/dashboard';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

/* -------------- Register -------------- */
function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <form id="regForm" class="max-w-sm mx-auto mt-8 space-y-4">
      <input name="name" type="text" placeholder="Anzeigename" class="input" required>
      <input name="email" type="email" placeholder="E-Mail" class="input" required>
      <input name="pw" type="password" placeholder="Passwort" class="input" required>
      <button class="btn w-full">Konto erstellen</button>
      <p class="text-sm text-center">Bereits registriert? <a href="#/login">Login</a></p>
    </form>`;
  app.querySelector('#regForm').onsubmit = async (e) => {
    e.preventDefault();
    const { name, email, pw } = e.target.elements;
    try {
      let { user } = await signUp({ email: email.value.trim(), password: pw.value, displayName: name.value.trim() });
      if (!user) user = (await supabase.auth.getUser()).data.user;
      await supabase.from('users').insert({ id: user.id, name: name.value.trim() });
      alert('Registrierung erfolgreich. Bitte einloggen.');
      window.location.hash = '#/login';
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

/* -------------- Dashboard -------------- */
async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <button id="logout" class="absolute top-4 right-4">Logout</button>
    <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    <p class="text-center mt-4">Lade Spieler …</p>`;
  document.getElementById('logout').onclick = async () => { await logout(); window.location.hash='#/login'; };

  const { data: players, error } = await supabase.from('users').select('id,name').order('name');
  if (error) { app.innerHTML = '<p class="text-red-600 text-center mt-8">'+error.message+'</p>'; return; }

  app.innerHTML = `
    <button id="logout" class="absolute top-4 right-4">Logout</button>
    <h2 class="text-2xl text-center mt-8">Dashboard</h2>
    <form id="dayForm" class="max-w-lg mx-auto mt-6 space-y-6">
      <div id="playerList" class="flex flex-col items-center gap-2"></div>
      <label class="flex items-center gap-2">
        <span>Bretter:</span><input name="boards" type="number" min="1" value="2" class="input w-16">
      </label>
      <button class="bg-green-500 hover:bg-green-600 text-white rounded-full w-full py-2">Spieltag starten</button>
    </form>`;
  document.getElementById('logout').onclick = async () => { await logout(); window.location.hash='#/login'; };

  const selected = new Set();
  const list = document.getElementById('playerList');
  players.forEach(p=>{
    const div=document.createElement('div');
    div.textContent=p.name;
    div.className='cursor-pointer text-2xl';
    div.onclick=()=>{ if(selected.has(p.id)){ selected.delete(p.id); div.classList.remove('text-blue-500'); } else { selected.add(p.id); div.classList.add('text-blue-500'); } };
    list.appendChild(div);
  });

  document.getElementById('dayForm').onsubmit = async (e)=>{
    e.preventDefault();
    const ids=Array.from(selected);
    const boards=parseInt(e.target.boards.value,10)||1;
    if(ids.length<2){ alert('Mind. 2 Spieler markieren'); return; }
    const { data: gd } = await supabase.from('gamedays').insert({ date:new Date().toISOString().slice(0,10) }).select().single();
    localStorage.setItem('bullseyer_gameday',gd.id);
    const matches=generateRoundRobin(ids).flatMap((rnd,i)=>rnd.map((pair,j)=>({gameday_id:gd.id, board:`Board ${((i*rnd.length+j)%boards)+1}`, p1_id:pair[0], p2_id:pair[1], best_of_sets:1, best_of_legs:3})));
    await supabase.from('matches').insert(matches);
    window.location.hash='#/scorer';
  };
}

/* -------------- Scorer -------------- */
let currentBoard=localStorage.getItem('bullseyer_board')||null;
let currentMatch=null;

async function renderScorer() {
  const app=document.getElementById('app');
  if(!currentBoard){
    const boards=await fetchBoardsForToday();
    if(!boards.length){ app.innerHTML='<p class="text-center mt-8">Keine Spiele heute</p>'; return; }
    app.innerHTML='<h3 class="text-center mt-6">Board wählen</h3><div id="boardList" class="max-w-md mx-auto mt-4 space-y-2"></div>';
    const list=document.getElementById('boardList');
    boards.forEach(b=>{ const btn=document.createElement('button'); btn.type='button'; btn.className='btn w-full'; btn.textContent=b; btn.onclick=()=>{ currentBoard=b; localStorage.setItem('bullseyer_board',b); renderScorer(); }; list.appendChild(btn);} );
    return;
  }

  if(!currentMatch){
    const matches=await fetchOpenMatches(currentBoard);
    app.innerHTML=`<h3 class="text-xl text-center mt-6">Matches auf ${currentBoard}</h3><div id="matchList" class="max-w-md mx-auto mt-4 space-y-2"></div>`;
    const list=document.getElementById('matchList');
    matches.forEach(m=>{ const btn=document.createElement('button'); btn.type='button'; btn.className='btn flex justify-between'; btn.textContent=`${m.p1.name} vs ${m.p2.name}`; btn.onclick=()=>{ currentMatch=m; renderScorer(); }; list.appendChild(btn);} );
    return;
  }

  app.innerHTML='<p class="text-center mt-8">Live‑Scorer folgt …</p>';
}

/* -------- helper ------- */
async function fetchBoardsForToday(){
  const id=localStorage.getItem('bullseyer_gameday'); if(!id) return [];
  const { data } = await supabase.from('matches').select('board').eq('gameday_id',id);
  return [new Set((data||[]).map(x=>x.board))];
}

async function fetchOpenMatches(board){
  const id=localStorage.getItem('bullseyer_gameday'); if(!id) return [];
  const { data } = await supabase.from('matches').select('*, p1:p1_id(name), p2:p2_id(name)').eq('board',board).eq('gameday_id',id).is('finished_at',null);
  return data||[];
}

/* Dummy placeholder */
function renderStats(){ const app=document.getElementById('app'); app.innerHTML='<p class="text-center mt-8">Statistik WIP…</p>'; }
