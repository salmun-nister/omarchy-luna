// Pure astronomy + text-art helpers for salmun-nister.luna.
// No network: the phase, syzygies, eclipses, and full-moon metadata are
// derived offline from the timestamp using Meeus "Astronomical Algorithms".

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

// ---- True lunation instants (Meeus ch. 49) ----------------------------------
// Faithful port of Meeus, "Astronomical Algorithms" ch. 49 (following the
// astronomia library's transcription): periodic corrections that bring new,
// first-quarter, full, and last-quarter instants to ~a minute of truth near
// J2000. Both event timestamps and phaseFraction/ageDays are anchored to these
// true syzygies so phase labels, dates, and eclipses stay mutually consistent.
var DEG2RAD = Math.PI / 180

// Correction-term arguments as [mp, m, f, eFactor]: the angle is mp*M' +
// m*M + f*F in radians, where M' = Moon's mean anomaly (el.Mm), M = Sun's
// mean anomaly (el.Mp), F = Moon's argument of latitude. eFactor 1 scales
// by E, 2 by E^2, 3 marks the node term sin(Omega).
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

// Meeus ch. 49 p. 352 terms for First Quarter (k + 0.25) and Last Quarter (k + 0.75).
var QUARTER_TERMS = [
  [1, 0, 0, 0], [0, 1, 0, 1], [1, 1, 0, 1], [2, 0, 0, 0],
  [0, 0, 2, 0], [1, -1, 0, 1], [0, 2, 0, 2], [1, 0, -2, 0],
  [1, 0, 2, 0], [3, 0, 0, 0], [2, -1, 0, 1], [0, 1, 2, 1],
  [0, 1, -2, 1], [1, 2, 0, 2], [2, 1, 0, 1], [0, 0, 0, 3],
  [1, -1, -2, 0], [2, 0, 2, 0], [1, 1, 2, 0], [1, -2, 0, 0],
  [1, 1, -2, 0], [0, 3, 0, 0], [2, 0, -2, 0], [1, -1, 2, 0],
  [3, 1, 0, 0]
]
var QUARTER_COEFFS = [
  -0.62801, 0.17172, -0.01183, 0.00862, 0.00804,
  0.00454, 0.00204, -0.00180, -0.00070, -0.00040,
  -0.00034, 0.00032, 0.00032, -0.00028, 0.00027,
  -0.00017, -0.00005, 0.00004, -0.00004, 0.00004,
  0.00003, 0.00003, 0.00002, 0.00002, -0.00002
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

// Unix ms of lunation number kk:
//   quarter = 0 (new), 1 (first quarter), 2 (full), 3 (last quarter).
function truePhaseMs(kk, quarter) {
  var el = lunationMeanElements(kk)

  // Mean time of the phase (Meeus 49.1), Julian Day -> Unix ms.
  var T = el.T
  var jde = 2451550.09766 + 29.530588861 * kk
      + 0.00015437 * T * T
      - 0.000000150 * T * T * T
      + 0.00000000073 * T * T * T * T

  var terms = (quarter === 1 || quarter === 3) ? QUARTER_TERMS : LUNATION_TERMS
  var coeffs = quarter === 0 ? NEW_MOON_COEFFS
      : quarter === 2 ? FULL_MOON_COEFFS
      : QUARTER_COEFFS

  var corr = 0
  for (var i = 0; i < terms.length; i++) {
    var t = terms[i]
    var ang = t[3] === 3 ? el.Om : (t[0] * el.Mm + t[1] * el.Mp + t[2] * el.F)
    var scale = t[3] === 1 ? el.E : t[3] === 2 ? el.E * el.E : 1
    corr += coeffs[i] * scale * Math.sin(ang)
  }
  if (quarter === 1 || quarter === 3) {
    var W = 0.00306 - 0.00038 * el.E * Math.cos(el.Mp)
        + 0.00026 * Math.cos(el.Mm)
        - 0.00002 * Math.cos(el.Mm - el.Mp)
        + 0.00002 * Math.cos(el.Mm + el.Mp)
        + 0.00002 * Math.cos(2 * el.F)
    corr += quarter === 1 ? W : -W
  }
  for (var j = 0; j < PLANETARY_COEFFS.length; j++) {
    corr += PLANETARY_COEFFS[j] / 1e6 * Math.sin(DEG2RAD *
        (PLANETARY_BASES[j] + PLANETARY_RATES[j] * kk))
  }

  return Math.round((jde + corr - 2440587.5) * MS_PER_DAY)
}

function nextPhaseEventMs(nowMs, quarter) {
  var target = Number(nowMs)
  var offset = quarter * 0.25
  var k = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY)) - 1
  var t = truePhaseMs(k + offset, quarter)
  while (t <= target) {
    k++
    t = truePhaseMs(k + offset, quarter)
  }
  return t
}

