(function () {
  'use strict';

  const STORAGE_KEY = 'anime-clicker-save-v1';
  const LOCAL_FIELDS = [
    'totalEarned', 'points', 'clickLevel', 'modelIdx', 'bgIdx',
    'autoClickers', 'focusLevel', 'lensLevel', 'manualClicks', 'eventClicks',
    'bestCombo', 'achievements'
  ];
  let ysdk = null;
  let player = null;
  let initPromise = null;

  function detectBrowserLanguage() {
    const candidates = [];
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
      if (navigator.language) candidates.push(navigator.language);
    }
    return candidates.some((value) => String(value).toLowerCase().startsWith('ru')) ? 'ru' : 'en';
  }

  function getLocalState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('[SDK] local load unavailable', error);
      return null;
    }
  }

  function pickState(value) {
    if (!value || typeof value !== 'object') return null;
    const state = {};
    for (const field of LOCAL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
      state[field] = field === 'achievements' && Array.isArray(value[field])
        ? value[field].filter((id) => typeof id === 'string').slice(0, 64)
        : value[field];
    }
    return Object.keys(state).length ? state : null;
  }

  function rememberLocally(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[SDK] local save unavailable', error);
    }
  }

  function withTimeout(promise, milliseconds) {
    return Promise.race([
      promise,
      new Promise((resolve) => window.setTimeout(() => resolve(null), milliseconds))
    ]);
  }

  const SDK = {
    mode: 'offline',
    lang: 'en',
    LOCAL_FIELDS,

    async init() {
      if (initPromise) return initPromise;

      initPromise = (async () => {
        const hasYandexSdk = typeof window.YaGames !== 'undefined' && typeof window.YaGames.init === 'function';
        if (!hasYandexSdk) {
          this.lang = detectBrowserLanguage();
          return this;
        }

        try {
          ysdk = await withTimeout(window.YaGames.init(), 2200);
          if (!ysdk) throw new Error('Yandex SDK init timeout');

          this.mode = 'yandex';
          const environment = ysdk.environment || {};
          const language = environment.i18?.lang || environment.i18n?.lang || environment.lang || 'en';
          this.lang = String(language).toLowerCase().startsWith('ru') ? 'ru' : 'en';

          try {
            player = await withTimeout(ysdk.getPlayer({ scopes: false }), 1800);
          } catch (error) {
            console.warn('[SDK] player unavailable; local fallback remains active', error);
          }
        } catch (error) {
          this.mode = 'offline';
          this.lang = detectBrowserLanguage();
          console.info('[SDK] running with local fallback', error);
        }

        return this;
      })();

      return initPromise;
    },

    async load() {
      const local = getLocalState();

      if (player && typeof player.getData === 'function') {
        try {
          const remote = pickState(await player.getData());
          if (remote) {
            rememberLocally(remote);
            return remote;
          }
        } catch (error) {
          console.warn('[SDK] cloud load unavailable; using local fallback', error);
        }
      }

      return local;
    },

    async save(data) {
      const safeData = pickState(data) || {};
      rememberLocally(safeData);

      if (player && typeof player.setData === 'function') {
        try {
          await player.setData(safeData, true);
        } catch (error) {
          console.warn('[SDK] cloud save unavailable; local copy is safe', error);
        }
      }
    },

    ready() {
      try {
        ysdk?.features?.LoadingAPI?.ready();
      } catch (error) {
        console.warn('[SDK] LoadingAPI.ready unavailable', error);
      }
    },

    isCloud() {
      return this.mode === 'yandex' && Boolean(player);
    }
  };

  window.SDK = SDK;
})();
