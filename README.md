# 🎯 Bullseyer - Darts Live Scoring App

Eine Progressive Web App (PWA) für Echtzeit-Darts-Scoring mit professioneller Match-Verwaltung, Multi-Board-Support und detaillierten Statistiken.

## 🚀 Quick Start

### 1. Server starten

Die App ist eine statische PWA und benötigt nur einen einfachen HTTP-Server:

```bash
npm start
```

### 2. Website aufrufen

```
http://localhost:8000
```

### 3. Losspielen

Die App läuft im **Mock-Modus** (ohne echtes Backend):
- Wird automatisch eingeloggt
- Spieler über „Spieler"-Seite anlegen
- Daten werden im Browser (localStorage) gespeichert

📖 **Mehr Infos zum Mock-Modus:** Siehe [MOCK-MODE.md](./MOCK-MODE.md)

---

## 📋 Features

### Match-Verwaltung
- **Spieltag-Organisation:** Game Days mit automatischen Round-Robin-Paarungen (Circle-Method-Algorithmus)
- **Multi-Board-Support:** 1–8 Boards parallel, Matches werden gleichmäßig verteilt
- **Flexible Konfiguration:** Best-of-Sets, Best-of-Legs, Double-Out
- **Spieltag-Vorlagen:** Spieler + Einstellungen als wiederverwendbare Vorlagen speichern
- **Spieltag-Verwaltung:** Einstellungen nachträglich ändern, einzelne Matches oder ganze Spieltage löschen

### Live-Scoring
- **Zwei Eingabe-Modi:**
  - **Score-Modus:** Geworfene Punkte direkt eingeben (Numpad oder Quick-Score-Buttons)
  - **Rest-Modus:** Verbleibende Punkte eingeben, Score wird automatisch berechnet
- **Quick-Score-Buttons:** 180, 140, 100, 85, 60, 45, 41, 26
- **Checkout-Vorschläge:** Automatische Finish-Empfehlungen ab 170 (Double-Out)
- **Checkout-Dialog:** Bei Finish → Darts zum Checkout + Bullfinish-Option wählen
- **Undo-Funktion:** Letzten Wurf rückgängig machen
- **BUST-Erkennung:** Zu hoch, auf 1, kein gültiger Checkout
- **Startspieler-Auswahl:** Vor dem ersten Leg
- **Automatische Leg/Set-Progression:** Overlays bei Leg-/Set-Gewinn

### Statistiken
- **Live-Stats im Match:** Leg-Ø, Match-Ø, 180er, 140+, Highscore, Darts pro Leg/Match
- **Match-Ende-Screen:** Detaillierte Zusammenfassung mit Leg-Übersicht, High Finishes, Bullfinishes
- **Statistik-Seite:** Rangliste mit Punktesystem, Spieltag-Filter, Spieler-Detailansicht
- **CSV-Export:** Rangliste + Match-Historie als CSV (deutsche Excel-Kompatibilität mit Semikolon)

### Spielerverwaltung
- Spieler anlegen, bearbeiten, löschen
- Werden in Match-Paarungen und Statistiken verwendet

---

## 🗂️ Projektstruktur

```
bullseyer/
├── index.html                  # Entry Point + Header/Navigation
├── css/
│   ├── tailwind.css            # Tailwind Source
│   └── output.css              # Compiled CSS
├── js/
│   ├── main.js                 # App-Orchestrator (~50 Zeilen)
│   ├── router.js               # Hash-basierter SPA-Router mit Cleanup
│   ├── auth.js                 # Authentifizierung
│   ├── supabase.js             # Echtes Supabase-Backend
│   ├── supabase-mock.js        # Mock-Backend (localStorage) ✅ AKTIV
│   ├── scorer.js               # Leg-Klasse (501 down)
│   ├── pairing.js              # Round-Robin mit echten Runden
│   ├── export.js               # Excel-Export (SheetJS)
│   ├── state/
│   │   └── store.js            # Zentraler State Manager
│   ├── services/
│   │   ├── match.js            # Match/Leg/Throw DB-Operationen
│   │   └── stats.js            # Statistik-Berechnungen + CSV
│   ├── ui/
│   │   ├── auth.js             # Login & Register Pages
│   │   ├── dashboard.js        # Spieltag-Verwaltung & Konfiguration
│   │   ├── scorer.js           # Board-Auswahl & Match-Liste
│   │   ├── players.js          # Spielerverwaltung (CRUD)
│   │   ├── stats.js            # Statistik-Seite mit Rangliste
│   │   └── livescorer/
│   │       ├── index.js        # Livescorer-Hauptmodul & HTML
│   │       ├── score-processor.js  # Zentrale Score-Verarbeitung
│   │       ├── events.js       # Quick-Score Event-Delegation
│   │       ├── keypad.js       # Numpad + Score/Rest-Modus
│   │       ├── display.js      # Alle UI-Updates
│   │       ├── game-logic.js   # Leg/Set/Match-Ende + Endscreen
│   │       └── dialogs.js      # Checkout, Bust-Toast, Overlays
│   └── utils/
│       ├── constants.js        # Konstanten, Dart-Verteilung
│       ├── players.js          # Spieler-Utilities
│       └── checkouts.js        # Checkout-Tabelle & Vorschläge
├── CLAUDE.md                   # Technische Dokumentation
├── MOCK-MODE.md                # Mock-Modus Anleitung
└── README.md                   # Diese Datei
```

