// Spielerverwaltung - Anlegen, Bearbeiten, Löschen
import { supabase } from '../supabase-mock.js';

export async function renderPlayers() {
  const app = document.getElementById('app');
  app.innerHTML = `<p class="text-center mt-8">Lade Spieler…</p>`;

  const { data: players, error } = await supabase
    .from('users')
    .select('id, name, created_at')
    .order('name');

  if (error) {
    app.innerHTML = `<p class="text-red-600 text-center mt-8">${error.message}</p>`;
    return;
  }

  app.innerHTML = `
    <div class="max-w-4xl mx-auto mt-6">
      <!-- Header -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-violet-400 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-violet-800 dark:text-violet-400 flex items-center gap-2">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            Spielerverwaltung
          </h2>
          <span class="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-3 py-1 rounded-full text-sm font-bold">${players.length} Spieler</span>
        </div>

        <!-- Neuen Spieler anlegen -->
        <form id="addPlayerForm" class="flex gap-3">
          <input
            id="newPlayerName"
            type="text"
            placeholder="Neuer Spielername…"
            required
            minlength="2"
            maxlength="30"
            class="flex-1 px-4 py-3 border-2 border-violet-300 rounded-lg focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition text-lg font-semibold"
          />
          <button type="submit" class="bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            Hinzufügen
          </button>
        </form>
      </div>

      <!-- Spielerliste -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-blue-400 p-6">
        <div id="playerListContainer">
          ${players.length === 0
            ? '<p class="text-center text-gray-400 py-8">Noch keine Spieler angelegt</p>'
            : `<div class="space-y-3">
                ${players.map(p => renderPlayerRow(p)).join('')}
              </div>`
          }
        </div>
      </div>
    </div>

    <!-- Edit Modal (hidden) -->
    <div id="editPlayerModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden items-center justify-center">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-violet-400 p-8 mx-4 w-full max-w-md">
        <h3 class="text-xl font-bold text-violet-800 dark:text-violet-400 mb-4">Spieler bearbeiten</h3>
        <form id="editPlayerForm">
          <input type="hidden" id="editPlayerId" />
          <input
            id="editPlayerName"
            type="text"
            required
            minlength="2"
            maxlength="30"
            class="w-full px-4 py-3 border-2 border-violet-300 rounded-lg focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition text-lg font-semibold mb-4"
          />
          <div class="flex gap-3">
            <button type="submit" class="flex-1 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">
              Speichern
            </button>
            <button type="button" id="cancelEditBtn" class="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-xl font-bold transition-all transform hover:scale-105">
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirm Modal (hidden) -->
    <div id="deletePlayerModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden items-center justify-center">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-4 border-red-400 p-8 mx-4 w-full max-w-md">
        <h3 class="text-xl font-bold text-red-800 dark:text-red-400 mb-2">Spieler löschen?</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6" id="deletePlayerText"></p>
        <input type="hidden" id="deletePlayerId" />
        <div class="flex gap-3">
          <button id="confirmDeleteBtn" class="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition-all transform hover:scale-105">
            Ja, löschen
          </button>
          <button id="cancelDeleteBtn" class="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-xl font-bold transition-all transform hover:scale-105">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  `;

  // --- Event Handlers ---

  // Spieler anlegen
  document.getElementById('addPlayerForm').onsubmit = async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newPlayerName');
    const name = nameInput.value.trim();
    if (!name) return;

    // Prüfe Duplikat
    const exists = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      nameInput.classList.add('border-red-500');
      nameInput.setCustomValidity('Spieler existiert bereits!');
      nameInput.reportValidity();
      setTimeout(() => {
        nameInput.classList.remove('border-red-500');
        nameInput.setCustomValidity('');
      }, 2000);
      return;
    }

    const { error: insertErr } = await supabase
      .from('users')
      .insert({ name });

    if (insertErr) {
      alert('Fehler beim Anlegen: ' + insertErr.message);
      return;
    }

    // Seite neu laden
    renderPlayers();
  };

  // Event-Delegation für Edit & Delete Buttons
  document.getElementById('playerListContainer').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const deleteBtn = e.target.closest('[data-action="delete"]');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const player = players.find(p => p.id === id);
      if (!player) return;
      openEditModal(player);
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const player = players.find(p => p.id === id);
      if (!player) return;
      openDeleteModal(player);
    }
  });

  // Edit Modal
  function openEditModal(player) {
    const modal = document.getElementById('editPlayerModal');
    document.getElementById('editPlayerId').value = player.id;
    document.getElementById('editPlayerName').value = player.name;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('editPlayerName').focus();
  }

  function closeEditModal() {
    const modal = document.getElementById('editPlayerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  document.getElementById('cancelEditBtn').onclick = closeEditModal;
  document.getElementById('editPlayerModal').onclick = (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  };

  document.getElementById('editPlayerForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editPlayerId').value;
    const newName = document.getElementById('editPlayerName').value.trim();
    if (!newName) return;

    // Prüfe Duplikat (außer sich selbst)
    const exists = players.find(p => p.name.toLowerCase() === newName.toLowerCase() && p.id !== id);
    if (exists) {
      document.getElementById('editPlayerName').classList.add('border-red-500');
      setTimeout(() => document.getElementById('editPlayerName').classList.remove('border-red-500'), 2000);
      return;
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ name: newName })
      .eq('id', id);

    if (updateErr) {
      alert('Fehler beim Speichern: ' + updateErr.message);
      return;
    }

    closeEditModal();
    renderPlayers();
  };

  // Delete Modal
  function openDeleteModal(player) {
    const modal = document.getElementById('deletePlayerModal');
    document.getElementById('deletePlayerId').value = player.id;
    document.getElementById('deletePlayerText').textContent = `"${player.name}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeDeleteModal() {
    const modal = document.getElementById('deletePlayerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  document.getElementById('cancelDeleteBtn').onclick = closeDeleteModal;
  document.getElementById('deletePlayerModal').onclick = (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  };

  document.getElementById('confirmDeleteBtn').onclick = async () => {
    const id = document.getElementById('deletePlayerId').value;

    const { error: deleteErr } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      alert('Fehler beim Löschen: ' + deleteErr.message);
      return;
    }

    closeDeleteModal();
    renderPlayers();
  };
}

function renderPlayerRow(player) {
  const created = player.created_at
    ? new Date(player.created_at).toLocaleDateString('de-DE')
    : '';

  return `
    <div class="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-600/50 border-2 border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md hover:border-violet-300 dark:hover:border-violet-500 transition-all duration-200">
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
          ${player.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div class="font-bold text-gray-900 dark:text-gray-100 text-lg">${player.name}</div>
          ${created ? `<div class="text-xs text-gray-500 dark:text-gray-400">seit ${created}</div>` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        <!-- Edit Button -->
        <button data-action="edit" data-id="${player.id}" class="p-2 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-400 rounded-lg transition-all transform hover:scale-110" title="Bearbeiten">
          <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
        </button>
        <!-- Delete Button -->
        <button data-action="delete" data-id="${player.id}" class="p-2 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60 text-red-700 dark:text-red-400 rounded-lg transition-all transform hover:scale-110" title="Löschen">
          <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}