function nextNewMoonMs(nowMs) { return nextPhaseEventMs(nowMs, 0) }
function nextFirstQuarterMs(nowMs) { return nextPhaseEventMs(nowMs, 1) }
function nextFullMoonMs(nowMs) { return nextPhaseEventMs(nowMs, 2) }
function nextLastQuarterMs(nowMs) { return nextPhaseEventMs(nowMs, 3) }

function nextQuarter(nowMs) {
  var fq = nextFirstQuarterMs(nowMs)
  var lq = nextLastQuarterMs(nowMs)
  return fq <= lq
      ? { name: "First Quarter", label: "FIRST QUARTER", ms: fq }
      : { name: "Last Quarter", label: "LAST QUARTER", ms: lq }
}

// Quarter index q: 4*k + quarter (q=0 -> 2000-01-06 new moon).
function _quarterTimeMs(q) {
  var quarter = ((q % 4) + 4) % 4
  var k = (q - quarter) / 4
  return truePhaseMs(k + quarter * 0.25, quarter)
}

// True phase fraction of the synodic cycle at ms since epoch: 0 new,
// 0.25 first quarter, 0.5 full, 0.75 last quarter. Interpolates between
// the bracketing Meeus ch. 49 quarter instants so phase names, illumination,
// syzygy dates, and eclipses stay mutually consistent.
function phaseFraction(ms) {
  var target = Number(ms)
  var approxQ = Math.floor(((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY)) * 4)
  var q = approxQ
  var t0 = _quarterTimeMs(q)
  while (t0 > target) {
    q--
    t0 = _quarterTimeMs(q)
  }
  var t1 = _quarterTimeMs(q + 1)
  while (t1 <= target) {
    q++
    t0 = t1
    t1 = _quarterTimeMs(q + 1)
  }
  var span = Math.max(1, t1 - t0)
  var baseQ = ((q % 4) + 4) % 4
  return wrap01((baseQ + (target - t0) / span) * 0.25)
}

// Previous true new moon at or before nowMs (for exact moon age in days).
function prevNewMoonMs(nowMs) {
  var target = Number(nowMs)
  var k = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY)) + 1
  var t = truePhaseMs(k, 0)
  while (t > target) {
    k--
    t = truePhaseMs(k, 0)
  }
  return t
}

// Canonical phase names aligned with the 8-slot lunation strip (0 = New .. 7 = Waning Crescent).
var PHASE_SLOT_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
]

// Return the 8 chronological phase instants { index, name, ms } for the
// lunation surrounding nowMs (starting at its New Moon). When nowMs is in
// the final 1/16 of a cycle (so plateIndex has already wrapped to slot 0
// for the upcoming New Moon), anchor to that upcoming lunation so slot 0
// matches the active dot rather than a month earlier.
function lunationSlots(nowMs) {
  var target = Number(nowMs)
  var k = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY)) + 1
  var tNew = truePhaseMs(k, 0)
  while (tNew > target) {
    k--
    tNew = truePhaseMs(k, 0)
  }
  var tNextNew = truePhaseMs(k + 1, 0)
  if (plateIndex(phaseFraction(target)) === 0 && (tNextNew - target) < (target - tNew)) {
    k++
    tNew = tNextNew
    tNextNew = truePhaseMs(k + 1, 0)
  }
  var tFQ = truePhaseMs(k + 0.25, 1)
  var tFull = truePhaseMs(k + 0.50, 2)
  var tLQ = truePhaseMs(k + 0.75, 3)
  var times = [
    tNew,
    Math.round((tNew + tFQ) / 2),
    tFQ,
    Math.round((tFQ + tFull) / 2),
    tFull,
    Math.round((tFull + tLQ) / 2),
    tLQ,
    Math.round((tLQ + tNextNew) / 2)
  ]
  var out = []
  for (var i = 0; i < 8; i++) {
    out.push({ index: i, name: PHASE_SLOT_NAMES[i], ms: times[i] })
  }
  return out
}

