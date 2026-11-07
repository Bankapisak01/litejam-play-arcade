# LiteJam Play: Arcade

This repository is the complete source of the keyboard arcade proof of concept. Read README.md and docs/design.md before changing behavior.

- UI-owned text, accessibility labels and documentation are English.
- The brand is LiteJam Play: Arcade. Punkman is the character, not the application brand.
- Preserve the three working games, original songs/charts and existing sprite bytes.
- Runtime assets stay local. No CDN, analytics, cloud API or paid generation service.
- The hub is public/; each game remains an isolated games/<slug>/dist application.
- Shared navigation/styles are in public/shared. Every game must link back to /.
- Keep game timing and audio lifecycle independent of decorative animations.
- Respect prefers-reduced-motion. Background animations pause when hidden/offscreen.
- Tests run with npm test; npm run build validates runtime files without installing packages.
- Preview through the local server, test real navigation/game controls, and save screenshots for UI changes.
- Exclude logs, node_modules, runtime executables, ZIP files, private credentials and old working directories from Git.
- Branding/assets are for the user's private team handoff. Do not change repository visibility or assign an open-source license to them without instructions.
