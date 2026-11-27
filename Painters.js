// Canvas painters for salmun-nister.luna: "vector", "cartoon" (rubber-hose),
// and the "clay" eclipse shadow overlay. Pure Context2D helpers taking colors
// and precomputed umbra geometry in `opts` so Panel.qml stays focused on UI
// state and layout.

function rgba(c, a) {
  return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255)
      + "," + Math.round(c.b * 255) + "," + a + ")"
}

function darken(c, factor) {
  return {
    r: Math.max(0, Math.min(1, c.r / factor)),
    g: Math.max(0, Math.min(1, c.g / factor)),
    b: Math.max(0, Math.min(1, c.b / factor))
  }
}

function mix(a, b, t) {
  return {
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t
  }
}

// Shared phase-region path: the area between the lit limb and the terminator.
// x_b = cx + dir*t*R*cos(a) is continuous across crescent (t>0), quarter (t=0)
// and gibbous/full (t<0).
function regionPath(ctx, w, h, dir, t) {
  var cx = w / 2
  var cy = h / 2
  var R = Math.min(w, h) / 2 * 0.97
  ctx.beginPath()
  var N = 48
  for (var i = 0; i <= N; i++) {
    var ang = -Math.PI / 2 + Math.PI * i / N
    var x = cx + dir * R * Math.cos(ang)
    var y = cy + R * Math.sin(ang)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (var j = N; j >= 0; j--) {
    var a2 = -Math.PI / 2 + Math.PI * j / N
    ctx.lineTo(cx + dir * t * R * Math.cos(a2), cy + R * Math.sin(a2))
  }
  ctx.closePath()
}

// Friendly yellow cartoon moon (purely artistic; fixed palette & orientation).
function paintVector(ctx, w, h, opts) {
  if (w < 10 || h < 10) return
  var cx = w / 2
  var cy = h / 2
  var R = Math.min(w, h) / 2 * 0.97

  // Warm illustrative palette; the only non-theme colors in the plugin,
  // confined to this character illustration.
  var LIT = "#F7D96C"
  var DARK = "#C9A94F"
  var INK = "#5B4423"
  var RIM = "rgba(122,92,32,0.4)"

  var f = opts.fraction
  var t = Math.cos(2 * Math.PI * f)
  var dir = f < 0.5 ? 1 : -1

  // Dark base disc, then the lit region on top.
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, 2 * Math.PI)
  ctx.fillStyle = DARK
  ctx.fill()

  regionPath(ctx, w, h, dir, t)
  ctx.fillStyle = LIT
  ctx.fill()

  // A few soft craters, clipped to the lit area.
  ctx.save()
  regionPath(ctx, w, h, dir, t)
  ctx.clip()
  ctx.fillStyle = "rgba(90,68,35,0.16)"
  var craters = [
    [-0.42, -0.34, 0.10], [0.30, 0.42, 0.08], [0.52, -0.12, 0.06],
    [-0.15, 0.55, 0.05], [0.62, 0.28, 0.05]
  ]
  for (var c = 0; c < craters.length; c++) {
    ctx.beginPath()
    ctx.arc(cx + craters[c][0] * R, cy + craters[c][1] * R, craters[c][2] * R, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.restore()

  // Eclipse: wash the whole disk toward blood red with depth, then darken
  // the umbra core with a soft radial gradient. Drawn before the face so
  // the character stays readable.
  if (opts.eclipse && opts.eclipse.depth > 0 && opts.umbra) {
    var ecl = opts.eclipse
    var ufV = opts.umbra
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, 2 * Math.PI)
    ctx.clip()
    ctx.fillStyle = "rgba(186,62,48," + Math.min(1, ecl.depth * 0.72) + ")"
    ctx.fillRect(0, 0, w, h)
    var RUv = ufV.r * R
    var oxV = ufV.ox * R
    var oyV = ufV.oy * R
    var coreA = 0.55 * Math.min(1, ecl.depth)
    var gv = ctx.createRadialGradient(cx + oxV, cy + oyV, R * 0.1, cx + oxV, cy + oyV, RUv)
    gv.addColorStop(0, "rgba(52,8,8," + coreA + ")")
    gv.addColorStop(0.7, "rgba(52,8,8," + coreA * 0.8 + ")")
    gv.addColorStop(1, "rgba(52,8,8,0)")
    ctx.fillStyle = gv
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // Face: dot eyes (right one winks into a closed lid) and a smile.
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  var eyeR = Math.max(1.5, R * 0.075)
  var eyeY = cy - R * 0.16
  var eyeDX = R * 0.30

  ctx.beginPath()
  ctx.arc(cx - eyeDX, eyeY, eyeR, 0, 2 * Math.PI)
  ctx.fill()

  if (opts.wink) {
    ctx.lineWidth = Math.max(1.5, R * 0.045)
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.arc(cx + eyeDX, eyeY - eyeR * 0.6, eyeR * 1.5, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx + eyeDX, eyeY, eyeR, 0, 2 * Math.PI)
    ctx.fill()
  }

  ctx.lineWidth = Math.max(2, R * 0.055)
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.arc(cx, cy - R * 0.02, R * 0.40, Math.PI * 0.18, Math.PI * 0.82)
  ctx.stroke()

  // Cheeky tongue hanging from the middle of the smile.
  if (opts.tongueOut) {
    var myc = cy - R * 0.02
    var tx = cx
    var ty = myc + R * 0.38
    ctx.fillStyle = "#D64545"
    ctx.beginPath()
    ctx.moveTo(tx - R * 0.15, ty)
    ctx.quadraticCurveTo(tx - R * 0.17, ty + R * 0.28, tx, ty + R * 0.33)
    ctx.quadraticCurveTo(tx + R * 0.17, ty + R * 0.28, tx + R * 0.15, ty)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = "rgba(122,32,32,0.55)"
    ctx.lineWidth = Math.max(1, R * 0.03)
    ctx.beginPath()
    ctx.moveTo(tx, ty + R * 0.07)
    ctx.lineTo(tx, ty + R * 0.24)
    ctx.stroke()
  }

  // Soft rim.
  ctx.lineWidth = Math.max(1, R * 0.03)
  ctx.strokeStyle = RIM
  ctx.beginPath()
  ctx.arc(cx, cy, R - ctx.lineWidth / 2, 0, 2 * Math.PI)
  ctx.stroke()
}

// ---- Rubber-hose cartoon moon helpers (Qt Context2D-safe) ----
// Rotated ellipses and character parts are built with explicit point
// transforms rather than ctx.rotate/scale: Qt's Context2D replays stored
// path data through the matrix active at draw time.

function hoseOvalPath(ctx, x, y, rx, ry, rot) {
  ctx.beginPath()
  var N = 40
  var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0)
  for (var i = 0; i <= N; i++) {
    var a = 2 * Math.PI * i / N
    var ex = rx * Math.cos(a), ey = ry * Math.sin(a)
    var px = x + ex * cr - ey * sr
    var py = y + ex * sr + ey * cr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function hosePhasePath(ctx, cx, cy, R, dir, t) {
  ctx.beginPath()
  var N = 48
  for (var i = 0; i <= N; i++) {
    var ang = -Math.PI / 2 + Math.PI * i / N
    var x = cx + dir * R * Math.cos(ang)
    var y = cy + R * Math.sin(ang)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  for (var j = N; j >= 0; j--) {
    var a2 = -Math.PI / 2 + Math.PI * j / N
    ctx.lineTo(cx + dir * t * R * Math.cos(a2), cy + R * Math.sin(a2))
  }
  ctx.closePath()
}

function hoseDiscPath(ctx, cx, cy, R) {
  ctx.beginPath()
  var N = 72
  for (var i = 0; i <= N; i++) {
    var a = 2 * Math.PI * i / N
    var rr = R * (1 + 0.008 * Math.sin(3 * a + 0.9) + 0.004 * Math.cos(5 * a - 0.4))
    var x = cx + rr * Math.cos(a)
    var y = cy + rr * Math.sin(a)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function makeHoseXform(ox, oy, scale, rot, flipX) {
  var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0)
  var fx = flipX ? -1 : 1
  return function(lx, ly) {
    var sx = lx * scale * fx
    var sy = ly * scale
    return [ox + sx * cr - sy * sr, oy + sx * sr + sy * cr]
  }
}

function strokeHoseLimb(ctx, hoseW, inkW, inkCss, isLight, rimCss, pathFn) {
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  if (!isLight) {
    ctx.strokeStyle = rimCss || "rgba(242, 228, 210, 0.44)"
    ctx.lineWidth = hoseW + inkW * 1.45
    pathFn()
    ctx.stroke()
  }
  ctx.strokeStyle = inkCss
  ctx.lineWidth = hoseW
  pathFn()
  ctx.stroke()
}

function drawHosePieEye(ctx, cx, cy, rx, ry, rot, wedgeCenter, wedgeSpread, inkCss) {
  var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0)
  function pt(ex, ey) {
    return [cx + ex * cr - ey * sr, cy + ex * sr + ey * cr]
  }
  var apex = pt(rx * 0.06 * Math.cos(wedgeCenter), ry * 0.06 * Math.sin(wedgeCenter))
  var startA = wedgeCenter + wedgeSpread / 2
  var endA = wedgeCenter + 2 * Math.PI - wedgeSpread / 2
  var N = 36
  ctx.beginPath()
  ctx.moveTo(apex[0], apex[1])
  for (var i = 0; i <= N; i++) {
    var a = startA + (endA - startA) * (i / N)
    var p = pt(rx * Math.cos(a), ry * Math.sin(a))
    ctx.lineTo(p[0], p[1])
  }
  ctx.closePath()
  ctx.fillStyle = inkCss
  ctx.fill()
}

function drawHoseStarEye(ctx, cx, cy, r, inkCss, highlightCss) {
  ctx.beginPath()
  for (var i = 0; i < 8; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 4
    var rr = (i % 2 === 0) ? r : r * 0.35
    var x = cx + rr * Math.cos(a)
    var y = cy + rr * Math.sin(a)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = inkCss
  ctx.fill()
  if (highlightCss) {
    ctx.beginPath()
    ctx.arc(cx - r * 0.14, cy - r * 0.14, Math.max(1.2, r * 0.16), 0, 2 * Math.PI)
    ctx.fillStyle = highlightCss
    ctx.fill()
  }
}

function drawHoseWink(ctx, cx, cy, rx, ry, inkCss, lineW) {
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(cx - rx * 1.15, cy + ry * 0.14)
  ctx.quadraticCurveTo(cx, cy - ry * 0.72, cx + rx * 1.15, cy + ry * 0.16)
  ctx.stroke()
}

function drawHoseBrows(ctx, cx, cy, R, lift, winkRight, inkCss, lineW, tilt) {
  var P = makeHoseXform(cx, cy, R, tilt || 0, false)
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineCap = "round"

  var l0 = P(-0.34, -0.50 + lift), lc = P(-0.20, -0.60 + lift), l1 = P(-0.07, -0.54 + lift)
  ctx.beginPath()
  ctx.moveTo(l0[0], l0[1])
  ctx.quadraticCurveTo(lc[0], lc[1], l1[0], l1[1])
  ctx.stroke()

  var rLift = winkRight ? (lift + 0.08) : lift
  var r0 = P(0.07, -0.54 + rLift), rc = P(0.20, -0.60 + rLift), r1 = P(0.34, -0.50 + rLift)
  ctx.beginPath()
  ctx.moveTo(r0[0], r0[1])
  ctx.quadraticCurveTo(rc[0], rc[1], r1[0], r1[1])
  ctx.stroke()
}

function drawHoseNose(ctx, cx, cy, rx, ry, rot, fillCss, inkCss, shineCss, lineW) {
  hoseOvalPath(ctx, cx, cy, rx, ry, rot)
  ctx.fillStyle = fillCss
  ctx.fill()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.stroke()
  if (shineCss) {
    hoseOvalPath(ctx, cx - rx * 0.28, cy - ry * 0.25, rx * 0.26, ry * 0.22, rot)
    ctx.fillStyle = shineCss
    ctx.fill()
  }
}

function drawHoseDimpleSmile(ctx, P, yOff, widthScale, inkCss, lineW) {
  var w = widthScale || 1
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineCap = "round"
  var s0 = P(-0.36 * w, 0.06 + yOff)
  var sc = P(0.0, 0.34 + yOff)
  var s1 = P(0.36 * w, 0.06 + yOff)
  ctx.beginPath()
  ctx.moveTo(s0[0], s0[1])
  ctx.quadraticCurveTo(sc[0], sc[1], s1[0], s1[1])
  ctx.stroke()

  var ld0 = P(-0.42 * w, 0.02 + yOff), ldc = P(-0.34 * w, 0.04 + yOff), ld1 = P(-0.32 * w, 0.13 + yOff)
  ctx.beginPath(); ctx.moveTo(ld0[0], ld0[1]); ctx.quadraticCurveTo(ldc[0], ldc[1], ld1[0], ld1[1]); ctx.stroke()
  var rd0 = P(0.42 * w, 0.02 + yOff), rdc = P(0.34 * w, 0.04 + yOff), rd1 = P(0.32 * w, 0.13 + yOff)
  ctx.beginPath(); ctx.moveTo(rd0[0], rd0[1]); ctx.quadraticCurveTo(rdc[0], rdc[1], rd1[0], rd1[1]); ctx.stroke()
}

function drawHoseOpenLaugh(ctx, P, yOff, scale, inkCss, cavityCss, tongueCss, lineW) {
  var s = scale || 1
  function mouthShape() {
    var m0 = P(-0.38 * s, 0.08 + yOff)
    var topC = P(0.0, 0.19 + yOff)
    var m1 = P(0.38 * s, 0.08 + yOff)
    var botC1 = P(0.30 * s, 0.50 * s + yOff)
    var botC2 = P(-0.30 * s, 0.50 * s + yOff)
    ctx.beginPath()
    ctx.moveTo(m0[0], m0[1])
    ctx.quadraticCurveTo(topC[0], topC[1], m1[0], m1[1])
    ctx.bezierCurveTo(botC1[0], botC1[1], botC2[0], botC2[1], m0[0], m0[1])
    ctx.closePath()
  }
  mouthShape()
  ctx.fillStyle = cavityCss
  ctx.fill()

  ctx.save()
  mouthShape()
  ctx.clip()
  var t0 = P(-0.27 * s, 0.42 * s + yOff)
  var tl = P(-0.13 * s, 0.19 * s + yOff)
  var tm = P(0.0, 0.29 * s + yOff)
  var tr = P(0.13 * s, 0.19 * s + yOff)
  var t1 = P(0.27 * s, 0.42 * s + yOff)
  var tb = P(0.0, 0.56 * s + yOff)
  ctx.beginPath()
  ctx.moveTo(t0[0], t0[1])
  ctx.quadraticCurveTo(tl[0], tl[1], tm[0], tm[1])
  ctx.quadraticCurveTo(tr[0], tr[1], t1[0], t1[1])
  ctx.quadraticCurveTo(tb[0], tb[1], t0[0], t0[1])
  ctx.closePath()
  ctx.fillStyle = tongueCss
  ctx.fill()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = Math.max(1, lineW * 0.72)
  ctx.stroke()
  ctx.restore()

  mouthShape()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineJoin = "round"
  ctx.stroke()

  ctx.lineCap = "round"
  var ld0 = P(-0.44 * s, 0.04 + yOff), ldc = P(-0.37 * s, 0.06 + yOff), ld1 = P(-0.35 * s, 0.14 + yOff)
  ctx.beginPath(); ctx.moveTo(ld0[0], ld0[1]); ctx.quadraticCurveTo(ldc[0], ldc[1], ld1[0], ld1[1]); ctx.stroke()
  var rd0 = P(0.44 * s, 0.04 + yOff), rdc = P(0.37 * s, 0.06 + yOff), rd1 = P(0.35 * s, 0.14 + yOff)
  ctx.beginPath(); ctx.moveTo(rd0[0], rd0[1]); ctx.quadraticCurveTo(rdc[0], rdc[1], rd1[0], rd1[1]); ctx.stroke()
}

function drawHoseToothyGrin(ctx, P, yOff, s, inkCss, teethCss, lineW) {
  function grinPath() {
    var m0 = P(-0.43 * s, 0.06 + yOff)
    var topC = P(0.0, 0.21 + yOff)
    var m1 = P(0.43 * s, 0.06 + yOff)
    var botC1 = P(0.33 * s, 0.50 * s + yOff)
    var botC2 = P(-0.33 * s, 0.50 * s + yOff)
    ctx.beginPath()
    ctx.moveTo(m0[0], m0[1])
    ctx.quadraticCurveTo(topC[0], topC[1], m1[0], m1[1])
    ctx.bezierCurveTo(botC1[0], botC1[1], botC2[0], botC2[1], m0[0], m0[1])
    ctx.closePath()
  }
  grinPath()
  ctx.fillStyle = teethCss
  ctx.fill()

  ctx.save()
  grinPath()
  ctx.clip()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = Math.max(1, lineW * 0.65)
  var xs = [-0.23, -0.075, 0.075, 0.23]
  for (var i = 0; i < xs.length; i++) {
    var a = P(xs[i] * s, 0.06 + yOff)
    var b = P(xs[i] * s * 0.88, 0.48 * s + yOff)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.restore()

  grinPath()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineJoin = "round"
  ctx.stroke()

  ctx.lineCap = "round"
  var ld0 = P(-0.49 * s, 0.01 + yOff), ldc = P(-0.42 * s, 0.04 + yOff), ld1 = P(-0.40 * s, 0.12 + yOff)
  ctx.beginPath(); ctx.moveTo(ld0[0], ld0[1]); ctx.quadraticCurveTo(ldc[0], ldc[1], ld1[0], ld1[1]); ctx.stroke()
  var rd0 = P(0.49 * s, 0.01 + yOff), rdc = P(0.42 * s, 0.04 + yOff), rd1 = P(0.40 * s, 0.12 + yOff)
  ctx.beginPath(); ctx.moveTo(rd0[0], rd0[1]); ctx.quadraticCurveTo(rdc[0], rdc[1], rd1[0], rd1[1]); ctx.stroke()
}

function drawHoseWhistleMouth(ctx, cx, cy, R, tilt, faceRight, mx, my, scale, bodyCss, inkCss, lineW) {
  var P = makeHoseXform(cx, cy, R, tilt, faceRight)
  var s = scale || 1
  var a0 = P(mx + 0.08 * s, my - 0.11 * s)
  var c1 = P(mx - 0.11 * s, my - 0.16 * s), c2 = P(mx - 0.15 * s, my - 0.02 * s), a1 = P(mx - 0.08 * s, my + 0.01 * s)
  var c3 = P(mx - 0.18 * s, my + 0.06 * s), c4 = P(mx - 0.11 * s, my + 0.19 * s), a2 = P(mx + 0.08 * s, my + 0.12 * s)
  var backC = P(mx + 0.14 * s, my + 0.01 * s)
  ctx.beginPath()
  ctx.moveTo(a0[0], a0[1])
  ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], a1[0], a1[1])
  ctx.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], a2[0], a2[1])
  ctx.quadraticCurveTo(backC[0], backC[1], a0[0], a0[1])
  ctx.closePath()
  ctx.fillStyle = bodyCss
  ctx.fill()
  ctx.strokeStyle = inkCss
  ctx.lineWidth = lineW
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  ctx.stroke()

  var h = P(mx - 0.05 * s, my + 0.02 * s)
  var rdx = a0[0] - a2[0], rdy = a0[1] - a2[1]
  var refSpan = Math.sqrt(rdx * rdx + rdy * rdy)
  hoseOvalPath(ctx, h[0], h[1], refSpan * 0.15, refSpan * 0.24, faceRight ? -0.12 : 0.12)
  ctx.fillStyle = inkCss
  ctx.fill()
}

function drawHoseMusicNote(ctx, x, y, size, rot, color, doubleNote) {
  var P = makeHoseXform(x, y, size, rot || 0, false)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  if (!doubleNote) {
    var h = P(0, 0)
    hoseOvalPath(ctx, h[0], h[1], size * 0.34, size * 0.24, (rot || 0) - 0.32)
    ctx.fill()
    var s0 = P(0.28, -0.04), s1 = P(0.28, -1.22), f1 = P(0.88, -0.94), f2 = P(0.70, -0.46)
    ctx.lineWidth = Math.max(1.5, size * 0.18)
    ctx.beginPath()
    ctx.moveTo(s0[0], s0[1])
    ctx.lineTo(s1[0], s1[1])
    ctx.quadraticCurveTo(f1[0], f1[1], f2[0], f2[1])
    ctx.stroke()
  } else {
    var h1 = P(-0.45, 0.12), h2 = P(0.45, -0.06)
    hoseOvalPath(ctx, h1[0], h1[1], size * 0.30, size * 0.21, (rot || 0) - 0.3)
    ctx.fill()
    hoseOvalPath(ctx, h2[0], h2[1], size * 0.30, size * 0.21, (rot || 0) - 0.3)
    ctx.fill()
    var a0 = P(-0.20, 0.08), a1 = P(-0.20, -1.04)
    var b0 = P(0.70, -0.10), b1 = P(0.70, -1.20)
    ctx.lineWidth = Math.max(1.5, size * 0.16)
    ctx.beginPath()
    ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1])
    ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1])
    ctx.stroke()
    ctx.lineWidth = Math.max(2, size * 0.26)
    ctx.beginPath()
    ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1])
    ctx.stroke()
  }
}

