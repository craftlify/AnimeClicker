import crypto from 'node:crypto';

const players = new Map();
const SESSION_SECRET = process.env.LEADERBOARD_SECRET || crypto.randomBytes(32).toString('hex');

function hashToken(playerId) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(playerId).digest('hex');
}

function publicPlayer(player, rank = null) {
  return {
    id: player.id,
    name: player.name,
    totalEarned: player.totalEarned,
    rank
  };
}

export function createPlayer(name) {
  const id = crypto.randomUUID();
  const player = {
    id,
    name,
    totalEarned: 0,
    clickLevel: 0,
    autoClickers: 0,
    focusLevel: 0,
    lensLevel: 0,
    createdAt: Date.now(),
    lastSyncAt: Date.now(),
    lastSeenAt: Date.now(),
    token: hashToken(id)
  };
  players.set(id, player);
  return player;
}

export function getPlayer(id) {
  return players.get(id) || null;
}

export function verifyToken(playerId, token) {
  const player = getPlayer(playerId);
  if (!player || !token) return null;
  const expected = hashToken(playerId);
  const left = Buffer.from(String(token));
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  return crypto.timingSafeEqual(left, right) ? player : null;
}

export function applySync(player, validation) {
  player.totalEarned += validation.accepted.total;
  player.clickLevel = validation.state.clickLevel;
  player.autoClickers = validation.state.autoClickers;
  player.focusLevel = validation.state.focusLevel;
  player.lensLevel = validation.state.lensLevel;
  player.lastSyncAt = Date.now();
  player.lastSeenAt = Date.now();
  return player;
}

export function touchPlayer(player) {
  player.lastSeenAt = Date.now();
}

export function getLeaderboard(limit = 50) {
  const sorted = [...players.values()]
    .filter((player) => player.totalEarned > 0)
    .sort((left, right) => {
      if (right.totalEarned !== left.totalEarned) return right.totalEarned - left.totalEarned;
      return left.lastSeenAt - right.lastSeenAt;
    });

  const capped = sorted.slice(0, Math.max(1, Math.min(100, limit)));
  return capped.map((player, index) => publicPlayer(player, index + 1));
}

export function getPlayerRank(playerId) {
  const sorted = [...players.values()]
    .filter((player) => player.totalEarned > 0)
    .sort((left, right) => {
      if (right.totalEarned !== left.totalEarned) return right.totalEarned - left.totalEarned;
      return left.lastSeenAt - right.lastSeenAt;
    });

  const index = sorted.findIndex((player) => player.id === playerId);
  if (index < 0) return null;
  return publicPlayer(sorted[index], index + 1);
}
