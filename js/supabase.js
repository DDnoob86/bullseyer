import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Öffentlicher (anon)‑Key → nur Lese/Schreib‑Rechte laut Row‑Level‑Security
const SUPABASE_URL  = 'https://jisqjympggmtgfnkixjl.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imppc3FqeW1wZ2dtdGdmbmtpeGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MDYyMTIsImV4cCI6MjA2NzM4MjIxMn0.WaA6h_U2KRlSpwSOrlkRzWYq0T_HduSCBEI0v5tBg_Y';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Realtime → neue Legs / Matches instant an alle iPads pushen
export function subscribeTo(table, callback) {
  return supabase
    .channel(table)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}