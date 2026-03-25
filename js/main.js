// Main - Anwendungs-Orchestrator
// Konfiguriert den Router und startet die App

import { supabase } from './supabase-mock.js';
import { registerRoute, startRouter, navigateTo } from './router.js';
import { renderLogin, renderRegister } from './ui/auth.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderScorer } from './ui/scorer.js';
import { renderPlayers } from './ui/players.js';
import { renderStats } from './ui/stats.js';

// ============================================================
// MOCK-MODUS: Auto-Login für Tests
// ============================================================
(function autoLoginForTesting() {
  console.log('🧪 MOCK-MODUS: Auto-Login als Demo-User...');
  const demoUser = { id: 'demo-user-id', email: 'demo@test.com' };
  localStorage.setItem('mock_currentUser', JSON.stringify(demoUser));

  setTimeout(() => {
    if (!window.location.hash || window.location.hash === '#/login') {
      window.location.hash = '#/dashboard';
    }
  }, 100);
})();

// Auth-Listener (im Mock-Modus nicht aktiv)
supabase.auth.onAuthStateChange((event, session) => {
  // if (event === 'SIGNED_IN')  navigateTo('#/dashboard');
  // if (event === 'SIGNED_OUT') navigateTo('#/login');
});

// ============================================================
// ROUTEN REGISTRIEREN
// ============================================================

// Mock-Modus: Login/Register werden auf Dashboard umgeleitet
registerRoute('#/login', () => { navigateTo('#/dashboard'); });
registerRoute('#/register', () => { navigateTo('#/dashboard'); });

// Haupt-Routen
registerRoute('#/dashboard', renderDashboard);
registerRoute('#/scorer', renderScorer);
registerRoute('#/livescorer', renderScorer);  // Livescorer wird innerhalb von Scorer gehandelt
registerRoute('#/players', renderPlayers);
registerRoute('#/stats', () => renderStats());

// ============================================================
// APP STARTEN
// ============================================================
startRouter();
