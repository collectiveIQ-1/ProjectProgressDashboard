require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── MONGO CONNECTION ───────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.DB_NAME || 'progress_dashboard';

if (!MONGO_URI) {
  console.error('❌  MONGO_URI is not set. Create a .env file with MONGO_URI=mongodb+srv://...');
  process.exit(1);
}

let db;
async function connectDB() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 10000 });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  db = client.db(DB_NAME);
  console.log(`✅  Connected to MongoDB Atlas — database: "${DB_NAME}"`);
  await db.collection('progress').createIndex({ process: 1 }, { unique: true });
  await db.collection('meeting_updates').createIndex({ progress_id: 1 });
  await db.collection('meeting_updates').createIndex({ created_at: -1 });
  await db.collection('milestones').createIndex({ progress_id: 1 });
  await db.collection('milestones').createIndex({ created_at: -1 });
}

function toObjectId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS ROUTES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/progress', async (req, res) => {
  try {
    const records = await db.collection('progress').find({}).sort({ process: 1 }).toArray();
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/progress/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const record = await db.collection('progress').findOne({ _id: id });
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/progress/import', async (req, res) => {
  try {
    const { projects } = req.body;
    if (!Array.isArray(projects) || !projects.length)
      return res.status(400).json({ success: false, error: 'No projects provided' });
    const ops = projects.map(p => {
      const { _id, ...fields } = p;
      return { updateOne: { filter: { process: fields.process }, update: { $set: { ...fields, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } }, upsert: true } };
    });
    const result = await db.collection('progress').bulkWrite(ops);
    res.json({ success: true, inserted: result.upsertedCount, updated: result.modifiedCount });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/progress/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { _id, ...update } = req.body;
    update.updated_at = new Date();
    const result = await db.collection('progress').findOneAndUpdate({ _id: id }, { $set: update }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/progress/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    await db.collection('meeting_updates').deleteMany({ progress_id: id });
    await db.collection('milestones').deleteMany({ progress_id: id });
    const result = await db.collection('progress').deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MEETING UPDATES ROUTES
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/meeting-updates/:progressId', async (req, res) => {
  try {
    const progressId = toObjectId(req.params.progressId);
    if (!progressId) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const updates = await db.collection('meeting_updates').find({ progress_id: progressId }).sort({ date: -1, time: -1 }).toArray();
    res.json({ success: true, data: updates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/meeting-updates', async (req, res) => {
  try {
    const { progress_id, date, time, note, is_done } = req.body;
    const pid = toObjectId(progress_id);
    if (!pid) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!note || !String(note).trim()) return res.status(400).json({ success: false, error: 'Note is required' });
    const doc = { progress_id: pid, date: date || new Date().toISOString().split('T')[0], time: time || new Date().toTimeString().slice(0, 5), note: String(note).trim(), is_done: Boolean(is_done), created_at: new Date(), updated_at: new Date() };
    const result = await db.collection('meeting_updates').insertOne(doc);
    res.json({ success: true, data: { ...doc, _id: result.insertedId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/meeting-updates/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { _id, progress_id, created_at, ...update } = req.body;
    update.updated_at = new Date();
    const result = await db.collection('meeting_updates').findOneAndUpdate({ _id: id }, { $set: update }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/meeting-updates/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const result = await db.collection('meeting_updates').deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MILESTONES ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET all milestones for a project
app.get('/api/milestones/:progressId', async (req, res) => {
  try {
    const progressId = toObjectId(req.params.progressId);
    if (!progressId) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    const milestones = await db.collection('milestones').find({ progress_id: progressId }).sort({ due_date: 1, created_at: 1 }).toArray();
    res.json({ success: true, data: milestones });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET all milestones (for the milestones overview table - project + milestone view)
app.get('/api/milestones', async (req, res) => {
  try {
    const milestones = await db.collection('milestones').find({}).sort({ created_at: -1 }).toArray();
    // Populate process name from progress collection
    const progressIds = [...new Set(milestones.map(m => m.progress_id.toString()))];
    const progressDocs = await db.collection('progress').find({ _id: { $in: progressIds.map(id => toObjectId(id)) } }).toArray();
    const progressMap = {};
    progressDocs.forEach(p => { progressMap[p._id.toString()] = p.process; });
    const enriched = milestones.map(m => ({ ...m, process_name: progressMap[m.progress_id.toString()] || 'Unknown' }));
    res.json({ success: true, data: enriched });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST - create a new milestone
app.post('/api/milestones', async (req, res) => {
  try {
    const { progress_id, title, description, due_date, status } = req.body;
    const pid = toObjectId(progress_id);
    if (!pid) return res.status(400).json({ success: false, error: 'Invalid progress ID' });
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Title is required' });
    const doc = {
      progress_id: pid,
      title: String(title).trim(),
      description: String(description || '').trim(),
      due_date: due_date || null,
      status: status || 'Pending',   // Pending | In Progress | Completed
      created_at: new Date(),
      updated_at: new Date()
    };
    const result = await db.collection('milestones').insertOne(doc);
    res.json({ success: true, data: { ...doc, _id: result.insertedId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT - update a milestone
app.put('/api/milestones/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const { _id, progress_id, created_at, ...update } = req.body;
    update.updated_at = new Date();
    const result = await db.collection('milestones').findOneAndUpdate({ _id: id }, { $set: update }, { returnDocument: 'after' });
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE - delete a milestone
app.delete('/api/milestones/:id', async (req, res) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid ID' });
    const result = await db.collection('milestones').deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Fallback ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀  Server running  →  http://localhost:${PORT}`);
    console.log(`📊  Open dashboard  →  http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌  Failed to connect to MongoDB Atlas:', err.message);
  process.exit(1);
});
