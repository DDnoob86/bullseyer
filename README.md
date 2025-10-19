# 🎯 Bullseyer - Darts Live Scoring App

Eine Progressive Web App (PWA) für Echtzeit-Darts-Scoring mit professioneller Match-Verwaltung, Multi-Board-Support und detaillierten Statistiken.

## 🚀 Quick Start

### 1. Server starten

Die App ist eine statische PWA und benötigt nur einen einfachen HTTP-Server:

```bash
# Option 1: Python (meist vorinstalliert)
python -m http.server 8000

# Option 2: Node.js serve
npx serve .

# Option 3: PHP (falls installiert)
php -S localhost:8000
```

### 2. Website aufrufen

Öffne deinen Browser und navigiere zu:

```
http://localhost:8000
```

### 3. Einloggen & Losspielen

Die App läuft im **Mock-Modus** (ohne echtes Backend):

- **Login:** Gib einen beliebigen Namen ein (z.B. "Alice")
- **Demo-Spieler:** Alice, Bob, Charlie, Diana sind vorinstalliert
- Email & Passwort werden ignoriert (alles wird nur im Browser gespeichert)

📖 **Mehr Infos zum Mock-Modus:** Siehe [MOCK-MODE.md](./MOCK-MODE.md)

---

## 📋 Features

### ✅ Match-Verwaltung
- **Spieltag-Organisation:** Erstelle Game Days mit automatischen Round-Robin-Paarungen
- **Multi-Board-Support:** Unterstützt 1-8 Boards parallel
- **Flexible Konfiguration:** Best-of-Sets und Best-of-Legs frei wählbar
- **Double-Out-Regel:** Vollständige Double-Out-Validierung mit S/D/T-Buttons

### ✅ Live-Scoring
- **3-Dart-Eingabe:** Digitaler Ziffernblock mit Single/Double/Triple-Buttons
- **Quick-Score-Buttons:** Schnelleingabe für häufige Scores (0, 26, 41, 60, 81, 100, 140, 180)
- **Echtzeit-Statistiken:** Leg- und Match-Averages, 180er, 140+, High Score
- **Checkout-Vorschläge:** Automatische Finish-Empfehlungen ab 170
- **Undo-Funktion:** Korrigiere falsche Eingaben
- **BUST-Erkennung:** Automatische Validierung (zu hoch, auf 1, unter 0, kein Double)

### ✅ Statistiken
- **Live-Stats:** 180er, 140+, High Score, Dart-Count
- **Match-Ende-Screen:** Detaillierte Match-Zusammenfassung mit Winner-Animation
- **Historische Daten:** Alle Würfe und Legs werden gespeichert

---

## 🗂️ Projektstruktur

```
bullseyer/
├── index.html              # Entry Point
├── css/
│   ├── tailwind.css       # Tailwind Source
│   └── output.css         # Compiled CSS (Build-Artefakt)
├── js/
│   ├── main.js            # Router & Orchestrator
│   ├── auth.js            # Authentifizierung
│   ├── supabase.js        # Echtes Backend (nicht aktiv)
│   ├── supabase-mock.js   # Mock-Backend (localStorage) ✅ AKTIV
│   ├── livescoring.js     # Live-Scoring UI & Logik
│   ├── scorer.js          # Leg-Klasse & Scoring-Logik
│   ├── pairing.js         # Round-Robin-Pairing
│   ├── stats.js           # Statistik-Aggregation
│   └── export.js          # Excel-Export
├── CLAUDE.md              # Technische Dokumentation für Entwickler
├── MOCK-MODE.md           # Mock-Modus Anleitung
└── README.md              # Diese Datei
```

---

## 🛠️ Entwicklung

### CSS kompilieren

Falls du Tailwind-Styles änderst:

```bash
npm install
npm run build:css
```

Dies kompiliert `css/tailwind.css` → `css/output.css` mit Minifizierung.

### Debugging

Öffne die Browser-Konsole (F12), um detaillierte Logs zu sehen:

```javascript
// Mock-Datenbank inspizieren
debugMockDB()

// Mock-Daten komplett zurücksetzen
resetMockDB()
```

### Technische Dokumentation

📖 **Für Entwickler:** Siehe [CLAUDE.md](./CLAUDE.md)
- Architektur & Module
- State Management
- Event Handling
- Datenbank-Schema
- Supabase-Integration

---

## 🔄 Wechsel zu echtem Backend

Die App kann mit **Supabase** als echtes Backend betrieben werden:

### 1. Supabase-Projekt einrichten

