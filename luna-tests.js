const M = require('./Model.js')
const MS_DAY = 86400000
let failures = 0

function check(name, cond, detail) {
  if (!cond) { failures++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
  else console.log(`ok   ${name}`)
}

function ms(iso) { return Date.parse(iso) }

// --- Phase math vs known events (UTC, Meeus ch. 49 anchored) ---
{
  const f = M.phaseFraction(ms('2000-01-06T18:14:00Z'))
  const distDays = Math.min(f, 1 - f) * M.SYNODIC_DAYS
  check('epoch is new moon (within 5 min)', distDays * 1440 < 5, `f=${f} (${(distDays*1440).toFixed(2)} min)`)
}
{
  const f = M.phaseFraction(ms('2024-01-11T11:57:00Z'))
  const distMin = Math.min(f, 1 - f) * M.SYNODIC_DAYS * 1440
  check('2024-01-11 new moon within 5 min', distMin < 5, `off by ${distMin.toFixed(2)} min`)
  check('2024-01-11 low illum', M.illumination(f) < 0.001, `${(M.illumination(f)*100).toFixed(3)}%`)
}
{
  const f = M.phaseFraction(ms('2024-01-18T03:53:00Z'))
  const distMin = Math.abs(f - 0.25) * M.SYNODIC_DAYS * 1440
  check('2024-01-18 first quarter within 5 min', distMin < 5, `off by ${distMin.toFixed(2)} min`)
}
{
  const f = M.phaseFraction(ms('2024-01-25T17:54:00Z'))
  const distMin = Math.abs(f - 0.5) * M.SYNODIC_DAYS * 1440
  check('2024-01-25 full moon within 5 min', distMin < 5, `off by ${distMin.toFixed(2)} min`)
  check('2024-01-25 high illum', M.illumination(f) > 0.999)
}
{
  const s = M.moonState(ms('2026-08-23T12:00:00Z'), false)
  console.log(`     sample: ${s.phaseName}, ${s.illuminationPct}%, age ${s.ageDays}d`)
  check('next events after now',
    s.nextFullMs > ms('2026-08-23T12:00:00Z') &&
    s.nextNewMs > ms('2026-08-23T12:00:00Z') &&
    s.nextQuarter.ms > ms('2026-08-23T12:00:00Z'))
}

// --- Quarter predictions vs 2026 almanac instants (UTC) ---
{
  const quarters = [
    ['2026-01-10T15:48Z', 'last'],
    ['2026-01-26T04:47Z', 'first'],
    ['2026-02-09T12:43Z', 'last'],
    ['2026-02-24T12:28Z', 'first'],
    ['2026-05-09T21:10Z', 'last'],
    ['2026-05-23T11:11Z', 'first']
  ]
  const TOL_MS = 10 * 60000
  for (const [iso, which] of quarters) {
    const truth = Date.parse(iso)
    const got = which === 'first'
      ? M.nextFirstQuarterMs(truth - 3 * MS_DAY)
      : M.nextLastQuarterMs(truth - 3 * MS_DAY)
    check(`${which} quarter ${iso} within 10 min`, Math.abs(got - truth) <= TOL_MS,
      `off by ${((got - truth) / 60000).toFixed(2)} min`)
  }
}

// --- Names, glyphs & lightweight display state ---
check('names at quarters', M.phaseName(0) === 'New Moon' && M.phaseName(0.5) === 'Full Moon'
  && M.phaseName(0.25) === 'First Quarter' && M.phaseName(0.75) === 'Last Quarter')
check('names between quarters', M.phaseName(0.125) === 'Waxing Crescent' && M.phaseName(0.625) === 'Waning Gibbous')
check('glyph hemisphere mirror', M.glyphFor(0.125, false) === '🌒' && M.glyphFor(0.125, true) === '🌘')
{
  const d = M.moonDisplayState(0.5, false)
  check('moonDisplayState full moon', d.phaseName === 'Full Moon' && d.illuminationPct === 100 && d.glyph === '🌕')
}

// --- Full moon names, Supermoon / Micromoon / Blue Moon ---
{
  const mayBlue = M.fullMoonInfo(ms('2026-05-31T08:45Z'))
  check('2026-05-31 is Blue Micromoon', mayBlue.isBlue === true && mayBlue.isMicro === true && !mayBlue.isSuper,
    `${mayBlue.label} (${mayBlue.distanceKm} km)`)
  const decSuper = M.fullMoonInfo(ms('2026-12-24T01:28Z'))
  check('2026-12-24 is Cold Supermoon', decSuper.name === 'Cold Moon' && decSuper.isSuper === true && !decSuper.isBlue,
    `${decSuper.label} (${decSuper.distanceKm} km)`)
  const sepHarvest = M.fullMoonInfo(ms('2026-09-26T16:50Z'))
  check('2026-09-26 is Harvest Moon', sepHarvest.name === 'Harvest Moon', sepHarvest.label)
}

// --- Art grid invariants (blocks, ascii, braille) ---
const ALLOWED = {
  blocks: '█▓·○▒ \n',
  ascii: '@#.O~ \n'
}
for (const style of ['blocks', 'ascii']) {
  for (const [rows, aspect] of [[25, 2.0], [13, 2.2], [31, 1.67], [9, 2.4]]) {
    for (const frac of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const art = M.renderMoonArt(frac, style, rows, false, aspect)
      const lines = art.split('\n')
      if (lines.length !== rows || (rows % 2 !== 1)) { failures++; console.log(`FAIL rowcount ${style}/${rows}/${aspect}/${frac}: ${lines.length}`); continue }
      const widths = new Set(lines.map(l => l.length))
      if (widths.size !== 1) { failures++; console.log(`FAIL ragged ${style}/${rows}/${aspect}/${frac}`); continue }
      const allowed = ALLOWED[style]
      for (const ch of art) {
        if (!allowed.includes(ch)) { failures++; console.log(`FAIL bad char '${ch}' (${ch.codePointAt(0)}) ${style}/${rows}/${aspect}/${frac}`); break }
      }
    }
  }
}
console.log('ok   blocks/ascii rectangular + palette-clean across rows/aspects/phases')

// Braille invariants
{
  let brailleOk = true
  for (const [rows, aspect] of [[19, 2.0], [13, 2.2], [25, 1.8]]) {
    for (const frac of [0, 0.25, 0.5, 0.75]) {
      const art = M.renderMoonArt(frac, 'braille', rows, false, aspect)
      const lines = art.split('\n')
      if (lines.length !== rows) { brailleOk = false; break }
      const widths = new Set(lines.map(l => l.length))
      if (widths.size !== 1) { brailleOk = false; break }
      for (const ch of art) {
        const cp = ch.codePointAt(0)
        if (ch !== ' ' && ch !== '\n' && (cp < 0x2800 || cp > 0x28FF)) { brailleOk = false; break }
      }
    }
  }
  check('braille rectangular + unicode-clean across rows/aspects/phases', brailleOk)
  const bFull = M.renderMoonArt(0.5, 'braille', 19, false, 2.0)
  const bNew = M.renderMoonArt(0.0, 'braille', 19, false, 2.0)
  const dotCount = s => {
    let n = 0
    for (const ch of s) {
      const cp = ch.codePointAt(0)
      if (cp >= 0x2800 && cp <= 0x28FF) {
        let bits = cp - 0x2800
        while (bits) { n += bits & 1; bits >>= 1 }
      }
    }
    return n
  }
  check('braille full moon has far more lit dots than new moon', dotCount(bFull) > dotCount(bNew) * 4,
    `full=${dotCount(bFull)} new=${dotCount(bNew)}`)
  const bTotality = M.renderMoonArt(0.5, 'braille', 19, false, 2.0,
    { kind: 'total', label: '', depth: 1, peak: 1, gamma: 0.1, progress: 0.5 })
  check('braille totality darkens full moon', dotCount(bTotality) < dotCount(bFull) * 0.3,
    `totality=${dotCount(bTotality)} full=${dotCount(bFull)}`)
}

// --- Circle geometry: lit extents match an ideal circle (±1.5 cells) ---
function circleCheck(rows, aspect) {
  const C = Math.max(rows, Math.round(rows * aspect))
  const art = M.renderMoonArt(0.5, 'blocks', rows, false, aspect)
  const lines = art.split('\n')
  let worst = 0
  for (let j = 1; j < rows - 1; j++) {
    const y = ((j + 0.5) / rows) * 2 - 1
    const idealHalf = (C / 2) * Math.sqrt(Math.max(0, 1 - y * y))
    let min = Infinity, max = -Infinity
    for (let i = 0; i < C; i++) {
      if (lines[j][i] === '█') { if (i < min) min = i; if (i > max) max = i }
    }
    const half = (max + 1 - min) / 2
    const centerErr = Math.abs((min + max + 1) / 2 - C / 2)
    worst = Math.max(worst, Math.abs(half - idealHalf), centerErr)
  }
  return worst
}
for (const [rows, aspect] of [[25, 2.0], [21, 2.2], [31, 1.67]]) {
  const worst = circleCheck(rows, aspect)
  check(`circle extents ${rows}r@${aspect}`, worst <= 1.5, `worst cell error ${worst.toFixed(2)}`)
}

// --- Craters & seas + hover featureAt ---
function countCh(s, ch) { return s.split(ch).length - 1 }
{
  const full = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0)
  check('full moon shows all 8 craters', countCh(full, '○') >= 8, `found ${countCh(full, '○')}`)
  check('craters deterministic', full === M.renderMoonArt(0.5, 'blocks', 25, false, 2.0))
  check('full moon shows seas', countCh(full, '▒') >= 30, `found ${countCh(full, '▒')}`)

  const crescent = M.renderMoonArt(0.08, 'blocks', 25, false, 2.0)
  check('thin crescent shows no craters', countCh(crescent, '○') === 0, `found ${countCh(crescent, '○')}`)
  check('thin crescent shows no seas', countCh(crescent, '▒') === 0, `found ${countCh(crescent, '▒')}`)

  const newMoon = M.renderMoonArt(0.0, 'blocks', 25, false, 2.0)
  check('new moon shows no craters or seas', countCh(newMoon, '○') === 0 && countCh(newMoon, '▒') === 0)

  const south = M.renderMoonArt(0.5, 'blocks', 25, true, 2.0)
  check('mirror preserves feature counts', countCh(south, '○') === countCh(full, '○') && countCh(south, '▒') === countCh(full, '▒'))

  const g1 = M.renderMoonArt(0.45, 'blocks', 25, false, 2.0).split('\n')
  const g2 = M.renderMoonArt(0.55, 'blocks', 25, false, 2.0).split('\n')
  let stable = true
  for (let j = 0; j < g1.length; j++) {
    const c1 = g1[j].indexOf('○'); const c2 = g2[j].indexOf('○')
    if (c1 !== c2) { stable = false; break }
  }
  check('crater columns stable across phases', stable)

  const asciiFull = M.renderMoonArt(0.5, 'ascii', 25, false, 2.0)
  check('ascii style uses O for craters and ~ for seas', countCh(asciiFull, 'O') >= 8 && countCh(asciiFull, '~') >= 30)

  // featureAt: Mare Tranquillitatis is on the right (waxing) side at (0.30, -0.08) -> (0.65, 0.46)
  check('featureAt identifies lit Mare Tranquillitatis at first quarter',
    M.featureAt(0.65, 0.46, 0.25, false) === 'Mare Tranquillitatis')
  check('featureAt returns null on unlit side (Procellarum at first quarter)',
    M.featureAt(0.24, 0.44, 0.25, false) === null)
  check('featureAt prioritizes crater inside mare (Copernicus in Procellarum)',
    M.featureAt((-0.42 + 1) / 2, (0.02 + 1) / 2, 0.5, false) === 'Copernicus')
  check('featureAt honors southern hemisphere mirror',
    M.featureAt(1 - 0.65, 0.46, 0.25, true) === 'Mare Tranquillitatis')
}

