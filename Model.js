// Pure astronomy + text-art helpers for salmun-nister.luna.
// No network: the phase is fully determined by the timestamp.
//
// Accuracy: mean-synodic method, drifts up to ~0.6 day from true phase —
// fine for display, not for ephemeris work.

// Mean synodic month in days and the reference new moon 2000-01-06 18:14 UTC.
var SYNODIC_DAYS = 29.530588853
var MS_PER_DAY = 86400000
var EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14)

// Half-width of the tolerance band (in cycle fraction) around the four
// canonical quarter/new/full moments; ~1/48 of a cycle ≈ 0.61 day.
var PHASE_EPS = 1 / 48

function wrap01(value) {
  var f = value % 1
  return f < 0 ? f + 1 : f
}

// Phase fraction of the synodic cycle at ms since epoch: 0 new,
// 0.25 first quarter, 0.5 full, 0.75 last quarter.
function phaseFraction(ms) {
  return wrap01((Number(ms) - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY))
}

function illumination(fraction) {
  return (1 - Math.cos(2 * Math.PI * fraction)) / 2
}

function moonAgeDays(fraction) {
  return fraction * SYNODIC_DAYS
}

function _near(fraction, target) {
  var d = Math.abs(fraction - target)
  return d <= PHASE_EPS || d >= 1 - PHASE_EPS
}

function phaseName(fraction) {
  var f = wrap01(fraction)
  if (_near(f, 0)) return "New Moon"
  if (_near(f, 0.25)) return "First Quarter"
  if (_near(f, 0.5)) return "Full Moon"
  if (_near(f, 0.75)) return "Last Quarter"
  if (f < 0.25) return "Waxing Crescent"
  if (f < 0.5) return "Waxing Gibbous"
  if (f < 0.75) return "Waning Gibbous"
  return "Waning Crescent"
}

// Index into the 8-glyph emoji cycle; southern hemisphere sees the mirrored
// orientation, so waxing/waning glyphs swap.
var GLYPHS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"]

function glyphFor(fraction, southernHemisphere) {
  var index = Math.round(wrap01(fraction) * 8) % 8
  return GLYPHS[southernHemisphere ? (8 - index) % 8 : index]
}

// Monochrome counterparts from the Nerd Font weather-moon_* set, rendered as
// plain text so they inherit the bar's theme color instead of the emoji
// font's fixed palette. JetBrainsMono Nerd Font (an omarchy package
// dependency) provides these codepoints. Same ordering and hemisphere mirror
// as the emoji cycle above.
var PLAIN_GLYPHS = [
  "\uE38D", "\uE390", "\uE394", "\uE397",
  "\uE39B", "\uE39E", "\uE3A2", "\uE3A5"
]

function plainGlyphFor(fraction, southernHemisphere) {
  var index = Math.round(wrap01(fraction) * 8) % 8
  return PLAIN_GLYPHS[southernHemisphere ? (8 - index) % 8 : index]
}

// ---- True lunation instants -------------------------------------------------
// Faithful port of Meeus, "Astronomical Algorithms" ch. 49 (following the
// astronomia library's transcription): periodic corrections that bring new-
// and full-moon instants to well under a minute of truth near J2000. A pure
// mean-synodic prediction drifts up to ~15 h and can shift the local date by
// a whole day; these corrections keep the "next event" readout honest.
var DEG2RAD = Math.PI / 180

// Correction-term arguments as [mp, m, f, eFactor]: the angle is mp*M' +
// m*M + f*F in radians, where M' = Moon's mean anomaly, M = Sun's mean
// anomaly, F = Moon's argument of latitude. eFactor 1 scales the term by
// the orbital-eccentricity factor E, 2 by E^2, 3 marks the node term
// sin(Omega). Aligned index-by-index with both coefficient lists below.
var LUNATION_TERMS = [
  [1, 0, 0, 0], [0, 1, 0, 1], [2, 0, 0, 0], [0, 0, 2, 0],
  [1, -1, 0, 1], [1, 1, 0, 1], [0, 2, 0, 2], [1, 0, -2, 0],
  [1, 0, 2, 0], [2, 1, 0, 1], [3, 0, 0, 0], [0, 1, 2, 1],
  [0, -1, 2, 1], [2, -1, 0, 1], [0, 0, 0, 3], [1, 2, 0, 0],
  [2, 0, -2, 0], [0, 3, 0, 0], [1, 1, -2, 0], [2, 0, 2, 0],
  [1, 1, 2, 0], [1, -1, 2, 0], [1, -1, -2, 0], [3, 1, 0, 0],
  [4, 0, 0, 0]
]

