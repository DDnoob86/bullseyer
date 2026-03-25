// Dialoge für den Livescorer - Checkout, Leg-Won, Set-Won Overlays
import * as store from '../../state/store.js';
import { getPlayerNames } from '../../utils/players.js';
import { getMinCheckoutDarts, isBullfinishPossible, getCheckoutSuggestion } from '../../utils/checkouts.js';

/**
 * Zeigt den Checkout-Dialog mit intelligenter Dart-Begrenzung + Bullfinish-Frage
 * @param {number} remaining - Der Reststand der ausgecheckt wird
 * @returns {Promise<{darts: number, bullfinish: boolean}>}
 */
export function showCheckoutDialog(remaining) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('checkoutDialog');
    if (!dialog) { resolve({ darts: 3, bullfinish: false }); return; }

    const minDarts = getMinCheckoutDarts(remaining);
    const canBullfinish = isBullfinishPossible(remaining);
    const suggestion = getCheckoutSuggestion(remaining);

    // Dialog-Inhalt dynamisch aufbauen
    const inner = dialog.querySelector('.dialog-inner') || dialog.querySelector('div > div');
    if (!inner) { resolve({ darts: 3, bullfinish: false }); return; }

    inner.innerHTML = `
      <div class="text-5xl mb-3">🎯</div>
      <h3 class="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-1">Checkout!</h3>
      <p class="text-lg text-gray-600 dark:text-gray-300 mb-1">${remaining} ausgecheckt!</p>
      ${suggestion ? `<p class="text-sm text-amber-600 dark:text-amber-400 mb-4">(${suggestion})</p>` : '<div class="mb-4"></div>'}
      
      <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Wie viele Darts zum Finish?</p>
      <div class="flex gap-4 justify-center mb-4">
        ${[1, 2, 3].map(d => {
          const disabled = d < minDarts;
          const colors = d === 1
            ? 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
            : d === 2
              ? 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              : 'from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700';
          return `<button data-darts="${d}" class="checkout-dart-btn flex-1 bg-gradient-to-br ${disabled ? 'from-gray-300 to-gray-400 cursor-not-allowed opacity-40' : colors + ' transform hover:scale-105'} text-white py-4 rounded-xl font-bold text-2xl shadow-lg transition-all" ${disabled ? 'disabled' : ''}>${d}</button>`;
        }).join('')}
      </div>

      ${canBullfinish ? `
        <label class="flex items-center justify-center gap-3 cursor-pointer bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-2 border-red-300 dark:border-red-600 rounded-lg p-3 hover:shadow-lg transition-all">
          <input type="checkbox" id="bullfinishCheck" class="w-5 h-5 text-red-600 rounded focus:ring-red-500" ${remaining === 50 ? 'checked' : ''} />
          <span class="font-bold text-red-700 dark:text-red-400">🎯 Bullfinish!</span>
        </label>
      ` : ''}

      <p class="text-xs text-gray-400 mt-3">Für die Statistik</p>
    `;

    dialog.classList.remove('hidden');
    dialog.classList.add('flex');

    // Event-Handler
    const buttons = inner.querySelectorAll('.checkout-dart-btn:not([disabled])');
    const handler = (e) => {
      const darts = parseInt(e.target.dataset.darts);
      const bullfinishEl = inner.querySelector('#bullfinishCheck');
      const bullfinish = bullfinishEl ? bullfinishEl.checked : false;

      // Cleanup
      buttons.forEach(b => b.removeEventListener('click', handler));
      dialog.classList.add('hidden');
      dialog.classList.remove('flex');
      resolve({ darts, bullfinish });
    };
    buttons.forEach(b => b.addEventListener('click', handler));
  });
}

/**
 * Zeigt einen Bust-Toast an
 * @param {string} message - Die anzuzeigende Nachricht
 */
export function showBustToast(message) {
  const toast = document.getElementById('bustToast');
  if (!toast) return;
  const textEl = toast.querySelector('div');
  if (textEl) textEl.textContent = message || 'BUST! 💥';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1200);
}

/**
 * Zeigt ein "Leg gewonnen!" Overlay
 * @param {string} winnerKey - 'p1' oder 'p2'
 * @param {Object} details - { legNo, setNo, legsWon, setsWon }
 * @returns {Promise<void>} Resolves nach Timeout oder Klick
 */
export function showLegWonOverlay(winnerKey, details = {}) {
  return new Promise((resolve) => {
    const match = store.getCurrentMatch();
    const names = getPlayerNames(match);
    const winnerName = winnerKey === 'p1' ? names.p1 : names.p2;
    const color = winnerKey === 'p1' ? 'emerald' : 'rose';

    const overlay = document.getElementById('legWonOverlay');
    if (!overlay) { resolve(); return; }

    overlay.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-${color}-400 p-8 mx-4 w-full max-w-sm text-center transform scale-0 transition-transform duration-300" id="legWonCard">
        <div class="text-4xl mb-2">✅</div>
        <h3 class="text-2xl font-bold text-${color}-700 dark:text-${color}-400 mb-2">${winnerName}</h3>
        <p class="text-xl font-semibold text-gray-700 dark:text-gray-300">gewinnt das Leg!</p>
        <div class="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Legs: ${details.legsWon?.p1 || 0} - ${details.legsWon?.p2 || 0}
          ${details.setsWon ? ` • Sets: ${details.setsWon.p1} - ${details.setsWon.p2}` : ''}
        </div>
      </div>
    `;

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    // Karte animieren
    requestAnimationFrame(() => {
      const card = document.getElementById('legWonCard');
      if (card) card.style.transform = 'scale(1)';
    });

    // Auto-Close nach 1.8s oder bei Klick
    const close = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      overlay.removeEventListener('click', close);
      resolve();
    };

    overlay.addEventListener('click', close);
    setTimeout(close, 1800);
  });
}

/**
 * Zeigt ein "Set gewonnen!" Overlay
 * @param {string} winnerKey - 'p1' oder 'p2'
 * @param {Object} setsWon - { p1: number, p2: number }
 * @returns {Promise<void>}
 */
export function showSetWonOverlay(winnerKey, setsWon) {
  return new Promise((resolve) => {
    const match = store.getCurrentMatch();
    const names = getPlayerNames(match);
    const winnerName = winnerKey === 'p1' ? names.p1 : names.p2;
    const color = winnerKey === 'p1' ? 'emerald' : 'rose';

    const overlay = document.getElementById('legWonOverlay');
    if (!overlay) { resolve(); return; }

    overlay.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-amber-400 p-8 mx-4 w-full max-w-sm text-center transform scale-0 transition-transform duration-300" id="legWonCard">
        <div class="text-4xl mb-2">🏅</div>
        <h3 class="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-2">${winnerName}</h3>
        <p class="text-xl font-semibold text-gray-700 dark:text-gray-300">gewinnt das Set!</p>
        <div class="mt-4 text-3xl font-bold text-gray-800 dark:text-gray-100">
          <span class="text-emerald-600">${setsWon.p1}</span>
          <span class="mx-2 text-gray-400">:</span>
          <span class="text-rose-600">${setsWon.p2}</span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Sets</p>
      </div>
    `;

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    requestAnimationFrame(() => {
      const card = document.getElementById('legWonCard');
      if (card) card.style.transform = 'scale(1)';
    });

    const close = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
      overlay.removeEventListener('click', close);
      resolve();
    };

    overlay.addEventListener('click', close);
    setTimeout(close, 2500);
  });
}
