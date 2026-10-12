const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'userlist.json');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readUsers() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Could not read user list:', err.message);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(users, null, 2),
    'utf8'
  );
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).send(
      'Admin access is not configured. Set ADMIN_PASSWORD in Render environment variables.'
    );
  }

  const header = req.headers.authorization || '';

  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Quiz user list"');
    return res.status(401).send('Login required');
  }

  let decoded = '';

  try {
    decoded = Buffer.from(
      header.slice(6),
      'base64'
    ).toString('utf8');
  } catch {}

  const splitAt = decoded.indexOf(':');

  const username =
    splitAt >= 0 ? decoded.slice(0, splitAt) : '';

  const password =
    splitAt >= 0 ? decoded.slice(splitAt + 1) : '';

  if (
    username !== ADMIN_USER ||
    password !== ADMIN_PASSWORD
  ) {
    res.set('WWW-Authenticate', 'Basic realm="Quiz user list"');
    return res.status(401).send('Incorrect login');
  }

  next();
}

app.post('/api/submit', (req, res) => {
  const {
    name,
    score,
    totalQuestions,
    answers,
    completedAt
  } = req.body || {};

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    !Number.isFinite(score) ||
    !Number.isFinite(totalQuestions) ||
    !Array.isArray(answers) ||
    answers.length > 100
  ) {
    return res.status(400).json({
      error: 'Invalid quiz submission'
    });
  }

  const users = readUsers();

  users.push({
    id:
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8),

    name: name.trim().slice(0, 80),

    score,
    totalQuestions,

    answers: answers.map(a => ({
      questionNumber: Number(a.questionNumber) || 0,

      choice:
        a.choice === 'A' || a.choice === 'B'
          ? a.choice
          : '',

      correct: Boolean(a.correct)
    })),

    completedAt:
      typeof completedAt === 'string'
        ? completedAt
        : new Date().toISOString()
  });

  try {
    saveUsers(users);

    return res.status(201).json({
      ok: true
    });
  } catch (err) {
    console.error(
      'Could not save submission:',
      err.message
    );

    return res.status(500).json({
      error: 'Could not save submission'
    });
  }
});

app.get('/userlist', requireAdmin, (req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'userlist.html')
  );
});

app.get('/api/userlist', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readUsers());
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Quiz app listening on port ${PORT}`);
});