// --- Easter egg hit tests ---
{
  // Vector tongue
  check('vecMouthHit hits the smile midpoint', M.vecMouthHit(100, 137, 200, 200) === true)
  check('vecMouthHit hits mid-arc', M.vecMouthHit(130, 125, 200, 200) === true)
  check('vecMouthHit misses the eyes', M.vecMouthHit(70, 82, 200, 200) === false)
  check('vecMouthHit misses far corner', M.vecMouthHit(5, 5, 200, 200) === false)
  check('vecMouthHit misses above the arc', M.vecMouthHit(100, 98, 200, 200) === false)
  check('vecMouthHit degenerate canvas is safe', M.vecMouthHit(50, 50, 5, 5) === false)

  // Cartoon nose boop
  check('cartoonFaceHit hits nose', M.cartoonFaceHit(100, 90, 200, 200) === true)
  check('cartoonFaceHit misses outstretched arm', M.cartoonFaceHit(35, 90, 200, 200) === false)
  check('cartoonFaceHit misses boots', M.cartoonFaceHit(100, 170, 200, 200) === false)
  check('cartoonFaceHit misses corner', M.cartoonFaceHit(10, 10, 200, 200) === false)
  check('cartoonFaceHit degenerate canvas is safe', M.cartoonFaceHit(5, 5, 5, 5) === false)

  // Clay top-rim flag
  check('clayFlagHit hits upper pole', M.clayFlagHit(100, 30, 200, 200, 0.81) === true)
  check('clayFlagHit misses center', M.clayFlagHit(100, 100, 200, 200, 0.81) === false)
}

