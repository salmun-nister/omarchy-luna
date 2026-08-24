# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] — 2026-08-24

### Changed

- Canvas-style wink cadence shortened to a uniform 10–60 s random cooldown
  (was 10 s – 2 min); stale comments corrected to match the code.

### Removed

- Over-engineering trim, no behavior change beyond the cadence above: dead
  `refresh()` forwarding pair (nothing called it), unused `moonAgeDays()`
  helper, redundant `effectiveArtStyle` alias layer, diagnostics-only
  `artColumns` property, pointless color aliases in the rubber-hose painter,
  a duplicate test assertion, and re-validation of already-clamped inputs in
  `renderMoonArt()` (odd-row enforcement now lives where the `artRows`
  setting is read). Net −25 lines.

## [0.1.3] — 2026-08-24

### Fixed

- Panel failed to load after v0.1.2 removed the `Quickshell.Io` import still
  required by its IPC handler: `IpcHandler is not a type` aborted compilation
  of the whole file, leaving an invisible zero-width bar pill (plugin listed
  as enabled but `active: false`). The import is restored.

## [0.1.2] — 2026-08-24

### Removed

- Hemisphere auto-detection from Omarchy's weather location file
  (`~/.local/state/omarchy/settings/weather.json`), following marketplace
  security review of parsing user-writable state. The `hemisphere` setting
  now defaults to north; southern-hemisphere users should set
  `"hemisphere": "south"` on the widget's bar-layout entry in
  `~/.config/omarchy/shell.json`.

## [0.1.1] — 2026-08-23

### Added

- Regression test suite (`luna-tests.js`): moon-phase math checked against
  known 2024 UTC lunar events, Meeus lunation predictions verified against 20
  cross-referenced 2026 almanac instants, hemisphere auto-detect parsing, the
  vector-style mouth hit test, and art-renderer invariants (mirror/south
  equivalence, crater/sea stamping). Run with `node luna-tests.js`.

## [0.1.0] — 2026-08-23

### Added

- Offline moon phase engine (`Model.js`): phase fraction from the mean synodic
  month anchored to the 2000-01-06 18:14 UTC new moon, illumination percentage,
  moon age in days, canonical 8-phase names with tolerance bands, and next
  new/full moon timestamps computed with Meeus *Astronomical Algorithms* ch. 49
  lunation corrections — accurate to within a few minutes against 2026 almanac
  data (a plain mean-month model drifts by up to half a day).
- Dynamic text-art renderer that draws the lunar disk at the exact phase
  fraction using a disk + terminator-ellipse lit test; four styles selectable
  at runtime: `blocks` (`█ ▓ · ○ ▒`), `ascii` (`@ # . O ~`), `vector` and
  `cartoon`. Column count derives from the rendering font's real cell aspect
  (measured via a hidden probe text) so the disk stays circular.
  Southern-hemisphere users can mirror the art via the `hemisphere` setting.
- Bar pill showing the nearest-of-8 moon glyph, optionally followed by the
  illumination percentage (`showPercent`), with the phase name as tooltip.
- Plain icon mode: the pill shows a monochrome Nerd Font moon glyph that
  inherits the theme's text color (default; set `"plainIcon": false` or press
  `I` in the popup for the color emoji instead). Hemisphere mirroring is
  preserved and notifications keep the emoji.
- Popup panel: large text-art moon, phase name, age, illumination, next full
  and new moon dates. Clicking the moon (or pressing S / Enter in the panel)
  cycles styles for the session.
- Right-click on the pill sends a desktop notification summarizing the current
  phase.
- Settings: `artStyle`, `artRows`, `hemisphere`, `showPercent`, `plainIcon` —
  set as flat keys on the widget's bar-layout entry in
  `~/.config/omarchy/shell.json`; `artRows` defaults to 19 (clamped 9–41).
- Eight stylized craters loosely matching the near side (Tycho, Copernicus,
  Kepler, Aristarchus, Plato, Gassendi, Langrenus, Grimaldi), stamped only
  where the current phase lights them, at fixed positions; mirrored
  automatically for southern hemisphere.
- Lunar maria: eight dark seas (Imbrium, Serenitatis, Tranquillitatis,
  Fecunditatis, Crisium, Nubium, Humorum, Oceanus Procellarum) rendered in a
  shade distinct from the terminator; craters inside them stay visible
  (Aristarchus, Copernicus).
- Canvas-drawn character styles: `vector` (warm yellow cartoon moon whose
  smile hides a small surprise) and `cartoon` (1930s rubber-hose monochrome
  moon with ink pupils, expressive brows, a toothy grin and an occasional
  wink); both drawn with theme colors only, no images.
- Wink system: canvas styles blink on a random cooldown of 10 s – 2 min;
  a dev test mode (toggle with `?`) shortens it to 3 s, freezes the phase
  and advances a synthetic cycle so all styles can be watched live.
- Style persistence: cycling writes `artStyle` straight into the widget's
  `shell.json` layout entry (via the shell's inline-entry API), so the
  last-used style survives relaunches; fail-safe default is `blocks`.
- Hemisphere auto-detect: with no explicit `hemisphere` setting, the moon
  mirrors for users south of the equator by reading the latitude from
  Omarchy's configured weather location; an explicit setting always wins.
- Star field of twelve glyphs, theme-colored, twinkling only while the panel
  is open. Positions are reshuffled on every open and style change via
  rejection sampling: always inside an edge band, clear of the lunar disk,
  and spaced apart from each other.
- A hidden delight for curious clickers (undocumented on purpose — go click
  around the moon).
