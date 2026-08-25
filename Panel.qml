import QtQuick
import Quickshell
// Provides IpcHandler below — NOT removable when the v0.1.2 hemisphere
// FileView went away, even though that was this import's other consumer.
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "salmun-nister.luna"
  ipcTarget: "salmun-nister.luna"
  manageIpc: false

  property var anchorItem: null
  property bool openedFromHotkey: false

  // The bar tracks the widget mounted in its slot — BarWidget.qml — not this
  // nested panel, so the popout identity has to be that widget.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  function open() {
    openedFromHotkey = false
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    // Set after showing, not before: showing hands the popout coordinator
    // over, and that handoff clears the shared flag. Deferring means the
    // panel taking over always wins.
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  // ---- Settings (flat keys on the bar-layout entry; see README) ----
  function _bool(value, fallback) {
    if (value === undefined || value === null) return fallback
    if (typeof value === "boolean") return value
    return String(value).toLowerCase() === "true"
  }

  readonly property bool showPercent: _bool(setting("showPercent", false), false)

  // Pill icon flavor: plain monochrome Nerd Font glyph by default (inherits
  // the bar's theme text color), or color emoji when set to false.
  readonly property bool plainIcon: _bool(setting("plainIcon", true), true)

  // Last-used style is persisted straight into this widget's shell.json
  // layout entry; fail-safe default is blocks.
  readonly property string artStyle: {
    var s = String(setting("artStyle", "blocks")).toLowerCase()
    return (s === "ascii" || s === "vector" || s === "cartoon") ? s : "blocks"
  }

  readonly property int artRows: {
    var n = parseInt(setting("artRows", 19), 10)
    if (isNaN(n)) n = 19
    n = Math.max(9, Math.min(41, n))
    return n % 2 === 0 ? n + 1 : n
  }

  // Hemisphere is explicit-only: "south" mirrors the art and glyphs, any
  // other value (or unset) keeps the default north-up view.
  readonly property bool southUp: {
    var explicitHemi = String(setting("hemisphere", "")).trim().toLowerCase()
    return explicitHemi === "south"
  }

  function cycleArtStyle() {
    var order = ["blocks", "ascii", "vector", "cartoon"]
    persistSettings({ artStyle: order[(order.indexOf(artStyle) + 1) % order.length] })
  }

  function togglePlainIcon() {
    persistSettings({ plainIcon: !plainIcon })
  }

  // Applied locally first so the panel redraws on the click itself; the
  // shell.json write comes back through the bar as the same value (same
  // pattern as the clock panel).
  function persistSettings(values) {
    var entry = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entry[existing] = root.settings[existing]
    for (var key in values) entry[key] = values[key]

    root.settings = entry
    if (root.hostWidget && "settings" in root.hostWidget) root.hostWidget.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  // ---- Phase state ----
  SystemClock { id: clock; precision: SystemClock.Minutes }

  // Physical height:width ratio of one monospace cell, measured from a
  // CONSTANT hidden probe rendered with the exact art font. Measuring the
  // art itself would feed back into its own column count (binding loop);
  // the probe has no such cycle. Falls back to the common 2.0 default if
  // metrics look degenerate.
  Text {
    id: fontProbe
    visible: false
    width: 0
    height: 0
    textFormat: Text.PlainText
    font.family: "monospace"
    font.pixelSize: Style.font.caption
    text: "██████████\n██████████"
  }

  readonly property real artCellAspect: {
    var charW = fontProbe.implicitWidth / 10
    var lineH = fontProbe.implicitHeight / 2
    var ratio = charW > 0 ? lineH / charW : 0
    return ratio >= 1.2 && ratio <= 3 ? ratio : 2.0
  }

  readonly property var phase: Model.moonState(clock.date.getTime(), southUp)

  // Active umbral lunar eclipse, or null. Null outside U1..U4 windows and
  // for penumbral-only events (Model skips those by design).
  readonly property var eclipse: Model.eclipseState(clock.date.getTime())

  // What the bar pill shows: emoji, or the monochrome themed glyph when the
  // plainIcon setting is on. Notifications keep the real moon's emoji.
  readonly property string pillGlyph: plainIcon
      ? Model.plainGlyphFor(displayPhase.fraction, southUp)
      : displayPhase.glyph
  readonly property string label: pillGlyph + (showPercent ? " " + displayPhase.illuminationPct + "%" : "")
  readonly property string tooltipText: displayPhase.phaseName + " · " + displayPhase.illuminationPct + "% illuminated"
      + (artEclipse ? " — " + artEclipse.label : "")
  readonly property string notificationSummary: phase.glyph + " " + phase.phaseName + " — " + phase.illuminationPct + "% illuminated"
      + (eclipse ? " (" + eclipse.label + ")" : "")

  // Eclipse state driving all visuals: real event XOR dev preview.
  readonly property var artEclipse: devMode ? devEclipsePreview : eclipse
  // Pill styling inputs for BarWidget (tint on plain glyph, halo on emoji).
  readonly property real pillEclipseDepth: artEclipse ? artEclipse.depth : 0

  readonly property string moonArt: Model.renderMoonArt(displayFraction, artStyle, artRows, southUp, artCellAspect, winkNow, artEclipse)

  // Decorative sky around the disk: REGENERATED with new random positions
  // every time the popup opens or the style changes. Rejection sampling
  // keeps glyphs inside an edge band, clear of the lunar disk, and spaced
  // apart from each other. Twinkle loops are gated on `opened` so nothing
  // animates while the panel is hidden.
  property var starField: []

  function _shuffleStars() {
    var glyphs = ["\u2726", "\u2727", "+", "\u00B7"]
    var W = artContainer.width
    var H = artContainer.height
    if (W <= 0 || H <= 0 || !moonText.implicitHeight) return
    var cx = W / 2
    var cy = H / 2
    // Moon is a circle spanning the art square; add margin for the glyph.
    var clearR = Math.max(moonText.implicitWidth, moonText.implicitHeight) / 2 + Style.space(16)
    var placed = []
    var tries = 0
    while (placed.length < 12 && tries < 800) {
      tries++
      // Pick an edge band: hugging one border, sliding along it.
      var edge = Math.floor(Math.random() * 4)
      var along = 0.04 + Math.random() * 0.92
      var depth = 0.05 + Math.random() * 0.13
      var fx, fy
      if (edge === 0) { fx = along; fy = depth }
      else if (edge === 1) { fx = along; fy = 1 - depth }
      else if (edge === 2) { fx = depth; fy = along }
      else { fx = 1 - depth; fy = along }

      var px = fx * W - cx
      var py = fy * H - cy
      if (Math.sqrt(px * px + py * py) < clearR) continue
      var crowded = false
      for (var s = 0; s < placed.length; s++) {
        var dx = (placed[s].fx - fx) * W
        var dy = (placed[s].fy - fy) * H
        if (Math.sqrt(dx * dx + dy * dy) < Style.space(28)) { crowded = true; break }
      }
      if (crowded) continue
      placed.push({
        glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
        fx: fx,
        fy: fy,
        duration: 1500 + Math.floor(Math.random() * 1900),
        dim: 0.15 + Math.random() * 0.25,
        pause: Math.floor(Math.random() * 800)
      })
    }
    starField = placed
  }

  onOpenedChanged: if (opened) Qt.callLater(_shuffleStars)
  onArtStyleChanged: if (root.opened) Qt.callLater(_shuffleStars)

  // Canvas faces wink their right eye at random: uniform 10–60 s gaps
  // (about 35 s on average), same cadence for both styles. Driven by a
  // fixed heartbeat + countdown so we never mutate Timer.interval
  // mid-flight (its restart semantics proved unreliable).
  property bool winkNow: false

  Timer {
    id: winkTick
    interval: 500
    repeat: true
    running: root.opened && (root.artStyle === "vector" || root.artStyle === "cartoon")
    onRunningChanged: if (running) remainMs = root.nextWinkMs()
    onTriggered: {
      remainMs -= interval
      if (remainMs <= 0) {
        root.winkNow = true
        winkReset.restart()
        remainMs = root.nextWinkMs()
      }
    }
    property int remainMs: 0
  }

  Timer {
    id: winkReset
    interval: 340
    onTriggered: root.winkNow = false
  }

  function nextWinkMs() {
    // Dev mode: rapid 3s winks for testing. Otherwise a random cooldown:
    // at least 10s, at most 60s.
    if (root.devMode) return 3000
    return 10000 + Math.floor(Math.random() * 50000)
  }

  // ---- Dev test mode ----
  // Toggled with "?" (or IPC `dev`): freezes the bar's phase source and
  // advances a synthetic fraction so all styles can be watched cycling.
  property bool devMode: false
  property real devFraction: 0.0

  Timer {
    id: devCycle
    interval: 1000
    repeat: true
    // Eclipse preview pins the phase at full moon, so nothing to advance.
    running: root.devMode && root.devEclipseStage === 0 && root.opened
    onTriggered: root.devFraction = (root.devFraction + 0.05) % 1.0
  }

  function toggleDev() {
    devMode = !devMode
    if (devMode) devFraction = phase.fraction
    else devEclipseStage = 0
    // Re-arm the wink heartbeat so the new cadence applies at once.
    remainMs = nextWinkMs()
  }

  // Eclipse preview: while dev mode is on, E picks what animates — first
  // press runs a partial eclipse start-to-end, second a total one, third
  // switches off. Each sweep loops until changed. Lunar eclipses only happen
  // at full moon, so any active preview also pins the phase there (see
  // displayFraction).
  property int devEclipseStage: 0   // 0 = off · 1 = partial anim · 2 = total anim
  property real devEclipseT: 0      // 0..1 progress through the event

  Timer {
    id: devEclipseAnim
    interval: 100                   // 100 ticks × 0.01 = 10 s per sweep
    repeat: true
    running: root.devMode && root.devEclipseStage > 0 && root.opened
    onTriggered: root.devEclipseT = (root.devEclipseT + 0.01) % 1.0
  }

  readonly property var devEclipsePreview: {
    if (devEclipseStage === 0 || !devMode) return null
    var total = devEclipseStage === 2
    var t = devEclipseT
    // Depth profile: partial swells to its peak and back; total ramps into
    // a totality plateau, then out. Shadow position is time-driven (see
    // Model._stampUmbra); the two flavors carry realistic gammas so one
    // passes below the disk and the other slightly above, like real events.
    var peak = total ? 1.0 : 0.93
    var d
    if (!total) d = peak * (t <= 0.5 ? t / 0.5 : (1 - t) / 0.5)
    else if (t < 0.3) d = t / 0.3
    else if (t <= 0.7) d = 1.0
    else d = (1 - t) / 0.3
    return { kind: total ? "total" : "partial",
             label: total ? "Total Lunar Eclipse" : "Partial Lunar Eclipse",
             depth: Math.max(0, Math.min(1, d)), peak: peak,
             gamma: total ? 0.12 : -0.5,
             progress: t }
  }

  function cycleDevEclipse() {
    if (!devMode) return
    devEclipseStage = (devEclipseStage + 1) % 3
    devEclipseT = 0                 // every selection starts at first contact
  }

  readonly property real displayFraction: devEclipsePreview ? 0.5
      : devMode ? devFraction : phase.fraction
  // Panel-side phase info follows dev mode; the bar pill keeps the real moon.
  // Vector-style easter egg: tapping the smile sticks the tongue out
  // for a moment before it slides back in.
  property bool tongueOut: false

  Timer {
    id: tongueTimer
    interval: 1600
    repeat: false
    onTriggered: root.tongueOut = false
  }

  function stickTongue() {
    tongueOut = true
    tongueTimer.restart()
  }

  readonly property var displayPhase: root.devMode
      ? Model.moonState(clock.date.getTime(), southUp, devFraction)
      : root.phase

  // ---- Easter egg ----
  // Clicking Mare Tranquillitatis sends a little saucer across the sky while
  // a tiny resident waves from the surface. Works in any phase and either
  // hemisphere (seaHit handles the mirror). One flight at a time.
  property bool eggRunning: false

  // Saucer orbit geometry: circles a hover point just above the resident.
  readonly property real eggOrbitR: Style.space(30)
  readonly property real eggOrbitCx: artContainer.eggManX
  readonly property real eggOrbitCy: Math.max(Style.space(44), artContainer.eggManY - moonMan.height - Style.space(50))

  function startEgg() {
    if (eggRunning || !root.opened) return
    eggRunning = true
    eggSequence.restart()
  }

  function triggerEgg() {
    if (!root.opened) root.openFromHotkey()
    Qt.callLater(function() { if (root.opened) root.startEgg() })
  }

  // Beam endpoints in artContainer coordinates; the Canvas repaints from
  // these on every saucer move.
  property real eggBeamSrcX: 0
  property real eggBeamSrcY: 0
  property real eggBeamTgtX: 0
  property real eggBeamTgtY: 0

  // Aim the beam from the saucer's belly at the resident's head.
  function updateBeam() {
    eggBeamSrcX = ufoText.x + ufoText.implicitWidth / 2
    eggBeamSrcY = ufoText.y + ufoText.implicitHeight
    eggBeamTgtX = artContainer.eggManX
    eggBeamTgtY = artContainer.eggManY - moonMan.height * 0.5
    beamRect.requestPaint()
  }

  function formatDate(ms) {
    return Qt.formatDate(new Date(ms), "ddd d MMM")
  }

  IpcHandler {
    target: root.ipcTarget

    function open() { root.openFromHotkey() }
    function close() { root.close() }
    function show() { root.openFromHotkey() }
    function hide() { root.close() }
    function toggle() { root.toggle() }
    function restyle() { root.cycleArtStyle() }
    function icon() { root.togglePlainIcon() }
    function egg() { root.triggerEgg() }
    function dev() { root.toggleDev() }

    // Live layout diagnostics: `omarchy-shell salmun-nister.luna status`
    // (CLI drops return values, so also log to the qs log).
    function status() {
      var s = JSON.stringify({
        style: root.artStyle,
        rows: root.artRows,
        columns: Math.max(root.artRows, Math.round(root.artRows * root.artCellAspect)),
        cellAspect: Math.round(root.artCellAspect * 1000) / 1000,
        artPx: [Math.round(moonText.implicitWidth), Math.round(moonText.implicitHeight)],
        contentW: panel.contentWidth,
        contentH: panel.contentHeight,
        egg: root.eggRunning,
        dev: root.devMode,
        eclipse: (function() {
          var e = root.artEclipse
          if (!e) return null
          return { kind: e.kind, depth: Math.round(e.depth * 1000) / 1000,
                   label: e.label, devPreview: root.devMode }
        })(),
        plainIcon: root.plainIcon,
        frac: Math.round(root.displayFraction * 1000) / 1000,
        scene: {
          ufo: [Math.round(ufoText.x), Math.round(ufoText.y), Math.round(ufoText.implicitWidth), Math.round(ufoText.implicitHeight), +ufoText.opacity.toFixed(2), ufoText.visible],
          man: [Math.round(moonMan.x), Math.round(moonMan.y), +moonMan.opacity.toFixed(2), moonMan.visible],
          beam: [Math.round(root.eggBeamSrcX), Math.round(root.eggBeamSrcY), +beamRect.opacity.toFixed(2)],
          beamEnd: [Math.round(root.eggBeamTgtX), Math.round(root.eggBeamTgtY)],
          manAnchor: (function() {
            return [Math.round(artContainer.eggManX), Math.round(artContainer.eggManY - moonMan.height * 0.5)]
          })(),
          contW: Math.round(artContainer.width),
          contH: Math.round(artContainer.height)
        },
        stars: root.starField.map(function(s) { return [+s.fx.toFixed(3), +s.fy.toFixed(3)] })
      })
      console.log("luna.status", s)
      return s
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    // Size the card to the PADDED art container, not the raw text: otherwise
    // the container (which carries the breathing room) overflows the card and
    // the moon/stars end up pressed against the window edge.
    contentWidth: panel.fittedContentWidth(Math.max(Style.space(300), Math.ceil(artContainer.width)))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onReturnRequested: root.cycleArtStyle()
      onTextKey: function(t) {
        if (t === "s" || t === "S") root.cycleArtStyle()
        else if (t === "i" || t === "I") root.togglePlainIcon()
        else if (t === "e" || t === "E") root.cycleDevEclipse()
        else if (t === "?") root.toggleDev()
      }
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(14)

        Text {
          id: title
          width: parent.width
          text: root.displayPhase.phaseName
          color: root.bar.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.subtitle
          font.bold: true
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          width: parent.width
          visible: root.artEclipse !== null
          text: root.artEclipse ? root.artEclipse.label : ""
          color: Color.urgent
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          horizontalAlignment: Text.AlignHCenter
        }

        Item {
          id: artContainer
          anchors.horizontalCenter: parent.horizontalCenter
          // Breathing room around the moon and the star field on all sides.
          width: moonText.implicitWidth + Style.space(80)
          height: moonText.implicitHeight + Style.space(48)
          // The saucer enters/exits beyond the text bounds; keep the scene
          // inside the card.
          clip: true

          // Dev mode only: name the active style in the bottom-left.
          Text {
            anchors.left: parent.left
            anchors.leftMargin: Style.space(12)
            anchors.bottom: parent.bottom
            visible: root.devMode
            text: root.artStyle
            color: Color.accent
            font.family: root.bar.fontFamily
            font.pixelSize: Style.font.caption
          }

          Text {
            id: moonText
            anchors.centerIn: parent
            text: root.moonArt
            textFormat: Text.PlainText
            // During an eclipse the whole disk shifts red with depth.
            color: {
              var d = root.artEclipse ? root.artEclipse.depth : 0
              if (d <= 0) return root.bar.foreground
              return Qt.tint(root.bar.foreground, Qt.rgba(Color.urgent.r, Color.urgent.g, Color.urgent.b, Math.min(1, d * 0.85)))
            }
            font.family: "monospace"
            font.pixelSize: Style.font.caption

            // Style cycle on tap — unless the tap lands in Mare
            // Tranquillitatis, which belongs to the easter egg.
            TapHandler {
              id: moonTap
              onTapped: function() {
                var p = moonTap.point.position
                var fx = p.x / Math.max(1, moonText.implicitWidth)
                var fy = p.y / Math.max(1, moonText.implicitHeight)
                if (root.artStyle === "ascii" && Model.seaHit(fx, fy, root.southUp)) root.startEgg()
                else if (root.artStyle === "vector" &&
                         Model.vecMouthHit(p.x, p.y, moonText.implicitWidth, moonText.implicitHeight)) root.stickTongue()
                else root.cycleArtStyle()
              }
            }
            HoverHandler {
              cursorShape: Qt.PointingHandCursor
            }
          }

          // Canvas-drawn styles: "vector" (friendly yellow cartoon moon)
          // and "cartoon" (1930s rubber-hose style monochrome, theme
          // colors only). The text layer above stays as an invisible
          // placeholder so card sizing, tap mapping and star layout all
          // keep their geometry.
          Canvas {
            id: moonCanvas
            anchors.fill: moonText
            visible: root.artStyle === "vector" || root.artStyle === "cartoon"

            readonly property var _sig: [
              width, height, root.displayFraction, root.winkNow, root.southUp,
              root.artStyle, root.tongueOut,
              root.bar ? root.bar.foreground.toString() : "",
              JSON.stringify(root.artEclipse)
            ]
            on_SigChanged: requestPaint()
            onVisibleChanged: if (visible) requestPaint()
            Component.onCompleted: requestPaint()

            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              if (root.artStyle === "cartoon")
                paintHose(ctx, width, height)
              else
                paintVector(ctx, width, height)
            }

            // Shared phase-region path: the area between the lit limb and
            // the terminator. x_b = cx + dir*t*R*cos(a) is continuous
            // across crescent (t>0), quarter (t=0) and gibbous/full (t<0).
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
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
              }
              for (var j = N; j >= 0; j--) {
                var a2 = -Math.PI / 2 + Math.PI * j / N
                ctx.lineTo(cx + dir * t * R * Math.cos(a2), cy + R * Math.sin(a2))
              }
              ctx.closePath()
            }

            function paintVector(ctx, w, h) {
              if (w < 10 || h < 10) return
              var cx = w / 2
              var cy = h / 2
              var R = Math.min(w, h) / 2 * 0.97

              // Warm illustrative palette; the only non-theme colors in the
              // plugin, confined to this character illustration.
              var LIT = "#F7D96C"
              var DARK = "#C9A94F"
              var INK = "#5B4423"
              var RIM = "rgba(122,92,32,0.4)"

              var f = root.displayFraction
              var t = Math.cos(2 * Math.PI * f)
              var dir = f < 0.5 ? 1 : -1 // lit limb side: +1 right (waxing)

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

              // Eclipse: wash the whole disk toward blood red with depth,
              // then darken the umbra core with a soft radial gradient.
              // Drawn before the face so the character stays readable.
              if (root.artEclipse && root.artEclipse.depth > 0) {
                var ecl = root.artEclipse
                ctx.save()
                ctx.beginPath()
                ctx.arc(cx, cy, R, 0, 2 * Math.PI)
                ctx.clip()
                ctx.fillStyle = "rgba(186,62,48," + Math.min(1, ecl.depth * 0.72) + ")"
                ctx.fillRect(0, 0, w, h)
                // Umbra center: time-driven transit (matches the text art
                // stamp); flipped for southern hemisphere like everything
                // else canvas-drawn.
                var RUv = R * 2.7
                var XEv = RUv + 1.15 * R
                var flipV = root.southUp ? -1 : 1
                var oxV = flipV * (-XEv + 2 * XEv * ecl.progress)
                var oyMidV = -ecl.gamma / 0.2725 * R
                var oyV = oyMidV - 0.6 * R * (0.5 - ecl.progress)
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

              if (root.winkNow) {
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

              // Cheeky tongue hanging from the middle of the smile; the
              // only red anywhere in the plugin.
              if (root.tongueOut) {
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

function paintHose(ctx, w, h) {
              if (w < 10 || h < 10) return
              var cx = w / 2
              var cy = h / 2
              var k = Math.min(w, h) / 2 * 0.97   // one SVG unit = k px

              // Theme mapping: the reference's off-white body is the popup
              // surface, its near-black ink is the bar foreground, and the
              // tongue is a foreground/background mix. No literals.
              var fg = root.bar ? root.bar.foreground : Color.foreground
              var bg = Color.popups ? Color.popups.background : Color.background
              function inkA(a) { return Qt.rgba(fg.r, fg.g, fg.b, a) }

              // Geometry helpers in SVG-normalized coordinates.
              function P(dx, dy) { return [cx + dx * k, cy + dy * k] }

              var f = root.displayFraction
              var t = Math.cos(2 * Math.PI * f)
              var dir = f < 0.5 ? 1 : -1

              // Rotated ellipses are built as parametric polylines:
              // Qt's Context2D replays stored path data through the
              // matrix active at DRAW time, so transform-built paths
              // leak into later fills as ghost shapes.
              function ovalPath(x, y, rx, ry, rot) {
                ctx.beginPath()
                var N = 48
                var cr = Math.cos(rot), sr = Math.sin(rot)
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

              // Body: exact card surface so the disc melts into the panel.
              ctx.beginPath()
              ctx.arc(cx, cy, k, 0, 2 * Math.PI)
              ctx.fillStyle = bg
              ctx.fill()

              // Dark side: etched hatching clipped to the antiphase region.
              ctx.save()
              regionPath(ctx, w, h, -dir, -t)
              ctx.clip()
              ctx.strokeStyle = inkA(0.45)
              ctx.lineWidth = Math.max(1, k * 0.016)
              var hca = Math.cos(-0.34), hsa = Math.sin(-0.34)
              for (var hl = -9; hl <= 9; hl++) {
                var hy = hl * k * 0.10
                var ex1 = -k * 1.3, ey1 = hy, ex2 = k * 1.3
                ctx.beginPath()
                ctx.moveTo(cx + ex1 * hca - ey1 * hsa, cy + ex1 * hsa + ey1 * hca)
                ctx.lineTo(cx + ex2 * hca - ey1 * hsa, cy + ex2 * hsa + ey1 * hca)
                ctx.stroke()
              }
              ctx.restore()

              // Eclipse: denser cross-hatch inside the umbra, ink-only so
              // the style stays monochrome. Same time-driven transit
              // geometry as the text art stamp.
              if (root.artEclipse && root.artEclipse.depth > 0) {
                var ecl = root.artEclipse
                var RUh = k * 2.7
                var XEh = RUh + 1.15 * k
                var flipH = root.southUp ? -1 : 1
                var oxH = flipH * (-XEh + 2 * XEh * ecl.progress)
                var oyMidH = -ecl.gamma / 0.2725 * k
                var oyH = oyMidH - 0.6 * k * (0.5 - ecl.progress)
                var ucx = cx + oxH
                var ucy = cy + oyH
                ctx.save()
                ctx.beginPath()
                ctx.arc(cx, cy, k * 0.97, 0, 2 * Math.PI)
                ctx.clip()
                ctx.strokeStyle = inkA(Math.min(0.65, 0.22 + 0.45 * ecl.depth))
                ctx.lineWidth = Math.max(1, k * 0.012)
                var xa = 0.23
                var xca = Math.cos(xa), xsa = Math.sin(xa)
                for (var xl = -16; xl <= 16; xl++) {
                  var xy = xl * k * 0.055 // offsets about the umbra center
                  var vx1 = -k * 1.6, vy1 = xy, vx2 = k * 1.6
                  ctx.beginPath()
                  ctx.moveTo(ucx + vx1 * xca - vy1 * xsa, ucy + vx1 * xsa + vy1 * xca)
                  ctx.lineTo(ucx + vx2 * xca - vy1 * xsa, ucy + vx2 * xsa + vy1 * xca)
                  ctx.stroke()
                }
                ctx.restore()
              }

              // Craters: thin outlined ellipses (reference layout), shown
              // on the lit surface only.
              ctx.save()
              regionPath(ctx, w, h, dir, t)
              ctx.clip()
              ctx.strokeStyle = fg
              ctx.lineWidth = Math.max(1, k * 0.0156)
              var craters = [
                // Right side: exactly three.
                [ 0.756,  0.356, 0.111, 0.067,  0.35],
                [ 0.820, -0.140, 0.075, 0.048, -0.22],
                [ 0.560,  0.560, 0.065, 0.042,  0.18],
                // Left / top / bottom.
                [-0.720, -0.680, 0.133, 0.080, -0.52],
                [-0.778, -0.231, 0.093, 0.067, -0.17],
                [-0.564,  0.053, 0.047, 0.047,  0.00],
                [-0.658,  0.480, 0.147, 0.087, -0.44],
                [-0.164,  0.800, 0.187, 0.100, -0.17],
                [-0.920,  0.280, 0.055, 0.038, -0.25],
                [-0.600, -0.880, 0.060, 0.040,  0.20]
              ]
              for (var cg = 0; cg < craters.length; cg++) {
                var cp = P(craters[cg][0], craters[cg][1])
                ovalPath(cp[0], cp[1], craters[cg][2] * k,
                         craters[cg][3] * k, craters[cg][4])
                ctx.strokeStyle = fg
                ctx.lineWidth = Math.max(1, k * 0.0156)
                ctx.stroke()
              }
              ctx.restore()

              // ---- Face (SVG-derived geometry) ----

              // Eyes: big outlined ovals, ink pupils, tiny highlights.
              // Right eye winks away into a closed lid.
              var eyes = [
                { c: [-0.315, -0.360], rx: 0.165, ry: 0.215, rot: -0.160,
                  pu: [-0.292, -0.270], prx: 0.0575, pry: 0.0825,
                  hl: [-0.302, -0.285], right: false },
                { c: [ 0.058, -0.4525], rx: 0.155, ry: 0.1925, rot: -0.110,
                  pu: [ 0.082, -0.3625], prx: 0.054, pry: 0.0775,
                  hl: [ 0.071, -0.3765], right: true }
              ]
              for (var ev = 0; ev < eyes.length; ev++) {
                var E = eyes[ev]
                var ec = P(E.c[0], E.c[1])
                if (E.right && root.winkNow) continue
                ovalPath(ec[0], ec[1], E.rx * k, E.ry * k, E.rot)
                ctx.fillStyle = bg
                ctx.fill()
                ctx.strokeStyle = fg
                ctx.lineWidth = Math.max(1.5, k * 0.0222)
                ctx.stroke()
                var pc = P(E.pu[0], E.pu[1])
                ovalPath(pc[0], pc[1], E.prx * k, E.pry * k, E.rot)
                ctx.fillStyle = fg
                ctx.fill()
                var hc = P(E.hl[0], E.hl[1])
                ctx.fillStyle = bg
                ctx.beginPath()
                ctx.arc(hc[0], hc[1], Math.max(2, 0.025 * k), 0, 2 * Math.PI)
                ctx.fill()
              }
              // Brows: expressive filled wedges.
              ctx.fillStyle = fg
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(-0.598, -0.523))
              ctx.quadraticCurveTo.apply(ctx, P(-0.532, -0.750).concat(P(-0.416, -0.830)))
              ctx.quadraticCurveTo.apply(ctx, P(-0.443, -0.750).concat(P(-0.549, -0.639)))
              ctx.closePath()
              ctx.fill()
              var wy = root.winkNow ? k * 0.13 : 0
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(-0.034, -0.820 + wy / k))
              ctx.quadraticCurveTo.apply(ctx,
                P(0.148, (-0.900 * k + wy) / k).concat(P(0.299, (-0.767 * k + wy) / k)))
              ctx.quadraticCurveTo.apply(ctx,
                P(0.112, (-0.847 * k + wy) / k).concat(P(-0.034, (-0.820 * k + wy) / k)))
              ctx.closePath()
              ctx.fill()




              if (root.winkNow) {
                var wpts = [P(0.110, -0.565), P(-0.005, -0.520),
                            P(-0.055, -0.470), P(0.000, -0.417),
                            P(0.095, -0.375)]
                // Pivot on the corner (index 2); -20 deg = CCW on screen.
                var wcx = wpts[2][0], wcy = wpts[2][1]
                var wa = -20 * Math.PI / 180
                var wr = Math.cos(wa), ws = Math.sin(wa)
                for (var wi = 0; wi < wpts.length; wi++) {
                  var wdx = wpts[wi][0] - wcx, wdy = wpts[wi][1] - wcy
                  wpts[wi] = [wcx + wdx * wr - wdy * ws,
                              wcy + wdx * ws + wdy * wr]
                }
                var wt = wpts[0], wm1 = wpts[1], wv = wpts[2]
                var wm2 = wpts[3], wb = wpts[4]
                ctx.strokeStyle = fg
                ctx.lineWidth = Math.max(1.5, k * 0.018)
                ctx.lineCap = "round"
                ctx.beginPath()
                ctx.moveTo(wt[0], wt[1])
                ctx.quadraticCurveTo(wm1[0], wm1[1], wv[0], wv[1])
                ctx.quadraticCurveTo(wm2[0], wm2[1], wb[0], wb[1])
                ctx.stroke()
              }

              // Nose: body-colored blade with an ink outline.
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(0.082, -0.293))
              ctx.quadraticCurveTo.apply(ctx, P(0.407, -0.480).concat(P(0.349, -0.307)))
              ctx.quadraticCurveTo.apply(ctx, P(0.273, -0.173).concat(P(-0.011, -0.093)))
              ctx.closePath()
              ctx.fillStyle = bg
              ctx.fill()
              ctx.strokeStyle = fg
              ctx.lineWidth = Math.max(1.5, k * 0.0222)
              ctx.lineJoin = "round"
              ctx.stroke()

              // Wide-open smile: deep dark cavity, a light crescent of
              // upper teeth tucked under the lip, semi-dark tongue nested
              // at the bottom.
              var DEEP = Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 1)
              var TONGUE = Qt.rgba(
                fg.r * 0.30 + DEEP.r * 0.70,
                fg.g * 0.30 + DEEP.g * 0.70,
                fg.b * 0.30 + DEEP.b * 0.70, 1)
              function mouthPath() {
                ctx.beginPath()
                ctx.moveTo.apply(ctx, P(-0.351, 0.164))
                ctx.quadraticCurveTo.apply(ctx, P(0.010, 0.170).concat(P(0.382, -0.187)))
                ctx.quadraticCurveTo.apply(ctx, P(0.422, 0.333).concat(P(0.102, 0.613)))
                ctx.quadraticCurveTo.apply(ctx, P(-0.200, 0.800).concat(P(-0.351, 0.164)))
                ctx.closePath()
              }
              mouthPath()
              ctx.fillStyle = DEEP
              ctx.fill()
              ctx.save()
              mouthPath()
              ctx.clip()
              // Upper teeth: a distinct crescent arc dropping from the
              // upper lip into the cavity.
              ctx.fillStyle = fg
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(-0.351, 0.164))
              ctx.quadraticCurveTo.apply(ctx, P(0.010, 0.170).concat(P(0.382, -0.187)))
              ctx.quadraticCurveTo.apply(ctx, P(0.010, 0.330).concat(P(-0.351, 0.164)))
              ctx.closePath()
              ctx.fill()
              // Tongue: soft mound rising from the bottom of the cavity.
              var tc = P(0.089, 0.600)
              ctx.beginPath()
              for (var ti = 0; ti <= 24; ti++) {
                var ta = Math.PI * ti / 24
                var tx = tc[0] + 0.240 * k * Math.cos(ta)
                var ty = tc[1] + 0.133 * k * Math.sin(ta)
                ti === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty)
              }
              ctx.closePath()
              ctx.fillStyle = TONGUE
              ctx.fill()
              ctx.strokeStyle = fg
              ctx.lineWidth = Math.max(1, k * 0.0167)
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(-0.151, 0.533))
              ctx.quadraticCurveTo.apply(ctx, P(0.089, 0.431).concat(P(0.329, 0.533)))
              ctx.stroke()
              ctx.restore()
              mouthPath()
              ctx.strokeStyle = fg
              ctx.lineWidth = Math.max(1.5, k * 0.020)
              ctx.stroke()

              // Cheek dimple off the left corner.
              ctx.strokeStyle = fg
              ctx.lineWidth = Math.max(1.5, k * 0.020)
              ctx.lineCap = "round"
              ctx.beginPath()
              ctx.moveTo.apply(ctx, P(-0.365, 0.253))
              ctx.quadraticCurveTo.apply(ctx, P(-0.431, 0.187).concat(P(-0.387, 0.080)))
              ctx.stroke()

              // Hand-inked wobbly outline, thick then thin.
              function wobble(r) {
                ctx.beginPath()
                var N = 64
                for (var i = 0; i <= N; i++) {
                  var a = 2 * Math.PI * i / N
                  var rr = r * (1 + 0.026 * Math.sin(3 * a + 1.7) + 0.013 * Math.sin(7 * a + 0.6) + 0.008 * Math.sin(11 * a))
                  var x = cx + rr * Math.cos(a)
                  var y = cy + rr * Math.sin(a)
                  i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
                }
                ctx.closePath()
              }
              ctx.strokeStyle = fg
              ctx.lineJoin = "round"
              wobble(k)
              ctx.lineWidth = Math.max(2, k * 0.027)
              ctx.stroke()
            }
          }

          Repeater {
            model: root.starField

            delegate: Text {
              required property var modelData
              required property int index

              x: modelData.fx * parent.width - implicitWidth / 2
              y: modelData.fy * parent.height - implicitHeight / 2
              text: modelData.glyph
              color: root.bar.foreground
              font.family: "monospace"
              font.pixelSize: index % 2 === 0 ? Style.font.caption : Style.font.bodySmall

              SequentialAnimation on opacity {
                running: root.opened
                loops: Animation.Infinite

                NumberAnimation {
                  from: 1
                  to: modelData.dim
                  duration: modelData.duration
                  easing.type: Easing.InOutQuad
                }
                NumberAnimation {
                  from: modelData.dim
                  to: 1
                  duration: modelData.duration
                  easing.type: Easing.InOutQuad
                }
                PauseAnimation { duration: modelData.pause }
              }
            }
          }

          // ---- Egg actors (hidden until a flight starts) ----
          readonly property real eggManX: {
            var c = Model.seaCenter(Model.EGG_SEA)
            if (!c) return 0
            var nx = root.southUp ? -c.x : c.x
            return moonText.x + ((nx + 1) / 2) * moonText.implicitWidth
          }
          readonly property real eggManY: {
            var c = Model.seaCenter(Model.EGG_SEA)
            if (!c) return 0
            return moonText.y + ((c.y + 1) / 2) * moonText.implicitHeight
          }

          Text {
            id: moonMan
            visible: false
            opacity: 0
            x: artContainer.eggManX - implicitWidth / 2
            y: artContainer.eggManY - implicitHeight
            text: "\\o/"
            textFormat: Text.PlainText
            // Same dim role oma.quake gives its small-magnitude events.
            color: Color.muted
            style: Text.Outline
            styleColor: "#b3000000"
            font.family: "monospace"
            font.pixelSize: Style.font.title
            font.bold: true
            transformOrigin: Item.Bottom
          }

          // The beam is PAINTED, not a rotated Rectangle: rotating an item
          // in this layer surface rendered with a stale/wrong transform
          // (aimed at the window corner regardless of property values), so
          // the beam is a canvas line drawn from saucer belly to resident.
          Canvas {
            id: beamRect
            visible: false
            opacity: 0
            anchors.fill: parent

            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              ctx.strokeStyle = Color.accent
              ctx.lineWidth = Math.max(2, Style.space(3))
              ctx.lineCap = "round"
              ctx.beginPath()
              ctx.moveTo(root.eggBeamSrcX, root.eggBeamSrcY)
              ctx.lineTo(root.eggBeamTgtX, root.eggBeamTgtY)
              ctx.stroke()
            }
          }

          Text {
            id: ufoText
            visible: false
            opacity: 0
            y: Style.space(8)
            // Classic line-art saucer; dark outline keeps it legible.
            text: "  ___  \n<( o )>"
            textFormat: Text.PlainText
            color: Color.urgent
            style: Text.Outline
            styleColor: "#b3000000"
            font.family: "monospace"
            font.pixelSize: Style.font.title
            font.bold: true
          }

          // The beam's painted geometry is driven imperatively: chained
          // bindings on rotation/height proved unreliable here (the engine
          // froze them at their first evaluation, aiming the beam at the
          // window corner). Direct assignment per position change cannot
          // be silently disabled.
          Connections {
            target: ufoText
            function onXChanged() { root.updateBeam() }
            function onYChanged() { root.updateBeam() }
          }

          SequentialAnimation {
            id: waveAnim
            running: false
            loops: Animation.Infinite

            NumberAnimation { target: moonMan; property: "rotation"; to: 20; duration: 240; easing.type: Easing.InOutQuad }
            NumberAnimation { target: moonMan; property: "rotation"; to: -16; duration: 240; easing.type: Easing.InOutQuad }
          }

          SequentialAnimation {
            id: eggSequence

            ScriptAction {
              script: {
                ufoText.opacity = 0
                ufoText.y = Style.space(8)
                ufoText.x = -ufoText.implicitWidth - Style.space(8)
                moonMan.visible = true
                beamRect.visible = true
                ufoText.visible = true
                root.updateBeam()
                waveAnim.restart()
              }
            }

            // Approach: glide in from off-screen toward the orbit entry
            // point left of the resident.
            ParallelAnimation {
              NumberAnimation { target: ufoText; property: "opacity"; to: 1; duration: 250 }
              NumberAnimation { target: moonMan; property: "opacity"; to: 1; duration: 400 }
              NumberAnimation {
                target: ufoText; property: "x"
                to: root.eggOrbitCx - root.eggOrbitR - ufoText.implicitWidth / 2
                duration: 1000
                easing.type: Easing.InOutQuad
              }
              NumberAnimation {
                target: ufoText; property: "y"
                to: root.eggOrbitCy - ufoText.implicitHeight / 2
                duration: 1000
                easing.type: Easing.InOutSine
              }
            }

            // Close enough: beam on, then two low orbits with the beam
            // tracking the resident. (PathArc coordinates are the saucer's
            // top-left position, hence the implicitWidth/2 offsets.)
            ParallelAnimation {
              NumberAnimation { target: beamRect; property: "opacity"; to: 0.45; duration: 450 }
              PathAnimation {
                target: ufoText
                duration: 3400
                path: Path {
                  startX: root.eggOrbitCx - root.eggOrbitR - ufoText.implicitWidth / 2
                  startY: root.eggOrbitCy - ufoText.implicitHeight / 2

                  PathArc {
                    x: root.eggOrbitCx + root.eggOrbitR - ufoText.implicitWidth / 2
                    y: root.eggOrbitCy - ufoText.implicitHeight / 2
                    radiusX: root.eggOrbitR
                    radiusY: root.eggOrbitR
                  }
                  PathArc {
                    x: root.eggOrbitCx - root.eggOrbitR - ufoText.implicitWidth / 2
                    y: root.eggOrbitCy - ufoText.implicitHeight / 2
                    radiusX: root.eggOrbitR
                    radiusY: root.eggOrbitR
                  }
                  PathArc {
                    x: root.eggOrbitCx + root.eggOrbitR - ufoText.implicitWidth / 2
                    y: root.eggOrbitCy - ufoText.implicitHeight / 2
                    radiusX: root.eggOrbitR
                    radiusY: root.eggOrbitR
                  }
                  PathArc {
                    x: root.eggOrbitCx - root.eggOrbitR - ufoText.implicitWidth / 2
                    y: root.eggOrbitCy - ufoText.implicitHeight / 2
                    radiusX: root.eggOrbitR
                    radiusY: root.eggOrbitR
                  }
                }
              }
            }

            // Beam off, break orbit, climb away and go dark off-screen.
            ParallelAnimation {
              NumberAnimation { target: beamRect; property: "opacity"; to: 0; duration: 300 }
              NumberAnimation { target: ufoText; property: "y"; to: Style.space(8); duration: 950; easing.type: Easing.OutQuad }
              NumberAnimation {
                target: ufoText; property: "x"
                to: artContainer.width + Style.space(8)
                duration: 950
                easing.type: Easing.InQuad
              }
              SequentialAnimation {
                PauseAnimation { duration: 650 }
                NumberAnimation { target: ufoText; property: "opacity"; to: 0; duration: 300 }
              }
            }

            ScriptAction {
              script: {
                waveAnim.stop()
                moonMan.rotation = 0
                ufoText.visible = false
                moonMan.visible = false
                beamRect.visible = false
                root.eggRunning = false
              }
            }
          }

        }

        Rectangle {
          width: parent.width
          height: Style.spacing.hairline
          color: root.bar.foreground
          opacity: 0.12
        }

        Grid {
          columns: 2
          columnSpacing: Style.space(36)
          rowSpacing: Style.space(12)
          anchors.horizontalCenter: parent.horizontalCenter

          Column {
            spacing: Style.space(5)

            Text {
              text: "ILLUMINATION"
              color: Qt.darker(root.bar.foreground, 1.5)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.displayPhase.illuminationPct + "%"
              color: root.bar.foreground
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(5)

            Text {
              text: "MOON AGE"
              color: Qt.darker(root.bar.foreground, 1.5)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.displayPhase.ageDays.toFixed(1) + " days"
              color: root.bar.foreground
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(5)

            Text {
              text: "NEXT FULL"
              color: Qt.darker(root.bar.foreground, 1.5)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.formatDate(root.phase.nextFullMs)
              color: root.bar.foreground
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(5)

            Text {
              text: "NEXT NEW"
              color: Qt.darker(root.bar.foreground, 1.5)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.formatDate(root.phase.nextNewMs)
              color: root.bar.foreground
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.title
            }
          }
        }

        Item {
          width: parent.width
          height: hintLabel.height

          Text {
            id: hintLabel
            anchors.centerIn: parent
            text: "[S] Style · [I] Icon" + (root.devMode ? " · [E] Eclipse" : "")
            color: Qt.darker(root.bar.foreground, 1.5)
            font.family: root.bar.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          // Dev badge appears only while dev mode is active.
          Text {
            id: devBadge
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: root.devMode
            text: "Dev"
            color: Color.accent
            font.underline: true
            font.bold: true
            font.family: root.bar.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          // Eclipse preview badge sits left of the Dev badge.
          Text {
            anchors.right: devBadge.visible ? devBadge.left : parent.right
            anchors.rightMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            visible: root.devMode && root.devEclipseStage > 0
            text: root.devEclipsePreview && root.devEclipsePreview.kind === "total"
                  ? "Eclipse:T" : "Eclipse:P"
            color: Color.urgent
            font.bold: true
            font.family: root.bar.fontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }
      }
    }
  }
}
