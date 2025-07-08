import { supabase } from './supabase.js';

/**
 * Registriert einen neuen Spieler-Account.
 * displayName wird in raw_user_meta_data gespeichert.
 */
export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { displayName }
    }
  });
  if (error) throw error;
  return data;           // { user, session }
}

/**
 * Login mit E-Mail & Passwort.
 */
export async function login({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;           // { user, session }
}

/**
 * Loggt den aktuellen Benutzer aus.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Liefert den aktuell eingeloggten Benutzer (oder null).
 */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Listener für Auth-Status-Änderungen (Login / Logout / Token-Refresh).
 * onAuthChange(user => {  });
 */
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

/**
 * ADMIN-Funktion: Passwort eines beliebigen Users zurücksetzen.
 * Erwartet eine RPC-Function `admin_reset_password` auf dem Backend
 * (Service-Role-Key notwendig – also nur aus einer Edge-Function aufrufbar).
 */
export async function adminReset({ uid, newPassword }) {
  const { error } = await supabase.rpc('admin_reset_password', {
    uid,
    new_pw: newPassword
  });
  if (error) throw error;
}
