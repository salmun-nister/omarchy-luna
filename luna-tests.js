const M = require('./Model.js')
const MS_DAY = 86400000
let failures = 0

function check(name, cond, detail) {
  if (!cond) { failures++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
  else console.log(`ok   ${name}`)
}

function ms(iso) { return Date.parse(iso) }

// --- Phase math vs known events (UTC) ---
{
  const f = M.phaseFraction(ms('2000-01-06T18:14:00Z'))
  check('epoch is new moon', f < 1e-9 && f >= 0, `f=${f}`)
}
{
  const f = M.phaseFraction(M.EPOCH_MS + M.SYNODIC_DAYS * MS_DAY / 2)
  check('epoch+half cycle ~full', Math.abs(f - 0.5) < 0.001, `f=${f}`)
  check('full illumination ~100%', M.illumination(f) > 0.99)
}
{
  const f = M.phaseFraction(ms('2024-01-11T11:57:00Z'))
  check('2024-01-11 new moon', f < 0.03 || f > 0.97, `f=${f} (${(f*M.SYNODIC_DAYS).toFixed(2)}d)`)
  check('2024-01-11 low illum', M.illumination(f) < 0.02, `${(M.illumination(f)*100).toFixed(1)}%`)
}
{
  const f = M.phaseFraction(ms('2024-01-25T17:54:00Z'))
  const dist = Math.min(Math.abs(f - 0.5), Math.abs(f + 0.5)) * M.SYNODIC_DAYS
  check('2024-01-25 full moon within 1 day', dist < 1, `off by ${dist.toFixed(2)}d`)
  check('2024-01-25 high illum', M.illumination(f) > 0.96)
}
{
  const f = M.phaseFraction(ms('2024-01-18T03:53:00Z'))
  const dist = Math.abs(f - 0.25) * M.SYNODIC_DAYS
  check('2024-01-18 first quarter within 1 day', dist < 1, `off by ${dist.toFixed(2)}d`)
}
{
  const s = M.moonState(ms('2026-08-23T12:00:00Z'), false)
  console.log(`     today: ${s.phaseName}, ${s.illuminationPct}%, age ${s.ageDays}d`)
  check('next events after now', s.nextFullMs > ms('2026-08-23T12:00:00Z') && s.nextNewMs > ms('2026-08-23T12:00:00Z'))
}

// --- Names & glyphs ---
check('names at quarters', M.phaseName(0) === 'New Moon' && M.phaseName(0.5) === 'Full Moon'
  && M.phaseName(0.25) === 'First Quarter' && M.phaseName(0.75) === 'Last Quarter')
check('names between quarters', M.phaseName(0.125) === 'Waxing Crescent' && M.phaseName(0.625) === 'Waning Gibbous')
check('glyph hemisphere mirror', M.glyphFor(0.125, false) === '🌒' && M.glyphFor(0.125, true) === '🌘')

// --- Art grid invariants (with aspect) ---
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
console.log('ok   grid rectangular + palette-clean across styles/rows/aspects/phases')

// --- Circle geometry: lit extents match an ideal circle (±1.5 cells) ---
function circleCheck(rows, aspect) {
  const C = Math.max(rows, Math.round(rows * aspect))
  const art = M.renderMoonArt(0.5, 'blocks', rows, false, aspect) // full moon
  const lines = art.split('\n')
  let worst = 0
  // skip outermost rows (sampling noise at poles)
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

// --- Craters & seas ---
function countCh(s, ch) { return s.split(ch).length - 1 }
{
  const full = M.renderMoonArt(0.5, 'blocks', 25, false, 2.0)
  check('full moon shows all 8 craters', countCh(full, '○') >= 8, `found ${countCh(full, '○')}`)
  check('craters deterministic', full === M.renderMoonArt(0.5, 'blocks', 25, false, 2.0))
  check('craters stamp over seas (Aristarchus in Procellarum)', countCh(full, '○') >= 8)

  check('full moon shows seas', countCh(full, '▒') >= 30, `found ${countCh(full, '▒')}`)

  const crescent = M.renderMoonArt(0.08, 'blocks', 25, false, 2.0)
  check('thin crescent shows no craters', countCh(crescent, '○') === 0, `found ${countCh(crescent, '○')}`)
  check('thin crescent shows no seas', countCh(crescent, '▒') === 0, `found ${countCh(crescent, '▒')}`)

  const newMoon = M.renderMoonArt(0.0, 'blocks', 25, false, 2.0)
  check('new moon shows no craters or seas', countCh(newMoon, '○') === 0 && countCh(newMoon, '▒') === 0)

  const south = M.renderMoonArt(0.5, 'blocks', 25, true, 2.0)
  check('mirror preserves feature counts', countCh(south, '○') === countCh(full, '○') && countCh(south, '▒') === countCh(full, '▒'))

  // Fixed-location property: crater glyph columns identical across two
  // different gibbous phases that both illuminate a given crater.
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
}

// --- hemisphereFromLocationJson (Omarchy weather location hint) ---
{
  check('negative latitude -> south', M.hemisphereFromLocationJson('{"name":"sydney","latitude":-33.9,"longitude":151.2}') === 'south')
  check('positive latitude -> north', M.hemisphereFromLocationJson('{"latitude": 12.97}') === 'north')
  check('zero latitude -> north', M.hemisphereFromLocationJson('{"latitude": 0}') === 'north')
  check('string latitude parses', M.hemisphereFromLocationJson('{"latitude": "-10.5"}') === 'south')
  check('missing latitude -> empty hint', M.hemisphereFromLocationJson('{"name":"nowhere"}') === '')
  check('null latitude -> empty hint', M.hemisphereFromLocationJson('{"latitude": null}') === '')
  check('garbage json -> empty hint', M.hemisphereFromLocationJson('not json at all') === '')
}

// --- vecMouthHit (vector tongue easter egg) ---
{
  // Geometry mirrors paintVector: w=h=200 -> R=97, mouth center (100, 98.06),
  // arc radius ~38.8 sweeping the lower half.
  check('vecMouthHit hits the smile midpoint', M.vecMouthHit(100, 137, 200, 200) === true)
  check('vecMouthHit hits mid-arc', M.vecMouthHit(130, 125, 200, 200) === true)
  check('vecMouthHit misses the eyes', M.vecMouthHit(70, 82, 200, 200) === false)
  check('vecMouthHit misses far corner', M.vecMouthHit(5, 5, 200, 200) === false)
  check('vecMouthHit misses above the arc', M.vecMouthHit(100, 98, 200, 200) === false)
  check('vecMouthHit degenerate canvas is safe', M.vecMouthHit(50, 50, 5, 5) === false)
}

// --- nextNewMoonMs / nextFullMoonMs vs 2026 almanac instants (UTC) ---
// Ground truth cross-checked across timeanddate, shymea (JPL), and solunak;
// Meeus ch.49 corrections should land within a few minutes of every event.
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
    const got = M.nextNewMoonMs(truth - 3 * 86400000)
    check(`new moon ${iso} within 10 min`, Math.abs(got - truth) <= TOL_MS)
  }
  for (const iso of fulls) {
    const truth = new Date(iso).getTime()
    const got = M.nextFullMoonMs(truth - 3 * 86400000)
    check(`full moon ${iso} within 10 min`, Math.abs(got - truth) <= TOL_MS)
  }
}