function illumination(fraction) {
  return (1 - Math.cos(2 * Math.PI * fraction)) / 2
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

// ---- Full moon names, Supermoon / Micromoon, Blue Moon ----------------------
var FULL_MOON_NAMES = [
  "Wolf Moon", "Snow Moon", "Worm Moon", "Pink Moon",
  "Flower Moon", "Strawberry Moon", "Buck Moon", "Sturgeon Moon",
  "Corn Moon", "Hunter's Moon", "Beaver Moon", "Cold Moon"
]

// Approximate Earth-Moon distance in km at full moon kf (Meeus ch. 47
// leading radial terms evaluated at elongation D = 180 deg).
function fullMoonDistanceKm(kf) {
  var el = lunationMeanElements(kf)
  return Math.round(385001 - 24604 * Math.cos(el.Mm) - 2956 - 570 * Math.cos(2 * el.Mm))
}

function nearestFullLunation(ms) {
  var target = Number(ms)
  var k = Math.round((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY) - 0.5)
  var bestK = k
  var bestD = Math.abs(truePhaseMs(k + 0.5, 2) - target)
  for (var dk = -1; dk <= 1; dk += 2) {
    var d = Math.abs(truePhaseMs(k + dk + 0.5, 2) - target)
    if (d < bestD) { bestD = d; bestK = k + dk }
  }
  return bestK + 0.5
}

// Traditional full-moon name + Supermoon / Micromoon / Blue Moon flags for
// the full moon nearest to fullMs. Harvest Moon goes to the full moon
// closest to the September equinox (~Sep 22).
function fullMoonInfo(fullMs) {
  var kf = nearestFullLunation(fullMs)
  var t = truePhaseMs(kf, 2)
  var d = new Date(t)
  var month = d.getMonth()
  var name = FULL_MOON_NAMES[month]

  // Harvest Moon: full moon closest to the September equinox (Sep 22 UTC).
  var eqMs = Date.UTC(d.getUTCFullYear(), 8, 22, 12, 0)
  var distToEq = Math.abs(t - eqMs)
  var prevT = truePhaseMs(kf - 1, 2)
  var nextT = truePhaseMs(kf + 1, 2)
  if (distToEq < Math.abs(prevT - eqMs) && distToEq <= Math.abs(nextT - eqMs)) {
    name = "Harvest Moon"
  }

  var prevDate = new Date(prevT)
  var isBlue = prevDate.getFullYear() === d.getFullYear() && prevDate.getMonth() === month
  var distKm = fullMoonDistanceKm(kf)
  var isSuper = distKm <= 361800
  var isMicro = distKm >= 405000

  var badges = []
  if (isBlue) badges.push("Blue Moon")
  if (isSuper) badges.push("Supermoon")
  else if (isMicro) badges.push("Micromoon")

  var label = badges.length > 0 ? name + " · " + badges.join(" · ") : name
  return {
    name: name,
    label: label,
    distanceKm: distKm,
    isBlue: isBlue,
    isSuper: isSuper,
    isMicro: isMicro,
    ms: t
  }
}

// ---- Lunar eclipses (Meeus ch. 54) ------------------------------------------
// Port of Meeus, "Astronomical Algorithms" ch. 54 (lunar section), following
// the astronomia library's transcription (MIT). Reuses the ch. 49 mean
// elements; predicts greatest-eclipse instants and umbral magnitudes to
// ~a minute near J2000. Penumbral-only events are treated as no eclipse.

// Circumstances of the umbral eclipse at fractional lunation kf (full moon
// when the fraction is 0.5). Returns null when that lunation carries no
// umbral eclipse (no event at all, or penumbral only).
function lunarEclipseAt(kf) {
  var T = kf / 1236.85
  var F = DEG2RAD * (160.7108 + 390.67050284 * kf
      - 0.0016118 * T * T - 0.00000227 * T * T * T
      + 0.000000011 * T * T * T * T)
  // |sin F| > 0.36: no lunar eclipse at this lunation (Meeus 54.2).
  if (Math.abs(Math.sin(F)) > 0.36) return null

  var el = lunationMeanElements(kf)
  // Naming hazard: el.Mp is the SUN's anomaly, el.Mm the MOON's.
  var Msun = el.Mp
  var Mmoon = el.Mm
  var E = el.E
  var sOm = Math.sin(el.Om)

  var F1 = F - DEG2RAD * 0.02665 * sOm
  var A1 = DEG2RAD * (299.77 + 0.107408 * kf - 0.009173 * T)

  // Greatest eclipse time (Meeus 54.1 with the full-moon coefficients).
  var jdeMax = 2451550.09766 + 29.530588861 * kf
      + 0.00015437 * T * T
      - 0.000000150 * T * T * T
      + 0.00000000073 * T * T * T * T
      - 0.4065 * Math.sin(Mmoon)
      + 0.1727 * Math.sin(Msun) * E
      + 0.0161 * Math.sin(2 * Mmoon)
      - 0.0097 * Math.sin(2 * F1)
      + 0.0073 * Math.sin(Mmoon - Msun) * E
      - 0.005 * Math.sin(Mmoon + Msun) * E
      - 0.0023 * Math.sin(Mmoon - 2 * F1)
      + 0.0021 * Math.sin(2 * Msun) * E
      + 0.0012 * Math.sin(Mmoon + 2 * F1)
      + 0.0006 * Math.sin(2 * Mmoon + Msun) * E
      - 0.0004 * Math.sin(3 * Mmoon)
      - 0.0003 * Math.sin(Msun + 2 * F1) * E
      + 0.0003 * Math.sin(A1)
      - 0.0002 * Math.sin(Msun - 2 * F1) * E
      - 0.0002 * Math.sin(2 * Mmoon - Msun) * E
      - 0.0002 * sOm

  // Shadow geometry: gamma = shadow-axis distance from Moon center, u =
  // umbra-size correction; both in Earth equatorial radii (Meeus p. 380).
  var P = 0.207 * Math.sin(Msun) * E
      + 0.0024 * Math.sin(2 * Msun) * E
      - 0.0392 * Math.sin(Mmoon)
      + 0.0116 * Math.sin(2 * Mmoon)
      - 0.0073 * Math.sin(Mmoon + Msun) * E
      + 0.0067 * Math.sin(Mmoon - Msun) * E
      + 0.0118 * Math.sin(2 * F1)
  var Q = 5.2207
      - 0.0048 * Math.cos(Msun) * E
      + 0.002 * Math.cos(2 * Msun) * E
      - 0.3299 * Math.cos(Mmoon)
      - 0.006 * Math.cos(Mmoon + Msun) * E
      + 0.0041 * Math.cos(Mmoon - Msun) * E
  var W = Math.abs(Math.cos(F1))
  var gamma = (P * Math.cos(F1) + Q * Math.sin(F1)) * (1 - 0.0048 * W)
  var u = 0.0059
      + 0.0046 * Math.cos(Msun) * E
      - 0.0182 * Math.cos(Mmoon)
      + 0.0004 * Math.cos(2 * Mmoon)
      - 0.0005 * Math.cos(Msun + Mmoon)

  // Umbral magnitude (Meeus 54.3); <= 0 means penumbral-only here.
  var mag = (1.0128 - u - Math.abs(gamma)) / 0.545
  if (mag <= 0) return null

  // Semi-durations of the full umbral phase (U1..greatest = pR) and the
  // nested total phase (U2..greatest = tR), in days (Meeus p. 382).
  var pR = 1.0128 - u
  var tR = 0.4678 - u
  var n = 0.5458 + 0.04 * Math.cos(Mmoon)
  var g2 = gamma * gamma
  var sdPartial = Math.sqrt(Math.max(0, pR * pR - g2)) / n / 24
  var sdTotal = mag > 1 ? Math.sqrt(Math.max(0, tR * tR - g2)) / n / 24 : 0
  var maxMs = Math.round((jdeMax - 2440587.5) * MS_PER_DAY)
  var semiPartialMs = Math.round(sdPartial * MS_PER_DAY)
  var semiTotalMs = Math.round(sdTotal * MS_PER_DAY)

  return {
    greatestMs: maxMs,
    kind: mag > 1 ? "total" : "partial",
    magnitude: mag,
    gamma: gamma,
    umbraRadius: (0.7403 - u) / 0.2725,
    semiPartialMs: semiPartialMs,
    semiTotalMs: semiTotalMs,
    u1Ms: maxMs - semiPartialMs,
    u2Ms: mag > 1 ? maxMs - semiTotalMs : maxMs,
    u3Ms: mag > 1 ? maxMs + semiTotalMs : maxMs,
    u4Ms: maxMs + semiPartialMs
  }
}

// Active umbral eclipse at nowMs, or null. The two nearest full moons
// bracket any instant, so scanning the current and next lunation suffices.
// depth: 0..1 visual intensity — ramps across the partial phases, plateaus
// through totality; peak = min(magnitude, 1) keeps grazing partials light.
function eclipseState(nowMs) {
  var target = Number(nowMs)
  var kk = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY))
  for (var i = 0; i <= 1; i++) {
    var e = lunarEclipseAt(kk + i + 0.5)
    if (!e) continue
    // Meeus semiPartialMs is already the full umbral semi-duration (U1..max,
    // max..U4); semiTotalMs is nested inside it (U2..U3).
    var maxMs = e.greatestMs
    var half = e.semiPartialMs
    if (half <= 0) continue
    var u1 = e.u1Ms
    var u4 = e.u4Ms
    if (target < u1 || target > u4) continue

    var peak = Math.min(e.magnitude, 1)
    var depth
    if (e.kind === "total" && e.semiTotalMs > 0) {
      var u2 = e.u2Ms
      var u3 = e.u3Ms
      if (target < u2) depth = peak * (target - u1) / Math.max(1, u2 - u1)
      else if (target <= u3) depth = peak
      else depth = peak * (u4 - target) / Math.max(1, u4 - u3)
    } else {
      if (target < maxMs) depth = peak * (target - u1) / Math.max(1, maxMs - u1)
      else depth = peak * (u4 - target) / Math.max(1, u4 - maxMs)
    }
    return {
      kind: e.kind,
      label: e.kind === "total" ? "Total Lunar Eclipse" : "Partial Lunar Eclipse",
      depth: Math.max(0, Math.min(1, depth)),
      peak: peak,
      magnitude: e.magnitude,
      gamma: e.gamma,
      umbraRadius: e.umbraRadius,
      greatestMs: maxMs,
      u1Ms: u1,
      u2Ms: e.u2Ms,
      u3Ms: e.u3Ms,
      u4Ms: u4,
      // 0..1 through the umbral window — drives shadow position so it
      // transits monotonically across the disk instead of ebbing in place.
      progress: Math.max(0, Math.min(1, (target - u1) / Math.max(1, u4 - u1))),
      endsMs: u4
    }
  }
  return null
}

