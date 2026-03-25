// ⚠️ ACHTUNG: MOCK-MODUS FÜR TESTZWECKE OHNE SUPABASE-BACKEND ⚠️
// Diese Datei simuliert Supabase mit localStorage
// Für Production: Echte Supabase-Credentials in supabase.js eintragen!

// Mock localStorage-basierte Datenbank
const mockDB = {
  users: JSON.parse(localStorage.getItem('mock_users') || '[]'),
  gamedays: JSON.parse(localStorage.getItem('mock_gamedays') || '[]'),
  matches: JSON.parse(localStorage.getItem('mock_matches') || '[]'),
  legs: JSON.parse(localStorage.getItem('mock_legs') || '[]'),
  throws: JSON.parse(localStorage.getItem('mock_throws') || '[]'),
  stats_season: JSON.parse(localStorage.getItem('mock_stats_season') || '[]'),
  currentUser: JSON.parse(localStorage.getItem('mock_currentUser') || 'null')
};

// Hilfsfunktionen
function saveDB() {
  localStorage.setItem('mock_users', JSON.stringify(mockDB.users));
  localStorage.setItem('mock_gamedays', JSON.stringify(mockDB.gamedays));
  localStorage.setItem('mock_matches', JSON.stringify(mockDB.matches));
  localStorage.setItem('mock_legs', JSON.stringify(mockDB.legs));
  localStorage.setItem('mock_throws', JSON.stringify(mockDB.throws));
  localStorage.setItem('mock_stats_season', JSON.stringify(mockDB.stats_season));
  localStorage.setItem('mock_currentUser', JSON.stringify(mockDB.currentUser));
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Mock Supabase Auth
const mockAuth = {
  async signUp({ email, password, options }) {
    const userId = generateUUID();
    const user = {
      id: userId,
      email,
      created_at: new Date().toISOString()
    };

    // User in users-Tabelle eintragen
    mockDB.users.push({
      id: userId,
      name: options?.data?.name || email.split('@')[0],
      created_at: new Date().toISOString()
    });

    mockDB.currentUser = user;
    saveDB();

    return { data: { user, session: { user } }, error: null };
  },

  async signInWithPassword({ email, password }) {
    const user = mockDB.users.find(u => u.name === email || u.id === email);
    if (!user) {
      return { data: null, error: { message: 'User nicht gefunden (Mock-Modus)' } };
    }

    mockDB.currentUser = { id: user.id, email: user.name + '@test.com' };
    saveDB();

    return {
      data: {
        user: mockDB.currentUser,
        session: { user: mockDB.currentUser }
      },
      error: null
    };
  },

  async signOut() {
    mockDB.currentUser = null;
    saveDB();
    return { error: null };
  },

  async getUser() {
    return { data: { user: mockDB.currentUser }, error: null };
  },

  onAuthStateChange(callback) {
    // Simuliere Auth-Event
    setTimeout(() => {
      if (mockDB.currentUser) {
        callback('SIGNED_IN', { user: mockDB.currentUser });
      } else {
        callback('SIGNED_OUT', null);
      }
    }, 100);
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
};

// Mock Supabase Query Builder
class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.query = {};
    this.selectFields = '*';
  }

  select(fields = '*') {
    this.selectFields = fields;
    return this;
  }

  insert(data) {
    this.query.insert = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data) {
    this.query.update = data;
    return this;
  }

  delete() {
    this.query.delete = true;
    return this;
  }

  eq(field, value) {
    this.query.eq = this.query.eq || [];
    this.query.eq.push({ field, value });
    return this;
  }

  is(field, value) {
    this.query.is = this.query.is || [];
    this.query.is.push({ field, value });
    return this;
  }

  in(field, values) {
    this.query.in = this.query.in || [];
    this.query.in.push({ field, values });
    return this;
  }

  order(field, options) {
    this.query.order = { field, ...options };
    return this;
  }

  gte(field, value) {
    this.query.gte = this.query.gte || [];
    this.query.gte.push({ field, value });
    return this;
  }

  lte(field, value) {
    this.query.lte = this.query.lte || [];
    this.query.lte.push({ field, value });
    return this;
  }

  single() {
    this.query.single = true;
    return this;
  }

  async then(resolve) {
    // Execute query
    let result = await this.execute();
    resolve(result);
    return result;
  }

  async execute() {
    const data = mockDB[this.table];

    console.log(`[Mock-DB] Execute query on table: ${this.table}`);
    console.log(`[Mock-DB] Query:`, this.query);
    console.log(`[Mock-DB] Total records in ${this.table}:`, data?.length || 0);

    // INSERT
    if (this.query.insert) {
      const newRecords = this.query.insert.map(record => ({
        id: record.id || generateUUID(),
        ...record,
        created_at: record.created_at || new Date().toISOString()
      }));
      mockDB[this.table].push(...newRecords);
      saveDB();

      console.log(`[Mock-DB] INSERT ${this.table}:`, newRecords.length, 'records');
      console.log(`[Mock-DB] Total ${this.table}:`, mockDB[this.table].length);

      return { data: newRecords, error: null };
    }

    // DELETE
    if (this.query.delete) {
      const before = mockDB[this.table].length;
      const deleted = mockDB[this.table].filter(record => this.matchesFilters(record));
      mockDB[this.table] = mockDB[this.table].filter(record => !this.matchesFilters(record));
      saveDB();
      console.log(`[Mock-DB] DELETE ${this.table}: ${deleted.length} records removed (${before} → ${mockDB[this.table].length})`);
      return { data: deleted, error: null };
    }

    // UPDATE
    if (this.query.update) {
      let updated = [];
      mockDB[this.table] = mockDB[this.table].map(record => {
        if (this.matchesFilters(record)) {
          const updatedRecord = { ...record, ...this.query.update };
          updated.push(updatedRecord);
          return updatedRecord;
        }
        return record;
      });
      saveDB();
      return { data: updated, error: null };
    }

    // SELECT
    let filtered = data.filter(record => this.matchesFilters(record));
    console.log(`[Mock-DB] After filters: ${filtered.length} / ${data.length} records matched`);

    // ORDER BY
    if (this.query.order) {
      const { field, ascending = true } = this.query.order;
      filtered.sort((a, b) => {
        if (a[field] < b[field]) return ascending ? -1 : 1;
        if (a[field] > b[field]) return ascending ? 1 : -1;
        return 0;
      });
    }

    // Simulate JOINs for common patterns
    if (this.selectFields.includes('p1:users') || this.selectFields.includes('p2:users') || this.selectFields.includes('gameday:gamedays')) {
      filtered = filtered.map(match => {
        const p1 = mockDB.users.find(u => u.id === match.p1_id);
        const p2 = mockDB.users.find(u => u.id === match.p2_id);
        const gameday = mockDB.gamedays.find(g => g.id === match.gameday_id);

        console.log('[Mock-DB] JOIN Match:', match.id, 'P1:', p1?.name, 'P2:', p2?.name, 'Gameday:', gameday?.date);

        return {
          ...match,
          p1: p1 || { name: 'Spieler 1', id: match.p1_id },
          p2: p2 || { name: 'Spieler 2', id: match.p2_id },
          gameday: gameday || { date: new Date().toISOString().slice(0, 10) }
        };
      });
    }

    if (this.query.single) {
      return { data: filtered[0] || null, error: filtered[0] ? null : { code: 'PGRST116' } };
    }

    return { data: filtered, error: null };
  }

  matchesFilters(record) {
    // EQ filters
    if (this.query.eq) {
      for (const { field, value } of this.query.eq) {
        console.log(`[Mock-DB] EQ filter: ${field} => record[${field}]=${record[field]} (type: ${typeof record[field]}) vs value=${value} (type: ${typeof value})`);

        // Special handling for board field: compare as numbers
        if (field === 'board') {
          const recordBoard = Number(record[field]);
          const queryBoard = Number(value);
          console.log(`[Mock-DB] Board comparison: ${recordBoard} vs ${queryBoard}`);
          if (recordBoard !== queryBoard) {
            console.log(`[Mock-DB] ❌ Board filter rejected record ${record.id}`);
            return false;
          }
          continue; // Skip the regular comparison
        }

        if (record[field] !== value) {
          console.log(`[Mock-DB] ❌ Filter rejected record ${record.id}`);
          return false;
        }
      }
    }

    // IS filters
    if (this.query.is) {
      for (const { field, value } of this.query.is) {
        if (value === null && record[field] !== null) return false;
      }
    }

    // IN filters
    if (this.query.in) {
      for (const { field, values } of this.query.in) {
        if (!values.includes(record[field])) return false;
      }
    }

    // GTE filters
    if (this.query.gte) {
      for (const { field, value } of this.query.gte) {
        if (record[field] < value) return false;
      }
    }

    // LTE filters
    if (this.query.lte) {
      for (const { field, value } of this.query.lte) {
        if (record[field] > value) return false;
      }
    }

    return true;
  }
}