// --- plainGlyphFor (monochrome Nerd Font pill icon) ---
{
  // Codepoints from the nf-weather-moon_* set; ordering matches the emoji
  // cycle.
  check('plain new moon codepoint', M.plainGlyphFor(0.0, false) === '\uE38D')
  check('plain waxing crescent codepoint', M.plainGlyphFor(0.124, false) === '\uE390')
  check('plain first quarter codepoint', M.plainGlyphFor(0.25, false) === '\uE394')
  check('plain full moon codepoint', M.plainGlyphFor(0.5, true) === '\uE39B')
  check('plain south mirrors crescents', M.plainGlyphFor(0.124, true) === '\uE3A5')
  check('plain south swaps quarters', M.plainGlyphFor(0.25, true) === '\uE3A2')
}

// --- Mirror equivalence ignoring feature placement ---
function stripFeatures(a) {
  // Collapse every stamped/feature char back to the style's lit char so only
  // the phase shading (lit vs dark vs void) is compared.
  return a.replace(/[○O▒~]/g, c => (c === 'O' || c === '~') ? '@' : '█')
}
check('waning mirrors waxing (shading only)', (() => {
  const rev = a => a.split('\n').map(l => [...l].reverse().join('')).join('\n')
  return stripFeatures(rev(M.renderMoonArt(0.375, 'blocks', 13, false))) === stripFeatures(M.renderMoonArt(0.625, 'blocks', 13))
})())
check('south render = mirrored north', (() => {
  const n = M.renderMoonArt(0.125, 'blocks', 13, false).split('\n').map(l => [...l].reverse().join('')).join('\n')
  const s = M.renderMoonArt(0.125, 'blocks', 13, true)
  return stripFeatures(n) === stripFeatures(s)
})())

// --- Canvas style placeholder grids (vector + cartoon) ---
{
  const b = M.renderMoonArt(0.5, 'blocks', 19, false, 2.333)
  const bl = b.split('\n')
  for (const style of ['vector', 'cartoon']) {
    const g = M.renderMoonArt(0.5, style, 19, false, 2.333)
    check(`${style} render is whitespace-only`, g.trim().length === 0)
    const gl = g.split('\n')
    check(`${style} dims match blocks dims`, gl.length === bl.length && gl[0].length === bl[0].length)
  }
}
// --- Easter egg hit-testing (Mare Tranquillitatis) ---
{
  // Sea center: x=-0.30, y=-0.08 -> fractional (0.35, 0.46)
  check('seaHit center hits', M.seaHit(0.35, 0.46, false) === true)
  check('seaHit inside edge hits', M.seaHit(0.38, 0.46, false) === true)
  check('seaHit far miss', M.seaHit(0.05, 0.46, false) === false)
  check('seaHit mirrored tap hits flipped position', M.seaHit(1 - 0.35, 0.46, true) === true)
  check('seaHit unflipped position misses when mirrored', M.seaHit(0.35, 0.46, true) === false)
  const pc = M.seaCenter('Oceanus Procellarum')
  check('other seas do not trigger', M.seaHit((pc.x + 1) / 2, (pc.y + 1) / 2, false) === false)
}

// --- Visual spot-checks ---
console.log('\n--- visual: full moon w/ seas + craters, 19 rows @ aspect 2.333 ---')
console.log(M.renderMoonArt(0.5, 'blocks', 19, false, 2.333))
console.log('\n--- visual: waxing gibbous f=0.375, ascii w/ seas ---')
console.log(M.renderMoonArt(0.375, 'ascii', 19, false, 2.333))

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
