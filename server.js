require('dotenv').config();
const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── PostgreSQL CONNECTION ──────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Helper — run a query and return rows
const query = (text, params) => pool.query(text, params);

// ── CREATE TABLES ON STARTUP ──────────────────────────────────────────────────
async function initDB() {
  // Credentials table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id         SERIAL PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'Member',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed credentials from Excel data (insert only if not exists)
  const users = [
    { username: 'sruhunage@collectivercm.com', password: 'Shashani123@Admin', role: 'Admin' },
    { username: 'amilab@botmedfusion.com',     password: 'Amila123@Admin',    role: 'Admin' },
    { username: 'nranasinghe@collectivercm.com', password: 'Nirman123@Admin', role: 'Admin' },
    { username: 'bherath@collectivercm.com',   password: 'Bimsara123@',       role: 'Member' },
    { username: 'dfernando@collectivercm.com', password: 'Dilmi123@',         role: 'Member' },
    { username: 'palwis@collectivercm.com',    password: 'Piyum123@',         role: 'Member' },
    { username: 'vihangam@botmedfusion.com',   password: 'Vihanga123@',       role: 'Member' },
    { username: 'aranasinghe@collectivercm.com', password: 'Amandi123@',      role: 'Member' },
    { username: 'CVithanage@collectivercm.com', password: 'Chamath123@',      role: 'Member' },
    { username: 'imalshar@botmedfusion.com',   password: 'Imalsha123@',       role: 'Member' },
    { username: 'shanka@collectivercm.com',    password: 'Shanka123@',        role: 'Member' },
  ];
  for (const u of users) {
    await pool.query(`
      INSERT INTO credentials (username, password, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO NOTHING
    `, [u.username, u.password, u.role]);
  }

  console.log('✅  Credentials table ready and seeded');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress (
      id            SERIAL PRIMARY KEY,
      process       TEXT NOT NULL UNIQUE,
      type          TEXT,
      status        TEXT,
      completion    NUMERIC(5,4) DEFAULT 0,
      doc           NUMERIC(5,4) DEFAULT 0,
      people        TEXT[],
      dept          TEXT,
      priority      TEXT,
      start_date    TEXT,
      deadline      TEXT,
      frequency     TEXT,
      auto_fte      NUMERIC(10,4),
      manual_fte    NUMERIC(10,4),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meeting_updates (
      id            SERIAL PRIMARY KEY,
      progress_id   INTEGER NOT NULL REFERENCES progress(id) ON DELETE CASCADE,
      date          TEXT,
      time          TEXT,
      note          TEXT NOT NULL,
      is_done       BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id            SERIAL PRIMARY KEY,
      progress_id   INTEGER NOT NULL REFERENCES progress(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      description   TEXT DEFAULT '',
      due_date      TEXT,
      status        TEXT DEFAULT 'Pending',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add missing columns to progress table (safe for existing tables)
  const progressCols = [
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS type         TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS status       TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS completion   NUMERIC(5,4) DEFAULT 0`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS doc          NUMERIC(5,4) DEFAULT 0`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS people       TEXT[]`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS dept         TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS priority     TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS start_date   TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS deadline     TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS frequency    TEXT`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS auto_fte     NUMERIC(10,4)`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS manual_fte   NUMERIC(10,4)`,
    `ALTER TABLE progress ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of progressCols) {
    await pool.query(sql);
  }

  // Indexes for foreign keys
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_meeting_updates_progress_id ON meeting_updates(progress_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_progress_id ON milestones(progress_id);
  `);

  console.log('✅  Tables ready — credentials, progress, meeting_updates, milestones');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/login — authenticate user
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, error: 'Username and password are required' });

    const { rows } = await query(
      'SELECT id, username, role FROM credentials WHERE username=$1 AND password=$2',
      [String(username).trim(), String(password)]
    );

    if (!rows.length)
      return res.status(401).json({ success: false, error: 'Invalid username or password' });

    res.json({ success: true, user: { id: rows[0].id, username: rows[0].username, role: rows[0].role } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ROLE GUARD MIDDLEWARE ────────────────────────────────────────────────────
// Reads X-User-Role header sent by the frontend on every mutating request.
// Members (non-Admin) receive 403 for any write operation.
function adminOnly(req, res, next) {
  const role = req.headers['x-user-role'] || '';
  if (role.toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, error: 'Permission denied. Admin access required.' });
  }
  next();
}

// Helper: convert a DB row to the shape the frontend expects
function rowToProject(r) {
  return {
    _id:        String(r.id),
    process:    r.process,
    type:       r.type       || 'Unknown',
    status:     r.status     || '',
    completion: parseFloat(r.completion) || 0,
    doc:        parseFloat(r.doc)        || 0,
    people:     r.people     || [],
    dept:       r.dept       || '',
    priority:   r.priority   || '',
    startDate:  r.start_date || null,
    deadline:   r.deadline   || null,
    frequency:  r.frequency  || '',
    autoFTE:    r.auto_fte   != null ? parseFloat(r.auto_fte)   : null,
    manualFTE:  r.manual_fte != null ? parseFloat(r.manual_fte) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToMeetingUpdate(r) {
  return {
    _id:         String(r.id),
    progress_id: String(r.progress_id),
    date:        r.date    || '',
    time:        r.time    || '',
    note:        r.note,
    is_done:     Boolean(r.is_done),
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

function rowToMilestone(r) {
  return {
    _id:         String(r.id),
    progress_id: String(r.progress_id),
    title:       r.title,
    description: r.description || '',
    due_date:    r.due_date    || null,
    status:      r.status      || 'Pending',
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET all progress records
app.get('/api/progress', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM progress ORDER BY process ASC');
    res.json({ success: true, data: rows.map(rowToProject) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET single progress record
app.get('/api/progress/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { rows } = await query('SELECT * FROM progress WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rowToProject(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST - bulk import/upsert from Excel upload
app.post('/api/progress/import', adminOnly, async (req, res) => {
  try {
    const { projects } = req.body;
    if (!Array.isArray(projects) || !projects.length)
      return res.status(400).json({ success: false, error: 'No projects provided' });

    let inserted = 0, updated = 0;
    for (const p of projects) {
      const people = Array.isArray(p.people) ? p.people : [p.people || 'Unknown'];
      // Convert Date objects / ISO strings to plain text for storage
      const startDate = p.startDate instanceof Object
        ? (p.startDate.toISOString ? p.startDate.toISOString() : String(p.startDate))
        : (p.startDate || null);
      const deadline = p.deadline instanceof Object
        ? (p.deadline.toISOString ? p.deadline.toISOString() : String(p.deadline))
        : (p.deadline || null);

      const result = await query(`
        INSERT INTO progress
          (process, type, status, completion, doc, people, dept, priority,
           start_date, deadline, frequency, auto_fte, manual_fte, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (process) DO UPDATE SET
          type        = EXCLUDED.type,
          status      = EXCLUDED.status,
          completion  = EXCLUDED.completion,
          doc         = EXCLUDED.doc,
          people      = EXCLUDED.people,
          dept        = EXCLUDED.dept,
          priority    = EXCLUDED.priority,
          start_date  = EXCLUDED.start_date,
          deadline    = EXCLUDED.deadline,
          frequency   = EXCLUDED.frequency,
          auto_fte    = EXCLUDED.auto_fte,
          manual_fte  = EXCLUDED.manual_fte,
          updated_at  = NOW()
        RETURNING (xmax = 0) AS was_inserted
      `, [
        p.process, p.type || 'Unknown', p.status || '',
        p.completion || 0, p.doc || 0,
        people,
        p.dept || '', p.priority || '',
        startDate, deadline,
        p.frequency || '',
        p.autoFTE != null && !isNaN(p.autoFTE) ? p.autoFTE : null,
        p.manualFTE != null && !isNaN(p.manualFTE) ? p.manualFTE : null,
      ]);
      if (result.rows[0].was_inserted) inserted++; else updated++;
    }
    res.json({ success: true, inserted, updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT - update a progress record
app.put('/api/progress/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { process, type, status, completion, doc, people, dept, priority,
            startDate, deadline, frequency, autoFTE, manualFTE } = req.body;
    const { rows } = await query(`
      UPDATE progress SET
        process=$1, type=$2, status=$3, completion=$4, doc=$5, people=$6,
        dept=$7, priority=$8, start_date=$9, deadline=$10,
        frequency=$11, auto_fte=$12, manual_fte=$13, updated_at=NOW()
      WHERE id=$14 RETURNING *`,
      [process, type, status, completion, doc,
       Array.isArray(people) ? people : [people],
       dept, priority, startDate||null, deadline||null,
       frequency, autoFTE||null, manualFTE||null, id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rowToProject(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE a progress record (cascades to meeting_updates + milestones via FK)
app.delete('/api/progress/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { rowCount } = await query('DELETE FROM progress WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MEETING UPDATES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST - bulk import from Excel (matches process name case-insensitively)
app.post('/api/meeting-updates/import', adminOnly, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length)
      return res.status(400).json({ success: false, error: 'No rows provided' });

    let imported = 0, skipped = 0;
    const skippedNames = [];

    for (const row of rows) {
      const processName = String(row.process_name || '').trim();
      if (!processName) { skipped++; continue; }

      // Case-insensitive match — normalise whitespace on both sides
      const { rows: found } = await query(
        `SELECT id FROM progress WHERE LOWER(TRIM(process)) = LOWER($1)`,
        [processName]
      );

      if (!found.length) {
        skipped++;
        if (!skippedNames.includes(processName)) skippedNames.push(processName);
        continue;
      }

      const progress_id = found[0].id;
      await query(
        `INSERT INTO meeting_updates (progress_id, date, time, note, is_done, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [progress_id,
         row.date  || new Date().toISOString().split('T')[0],
         row.time  || '',
         String(row.note || '').trim(),
         Boolean(row.is_done)]
      );
      imported++;
    }

    res.json({ success: true, imported, skipped, skippedNames });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/meeting-updates/:progressId', async (req, res) => {
  try {
    const progressId = parseInt(req.params.progressId);
    if (isNaN(progressId)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const { rows } = await query(
      'SELECT * FROM meeting_updates WHERE progress_id=$1 ORDER BY date DESC, time DESC',
      [progressId]);
    res.json({ success: true, data: rows.map(rowToMeetingUpdate) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/meeting-updates', adminOnly, async (req, res) => {
  try {
    const { progress_id, date, time, note, is_done } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!note || !String(note).trim()) return res.status(400).json({ success: false, error: 'Note is required' });
    const { rows } = await query(
      `INSERT INTO meeting_updates (progress_id, date, time, note, is_done, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,
      [pid,
       date || new Date().toISOString().split('T')[0],
       time || new Date().toTimeString().slice(0,5),
       String(note).trim(),
       Boolean(is_done)]);
    res.json({ success: true, data: rowToMeetingUpdate(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/meeting-updates/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { date, time, note, is_done } = req.body;
    const { rows } = await query(
      `UPDATE meeting_updates
       SET date=COALESCE($1,date), time=COALESCE($2,time), note=COALESCE($3,note),
           is_done=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [date || null, time || null, note ? String(note).trim() : null, Boolean(is_done), id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rowToMeetingUpdate(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/meeting-updates/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { rowCount } = await query('DELETE FROM meeting_updates WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MILESTONES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/milestones/:progressId', async (req, res) => {
  try {
    const progressId = parseInt(req.params.progressId);
    if (isNaN(progressId)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const { rows } = await query(
      'SELECT * FROM milestones WHERE progress_id=$1 ORDER BY due_date ASC NULLS LAST, created_at ASC',
      [progressId]);
    res.json({ success: true, data: rows.map(rowToMilestone) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/milestones', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT m.*, p.process AS process_name
      FROM milestones m
      LEFT JOIN progress p ON p.id = m.progress_id
      ORDER BY m.created_at DESC`);
    res.json({ success: true, data: rows.map(r => ({ ...rowToMilestone(r), process_name: r.process_name || 'Unknown' })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/milestones', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, due_date, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Title is required' });
    const { rows } = await query(
      `INSERT INTO milestones (progress_id, title, description, due_date, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,
      [pid, String(title).trim(), String(description||'').trim(), due_date||null, status||'Pending']);
    res.json({ success: true, data: rowToMilestone(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/milestones/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { title, description, due_date, status } = req.body;
    const { rows } = await query(
      `UPDATE milestones
       SET title=COALESCE($1,title), description=COALESCE($2,description),
           due_date=$3, status=COALESCE($4,status), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title ? String(title).trim() : null,
       description != null ? String(description).trim() : null,
       due_date || null, status || null, id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rowToMilestone(rows[0]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/milestones/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { rowCount } = await query('DELETE FROM milestones WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Login page ────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
pool.connect()
  .then(client => {
    client.release();
    console.log(`✅  Connected to PostgreSQL — ${process.env.PG_DATABASE} @ ${process.env.PG_HOST}`);
    return initDB();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Server running  →  http://localhost:${PORT}`);
      console.log(`📊  Open dashboard  →  http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌  Failed to connect to PostgreSQL:', err.message);
    console.error('    Check your PG_* variables in the .env file');
    process.exit(1);
  });
