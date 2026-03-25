# 🧪 Mock-Modus für lokales Testen

Die App läuft im **Mock-Modus** ohne Supabase-Backend. Alle Daten werden im Browser (localStorage) gespeichert.

## ✅ So funktioniert der Mock-Modus

### Auto-Login
- Die App loggt automatisch einen Demo-User ein
- Login/Register-Seiten werden auf das Dashboard umgeleitet
- Kein Passwort nötig

### Spieler anlegen
1. **Navigation → „Spieler"**
2. Namen eingeben (z.B. "Alice", "Bob") → „Hinzufügen"
3. Spieler stehen sofort für Spieltag-Erstellung bereit

### Verfügbare Funktionen
- ✅ Spielerverwaltung (anlegen, bearbeiten, löschen)
- ✅ Spieltag erstellen mit Round-Robin-Paarungen
- ✅ Multi-Board-Support (1–8 Boards)
- ✅ Live-Scoring mit Score- und Rest-Modus
- ✅ Checkout-Vorschläge & Bullfinish-Tracking
- ✅ Match-Ende-Erkennung mit Statistik-Screen
- ✅ Statistik-Seite mit Rangliste & CSV-Export
- ✅ Undo-Funktion
- ✅ Spieltag-Vorlagen
- ✅ Dark Mode
- ⚠️ Daten bleiben nur im Browser gespeichert (gehen bei Cache-Löschen verloren)

### Testvorschlag
1. **Spieler anlegen:** Navigation → „Spieler" → 3–4 Namen eingeben
2. **Dashboard:** Spieler auswählen (blau anklicken)
3. **Konfiguration:** Best of 1 Set, Best of 3 Legs, 1 Board
4. **„Spieltag starten"** klicken
5. **Match auswählen** im Scorer
6. **Startspieler wählen** beim ersten Leg
7. **Score eingeben:** Quick-Score-Buttons (z.B. 60, 100) oder Numpad
8. **Match durchspielen** → Endscreen mit Statistiken

---

## 🔄 Zurück zum echten Backend

Wenn du Supabase eingerichtet hast:

### 1. Credentials eintragen

In `js/supabase.js`:
```javascript
const SUPABASE_URL = 'DEINE_URL';
const SUPABASE_KEY = 'DEIN_ANON_KEY';
```

### 2. Imports ändern

Ersetze `supabase-mock.js` → `supabase.js` in **allen** betroffenen Dateien:

```
js/main.js
js/auth.js
js/services/match.js
js/services/stats.js
js/ui/dashboard.js
js/ui/scorer.js
js/ui/players.js
js/ui/stats.js
```

> **Quick-Fix:** Suche & Ersetze `supabase-mock.js` → `supabase.js` im gesamten `js/`-Ordner.

### 3. Auto-Login entfernen

In `js/main.js`: Die `autoLoginForTesting()`-Funktion und den Mock-Kommentar bei den Login/Register-Routen entfernen.

---

## 🗑️ Daten zurücksetzen

Browser-Konsole (F12):

```javascript
// Alle Mock-Daten löschen:
localStorage.clear();
location.reload();

// Oder Mock-DB inspizieren:
debugMockDB()

// Interaktives Zurücksetzen:
resetMockDB()
```

---

## 📝 Einschränkungen im Mock-Modus

| Feature | Mock | Echtes Backend |
|---|---|---|
| Authentifizierung | Auto-Login | Email/Passwort |
| Datenspeicherung | localStorage | PostgreSQL |
| Multi-Device-Sync | ❌ | ✅ Realtime |
| Datenpersistenz | Bis Cache-Löschung | Permanent |
| Server-Validierung | ❌ | ✅ RLS |

---

**Tipp:** Öffne die Browser-Konsole (F12) — detaillierte Logs zeigen alle DB-Operationen!