// --- nextNewMoonMs / nextFullMoonMs vs 2026 almanac instants (UTC) ---
{
  const news = [
    '2026-01-18T19:51Z', '2026-02-17T12:01Z', '2026-03-19T01:23Z',
    '2026-04-17T11:52Z', '2026-05-16T20:01Z', '2026-06-15T02:54Z',
    '2026-07-14T09:43Z', '2026-08-12T17:37Z', '2026-09-11T03:27Z',
    '2026-10-10T15:50Z'
  ]
  const fulls = [
    '2026-01-03T10:03Z', '2026-02-01T22:09Z', '2026-03-03T11:38Z',
    '2026-04-02T02:12Z', '2026-05-01T17:23Z', '2026-05-31T08:45Z',
    '2026-06-29T23:56Z', '2026-07-29T14:35Z', '2026-08-28T04:18Z',
    '2026-09-26T16:50Z'
  ]
  const TOL_MS = 10 * 60000
  for (const iso of news) {
    const truth = new Date(iso).getTime()
    const got = M.nextNewMoonMs(truth - 3 * MS_DAY)
    check(`new moon ${iso} within 10 min`, Math.abs(got - truth) <= TOL_MS)
  }
  for (const iso of fulls) {
    const truth = new Date(iso).getTime()
    const got = M.nextFullMoonMs(truth - 3 * MS_DAY)
    check(`full moon ${iso} within 10 min`, Math.abs(got - truth) <= TOL_MS)
  }
}

