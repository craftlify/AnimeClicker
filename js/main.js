(function () {
  'use strict';

  const DEFAULT_STATE = {
    totalEarned: 0,
    points: 0,
    clickLevel: 0,
    modelIdx: 0,
    bgIdx: 0,
    autoClickers: 0,
    focusLevel: 0,
    lensLevel: 0,
    manualClicks: 0,
    eventClicks: 0,
    bestCombo: 0,
    achievements: []
  };

  let state = { ...DEFAULT_STATE };
  let saveTimer = 0;
  let saveQueue = Promise.resolve();
  let hitMap = null;
  let bound = false;
  let resizeBound = false;
  let booting = false;
  let autoTimer = 0;
  let autoSaveTimer = 0;
  let autoAccumulator = 0;
  let autoLastTick = 0;
  let combo = 0;
  let comboLastAt = 0;
  let comboResetTimer = 0;
  let eventScheduleTimer = 0;
  let eventExpiryTimer = 0;
  let eventActive = false;

  function updateStageScale() {
    const scale = Math.min(
      window.innerWidth / CONFIG.STAGE_WIDTH,
      window.innerHeight / CONFIG.STAGE_HEIGHT,
      1
    );
    document.documentElement.style.setProperty('--stage-scale', String(Math.max(0.01, scale)));
  }

  function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
  }

  function levelIndexFor(totalEarned) {
    let index = 0;
    for (let i = 1; i < CONFIG.LEVELS.length; i += 1) {
      if (totalEarned >= CONFIG.LEVELS[i]) index = i;
      else break;
    }
    return index;
  }

  function unlockedModelsFor(level) {
    const indices = [];
    CONFIG.MODEL_UNLOCKS.forEach((unlockLevel, index) => {
      if (level >= unlockLevel) indices.push(index);
    });
    return indices.length ? indices : [0];
  }

  function unlockedBackgroundsFor(level) {
    const unlocks = CONFIG.BACKGROUND_UNLOCKS || CONFIG.SCENES.map((_, index) => index + 1);
    const sceneCount = Math.min(CONFIG.SCENES.length, unlocks.length);
    const indices = [];
    for (let index = 0; index < sceneCount; index += 1) {
      if (level >= unlocks[index]) indices.push(index);
    }
    return indices.length ? indices : [0];
  }

  function recommendedBackgroundFor(modelIdx) {
    const candidate = CONFIG.MODEL_BACKGROUND_DEFAULTS?.[modelIdx];
    return Number.isInteger(candidate) && candidate >= 0 && candidate < CONFIG.SCENES.length
      ? candidate
      : 0;
  }

  function nonNegativeIndex(value) {
    const candidate = Number(value);
    return Number.isInteger(candidate) && candidate >= 0 ? candidate : -1;
  }

  function sanitizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : DEFAULT_STATE;
    const totalEarned = integer(source.totalEarned);
    const level = levelIndexFor(totalEarned) + 1;
    const maxClickLevel = CONFIG.CLICK_UPGRADES.COSTS.length;
    const clickLevel = Math.min(integer(source.clickLevel), maxClickLevel);
    const points = Math.min(integer(source.points), totalEarned);
    const unlockedModels = unlockedModelsFor(level);
    const candidateModel = Math.min(integer(source.modelIdx), CONFIG.MODELS.length - 1);
    const unlockedBackgrounds = unlockedBackgroundsFor(level);
    const candidateBackground = integer(source.bgIdx);
    const shopItems = CONFIG.SHOP_ITEMS || [];
    const autoItem = shopItems.find((item) => item.id === 'autoClickers');
    const focusItem = shopItems.find((item) => item.id === 'focusLevel');
    const lensItem = shopItems.find((item) => item.id === 'lensLevel');
    const validAchievements = new Set((CONFIG.ACHIEVEMENTS || []).map((item) => item.id));
    const achievements = Array.isArray(source.achievements)
      ? [...new Set(source.achievements.filter((id) => typeof id === 'string' && validAchievements.has(id)))]
      : [];

    return {
      totalEarned,
      points,
      clickLevel,
      modelIdx: unlockedModels.includes(candidateModel) ? candidateModel : unlockedModels[unlockedModels.length - 1],
      bgIdx: unlockedBackgrounds.includes(candidateBackground)
        ? candidateBackground
        : unlockedBackgrounds[unlockedBackgrounds.length - 1],
      autoClickers: Math.min(integer(source.autoClickers), autoItem?.max ?? 25),
      focusLevel: Math.min(integer(source.focusLevel), focusItem?.max ?? 5),
      lensLevel: Math.min(integer(source.lensLevel), lensItem?.max ?? 4),
      manualClicks: integer(source.manualClicks),
      eventClicks: integer(source.eventClicks),
      bestCombo: Math.min(integer(source.bestCombo), CONFIG.COMBO_MAX),
      achievements
    };
  }

  function detailsFor(currentState = state) {
    const levelIndex = levelIndexFor(currentState.totalEarned);
    const level = levelIndex + 1;
    const isMaxLevel = levelIndex >= CONFIG.LEVELS.length - 1;
    const currentThreshold = CONFIG.LEVELS[levelIndex];
    const nextThreshold = isMaxLevel ? currentThreshold : CONFIG.LEVELS[levelIndex + 1];
    const distance = Math.max(1, nextThreshold - currentThreshold);
    const progress = isMaxLevel
      ? 1
      : Math.max(0, Math.min(1, (currentState.totalEarned - currentThreshold) / distance));
    const unlockedModels = unlockedModelsFor(level);
    const maxClickLevel = CONFIG.CLICK_UPGRADES.COSTS.length;
    const basePower = CONFIG.CLICK_UPGRADES.POWERS[Math.min(currentState.clickLevel, maxClickLevel)];
    const comboBonus = Math.floor(combo / CONFIG.COMBO_STEP);
    const manualPower = basePower + currentState.focusLevel;
    const power = manualPower + comboBonus;
    const unlockedBackgrounds = unlockedBackgroundsFor(level);
    const recommendedBackground = recommendedBackgroundFor(currentState.modelIdx);
    const backgroundPosition = Math.max(0, unlockedBackgrounds.indexOf(currentState.bgIdx)) + 1;

    return {
      level,
      progress,
      nextThreshold,
      isMaxLevel,
      basePower,
      manualPower,
      power,
      cps: currentState.autoClickers,
      combo,
      comboBonus,
      shopUnlocked: level >= 3,
      achievementCount: currentState.achievements.length,
      eventActive,
      unlockedBackgrounds,
      unlockedBackgroundCount: unlockedBackgrounds.length,
      backgroundPosition,
      recommendedBackground,
      backgroundIsRecommended: currentState.bgIdx === recommendedBackground,
      unlockedModelCount: unlockedModels.length,
      unlockedModels,
      maxClickLevel
    };
  }

  function currentPower() {
    return detailsFor().power;
  }

  function requestSave() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = 0;
    UI.setSaveStatus('saving');
    saveTimer = window.setTimeout(() => {
      saveNow();
    }, 900);
  }

  function requestAutoSave() {
    if (saveTimer || autoSaveTimer) return;
    autoSaveTimer = window.setTimeout(() => {
      autoSaveTimer = 0;
      saveNow();
    }, 10000);
  }

  function saveNow() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = 0;
    const snapshot = { ...state };
    UI.setSaveStatus('saving');
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(() => SDK.save(snapshot))
      .then(() => Leaderboard.queueSync(true))
      .then(() => UI.setSaveStatus('saved'))
      .catch((error) => {
        console.warn('[Game] save failed', error);
        UI.setSaveStatus('offline');
      });
    return saveQueue;
  }

  function hitDataFor(index, image) {
    if (hitMap && hitMap.index === index && hitMap.width === image.naturalWidth && hitMap.height === image.naturalHeight) {
      return hitMap;
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    hitMap = { index, width: canvas.width, height: canvas.height, pixels };
    return hitMap;
  }

  function imageCoordinates(clientX, clientY) {
    const element = UI.getModelElement();
    const image = UI.getPreloadedImage(state.modelIdx);
    if (!element || !image || !image.naturalWidth || !image.naturalHeight) return null;

    const rect = element.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

    // Keep the mapping correct even if object-fit adds letterboxing in a future skin.
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const boxRatio = rect.width / rect.height;
    let drawnWidth = rect.width;
    let drawnHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceRatio > boxRatio) {
      drawnHeight = rect.width / sourceRatio;
      offsetY = (rect.height - drawnHeight) / 2;
    } else if (sourceRatio < boxRatio) {
      drawnWidth = rect.height * sourceRatio;
      offsetX = (rect.width - drawnWidth) / 2;
    }

    const x = Math.floor(((clientX - rect.left - offsetX) / drawnWidth) * image.naturalWidth);
    const y = Math.floor(((clientY - rect.top - offsetY) / drawnHeight) * image.naturalHeight);
    if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) return null;
    return { x, y, rect };
  }

  function isOpaqueHit(clientX, clientY) {
    const coordinates = imageCoordinates(clientX, clientY);
    if (!coordinates) return false;
    const image = UI.getPreloadedImage(state.modelIdx);
    const hitData = hitDataFor(state.modelIdx, image);
    const alpha = hitData.pixels[(coordinates.y * hitData.width + coordinates.x) * 4 + 3];
    return alpha > 10;
  }

  function alphaAt(hitData, x, y) {
    if (x < 0 || y < 0 || x >= hitData.width || y >= hitData.height) return 0;
    return hitData.pixels[(y * hitData.width + x) * 4 + 3];
  }

  function nearestOpaqueCoordinate(hitData, preferredX, preferredY) {
    const startX = Math.max(0, Math.min(hitData.width - 1, Math.floor(preferredX)));
    const startY = Math.max(0, Math.min(hitData.height - 1, Math.floor(preferredY)));
    if (alphaAt(hitData, startX, startY) > 10) return { x: startX, y: startY };

    const maxRadius = Math.max(hitData.width, hitData.height);
    for (let radius = 2; radius <= maxRadius; radius += 3) {
      const left = startX - radius;
      const right = startX + radius;
      const top = startY - radius;
      const bottom = startY + radius;

      for (let x = left; x <= right; x += 3) {
        if (alphaAt(hitData, x, top) > 10) return { x, y: top };
        if (alphaAt(hitData, x, bottom) > 10) return { x, y: bottom };
      }
      for (let y = top + 3; y < bottom; y += 3) {
        if (alphaAt(hitData, left, y) > 10) return { x: left, y };
        if (alphaAt(hitData, right, y) > 10) return { x: right, y };
      }
    }

    return null;
  }

  function logicalPoint(clientX, clientY) {
    const stage = UI.getStageElement();
    const rect = stage.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CONFIG.STAGE_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CONFIG.STAGE_HEIGHT
    };
  }

  function evaluateAchievements() {
    const conditions = {
      first_click: state.manualClicks >= 1,
      earned_100: state.totalEarned >= 100,
      earned_1000: state.totalEarned >= 1000,
      manual_100: state.manualClicks >= 100,
      combo_10: state.bestCombo >= 10,
      event_first: state.eventClicks >= 1,
      auto_first: state.autoClickers >= 1,
      auto_10: state.autoClickers >= 10,
      shop_first: state.autoClickers + state.focusLevel + state.lensLevel >= 1,
      level_15: detailsFor().level >= 15
    };
    const unlocked = new Set(state.achievements);
    const newlyUnlocked = [];
    for (const achievement of CONFIG.ACHIEVEMENTS) {
      if (conditions[achievement.id] && !unlocked.has(achievement.id)) {
        state.achievements.push(achievement.id);
        unlocked.add(achievement.id);
        newlyUnlocked.push(achievement);
      }
    }
    newlyUnlocked.forEach((achievement, index) => {
      window.setTimeout(() => UI.showToast('achievementUnlocked', {
        a: UI.translate(achievement.titleKey)
      }, 1900), index * 900);
    });
    return newlyUnlocked.length > 0;
  }

  function earnPoints(amount, source, point) {
    const value = integer(amount);
    if (value <= 0) return false;

    const previousLevelIndex = levelIndexFor(state.totalEarned);
    const previousModelCount = unlockedModelsFor(previousLevelIndex + 1).length;
    const previousBackgroundCount = unlockedBackgroundsFor(previousLevelIndex + 1).length;
    state.points += value;
    state.totalEarned += value;
    const nextLevelIndex = levelIndexFor(state.totalEarned);
    const nextLevel = nextLevelIndex + 1;

    if (source === 'manual') {
      UI.bounceModel();
      if (point) UI.spawnPoints(point.x, point.y, value);
    } else if (source === 'event' && point) {
      UI.spawnPoints(point.x, point.y, value);
    }

    if (nextLevelIndex > previousLevelIndex) {
      UI.showToast('newLevel', { a: nextLevel });
      const nextBackgroundCount = unlockedBackgroundsFor(nextLevel).length;
      if (nextBackgroundCount > previousBackgroundCount) {
        window.setTimeout(() => UI.showToast('newScene', undefined, 1500), 420);
      }
      const nextModelCount = unlockedModelsFor(nextLevel).length;
      if (nextModelCount > previousModelCount) {
        window.setTimeout(() => UI.showToast('newModel', undefined, 1700), 750);
      }
    }

    state = sanitizeState(state);
    evaluateAchievements();
    UI.render(state, detailsFor());
    if (typeof Leaderboard !== 'undefined') {
      Leaderboard.recordEarn(source, value);
      Leaderboard.scheduleSync(source === 'auto');
    }
    if (source === 'auto') requestAutoSave();
    else requestSave();
    ensureEventSchedule();
    return true;
  }

  function resetCombo() {
    window.clearTimeout(comboResetTimer);
    comboResetTimer = 0;
    if (combo === 0) return;
    combo = 0;
    UI.render(state, detailsFor());
  }

  function registerHit(clientX, clientY) {
    if (!isOpaqueHit(clientX, clientY)) return false;

    const now = performance.now();
    combo = now - comboLastAt <= CONFIG.COMBO_WINDOW_MS
      ? Math.min(CONFIG.COMBO_MAX, combo + 1)
      : 1;
    comboLastAt = now;
    state.manualClicks += 1;
    state.bestCombo = Math.max(state.bestCombo, combo);
    if (typeof Leaderboard !== 'undefined') Leaderboard.recordManualClick();
    window.clearTimeout(comboResetTimer);
    comboResetTimer = window.setTimeout(resetCombo, CONFIG.COMBO_WINDOW_MS + 40);
    const point = logicalPoint(clientX, clientY);
    return earnPoints(currentPower(), 'manual', point);
  }

  function onModelPointerDown(event) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    registerHit(event.clientX, event.clientY);
  }

  function onModelKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const element = UI.getModelElement();
    const image = UI.getPreloadedImage(state.modelIdx);
    if (!element || !image?.naturalWidth || !image?.naturalHeight) return;

    const rect = element.getBoundingClientRect();
    const hitData = hitDataFor(state.modelIdx, image);
    const opaque = nearestOpaqueCoordinate(hitData, image.naturalWidth / 2, image.naturalHeight * 0.42);
    if (!opaque) return;

    registerHit(
      rect.left + ((opaque.x + 0.5) / image.naturalWidth) * rect.width,
      rect.top + ((opaque.y + 0.5) / image.naturalHeight) * rect.height
    );
  }

  function shopCost(item, level) {
    return Math.floor(item.baseCost * Math.pow(item.growth, level));
  }

  function buyShopItem(itemId) {
    const item = CONFIG.SHOP_ITEMS.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const details = detailsFor();
    const owned = integer(state[item.id]);
    if (details.level < item.unlockLevel || owned >= item.max) return;
    const cost = shopCost(item, owned);
    if (state.points < cost) return;

    state.points -= cost;
    state[item.id] = owned + 1;
    state = sanitizeState(state);
    evaluateAchievements();
    UI.render(state, detailsFor());
    UI.showToast('shopBought', { a: UI.translate(item.nameKey) });
    requestSave();
    ensureEventSchedule();
  }

  function randomEventDelay() {
    const min = CONFIG.STAR_SPAWN_MIN_MS;
    const max = CONFIG.STAR_SPAWN_MAX_MS;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function hideEvent(reschedule = true) {
    window.clearTimeout(eventExpiryTimer);
    eventExpiryTimer = 0;
    eventActive = false;
    UI.setEventActive(false);
    if (reschedule) ensureEventSchedule();
  }

  function claimEvent() {
    if (!eventActive || document.visibilityState === 'hidden') return;
    hideEvent(false);
    state.eventClicks += 1;
    const baseReward = detailsFor().manualPower * 5 + state.autoClickers * 2;
    const reward = Math.floor(baseReward * (1 + state.lensLevel * 0.25));
    const point = UI.getEventPoint();
    earnPoints(reward, 'event', point);
  }

  function spawnEvent() {
    eventScheduleTimer = 0;
    if (document.visibilityState === 'hidden' || detailsFor().level < 3 || eventActive) {
      ensureEventSchedule();
      return;
    }
    eventActive = true;
    UI.setEventPosition(12 + Math.random() * 76, 15 + Math.random() * 64);
    UI.setEventActive(true);
    eventExpiryTimer = window.setTimeout(hideEvent, CONFIG.STAR_LIFETIME_MS);
  }

  function ensureEventSchedule() {
    if (document.visibilityState === 'hidden' || detailsFor().level < 3 || eventActive || eventScheduleTimer) return;
    eventScheduleTimer = window.setTimeout(spawnEvent, randomEventDelay());
  }

  function stopOnlineSystems() {
    window.clearInterval(autoTimer);
    autoTimer = 0;
    autoAccumulator = 0;
    autoLastTick = 0;
    window.clearTimeout(eventScheduleTimer);
    eventScheduleTimer = 0;
    hideEvent(false);
  }

  function autoTick() {
    if (document.visibilityState === 'hidden' || state.autoClickers <= 0) return;
    const now = performance.now();
    const elapsed = autoLastTick ? Math.min(1000, now - autoLastTick) : 0;
    autoLastTick = now;
    autoAccumulator += (elapsed / 1000) * state.autoClickers;
    const earned = Math.floor(autoAccumulator);
    if (earned <= 0) return;
    autoAccumulator -= earned;
    earnPoints(earned, 'auto');
  }

  function startOnlineSystems() {
    if (document.visibilityState === 'hidden') return;
    if (!autoTimer) {
      autoLastTick = performance.now();
      autoTimer = window.setInterval(autoTick, 250);
    }
    ensureEventSchedule();
  }

  function buyUpgrade() {
    const details = detailsFor();
    const cost = CONFIG.CLICK_UPGRADES.COSTS[state.clickLevel];
    if (state.clickLevel >= details.maxClickLevel || state.points < cost) return;
    state.points -= cost;
    state.clickLevel += 1;
    UI.render(state, detailsFor());
    requestSave();
  }

  function cycleBackground(direction) {
    const backgrounds = detailsFor().unlockedBackgrounds;
    if (backgrounds.length <= 1) return;
    const currentPosition = Math.max(0, backgrounds.indexOf(state.bgIdx));
    state.bgIdx = backgrounds[(currentPosition + direction + backgrounds.length) % backgrounds.length];
    UI.render(state, detailsFor());
    requestSave();
  }

  function applyModelSelection(modelIdx) {
    state.modelIdx = modelIdx;
    const recommended = recommendedBackgroundFor(modelIdx);
    const unlockedBackgrounds = detailsFor(state).unlockedBackgrounds;
    if (unlockedBackgrounds.includes(recommended)) {
      state.bgIdx = recommended;
    }
  }

  function cycleModel(direction) {
    const models = detailsFor().unlockedModels;
    if (models.length <= 1) return;
    const currentPosition = Math.max(0, models.indexOf(state.modelIdx));
    applyModelSelection(models[(currentPosition + direction + models.length) % models.length]);
    hitMap = null;
    UI.render(state, detailsFor());
    requestSave();
  }

  function selectBackground(index) {
    const candidate = nonNegativeIndex(index);
    const details = detailsFor();
    if (!details.unlockedBackgrounds.includes(candidate)) return;
    state.bgIdx = candidate;
    UI.render(state, detailsFor());
    UI.closeGallery();
    requestSave();
  }

  function selectModel(index) {
    const candidate = nonNegativeIndex(index);
    const details = detailsFor();
    if (!details.unlockedModels.includes(candidate)) return;
    applyModelSelection(candidate);
    hitMap = null;
    UI.render(state, detailsFor());
    UI.closeGallery();
    requestSave();
  }

  function useRecommendedBackground() {
    const recommended = recommendedBackgroundFor(state.modelIdx);
    if (!detailsFor().unlockedBackgrounds.includes(recommended)) return;
    state.bgIdx = recommended;
    UI.render(state, detailsFor());
    requestSave();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    UI.getModelElement().addEventListener('pointerdown', onModelPointerDown, { passive: false });
    UI.getModelElement().addEventListener('keydown', onModelKeyDown);
    UI.getStageElement().addEventListener('contextmenu', (event) => event.preventDefault());
    document.getElementById('upgrade-button').addEventListener('click', buyUpgrade);
    document.getElementById('background-prev').addEventListener('click', () => cycleBackground(-1));
    document.getElementById('background-next').addEventListener('click', () => cycleBackground(1));
    document.getElementById('background-recommended').addEventListener('click', useRecommendedBackground);
    document.getElementById('model-prev').addEventListener('click', () => cycleModel(-1));
    document.getElementById('model-next').addEventListener('click', () => cycleModel(1));
    document.getElementById('language-toggle').addEventListener('click', () => {
      UI.toggleLanguage();
      UI.render(state, detailsFor());
    });
    document.getElementById('retry-button').addEventListener('click', boot);
    document.getElementById('gallery-button').addEventListener('click', () => UI.openGallery());
    document.getElementById('gallery-close').addEventListener('click', () => UI.closeGallery());
    document.getElementById('gallery-backdrop').addEventListener('click', () => UI.closeGallery());
    document.getElementById('gallery-model-list').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-gallery-model]');
      if (button) selectModel(button.dataset.galleryModel);
    });
    document.getElementById('gallery-scene-list').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-gallery-scene]');
      if (button) selectBackground(button.dataset.galleryScene);
    });
    document.getElementById('shop-button').addEventListener('click', () => UI.openShop());
    document.getElementById('leaderboard-button').addEventListener('click', () => UI.openLeaderboard());
    document.getElementById('leaderboard-close').addEventListener('click', () => UI.closeLeaderboard());
    document.getElementById('leaderboard-backdrop').addEventListener('click', () => UI.closeLeaderboard());
    document.getElementById('shop-close').addEventListener('click', () => UI.closeShop());
    document.getElementById('shop-backdrop').addEventListener('click', () => UI.closeShop());
    document.getElementById('shop-list').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-shop-id]');
      if (button) buyShopItem(button.dataset.shopId);
    });
    document.getElementById('event-star').addEventListener('click', claimEvent);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (UI.isLeaderboardOpen()) {
          event.preventDefault();
          UI.closeLeaderboard();
          return;
        }
        if (UI.isGalleryOpen()) {
          event.preventDefault();
          UI.closeGallery();
          return;
        }
        if (UI.isShopOpen()) {
          event.preventDefault();
          UI.closeShop();
          return;
        }
      }
      if (event.key !== 'Tab') return;
      const focusable = UI.isShopOpen()
        ? UI.getShopFocusableElements()
        : UI.isGalleryOpen()
          ? UI.getGalleryFocusableElements()
          : UI.isLeaderboardOpen()
            ? UI.getLeaderboardFocusableElements()
            : [];
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex + 1) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopOnlineSystems();
        saveNow();
      } else {
        startOnlineSystems();
      }
    });
    window.addEventListener('pagehide', () => {
      stopOnlineSystems();
      saveNow();
    });
  }

  async function boot() {
    if (booting) return;
    booting = true;
    updateStageScale();
    if (!resizeBound) {
      window.addEventListener('resize', updateStageScale);
      resizeBound = true;
    }
    UI.init();
    UI.showLoading();
    bindEvents();

    try {
      await SDK.init();
      UI.setLanguage(SDK.lang);
      await UI.preloadModels((progress) => UI.setLoading(progress));
      state = sanitizeState(await SDK.load());
      if (typeof Leaderboard !== 'undefined') {
        await Leaderboard.init();
      }
      UI.showGame();
      UI.render(state, detailsFor());
      UI.setSaveStatus(SDK.isCloud() ? 'saved' : 'offline');
      SDK.ready();
      startOnlineSystems();
    } catch (error) {
      console.error('[Game] boot failed', error);
      UI.showFatal();
    } finally {
      booting = false;
    }
  }

  window.__ANIME_CLICKER__ = {
    getState: () => ({ ...state }),
    getDetails: () => ({ ...detailsFor() }),
    saveNow
  };

  window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
