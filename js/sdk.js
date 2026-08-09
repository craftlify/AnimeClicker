(function () {
  'use strict';

  const STORAGE_KEY = 'anime-clicker-save-v1';
  const LANGUAGE_KEY = 'anime-clicker-language-v1';
  const DEFAULT_LANGUAGE = 'ru';
  const LOCAL_FIELDS = [
    'totalEarned', 'points', 'clickLevel', 'modelIdx', 'bgIdx',
    'autoClickers', 'focusLevel', 'lensLevel', 'manualClicks', 'eventClicks',
    'bestCombo', 'achievements'
  ];
  let ysdk = null;
  let player = null;
  let initPromise = null;

  function readLanguagePreference() {
    try {
      const value = window.localStorage.getItem(LANGUAGE_KEY);
      return value === 'ru' || value === 'en' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writeLanguagePreference(value) {
    const language = value === 'ru' ? 'ru' : 'en';
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch (error) {
      console.warn('[SDK] language preference unavailable', error);
    }
    return language;
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
    lang: DEFAULT_LANGUAGE,
    LOCAL_FIELDS,
    LANGUAGE_KEY,

    getLanguagePreference() {
      return readLanguagePreference();
    },

    setLanguagePreference(value) {
      return writeLanguagePreference(value);
    },

    async init() {
      if (initPromise) return initPromise;

      initPromise = (async () => {
        const preferredLanguage = readLanguagePreference();
        const hasYandexSdk = typeof window.YaGames !== 'undefined' && typeof window.YaGames.init === 'function';
        if (!hasYandexSdk) {
          this.lang = preferredLanguage || DEFAULT_LANGUAGE;
          return this;
        }

        try {
          ysdk = await withTimeout(window.YaGames.init(), 2200);
          if (!ysdk) throw new Error('Yandex SDK init timeout');

          this.mode = 'yandex';
          const environment = ysdk.environment || {};
          const language = environment.i18?.lang || environment.i18n?.lang || environment.lang || DEFAULT_LANGUAGE;
          this.lang = preferredLanguage || (String(language).toLowerCase().startsWith('ru') ? 'ru' : DEFAULT_LANGUAGE);

          try {
            player = await withTimeout(ysdk.getPlayer({ scopes: false }), 1800);
          } catch (error) {
            console.warn('[SDK] player unavailable; local fallback remains active', error);
          }
        } catch (error) {
          this.mode = 'offline';
          this.lang = preferredLanguage || DEFAULT_LANGUAGE;
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
