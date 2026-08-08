(function () {
  'use strict';

  const UI = (() => {
    const refs = {};
    const preloadedImages = [];
    let language = 'en';
    let appliedBackground = -1;
    let appliedModel = -1;
    let backgroundTimer = 0;
    let toastTimer = 0;
    let shopBuilt = false;
    let shopReturnFocus = null;

    function cache() {
      const ids = [
        'app', 'loading-screen', 'loading-label', 'loading-hint', 'loading-bar', 'game-shell',
        'game-stage', 'gradient-current', 'gradient-next', 'language-toggle', 'app-title',
        'app-subtitle', 'level-label', 'progress-fill', 'progress-copy', 'points-caption',
        'points-value', 'cps-value', 'combo-label', 'total-earned', 'click-hint', 'toast', 'model-frame', 'model-image',
        'retry-button', 'upgrade-kicker',
        'power-value', 'per-click', 'upgrade-status', 'upgrade-button', 'upgrade-label',
        'upgrade-cost', 'background-kicker', 'background-label', 'background-hint',
        'background-prev', 'background-next', 'model-kicker', 'model-label', 'model-hint',
        'model-prev', 'model-next', 'save-status', 'shop-button', 'shop-sheet', 'shop-backdrop',
        'shop-close', 'shop-list', 'shop-title', 'shop-summary', 'achievements-title',
        'achievement-count', 'achievement-list', 'event-star',
        'leaderboard-button', 'leaderboard-sheet', 'leaderboard-backdrop', 'leaderboard-close',
        'leaderboard-title', 'leaderboard-summary', 'leaderboard-list', 'leaderboard-status'
      ];
      for (const id of ids) {
        const node = document.getElementById(id);
        refs[id] = node;
        refs[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = node;
      }
    }

    function formatNumber(value) {
      return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(Math.max(0, Math.floor(value || 0)));
    }

    function translate(key, values) {
      const dictionary = CONFIG.STRINGS[language] || CONFIG.STRINGS.en;
      let value = dictionary[key] || CONFIG.STRINGS.en[key] || key;
      if (values) {
        for (const [token, replacement] of Object.entries(values)) {
          value = value.replace(new RegExp(`\\{${token}\\}`, 'g'), String(replacement));
        }
      }
      return value;
    }

    function setStaticCopy() {
      refs.appTitle.textContent = translate('title');
      refs.appSubtitle.textContent = translate('subtitle');
      refs.loadingLabel.textContent = translate('loading');
      refs.loadingHint.textContent = translate('loadingHint');
      refs.pointsCaption.textContent = translate('points');
      refs.upgradeKicker.textContent = translate('upgradeKicker');
      refs.backgroundKicker.textContent = translate('backgroundKicker');
      refs.backgroundHint.textContent = translate('backgroundHint');
      refs.modelKicker.textContent = translate('modelKicker');
      refs.modelHint.textContent = translate('modelHint');
      refs.clickHint.textContent = translate('clickHint');
      refs.languageToggle.textContent = translate('language');
      refs.retryButton.textContent = translate('retry');
      refs.shopButton.textContent = translate('shop');
      refs.leaderboardButton.textContent = translate('leaderboard');
      refs.shopTitle.textContent = translate('shopTitle');
      refs.leaderboardTitle.textContent = translate('leaderboardTitle');
      refs.shopClose.setAttribute('aria-label', translate('close'));
      refs.leaderboardClose.setAttribute('aria-label', translate('close'));
      refs.achievementsTitle.textContent = translate('achievements');
      refs.eventStar.setAttribute('aria-label', translate('starEvent'));
      refs.loadingScreen.setAttribute('aria-label', translate('loading'));
    }

    function setLanguage(nextLanguage) {
      language = nextLanguage === 'ru' ? 'ru' : 'en';
      document.documentElement.lang = language;
      setStaticCopy();
      if (appliedModel >= 0) {
        const name = (CONFIG.MODEL_NAMES[language] || CONFIG.MODEL_NAMES.en)[appliedModel];
        refs.modelImage.alt = translate('modelAlt', { a: name });
      }
    }

    function setLoading(progress) {
      const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
      const percent = Math.round(normalized * 100);
      refs.loadingBar.style.width = `${percent}%`;
      refs.loadingScreen.querySelector('.loading-progress').setAttribute('aria-valuenow', String(percent));
    }

    async function preloadModels(onProgress) {
      const sources = [...CONFIG.MODELS, CONFIG.ICON];
      let completed = 0;

      const tasks = sources.map((source, index) => new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          if (index < CONFIG.MODELS.length) preloadedImages[index] = image;
          completed += 1;
          onProgress?.(completed / sources.length);
          resolve(image);
        };
        image.onerror = () => reject(new Error(`Unable to load ${source}`));
        image.src = source;
      }));

      await Promise.all(tasks);
      return preloadedImages;
    }

    function showGame() {
      refs.loadingScreen.classList.add('is-hidden');
      refs.gameShell.classList.remove('is-hidden');
      refs.retryButton.classList.add('is-hidden');
    }

    function showLoading() {
      refs.loadingScreen.classList.remove('is-hidden');
      refs.gameShell.classList.add('is-hidden');
      refs.retryButton.classList.add('is-hidden');
      setStaticCopy();
      setLoading(0);
    }

    function renderBackground(index) {
      const scene = CONFIG.SCENES?.[index] || CONFIG.SCENES?.[0];
      const gradient = scene?.gradient || CONFIG.GRADIENTS[index] || CONFIG.GRADIENTS[0];
      refs.gameStage.dataset.tone = scene?.tone || CONFIG.BACKGROUND_TONES[index] || 'light';
      if (appliedBackground < 0) {
        refs.gradientCurrent.style.background = gradient;
        appliedBackground = index;
        return;
      }
      if (appliedBackground === index) return;

      window.clearTimeout(backgroundTimer);
      refs.gradientNext.style.background = gradient;
      refs.gradientNext.classList.add('is-visible');
      backgroundTimer = window.setTimeout(() => {
        refs.gradientCurrent.style.background = gradient;
        refs.gradientNext.classList.remove('is-visible');
        appliedBackground = index;
      }, 660);
      appliedBackground = index;
    }

    function renderModel(index) {
      if (appliedModel === index) return;
      const modelName = (CONFIG.MODEL_NAMES[language] || CONFIG.MODEL_NAMES.en)[index] || `Model ${index + 1}`;
      refs.modelImage.src = CONFIG.MODELS[index];
      refs.modelImage.alt = translate('modelAlt', { a: modelName });
      if (appliedModel >= 0) {
        refs.modelFrame.classList.remove('is-changing');
        void refs.modelFrame.offsetWidth;
        refs.modelFrame.classList.add('is-changing');
        window.setTimeout(() => refs.modelFrame.classList.remove('is-changing'), 480);
      }
      appliedModel = index;
    }

    function buildShop() {
      if (shopBuilt) return;
      shopBuilt = true;
      refs.shopList.replaceChildren();
      for (const item of CONFIG.SHOP_ITEMS) {
        const card = document.createElement('article');
        card.className = 'shop-card';
        card.dataset.shopItem = item.id;
        card.innerHTML = `
          <div class="shop-card-copy">
            <div class="shop-card-heading">
              <h3 data-shop-name></h3>
              <span class="shop-card-level" data-shop-level></span>
            </div>
            <p data-shop-description></p>
            <span class="shop-card-effect" data-shop-effect></span>
          </div>
          <button class="shop-buy" type="button" data-shop-id="${item.id}"></button>`;
        refs.shopList.appendChild(card);
      }
      refs.achievementList.replaceChildren();
      for (const achievement of CONFIG.ACHIEVEMENTS) {
        const row = document.createElement('div');
        row.className = 'achievement-item';
        row.dataset.achievementId = achievement.id;
        row.innerHTML = `
          <span class="achievement-icon" aria-hidden="true">✦</span>
          <span class="achievement-copy"><strong data-achievement-title></strong><small data-achievement-description></small></span>
          <span class="achievement-status" data-achievement-status></span>`;
        refs.achievementList.appendChild(row);
      }
    }

    function renderShop(state, details) {
      buildShop();
      refs.cpsValue.textContent = translate('shopCpsEffect', { a: formatNumber(details.cps) });
      refs.comboLabel.classList.toggle('is-visible', details.combo > 0);
      refs.comboLabel.textContent = details.combo > 0
        ? translate('combo', { a: details.combo })
        : '';
      refs.shopSummary.textContent = translate('shopSummary', {
        a: details.achievementCount,
        b: CONFIG.ACHIEVEMENTS.length
      });
      for (const item of CONFIG.SHOP_ITEMS) {
        const card = refs.shopList.querySelector(`[data-shop-item="${item.id}"]`);
        const level = Math.max(0, Math.floor(state[item.id] || 0));
        const locked = details.level < item.unlockLevel;
        const maxed = level >= item.max;
        const cost = Math.floor(item.baseCost * Math.pow(item.growth, level));
        const button = card.querySelector('[data-shop-id]');
        card.classList.toggle('is-locked', locked);
        card.classList.toggle('is-maxed', maxed);
        card.querySelector('[data-shop-name]').textContent = translate(item.nameKey);
        card.querySelector('[data-shop-description]').textContent = translate(item.descriptionKey);
        card.querySelector('[data-shop-effect]').textContent = translate(item.effectKey, {
          a: item.id === 'lensLevel' ? level * 25 : level
        });
        card.querySelector('[data-shop-level]').textContent = translate('shopLevel', { a: level, b: item.max });
        button.disabled = locked || maxed || state.points < cost;
        button.textContent = locked
          ? translate('shopLocked', { a: item.unlockLevel })
          : maxed
            ? translate('max')
            : translate('shopCost', { a: formatNumber(cost) });
        button.setAttribute('aria-label', translate(item.nameKey));
      }
      for (const achievement of CONFIG.ACHIEVEMENTS) {
        const row = refs.achievementList.querySelector(`[data-achievement-id="${achievement.id}"]`);
        const unlocked = state.achievements.includes(achievement.id);
        row.classList.toggle('is-unlocked', unlocked);
        row.querySelector('[data-achievement-title]').textContent = translate(achievement.titleKey);
        row.querySelector('[data-achievement-description]').textContent = translate(achievement.descriptionKey);
        row.querySelector('[data-achievement-status]').textContent = unlocked ? translate('unlocked') : translate('locked');
      }
    }

    function render(state, details) {
      const level = details.level;
      const power = details.power;
      const basePower = details.basePower ?? power;
      const upgradePowers = CONFIG.CLICK_UPGRADES.POWERS;
      const upgradeCosts = CONFIG.CLICK_UPGRADES.COSTS;
      const isMaxUpgrade = state.clickLevel >= upgradeCosts.length;
      const nextPower = upgradePowers[state.clickLevel + 1];
      const nextCost = upgradeCosts[state.clickLevel];
      const canAfford = !isMaxUpgrade && state.points >= nextCost;
      const unlockedModels = details.unlockedModelCount;
      const modelName = (CONFIG.MODEL_NAMES[language] || CONFIG.MODEL_NAMES.en)[state.modelIdx];

      renderBackground(state.bgIdx);
      renderModel(state.modelIdx);

      refs.levelLabel.textContent = translate('level', { a: level, b: CONFIG.MAX_LEVEL });
      refs.progressFill.style.width = `${Math.round(details.progress * 100)}%`;
      refs.progressFill.parentElement.classList.toggle('has-progress', details.progress > 0);
      refs.progressFill.parentElement.querySelector('.progress-spark').style.left = `${Math.max(0, Math.min(99, details.progress * 100))}%`;
      refs.progressCopy.textContent = details.isMaxLevel
        ? translate('maxLevel')
        : translate('nextLevel', { a: formatNumber(details.nextThreshold - state.totalEarned) });
      refs.pointsValue.textContent = formatNumber(state.points);
      refs.totalEarned.textContent = translate('total', { a: formatNumber(state.totalEarned) });
      refs.powerValue.textContent = `×${power}`;
      refs.perClick.textContent = translate('perClick', { a: power });

      refs.upgradeButton.disabled = !canAfford;
      refs.upgradeButton.classList.toggle('is-ready', canAfford);
      refs.upgradeLabel.textContent = isMaxUpgrade
        ? translate('btnMax')
        : translate('btnPower', { a: basePower, b: nextPower });
      refs.upgradeCost.textContent = isMaxUpgrade ? '' : translate('cost', { a: formatNumber(nextCost) });
      refs.upgradeStatus.textContent = isMaxUpgrade
        ? translate('btnMax')
        : translate('cost', { a: formatNumber(nextCost) });

      refs.backgroundLabel.textContent = translate('background', {
        a: state.bgIdx + 1,
        b: details.unlockedBackgroundCount
      });
      refs.backgroundPrev.disabled = details.unlockedBackgroundCount <= 1;
      refs.backgroundNext.disabled = details.unlockedBackgroundCount <= 1;
      refs.backgroundPrev.setAttribute('aria-label', translate('previous'));
      refs.backgroundNext.setAttribute('aria-label', translate('next'));

      refs.modelLabel.textContent = translate('model', {
        a: modelName,
        b: state.modelIdx + 1,
        c: CONFIG.MODELS.length
      });
      refs.modelHint.textContent = `${unlockedModels} / ${CONFIG.MODELS.length} ${translate('modelHint').toLowerCase()}`;
      refs.modelPrev.disabled = unlockedModels <= 1;
      refs.modelNext.disabled = unlockedModels <= 1;
      refs.modelPrev.setAttribute('aria-label', translate('previous'));
      refs.modelNext.setAttribute('aria-label', translate('next'));
      renderShop(state, details);
    }

    function spawnPoints(x, y, value) {
      const popup = document.createElement('span');
      popup.className = 'floating-number';
      popup.textContent = `+${formatNumber(value)}`;
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      refs.gameStage.appendChild(popup);
      window.requestAnimationFrame(() => popup.classList.add('is-rising'));
      window.setTimeout(() => popup.remove(), 820);
    }

    function bounceModel() {
      refs.modelFrame.classList.remove('is-bouncing');
      void refs.modelFrame.offsetWidth;
      refs.modelFrame.classList.add('is-bouncing');
      window.setTimeout(() => refs.modelFrame.classList.remove('is-bouncing'), 450);
    }

    function showToast(key, values, duration = 1600) {
      refs.toast.textContent = translate(key, values);
      refs.toast.classList.remove('is-visible');
      void refs.toast.offsetWidth;
      refs.toast.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-visible'), duration);
    }

    function setSaveStatus(kind) {
      refs.saveStatus.classList.remove('is-saved', 'is-saving');
      if (kind === 'saving') {
        refs.saveStatus.classList.add('is-saving');
        refs.saveStatus.textContent = translate('saving');
      } else if (kind === 'saved') {
        refs.saveStatus.classList.add('is-saved');
        refs.saveStatus.textContent = translate('saved');
      } else {
        refs.saveStatus.textContent = translate('offline');
      }
    }

    function toggleLanguage() {
      setLanguage(language === 'en' ? 'ru' : 'en');
      return language;
    }

    function openShop() {
      shopReturnFocus = document.activeElement;
      refs.shopBackdrop.classList.add('is-visible');
      refs.shopSheet.classList.add('is-visible');
      refs.shopSheet.setAttribute('aria-hidden', 'false');
      refs.shopClose.focus();
    }

    function closeShop() {
      refs.shopBackdrop.classList.remove('is-visible');
      refs.shopSheet.classList.remove('is-visible');
      refs.shopSheet.setAttribute('aria-hidden', 'true');
      const focusTarget = shopReturnFocus && document.contains(shopReturnFocus)
        ? shopReturnFocus
        : refs.shopButton;
      focusTarget?.focus();
      shopReturnFocus = null;
    }

    let leaderboardReturnFocus = null;

    function renderLeaderboard(entries) {
      refs.leaderboardList.replaceChildren();
      const credentials = typeof Leaderboard !== 'undefined' ? Leaderboard.getCredentials() : null;
      const rank = typeof Leaderboard !== 'undefined' ? Leaderboard.getServerRank() : null;
      const online = typeof Leaderboard !== 'undefined' ? Leaderboard.isOnline() : false;

      if (!online) {
        refs.leaderboardStatus.textContent = translate('leaderboardOffline');
      } else if (rank) {
        refs.leaderboardStatus.textContent = translate('leaderboardYou', { a: rank });
      } else {
        refs.leaderboardStatus.textContent = translate('leaderboardUnranked');
      }

      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'leaderboard-empty';
        empty.textContent = translate('leaderboardEmpty');
        refs.leaderboardList.appendChild(empty);
        return;
      }

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        if (credentials?.id === entry.id) row.classList.add('is-you');
        row.innerHTML = `
          <span class="leaderboard-rank" data-rank></span>
          <span class="leaderboard-name" data-name></span>
          <span class="leaderboard-score" data-score></span>`;
        row.querySelector('[data-rank]').textContent = translate('leaderboardRank', { a: entry.rank });
        row.querySelector('[data-name]').textContent = entry.name;
        row.querySelector('[data-score]').textContent = translate('leaderboardScore', { a: formatNumber(entry.totalEarned) });
        refs.leaderboardList.appendChild(row);
      }
    }

    async function openLeaderboard() {
      leaderboardReturnFocus = document.activeElement;
      refs.leaderboardBackdrop.classList.add('is-visible');
      refs.leaderboardSheet.classList.add('is-visible');
      refs.leaderboardSheet.setAttribute('aria-hidden', 'false');
      refs.leaderboardClose.focus();
      refs.leaderboardStatus.textContent = translate('loading');
      try {
        if (typeof Leaderboard !== 'undefined') {
          await Leaderboard.queueSync(false);
          const entries = await Leaderboard.fetchLeaderboard(20);
          renderLeaderboard(entries);
        } else {
          renderLeaderboard([]);
        }
      } catch (error) {
        renderLeaderboard([]);
      }
    }

    function closeLeaderboard() {
      refs.leaderboardBackdrop.classList.remove('is-visible');
      refs.leaderboardSheet.classList.remove('is-visible');
      refs.leaderboardSheet.setAttribute('aria-hidden', 'true');
      const focusTarget = leaderboardReturnFocus && document.contains(leaderboardReturnFocus)
        ? leaderboardReturnFocus
        : refs.leaderboardButton;
      focusTarget?.focus();
      leaderboardReturnFocus = null;
    }

    function getShopFocusableElements() {
      return [refs.shopClose, ...refs.shopList.querySelectorAll('button:not(:disabled)')]
        .filter((node) => node && !node.closest('.is-hidden'));
    }

    function setEventActive(active) {
      refs.eventStar.classList.toggle('is-visible', active);
      refs.eventStar.setAttribute('aria-hidden', active ? 'false' : 'true');
      refs.eventStar.tabIndex = active ? 0 : -1;
    }

    function setEventPosition(left, top) {
      refs.eventStar.style.left = `${left}%`;
      refs.eventStar.style.top = `${top}%`;
    }

    function getEventPoint() {
      const stageRect = refs.gameStage.getBoundingClientRect();
      const eventRect = refs.eventStar.getBoundingClientRect();
      return {
        x: ((eventRect.left + eventRect.width / 2 - stageRect.left) / stageRect.width) * CONFIG.STAGE_WIDTH,
        y: ((eventRect.top + eventRect.height / 2 - stageRect.top) / stageRect.height) * CONFIG.STAGE_HEIGHT
      };
    }

    return {
      init() {
        cache();
        setLanguage(language);
        buildShop();
      },
      setLanguage,
      toggleLanguage,
        setLoading,
        preloadModels,
        showLoading,
        showGame,
      render,
      spawnPoints,
      bounceModel,
      showToast,
      setSaveStatus,
      translate,
      openShop,
      closeShop,
      openLeaderboard,
      closeLeaderboard,
      isShopOpen: () => refs.shopSheet.classList.contains('is-visible'),
      isLeaderboardOpen: () => refs.leaderboardSheet.classList.contains('is-visible'),
      getShopFocusableElements,
      setEventActive,
      setEventPosition,
      getEventPoint,
      getModelElement: () => refs.modelImage,
      getStageElement: () => refs.gameStage,
      getPreloadedImage: (index) => preloadedImages[index],
      showFatal() {
        refs.loadingScreen.classList.remove('is-hidden');
        refs.gameShell.classList.add('is-hidden');
        refs.loadingLabel.textContent = translate('loadError');
        refs.loadingHint.textContent = translate('loadRetryHint');
        refs.loadingBar.style.width = '100%';
        refs.retryButton.textContent = translate('retry');
        refs.retryButton.classList.remove('is-hidden');
      }
    };
  })();

  window.UI = UI;
})();