// Coefficients in days: new moons and full moons differ slightly.
var NEW_MOON_COEFFS = [
  -0.4072, 0.17241, 0.01608, 0.01039, 0.00739,
  -0.00514, 0.00208, -0.00111, -0.00057, 0.00056,
  -0.00042, 0.00042, 0.00038, -0.00024, -0.00017,
  -0.00007, 0.00004, 0.00004, 0.00003, 0.00003,
  -0.00003, 0.00003, -0.00002, -0.00002, 0.00002
]
var FULL_MOON_COEFFS = [
  -0.40614, 0.17302, 0.01614, 0.01043, 0.00734,
  -0.00515, 0.00209, -0.00111, -0.00057, 0.00056,
  -0.00042, 0.00042, 0.00038, -0.00024, -0.00017,
  -0.00007, 0.00004, 0.00004, 0.00003, 0.00003,
  -0.00003, 0.00003, -0.00002, -0.00002, 0.00002
]

// Additional planetary corrections (units of 1e-6 days): bases and rates
// for arguments A0..A13 driven by the mean longitudes of Mercury..Jupiter.
var PLANETARY_BASES = [
  299.77, 251.88, 251.83, 349.42, 84.66, 141.74, 207.17,
  154.84, 34.52, 207.19, 291.34, 161.72, 239.56, 331.55
]
var PLANETARY_RATES = [
  0.107408, 0.016321, 26.651886, 36.412478, 18.206239, 53.303771,
  2.453732, 7.30686, 27.261239, 0.121824, 1.844379, 24.198154,
  25.513099, 3.592518
]
var PLANETARY_COEFFS = [
  325, 165, 164, 126, 110, 62, 60, 56, 47, 42, 40, 37, 35, 23
]

function lunationMeanElements(kk) {
  var T = kk / 1236.85 // centuries past J2000
  return {
    T: T,
    E: 1 - 0.002516 * T - 0.0000074 * T * T,
    Mp: DEG2RAD * (2.5534 + 29.10535670 * kk
        - 0.0000014 * T * T - 0.00000011 * T * T * T),
    Mm: DEG2RAD * (201.5643 + 385.81693528 * kk
        + 0.0107582 * T * T + 0.00001238 * T * T * T
        - 0.000000058 * T * T * T * T),
    F: DEG2RAD * (160.7108 + 390.67050284 * kk
        - 0.0016118 * T * T - 0.00000227 * T * T * T
        + 0.000000011 * T * T * T * T),
    Om: DEG2RAD * (124.7746 - 1.56375588 * kk
        + 0.0020672 * T * T + 0.00000215 * T * T * T)
  }
}

// Unix ms of lunation number kk (integer = new moon, half-integer = full).
function trueLunationMs(kk, coeffs) {
  var el = lunationMeanElements(kk)

  // Mean time of the lunation (Meeus 49.1), Julian Day -> Unix ms.
  var T = el.T
  var jde = 2451550.09766 + 29.530588861 * kk
      + 0.00015437 * T * T
      - 0.000000150 * T * T * T
      + 0.00000000073 * T * T * T * T

  var corr = 0
  for (var i = 0; i < LUNATION_TERMS.length; i++) {
    var t = LUNATION_TERMS[i]
    var ang
    if (t[3] === 3) ang = el.Om
    else ang = t[0] * el.Mm + t[1] * el.Mp + t[2] * el.F
    var scale = t[3] === 1 ? el.E : t[3] === 2 ? el.E * el.E : 1
    corr += coeffs[i] * scale * Math.sin(ang)
  }
  for (var j = 0; j < PLANETARY_COEFFS.length; j++) {
    corr += PLANETARY_COEFFS[j] / 1e6 * Math.sin(DEG2RAD *
        (PLANETARY_BASES[j] + PLANETARY_RATES[j] * kk))
  }

  return Math.round((jde + corr - 2440587.5) * MS_PER_DAY)
}

