# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bullseyer is a Progressive Web App (PWA) for tracking darts matches in real-time. It's built as a single-page application using vanilla JavaScript modules with Supabase as the backend for authentication, real-time data sync, and storage.

**Tech Stack:**
- Vanilla JavaScript (ES6 modules)
- Supabase (authentication, database, real-time subscriptions)
- Tailwind CSS (via CDN)
- No build tools or bundlers

## Development Commands

### CSS Build
```bash
npm run build:css
```
Compiles Tailwind CSS from `css/tailwind.css` to `css/output.css` with minification.

### Local Development
Since this is a static PWA, serve the files using any local server:
```bash
python -m http.server 8000
# or
npx serve .
```

## Architecture

### Application Structure

**Entry Point:** `index.html` → `js/main.js`

The app uses a hash-based router (`window.onhashchange`) with the following routes:
- `#/login` - Login page
- `#/register` - User registration
- `#/dashboard` - Game day configuration and match overview
- `#/scorer` - Match selection screen
- `#/livescorer` - Live scoring interface (main scoring UI)
- `#/stats` - Statistics display

### Module Organization

**`js/main.js`** - Thin application orchestrator (~50 lines)
- Registers routes via `router.js`
- Mock-mode auto-login
- Auth state listener setup

**`js/router.js`** - Hash-based SPA router
- Route registration and matching (longest prefix first)
- Automatic cleanup of previous page on route change
- Active navigation highlighting

**`js/auth.js`** - Authentication wrapper
- `signUp()`, `login()`, `logout()`, `getCurrentUser()`, `onAuthChange()`

**`js/supabase.js`** - Database client configuration
- Supabase client initialization + Real-time subscription helper
- **Contains credentials** - anon key is exposed (RLS enforced on backend)

**`js/pairing.js`** - Round-robin scheduling with simultaneous rounds
- `generateRoundRobinRounds()` - Circle method algorithm
- `distributeToBoards()` - Distributes rounds across boards

**`js/scorer.js`** - Leg scoring logic
- `Leg` class - Manages individual leg state (501 down)

**UI Layer (`js/ui/`):**

- **`ui/auth.js`** - Login & registration pages
- **`ui/dashboard.js`** - Game day management, player selection, templates, config form
- **`ui/scorer.js`** - Board selection, match list, match start, active match resolution
- **`ui/players.js`** - Player CRUD management
- **`ui/stats.js`** - Statistics page with ranking, player detail, CSV export

**Livescorer (`js/ui/livescorer/`):**

- **`index.js`** - Main render function, HTML building, component coordination
- **`score-processor.js`** - **Single source of truth** for score processing (bust checks, checkout dialog, DB save, state update). Used by both Quick-Score buttons and Numpad.
- **`events.js`** - Quick-Score event delegation, undo handler, starter selection, back button
- **`keypad.js`** - Numpad input, score/rest mode toggle, input validation
- **`display.js`** - All UI update functions (remaining, sets/legs, averages, player indicator, checkout hints)
- **`game-logic.js`** - Leg/Set/Match end handling, match end screen with statistics
- **`dialogs.js`** - Checkout dialog, bust toast, leg/set won overlays

**Services (`js/services/`):**

- **`match.js`** - All match-related DB operations (CRUD for matches, legs, throws)
- **`stats.js`** - Average calculations, season stats updates, CSV export

**State (`js/state/`):**

- **`store.js`** - Centralized state manager with getters, setters, batch updates, subscriber pattern

**Utils (`js/utils/`):**

- **`constants.js`** - Magic numbers, player keys, storage keys, dart distribution
- **`players.js`** - Player name resolution, winner determination, player switching
- **`checkouts.js`** - Checkout validation, suggestions, minimum darts calculation

**`js/export.js`** - Excel export (SheetJS)

### Database Schema (Supabase)

**Tables:**
- `users` - Player profiles (linked to Supabase auth)
- `gamedays` - Game day records with date
- `matches` - Match records with players, best-of configuration, board assignment
  - References: `p1_id`, `p2_id` → `users.id`
  - References: `gameday_id` → `gamedays.id`
  - Unique constraint: `pair_key` (ensures unique pairings per game day)
  - Fields: `best_of_sets`, `best_of_legs`, `double_out`, `finished_at`, `board`
