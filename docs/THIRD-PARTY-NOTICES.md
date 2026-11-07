# Asset and font notices

## Fonts

- **Pixelify Sans**, Copyright 2021 The Pixelify Sans Project Authors. Unmodified variable TTF from the Google Fonts repository, licensed under SIL Open Font License 1.1. File: `public/assets/fonts/PixelifySans-Variable.ttf`. Full license: `public/assets/fonts/PixelifySans-OFL.txt`. [Upstream font directory](https://github.com/google/fonts/tree/main/ofl/pixelifysans), [license](https://raw.githubusercontent.com/google/fonts/main/ofl/pixelifysans/OFL.txt).
- **Inter**, version 4.1, from the existing LiteJam Play project's local bundle. SIL Open Font License 1.1. File: `public/assets/fonts/InterVariable.woff2`; full license: `public/assets/fonts/LICENSE.txt`. [Upstream](https://github.com/rsms/inter).

These font licenses permit embedding and redistribution subject to their terms. Preserve the copyright/license files. Neither font is sold separately here.

## Branding

`public/assets/brand/litejam.png` is the existing LiteJam wordmark copied unchanged from the user's LiteJam Play project. This task does not transfer trademark rights or grant a public asset license.

`litejam-pixel.svg` and `arcade-icon.svg` are code-native vector drawings made for this Arcade edition. The pixel wordmark uses an explicit letter grid rather than an embedded font or a paid image-generation service. It is a prototype sub-brand treatment, not a replacement for the official corporate mark.

## Characters, effects and music

Punkman, Synth Drake, sprite sheets and VFX were copied from the user's existing `web-game-prototype`, `punkman-key-battle` and `punkman-tempo-rush` projects. Original sprite bytes are preserved. Hub scenes combine those local atlases with Canvas scenery; no new image-generation request or external stock media was used for this suite.

Neon Heartbeat and Drake Overdrive are the original local, deterministically synthesized compositions from the Tempo Rush prototype. They use no sampled commercial song or cloud audio-generation service. The corresponding local WAV files and Easy/Normal note charts are bundled.

No blanket public redistribution license is assigned to branding, game artwork or music by this repository. Keep this handoff private unless the owner authorizes a public release and confirms the relevant asset rights.

## Portable Node.js runtime

The optional Windows portable ZIP includes Node.js 24.18.0 from the official release, its license and checksum provenance. Node is not included in the source repository. See `runtime/LICENSE` and `runtime/provenance.json` in that archive for the runtime's notices.
