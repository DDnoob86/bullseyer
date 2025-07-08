// Kompletter Abgleich der `main.js`
import { login, signUp, logout } from './auth.js';
import { supabase } from './supabase.js';
import { generateRoundRobin } from './pairing.js';
import { Leg } from './scorer.js';

// DEV-Modus: Direkt ins Dashboard
const DEV = true;

// Supabase Auth-Listener
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') window.location.hash = '#/dashboard';
  if (event === 'SIGNED_OUT') window.location.hash = '#/login';
});

// Mini-Router
const routes = {
  login:    renderLogin,
  register: renderRegister,
  dashboard:renderDashboard,
  scorer:   renderScorer,
  stats:    renderStats
};

window.addEventListener('hashchange', updateRoute);
updateRoute();
function updateRoute() {
  let hash = window.location.hash.slice(2);
  if (!hash) {
    hash = DEV ? 'dashboard' : 'login';
    window.location.hash = `#/${hash}`;
    return;
  }
  (routes[hash] || renderLogin)();
}

//  weitere Funktionen renderLogin/renderRegister/renderDashboard/renderScorer 
