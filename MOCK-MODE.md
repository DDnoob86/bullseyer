# 🧪 Mock-Modus für lokales Testen

Die App läuft jetzt im **Mock-Modus** ohne Supabase-Backend. Alle Daten werden im Browser (localStorage) gespeichert.

## ✅ So funktioniert der Mock-Modus

### Login/Registrierung
1. **Registrieren:** Gib einen beliebigen Namen ein (z.B. "Alice")
   - Email: egal (wird ignoriert)
   - Passwort: egal (wird ignoriert)

2. **Login:** Gib einen der Demo-Spielernamen ein:
   - Alice, Bob, Charlie, Diana
   - Email: egal
   - Passwort: egal

### Verfügbare Funktionen
- ✅ Spieler-Verwaltung (Demo-Spieler sind vorinstalliert)
- ✅ Spieltag erstellen mit Round-Robin-Paarungen
- ✅ Multi-Board-Support (1-8 Boards)
- ✅ Live-Scoring mit Sets/Legs/Würfen
- ✅ Match-Ende-Erkennung
- ✅ Statistiken (werden in localStorage gespeichert)
- ✅ Undo-Funktion
- ⚠️ Daten bleiben nur im Browser gespeichert (gehen bei Cache-Löschen verloren)

### Testvorschlag
1. **Melde dich an** als "Alice"
2. **Dashboard:** Wähle 2-4 Spieler (blau anklicken)
3. **Konfiguration:** Best of 3 Sets, Best of 3 Legs, 1-2 Boards
4. **"Spieltag starten"** klicken
5. **Match auswählen** im Scorer
6. **Startspieler wählen** beim ersten Leg
7. **Score eingeben:** Entweder Ziffernblock oder Quick-Score-Buttons
8. **Match durchspielen** bis zum Ende
9. **Match-End-Screen** wird automatisch angezeigt mit Statistiken

## 🔄 Zurück zum echten Backend

Wenn du Supabase eingerichtet hast, ändere in **3 Dateien** den Import:

### 1. `js/main.js` (Zeile 3)
```javascript
// Von:
import { supabase } from './supabase-mock.js';

// Zu:
import { supabase } from './supabase.js';
```

### 2. `js/auth.js` (Zeile 2)
```javascript
// Von:
import { supabase } from './supabase-mock.js';

// Zu:
import { supabase } from './supabase.js';
```

### 3. `js/livescoring.js` (Zeile 2)
```javascript
// Von:
import { supabase } from './supabase-mock.js';

// Zu:
import { supabase } from './supabase.js';
```

Dann trage deine echten Supabase-Credentials in `js/supabase.js` ein.

## 🗑️ Daten zurücksetzen

Im Browser-Console (F12):
```javascript
// Alle Mock-Daten löschen:
localStorage.clear();
location.reload();
```

Oder einzelne Tabellen:
```javascript
localStorage.removeItem('mock_users');
localStorage.removeItem('mock_matches');
// etc.
```

## 📝 Bekannte Einschränkungen im Mock-Modus

- ❌ Keine echte Authentifizierung
- ❌ Keine Realtime-Updates zwischen Devices
- ❌ Daten gehen bei Browser-Cache-Löschung verloren
- ❌ Keine Server-seitige Validierung
- ✅ Aber: Perfekt zum Testen der UI und Workflows!

---

**Tipp:** Öffne die Browser-Konsole (F12) um Logs zu sehen - sie zeigen dir genau was passiert!
