// Zentraler Hash-Router
// Registriert Routen und führt bei Hash-Änderung die passende Render-Funktion aus

const routes = new Map();
let cleanupFn = null;

/**
 * Registriert eine Route
 * @param {string} hash - z.B. '#/dashboard'
 * @param {Function} handler - Render-Funktion, kann optional eine Cleanup-Funktion zurückgeben
 */
export function registerRoute(hash, handler) {
  routes.set(hash, handler);
}

/**
 * Navigiert zu einer Route
 * @param {string} hash - z.B. '#/dashboard'
 */
export function navigateTo(hash) {
  window.location.hash = hash;
}

/**
 * Gibt den aktuellen Route-Hash zurück
 */
export function getCurrentRoute() {
  return window.location.hash || '#/dashboard';
}

/**
 * Startet den Router
 */
export function startRouter() {
  const handleRoute = async () => {
    // Vorherige Seite aufräumen
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (e) { console.error('[Router] Cleanup error:', e); }
      cleanupFn = null;
    }

    const hash = window.location.hash || '#/dashboard';

    // Finde passende Route (längster Prefix-Match zuerst)
    const sortedRoutes = [...routes.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [pattern, handler] of sortedRoutes) {
      if (hash.startsWith(pattern)) {
        try {
          const result = await handler();
          if (typeof result === 'function') {
            cleanupFn = result;
          }
        } catch (e) {
          console.error(`[Router] Error rendering ${pattern}:`, e);
        }
        updateActiveNav(hash);
        return;
      }
    }

    // Fallback: Dashboard
    const defaultHandler = routes.get('#/dashboard');
    if (defaultHandler) {
      const result = await defaultHandler();
      if (typeof result === 'function') cleanupFn = result;
    }
    updateActiveNav('#/dashboard');
  };

  window.addEventListener('hashchange', handleRoute);
  // Initiales Routing
  handleRoute();
}

/**
 * Aktualisiert die aktive Navigation im Header
 */
function updateActiveNav(hash) {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (hash.startsWith(href)) {
      link.classList.add('bg-white/30', 'text-white');
      link.classList.remove('text-white/80');
    } else {
      link.classList.remove('bg-white/30', 'text-white');
      link.classList.add('text-white/80');
    }
  });
}