- `legs` - Individual leg records
  - References: `match_id` → `matches.id`
  - References: `winner_id` → `users.id`
  - Fields: `set_no`, `leg_no`, `starter`, `start_score`, `finish_darts`, `duration_s`, `bullfinish`
- `throws` - Individual throw records (3-dart throws stored as single score)
  - References: `match_id` → `matches.id`
  - References: `leg_id` → `legs.id`
  - References: `player_id` → `users.id`
  - Fields: `dart1`, `dart2`, `dart3`, `total`, `score`, `is_finish`, `order_no`, `order`
- `stats_season` - Aggregated player statistics
  - Fields: `avg3`, `legs_won`, `sets_won`, `high_finish`, `bull_finishes`, `short_games`, `_180s`, `_140s`, `_100s`

### State Management

Centralized in `js/state/store.js`:
- Private state object with getters/setters (no window globals)
- Subscriber pattern for reactive updates
- Batch updates via `updateState()`
- Lifecycle methods: `initNewMatch()`, `startNewLeg()`, `startNewSet()`, `resetState()`
- Persisted via `localStorage` (keys: `bullseyer_board`, `bullseyer_currentMatchId`, `bullseyer_gameday`)

### Event Handling Patterns

**Event Delegation** (`events.js`):
- Global `click` listener on `document.body` for quick-score buttons
- Cleaned up via `cleanupEventDelegation()` on route change (called by router cleanup)
- Prevents double-triggering with lock mechanism

**Direct Event Handlers** (`keypad.js`):
- Initialized once with `data-bullseyer-initialized` flag
- Undo button: uses container-level `data-bullseyer-undo-initialized` flag

**Route Cleanup**:
- Router calls cleanup function returned by `renderScorer()` on route change
- Ensures event delegation handlers are removed

### Critical Implementation Details

1. **Board System**: All matches are created on Board 1 (`board: 1`), but UI supports multiple boards for future extension.

2. **Leg Lifecycle**:
   - New leg created in database immediately via `resetLeg()` to establish foreign key for throws
   - Throws saved to `throws` table in real-time
   - Leg completed/saved to `legs` table when player reaches 0
   - Automatic progression to next leg/set without user confirmation

3. **Scoring Flow**:
   - Two input methods: digital keypad (custom scores) or quick-score buttons (common scores)
   - Score validation: cannot exceed remaining points
   - Automatic player switching after each throw
   - Bust detection and leg-end validation in `Leg` class

4. **Match Initialization**:
   - Dashboard creates game day and all matches upfront using round-robin pairing
   - Unique constraint prevents duplicate pairings on same game day
   - Match selection loads full player data from Supabase before starting

5. **Average Calculation**:
   - **Leg Average**: calculated from `throwHistory` (current leg only)
   - **Match Average**: calculated from `allMatchThrows` (entire match)
   - Both persist through leg transitions

## Common Gotchas

- **Score Processing**: All score logic (bust checks, checkout, DB save) goes through `score-processor.js` — never duplicate this logic
- **UI Updates**: Call `updateAllDisplays(bestSet, bestLeg)` after state changes — it handles all sub-updates
- **Event Handler Duplication**: Check for `data-bullseyer-initialized` flags before adding event listeners to prevent duplicates on re-renders
- **Route Cleanup**: `renderScorer()` returns a cleanup function — the router calls it automatically on route change
- **Leg Creation Timing**: `createLeg()` fires async DB insert (fire-and-forget) — leg ID is generated client-side
- **Player IDs**: Use string comparison for player IDs from Supabase (UUIDs), not numeric comparison
- **Board Comparison**: Convert board numbers to strings for comparison (`String(board)`)
- **Navigation**: Use `navigateTo('#/route')` from `router.js` instead of `window.location.hash` directly

## Supabase Configuration

The app uses Supabase's anon key (public, safe to expose):
- URL: `https://jisqjympggmtgfnkixjl.supabase.co`
- Row-Level Security (RLS) enforces data access rules on backend
- Real-time subscriptions used for live updates (not currently active but infrastructure exists)
