/* Neon Relay × Scale Flow — rail-runner layout rules. Pure numbers, no DOM, unit-tested.
 * The six guitar strings are six neon rails across the rooftops (string 1 = high e on top, string 6 = low E at the bottom).
 * Notes scroll toward Punkman at the round's tempo: a note sits exactly on him on its beat. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScaleRunRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RAIL = { top: 118, gap: 23 };
  const STRING_NAMES = { 6: 'E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'e' };
  const PLAYER_X = 118, BEAT_PX = 96, visibleWindowBeats = 4.5;
  const hopKeys = { KeyW: -1, ArrowUp: -1, KeyS: 1, ArrowDown: 1 };   // -1 = toward string 1 (up on screen)
  const strumKeys = ['KeyJ', 'KeyX', 'Space'];
  const clampString = n => Math.max(1, Math.min(6, Math.round(n)));
  const railY = string => RAIL.top + (clampString(string) - 1) * RAIL.gap;
  const noteX = (dueMs, clockMs, beatMs) => PLAYER_X + (dueMs - clockMs) / beatMs * BEAT_PX;
  return { RAIL, STRING_NAMES, PLAYER_X, BEAT_PX, visibleWindowBeats, hopKeys, strumKeys, clampString, railY, noteX };
});
