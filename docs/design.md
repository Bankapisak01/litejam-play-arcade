# LiteJam Play: Arcade — design and implementation brief

## Authorized outcome

The user requests English UI, LiteJam branding related to the existing LiteJam Play practice POC, a home page for choosing the existing games, a modern punk-pixel treatment using installed design skills, and a new repository pushed for team handoff. The user selected the exact product name **LiteJam Play: Arcade**. Repository slug: `litejam-play-arcade`, private under the authenticated `nitikorn20` account.

The suite contains Tempo Rush (two original songs with Easy/Normal), Key Battle (English typing practice/boss rounds), and Neon Relay (action platformer with Synth Drake). LiteJam Play's 3D guitar practice application is a separate sibling product and is not included here.

## Visual direction

Use the installed UI UX Pro Max pixel-art guidance, UI Styling's accessible component/Canvas guidance, and Brand's visual-identity rules. The user additionally requested a pixel logo and pixel font. Create a self-contained SVG pixel wordmark for this Arcade edition, retain the original LiteJam logo asset unchanged, and use locally bundled Pixelify Sans for headings, buttons and game numbers. Keep Inter for longer descriptions and instructions. Both fonts include their SIL Open Font License. A near-black plum background, acid-lime primary action, magenta highlights and restrained cyan balance the punk-pixel sprite art.

The hub has a clear LiteJam header, a featured playable scene with a prominent action, three game cards with controls/time/genre, functional category filters, a how-to-play dialog, recent-game shortcut and optional background-motion control. No account, fake activity counts, invented leaderboards or unavailable links. Sprite scenes animate modestly on hover/focus and during the hero idle. Respect reduced motion and pause decorative loops when hidden/offscreen.

All three games keep their mechanics but receive English UI, LiteJam navigation and a consistent visual shell. Every game has an obvious Back to Arcade link. The existing independent prototypes remain untouched.

## Source and delivery

Use buildless HTML/CSS/JavaScript with no npm runtime dependencies. Keep original game applications in `games/<slug>/dist` so mechanics and tests stay easy to understand. Static assets are included. The new hub and shared shell are in `public/`. A Node standard-library server binds to loopback, defaults to port 8790 with safe fallback, and serves only the public hub and each game's dist files.

Provide npm start/test/build scripts, English README and contributor documentation, original media provenance and bundled font notices, source ZIP and Windows portable demo where feasible using the already-cached verified Node runtime. Do not include the sibling practice project's 3D models, imported songs, credentials, logs, cached executables, or releases in Git.

## Implementation tasks

1. Translate and brand Neon Relay and Key Battle, preserving game tests.
2. Translate and brand Tempo Rush, preserving rhythm and audio tests.
3. Build/test the local server, aggregate test runner, validation, launchers and packaging.
4. Build the hub, sprite artwork/animation, shared design tokens and navigation; validate desktop/mobile/reduced-motion behavior.
5. Run integrated checks and browser playtests, scan the staged repository, create the private GitHub repository and push verified source. Confirm the remote commit and deliver its URL plus local preview and archives.

## Review focus

- Local routes must work from a clean clone, without source-workspace paths.
- No UI-owned Thai strings remain in runtime code or accessible labels.
- Back navigation stops a game's audio/input and cannot start an obsolete session.
- Decorative animation must not obscure controls or defeat reduced motion.
- Repeated launch/stop must not affect unrelated local servers; only intended source/media may be pushed.
