// Match Service - alle Match-bezogenen DB-Operationen
import { supabase } from '../supabase-mock.js';
import { Leg } from '../scorer.js';

/**
 * Generiert eine UUID (mit Fallback)
 */
function generateUUID() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Holt ein Match mit allen Spielerdaten
 * @param {string} matchId - Die Match-ID
 * @returns {Promise<Object|null>} Das Match-Objekt oder null
 */
export async function getMatchById(matchId) {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`*, p1:users!matches_p1_id_fkey(id, name), p2:users!matches_p2_id_fkey(id, name)`)
      .eq('id', matchId)
      .single();

    if (error) {
      console.error('[MatchService] Fehler beim Laden des Matches:', error);
      return null;
    }

    // Spielernamen ins Match-Objekt kopieren
    if (data) {
      data.p1_name = data.p1?.name || 'Spieler 1';
      data.p2_name = data.p2?.name || 'Spieler 2';
    }

    return data;
  } catch (err) {
    console.error('[MatchService] Exception beim Laden des Matches:', err);
    return null;
  }
}

/**
 * Holt offene Matches für ein Board
 * @param {string|number} board - Die Board-Nummer
 * @param {boolean} withDate - Ob das Gameday-Datum mit geladen werden soll
 * @returns {Promise<Array>} Liste der offenen Matches
 */
export async function getOpenMatchesForBoard(board, withDate = false) {
  try {
    let selectStr = 'id, p1_id, p2_id, best_of_sets, best_of_legs, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name)';
    if (withDate) {
      selectStr += ', gameday:gamedays(date)';
    }

    const { data, error } = await supabase
      .from('matches')
      .select(selectStr)
      .eq('board', Number(board))
      .is('finished_at', null);

    if (error) {
      console.error('[MatchService] Fehler beim Laden der Matches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[MatchService] Exception beim Laden der Matches:', err);
    return [];
  }
}

/**
 * Holt alle Boards mit offenen Matches
 * @returns {Promise<Array<string>>} Liste der Board-Nummern als Strings
 */
export async function getBoardsWithOpenMatches() {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('board')
      .is('finished_at', null);

    if (error) {
      console.error('[MatchService] Fehler beim Laden der Boards:', error);
      return ['1'];
    }

    if (!data || data.length === 0) {
      return ['1'];
    }

    const boards = [...new Set(data.map(m => String(m.board)))].sort((a, b) => Number(a) - Number(b));
    return boards.length > 0 ? boards : ['1'];
  } catch (err) {
    console.error('[MatchService] Exception beim Laden der Boards:', err);
    return ['1'];
  }
}

/**
 * Markiert ein Match als beendet
 * @param {string} matchId - Die Match-ID
 * @param {string} winnerId - Die Spieler-ID des Gewinners
 * @returns {Promise<boolean>} Erfolg
 */