// --- plainGlyphFor (monochrome Nerd Font pill icon) ---
{
  check('plain new moon codepoint', M.plainGlyphFor(0.0, false) === '\uE38D')
  check('plain waxing crescent codepoint', M.plainGlyphFor(0.124, false) === '\uE390')
  check('plain first quarter codepoint', M.plainGlyphFor(0.25, false) === '\uE394')
  check('plain full moon codepoint', M.plainGlyphFor(0.5, true) === '\uE39B')
  check('plain south mirrors crescents', M.plainGlyphFor(0.124, true) === '\uE3A5')
  check('plain south swaps quarters', M.plainGlyphFor(0.25, true) === '\uE3A2')
}

// --- Mirror equivalence ignoring feature placement ---
function stripFeatures(a) {
  return a.replace(/[○O▒~]/g, c => (c === 'O' || c === '~') ? '@' : '█')
}
check('waning mirrors waxing (shading only)', (() => {
  const rev = a => a.split('\n').map(l => [...l].reverse().join('')).join('\n')
  return stripFeatures(rev(M.renderMoonArt(0.375, 'blocks', 13, false, 2.0))) === stripFeatures(M.renderMoonArt(0.625, 'blocks', 13, false, 2.0))
})())
check('south render = mirrored north', (() => {
  const n = M.renderMoonArt(0.125, 'blocks', 13, false, 2.0).split('\n').map(l => [...l].reverse().join('')).join('\n')
  const s = M.renderMoonArt(0.125, 'blocks', 13, true, 2.0)
  return stripFeatures(n) === stripFeatures(s)
})())

