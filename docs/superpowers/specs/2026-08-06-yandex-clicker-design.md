# Yandex Games 2D Clicker — Design Spec

Date: 2026-08-06 · Status: approved by user (plan-mode session)

## Concept
Portrait-first HTML5 clicker for Yandex Games. A vertical anime girl stands on a
gradient background; clicking **the girl herself** earns points. Points buy click-power
upgrades; total points earned raise your level; levels auto-unlock new gradient
backgrounds and new girl models (cycled via buttons). All difficulty is static
(hardcoded tables, tuned by hand, nothing computed at runtime).

## Approved decisions
- **Tech**: vanilla HTML/CSS/JS, no framework, no build step, no WebGL (Yandex accepts HTML5 ZIPs).
- **Art**: 6 generated original anime girls (vertical, transparent PNG) + 512×512 icon. No Pinterest (copyright/moderation). Wholesome content for age rating.
- **Progression**: level-unlocked (see tables below).
- **SDK**: essentials only — save/load, RU/EN auto-language, LoadingAPI.ready(). Wrapper isolates SDK for future leaderboards/ads.
- **Layout**: logical 540×960 stage, CSS-transform-scaled to any window/orientation.
- Working title: "Anime Clicker".

## Files
```
index.html            loading screen + game stage
css/style.css         layout, buttons, animations, gradient classes
js/config.js          balance tables + gradients + ru/en strings (single tuning file)
js/sdk.js             Yandex SDK wrapper (localStorage/'en' fallback when offline)
js/ui.js              rendering, buttons, +N popups, animations
js/main.js            state, save/load, alpha hit-test clicks, leveling
assets/models/girl1..6.png, assets/icon.png
```

## Balance tables (static, in config.js)
- **LEVELS** — 15 thresholds (cumulative *earned* points):
  `0, 100, 260, 520, 930, 1580, 2630, 4310, 6990, 11290, 18160, 29150, 46750, 74890, 119930`
  Level = highest threshold passed. Progress bar toward next.
- **CLICK_UPGRADES** — 12 purchases: power `2,3,5,7,10,14,18,23,29,36,43,50`,
  costs `50,150,400,900,1800,3300,5600,9000,13800,20500,29500,41500`.
- **MODEL_UNLOCKS** — at levels `1,3,5,8,11,15`.
- **GRADIENTS** — 15 CSS gradients themed pastel → sunset → ocean → forest → violet → neon → galaxy → finale; crossfade on change; level auto-applies its gradient (player may then cycle any unlocked one).

## Core mechanics
- Clicks: `pointerdown` on model element only + alpha-pixel test against an offscreen
  canvas copy (alpha > 10). Transparent PNG areas don't count. On hit: add power to
  `points` and `totalEarned`, bounce girl, floating `+N` popup, re-level check.
- Buttons: ① upgrade click power (cost from table, disabled when unaffordable),
  ② cycle unlocked backgrounds ◀▶, ③ cycle unlocked models ◀▶ (locked ones skipped).
- State `{totalEarned, points, clickLevel, modelIdx, bgIdx}`; debounced save via SDK
  wrapper (`player.setData`) with localStorage fallback; also saved on visibilitychange/pagehide.
- i18n: ru/en dictionaries; lang from `ysdk.environment.i18.lang`, default en.
- Loading screen until all images preloaded, then `LoadingAPI.ready()`.
- Mobile hardening: `touch-action: manipulation`, no selection/context menu on stage.

## Yandex shipping
ZIP with `index.html` at root, relative paths only, SDK from
`https://sdk.games.s3.yandex.net/sdk.js`. Console checklist: upload draft, portrait
orientation, age rating, icon + screenshots, RU/EN description. SDK features activate
only inside Yandex; local dev uses fallbacks.

## Verification
Browser-automation pass: click girl → points; click transparent corner/outside → nothing;
buy upgrade → deducted; cycle bg/model; level-up swaps gradient + unlock toast; refresh
restores progress. Validate ZIP structure.