function drawHoseGlove(ctx, x, y, scale, rot, flipX, pose, inkCss, gloveCss, lineW) {
  var P = makeHoseXform(x, y, scale, rot, flipX)
  ctx.lineJoin = "round"
  ctx.lineCap = "round"

  function drawCapsule(x1, y1, x2, y2, r, fillOnly, strokeOnly) {
    var a = P(x1, y1), b = P(x2, y2)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    if (strokeOnly) {
      ctx.strokeStyle = inkCss
      ctx.lineWidth = r * 2 * scale + lineW * 2
      ctx.stroke()
    }
    if (fillOnly) {
      ctx.strokeStyle = gloveCss
      ctx.lineWidth = r * 2 * scale
      ctx.stroke()
    }
  }

  if (pose === "open") {
    var fingers = [
      [0.24, -0.16, 0.42, -0.66, 0.165],
      [0.36, -0.18, 0.92, -0.34, 0.155],
      [0.42,  0.02, 1.00,  0.02, 0.160],
      [0.34,  0.22, 0.84,  0.34, 0.148]
    ]
    for (var i = 0; i < fingers.length; i++) {
      drawCapsule(fingers[i][0], fingers[i][1], fingers[i][2], fingers[i][3], fingers[i][4], false, true)
    }
    var palmC = P(0.28, 0.04)
    hoseOvalPath(ctx, palmC[0], palmC[1], scale * 0.42 + lineW, scale * 0.40 + lineW, rot)
    ctx.fillStyle = inkCss; ctx.fill()

    for (var j = 0; j < fingers.length; j++) {
      drawCapsule(fingers[j][0], fingers[j][1], fingers[j][2], fingers[j][3], fingers[j][4], true, false)
    }
    hoseOvalPath(ctx, palmC[0], palmC[1], scale * 0.42, scale * 0.40, rot)
    ctx.fillStyle = gloveCss; ctx.fill()

    ctx.strokeStyle = inkCss
    ctx.lineWidth = Math.max(1.0, lineW * 0.72)
    var w1a = P(0.56, -0.16), w1b = P(0.68, -0.18)
    var w2a = P(0.56,  0.14), w2b = P(0.68,  0.16)
    ctx.beginPath()
    ctx.moveTo(w1a[0], w1a[1]); ctx.lineTo(w1b[0], w1b[1])
    ctx.moveTo(w2a[0], w2a[1]); ctx.lineTo(w2b[0], w2b[1])
    ctx.stroke()
  } else {
    var knuckles = [
      [0.24, -0.26, 0.64, -0.24, 0.19],
      [0.28,  0.00, 0.70,  0.02, 0.19],
      [0.22,  0.24, 0.60,  0.25, 0.18],
      [0.08, -0.30, 0.36, -0.44, 0.16]
    ]
    for (var a = 0; a < knuckles.length; a++) {
      drawCapsule(knuckles[a][0], knuckles[a][1], knuckles[a][2], knuckles[a][3], knuckles[a][4], false, true)
    }
    var fc = P(0.24, 0.00)
    hoseOvalPath(ctx, fc[0], fc[1], scale * 0.42 + lineW, scale * 0.42 + lineW, rot)
    ctx.fillStyle = inkCss; ctx.fill()

    for (var b = 0; b < knuckles.length; b++) {
      drawCapsule(knuckles[b][0], knuckles[b][1], knuckles[b][2], knuckles[b][3], knuckles[b][4], true, false)
    }
    hoseOvalPath(ctx, fc[0], fc[1], scale * 0.42, scale * 0.42, rot)
    ctx.fillStyle = gloveCss; ctx.fill()

    ctx.strokeStyle = inkCss
    ctx.lineWidth = Math.max(1.1, lineW * 0.78)
    var k1a = P(0.56, -0.11), k1b = P(0.76, -0.10)
    var k2a = P(0.56,  0.14), k2b = P(0.75,  0.14)
    var th0 = P(0.18, -0.22), thc = P(0.42, -0.22), th1 = P(0.48, -0.40)
    ctx.beginPath()
    ctx.moveTo(k1a[0], k1a[1]); ctx.lineTo(k1b[0], k1b[1])
    ctx.moveTo(k2a[0], k2a[1]); ctx.lineTo(k2b[0], k2b[1])
    ctx.moveTo(th0[0], th0[1]); ctx.quadraticCurveTo(thc[0], thc[1], th1[0], th1[1])
    ctx.stroke()
  }

  var c0 = P(-0.18, -0.34), c1 = P(-0.02, -0.36), c2 = P(-0.02, 0.36), c3 = P(-0.18, 0.34)
  var ct = P(-0.09, -0.42), crp = P(0.06, 0), cb = P(-0.09, 0.42), clp = P(-0.27, 0)
  ctx.beginPath()
  ctx.moveTo(c0[0], c0[1])
  ctx.quadraticCurveTo(ct[0], ct[1], c1[0], c1[1])
  ctx.quadraticCurveTo(crp[0], crp[1], c2[0], c2[1])
  ctx.quadraticCurveTo(cb[0], cb[1], c3[0], c3[1])
  ctx.quadraticCurveTo(clp[0], clp[1], c0[0], c0[1])
  ctx.closePath()
  ctx.fillStyle = gloveCss; ctx.fill()
  ctx.strokeStyle = inkCss; ctx.lineWidth = lineW; ctx.stroke()

  ctx.strokeStyle = inkCss
  ctx.lineWidth = Math.max(1.1, lineW * 0.72)
  for (var d = -1; d <= 1; d++) {
    var dy = d * 0.145
    var d0 = P(0.14, dy), d1 = P(0.32, dy + d * 0.01)
    ctx.beginPath()
    ctx.moveTo(d0[0], d0[1])
    ctx.lineTo(d1[0], d1[1])
    ctx.stroke()
  }
}

