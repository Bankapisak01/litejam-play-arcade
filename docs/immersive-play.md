# Immersive play layout

The user approved the proposed desktop-first redesign on 5 November 2026: Key Battle and Neon Relay open with a large game area; secondary controls move to Pause; mobile is a secondary option. Preserve the existing mechanics, sprites and English pixel identity. The hub and Tempo Rush stay as they are.

## Chosen approach

Use an immersive layout within the browser viewport by default, with optional user-triggered fullscreen. A compact header provides LiteJam identity, Back to Arcade, and a discoverable Menu/Pause button. Remove the marketing headline and permanent right sidebar from play screens. Essential health, boss/charge state and active timing remain visible.

Key Battle: a wide battle scene above a compact, readable typing dock. Current word, word deadline, input and Space-to-submit hint sit together. Secondary stats are compact. Session selection, full instructions, sound/effects and end-session actions move into a native modal menu, available before play and while paused. Pausing preserves word buffer, timers and battle turn. Mobile portrait adapts around the native keyboard via visualViewport when available.

Neon Relay: a large centered 16:9 scene fitted to the available width AND height, preserving world coordinates and pixel rendering. Pause menu contains sound/cinema, controls, mission, Restart and Boss practice. P remains supported and Escape also opens/closes Pause. Native fullscreen remains opt-in. Mobile landscape uses existing multi-touch controls with safe insets; portrait shows an unobtrusive landscape hint.

Shared modal presentation comes from public/shared/play-shell.css. Native dialogs provide focus containment. Escape/cancel resumes once where appropriate, and game shortcuts do not fire while interacting with menus. Opening menus clears held game input. Unexpected blur never resumes a paused session. Reduced-motion preferences stay respected.

## Alternatives considered

- Keep the sidebar but add a bigger fullscreen button: leaves the default experience cramped.
- Automatically enter native fullscreen: removes browser context and depends on a user gesture.
- Selected: large viewport layout with optional fullscreen and contextual menus. Fits the approved request and existing buildless stack.

## Acceptance

Desktop sizes 1366×768 and 1440×900 show the game plus required inputs without page scrolling. Shorter screens degrade through usable scrolling instead of clipping controls. Key Battle works with a visible mobile keyboard; Neon Relay's scene keeps its aspect ratio and touch controls remain reachable. Menu settings, resume, restart/end session, and Back to Arcade work by keyboard. Existing tests and new pause-menu lifecycle regressions pass. Preview both games locally and save visual evidence.