1. Erstelle ein kostenloses Projekt auf [supabase.com](https://supabase.com)
2. Führe das Datenbank-Schema aus (siehe `CLAUDE.md`)
3. Kopiere deine Credentials

### 2. Credentials eintragen

Bearbeite `js/supabase.js`:

```javascript
const supabaseUrl = 'DEINE_SUPABASE_URL';
const supabaseAnonKey = 'DEIN_ANON_KEY';
```

### 3. Imports ändern

Ändere in **3 Dateien** den Import von `supabase-mock.js` zu `supabase.js`:

- `js/main.js` (Zeile 3)
- `js/auth.js` (Zeile 2)
- `js/livescoring.js` (Zeile 2)

```javascript
// Von:
import { supabase } from './supabase-mock.js';

// Zu:
import { supabase } from './supabase.js';
```

Fertig! Die App nutzt jetzt echte Authentifizierung und Cloud-Speicherung.

---

## 🎮 Spielanleitung

### 1. Spieltag erstellen

1. **Dashboard öffnen** (nach Login automatisch)
2. **Spieler auswählen** (blau anklicken, mindestens 2)
3. **Konfiguration:**
   - Best of Sets (z.B. 3)
   - Best of Legs (z.B. 3)
   - Anzahl Boards (1-8)
4. **"Spieltag starten"** klicken
   - Automatische Round-Robin-Paarungen werden erstellt

### 2. Match starten

1. **Scorer öffnen** (Navigation oder Match aus Liste wählen)
2. **Match anklicken** (z.B. "Alice vs Bob, Board 1")
3. **Startspieler wählen** (nur beim ersten Leg)

### 3. Score eingeben

**Variante A: Ziffernblock (flexibel)**
1. Zahlen eingeben (z.B. "20")
2. Multiplier wählen: **S** (Single), **D** (Double), **T** (Triple)
3. "Weiter →" für nächsten Dart
4. Nach 3 Darts: "Score eingeben"

**Variante B: Quick-Score-Buttons**
- Klicke auf vorgefertigte Scores (0, 26, 41, 60, 81, 100, 140, 180)
- Score wird automatisch auf 3 Darts verteilt

### 4. Finish mit Double-Out

Bei Remaining = 32:
1. Gib "16" ein
2. Klicke **D** (Double-Button)
3. Display zeigt "D16"
4. "Score eingeben" → Leg gewonnen! 🎉

**Ohne D-Button:** BUST-Nachricht "Muss mit Double finishen"

### 5. Statistiken ansehen

Während des Matches:
- Klicke auf **"Details ▼"** im Statistik-Panel

Nach dem Match:
- Automatischer Match-Ende-Screen mit Winner-Animation

---

## 🧪 Mock-Modus Details

**Aktueller Status:** ✅ Mock-Modus AKTIV

**Was funktioniert:**
- ✅ Volle App-Funktionalität
- ✅ Alle Features (Scoring, Stats, Undo)
- ✅ Multi-Board-Support
- ✅ localStorage-Persistierung

**Einschränkungen:**
- ❌ Keine echte Authentifizierung
- ❌ Keine Sync zwischen Geräten
- ❌ Daten gehen bei Cache-Löschen verloren

📖 **Ausführliche Anleitung:** [MOCK-MODE.md](./MOCK-MODE.md)

---

## 📦 Tech Stack

- **Frontend:** Vanilla JavaScript (ES6 modules)
- **Styling:** Tailwind CSS (via CDN)
- **Backend (optional):** Supabase (PostgreSQL + Real-time)
- **PWA:** Service Worker für Offline-Support
- **Build:** Keine Bundler - direkt im Browser lauffähig

---

## 🐛 Troubleshooting

### Server startet nicht
```bash
# Prüfe ob Port 8000 frei ist
lsof -i :8000

# Verwende anderen Port
python -m http.server 8001
```

### Seite lädt nicht
- Browser-Cache leeren (Strg+Shift+R / Cmd+Shift+R)
- Konsole öffnen (F12) und Fehler prüfen

### Mock-Daten zurücksetzen
```javascript
// In Browser-Konsole (F12):
localStorage.clear();
location.reload();
```

### CSS-Änderungen werden nicht angezeigt
```bash
npm run build:css
# Dann Seite neu laden
```

---

## 🤝 Contributing

Dieses Projekt nutzt:
- GitHub Issues für Bug-Reports
- Pull Requests für Features

Siehe [CLAUDE.md](./CLAUDE.md) für Architektur-Details.

---

## 📄 Lizenz

ISC License

---

## 🎯 Projekt-Status

**Aktuelle Version:** 1.0.0 (Voll funktionsfähig im Mock-Modus)

**Letzte Updates:**
- ✅ S/D/T Multiplier-Buttons
- ✅ Checkout-Vorschläge
- ✅ Live-Statistiken
- ✅ Match-Ende-Screen
- ✅ BUST-Validierung
- ✅ Undo-Funktion

**Roadmap:**
- Optional: Animations & Feedback verbessern
- Optional: Backend-Integration mit Supabase

---

**Happy Darting! 🎯**

Made with ❤️ for the Darts Community
