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
    { username: 'sruhunage@collectivercm.com',  password: 'Shashani123@Admin', role: 'Admin',  display_name: 'Shashani'  },
    { username: 'amilab@botmedfusion.com',       password: 'Amila123@Admin',    role: 'Admin',  display_name: 'Amila'     },
    { username: 'nranasinghe@collectivercm.com', password: 'Nirman123@Admin',   role: 'Admin',  display_name: 'Nirman'    },
    { username: 'bherath@collectivercm.com',     password: 'Bimsara123@',       role: 'Member', display_name: 'Bimsara'   },
    { username: 'dfernando@collectivercm.com',   password: 'Dilmi123@',         role: 'Member', display_name: 'Dilmi'     },
    { username: 'palwis@collectivercm.com',      password: 'Piyum123@',         role: 'Member', display_name: 'Piyum'     },
    { username: 'vihangam@botmedfusion.com',     password: 'Vihanga123@',       role: 'Member', display_name: 'Vihanga'   },
    { username: 'aranasinghe@collectivercm.com', password: 'Amandi123@',        role: 'Member', display_name: 'Amandi'    },
    { username: 'CVithanage@collectivercm.com',  password: 'Chamath123@',       role: 'Member', display_name: 'Chamath'   },
    { username: 'imalshar@botmedfusion.com',     password: 'Imalsha123@',       role: 'Member', display_name: 'Imalsha'   },
    { username: 'shanka@collectivercm.com',      password: 'Shanka123@',        role: 'Member', display_name: 'Shanka'    },
  ];
  for (const u of users) {
    await prisma.credentials.upsert({
      where:  { username: u.username },
      update: { display_name: u.display_name },
      create: u,
    });
  }
  console.log('✅  Credentials seeded');
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ══════════════════════════════════════════════════════════════════════════════
async function writeAuditLog({ projectId, projectName, username, displayName, action, section, itemId, itemTitle, fieldName, oldValue, newValue }) {
  try {
    await prisma.auditLog.create({
      data: {
        project_id:   projectId   || null,
        project_name: projectName || null,
        username:     username    || 'unknown',
        display_name: displayName || null,
        action,
        section,
        item_id:      itemId      || null,
        item_title:   itemTitle   || null,
        field_name:   fieldName   || null,
        old_value:    oldValue    != null ? String(oldValue) : null,
        new_value:    newValue    != null ? String(newValue) : null,
      },
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// Helper: get user info from request headers
async function getUserFromHeaders(req) {
  const username = req.headers['x-user-name'] || '';
  const role     = (req.headers['x-user-role'] || 'member').toLowerCase();
  if (!username) return { username: '', role, displayName: '', isAdmin: role === 'admin' };

  try {
    const cred = await prisma.credentials.findFirst({
      where:  { username },
      select: { display_name: true, role: true },
    });
    return {
      username,
      role:        cred ? cred.role.toLowerCase() : role,
      displayName: cred ? (cred.display_name || '') : '',
      isAdmin:     cred ? cred.role.toLowerCase() === 'admin' : role === 'admin',
    };
  } catch {
    return { username, role, displayName: '', isAdmin: role === 'admin' };
  }
}

// ── ROLE GUARD MIDDLEWARE ─────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const role = req.headers['x-user-role'] || '';
  if (role.toLowerCase() !== 'admin')
    return res.status(403).json({ success: false, error: 'Permission denied. Admin access required.' });
  next();
}

// Project-level access: admin OR user is assigned to the project
async function requireProjectAccess(projectId, req, res) {
  const role = (req.headers['x-user-role'] || 'member').toLowerCase();
  if (role === 'admin') return { allowed: true, user: await getUserFromHeaders(req) };

  const user = await getUserFromHeaders(req);
  if (!user.username) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return { allowed: false };
  }

  if (!projectId || isNaN(projectId)) {
    res.status(400).json({ success: false, error: 'Invalid project ID.' });
    return { allowed: false };
  }

  const project = await prisma.progress.findUnique({
    where:  { id: projectId },
    select: { id: true, process: true, people: true },
  });
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found.' });
    return { allowed: false };
  }

  const dn = (user.displayName || '').toLowerCase();
  const assigned = dn && project.people.some(p => p.toLowerCase() === dn);
  if (!assigned) {
    res.status(403).json({ success: false, error: 'Access denied — you can only edit your own projects.' });
    return { allowed: false };
  }

  return { allowed: true, user, project };
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
      select: { id: true, username: true, role: true, display_name: true },
    });

    if (!user)
      return res.status(401).json({ success: false, error: 'Invalid username or password' });

    res.json({ success: true, user: { ...user, displayName: user.display_name || '' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── AUTH ME ───────────────────────────────────────────────────────────────────

// GET current user info — returns display_name so frontend can refresh session
app.get('/api/auth/me', async (req, res) => {
  const username = req.headers['x-user-name'] || '';
  if (!username) return res.status(400).json({ success: false, error: 'No username' });
  try {
    const cred = await prisma.credentials.findFirst({
      where:  { username },
      select: { id: true, username: true, role: true, display_name: true },
    });
    if (!cred) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user: { ...cred, displayName: cred.display_name || '' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── AUDIT LOG ROUTES ──────────────────────────────────────────────────────────

// GET audit logs (admin only)
app.get('/api/audit-logs', adminOnly, async (req, res) => {
  try {
    const { projectId, username, section, limit = 200, offset = 0 } = req.query;
    const where = {};
    if (projectId) where.project_id = parseInt(projectId);
    if (username)  where.username   = username;
    if (section)   where.section    = section;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take:    parseInt(limit),
      skip:    parseInt(offset),
    });
    const total = await prisma.auditLog.count({ where });
    res.json({ success: true, data: logs, total });
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

// POST bulk import/upsert from Excel (admin only)
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

// POST create single project (admin only)
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

    const user = await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: row.id, projectName: row.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'project',
      itemTitle: row.process,
    });

    res.json({ success: true, data: rowToProject(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update project — admin OR assigned member
app.put('/api/progress/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const access = await requireProjectAccess(id, req, res);
    if (!access.allowed) return;

    const { process, type, status, completion, doc, people, dept, priority,
            startDate, deadline, frequency, autoFTE, manualFTE,
            lastRunDate, lastRunCount, purpose, expectedResults, betaTestingDate,
            assignTeam, tags } = req.body;

    // Fetch old values for audit diff
    const old = await prisma.progress.findUnique({ where: { id } });

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

    // Log changed fields
    const user = await getUserFromHeaders(req);
    const fields = { status, completion, type, priority, deadline };
    for (const [key, newVal] of Object.entries(fields)) {
      const dbKey = key === 'completion' ? 'completion' : key;
      const oldVal = old ? old[dbKey] : undefined;
      if (oldVal != null && String(oldVal) !== String(newVal ?? '')) {
        await writeAuditLog({
          projectId: id, projectName: row.process,
          username: user.username, displayName: user.displayName,
          action: 'updated', section: 'project',
          itemTitle: row.process, fieldName: key,
          oldValue: oldVal, newValue: newVal,
        });
      }
    }
    // One general log if no individual field logged
    await writeAuditLog({
      projectId: id, projectName: row.process,
      username: user.username, displayName: user.displayName,
      action: 'updated', section: 'project',
      itemTitle: row.process,
    });

    res.json({ success: true, data: rowToProject(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE project (admin only)
app.delete('/api/progress/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const proj = await prisma.progress.findUnique({ where: { id }, select: { process: true } });
    await prisma.progress.delete({ where: { id } });

    const user = await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'project',
      itemTitle: proj?.process,
    });

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH touch updated_at (admin only)
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

// POST bulk import from Excel (admin only)
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

// POST create meeting update — admin OR assigned member
app.post('/api/meeting-updates', async (req, res) => {
  try {
    const { progress_id, date, time, note, is_done } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!note || !String(note).trim()) return res.status(400).json({ success: false, error: 'Note is required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.meetingUpdate.create({
      data: {
        progress_id: pid,
        date:    date || new Date().toISOString().split('T')[0],
        time:    time || new Date().toTimeString().slice(0, 5),
        note:    String(note).trim(),
        is_done: Boolean(is_done),
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'meeting_update',
      itemId: row.id, itemTitle: String(note).trim().slice(0, 80),
    });

    res.json({ success: true, data: rowToMeetingUpdate(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update meeting update — admin OR assigned member
app.put('/api/meeting-updates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { date, time, note, is_done } = req.body;

    // Find project via sub-item
    const existing = await prisma.meetingUpdate.findUnique({ where: { id }, select: { progress_id: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    const row = await prisma.meetingUpdate.update({
      where: { id },
      data: {
        ...(date  !== undefined && { date }),
        ...(time  !== undefined && { time }),
        ...(note  !== undefined && { note: String(note).trim() }),
        is_done: Boolean(is_done),
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'updated', section: 'meeting_update',
      itemId: id, itemTitle: (note || '').slice(0, 80),
      fieldName: 'is_done', oldValue: !is_done, newValue: is_done,
    });

    res.json({ success: true, data: rowToMeetingUpdate(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE meeting update — admin OR assigned member
app.delete('/api/meeting-updates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const existing = await prisma.meetingUpdate.findUnique({ where: { id }, select: { progress_id: true, note: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.meetingUpdate.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'meeting_update',
      itemId: id, itemTitle: (existing.note || '').slice(0, 80),
    });

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

// POST create milestone — admin OR assigned member
app.post('/api/milestones', async (req, res) => {
  try {
    const { progress_id, title, description, due_date, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Title is required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.milestone.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        due_date:    due_date || null,
        status:      status   || 'Pending',
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'milestone',
      itemId: row.id, itemTitle: row.title,
    });

    res.json({ success: true, data: rowToMilestone(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update milestone — admin OR assigned member
app.put('/api/milestones/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { title, description, due_date, status } = req.body;

    const existing = await prisma.milestone.findUnique({ where: { id }, select: { progress_id: true, title: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    const row = await prisma.milestone.update({
      where: { id },
      data: {
        ...(title       !== undefined && { title: String(title).trim() }),
        ...(description !== undefined && { description: String(description).trim() }),
        due_date: due_date || null,
        ...(status !== undefined && { status }),
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    if (status !== undefined && status !== existing.status) {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'milestone',
        itemId: id, itemTitle: existing.title,
        fieldName: 'status', oldValue: existing.status, newValue: status,
      });
    } else {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'milestone',
        itemId: id, itemTitle: existing.title,
      });
    }

    res.json({ success: true, data: rowToMilestone(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE milestone — admin OR assigned member
app.delete('/api/milestones/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

    const existing = await prisma.milestone.findUnique({ where: { id }, select: { progress_id: true, title: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.milestone.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'milestone',
      itemId: id, itemTitle: existing.title,
    });

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

app.post('/api/requirements', async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.requirements.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Open',
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'requirement',
      itemId: row.id, itemTitle: row.title,
    });

    res.json({ success: true, data: rowToRequirement(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/requirements/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const existing = await prisma.requirements.findUnique({ where: { id }, select: { progress_id: true, title: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
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

    const user = access.user || await getUserFromHeaders(req);
    if (status !== undefined && status !== existing.status) {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'requirement',
        itemId: id, itemTitle: existing.title,
        fieldName: 'status', oldValue: existing.status, newValue: status,
      });
    } else {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'requirement',
        itemId: id, itemTitle: existing.title,
      });
    }

    res.json({ success: true, data: rowToRequirement(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/requirements/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.requirements.findUnique({ where: { id }, select: { progress_id: true, title: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.requirements.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'requirement',
      itemId: id, itemTitle: existing.title,
    });

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

app.post('/api/change-requests', async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.change_requests.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Pending',
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'change_request',
      itemId: row.id, itemTitle: row.title,
    });

    res.json({ success: true, data: rowToChangeRequest(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/change-requests/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const existing = await prisma.change_requests.findUnique({ where: { id }, select: { progress_id: true, title: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
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

    const user = access.user || await getUserFromHeaders(req);
    if (status !== undefined && status !== existing.status) {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'change_request',
        itemId: id, itemTitle: existing.title,
        fieldName: 'status', oldValue: existing.status, newValue: status,
      });
    } else {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'change_request',
        itemId: id, itemTitle: existing.title,
      });
    }

    res.json({ success: true, data: rowToChangeRequest(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/change-requests/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.change_requests.findUnique({ where: { id }, select: { progress_id: true, title: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.change_requests.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'change_request',
      itemId: id, itemTitle: existing.title,
    });

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

app.post('/api/feature-addons', async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.feature_addons.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Requested',
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'feature_addon',
      itemId: row.id, itemTitle: row.title,
    });

    res.json({ success: true, data: rowToFeatureAddon(row) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/feature-addons/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const existing = await prisma.feature_addons.findUnique({ where: { id }, select: { progress_id: true, title: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
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

    const user = access.user || await getUserFromHeaders(req);
    if (status !== undefined && status !== existing.status) {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'feature_addon',
        itemId: id, itemTitle: existing.title,
        fieldName: 'status', oldValue: existing.status, newValue: status,
      });
    } else {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'feature_addon',
        itemId: id, itemTitle: existing.title,
      });
    }

    res.json({ success: true, data: rowToFeatureAddon(row) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/feature-addons/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.feature_addons.findUnique({ where: { id }, select: { progress_id: true, title: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.feature_addons.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'feature_addon',
      itemId: id, itemTitle: existing.title,
    });

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

app.post('/api/bug-fixes', async (req, res) => {
  try {
    const { progress_id, title, description, priority, status } = req.body;
    const pid = parseInt(progress_id);
    if (isNaN(pid) || !String(title || '').trim())
      return res.status(400).json({ success: false, error: 'progress_id and title required' });

    const access = await requireProjectAccess(pid, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: pid }, select: { process: true } });
    const row = await prisma.bug_fixes.create({
      data: {
        progress_id: pid,
        title:       String(title).trim(),
        description: String(description || '').trim(),
        priority:    priority || 'Medium',
        status:      status   || 'Open',
      },
    });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: pid, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'created', section: 'bug_fix',
      itemId: row.id, itemTitle: row.title,
    });

    res.json({ success: true, data: { ...row, _id: row.id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/bug-fixes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, priority, status } = req.body;

    const existing = await prisma.bug_fixes.findUnique({ where: { id }, select: { progress_id: true, title: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
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

    const user = access.user || await getUserFromHeaders(req);
    if (status !== undefined && status !== existing.status) {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'bug_fix',
        itemId: id, itemTitle: existing.title,
        fieldName: 'status', oldValue: existing.status, newValue: status,
      });
    } else {
      await writeAuditLog({
        projectId: existing.progress_id, projectName: proj?.process,
        username: user.username, displayName: user.displayName,
        action: 'updated', section: 'bug_fix',
        itemId: id, itemTitle: existing.title,
      });
    }

    res.json({ success: true, data: { ...row, _id: row.id } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Not found' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/bug-fixes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.bug_fixes.findUnique({ where: { id }, select: { progress_id: true, title: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const access = await requireProjectAccess(existing.progress_id, req, res);
    if (!access.allowed) return;

    const proj = await prisma.progress.findUnique({ where: { id: existing.progress_id }, select: { process: true } });
    await prisma.bug_fixes.delete({ where: { id } });

    const user = access.user || await getUserFromHeaders(req);
    await writeAuditLog({
      projectId: existing.progress_id, projectName: proj?.process,
      username: user.username, displayName: user.displayName,
      action: 'deleted', section: 'bug_fix',
      itemId: id, itemTitle: existing.title,
    });

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

// POST toggle run date (admin only)
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

// DELETE specific run date by id (admin only)
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
app.post('/api/progress/:id/video', adminOnly, (req, res) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    try {
      const id = parseInt(req.params.id);
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
