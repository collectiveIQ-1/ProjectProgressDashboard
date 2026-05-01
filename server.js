require('dotenv').config();
const express           = require('express');
const { PrismaClient }  = require('@prisma/client');
const cors              = require('cors');
const path              = require('path');
const multer            = require('multer');
const fs                = require('fs');

// ── VIDEO UPLOAD CONFIG ───────────────────────────────────────────────────────
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'public', 'uploads', 'videos');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `demo_${req.params.id}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  }
});

const app    = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SEED CREDENTIALS ON STARTUP ───────────────────────────────────────────────
async function seedCredentials() {
  const users = [
    { username: 'sruhunage@collectivercm.com',  password: 'Shashani123@Admin', role: 'Admin'  },
    { username: 'amilab@botmedfusion.com',       password: 'Amila123@Admin',    role: 'Admin'  },
    { username: 'nranasinghe@collectivercm.com', password: 'Nirman123@Admin',   role: 'Admin'  },
    { username: 'bherath@collectivercm.com',     password: 'Bimsara123@',       role: 'Member' },
    { username: 'dfernando@collectivercm.com',   password: 'Dilmi123@',         role: 'Member' },
    { username: 'palwis@collectivercm.com',      password: 'Piyum123@',         role: 'Member' },
    { username: 'vihangam@botmedfusion.com',     password: 'Vihanga123@',       role: 'Member' },
    { username: 'aranasinghe@collectivercm.com', password: 'Amandi123@',        role: 'Member' },
    { username: 'CVithanage@collectivercm.com',  password: 'Chamath123@',       role: 'Member' },
    { username: 'imalshar@botmedfusion.com',     password: 'Imalsha123@',       role: 'Member' },
    { username: 'shanka@collectivercm.com',      password: 'Shanka123@',        role: 'Member' },
  ];
  for (const u of users) {
    await prisma.credentials.upsert({
      where:  { username: u.username },
      update: {},
      create: u,
    });
  }
  console.log('✅  Credentials seeded');
}

// ── ROLE GUARD MIDDLEWARE ─────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const role = req.headers['x-user-role'] || '';
  if (role.toLowerCase() !== 'admin')
    return res.status(403).json({ success: false, error: 'Permission denied. Admin access required.' });
  next();
}

// ── ROW MAPPERS ───────────────────────────────────────────────────────────────
function rowToProject(r) {
  return {
    _id:             String(r.id),
    process:         r.process,
    type:            r.type            || 'Unknown',
    status:          r.status          || '',
    completion:      r.completion      != null ? parseFloat(r.completion.toString()) : 0,
    doc:             r.doc             != null ? parseFloat(r.doc.toString())        : 0,
    people:          r.people          || [],
    dept:            r.dept            || '',
    priority:        r.priority        || '',
    startDate:       r.start_date      || null,
    deadline:        r.deadline        || null,
    frequency:       r.frequency       || '',
    autoFTE:         r.auto_fte        != null ? parseFloat(r.auto_fte.toString())   : null,
    manualFTE:       r.manual_fte      != null ? parseFloat(r.manual_fte.toString()) : null,
    lastRunDate:     r.last_run_date   || null,
    lastRunCount:    r.last_run_count  != null ? parseInt(r.last_run_count)          : null,
    purpose:         r.purpose         || null,
    expectedResults: r.expected_results  || null,
    betaTestingDate: r.beta_testing_date || null,
    assignTeam:      r.assign_team      || null,
    tags:            r.tags             || [],
    demoVideo:       r.demo_video       || null,
    created_at:      r.created_at,
    updated_at:      r.updated_at,
    // pendingItems: only unresolved/incomplete items (already filtered by the query)
    pendingItems: {
      requirements:  (r.requirements   || []).map(x => ({ title: x.title, status: x.status })),
      changeRequests:(r.change_requests|| []).map(x => ({ title: x.title, status: x.status })),
      featureAddons: (r.feature_addons || []).map(x => ({ title: x.title, status: x.status })),
      bugFixes:      (r.bug_fixes      || []).map(x => ({ title: x.title, status: x.status })),
    },
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

function rowToRequirement(r) {
  return {
    _id:         String(r.id),
    progress_id: String(r.progress_id),
    title:       r.title,
    description: r.description || '',
    priority:    r.priority    || 'Medium',
    status:      r.status      || 'Open',
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

function rowToChangeRequest(r) {
  return {
    _id:         String(r.id),
    progress_id: String(r.progress_id),
    title:       r.title,
    description: r.description || '',
    priority:    r.priority    || 'Medium',
    status:      r.status      || 'Pending',
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

function rowToFeatureAddon(r) {
  return {
    _id:         String(r.id),
    progress_id: String(r.progress_id),
    title:       r.title,
    description: r.description || '',
    priority:    r.priority    || 'Medium',
    status:      r.status      || 'Requested',
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, error: 'Username and password are required' });

    const user = await prisma.credentials.findFirst({
      where:  { username: String(username).trim(), password: String(password) },
      select: { id: true, username: true, role: true },
    });

    if (!user)
      return res.status(401).json({ success: false, error: 'Invalid username or password' });

    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET all
app.get('/api/progress', async (req, res) => {
  try {
    const rows = await prisma.progress.findMany({
      orderBy: { process: 'asc' },
      include: {
        requirements:    { where: { status: { not: 'Resolved'     } }, select: { title: true, status: true } },
        change_requests: { where: { status: { not: 'Implemented'  } }, select: { title: true, status: true } },
        feature_addons:  { where: { status: { not: 'Completed'    } }, select: { title: true, status: true } },
        bug_fixes:       { where: { status: { not: 'Resolved'     } }, select: { title: true, status: true } },
      },
    });
    res.json({ success: true, data: rows.map(rowToProject) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET single
app.get('/api/progress/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const row = await prisma.progress.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rowToProject(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST bulk import/upsert from Excel
app.post('/api/progress/import', adminOnly, async (req, res) => {
  try {
    const { projects } = req.body;
    if (!Array.isArray(projects) || !projects.length)
      return res.status(400).json({ success: false, error: 'No projects provided' });

    let inserted = 0, updated = 0;
    for (const p of projects) {
      const people = (Array.isArray(p.people) ? p.people : [p.people || 'Upcoming'])
        .map(n => (!n || String(n).toLowerCase() === 'unknown') ? 'Upcoming' : n);
      const startDate = p.startDate instanceof Object
        ? (p.startDate.toISOString ? p.startDate.toISOString() : String(p.startDate))
        : (p.startDate || null);
      const deadline = p.deadline instanceof Object
        ? (p.deadline.toISOString ? p.deadline.toISOString() : String(p.deadline))
        : (p.deadline || null);

      const data = {
        type:       p.type       || 'Unknown',
        status:     p.status     || '',
        completion: parseFloat(p.completion) || 0,
        doc:        parseFloat(p.doc)        || 0,
        people,
        dept:       p.dept       || '',
        priority:   p.priority   || '',
        start_date: startDate,
        deadline,
        frequency:  p.frequency  || '',
        auto_fte:   p.autoFTE   != null && !isNaN(p.autoFTE)   ? p.autoFTE   : null,
        manual_fte: p.manualFTE != null && !isNaN(p.manualFTE) ? p.manualFTE : null,
        updated_at: new Date(),
      };

      const existing = await prisma.progress.findUnique({ where: { process: p.process } });
      if (existing) {
        await prisma.progress.update({ where: { process: p.process }, data });
        updated++;
      } else {
        await prisma.progress.create({ data: { process: p.process, ...data } });
        inserted++;
      }
    }
    res.json({ success: true, inserted, updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST create single project
app.post('/api/progress', adminOnly, async (req, res) => {
  try {
    const { process, type, status, completion, doc, people, dept, priority,
            startDate, deadline, frequency, autoFTE, manualFTE,
            lastRunDate, lastRunCount, purpose, expectedResults, betaTestingDate,
            assignTeam, tags } = req.body;
    if (!process || !String(process).trim())
      return res.status(400).json({ success: false, error: 'Process name is required' });

    const row = await prisma.progress.create({
      data: {
        process:          String(process).trim(),
        type:             type     || 'Unknown',
        status:           status   || 'To Do',
        completion:       parseFloat(completion) || 0,
        doc:              parseFloat(doc)        || 0,
        people:           (Array.isArray(people) ? people : (people ? [String(people)] : ['Upcoming']))
                            .map(n => (!n || String(n).toLowerCase() === 'unknown') ? 'Upcoming' : n),
        dept:             dept      || '',
        priority:         priority  || '',
        start_date:       startDate || null,
        deadline:         deadline  || null,
        frequency:        frequency || '',
        auto_fte:         autoFTE   != null && autoFTE   !== '' ? parseFloat(autoFTE)   : null,
        manual_fte:       manualFTE != null && manualFTE !== '' ? parseFloat(manualFTE) : null,
        last_run_date:    lastRunDate    || null,
        last_run_count:   lastRunCount  != null && lastRunCount  !== '' ? parseInt(lastRunCount)  : null,
        purpose:          purpose        || null,
        expected_results: expectedResults || null,
        beta_testing_date: betaTestingDate || null,
        assign_team:      assignTeam || null,
        tags:             Array.isArray(tags) ? tags : [],
      },
    });
    res.json({ success: true, data: rowToProject(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update project
app.put('/api/progress/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { process, type, status, completion, doc, people, dept, priority,
            startDate, deadline, frequency, autoFTE, manualFTE,
            lastRunDate, lastRunCount, purpose, expectedResults, betaTestingDate,
            assignTeam, tags } = req.body;

    const row = await prisma.progress.update({
      where: { id },
      data: {
        process,
        type,
        status,
        completion:       parseFloat(completion) || 0,
        doc:              parseFloat(doc)        || 0,
        people:           Array.isArray(people) ? people : [people],
        dept,
        priority,
        start_date:       startDate  || null,
        deadline:         deadline   || null,
        frequency,
        auto_fte:         autoFTE    || null,
        manual_fte:       manualFTE  || null,
        last_run_date:    lastRunDate || null,
        last_run_count:   lastRunCount != null && lastRunCount !== '' ? parseInt(lastRunCount) : null,
        purpose:          purpose          || null,
        expected_results: expectedResults  || null,
        beta_testing_date: betaTestingDate || null,
        assign_team:      assignTeam || null,
        tags:             Array.isArray(tags) ? tags : [],
        updated_at:       new Date(),
      },
    });
    res.json({ success: true, data: rowToProject(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE project
app.delete('/api/progress/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    await prisma.progress.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH touch updated_at
app.patch('/api/progress/:id/touch', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const row = await prisma.progress.update({
      where:  { id },
      data:   { updated_at: new Date() },
      select: { updated_at: true },
    });
    res.json({ success: true, updated_at: row.updated_at });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MEETING UPDATES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST bulk import from Excel
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

      const found = await prisma.progress.findFirst({
        where:  { process: { equals: processName, mode: 'insensitive' } },
        select: { id: true },
      });

      if (!found) {
        skipped++;
        if (!skippedNames.includes(processName)) skippedNames.push(processName);
        continue;
      }

      await prisma.meetingUpdate.create({
        data: {
          progress_id: found.id,
          date:    row.date || new Date().toISOString().split('T')[0],
          time:    row.time || '',
          note:    String(row.note || '').trim(),
          is_done: Boolean(row.is_done),
        },
      });
      imported++;
    }

    res.json({ success: true, imported, skipped, skippedNames });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET all meeting updates for a project
app.get('/api/meeting-updates/:progressId', async (req, res) => {
  try {
    const progressId = parseInt(req.params.progressId);
    if (isNaN(progressId)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const rows = await prisma.meetingUpdate.findMany({
      where:   { progress_id: progressId },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
    res.json({ success: true, data: rows.map(rowToMeetingUpdate) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST create meeting update
app.post('/api/meeting-updates', adminOnly, async (req, res) => {
  try {
    const { progress_id, date, time, note, is_done } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!note || !String(note).trim()) return res.status(400).json({ success: false, error: 'Note is required' });

    const row = await prisma.meetingUpdate.create({
      data: {
        progress_id: pid,
        date:    date || new Date().toISOString().split('T')[0],
        time:    time || new Date().toTimeString().slice(0, 5),
        note:    String(note).trim(),
        is_done: Boolean(is_done),
      },
    });
    res.json({ success: true, data: rowToMeetingUpdate(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update meeting update
app.put('/api/meeting-updates/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { date, time, note, is_done } = req.body;

    const row = await prisma.meetingUpdate.update({
      where: { id },
      data: {
        ...(date  !== undefined && { date }),
        ...(time  !== undefined && { time }),
        ...(note  !== undefined && { note: String(note).trim() }),
        is_done: Boolean(is_done),
      },
    });
    res.json({ success: true, data: rowToMeetingUpdate(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE meeting update
app.delete('/api/meeting-updates/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    await prisma.meetingUpdate.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MILESTONES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET milestones for a project
app.get('/api/milestones/:progressId', async (req, res) => {
  try {
    const progressId = parseInt(req.params.progressId);
    if (isNaN(progressId)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const rows = await prisma.milestone.findMany({
      where:   { progress_id: progressId },
      orderBy: [{ due_date: 'asc' }, { created_at: 'asc' }],
    });
    res.json({ success: true, data: rows.map(rowToMilestone) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET all milestones (with project name)
app.get('/api/milestones', async (req, res) => {
  try {
    const rows = await prisma.milestone.findMany({
      include:  { progress: { select: { process: true } } },
      orderBy:  { created_at: 'desc' },
    });
    res.json({
      success: true,
      data: rows.map(r => ({ ...rowToMilestone(r), process_name: r.progress?.process || 'Unknown' })),
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST create milestone
app.post('/api/milestones', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, due_date, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Title is required' });

    const row = await prisma.milestone.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        due_date:    due_date || null,
        status:      status   || 'Pending',
      },
    });
    res.json({ success: true, data: rowToMilestone(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update milestone
app.put('/api/milestones/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { title, description, due_date, status } = req.body;

    const row = await prisma.milestone.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        due_date: due_date || null,
        ...(status !== undefined && { status }),
      },
    });
    res.json({ success: true, data: rowToMilestone(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE milestone
app.delete('/api/milestones/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    await prisma.milestone.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENTS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/requirements/:progressId', async (req, res) => {
  try {
    const pid = parseInt(req.params.progressId);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const rows = await prisma.requirements.findMany({
      where:   { progress_id: pid },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: rows.map(rowToRequirement) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/requirements', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const row = await prisma.requirements.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Open',
      },
    });
    res.json({ success: true, data: rowToRequirement(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/requirements/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const row = await prisma.requirements.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        ...(priority    !== undefined && { priority }),
        ...(status      !== undefined && { status }),
        updated_at: new Date(),
      },
    });
    res.json({ success: true, data: rowToRequirement(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/requirements/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.requirements.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CHANGE REQUESTS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/change-requests/:progressId', async (req, res) => {
  try {
    const pid = parseInt(req.params.progressId);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const rows = await prisma.change_requests.findMany({
      where:   { progress_id: pid },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: rows.map(rowToChangeRequest) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/change-requests', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const row = await prisma.change_requests.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Pending',
      },
    });
    res.json({ success: true, data: rowToChangeRequest(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/change-requests/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const row = await prisma.change_requests.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        ...(priority    !== undefined && { priority }),
        ...(status      !== undefined && { status }),
        updated_at: new Date(),
      },
    });
    res.json({ success: true, data: rowToChangeRequest(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/change-requests/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.change_requests.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE ADD-ONS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/feature-addons/:progressId', async (req, res) => {
  try {
    const pid = parseInt(req.params.progressId);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const rows = await prisma.feature_addons.findMany({
      where:   { progress_id: pid },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: rows.map(rowToFeatureAddon) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/feature-addons', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const row = await prisma.feature_addons.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Requested',
      },
    });
    res.json({ success: true, data: rowToFeatureAddon(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/feature-addons/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const row = await prisma.feature_addons.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        ...(priority    !== undefined && { priority }),
        ...(status      !== undefined && { status }),
        updated_at: new Date(),
      },
    });
    res.json({ success: true, data: rowToFeatureAddon(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/feature-addons/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.feature_addons.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BUG FIXES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/bug-fixes/:progressId', async (req, res) => {
  try {
    const pid = parseInt(req.params.progressId);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const rows = await prisma.bug_fixes.findMany({
      where:   { progress_id: pid },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: rows.map(r => ({ ...r, _id: r.id })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/bug-fixes', adminOnly, async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });
    const row = await prisma.bug_fixes.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Open',
      },
    });
    res.json({ success: true, data: { ...row, _id: row.id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/bug-fixes/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;
    const row = await prisma.bug_fixes.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        ...(priority    !== undefined && { priority }),
        ...(status      !== undefined && { status }),
        updated_at: new Date(),
      },
    });
    res.json({ success: true, data: { ...row, _id: row.id } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/bug-fixes/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.bug_fixes.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RUN DATES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET all run dates for a project
app.get('/api/run-dates/:progressId', async (req, res) => {
  try {
    const progressId = parseInt(req.params.progressId);
    if (isNaN(progressId)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const rows = await prisma.run_dates.findMany({
      where:   { progress_id: progressId },
      orderBy: { run_date: 'asc' },
      select:  { id: true, run_date: true },
    });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST toggle run date (insert or delete if exists)
app.post('/api/run-dates', adminOnly, async (req, res) => {
  try {
    const { progress_id, run_date } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !run_date)
      return res.status(400).json({ success: false, error: 'progress_id and run_date required' });

    const existing = await prisma.run_dates.findFirst({
      where: { progress_id: pid, run_date },
    });

    let action;
    if (existing) {
      await prisma.run_dates.delete({ where: { id: existing.id } });
      action = 'removed';
    } else {
      await prisma.run_dates.create({ data: { progress_id: pid, run_date } });
      action = 'added';
    }

    // Compute new latest run date and sync back to progress
    const latest = await prisma.run_dates.findFirst({
      where:   { progress_id: pid },
      orderBy: { run_date: 'desc' },
      select:  { run_date: true },
    });
    const newLatest = latest ? latest.run_date : null;
    await prisma.progress.update({
      where: { id: pid },
      data:  { last_run_date: newLatest, updated_at: new Date() },
    });

    res.json({ success: true, action, run_date, latest_run_date: newLatest });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE specific run date by id
app.delete('/api/run-dates/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    await prisma.run_dates.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── STATIC ROUTES ─────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── DEMO VIDEO UPLOAD / DELETE ────────────────────────────────────────────────
// POST /api/progress/:id/video — upload a demo video file (admin only)
app.post('/api/progress/:id/video', adminOnly, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    try {
      const id = parseInt(req.params.id);
      // Delete old video file if one already exists
      const existing = await prisma.progress.findUnique({ where: { id }, select: { demo_video: true } });
      if (existing?.demo_video) {
        const oldPath = path.join(__dirname, 'public', 'uploads', 'videos', existing.demo_video);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await prisma.progress.update({ where: { id }, data: { demo_video: req.file.filename } });
      res.json({ success: true, filename: req.file.filename });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
});

// DELETE /api/progress/:id/video — remove demo video (admin only)
app.delete('/api/progress/:id/video', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.progress.findUnique({ where: { id }, select: { demo_video: true } });
    if (existing?.demo_video) {
      const filePath = path.join(__dirname, 'public', 'uploads', 'videos', existing.demo_video);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await prisma.progress.update({ where: { id }, data: { demo_video: null } });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

prisma.$connect()
  .then(() => {
    console.log(`✅  Connected to PostgreSQL — ${process.env.PG_DATABASE || 'db'} @ ${process.env.PG_HOST || 'localhost'}`);
    return seedCredentials();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Server running  →  http://localhost:${PORT}`);
      console.log(`📊  Open dashboard  →  http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌  Failed to connect to PostgreSQL:', err.message);
    console.error('    Check your DATABASE_URL in the .env file');
    process.exit(1);
  });