function drawHoseBoot(ctx, ax, ay, scale, dir, rot, inkCss, bootCss, soleCss, lineW, showUndersole) {
  var P = makeHoseXform(ax, ay, scale, rot || 0, dir < 0)
  ctx.lineWidth = lineW
  ctx.lineJoin = "round"
  ctx.lineCap = "round"

  if (showUndersole) {
    var b0 = P(-0.28, -0.04)
    var b1 = P(-0.34, 0.46), b2 = P(0.36, 0.64), b3 = P(0.76, 0.34)
    var b4 = P(0.86, 0.02), b5 = P(0.46, -0.10), b6 = P(0.24, -0.06)
    ctx.beginPath()
    ctx.moveTo(b0[0], b0[1])
    ctx.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], b3[0], b3[1])
    ctx.bezierCurveTo(b4[0], b4[1], b5[0], b5[1], b6[0], b6[1])
    ctx.closePath()
    ctx.fillStyle = bootCss; ctx.fill()
    ctx.strokeStyle = inkCss; ctx.stroke()

    var sc = P(0.16, 0.44)
    hoseOvalPath(ctx, sc[0], sc[1], scale * 0.56, scale * 0.24, (rot || 0) + (dir < 0 ? -0.22 : 0.22))
    ctx.fillStyle = soleCss; ctx.fill()
    ctx.strokeStyle = inkCss; ctx.stroke()
    return
  }

  var s0 = P(-0.34, 0.48), s1 = P(0.86, 0.48), s2 = P(0.86, 0.66), s3 = P(-0.34, 0.66)
  var sr = P(0.92, 0.58), sl = P(-0.40, 0.58)
  ctx.beginPath()
  ctx.moveTo(s0[0], s0[1])
  ctx.lineTo(s1[0], s1[1])
  ctx.quadraticCurveTo(sr[0], sr[1], s2[0], s2[1])
  ctx.lineTo(s3[0], s3[1])
  ctx.quadraticCurveTo(sl[0], sl[1], s0[0], s0[1])
  ctx.closePath()
  ctx.fillStyle = soleCss; ctx.fill()
  ctx.strokeStyle = inkCss; ctx.stroke()

  var u0 = P(-0.24, -0.06)
  var u1 = P(-0.36, 0.16), u2 = P(-0.36, 0.48), u3 = P(-0.30, 0.50)
  var u4 = P(0.82, 0.50)
  var u5 = P(0.96, 0.48), u6 = P(0.94, 0.06), u7 = P(0.42, 0.04)
  var u8 = P(0.28, 0.02), u9 = P(0.24, -0.06)
  ctx.beginPath()
  ctx.moveTo(u0[0], u0[1])
  ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], u3[0], u3[1])
  ctx.lineTo(u4[0], u4[1])
  ctx.bezierCurveTo(u5[0], u5[1], u6[0], u6[1], u7[0], u7[1])
  ctx.quadraticCurveTo(u8[0], u8[1], u9[0], u9[1])
  ctx.closePath()
  ctx.fillStyle = bootCss; ctx.fill()
  ctx.strokeStyle = inkCss; ctx.stroke()

  var c0 = P(-0.26, -0.06), cc = P(0.0, 0.08), c1 = P(0.26, -0.06)
  ctx.beginPath()
  ctx.moveTo(c0[0], c0[1])
  ctx.quadraticCurveTo(cc[0], cc[1], c1[0], c1[1])
  ctx.stroke()

  var sh0 = P(0.42, 0.16), shc = P(0.60, 0.15), sh1 = P(0.70, 0.24)
  ctx.strokeStyle = "rgba(255,255,255,0.40)"
  ctx.lineWidth = Math.max(1.2, lineW * 0.65)
  ctx.beginPath()
  ctx.moveTo(sh0[0], sh0[1])
  ctx.quadraticCurveTo(shc[0], shc[1], sh1[0], sh1[1])
  ctx.stroke()
}