// Next upcoming (or currently active) umbral lunar eclipse after nowMs.
function nextEclipse(nowMs) {
  var target = Number(nowMs)
  var kk = Math.floor((target - EPOCH_MS) / (SYNODIC_DAYS * MS_PER_DAY))
  for (var i = 0; i < 60; i++) {
    var e = lunarEclipseAt(kk + i + 0.5)
    if (!e) continue
    if (e.u4Ms > target) {
      return {
        kind: e.kind,
        label: e.kind === "total" ? "Total" : "Partial",
        fullLabel: e.kind === "total" ? "Total Lunar Eclipse" : "Partial Lunar Eclipse",
        magnitude: e.magnitude,
        greatestMs: e.greatestMs,
        u1Ms: e.u1Ms,
        u2Ms: e.u2Ms,
        u3Ms: e.u3Ms,
        u4Ms: e.u4Ms
      }
    }
  }
  return null
}

// ---- Lunar art & selenography -----------------------------------------------
var PALETTES = {
  blocks: { lit: "\u2588", term: "\u2593", dark: "\u00B7", void: " ", crater: "\u25CB", sea: "\u2592" }, // █ ▓ · ○ ▒
  ascii: { lit: "@", term: "#", dark: ".", void: " ", crater: "O", sea: "~" },
}