// --- Canvas/image style placeholder grids (vector, cartoon, clay) ---
{
  const b = M.renderMoonArt(0.5, 'blocks', 19, false, 2.333)
  const bl = b.split('\n')
  for (const style of ['vector', 'cartoon', 'clay']) {
    const g = M.renderMoonArt(0.5, style, 19, false, 2.333)
    check(`${style} render is whitespace-only`, g.trim().length === 0)
    const gl = g.split('\n')
    check(`${style} dims match blocks dims`, gl.length === bl.length && gl[0].length === bl[0].length)
  }
}

// --- Clay plates: eight states, same bucketing as the glyphs ---
{
  for (let i = 0; i < 8; i++) {
    check(`plateIndex(${i}/8) === ${i}`, M.plateIndex(i / 8) === i)
  }
  check('plateIndex wraps > 1', M.plateIndex(1.0) === 0)
  check('plateIndex wraps negative', M.plateIndex(-0.01) === 0)
  check('plateIndex mid-slot rounds to nearest', M.plateIndex(0.0625) === 1)

  const b0 = M.plateBlend(0.25)
  check('blend at a plate centre is pure', b0.a === 2 && b0.b === 3 && Math.abs(b0.k) < 1e-9)
  const b1 = M.plateBlend(0.9375)
  check('blend wraps 7 -> 0', b1.a === 7 && b1.b === 0 && Math.abs(b1.k - 0.5) < 1e-9)
  const b2 = M.plateBlend(0.5)
  check('blend at full moon is 4 -> 5', b2.a === 4 && b2.b === 5 && Math.abs(b2.k) < 1e-9)

  const nearEnd = M.plateBlend(0.25 + 0.125 * 0.99)
  const nextStart = M.plateBlend(0.25 + 0.125)
  check('blend k resets at the handover',
        nearEnd.a === 2 && nearEnd.b === 3 && nearEnd.k > 0.98 &&
        nextStart.a === 3 && Math.abs(nextStart.k) < 1e-9)

  const m0 = M.clayPlateMix(0.25, true)
  check('mix at a plate centre is pure', m0.base === 2 && m0.top === 3 && Math.abs(m0.k) < 1e-9)
  const m1 = M.clayPlateMix(0.9375, true)
  check('mix wraps 7 -> 0', m1.base === 7 && m1.top === 0 && Math.abs(m1.k - 0.5) < 1e-9)
  const m2 = M.clayPlateMix(0.99, true)
  check('mix near new moon mostly shows plate 0', m2.base === 7 && m2.top === 0 && m2.k > 0.9)

  const noBlendBefore = M.clayPlateMix(0.9374, false)
  const noBlendAt = M.clayPlateMix(0.9375, false)
  check('no-blend keeps the previous plate before the midpoint',
        noBlendBefore.base === 7 && noBlendBefore.top === -1 && noBlendBefore.k === 0)
  check('no-blend cuts to the next plate at the midpoint',
        noBlendAt.base === 0 && noBlendAt.top === -1 && noBlendAt.k === 0)
  const noBlendLate = M.clayPlateMix(0.99, false)
  check('no-blend no longer lags a whole slot near new moon',
        noBlendLate.base === 0 && noBlendLate.top === -1)
}

// --- Easter egg hit-testing (Mare Tranquillitatis at x=+0.30, y=-0.08 -> 0.65, 0.46) ---
{
  check('seaHit center hits', M.seaHit(0.65, 0.46, false) === true)
  check('seaHit inside edge hits', M.seaHit(0.62, 0.46, false) === true)
  check('seaHit far miss', M.seaHit(0.05, 0.46, false) === false)
  check('seaHit mirrored tap hits flipped position', M.seaHit(1 - 0.65, 0.46, true) === true)
  check('seaHit unflipped position misses when mirrored', M.seaHit(0.65, 0.46, true) === false)
  const pc = M.seaCenter('Oceanus Procellarum')
  check('other seas do not trigger', M.seaHit((pc.x + 1) / 2, (pc.y + 1) / 2, false) === false)
}