// Mock Supabase Client
export const supabase = {
  auth: mockAuth,
  from(table) {
    return new MockQueryBuilder(table);
  },
  channel(name) {
    return {
      on() { return this; },
      subscribe() { return this; }
    };
  }
};

// Mock subscribeTo function
export function subscribeTo(table, callback) {
  return supabase.channel(table);
}

console.log('🧪 MOCK-MODUS AKTIV - Keine echte Supabase-Verbindung');
console.log('📊 Verfügbare Spieler:', mockDB.users.map(u => u.name).join(', ') || 'keine (über Spieler-Seite anlegen)');

// Diagnose-Funktion für Browser-Console
window.debugMockDB = function() {
  console.log('=== MOCK-DB DIAGNOSE ===');
  console.log('Users:', mockDB.users.length, mockDB.users);
  console.log('Gamedays:', mockDB.gamedays.length, mockDB.gamedays);
  console.log('Matches:', mockDB.matches.length, mockDB.matches);
  console.log('Legs:', mockDB.legs.length, mockDB.legs);
  console.log('Throws:', mockDB.throws.length, mockDB.throws);
  console.log('Stats:', mockDB.stats_season.length, mockDB.stats_season);
  console.log('CurrentUser:', mockDB.currentUser);
  console.log('=========================');

  if (mockDB.matches.length > 0) {
    console.log('Match Details:');
    mockDB.matches.forEach((m, i) => {
      const p1 = mockDB.users.find(u => u.id === m.p1_id);
      const p2 = mockDB.users.find(u => u.id === m.p2_id);
      console.log(`  Match ${i+1}: ${p1?.name || 'Unknown'} vs ${p2?.name || 'Unknown'} (Board ${m.board}, Finished: ${m.finished_at ? 'Yes' : 'No'})`);
    });
  }

  return 'Diagnose complete - see logs above';
};

console.log('💡 Tipp: Führe debugMockDB() in der Console aus, um die Datenbank zu inspizieren');

// Reset-Funktion für Browser-Console
window.resetMockDB = function() {
  if (confirm('Wirklich ALLE Mock-Daten löschen?')) {
    localStorage.clear();
    location.reload();
  }
};
console.log('💡 Tipp: Führe resetMockDB() aus, um alle Daten zu löschen und neu zu starten');