function drawHoseSurface(ctx, cx, cy, R, dir, t, tilt, pal, lineW) {
  var P = makeHoseXform(cx, cy, R, tilt || 0, false)
  var spots = [
    [-0.78, -0.32, 0.15, 0.22, -0.35],
    [-0.58,  0.66, 0.18, 0.13,  0.42],
    [ 0.74, -0.44, 0.14, 0.20,  0.48],
    [ 0.72,  0.46, 0.19, 0.14, -0.45],
    [ 0.12,  0.86, 0.16, 0.09,  0.10],
    [-0.30, -0.84, 0.15, 0.09, -0.22],
    [ 0.36, -0.78, 0.10, 0.07,  0.30],
    [-0.68,  0.12, 0.08, 0.06, -0.20]
  ]
  ctx.save()
  hoseDiscPath(ctx, cx, cy, R)
  ctx.clip()

  ctx.fillStyle = pal.craterDark
  for (var i = 0; i < spots.length; i++) {
    var sp = spots[i], pt = P(sp[0], sp[1])
    hoseOvalPath(ctx, pt[0], pt[1], sp[2] * R, sp[3] * R, sp[4] + (tilt || 0))
    ctx.fill()
  }

  ctx.save()
  hosePhasePath(ctx, cx, cy, R * 1.02, dir, t)
  ctx.clip()
  ctx.fillStyle = pal.craterLit
  for (var j = 0; j < spots.length; j++) {
    var sl = spots[j], pl = P(sl[0], sl[1])
    hoseOvalPath(ctx, pl[0], pl[1], sl[2] * R, sl[3] * R, sl[4] + (tilt || 0))
    ctx.fill()
  }
  ctx.restore()

  var rings = [
    [ 0.83,  0.10, 0.068, 0.108,  0.16],
    [-0.84,  0.28, 0.052, 0.082, -0.24]
  ]
  for (var k = 0; k < rings.length; k++) {
    var rg = rings[k], pr = P(rg[0], rg[1])
    hoseOvalPath(ctx, pr[0], pr[1], rg[2] * R, rg[3] * R, rg[4] + (tilt || 0))
    ctx.fillStyle = pal.craterRingFill; ctx.fill()
    ctx.strokeStyle = pal.ink; ctx.lineWidth = Math.max(1, lineW * 0.56); ctx.stroke()
    hoseOvalPath(ctx, pr[0] + (rg[0] > 0 ? 1 : -1) * rg[2] * R * 0.14, pr[1],
        rg[2] * R * 0.42, rg[3] * R * 0.50, rg[4] + (tilt || 0))
    ctx.strokeStyle = pal.ink; ctx.lineWidth = Math.max(0.75, lineW * 0.38); ctx.stroke()
  }

  var freckles = [
    [-0.64, -0.24, 0.025], [-0.55, -0.32, 0.020], [-0.57, -0.17, 0.017],
    [ 0.62, -0.25, 0.025], [ 0.54, -0.33, 0.020], [ 0.57, -0.18, 0.017]
  ]
  ctx.fillStyle = pal.freckle
  for (var fr = 0; fr < freckles.length; fr++) {
    var fp = P(freckles[fr][0], freckles[fr][1])
    ctx.beginPath()
    ctx.arc(fp[0], fp[1], Math.max(1.1, freckles[fr][2] * R), 0, 2 * Math.PI)
    ctx.fill()
  }

  ctx.restore()
}