// Near-side features in northern-hemisphere naked-eye orientation (x right =
// lunar East / waxing limb, y down = South, normalized to the unit disk).
// Craters are stamped only where the surface is lit, so the terminator reveals
// them naturally as the phase advances.
var CRATERS = [
  { name: "Tycho", x: -0.05, y: 0.62, r: 0.09 },
  { name: "Copernicus", x: -0.42, y: 0.02, r: 0.06 },
  { name: "Kepler", x: -0.62, y: 0.10, r: 0.035 },
  { name: "Aristarchus", x: -0.45, y: -0.35, r: 0.035 },
  { name: "Plato", x: 0.15, y: -0.55, r: 0.05 },
  { name: "Gassendi", x: -0.47, y: 0.28, r: 0.05 },
  { name: "Langrenus", x: 0.58, y: 0.12, r: 0.045 },
  { name: "Grimaldi", x: -0.72, y: 0.08, r: 0.04 }
]

// Dark lunar maria (seas) as ellipses in the same northern-hemisphere naked-eye
// orientation (Crisium/Tranquillitatis/Serenitatis on the right/waxing side,
// Oceanus Procellarum on the left/waning side). Stamped before craters so
// Copernicus/Aristarchus remain visible inside Procellarum.
var SEAS = [
  { name: "Mare Imbrium", x: -0.10, y: -0.48, rx: 0.24, ry: 0.16 },
  { name: "Mare Serenitatis", x: 0.25, y: -0.38, rx: 0.16, ry: 0.17 },
  { name: "Mare Tranquillitatis", x: 0.30, y: -0.08, rx: 0.18, ry: 0.15 },
  { name: "Mare Fecunditatis", x: 0.42, y: 0.18, rx: 0.13, ry: 0.15 },
  { name: "Mare Crisium", x: 0.60, y: -0.28, rx: 0.10, ry: 0.12 },
  { name: "Oceanus Procellarum", x: -0.52, y: -0.12, rx: 0.26, ry: 0.34 },
  { name: "Mare Nubium", x: 0.10, y: 0.33, rx: 0.15, ry: 0.13 },
  { name: "Mare Humorum", x: 0.35, y: 0.38, rx: 0.10, ry: 0.10 }
]

function _inSea(nx, ny) {
  for (var s = 0; s < SEAS.length; s++) {
    var sea = SEAS[s]
    var dx = (nx - sea.x) / sea.rx
    var dy = (ny - sea.y) / sea.ry
    if (dx * dx + dy * dy <= 1) return sea
  }
  return null
}

function _inCrater(nx, ny) {
  for (var c = 0; c < CRATERS.length; c++) {
    var crater = CRATERS[c]
    var dx = (nx - crater.x) / crater.r
    var dy = (ny - crater.y) / crater.r
    if (dx * dx + dy * dy <= 1) return crater
  }
  return null
}

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