export async function finishMatch(matchId, winnerId) {
  try {
    const { error } = await supabase
      .from('matches')
      .update({
        finished_at: new Date().toISOString(),
        winner_id: winnerId
      })
      .eq('id', matchId);

    if (error) {
      console.error('[MatchService] Fehler beim Match-Update:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[MatchService] Exception beim Match-Update:', err);
    return false;
  }
}

/**
 * Erstellt ein neues Leg in der Datenbank
 * @param {Object} match - Das Match-Objekt
 * @param {number} setNo - Set-Nummer
 * @param {number} legNo - Leg-Nummer
 * @returns {Leg} Das Leg-Objekt mit ID
 */
export function createLeg(match, setNo, legNo) {
  const legId = generateUUID();
  const leg = new Leg({ legId, doubleIn: false, doubleOut: true });

  // Async DB-Insert (fire-and-forget mit Logging)
  (async () => {
    try {
      const { error } = await supabase.from('legs').insert({
        id: leg.id,
        match_id: match?.id || null,
        set_no: setNo || 1,
        leg_no: legNo || 1,
        starter: match?.p1_id || null,
        start_score: 501
      });

      if (error) {
        console.error('[MatchService] Fehler beim Anlegen des Legs:', error);
      } else {
        console.log('[MatchService] Leg erstellt:', leg.id);
      }
    } catch (err) {
      console.error('[MatchService] Exception beim Anlegen des Legs:', err);
    }
  })();

  return leg;
}

/**
 * Aktualisiert ein Leg nach Beendigung
 * @param {Object} match - Das Match-Objekt
 * @param {Object} leg - Das Leg-Objekt
 * @param {number} setNo - Set-Nummer
 * @param {number} legNo - Leg-Nummer
 * @param {number} remainingP1 - Restpunkte von P1 (0 = P1 hat gewonnen)
 * @param {boolean} bullfinish - Ob mit Bull geendet wurde
 * @returns {Promise<boolean>} Erfolg
 */
export async function saveLeg(match, leg, setNo, legNo, remainingP1, bullfinish) {
  try {
    const { error } = await supabase.from('legs').update({
      match_id: match.id,
      set_no: setNo,
      leg_no: legNo,
      starter: match.p1_id,
      start_score: 501,
      finish_darts: leg.throwCount,
      duration_s: leg.durationSeconds,
      winner_id: remainingP1 === 0 ? match.p1_id : match.p2_id,
      bullfinish: !!bullfinish
    }).eq('id', leg.id);

    if (error) {
      console.error('[MatchService] Fehler beim Speichern des Legs:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[MatchService] Exception beim Speichern des Legs:', err);
    return false;
  }
}

/**
 * Speichert einen Wurf in der Datenbank
 * @param {Object} params - Wurf-Parameter
 * @returns {Promise<boolean>} Erfolg
 */
export async function saveThrow({
  matchId,
  legId,
  playerId,
  dart1,
  dart2,
  dart3,
  total,
  isFinish,
  orderNo
}) {
  try {
    const insertObj = {
      id: generateUUID(),
      match_id: matchId,
      leg_id: legId,
      player_id: playerId,
      dart1: dart1 || 0,
      dart2: dart2 || 0,
      dart3: dart3 || 0,
      total: total,
      score: total,
      is_finish: isFinish,
      order_no: orderNo,
      order: orderNo,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('throws').insert([insertObj]);

    if (error) {
      console.error('[MatchService] Fehler beim Speichern des Wurfs:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[MatchService] Exception beim Speichern des Wurfs:', err);
    return false;
  }
}

/**
 * Holt alle offenen Matches (für Dashboard)
 * @returns {Promise<Array>} Liste aller offenen Matches mit Spielerdaten
 */
export async function getAllOpenMatches() {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('id, finished_at, gameday_id, board, p1:users!matches_p1_id_fkey(name), p2:users!matches_p2_id_fkey(name), gameday:gamedays(date)')
      .is('finished_at', null)
      .order('gameday_id', { ascending: false });

    if (error) {
      console.error('[MatchService] Fehler beim Laden aller offenen Matches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[MatchService] Exception beim Laden aller offenen Matches:', err);
    return [];
  }
}

/**
 * Prüft ob alle Matches eines Spieltags beendet sind.
 * Wenn ja, werden Spieltag + alle zugehörigen Daten (Matches, Legs, Throws) gelöscht.
 * (Season-Stats sind bereits separat in stats_season gespeichert.)
 *
 * @param {string} gamedayId - Die Spieltag-ID
 * @returns {Promise<boolean>} true wenn der Spieltag gelöscht wurde
 */
export async function cleanupGamedayIfComplete(gamedayId) {
  if (!gamedayId) return false;

  try {
    // Alle Matches dieses Spieltags laden
    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, finished_at')
      .eq('gameday_id', gamedayId);

    if (error || !matches || matches.length === 0) return false;

    // Prüfe ob noch offene Matches existieren
    const openMatches = matches.filter(m => !m.finished_at);
    if (openMatches.length > 0) return false;

    console.log(`[MatchService] Spieltag ${gamedayId} komplett — räume auf (${matches.length} Matches)`);

    // Alle Throws, Legs, Matches löschen
    const matchIds = matches.map(m => m.id);
    for (const mid of matchIds) {
      await supabase.from('throws').delete().eq('match_id', mid);
      await supabase.from('legs').delete().eq('match_id', mid);
    }
    for (const mid of matchIds) {
      await supabase.from('matches').delete().eq('id', mid);
    }

    // Spieltag löschen
    await supabase.from('gamedays').delete().eq('id', gamedayId);

    console.log(`[MatchService] Spieltag ${gamedayId} gelöscht`);
    return true;
  } catch (err) {
    console.error('[MatchService] Fehler beim Aufräumen des Spieltags:', err);
    return false;
  }
}