function drawHoseEclipse(ctx, cx, cy, R, opts) {
  if (!opts.eclipse || opts.eclipse.depth <= 0 || !opts.umbra) return
  var d = Math.min(1, opts.eclipse.depth)
  var ux = cx + opts.umbra.ox * R
  var uy = cy + opts.umbra.oy * R
  var ur = opts.umbra.r * R
  ctx.save()
  hoseDiscPath(ctx, cx, cy, R)
  ctx.clip()
  ctx.fillStyle = "rgba(186, 56, 42, " + (0.58 * d) + ")"
  ctx.fillRect(cx - R - 4, cy - R - 4, R * 2 + 8, R * 2 + 8)
  var g = ctx.createRadialGradient(ux, uy, R * 0.08, ux, uy, ur)
  g.addColorStop(0, "rgba(48, 8, 10, " + (0.52 * d) + ")")
  g.addColorStop(0.72, "rgba(48, 8, 10, " + (0.38 * d) + ")")
  g.addColorStop(1, "rgba(48, 8, 10, 0)")
  ctx.fillStyle = g
  ctx.fillRect(cx - R - 4, cy - R - 4, R * 2 + 8, R * 2 + 8)
  ctx.restore()
}

function resolveHoseMood(fraction, booped) {
  if (booped) return { mood: "boop", dir: -1 }
  var t = Math.cos(2 * Math.PI * fraction)
  var illum = (1 - t) / 2
  if (illum < 0.11) return { mood: "sleepy", dir: 0 }
  if (illum < 0.42) return { mood: "whistle", dir: -1 }
  if (illum <= 0.62) return { mood: "toothy", dir: -1 }
  if (illum <= 0.93) return { mood: "whistle", dir: 1 }
  return { mood: "laugh", dir: 0 }
}