// Earth's umbral shadow as a circle, in lunar radii, for every renderer
// (text art, braille, both canvases, clay). Uses each event's true umbra
// radius when available (falling back to 2.7 for synthetic dev previews)
// and computes the horizontal sweep chord at the event's vertical offset oy
// so first/last contact matches U1/U4 for both central totals and grazing
// partials.
//   ox: umbra centre to the right of the disc centre (negative = left)
//   oy: umbra centre below the disc centre (negative = above)
//   r:  umbra radius
// Renderers flip ox on screen for the southern view.
function umbraFrame(eclipse) {
  var RU = (eclipse && eclipse.umbraRadius > 0) ? eclipse.umbraRadius : 2.7
  var oy0 = -eclipse.gamma / 0.2725
  // Contact half-chord at height oy0: for gamma = 0 & RU = 2.7, this equals
  // (2.7 + 1) + 0.15 = 3.85; for grazing partials it shrinks cleanly so the
  // umbra contacts the limb at progress ~0 and exits at progress ~1.
  var contactSpan = Math.sqrt(Math.max(0.25, (RU + 1) * (RU + 1) - oy0 * oy0))
  var XE = contactSpan + 0.15
  return {
    ox: -XE + 2 * XE * eclipse.progress,
    oy: oy0 - 0.6 * (0.5 - eclipse.progress),
    r: RU
  }
}

// Stamp the umbra across the text-art disk. Coordinates are normalized to
// the disc radius, so umbraFrame's moon-radii values apply directly.
function _stampUmbra(grid, rows, cols, palette, eclipse) {
  var frame = umbraFrame(eclipse)
  var band = 0.35
  for (var j = 0; j < rows; j++) {
    var y = ((j + 0.5) / rows) * 2 - 1
    for (var i = 0; i < cols; i++) {
      if (grid[j][i] === palette.void) continue
      var dx = ((i + 0.5) / cols) * 2 - 1 - frame.ox
      var dy = y - frame.oy
      var d = Math.sqrt(dx * dx + dy * dy)
      if (d <= frame.r) grid[j][i] = palette.dark
      else if (d <= frame.r + band) grid[j][i] = palette.term
    }
  }
}

// Unicode Braille 2x4 sub-pixel bit layout:
// col 0: rows 0..3 -> 0x01, 0x02, 0x04, 0x40
// col 1: rows 0..3 -> 0x08, 0x10, 0x20, 0x80
var BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80]
]

// High-resolution monochrome moon rendered in 2x4 sub-pixel Unicode Braille.
// Uses the same rows/cols footprint as blocks/ascii with 8x dot resolution.
function _renderBraille(fraction, rows, colCount, mirror, eclipse) {
  var f = wrap01(fraction)
  var t = Math.cos(2 * Math.PI * f)
  var waxing = f < 0.5
  var subW = colCount * 2
  var subH = rows * 4
  var frame = (eclipse && eclipse.depth > 0) ? umbraFrame(eclipse) : null
  var umbraBand = 0.28

  var lines = new Array(rows)
  for (var r = 0; r < rows; r++) {
    var lineChars = new Array(colCount)
    for (var c = 0; c < colCount; c++) {
      var mask = 0
      for (var dy = 0; dy < 4; dy++) {
        var py = r * 4 + dy
        var y = ((py + 0.5) / subH) * 2 - 1
        var y2 = y * y
        var chord = y2 < 1 ? Math.sqrt(1 - y2) : 0
        var boundary = waxing ? t * chord : -(t * chord)
        for (var dx = 0; dx < 2; dx++) {
          var px = c * 2 + dx
          var sx = ((px + 0.5) / subW) * 2 - 1
          var x = mirror ? -sx : sx
          var r2 = x * x + y2
          if (r2 > 1) continue

          var depth = waxing ? x - boundary : boundary - x
          var lit = depth >= 0

          // Apply eclipse umbra in unmirrored selenographic coordinates.
          var eclipsed = false
          var umbraEdge = false
          if (frame) {
            var udx = x - frame.ox
            var udy = y - frame.oy
            var ud = Math.sqrt(udx * udx + udy * udy)
            if (ud <= frame.r) eclipsed = true
            else if (ud <= frame.r + umbraBand) umbraEdge = true
          }

          var dotOn = false
          if (!lit || eclipsed) {
            // Subtle stippled dark side & crisp limb outline so the full
            // spherical silhouette stays readable even near new moon.
            if (r2 > 0.94 && ((px + py) & 1) === 0) dotOn = true
            else if ((px % 3 === 0) && (py % 3 === 0)) dotOn = true
          } else if (umbraEdge) {
            dotOn = ((px + py) & 1) === 0
          } else {
            // Lit surface: solid highlands, dithered maria, ringed craters.
            var crater = _inCrater(x, y)
            if (crater) {
              var cd = Math.hypot((x - crater.x) / crater.r, (y - crater.y) / crater.r)
              // Hollow crater bowl with bright rim.
              dotOn = cd >= 0.62
            } else if (_inSea(x, y)) {
              // Ordered 50% dither for darker maria.
              dotOn = ((px + py) & 1) === 0
            } else {
              // Soften terminator transition over ~2 sub-pixels.
              if (depth < 0.035) dotOn = ((px + py) & 1) === 0
              else dotOn = true
            }
          }

          if (dotOn) mask |= BRAILLE_BITS[dy][dx]
        }
      }
      lineChars[c] = mask === 0 ? " " : String.fromCharCode(0x2800 + mask)
    }
    lines[r] = lineChars.join("")
  }
  return lines.join("\n")
}

