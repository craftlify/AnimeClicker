import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeName, validateSync } from './gameRules.js';
import {
  applySync,
  createPlayer,
  getLeaderboard,
  getPlayer,
  getPlayerRank,
  touchPlayer,
  verifyToken
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json({ limit: '16kb' }));
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/players', (request, response) => {
  const name = sanitizeName(request.body?.name);
  if (!name) {
    response.status(400).json({ error: 'invalid_name' });
    return;
  }

  const player = createPlayer(name);
  response.status(201).json({
    id: player.id,
    name: player.name,
    token: player.token,
    totalEarned: player.totalEarned
  });
});

app.post('/api/sync', (request, response) => {
  const playerId = String(request.body?.playerId || '');
  const token = String(request.body?.token || '');
  const player = verifyToken(playerId, token);
  if (!player) {
    response.status(401).json({ error: 'unauthorized' });
    return;
  }

  const validation = validateSync(player, request.body || {});
  if (!validation.ok) {
    response.status(429).json({
      error: validation.error,
      retryAfterMs: validation.retryAfterMs || 0,
      totalEarned: player.totalEarned,
      rank: getPlayerRank(player.id)?.rank || null
    });
    return;
  }

  applySync(player, validation);
  response.json({
    totalEarned: player.totalEarned,
    accepted: validation.accepted,
    rank: getPlayerRank(player.id)?.rank || null
  });
});

app.get('/api/leaderboard', (request, response) => {
  const limit = Number(request.query.limit) || 50;
  response.json({ entries: getLeaderboard(limit) });
});

app.get('/api/players/:id', (request, response) => {
  const id = String(request.params.id || '');
  const ranked = getPlayerRank(id);
  if (!ranked) {
    response.status(404).json({ error: 'not_found' });
    return;
  }
  const player = getPlayer(id);
  if (player) touchPlayer(player);
  response.json(ranked);
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Anime Clicker server listening on http://localhost:${PORT}`);
});