// 1930s rubber-hose cartoon moon character with phase-reactive poses and
// expressions, soft dark-theme silhouette rim, and boots styled from the
// active Omarchy theme accent. Purely artistic orientation.
function paintHose(ctx, w, h, opts) {
  if (w < 10 || h < 10) return
  var S = Math.min(w, h)
  var f = opts.fraction
  var t = Math.cos(2 * Math.PI * f)
  var dir = f < 0.5 ? 1 : -1
  var booped = !!opts.booped
  var bg = opts.bg
  var bgLum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b
  var isLight = bgLum > 0.5

  var mInfo = resolveHoseMood(f, booped)
  var mood = mInfo.mood
  var swapped = (mood === "whistle" && mInfo.dir > 0)

  var cx = w * (swapped ? 0.485 : (mood === "sleepy" || mood === "laugh" || mood === "boop" ? 0.50 : 0.515))
  var cy = h * 0.44
  var R = S * 0.280
  var inkW = Math.max(1.6, R * 0.054)
  var hoseW = Math.max(3.5, R * 0.145)

  var tilt = (mood === "sleepy") ? 0.04
      : (mood === "whistle") ? (swapped ? 0.06 : -0.06)
      : (mood === "toothy") ? -0.025
      : 0

  // Style boots from the active theme accent (slightly darkened for bright
  // pastel accents so the white boot highlight stays legible).
  var bootRgb = opts.accent || { r: 0.231, g: 0.455, b: 0.816 }
  var bootLum = 0.299 * bootRgb.r + 0.587 * bootRgb.g + 0.114 * bootRgb.b
  var bootFillRgb = bootLum > 0.72 ? darken(bootRgb, 1.18) : bootRgb
  var soleBase = { r: 141 / 255, g: 102 / 255, b: 71 / 255 }
  var soleRgb = mix(soleBase, darken(bootFillRgb, 1.85), 0.35)

  // Warm vintage character illustration palette confined to this painter.
  var pal = {
    lit: "#F2E2CE",
    dark: "#8F8591",
    craterLit: "#D0BCA5",
    craterDark: "#756C78",
    craterRingFill: "#E0CCB5",
    freckle: "#7E6759",
    blush: "rgba(224, 118, 108, 0.36)",
    ink: "#181412",
    rim: "rgba(242, 226, 206, 0.44)",
    nose: "#DB4B3F",
    glove: "#FAF8F4",
    boot: rgba(bootFillRgb, 1),
    sole: rgba(soleRgb, 1),
    teeth: "#FFFDF9",
    tongue: "#E88296"
  }

  // ---- Dynamic rubber-hose legs & boots ----
  if (mood === "sleepy") {
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.28, cy + R * 0.85)
      ctx.quadraticCurveTo(cx - R * 0.34, cy + R * 1.16, cx - R * 0.32, cy + R * 1.38)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.28, cy + R * 0.85)
      ctx.quadraticCurveTo(cx + R * 0.34, cy + R * 1.16, cx + R * 0.32, cy + R * 1.38)
    })
    drawHoseBoot(ctx, cx - R * 0.33, cy + R * 1.37, R * 0.50, -1, 0, pal.ink, pal.boot, pal.sole, inkW, false)
    drawHoseBoot(ctx, cx + R * 0.33, cy + R * 1.37, R * 0.50,  1, 0, pal.ink, pal.boot, pal.sole, inkW, false)
  } else if (swapped) {
    // Gibbous stride: left boot planted, right boot kicked up showing sole.
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.18, cy + R * 0.86)
      ctx.quadraticCurveTo(cx + R * 0.42, cy + R * 1.20, cx + R * 0.62, cy + R * 1.18)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.22, cy + R * 0.86)
      ctx.quadraticCurveTo(cx - R * 0.52, cy + R * 1.12, cx - R * 0.48, cy + R * 1.38)
    })
    drawHoseBoot(ctx, cx + R * 0.64, cy + R * 1.15, R * 0.52,  1, -0.38, pal.ink, pal.boot, pal.sole, inkW, true)
    drawHoseBoot(ctx, cx - R * 0.48, cy + R * 1.37, R * 0.50, -1,  0.0,  pal.ink, pal.boot, pal.sole, inkW, false)
  } else {
    // Standard strut: left boot kicked up showing sole, right boot planted.
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.18, cy + R * 0.86)
      ctx.quadraticCurveTo(cx - R * 0.42, cy + R * 1.20, cx - R * 0.62, cy + R * 1.18)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.22, cy + R * 0.86)
      ctx.quadraticCurveTo(cx + R * 0.52, cy + R * 1.12, cx + R * 0.48, cy + R * 1.38)
    })
    drawHoseBoot(ctx, cx - R * 0.64, cy + R * 1.15, R * 0.52, -1, 0.38, pal.ink, pal.boot, pal.sole, inkW, true)
    drawHoseBoot(ctx, cx + R * 0.48, cy + R * 1.37, R * 0.50,  1, 0.0,  pal.ink, pal.boot, pal.sole, inkW, false)
  }

  // ---- Dynamic rubber-hose arms & gloves ----
  if (mood === "boop" || mood === "laugh") {
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.86, cy + R * 0.02)
      ctx.quadraticCurveTo(cx - R * 1.38, cy - R * 0.08, cx - R * 1.26, cy - R * 0.58)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.86, cy - R * 0.06)
      ctx.quadraticCurveTo(cx + R * 1.42, cy - R * 0.16, cx + R * 1.30, cy - R * 0.64)
    })
    drawHoseGlove(ctx, cx - R * 1.26, cy - R * 0.60, R * 0.40, -1.75, false, "open", pal.ink, pal.glove, inkW)
    drawHoseGlove(ctx, cx + R * 1.30, cy - R * 0.66, R * 0.40,  1.75, true,  "open", pal.ink, pal.glove, inkW)
  } else if (mood === "sleepy") {
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.88, cy + R * 0.10)
      ctx.quadraticCurveTo(cx - R * 1.24, cy + R * 0.32, cx - R * 1.06, cy + R * 0.64)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.88, cy + R * 0.10)
      ctx.quadraticCurveTo(cx + R * 1.24, cy + R * 0.32, cx + R * 1.06, cy + R * 0.64)
    })
    drawHoseGlove(ctx, cx - R * 1.05, cy + R * 0.66, R * 0.38,  1.45, false, "fist", pal.ink, pal.glove, inkW)
    drawHoseGlove(ctx, cx + R * 1.05, cy + R * 0.66, R * 0.38, -1.45, true,  "fist", pal.ink, pal.glove, inkW)
  } else if (swapped) {
    // Gibbous arms: right fist pumped up, left arm swinging down.
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.86, cy + R * 0.08)
      ctx.quadraticCurveTo(cx + R * 1.44, cy + R * 0.06, cx + R * 1.26, cy - R * 0.46)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.86, cy - R * 0.08)
      ctx.quadraticCurveTo(cx - R * 1.44, cy - R * 0.14, cx - R * 1.34, cy + R * 0.44)
    })
    drawHoseGlove(ctx, cx + R * 1.26, cy - R * 0.48, R * 0.40,  1.65, true,  "fist", pal.ink, pal.glove, inkW)
    drawHoseGlove(ctx, cx - R * 1.34, cy + R * 0.46, R * 0.40,  1.65, false, "fist", pal.ink, pal.glove, inkW)
  } else {
    // Standard strut arms: left fist pumped up, right arm swinging down.
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx - R * 0.86, cy + R * 0.08)
      ctx.quadraticCurveTo(cx - R * 1.44, cy + R * 0.06, cx - R * 1.26, cy - R * 0.46)
    })
    strokeHoseLimb(ctx, hoseW, inkW, pal.ink, isLight, pal.rim, function() {
      ctx.beginPath()
      ctx.moveTo(cx + R * 0.86, cy - R * 0.08)
      ctx.quadraticCurveTo(cx + R * 1.44, cy - R * 0.14, cx + R * 1.34, cy + R * 0.44)
    })
    drawHoseGlove(ctx, cx - R * 1.26, cy - R * 0.48, R * 0.40, -1.65, false, "fist", pal.ink, pal.glove, inkW)
    drawHoseGlove(ctx, cx + R * 1.34, cy + R * 0.46, R * 0.40, -1.65, true,  "fist", pal.ink, pal.glove, inkW)
  }

  // ---- Moon body, phase terminator, craters & eclipse ----
  hoseDiscPath(ctx, cx, cy, R)
  ctx.fillStyle = pal.dark
  ctx.fill()

  ctx.save()
  hoseDiscPath(ctx, cx, cy, R)
  ctx.clip()
  hosePhasePath(ctx, cx, cy, R * 1.02, dir, t)
  ctx.fillStyle = pal.lit
  ctx.fill()
  ctx.strokeStyle = "rgba(255,252,244,0.42)"
  ctx.lineWidth = R * 0.075
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.955, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.restore()

  drawHoseSurface(ctx, cx, cy, R, dir, t, tilt, pal, inkW)

  if (mood === "toothy") {
    var Pblush = makeHoseXform(cx, cy, R, tilt, false)
    var bl = Pblush(-0.44, 0.09), br = Pblush(0.44, 0.09)
    ctx.save()
    hoseDiscPath(ctx, cx, cy, R)
    ctx.clip()
    hoseOvalPath(ctx, bl[0], bl[1], R * 0.125, R * 0.078, tilt - 0.1)
    ctx.fillStyle = pal.blush; ctx.fill()
    hoseOvalPath(ctx, br[0], br[1], R * 0.125, R * 0.078, tilt + 0.1)
    ctx.fillStyle = pal.blush; ctx.fill()
    ctx.restore()
  }

  drawHoseEclipse(ctx, cx, cy, R, opts)

  if (!isLight) {
    hoseDiscPath(ctx, cx, cy, R + inkW * 0.4)
    ctx.strokeStyle = pal.rim
    ctx.lineWidth = inkW * 0.7
    ctx.stroke()
  }
  hoseDiscPath(ctx, cx, cy, R)
  ctx.strokeStyle = pal.ink
  ctx.lineWidth = inkW * 1.15
  ctx.stroke()

  // ---- Face ----
  var P = makeHoseXform(cx, cy, R, tilt, false)
  var le = P(-0.165, -0.18), re = P(0.165, -0.18)
  var eyeRX = R * 0.112, eyeRY = R * 0.22

  if (mood === "boop") {
    drawHoseStarEye(ctx, le[0], le[1], R * 0.17, pal.ink, pal.lit)
    drawHoseStarEye(ctx, re[0], re[1], R * 0.17, pal.ink, pal.lit)
  } else if (mood === "sleepy") {
    ctx.strokeStyle = pal.ink; ctx.lineWidth = inkW * 1.1; ctx.lineCap = "round"
    var l0 = P(-0.29, -0.16), lc = P(-0.17, -0.07), l1 = P(-0.05, -0.16)
    ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.quadraticCurveTo(lc[0], lc[1], l1[0], l1[1]); ctx.stroke()
    var r0 = P(0.05, -0.16), rc = P(0.17, -0.07), r1 = P(0.29, -0.16)
    ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.quadraticCurveTo(rc[0], rc[1], r1[0], r1[1]); ctx.stroke()
  } else {
    drawHosePieEye(ctx, le[0], le[1], eyeRX, eyeRY, tilt, -0.06, 0.92, pal.ink)
    if (opts.wink) {
      drawHoseWink(ctx, re[0], re[1] + R * 0.02, eyeRX * 0.95, eyeRY * 0.52, pal.ink, inkW * 1.15)
    } else {
      drawHosePieEye(ctx, re[0], re[1], eyeRX, eyeRY, tilt, -0.06, 0.92, pal.ink)
    }
  }

  drawHoseBrows(ctx, cx, cy, R, mood === "boop" ? -0.08 : (mood === "sleepy" ? 0.06 : 0), !booped && opts.wink, pal.ink, inkW * 1.05, tilt)

  var np = P(0, mood === "boop" ? 0.01 : 0.04)
  drawHoseNose(ctx, np[0], np[1], R * 0.11, R * 0.07, tilt, pal.nose, pal.ink, "rgba(255,255,255,0.45)", inkW * 0.85)

  if (mood === "whistle") {
    var noteColor = rgba(opts.fg, 0.88)
    if (swapped) {
      drawHoseWhistleMouth(ctx, cx, cy, R, tilt, true, -0.16, 0.26, 1.05, pal.lit, pal.ink, inkW * 0.95)
      drawHoseMusicNote(ctx, cx + R * 1.38, cy - R * 0.94, R * 0.25,  0.14, noteColor, true)
      drawHoseMusicNote(ctx, cx + R * 0.94, cy - R * 1.18, R * 0.19, -0.18, noteColor, false)
    } else {
      drawHoseWhistleMouth(ctx, cx, cy, R, tilt, false, -0.16, 0.26, 1.05, pal.lit, pal.ink, inkW * 0.95)
      drawHoseMusicNote(ctx, cx - R * 1.38, cy - R * 0.94, R * 0.25, -0.14, noteColor, true)
      drawHoseMusicNote(ctx, cx - R * 0.96, cy - R * 1.18, R * 0.19,  0.18, noteColor, false)
    }
  } else if (mood === "sleepy") {
    drawHoseDimpleSmile(ctx, P, 0.11, 0.72, pal.ink, inkW * 0.95)
    ctx.fillStyle = rgba(opts.fg, 0.65)
    ctx.font = "bold " + Math.round(R * 0.26) + "px monospace"
    ctx.fillText("z", cx + R * 0.98, cy - R * 0.76)
    ctx.font = "bold " + Math.round(R * 0.18) + "px monospace"
    ctx.fillText("z", cx + R * 1.16, cy - R * 0.96)
  } else if (mood === "toothy") {
    drawHoseToothyGrin(ctx, P, 0.09, 0.96, pal.ink, pal.teeth, inkW)
  } else {
    drawHoseOpenLaugh(ctx, P, 0.09, mood === "boop" ? 1.02 : 0.92, pal.ink, pal.ink, pal.tongue, inkW)
  }
}

