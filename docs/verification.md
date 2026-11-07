# Handoff verification

Verified locally on 5 November 2026 with Node.js 24.18.0 and Chromium.

- `npm test`: 12 server/launcher/delivery integration tests; all six Neon Relay test scripts; all three Key Battle test scripts (including 11 round and 12 smoke checks); 29 Tempo Rush tests.
- `npm run build`: all four entry routes, local resource references, JavaScript/JSON syntax, and audio range responses.
- Browser: hub filters, each controls guide, soundtrack playback and stop-on-close, recent-game shortcut, manual background-motion preference, and OS reduced-motion emulation.
- Responsive hub: 375 px, 768 px and the normal desktop viewport, without horizontal page overflow. Temporary viewport/media overrides were reset after verification.
- Tempo Rush: selected Drake Overdrive / Normal, started music, pressed D/F/J/K, observed a registered hit, paused with audio suspended, returned to the hub.
- Key Battle: started a boss round, correctly submitted the displayed word, observed one stored attack, paused and returned using Enter on the navigation link.
- Neon Relay: started a run, used movement/jump/dash/shoot/pause, returned using keyboard navigation. Boss and advanced combat mechanics are additionally covered by inherited tests.
- Review found and fixed an Enter-key shortcut that consumed navigation on focused links in Neon Relay and Key Battle. Regression tests cover ready/paused states and preserve game-area shortcuts.
- No console errors or warnings were recorded in the browser verification.

This is prototype validation, not exhaustive compatibility certification. The hub is responsive; primary gameplay targets desktop keyboards. No public hosting or CI service is required.

## Immersive play update — 5 November 2026

The desktop-first redesign removes permanent sidebars and marketing headers from Key Battle and Neon Relay. Secondary actions now live in native Pause/setup dialogs.

- Baseline at 1366×768: Key Battle's typing field ended at y=934 and the page was 1181 px tall; Neon Relay's scene ended at y=852 and its page was 1116 px tall.
- New Key Battle at 1280×720: scene starts at y=101, input ends at y=632, page height is 720. At 1440×900, the game and typing dock also fit without scrolling.
- New Neon Relay at 1366×768: scene is 1120×630, y=99–729, and page height is 768.
- Key Battle's real browser test paused after typing `st` in `star`: buffer, word deadline, elapsed time and battle deadline stayed unchanged. Resuming and submitting the rest stored one attack with no lost health. End session, results and changing to practice worked.
- Neon Relay's real browser test preserved position/time/shot count during Pause, ignored attack/restart keys inside settings, resumed correctly, and entered Boss practice from the menu.
- Native fullscreen was verified using the browser's actual Fullscreen API state, including a visible menu inside its fullscreen container.
- Key Battle at 390×430 retained its word, word timer and typing field above the bottom edge; its menu actions remain visible while detail content scrolls. This simulates constrained browser space, not a certification of every physical phone keyboard.
- Neon Relay with touch emulation at 844×390 displayed a 498×280 scene, all 44 px thumb controls outside the scene, and a page height of exactly 390. Pointer presses moved the character, jumped and registered a shot. Temporary touch, fullscreen and viewport overrides were cleared after verification.
- Review caught held Escape dismissing Key Battle's Pause immediately. A regression first reproduced the problem, then verified that repeated Escape is suppressed while normal native cancel still resumes once.
- `npm test` passed all 12 tooling tests, seven Neon test scripts, four Key Battle scripts and 29 Tempo Rush tests. `npm run build` validated 126 runtime files. The tests include menu/lifecycle regressions as well as the original combat and rhythm mechanics.

Screenshots: [Key Battle](key-battle-immersive.jpg), [Neon Relay](neon-relay-immersive.jpg).

## Punkman idle update — 5 November 2026

The ready and stationary poses previously used a single walk frame. Key Battle now loops six existing guitar poses with a small grounded breathing motion. Walking and combat poses retain priority; the sprite files are unchanged and no generation service is involved.

- A regression reproduced the static ready pose before the fix. It now covers ready/waiting animation, grounded position, unchanged typing clocks/health, Pause, hidden tabs, reduced motion and real battle inputs for shooting, dodging and slashing.
- Browser sampling observed all six idle frames in both ready and playing-before-first-keystroke states. Elapsed time stayed zero and health stayed full. Pause preserved both actors exactly; Effects: Reduced produced one stationary pose.
- Typing `pink` followed by Space stored one attack, retained five hearts and entered the existing walk animation. No browser warnings or errors were recorded. The preview was reset to ready afterward.
- `npm test` passed the full suite, including the new idle regression. `npm run build` validated all 126 runtime files.

Preview: [Punkman waiting in Key Battle](key-battle-idle.jpg).