// Next new/full moon strictly after nowMs. The mean month gives a close
// first guess for the lunation index; step forward until the corrected
// instant passes the query time.
function nextLunationMs(nowMs, offsetFraction, coeffs) {
  var target = Number(nowMs)
  var k = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY))
  while (trueLunationMs(k + offsetFraction, coeffs) <= target) k++
  return trueLunationMs(k + offsetFraction, coeffs)
}

function nextNewMoonMs(nowMs) {
  return nextLunationMs(nowMs, 0, NEW_MOON_COEFFS)
}

function nextFullMoonMs(nowMs) {
  return nextLunationMs(nowMs, 0.5, FULL_MOON_COEFFS)
}

var PALETTES = {
  blocks: { lit: "\u2588", term: "\u2593", dark: "\u00B7", void: " ", crater: "\u25CB", sea: "\u2592" }, // █ ▓ · ○ ▒
  ascii: { lit: "@", term: "#", dark: ".", void: " ", crater: "O", sea: "~" },
  // Cartoon: soft-shaded body, bold rim ring, face stamped when mostly lit.
}

// A few near-side features, loosely placed (northern-hemisphere naked-eye
// view; x right, y down, normalized to the unit disk). Stylized, not
// selenographic. Craters are stamped only where the surface is lit, so the
// terminator reveals them naturally.
var CRATERS = [
  { name: "Tycho", x: 0.05, y: 0.62, r: 0.09 },
  { name: "Copernicus", x: 0.42, y: 0.02, r: 0.06 },
  { name: "Kepler", x: 0.62, y: 0.10, r: 0.035 },
  { name: "Aristarchus", x: 0.45, y: -0.35, r: 0.035 },
  { name: "Plato", x: -0.15, y: -0.55, r: 0.05 },
  { name: "Gassendi", x: 0.47, y: 0.28, r: 0.05 },
  { name: "Langrenus", x: -0.38, y: -0.02, r: 0.045 },
  { name: "Grimaldi", x: -0.62, y: -0.18, r: 0.04 }
]

// Dark lunar maria (seas) as ellipses in the same normalized space and the
// same stylized orientation as CRATERS (west-side features sit right of
// center). Stamped on lit cells before craters; craters may overwrite them,
// which is why Copernicus/Aristarchus stay visible inside Procellarum.
var SEAS = [
  { name: "Mare Imbrium", x: 0.10, y: -0.48, rx: 0.24, ry: 0.16 },
  { name: "Mare Serenitatis", x: -0.25, y: -0.38, rx: 0.16, ry: 0.17 },
  { name: "Mare Tranquillitatis", x: -0.30, y: -0.08, rx: 0.18, ry: 0.15 },
  { name: "Mare Fecunditatis", x: -0.42, y: 0.18, rx: 0.13, ry: 0.15 },
  { name: "Mare Crisium", x: -0.60, y: -0.28, rx: 0.10, ry: 0.12 },
  { name: "Oceanus Procellarum", x: 0.52, y: -0.12, rx: 0.26, ry: 0.34 },
  { name: "Mare Nubium", x: -0.10, y: 0.33, rx: 0.15, ry: 0.13 },
  { name: "Mare Humorum", x: -0.35, y: 0.38, rx: 0.10, ry: 0.10 }
]

// Stamp the dark maria on lit cells so the terminator reveals them.
function _stampSeas(grid, rowCount, colCount, palette) {
  for (var s = 0; s < SEAS.length; s++) {
    var sea = SEAS[s]
    for (var rj = 0; rj < rowCount; rj++) {
      var cy = ((rj + 0.5) / rowCount) * 2 - 1
      for (var ci = 0; ci < colCount; ci++) {
        var cx = ((ci + 0.5) / colCount) * 2 - 1
        var dx = (cx - sea.x) / sea.rx
        var dy = (cy - sea.y) / sea.ry
        if (dx * dx + dy * dy <= 1 && grid[rj][ci] === palette.lit)
          grid[rj][ci] = palette.sea
      }
    }
  }
}

