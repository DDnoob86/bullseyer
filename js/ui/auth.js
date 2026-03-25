// Login & Registrierung UI
import { login, signUp } from '../auth.js';
import { navigateTo } from '../router.js';

/**
 * Rendert die Login-Seite
 */
export function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="max-w-sm mx-auto mt-8">
      <div class="bg-yellow-100 border-2 border-yellow-400 rounded p-3 mb-4 text-sm">
        🧪 <strong>MOCK-MODUS:</strong> Login mit beliebigem Namen (z.B. "Alice")
      </div>
      <form id="loginForm" class="flex flex-col gap-4">
        <input name="email" type="text" placeholder="Name (z.B. Alice, Bob, Charlie, Diana)" class="input" required />
        <input name="pw" type="password" placeholder="Passwort (egal)" class="input" required />
        <button class="btn">Login</button>
        <p class="text-sm text-center">Noch kein Konto? <a href="#/register">Registrieren</a></p>
      </form>
    </div>`;

  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const { email, pw: password } = e.target.elements;
    try {
      await login({ email: email.value.trim(), password: password.value });
      navigateTo('#/dashboard');
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}

/**
 * Rendert die Registrierungs-Seite
 */
export function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="max-w-sm mx-auto mt-8">
      <div class="bg-yellow-100 border-2 border-yellow-400 rounded p-3 mb-4 text-sm">
        🧪 <strong>MOCK-MODUS:</strong> Erstelle einen Account mit beliebigem Namen
      </div>
      <form id="regForm" class="flex flex-col gap-4">
        <input name="name" type="text" placeholder="Spielername (z.B. Max)" class="input" required />
        <input name="email" type="text" placeholder="Name nochmal (egal)" class="input" required />
        <input name="pw" type="password" placeholder="Passwort (egal)" class="input" required />
        <button class="btn">Konto erstellen</button>
        <p class="text-sm text-center"><a href="#/login">Zurück zum Login</a></p>
      </form>
    </div>`;

  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault();
    const { name, email, pw: password } = e.target.elements;
    try {
      await signUp({
        email: email.value.trim(),
        password: password.value,
        options: { data: { name: name.value.trim() } }
      });
      alert('Bestätigungs-Mail verschickt!');
      navigateTo('#/login');
    } catch (err) {
      alert(err.error_description || err.message);
    }
  };
}
