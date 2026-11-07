# Immersive Play Implementation Plan

> **For agentic workers:** Use the approved design and implement the independent game tasks in parallel, then integrate and review.

**Goal:** Enlarge Key Battle and Neon Relay from entry and move secondary UI into accessible Pause menus.
**Architecture:** Preserve the isolated game apps, add a small shared presentation stylesheet, and adapt each existing controller's pause lifecycle to its native dialog.
**Tech Stack:** Local HTML/CSS/JavaScript, Canvas, Node built-in tests.
**Spec:** docs/immersive-play.md

## Global constraints

- English UI, local assets/fonts, desktop first and mobile secondary.
- No paid services, additional dependencies, sprite or timing changes.
- Do not change Tempo Rush or the hub, and keep the current local entry URLs.

## Tasks

- [x] Shared visual shell: public/shared/play-shell.css supplies compact .play-header and .play-menu components, focus/reduced-motion/mobile styles.
- [x] Key Battle: games/key-battle/dist/index.html, style.css and app.js; update lifecycle tests or add pause-menu-test.cjs for pause/open/resume, preserved input/timers, Escape, form/navigation isolation and end-session behavior. Desktop arena + typing dock, mobile keyboard viewport adaptation.
- [x] Neon Relay: games/neon-relay/dist/index.html, style.css and game.js; update lifecycle tests or add pause-menu-test.cjs for P/Escape, cleared held attacks, menu shortcuts, restart/practice and lifecycle. Fit 16:9 scene to viewport; retain touch controls.
- [x] Integrate: npm test and npm run build, inspect code review findings, browser playtests at desktop and mobile sizes, save screenshots under docs, update README and verification notes, and refresh local preview.

Delivery: commit and push the verified changes; regenerate the source and Windows portable archives for the team.

## Review focus

- A menu key must not immediately reopen or resume on the same event.
- Menu focus must not receive gameplay attacks or leak into underlying controls.
- Mobile virtual keyboard and a short browser viewport must not hide current word/input.
- Native fullscreen must include the modal menu and keep the gameplay aspect ratio.
- Page leave/blur/loading races must not resurrect a run or audio, and every old gameplay check must still pass.