// --- Lunar eclipses: Meeus ch.54 port vs NASA GSFC catalog (2026–2035) ---
{
  const FIX = [
    ['2026-08-28T04:14:04Z', 'partial', 0.930],
    ['2028-01-12T04:14:13Z', 'partial', 0.066],
    ['2028-07-06T18:20:57Z', 'partial', 0.389],
    ['2028-12-31T16:53:15Z', 'total', 1.246],
    ['2029-06-26T03:23:22Z', 'total', 1.844],
    ['2029-12-20T22:43:12Z', 'total', 1.117],
    ['2030-06-15T18:34:34Z', 'partial', 0.502],
    ['2032-04-25T15:14:51Z', 'total', 1.191],
    ['2032-10-18T19:03:40Z', 'total', 1.103],
    ['2033-04-14T19:13:51Z', 'total', 1.094],
    ['2033-10-08T10:56:23Z', 'total', 1.350],
    ['2034-09-28T02:47:37Z', 'partial', 0.014],
    ['2035-08-19T01:12:15Z', 'partial', 0.104]
  ]
  const lunationOf = t => Math.floor((t - M.EPOCH_MS) / (M.SYNODIC_DAYS * MS_DAY))
  let worstMin = 0, worstMag = 0
  let allFullMoon = true, allOverlap = true
  for (const [iso, type, mag] of FIX) {
    const truth = Date.parse(iso)
    const e = M.lunarEclipseAt(lunationOf(truth) + 0.5)
    if (!e) { failures++; console.log(`FAIL eclipse ${iso}: no event found`); continue }
    worstMin = Math.max(worstMin, Math.abs(e.greatestMs - truth) / 60000)
    worstMag = Math.max(worstMag, Math.abs(e.magnitude - mag))
    if (Math.abs(e.greatestMs - truth) > 10 * 60000) {
      failures++; console.log(`FAIL eclipse ${iso}: off by ${(e.greatestMs - truth) / 60000} min`)
    }
    if (Math.abs(e.magnitude - mag) > 0.05) {
      failures++; console.log(`FAIL eclipse ${iso}: mag ${e.magnitude.toFixed(3)} vs ${mag}`)
    }
    if (e.kind !== type) {
      failures++; console.log(`FAIL eclipse ${iso}: ${e.kind} vs ${type}`)
    }
    // Phase name during every real eclipse must be Full Moon (never Waxing Gibbous!).
    if (M.moonState(truth, false).phaseName !== 'Full Moon') {
      allFullMoon = false
      console.log(`FAIL eclipse phaseName ${iso}: got ${M.moonState(truth, false).phaseName}`)
    }
    // Umbra frame at greatest eclipse must always overlap the lunar disc (even grazing partials).
    const st = M.eclipseState(e.greatestMs)
    const uf = M.umbraFrame(st)
    if (Math.hypot(uf.ox, uf.oy) - uf.r >= 1) {
      allOverlap = false
      console.log(`FAIL umbra misses disc ${iso}: dist-r=${(Math.hypot(uf.ox, uf.oy) - uf.r).toFixed(3)}`)
    }
  }
  check('eclipse fixtures within tolerance', true,
    `worst ${worstMin.toFixed(2)} min / ${worstMag.toFixed(4)} mag`)
  check('every 2026-2035 eclipse reports Full Moon phase', allFullMoon)
  check('umbraFrame overlaps disc at greatest for every eclipse (incl. 2034 grazing partial)', allOverlap)
}
{
  // State machine around the Aug 2026 partial (semi-duration ~99 min).
  const g = Date.parse('2026-08-28T04:14:04Z')
  const nearGreatest = M.eclipseState(g)
  check('eclipse active at greatest', !!nearGreatest && nearGreatest.kind === 'partial')
  check('eclipse label', nearGreatest.label === 'Partial Lunar Eclipse')
  const atGreatest = M.eclipseState(nearGreatest.greatestMs)
  check('depth peaks at greatest', Math.abs(atGreatest.depth - atGreatest.peak) < 1e-9)
  const ingress = M.eclipseState(g - 60 * 60000)
  check('depth ramps up during ingress', ingress.depth > 0 && ingress.depth < nearGreatest.depth)
  check('no eclipse before U1', M.eclipseState(g - 5 * 3600000) === null)
  check('no eclipse after U4', M.eclipseState(g + 5 * 3600000) === null)

  // Totality plateau & accurate U1..U4 window: 2029 Jun 26
  // (real umbral semi-duration ~109 min, totality semi-duration ~51 min).
  const tg = Date.parse('2029-06-26T03:23:22Z')
  const before = M.eclipseState(tg - 20 * 60000)
  const during = M.eclipseState(tg + 20 * 60000)
  check('totality is total', before.kind === 'total' && during.kind === 'total'
    && before.label === 'Total Lunar Eclipse')
  check('depth plateaus through totality', before.depth === 1 && during.depth === 1)

  const tGreatest = M.eclipseState(tg).greatestMs
  const tEarly = M.eclipseState(tGreatest - 90 * 60000)
  const tMid = M.eclipseState(tGreatest)
  const tLate = M.eclipseState(tGreatest + 90 * 60000)
  check('progress defined through total window (inside ~109m semi-duration)',
    !!tEarly && !!tMid && !!tLate &&
    tEarly.progress < tMid.progress && tMid.progress < tLate.progress &&
    tEarly.depth > 0 && tEarly.depth < 1)
  check('total eclipse does NOT double-count semiTotalMs (outside ~109m is null)',
    M.eclipseState(tGreatest - 130 * 60000) === null &&
    M.eclipseState(tGreatest + 130 * 60000) === null)

  const pG = M.eclipseState(Date.parse('2026-08-28T04:14:04Z'))
  check('partial progress ~0.5 at greatest', !!pG && Math.abs(pG.progress - 0.5) < 0.05)

  // Penumbral-only events and quiet instants stay invisible.
  check('penumbral ignored (2027-02-20)', M.eclipseState(Date.parse('2027-02-20T23:14:06Z')) === null)
  check('penumbral ignored (2030-12-09)', M.eclipseState(Date.parse('2030-12-09T22:28:51Z')) === null)
  check('no eclipse today', M.eclipseState(ms('2026-08-24T12:00:00Z')) === null)

  // nextEclipse finds upcoming umbral eclipses accurately.
  const nxt2026 = M.nextEclipse(ms('2026-08-01T00:00:00Z'))
  check('nextEclipse finds 2026-08-28 partial',
    !!nxt2026 && nxt2026.kind === 'partial' && Math.abs(nxt2026.greatestMs - g) < 10 * 60000)
  const nxt2028 = M.nextEclipse(ms('2026-09-01T00:00:00Z'))
  check('nextEclipse skips penumbrals and finds 2028-01-12 partial',
    !!nxt2028 && nxt2028.kind === 'partial' && Math.abs(nxt2028.greatestMs - Date.parse('2028-01-12T04:14:13Z')) < 10 * 60000)
}