// Stamp craters on top of lit surface or seas — features inside maria
// (Aristarchus, Copernicus) must stay visible.
function _stampCraters(grid, rowCount, colCount, palette) {
  for (var c = 0; c < CRATERS.length; c++) {
    var crater = CRATERS[c]
    for (var rj = 0; rj < rowCount; rj++) {
      var cy = ((rj + 0.5) / rowCount) * 2 - 1
      for (var ci = 0; ci < colCount; ci++) {
        var cx = ((ci + 0.5) / colCount) * 2 - 1
        var dx = (cx - crater.x) / crater.r
        var dy = (cy - crater.y) / crater.r
        if (dx * dx + dy * dy <= 1 && (grid[rj][ci] === palette.lit || grid[rj][ci] === palette.sea))
          grid[rj][ci] = palette.crater
      }
    }
  }
}

// Cartoon "moon man": bold rim ring around the phase-shaded body plus a
// big happy face stamped over the lit area once it is large enough to hold
// it (illumination >= 60%, i.e. gibbous or full). `wink` closes the right
// eye — Panel drives it on a random timer for a bit of life.
function _stampFace(grid, rowCount, colCount, palette, wink) {
  function put(nx, ny, ch) {
    if (ny < 0 || ny >= rowCount || nx < 0 || nx >= colCount) return
    var cur = grid[ny][nx]
    if (cur === palette.void || cur === palette.rim) return
    grid[ny][nx] = ch
  }
  function cellOf(nx, ny) {
    return [Math.round(((nx + 1) / 2) * colCount - 0.5), Math.round(((ny + 1) / 2) * rowCount - 0.5)]
  }

  // Wide-set eyes; the right one shuts when winking.
  var eL = cellOf(-0.27, -0.24); put(eL[0], eL[1], "^")
  var eR = cellOf(0.27, -0.24); put(eR[0], eR[1], wink ? "-" : "^")

  // Big two-row grin: upturned corners over a long "\_____/" base.
  var yTop = 0.10
  var yBot = 0.26
  var rT = Math.round(((yTop + 1) / 2) * rowCount - 0.5)
  var rB = Math.round(((yBot + 1) / 2) * rowCount - 0.5)
  if (rT === rB) return
  var cTl = cellOf(-0.16, yTop)[0]
  var cTr = cellOf(0.16, yTop)[0]
  var cBl = cellOf(-0.32, yBot)[0]
  var cBr = cellOf(0.32, yBot)[0]
  put(cTl, rT, "\\")
  put(cTr, rT, "/")
  for (var i = cBl; i <= cBr; i++)
    put(i, rB, i === cBl ? "\\" : i === cBr ? "/" : "_")
}

// Render the lunar disk at the exact phase fraction as multi-line text art.
// `aspect` is the physical height:width ratio of one character cell (measure
// it from the rendering font); columns are derived from it so the disk stays
// circular instead of assuming square cells. style: "blocks" | "ascii".
// ("vector" and "cartoon" are canvas-drawn and get blank placeholder grids.)
function renderMoonArt(fraction, style, rows, mirror, aspect, wink) {
  var palette = PALETTES[style] === undefined ? PALETTES.blocks : PALETTES[style]

  var rowCount = parseInt(rows, 10)
  if (isNaN(rowCount)) rowCount = 13
  rowCount = Math.max(7, Math.min(41, rowCount))
  if (rowCount % 2 === 0) rowCount += 1

  var cellAspect = parseFloat(aspect)
  if (isNaN(cellAspect) || cellAspect < 1 || cellAspect > 4) cellAspect = 2
  var colCount = Math.max(rowCount, Math.round(rowCount * cellAspect))

  // Canvas-drawn styles (vector, cartoon): the text layer just holds
  // the layout, so return an all-spaces grid with identical dimensions.
  // Everything downstream (card width, tap mapping, star clearance) keeps
  // working.
  if (style === "vector" || style === "cartoon") {
    var spaces = new Array(colCount + 1).join(" ")
    var blank = []
    for (var bi = 0; bi < rowCount; bi++) blank.push(spaces)
    return blank.join("\n")
  }

  var band = 2 / colCount // one cell width in normalized units
  var f = wrap01(fraction)
  var t = Math.cos(2 * Math.PI * f)
  var waxing = f < 0.5

  // Cell grid as rows of characters so features can be stamped after shading.
  var grid = []
  for (var j = 0; j < rowCount; j++) {
    var y = ((j + 0.5) / rowCount) * 2 - 1
    var chord = Math.sqrt(Math.max(0, 1 - y * y))
    // Terminator x-position for this row; lit side is right when waxing.
    var boundary = waxing ? t * chord : -(t * chord)

    var row = new Array(colCount)
    for (var i = 0; i < colCount; i++) {
      var x = ((i + 0.5) / colCount) * 2 - 1
      var rad = Math.sqrt(x * x + y * y)
      if (rad > 1) {
        row[i] = palette.void
      } else {
        var depth = waxing ? x - boundary : boundary - x
        if (depth >= 0) row[i] = palette.lit
        else if (depth >= -band) row[i] = palette.term
        else row[i] = palette.dark
      }
    }
    grid.push(row)
  }

  _stampSeas(grid, rowCount, colCount, palette)
  _stampCraters(grid, rowCount, colCount, palette)

  var lines = []
  for (var k = 0; k < grid.length; k++) {
    var line = grid[k].join("")
    lines.push(mirror ? line.split("").reverse().join("") : line)
  }
  return lines.join("\n")
}