// Render the lunar disk at the exact phase fraction as multi-line text art.
// `aspect` is the physical height:width ratio of one character cell (measure
// it from the rendering font); columns are derived from it so the disk stays
// circular instead of assuming square cells.
// style: "blocks" | "braille" | "ascii" ("vector", "cartoon", "clay" return
// blank placeholder grids of identical dimensions).
// `eclipse` (optional, from eclipseState) darkens cells under the umbra.
function renderMoonArt(fraction, style, rows, mirror, aspect, eclipse) {
  var colCount = Math.max(rows, Math.round(rows * aspect))

  // Painted/image styles (vector, cartoon, clay): the text layer just holds
  // the layout, so return an all-spaces grid with identical dimensions.
  // Everything downstream (card width, tap mapping, star clearance) keeps
  // working.
  if (style === "vector" || style === "cartoon" || style === "clay") {
    var spaces = new Array(colCount + 1).join(" ")
    var blank = []
    for (var bi = 0; bi < rows; bi++) blank.push(spaces)
    return blank.join("\n")
  }

  if (style === "braille") {
    return _renderBraille(fraction, rows, colCount, !!mirror, eclipse)
  }

  var palette = PALETTES[style] === undefined ? PALETTES.blocks : PALETTES[style]
  var band = 2 / colCount // one cell width in normalized units
  var f = wrap01(fraction)
  var t = Math.cos(2 * Math.PI * f)
  var waxing = f < 0.5

  // Cell grid as rows of characters so features can be stamped after shading.
  var grid = []
  for (var j = 0; j < rows; j++) {
    var y = ((j + 0.5) / rows) * 2 - 1
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

  _stampSeas(grid, rows, colCount, palette)
  _stampCraters(grid, rows, colCount, palette)
  if (eclipse && eclipse.depth > 0) _stampUmbra(grid, rows, colCount, palette, eclipse)

  var lines = []
  for (var k = 0; k < grid.length; k++) {
    var line = grid[k].join("")
    lines.push(mirror ? line.split("").reverse().join("") : line)
  }
  return lines.join("\n")
}

// The clay style is eight painted plates rather than a computed disc. They
// are the same eight visual states the emoji glyphs use, so the same
// bucketing applies: each plate owns one eighth of the cycle and is centred
// on its own phase (new, waxing crescent, first quarter, ...).
function plateIndex(fraction) {
  var i = Math.round(wrap01(fraction) * 8) % 8
  return i < 0 ? i + 8 : i
}

// Crossfade partner: `a` is the plate in hand, `b` the next one, `k` how far
// the blend has travelled between them. k is 0 at a plate's own phase and
// approaches 1 just before it hands over, so the fade is symmetric.
function plateBlend(fraction) {
  var t = wrap01(fraction) * 8
  var a = Math.floor(t) % 8
  return { a: a, b: (a + 1) % 8, k: t - Math.floor(t) }
}

// Which plates to draw and how. The base plate stays fully opaque and the
// next plate fades in over it: two stacked half-opacity layers would let the
// panel background show through and would weight the outgoing plate by
// (1 - k)^2 instead of (1 - k). With blending off, show the nearest plate at
// full opacity, cutting at the midpoint between plates.
function clayPlateMix(fraction, blend) {
  if (!blend) return { base: plateIndex(fraction), top: -1, k: 0 }
  var b = plateBlend(fraction)
  return { base: b.a, top: b.b, k: b.k }
}

// Lookup by sea name; null when unknown.
function seaByName(name) {
  for (var i = 0; i < SEAS.length; i++)
    if (SEAS[i].name === name) return SEAS[i]
  return null
}

// Hover lookup: returns the name of the lit crater or mare under fractional
// art coordinates (fx, fy in 0..1), or null if outside the lit surface.
function featureAt(fx, fy, fraction, mirror) {
  var nx = fx * 2 - 1
  var ny = fy * 2 - 1
  if (mirror) nx = -nx
  if (nx * nx + ny * ny > 1) return null

  var f = wrap01(fraction)
  var t = Math.cos(2 * Math.PI * f)
  var waxing = f < 0.5
  var chord = Math.sqrt(Math.max(0, 1 - ny * ny))
  var boundary = waxing ? t * chord : -(t * chord)
  var lit = waxing ? (nx >= boundary) : (nx <= boundary)
  if (!lit) return null

  var crater = _inCrater(nx, ny)
  if (crater) return crater.name
  var sea = _inSea(nx, ny)
  if (sea) return sea.name
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

// Lightweight display-only state from a phase fraction (used by dev-mode
// ticks so we don't recompute future Meeus syzygies every second).
function moonDisplayState(fraction, southernHemisphere) {
  var f = wrap01(Number(fraction))
  return {
    fraction: f,
    ageDays: Math.round(f * SYNODIC_DAYS * 10) / 10,
    illuminationPct: Math.round(illumination(f) * 100),
    phaseName: phaseName(f),
    glyph: glyphFor(f, southernHemisphere)
  }
}

// Everything the UI needs in one object. nowMs: ms since Unix epoch;
// southernHemisphere mirrors glyph selection.
function moonState(nowMs, southernHemisphere, fractionOverride) {
  var target = Number(nowMs)
  var f = fractionOverride === undefined
      ? phaseFraction(target)
      : wrap01(Number(fractionOverride))
  var ageDays = fractionOverride === undefined
      ? Math.round(((target - prevNewMoonMs(target)) / MS_PER_DAY) * 10) / 10
      : Math.round(f * SYNODIC_DAYS * 10) / 10
  var pName = phaseName(f)
  var nextNew = nextNewMoonMs(target)
  var nextFull = nextFullMoonMs(target)
  return {
    fraction: f,
    ageDays: ageDays,
    illuminationPct: Math.round(illumination(f) * 100),
    phaseName: pName,
    glyph: glyphFor(f, southernHemisphere),
    nextNewMs: nextNew,
    nextFullMs: nextFull,
    nextQuarter: nextQuarter(target),
    fullMoon: pName === "Full Moon" ? fullMoonInfo(target) : null,
    nextFullInfo: fullMoonInfo(nextFull)
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

// Hit-test the cartoon red button nose / central face for the boop easter egg.
// Mirrors paintHose(): head centered at (w*0.5, h*0.44), radius R = min(w,h)*0.28,
// nose at (cx, cy + 0.04*R).
function cartoonFaceHit(px, py, w, h) {
  if (w < 10 || h < 10) return false
  var R = Math.min(w, h) * 0.280
  var cx = w * 0.5
  var cy = h * 0.44 + R * 0.04
  var dx = px - cx
  var dy = py - cy
  return (dx * dx + dy * dy) <= (R * 0.52) * (R * 0.52)
}

// Hit-test the upper limb crest on the clay plate for the clay flag easter egg.
function clayFlagHit(px, py, w, h, discFrac) {
  if (w < 10 || h < 10) return false
  var R = w * (discFrac || 0.810) / 2
  var cx = w / 2
  var cy = h * 0.495
  var nx = (px - cx) / R
  var ny = (py - cy) / R
  // Small crest patch near the top pole of the painted sphere.
  return Math.abs(nx) <= 0.30 && ny >= -1.05 && ny <= -0.68
}

if (typeof module !== "undefined") {
  module.exports = {
    SYNODIC_DAYS: SYNODIC_DAYS,
    EPOCH_MS: EPOCH_MS,
    GLYPHS: GLYPHS,
    PLAIN_GLYPHS: PLAIN_GLYPHS,
    phaseFraction: phaseFraction,
    illumination: illumination,
    phaseName: phaseName,
    glyphFor: glyphFor,
    plainGlyphFor: plainGlyphFor,
    nextNewMoonMs: nextNewMoonMs,
    nextFirstQuarterMs: nextFirstQuarterMs,
    nextFullMoonMs: nextFullMoonMs,
    nextLastQuarterMs: nextLastQuarterMs,
    nextQuarter: nextQuarter,
    lunationSlots: lunationSlots,
    fullMoonInfo: fullMoonInfo,
    nextEclipse: nextEclipse,
    renderMoonArt: renderMoonArt,
    plateIndex: plateIndex,
    plateBlend: plateBlend,
    clayPlateMix: clayPlateMix,
    umbraFrame: umbraFrame,
    moonDisplayState: moonDisplayState,
    moonState: moonState,
    CRATERS: CRATERS,
    SEAS: SEAS,
    EGG_SEA: EGG_SEA,
    featureAt: featureAt,
    seaHit: seaHit,
    vecMouthHit: vecMouthHit,
    cartoonFaceHit: cartoonFaceHit,
    clayFlagHit: clayFlagHit,
    seaCenter: seaCenter,
    lunarEclipseAt: lunarEclipseAt,
    eclipseState: eclipseState
  }
}