---

## 🛠️ Entwicklung

### CSS kompilieren

Falls du Tailwind-Styles änderst:

```bash
npm install
npm run build:css
```

### Debugging

Browser-Konsole (F12):

```javascript
debugMockDB()    // Mock-Datenbank inspizieren
resetMockDB()    // Alle Daten löschen & neu laden
```

### Technische Dokumentation

📖 **Für Entwickler:** Siehe [CLAUDE.md](./CLAUDE.md) — Architektur, State Management, DB-Schema

---

## 🔄 Wechsel zu echtem Backend (Supabase)

### 1. Supabase-Projekt einrichten

1. Erstelle ein Projekt auf [supabase.com](https://supabase.com)
2. Führe das Datenbank-Schema aus (siehe `CLAUDE.md`)
3. Kopiere URL + Anon-Key

### 2. Credentials eintragen

Bearbeite `js/supabase.js`:

```javascript
const SUPABASE_URL = 'DEINE_SUPABASE_URL';
const SUPABASE_KEY = 'DEIN_ANON_KEY';
```

### 3. Imports ändern

Ändere in **allen Dateien** den Import von `supabase-mock.js` zu `supabase.js`:

```bash
# Betroffene Dateien:
js/main.js
js/auth.js
js/services/match.js
js/services/stats.js
js/ui/dashboard.js
js/ui/scorer.js
js/ui/players.js
js/ui/stats.js
```

```javascript
// Von:
import { supabase } from './supabase-mock.js';
// Zu:
import { supabase } from './supabase.js';
```

> **Tipp:** Suche & Ersetze `supabase-mock.js` → `supabase.js` im gesamten `js/`-Ordner.

### 4. Auto-Login deaktivieren

In `js/main.js` die `autoLoginForTesting()`-Funktion entfernen und die Login-Routen aktivieren.

---

## 🎮 Spielanleitung

### 1. Spieler anlegen

1. **Navigation → „Spieler"**
2. Namen eingeben → „Hinzufügen"

### 2. Spieltag erstellen

1. **Dashboard** öffnen
2. **Spieler auswählen** (blau anklicken, mindestens 2)
3. **Konfiguration:** Best-of-Sets, Best-of-Legs, Boards, Double-Out
4. Optional: **Vorlage speichern** für schnelles Wiederholen
5. **„Spieltag starten"** → Round-Robin-Paarungen werden erstellt

### 3. Match spielen

1. **Scorer** → Board wählen → Match anklicken
2. **Startspieler wählen** (nur beim ersten Leg)
3. **Score eingeben:**
   - **Numpad:** Zahl tippen → OK drücken
   - **Quick-Score:** Button mit Score klicken (z.B. 60, 100, 180)
   - **Rest-Modus:** „🔄 Rest" aktivieren → verbleibende Punkte eingeben
4. Bei Checkout: Darts zum Finish wählen + optional Bullfinish markieren

### 4. Statistiken

- **Während des Matches:** Stats-Panel aufklappen
- **Nach Match-Ende:** Detaillierter Endscreen mit Export-Option
- **Statistik-Seite:** Rangliste, Spieler-Detail, CSV-Export

---

## 📦 Tech Stack

| Technologie | Verwendung |
|---|---|
| Vanilla JavaScript | ES6 Modules, kein Framework |
| Tailwind CSS | Via CDN, Dark Mode |
| Supabase | PostgreSQL + Auth + Realtime (optional) |
| localStorage | Mock-Backend für Offline-Betrieb |
| PWA | Service Worker für Offline-Support |

**Kein Build-Step nötig** — direkt im Browser lauffähig.

---

## 🐛 Troubleshooting

| Problem | Lösung |
|---|---|
| Server startet nicht | `lsof -i :8000` prüfen, anderen Port verwenden |
| Seite lädt nicht | Cache leeren (Cmd+Shift+R), Konsole prüfen |
| Mock-Daten zurücksetzen | `localStorage.clear(); location.reload();` |
| CSS-Änderungen nicht sichtbar | `npm run build:css` ausführen |

---

## 📄 Lizenz

ISC License

---

**Happy Darting! 🎯**
