(function () {
  'use strict';

  const STORAGE_KEY = 'anime-clicker-leaderboard-v1';
  const DEFAULT_NAME_PREFIX = 'Traveler';

  let credentials = null;
  let syncTimer = 0;
  let syncQueue = Promise.resolve();
  let pending = {
    manualClicks: 0,
    manualPoints: 0,
    autoPoints: 0,
    eventPoints: 0
  };
  let serverTotalEarned = 0;
  let serverRank = null;
  let online = false;
  let lastEntries = [];

  function apiBase() {
    const configured = CONFIG.LEADERBOARD?.API_BASE;
    if (configured) return String(configured).replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      return `${window.location.origin}/api`;
    }
    return 'http://localhost:3001/api';
  }

  function loadCredentials() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id || !parsed?.token || !parsed?.name) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function saveCredentials(next) {
    credentials = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[Leaderboard] unable to persist credentials', error);
    }
  }

  function defaultName() {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${DEFAULT_NAME_PREFIX}-${suffix}`;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'request_failed');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function resetPending() {
    pending = {
      manualClicks: 0,
      manualPoints: 0,
      autoPoints: 0,
      eventPoints: 0
    };
  }

  function recordEarn(source, amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value <= 0) return;
    if (source === 'manual') pending.manualPoints += value;
    else if (source === 'auto') pending.autoPoints += value;
    else if (source === 'event') pending.eventPoints += value;
  }

  function recordManualClick() {
    pending.manualClicks += 1;
  }

  function hasPending() {
    return pending.manualClicks > 0
      || pending.manualPoints > 0
      || pending.autoPoints > 0
      || pending.eventPoints > 0;
  }

  async function ensureRegistered(name) {
    const existing = loadCredentials();
    if (existing) {
      credentials = existing;
      return existing;
    }

    const chosenName = String(name || '').trim() || defaultName();
    const created = await request('/players', {
      method: 'POST',
      body: JSON.stringify({ name: chosenName })
    });
    const next = {
      id: created.id,
      token: created.token,
      name: created.name
    };
    saveCredentials(next);
    serverTotalEarned = created.totalEarned || 0;
    return next;
  }

  async function sync(force = false) {
    if (!credentials) return null;
    if (!force && !hasPending()) return null;

    const snapshot = { ...pending };
    const state = window.__ANIME_CLICKER__?.getState?.() || {};

    try {
      const result = await request('/sync', {
        method: 'POST',
        body: JSON.stringify({
          playerId: credentials.id,
          token: credentials.token,
          force: Boolean(force),
          manualClicks: snapshot.manualClicks,
          manualPoints: snapshot.manualPoints,
          autoPoints: snapshot.autoPoints,
          eventPoints: snapshot.eventPoints,
          state: {
            clickLevel: state.clickLevel,
            autoClickers: state.autoClickers,
            focusLevel: state.focusLevel,
            lensLevel: state.lensLevel
          }
        })
      });

      pending.manualClicks = Math.max(0, pending.manualClicks - snapshot.manualClicks);
      pending.manualPoints = Math.max(0, pending.manualPoints - snapshot.manualPoints);
      pending.autoPoints = Math.max(0, pending.autoPoints - snapshot.autoPoints);
      pending.eventPoints = Math.max(0, pending.eventPoints - snapshot.eventPoints);
      serverTotalEarned = result.totalEarned || serverTotalEarned;
      serverRank = result.rank ?? serverRank;
      online = true;
      return result;
    } catch (error) {
      if (error.status === 429) {
        serverTotalEarned = error.payload?.totalEarned ?? serverTotalEarned;
        serverRank = error.payload?.rank ?? serverRank;
        online = true;
        return null;
      }
      if (error.status === 401) {
        credentials = null;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch (storageError) {
          console.warn('[Leaderboard] unable to clear credentials', storageError);
        }
      }
      online = false;
      throw error;
    }
  }

  function queueSync(force = false) {
    syncQueue = syncQueue
      .catch(() => undefined)
      .then(() => sync(force))
      .catch((error) => {
        console.warn('[Leaderboard] sync failed', error);
        return null;
      });
    return syncQueue;
  }

  function scheduleSync(force = false) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      queueSync(force);
    }, force ? 0 : 4000);
  }

  async function fetchLeaderboard(limit = 20) {
    const result = await request(`/leaderboard?limit=${limit}`);
    lastEntries = Array.isArray(result.entries) ? result.entries : [];
    online = true;
    return lastEntries;
  }

  async function init(name) {
    try {
      const health = await request('/health');
      online = Boolean(health?.ok);
    } catch (error) {
      online = false;
      return { online: false };
    }

    try {
      await ensureRegistered(name);
      await queueSync(true);
      return {
        online: true,
        credentials,
        totalEarned: serverTotalEarned,
        rank: serverRank
      };
    } catch (error) {
      online = false;
      return { online: false };
    }
  }

  const Leaderboard = {
    init,
    recordEarn,
    recordManualClick,
    scheduleSync,
    queueSync,
    fetchLeaderboard,
    getCredentials: () => (credentials ? { ...credentials } : null),
    getServerTotalEarned: () => serverTotalEarned,
    getServerRank: () => serverRank,
    getLastEntries: () => lastEntries.slice(),
    isOnline: () => online,
    setName(name) {
      if (!credentials) return;
      credentials = { ...credentials, name: String(name || credentials.name).trim() || credentials.name };
      saveCredentials(credentials);
    }
  };

  window.Leaderboard = Leaderboard;
})();