// Feathered eclipse umbra painted over the clay moon plates, clipped to the
// painted disc. Uses only the theme's alert color darkened toward the core.
function paintClayShadow(ctx, w, h, opts) {
  if (w < 10 || h < 10 || !opts.eclipse || !opts.umbra) return
  var ecl = opts.eclipse
  var depth = Math.max(0, Math.min(1, ecl.depth))
  if (depth <= 0) return

  var cx = w / 2
  var cy = h * 0.495 // ball centre in the plate frame
  var R = w * opts.discFrac / 2
  var frame = opts.umbra
  var flip = opts.southUp ? -1 : 1
  var ux = cx + flip * frame.ox * R
  var uy = cy + frame.oy * R
  var ur = frame.r * R

  var alert = opts.alert
  var core = darken(alert, 2.2)
  var deepCore = darken(core, 1.5)

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, 2 * Math.PI)
  ctx.clip()

  // Soft-focus feathered umbra edge.
  var coreA = Math.min(0.84, 0.12 + 0.72 * Math.pow(depth, 1.25))
  var g0 = ur - 0.30 * R
  var g1 = ur + 1.00 * R
  function at(r) { return (r - g0) / (g1 - g0) }
  var gb = ctx.createRadialGradient(ux, uy, g0, ux, uy, g1)
  gb.addColorStop(0, rgba(core, coreA))
  gb.addColorStop(at(ur - 0.10 * R), rgba(core, coreA * 0.93))
  gb.addColorStop(at(ur), rgba(core, coreA * 0.65))
  gb.addColorStop(at(ur + 0.25 * R), rgba(core, coreA * 0.28))
  gb.addColorStop(at(ur + 0.60 * R), rgba(core, coreA * 0.08))
  gb.addColorStop(1, rgba(core, 0))
  ctx.fillStyle = gb
  ctx.beginPath()
  ctx.arc(ux, uy, g1, 0, 2 * Math.PI)
  ctx.fill()

  // Deeper shadow axis core.
  var gd = ctx.createRadialGradient(ux, uy, 0, ux, uy, ur * 0.8)
  gd.addColorStop(0, rgba(deepCore, coreA * 0.35))
  gd.addColorStop(1, rgba(core, 0))
  ctx.fillStyle = gd
  ctx.beginPath()
  ctx.arc(ux, uy, ur * 0.8, 0, 2 * Math.PI)
  ctx.fill()

  // Coppery totality limb ring.
  if (ecl.kind === "total" && depth > 0.6) {
    var rimK = (depth - 0.6) / 0.4
    var gr = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R)
    gr.addColorStop(0, rgba(alert, 0))
    gr.addColorStop(0.85, rgba(alert, 0.16 * rimK))
    gr.addColorStop(1, rgba(alert, 0.42 * rimK))
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}