// --- Umbra frame shared by text, braille, canvases, and clay ---
{
  const frame = (progress, gamma) => M.umbraFrame({ progress: progress, gamma: gamma })
  const a = frame(0, 0), mid = frame(0.5, 0), z = frame(1, 0)
  check('umbra radius is 2.7 disc radii by default', Math.abs(a.r - 2.7) < 1e-12)
  check('umbra starts left of the disc', a.ox < 0 && Math.abs(a.ox + 3.85) < 1e-9)
  check('umbra ends right of the disc', z.ox > 0 && Math.abs(z.ox - 3.85) < 1e-9)
  check('umbra is centred at mid-event', Math.abs(mid.ox) < 1e-9 && Math.abs(mid.oy) < 1e-9)
  check('umbra transits monotonically',
    [0.05, 0.25, 0.5, 0.75, 0.95].every((p, i, arr) => i === 0 || frame(p, 0).ox > frame(arr[i - 1], 0).ox))
  check('positive gamma rides above centre', frame(0.5, 0.4).oy < 0 && frame(0.5, -0.4).oy > 0)
  check('first contact is clear of the disc', Math.abs(a.ox) - a.r >= 1)
  check('deep partials still overlap the disc',
    Math.abs(frame(0.05, 0).ox) - a.r < 1 && Math.abs(frame(0.95, 0).ox) - a.r < 1)
  check('mid-event totality envelops the disc', Math.abs(mid.ox) + 1 <= mid.r)
}

