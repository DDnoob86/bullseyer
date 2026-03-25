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

**`js/main.js`** - Main application orchestrator
- Route handling and page rendering
- Dashboard logic (player selection, game day creation, round-robin pairing)
- Match selection and initialization
- Global state management for current match/leg/set

**`js/auth.js`** - Authentication wrapper
- `signUp()` - User registration
- `login()` - Email/password authentication
- `logout()` - Session termination
- `getCurrentUser()` - Session retrieval
- `onAuthChange()` - Auth state listener

**`js/supabase.js`** - Database client configuration
- Supabase client initialization
- Real-time subscription helper (`subscribeTo()`)
- **Contains credentials** - anon key is exposed (Row-Level Security enforced on backend)

**`js/pairing.js`** - Match pairing logic
- `generateRoundRobin()` - Creates all unique player pairings for a game day

**`js/scorer.js`** - Leg scoring logic
- `Leg` class - Manages individual leg state (501 down)
  - Tracks throws, remaining scores, double-in/double-out validation
  - Bust detection, winner determination
  - Statistics: duration, throw count, 3-dart average

**`js/livescoring.js`** - Live scoring UI and state management
- `renderLiveScorer()` - Main scoring interface render function
- Complex state management using both local variables and `window` globals
- Event delegation for score input (digital keypad + quick-score buttons)
- Automatic leg/set progression when reaching 0
- Undo functionality for throw correction
- Real-time average calculation (both leg and match averages)
- `resetLeg()` - Creates new leg in database and returns `Leg` instance
- `saveLeg()` - Persists completed leg to Supabase

**`js/export.js`** - Data export
- `exportGameDay()` - Exports match data to Excel using SheetJS

**`js/stats.js`** - Statistics aggregation
- `aggregateStats()` - Calculates player statistics from throws

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

The app uses a hybrid state management approach:

1. **Module-level variables** in `main.js`:
   - `currentMatch`, `currentLeg`, `currentLegNo`, `currentSetNo`
   - `setsWon`, `remainingP1`, `remainingP2`, `currentPlayer`
   - Persisted via `localStorage` (keys: `bullseyer_board`, `bullseyer_currentMatchId`, `bullseyer_gameday`)

2. **Window globals** in `livescoring.js`:
   - All local state is mirrored to `window` object for event delegation handlers
   - `window._lastRenderArgs` - Preserves render arguments between UI updates
   - `window.throwHistory` - Undo stack for current leg
   - `window.allMatchThrows` - Match-wide throw history for averages

3. **State synchronization**:
   - `syncLocalVars()` syncs local variables with window globals
   - `updateStateFn()` callback propagates state changes to `main.js`

### Event Handling Patterns

**Event Delegation** (livescoring.js):
- Global `click` listener on `document.body` with `window._bullseyerDelegationHandler`
- Handles quick-score buttons with `data-score` attribute
- Prevents double-triggering with lock mechanism
- Excludes keypad buttons (handled separately)

**Direct Event Handlers**:
- Keypad buttons: initialized once with `data-bullseyer-initialized` flag
- Undo button: uses container-level `data-bullseyer-undo-initialized` flag
- Submit score: manual score input handler

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

- **State Synchronization**: Always use `syncLocalVars()` after modifying window globals to keep local and global state aligned
- **UI Updates**: Call `updateRestpunkteUI()`, `updateSetsLegsUI()`, and `updateAverages()` after state changes to keep display consistent
- **Event Handler Duplication**: Check for `data-bullseyer-initialized` flags before adding event listeners to prevent duplicates on re-renders
- **Leg Creation Timing**: `resetLeg()` is async (inserts to DB) - ensure it completes before allowing throws
- **Player IDs**: Use string comparison for player IDs from Supabase (UUIDs), not numeric comparison
- **Board Comparison**: Convert board numbers to strings for comparison (`String(board)`)

## Supabase Configuration

The app uses Supabase's anon key (public, safe to expose):
- URL: `https://jisqjympggmtgfnkixjl.supabase.co`
- Row-Level Security (RLS) enforces data access rules on backend
- Real-time subscriptions used for live updates (not currently active but infrastructure exists)