// Lookup by sea name; null when unknown.
function seaByName(name) {
  for (var i = 0; i < SEAS.length; i++)
    if (SEAS[i].name === name) return SEAS[i]
  return null
}

// Easter-egg hit test: is the tap (fractional position within the rendered
// art, 0..1 on both axes) inside Mare Tranquillitatis? The art is mirrored
// for southern-hemisphere users, so flip x before comparing.
var EGG_SEA = "Mare Tranquillitatis"

function seaHit(fx, fy, mirror) {
  var sea = seaByName(EGG_SEA)
  if (!sea) return false
  var nx = fx * 2 - 1
  var ny = fy * 2 - 1
  if (mirror) nx = -nx
  var dx = (nx - sea.x) / sea.rx
  var dy = (ny - sea.y) / sea.ry
  return dx * dx + dy * dy <= 1
}

// Normalized center of a sea, for anchoring overlays to it in QML.
function seaCenter(name) {
  var sea = seaByName(name)
  return sea ? { x: sea.x, y: sea.y } : null
}

// Everything the UI needs in one object. nowMs: ms since Unix epoch;
// southernHemisphere mirrors glyph selection.
function moonState(nowMs, southernHemisphere, fractionOverride) {
  var f = fractionOverride === undefined
      ? phaseFraction(nowMs)
      : wrap01(Number(fractionOverride))
  return {
    fraction: f,
    ageDays: Math.round(f * SYNODIC_DAYS * 10) / 10,
    illuminationPct: Math.round(illumination(f) * 100),
    phaseName: phaseName(f),
    glyph: glyphFor(f, southernHemisphere),
    nextNewMs: nextNewMoonMs(nowMs),
    nextFullMs: nextFullMoonMs(nowMs)
  }
}

// Hit-test the vector smile: true when (px,py) sits on the drawn mouth
// arc. Geometry mirrors paintVector(): mouth is an arc centered slightly
// above the disc center, radius 0.40*R, sweeping the lower half.
function vecMouthHit(px, py, w, h) {
  if (w < 10 || h < 10) return false
  var R = Math.min(w, h) / 2 * 0.97
  var cx = w / 2
  var cy = h / 2 - R * 0.02
  var dx = px - cx, dy = py - cy
  var d = Math.sqrt(dx * dx + dy * dy)
  var ang = Math.atan2(dy, dx)
  return dy > R * 0.02 && d > R * 0.30 && d < R * 0.50 &&
      ang > Math.PI * 0.13 && ang < Math.PI * 0.87
}

if (typeof module !== "undefined") {
module.exports = {
    SYNODIC_DAYS: SYNODIC_DAYS,
    EPOCH_MS: EPOCH_MS,
    phaseFraction: phaseFraction,
    illumination: illumination,
    moonAgeDays: moonAgeDays,
    phaseName: phaseName,
    glyphFor: glyphFor,
    plainGlyphFor: plainGlyphFor,
    nextNewMoonMs: nextNewMoonMs,
    nextFullMoonMs: nextFullMoonMs,
    renderMoonArt: renderMoonArt,
    moonState: moonState,
    CRATERS: CRATERS,
    SEAS: SEAS,
    EGG_SEA: EGG_SEA,
    seaHit: seaHit,
    vecMouthHit: vecMouthHit,
    seaCenter: seaCenter
  }
}
