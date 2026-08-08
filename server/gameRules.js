export const RULES = {
  CLICK_POWERS: [1, 2, 3, 5, 7, 10, 14, 18, 23, 29, 36, 43, 50],
  COMBO_MAX: 20,
  COMBO_STEP: 5,
  MAX_MANUAL_CPS: 14,
  MIN_SYNC_MS: 2500,
  AUTO_TOLERANCE: 1.12,
  MAX_FOCUS: 5,
  MAX_AUTO: 25,
  MAX_CLICK_LEVEL: 12,
  MAX_EVENT_REWARD_MULTIPLIER: 5,
  MIN_EVENT_INTERVAL_MS: 16000,
  MAX_NAME_LENGTH: 24
};

export function clampInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

export function clickPower(clickLevel, focusLevel) {
  const level = clampInteger(clickLevel, 0, RULES.MAX_CLICK_LEVEL);
  const focus = clampInteger(focusLevel, 0, RULES.MAX_FOCUS);
  const base = RULES.CLICK_POWERS[Math.min(level, RULES.CLICK_POWERS.length - 1)];
  const comboBonus = Math.floor(RULES.COMBO_MAX / RULES.COMBO_STEP);
  return base + focus + comboBonus;
}

export function maxManualClicks(elapsedMs) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return Math.ceil(seconds * RULES.MAX_MANUAL_CPS) + 2;
}

export function maxAutoPoints(elapsedMs, autoClickers) {
  const cps = clampInteger(autoClickers, 0, RULES.MAX_AUTO);
  if (cps <= 0) return 0;
  const seconds = Math.max(0, elapsedMs) / 1000;
  return Math.floor(seconds * cps * RULES.AUTO_TOLERANCE);
}

export function maxEventPoints(elapsedMs, clickLevel, focusLevel, autoClickers, lensLevel) {
  const elapsed = Math.max(0, elapsedMs);
  const maxEvents = Math.floor(elapsed / RULES.MIN_EVENT_INTERVAL_MS) + 1;
  const power = clickPower(clickLevel, focusLevel);
  const auto = clampInteger(autoClickers, 0, RULES.MAX_AUTO);
  const lens = clampInteger(lensLevel, 0, 4);
  const perEvent = Math.floor((power * RULES.MAX_EVENT_REWARD_MULTIPLIER + auto * 2) * (1 + lens * 0.25));
  return maxEvents * perEvent;
}

export function sanitizeName(raw) {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed.slice(0, RULES.MAX_NAME_LENGTH);
}

export function sanitizeState(raw = {}) {
  return {
    clickLevel: clampInteger(raw.clickLevel, 0, RULES.MAX_CLICK_LEVEL),
    autoClickers: clampInteger(raw.autoClickers, 0, RULES.MAX_AUTO),
    focusLevel: clampInteger(raw.focusLevel, 0, RULES.MAX_FOCUS),
    lensLevel: clampInteger(raw.lensLevel, 0, 4)
  };
}

export function mergePlayerState(player, clientStateRaw) {
  const clientState = sanitizeState(clientStateRaw);
  return {
    clickLevel: Math.max(
      player.clickLevel,
      Math.min(clientState.clickLevel, player.clickLevel + 1)
    ),
    autoClickers: Math.max(
      player.autoClickers,
      Math.min(clientState.autoClickers, player.autoClickers + 3)
    ),
    focusLevel: Math.max(
      player.focusLevel,
      Math.min(clientState.focusLevel, player.focusLevel + 1)
    ),
    lensLevel: Math.max(
      player.lensLevel,
      Math.min(clientState.lensLevel, player.lensLevel + 1)
    )
  };
}

export function validateSync(player, payload, now = Date.now()) {
  const elapsedMs = Math.max(0, now - player.lastSyncAt);
  if (elapsedMs < RULES.MIN_SYNC_MS && !payload.force) {
    return { ok: false, error: 'sync_too_soon', retryAfterMs: RULES.MIN_SYNC_MS - elapsedMs };
  }

  const state = mergePlayerState(player, payload.state);
  const manualClicks = clampInteger(payload.manualClicks);
  const manualPoints = clampInteger(payload.manualPoints);
  const autoPoints = clampInteger(payload.autoPoints);
  const eventPoints = clampInteger(payload.eventPoints);

  const allowedManualClicks = maxManualClicks(elapsedMs);
  const acceptedManualClicks = Math.min(manualClicks, allowedManualClicks);
  const maxPower = clickPower(state.clickLevel, state.focusLevel);
  const allowedManualPoints = acceptedManualClicks * maxPower;
  const acceptedManualPoints = Math.min(manualPoints, allowedManualPoints);

  const allowedAutoPoints = maxAutoPoints(elapsedMs, state.autoClickers);
  const acceptedAutoPoints = Math.min(autoPoints, allowedAutoPoints);

  const allowedEventPoints = maxEventPoints(
    elapsedMs,
    state.clickLevel,
    state.focusLevel,
    state.autoClickers,
    state.lensLevel
  );
  const acceptedEventPoints = Math.min(eventPoints, allowedEventPoints);

  const acceptedTotal = acceptedManualPoints + acceptedAutoPoints + acceptedEventPoints;
  if (acceptedTotal <= 0 && !payload.force) {
    return { ok: false, error: 'nothing_to_sync', retryAfterMs: RULES.MIN_SYNC_MS };
  }

  return {
    ok: true,
    elapsedMs,
    state,
    accepted: {
      manualClicks: acceptedManualClicks,
      manualPoints: acceptedManualPoints,
      autoPoints: acceptedAutoPoints,
      eventPoints: acceptedEventPoints,
      total: acceptedTotal
    }
  };
}