// --- Umbra bite stamped into text art ---
{
  const mk = (progress, gamma) => ({
    kind: 'partial', label: '', depth: Math.min(1, Math.max(0.15, progress)),
    peak: 1, gamma: gamma, progress: progress
  })
  const darkXs = art => {
    const lines = art.split('\n')
    const xs = []
    lines.forEach(l => { for (let i = 0; i < l.length; i++) if (l[i] === '·') xs.push(i / l.length) })
    return xs
  }
  const centroid = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  let prevC = -1, monotonic = true
  for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const xs = darkXs(M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, mk(p, 0)))
    if (xs.length === 0 || centroid(xs) <= prevC) monotonic = false
    prevC = centroid(xs)
  }
  check('shadow transits left to right monotonically', monotonic)
  const early = darkXs(M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, mk(0.05, 0)))
  const late = darkXs(M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, mk(0.95, 0)))
  check('enters on the left limb first', early.length > 0 && centroid(early) < 0.35)
  check('exits on the right limb last', late.length > 0 && centroid(late) > 0.65)

  const darkRowCentroid = art => {
    const lines = art.split('\n'); let sy = 0, n = 0
    lines.forEach((l, j) => { for (const ch of l) if (ch === '·') { sy += j; n++ } })
    return sy / Math.max(1, n)
  }
  const above = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, mk(0.1, 0.5))
  const below = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, mk(0.1, -0.5))
  check('positive gamma rides higher', darkRowCentroid(above) < darkRowCentroid(below))

  const grazing = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, { ...mk(0.5, 0.92), depth: 0.5 })
  const totalCells = countCh(grazing, '█') + countCh(grazing, '▓') + countCh(grazing, '·')
  check('grazing partial keeps most of the disk lit', countCh(grazing, '█') > totalCells * 0.6)
  const totality = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0,
    { kind: 'total', label: '', depth: 1, peak: 1, gamma: 0.12, progress: 0.5 })
  check('totality envelopes the disk', countCh(totality, '█') === 0)

  const ecl = mk(0.5, 0.1)
  const rev = a => a.split('\n').map(l => [...l].reverse().join('')).join('\n')
  const e1 = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0, ecl)
  check('umbra darkens the disk', countCh(e1, '·') > countCh(M.renderMoonArt(0.5, 'blocks', 25, false, 2.0), '·'))
  check('eclipse mirrors exactly', rev(e1) === M.renderMoonArt(0.5, 'blocks', 25, true, 2.0, ecl))
}

// --- 8-phase lunation strip slots ---
{
  // Mid-lunation (2026-11-27): 8 strictly increasing instants anchored to Nov 9..Dec 8 lunation.
  const midMs = Date.UTC(2026, 10, 27, 22, 0)
  const slots = M.lunationSlots(midMs)
  check('lunationSlots returns 8 slots', slots.length === 8)
  check('lunationSlots names start New Moon and peak Full Moon',
    slots[0].name === 'New Moon' && slots[2].name === 'First Quarter' &&
    slots[4].name === 'Full Moon' && slots[6].name === 'Last Quarter')
  check('lunationSlots timestamps strictly increase',
    slots.every((s, i) => i === 0 || s.ms > slots[i - 1].ms))
  check('lunationSlots full moon matches Nov 2026 full moon',
    Math.abs(slots[4].ms - M.nextFullMoonMs(Date.UTC(2026, 10, 15))) === 0)
  check('lunationSlots last quarter matches nextLastQuarterMs',
    Math.abs(slots[6].ms - M.nextLastQuarterMs(midMs)) === 0)

  // Just before upcoming New Moon (within final 1/16 of cycle, plateIndex === 0):
  // slot 0 advances to the upcoming New Moon rather than a month earlier.
  const nextNew = M.nextNewMoonMs(midMs)
  const preNew = nextNew - 12 * 3600 * 1000
  const preSlots = M.lunationSlots(preNew)
  check('lunationSlots anchors to upcoming new moon when active dot wraps to 0',
    M.plateIndex(M.phaseFraction(preNew)) === 0 && preSlots[0].ms === nextNew)
}

// --- Visual spot-checks ---
console.log('\n--- visual: full moon w/ seas + craters, 19 rows @ aspect 2.333 ---')
console.log(M.renderMoonArt(0.5, 'blocks', 19, false, 2.333))
console.log('\n--- visual: waxing gibbous f=0.375, braille ---')
console.log(M.renderMoonArt(0.375, 'braille', 19, false, 2.333))

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
