import QtQuick
import Quickshell
// Provides IpcHandler below — NOT removable.
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model
import "Painters.js" as Painters
import "art/stars.js" as Stars

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

  // Null-safe theme & font accessors (root.bar is null briefly before
  // BarWidget's injectPanel() runs after Loader completion).
  readonly property color fgColor: root.bar ? root.bar.foreground : Commons.Color.foreground
  readonly property color mutedFg: Qt.darker(fgColor, 1.5)
  readonly property string uiFont: root.bar ? root.bar.fontFamily : Style.font.family
  readonly property string glyphFont: Style.resolvedFontFamily !== "monospace"
      ? Style.resolvedFontFamily : "JetBrainsMono Nerd Font"

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
    if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
      root.bar.setCenterHoverRevealSuppressed(value)
    else if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function sendNotification(summary, body) {
    if (!root.bar) return
    var safeSummary = String(summary).replace(/'/g, "'\\''")
    var cmd = "omarchy-notification-send --app-name 'Luna' -g '" + Model.PLAIN_GLYPHS[4] + "' '" + safeSummary + "'"
    if (body) {
      var safeBody = String(body).replace(/'/g, "'\\''")
      cmd += " '" + safeBody + "'"
    }
    cmd += " --exec omarchy-shell salmun-nister.luna open"
    root.bar.run(cmd)
  }

  // ---- Settings (flat keys on the bar-layout entry; see README) ----
  function _bool(value, fallback) {
    if (value === undefined || value === null) return fallback
    if (typeof value === "boolean") return value
    return String(value).toLowerCase() === "true"
  }

  // Pill icon flavor: plain monochrome Nerd Font glyph by default (inherits
  // the bar's theme text color), or color emoji when set to false.
  readonly property bool plainIcon: _bool(setting("plainIcon", true), true)

  // Append illumination percentage to the bar pill when enabled.
  readonly property bool showPercent: _bool(setting("showPercent", false), false)

  // Desktop notifications when a real umbral eclipse begins or enters totality.
  readonly property bool notifyEclipse: _bool(setting("notifyEclipse", true), true)

  // Last-used style is persisted straight into this widget's shell.json
  // layout entry; fail-safe default is blocks.
  readonly property var artStyles: ["blocks", "braille", "ascii", "vector", "cartoon", "clay"]
  readonly property string artStyle: {
    var s = String(setting("artStyle", "blocks")).toLowerCase()
    return artStyles.indexOf(s) >= 0 ? s : "blocks"
  }

  readonly property bool isTextArtStyle: artStyle === "blocks" || artStyle === "braille" || artStyle === "ascii"

  readonly property int artRows: {
    var n = parseInt(setting("artRows", 19), 10)
    if (isNaN(n)) n = 19
    n = Math.max(9, Math.min(41, n))
    return n % 2 === 0 ? n + 1 : n
  }

  // Clay plates crossfade between the two states either side of the current
  // phase. Off gives hard cuts at the midpoint between plates.
  readonly property bool clayBlend: _bool(setting("clayBlend", true), true)

  // Preload clay textures once the popup opens (or on startup if clay is
  // active) so switching into clay is instantaneous while keeping startup
  // light for users who haven't opened the popup yet.
  property bool clayLoaded: false

  // The plates are 512px squares whose painted disc is ~81% of the width
  // (a transparent margin surrounds it). Scaling by 1/that puts the clay moon
  // at the same diameter the computed styles draw.
  readonly property real clayDiscFrac: 0.810

  // artRows shapes the text-art grid; the clay plates have a fixed image
  // size. Keeping clay at the default 19 rows means the 512px plates are
  // never upscaled.
  readonly property int layoutRows: artStyle === "clay" ? 19 : artRows

  readonly property var clayMix: Model.clayPlateMix(displayFraction, clayBlend)

  // The base plate stays opaque; only the incoming plate fades in. Stacking
  // two semi-transparent layers would let the panel background show through
  // and bias the blend toward the top plate.
  function clayPlateOpacity(i) {
    if (root.artStyle !== "clay") return 0
    if (i === clayMix.base) return 1
    return i === clayMix.top ? clayMix.k : 0
  }

  function clayPlateZ(i) {
    return i === clayMix.top ? 1 : 0
  }

  // Hemisphere is explicit-only: "south" mirrors the art and glyphs, any
  // other value (or unset) keeps the default north-up view.
  readonly property bool southUp: {
    var explicitHemi = String(setting("hemisphere", "")).trim().toLowerCase()
    return explicitHemi === "south"
  }

  function cycleArtStyle(step) {
    var delta = step === undefined ? 1 : step
    var idx = artStyles.indexOf(artStyle)
    var len = artStyles.length
    persistSettings({ artStyle: artStyles[((idx + delta) % len + len) % len] })
  }

  function togglePlainIcon() {
    persistSettings({ plainIcon: !plainIcon })
  }

  function toggleShowPercent() {
    persistSettings({ showPercent: !showPercent })
  }

  function toggleClayBlend() {
    persistSettings({ clayBlend: !clayBlend })
  }

  function stepArtRows(delta) {
    var next = Math.max(9, Math.min(41, artRows + delta))
    if (next % 2 === 0) next = delta > 0 ? Math.min(41, next + 1) : Math.max(9, next - 1)
    if (next !== artRows) persistSettings({ artRows: next })
  }

  // Applied locally immediately so style/setting changes redraw on the very
  // next frame. Writing shell.json triggers a full bar-config reload, so while
  // the popup is open we defer persistence until it closes (zero stutter while
  // browsing styles) and debounce changes made while closed (e.g. middle-click).
  property var _pendingEntry: null

  Timer {
    id: persistTimer
    interval: 400
    repeat: false
    onTriggered: root.flushPersist()
  }

  function flushPersist() {
    if (!_pendingEntry) return
    var entry = _pendingEntry
    _pendingEntry = null
    if (persistTimer.running) persistTimer.stop()
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function persistSettings(values) {
    var entry = { id: root.moduleName }
    for (var existing in root.settings)
      if (existing !== "id") entry[existing] = root.settings[existing]
    for (var key in values) entry[key] = values[key]

    root.settings = entry
    if (root.hostWidget && "settings" in root.hostWidget) root.hostWidget.settings = entry
    _pendingEntry = entry
    if (!root.opened) persistTimer.restart()
  }

  Component.onCompleted: {
    if (artStyle === "clay") clayLoaded = true
  }

  Component.onDestruction: {
    flushPersist()
  }

  // ---- Phase & eclipse state ----
  SystemClock { id: clock; precision: SystemClock.Minutes }

  // Interactive date scrubber (days offset from today; resets when panel closes).
  property int scrubDayOffset: 0

  function scrubDay(delta) {
    if (devMode) return
    scrubDayOffset = Math.max(-3650, Math.min(3650, scrubDayOffset + delta))
  }

  function resetScrub() {
    scrubDayOffset = 0
  }

  function scrubToPhaseIndex(slotIndex) {
    if (devMode) return
    var slot = viewLunationSlots[slotIndex]
    if (!slot) return
    if (slotIndex === livePhaseSlot && Math.abs(slot.ms - liveNowMs) < 3 * 86400000) {
      scrubDayOffset = 0
      return
    }
    var days = Math.round((slot.ms - liveNowMs) / 86400000)
    scrubDayOffset = Math.max(-3650, Math.min(3650, days))
  }

  readonly property real liveNowMs: clock.date.getTime()
  readonly property real viewNowMs: liveNowMs + scrubDayOffset * 86400000

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

  // Live astronomical state (drives bar pill, notifications, and live alerts).
  readonly property var phase: Model.moonState(liveNowMs, southUp)
  readonly property int livePhaseSlot: Model.plateIndex(phase.fraction)
  readonly property var eclipse: Model.eclipseState(liveNowMs)

  // Scrubber-aware panel state (zero extra work when scrubDayOffset === 0).
  readonly property var viewPhase: scrubDayOffset === 0
      ? phase : Model.moonState(viewNowMs, southUp)
  readonly property var viewLunationSlots: Model.lunationSlots(viewNowMs)
  readonly property var viewEclipse: scrubDayOffset === 0
      ? eclipse : Model.eclipseState(viewNowMs)
  readonly property var upcomingEclipse: Model.nextEclipse(viewNowMs)

  // Shown as a full-width row below the stats grid only when an umbral
  // eclipse is within 30 days (and not currently active), or in dev mode
  // when previewing the upcoming-eclipse stage (E × 3).
  readonly property var soonEclipse: {
    if (artEclipse || !upcomingEclipse) return null
    if (devMode) return devEclipseStage === 3 ? upcomingEclipse : null
    var delta = upcomingEclipse.u1Ms - viewNowMs
    return (delta > 0 && delta <= 30 * 86400000) ? upcomingEclipse : null
  }

  // Desktop notification when a real umbral eclipse starts or hits totality.
  property string _lastNotifiedEclipseKey: ""
  onEclipseChanged: {
    if (!notifyEclipse || !eclipse) return
    var stage = (eclipse.kind === "total" && eclipse.depth >= 0.99) ? "totality" : "start"
    var key = eclipse.greatestMs + ":" + stage
    if (key === _lastNotifiedEclipseKey) return
    _lastNotifiedEclipseKey = key
    var title = stage === "totality" ? "Total Lunar Eclipse" : eclipse.label
    var body = stage === "totality"
        ? "Totality has begun — click to view"
        : "Umbral eclipse has begun — click to view"
    sendNotification(title, body)
  }

  // Eclipse state driving panel visuals: dev preview XOR view event.
  readonly property var artEclipse: devMode ? devEclipsePreview : viewEclipse

  // Bar pill mirrors dev mode previews (for testing tint/halo/hemisphere)
  // while staying anchored to the real moon during normal date scrubbing.
  readonly property var pillPhase: devMode ? displayPhase : phase
  readonly property var pillEclipse: devMode ? devEclipsePreview : eclipse
  readonly property real pillEclipseDepth: pillEclipse ? pillEclipse.depth : 0

  readonly property string pillGlyph: plainIcon
      ? Model.plainGlyphFor(pillPhase.fraction, displaySouthUp)
      : pillPhase.glyph
  readonly property string label: pillGlyph
  readonly property string percentLabel: showPercent ? (pillPhase.illuminationPct + "%") : ""
  readonly property string tooltipText: pillPhase.phaseName + " · " + pillPhase.illuminationPct + "% illuminated"
      + (pillEclipse ? " — " + pillEclipse.label : "")
  readonly property string notificationSummary: phase.glyph + " " + phase.phaseName + " — " + phase.illuminationPct + "% illuminated"
      + (phase.fullMoon ? " (" + phase.fullMoon.label + ")" : "")
      + (eclipse ? " [" + eclipse.label + "]" : "")

  readonly property string moonArt: Model.renderMoonArt(
      displayFraction, artStyle, layoutRows, displaySouthUp, artCellAspect, artEclipse)

  // Hovered crater / mare name (populated for blocks/braille/ascii styles).
  property string hoveredFeature: ""

  // Decorative sky around the disk: REGENERATED with new random positions
  // every time the popup opens or the style/size changes. Rejection sampling
  // keeps glyphs inside an edge band, clear of the lunar disk, and spaced
  // apart from each other. Twinkle loops are gated on `opened && artStyle !== "clay"`.
  property var starField: []

  function _shuffleStars() {
    var glyphs = ["\u2726", "\u2727", "+", "\u00B7"]
    var W = artContainer.width
    var H = artContainer.height
    if (W <= 0 || H <= 0 || !moonText.implicitHeight) return
    var cx = W / 2
    var cy = H / 2
    var clearR = Math.max(moonText.implicitWidth, moonText.implicitHeight) / 2 + Style.space(16)
    var placed = []
    var tries = 0
    while (placed.length < 12 && tries < 800) {
      tries++
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

  onOpenedChanged: {
    if (opened) {
      clayLoaded = true
      Qt.callLater(_shuffleStars)
      if (moonCanvas.visible) moonCanvas.requestPaint()
      if (clayShadow.visible) clayShadow.requestPaint()
    } else {
      scrubDayOffset = 0
      hoveredFeature = ""
      stopEggs()
      if (_pendingEntry) persistTimer.restart()
    }
  }
  onArtStyleChanged: {
    if (artStyle === "clay") clayLoaded = true
    hoveredFeature = ""
    stopEggs()
    if (root.opened && artStyle !== "clay") Qt.callLater(_shuffleStars)
  }
  onArtRowsChanged: {
    if (root.opened && artStyle !== "clay") Qt.callLater(_shuffleStars)
  }

  // Canvas faces wink their right eye at random: uniform 10–60 s gaps
  // (about 35 s on average), same cadence for both styles.
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
    interval: 50
    repeat: true
    // Active eclipse previews pin the phase at full moon; off & upcoming keep cycling.
    running: root.devMode && root.devEclipsePreview === null && root.opened
    onTriggered: root.devFraction = (root.devFraction + 0.005) % 1.0
  }

  function toggleDev() {
    devMode = !devMode
    if (devMode) {
      devFraction = viewPhase.fraction
      devSouth = southUp
      devQuiet = false
    } else {
      devEclipseStage = 0
    }
    winkTick.remainMs = nextWinkMs()
  }

  property bool devSouth: false
  property bool devQuiet: false
  readonly property bool displaySouthUp: devMode ? devSouth : southUp

  function toggleDevHemisphere() {
    if (!devMode) return
    devSouth = !devSouth
  }

  function toggleDevQuiet() {
    if (!devMode) return
    devQuiet = !devQuiet
  }

  // Eclipse preview: while dev mode is on, E cycles partial -> total -> soon -> off.
  property int devEclipseStage: 0   // 0 = off · 1 = partial · 2 = total · 3 = soon row
  property real devEclipseT: 0      // 0..1 progress through the event
  property real _previewEclipseU1Ms: 0

  Timer {
    id: devEclipseAnim
    interval: 50                    // 200 ticks × 0.005 = 10 s smooth sweep (20 fps)
    repeat: true
    running: root.devMode && (root.devEclipseStage === 1 || root.devEclipseStage === 2) && root.opened
    onTriggered: root.devEclipseT = (root.devEclipseT + 0.005) % 1.0
  }

  readonly property var devEclipsePreview: {
    if ((devEclipseStage !== 1 && devEclipseStage !== 2) || !devMode) return null
    var total = devEclipseStage === 2
    var t = devEclipseT
    var peak = total ? 1.0 : 0.93
    var d
    if (!total) d = peak * (t <= 0.5 ? t / 0.5 : (1 - t) / 0.5)
    else if (t < 0.3) d = t / 0.3
    else if (t <= 0.7) d = 1.0
    else d = (1 - t) / 0.3
    var spanMs = 220 * 60000        // 3h 40m umbral transit
    var u1 = (_previewEclipseU1Ms > 0 ? _previewEclipseU1Ms : liveNowMs)
    var greatest = u1 + Math.round(spanMs * 0.5)
    var u2 = total ? u1 + Math.round(spanMs * 0.3) : greatest
    var u3 = total ? u1 + Math.round(spanMs * 0.7) : greatest
    var u4 = u1 + spanMs
    var simNow = u1 + Math.round(t * spanMs)
    return { kind: total ? "total" : "partial",
             label: total ? "Total Lunar Eclipse" : "Partial Lunar Eclipse",
             depth: Math.max(0, Math.min(1, d)), peak: peak,
             gamma: total ? 0.12 : -0.5,
             progress: t,
             u1Ms: u1, u2Ms: u2, greatestMs: greatest, u3Ms: u3, u4Ms: u4,
             simNowMs: simNow }
  }

  function cycleDevEclipse() {
    if (!devMode) return
    devEclipseStage = (devEclipseStage + 1) % 4
    devEclipseT = 0
    _previewEclipseU1Ms = liveNowMs
  }

  readonly property real displayFraction: devEclipsePreview ? 0.5
      : devMode ? devFraction : viewPhase.fraction

  // Lightweight display state in dev mode (avoids recomputing Meeus syzygies
  // every tick and stays pinned to Full Moon during dev eclipse previews).
  readonly property var displayPhase: root.devMode
      ? Model.moonDisplayState(displayFraction, displaySouthUp)
      : root.viewPhase

  // ---- Easter eggs ----
  // 1) Vector: smile tap sticks out the tongue.
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

  // 2) Cartoon: nose boop triggers joyful star-eyes + squash-and-stretch bounce.
  property bool cartoonBooped: false

  Timer {
    id: boopTimer
    interval: 1400
    repeat: false
    onTriggered: root.cartoonBooped = false
  }

  function boopCartoon() {
    cartoonBooped = true
    boopTimer.restart()
    boopAnim.restart()
  }

  // 3) Clay: top-rim tap pops a little theme-colored pennant out of the crest.
  property bool clayFlagRunning: false

  function popClayFlag() {
    if (clayFlagRunning || !root.opened) return
    clayFlagRunning = true
    clayFlagSequence.restart()
  }

  // 4) Text styles (blocks / braille / ascii): Mare Tranquillitatis tap lands
  // a tiny Apollo 11 Eagle module on Tranquillity Base.
  property bool eagleRunning: false

  function startEagle() {
    if (eagleRunning || !root.opened) return
    eagleRunning = true
    eagleSequence.restart()
  }

  function triggerEgg() {
    if (!root.opened) root.openFromHotkey()
    Qt.callLater(function() {
      if (!root.opened) return
      if (root.isTextArtStyle) root.startEagle()
      else if (root.artStyle === "vector") root.stickTongue()
      else if (root.artStyle === "cartoon") root.boopCartoon()
      else if (root.artStyle === "clay") root.popClayFlag()
    })
  }

  function stopEggs() {
    if (eagleSequence.running) eagleSequence.stop()
    if (thrusterAnim.running) thrusterAnim.stop()
    eagleLander.visible = false
    eagleLander.opacity = 0
    eagleFlame.opacity = 0
    eagleBanner.visible = false
    eagleBanner.opacity = 0
    eagleRunning = false

    if (clayFlagSequence.running) clayFlagSequence.stop()
    clayFlag.visible = false
    clayFlag.opacity = 0
    clayFlagRunning = false

    if (boopAnim.running) boopAnim.stop()
    if (boopTimer.running) boopTimer.stop()
    if (tongueTimer.running) tongueTimer.stop()
    moonCanvas.scale = 1.0
    cartoonBooped = false
    tongueOut = false
  }

  // ---- Date & duration formatting ----
  function formatDate(ms) {
    return Qt.formatDate(new Date(ms), "ddd d MMM")
  }

  function formatShortDate(ms) {
    return Qt.formatDate(new Date(ms), "MMM d")
  }

  function formatScrubDate(ms) {
    var sign = scrubDayOffset > 0 ? "+" : ""
    return Qt.formatDate(new Date(ms), "ddd d MMM yyyy") + " (" + sign + scrubDayOffset + "d)"
  }

  function formatCountdown(deltaMs) {
    if (deltaMs <= 60000) return "<1m"
    var mins = Math.round(deltaMs / 60000)
    if (mins < 60) return mins + "m"
    var h = Math.floor(mins / 60)
    var m = mins % 60
    return m > 0 ? (h + "h " + m + "m") : (h + "h")
  }

  function formatClockTime(ms) {
    return Qt.formatTime(new Date(ms), "HH:mm")
  }

  function formatEclipseHeadline(ecl) {
    if (!ecl) return ""
    if (!ecl.u4Ms) return ecl.label
    var now = ecl.simNowMs !== undefined ? ecl.simNowMs : viewNowMs
    if (ecl.kind === "total" && now < ecl.u2Ms)
      return ecl.label + " · Totality in " + formatCountdown(ecl.u2Ms - now)
    if (ecl.kind === "total" && now <= ecl.u3Ms)
      return ecl.label + " · Totality ends in " + formatCountdown(ecl.u3Ms - now)
    if (now < ecl.greatestMs)
      return ecl.label + " · Peak in " + formatCountdown(ecl.greatestMs - now)
    return ecl.label + " · Ends in " + formatCountdown(ecl.u4Ms - now)
  }

  function formatSoonEclipse(ecl) {
    if (!ecl) return ""
    var dateStr = Qt.formatDate(new Date(ecl.greatestMs), "ddd d MMM")
    if (ecl.kind === "total") return dateStr + " · Total Lunar Eclipse"
    return dateStr + " · Partial (" + Math.round(ecl.magnitude * 100) + "%)"
  }

  IpcHandler {
    target: root.ipcTarget

    function open() { root.openFromHotkey() }
    function close() { root.close() }
    function show() { root.openFromHotkey() }
    function hide() { root.close() }
    function toggle() { root.toggle() }
    function restyle() { root.cycleArtStyle(1) }
    function icon() { root.togglePlainIcon() }
    function egg() { root.triggerEgg() }
    function dev() { root.toggleDev() }

    // Live layout diagnostics: `omarchy-shell salmun-nister.luna status`
    // (CLI drops return values, so also log to the qs log).
    function status() {
      var s = JSON.stringify({
        style: root.artStyle,
        rows: root.layoutRows,
        columns: Math.max(root.layoutRows, Math.round(root.layoutRows * root.artCellAspect)),
        artRows: root.artRows,
        cellAspect: Math.round(root.artCellAspect * 1000) / 1000,
        artPx: [Math.round(moonText.implicitWidth), Math.round(moonText.implicitHeight)],
        contentW: panel.contentWidth,
        contentH: panel.contentHeight,
        egg: root.eagleRunning || root.clayFlagRunning || root.cartoonBooped || root.tongueOut,
        dev: root.devMode,
        scrubDays: root.scrubDayOffset,
        quiet: root.devQuiet,
        southUp: root.displaySouthUp,
        eclipse: (function() {
          var e = root.artEclipse
          if (!e) return null
          var f = Model.umbraFrame(e)
          var flip = root.displaySouthUp ? -1 : 1
          return { kind: e.kind, depth: Math.round(e.depth * 1000) / 1000,
                   label: e.label, devPreview: root.devMode,
                   progress: Math.round(e.progress * 1000) / 1000,
                   // Umbra centre and radius in disc radii (south view
                   // mirrors the x axis on screen, as the renderers do).
                   shadow: [Math.round(flip * f.ox * 1000) / 1000,
                            Math.round(f.oy * 1000) / 1000,
                            Math.round(f.r * 1000) / 1000] }
        })(),
        soonEclipse: root.soonEclipse ? root.formatSoonEclipse(root.soonEclipse) : null,
        plainIcon: root.plainIcon,
        showPercent: root.showPercent,
        frac: Math.round(root.displayFraction * 1000) / 1000,
        scene: {
          eagleAnchor: [Math.round(artContainer.eggManX), Math.round(artContainer.eggManY)],
          contW: Math.round(artContainer.width),
          contH: Math.round(artContainer.height)
        },
        stars: root.starField.map(function(st) { return [+st.fx.toFixed(3), +st.fy.toFixed(3)] })
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
    contentWidth: panel.fittedContentWidth(Math.max(Style.space(310), Math.ceil(artContainer.width)))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onReturnRequested: root.cycleArtStyle(1)
      onTextKey: function(t, modifiers) {
        if (t === "S" || (t === "s" && (modifiers & Qt.ShiftModifier))) root.cycleArtStyle(-1)
        else if (t === "s") root.cycleArtStyle(1)
        else if (t === "i" || t === "I") root.togglePlainIcon()
        else if (t === "%") root.toggleShowPercent()
        else if (t === "b" || t === "B") root.toggleClayBlend()
        else if (t === "+" || t === "=") root.stepArtRows(2)
        else if (t === "-") root.stepArtRows(-2)
        else if (t === "[" || t === ",") root.scrubDay(-1)
        else if (t === "]" || t === ".") root.scrubDay(1)
        else if (t === "t" || t === "T" || t === "0") root.resetScrub()
        else if (t === "e" || t === "E") root.cycleDevEclipse()
        else if (t === "n" || t === "N") root.toggleDevHemisphere()
        else if (t === "q" || t === "Q") root.toggleDevQuiet()
        else if (t === "?") root.toggleDev()
      }
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(12)

        // Header row: phase title flanked by subtle day-stepper buttons.
        Item {
          width: parent.width
          height: title.implicitHeight

          Text {
            id: prevDayBtn
            visible: !root.devMode
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "‹"
            color: prevDayHover.hovered ? root.fgColor : root.mutedFg
            font.family: root.uiFont
            font.pixelSize: Style.font.subtitle
            font.bold: true

            HoverHandler { id: prevDayHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { onTapped: root.scrubDay(-1) }
          }

          Text {
            id: title
            anchors.centerIn: parent
            text: root.displayPhase.phaseName
            color: root.fgColor
            font.family: root.uiFont
            font.pixelSize: Style.font.subtitle
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
          }

          Text {
            id: nextDayBtn
            visible: !root.devMode
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: "›"
            color: nextDayHover.hovered ? root.fgColor : root.mutedFg
            font.family: root.uiFont
            font.pixelSize: Style.font.subtitle
            font.bold: true

            HoverHandler { id: nextDayHover; cursorShape: Qt.PointingHandCursor }
            TapHandler { onTapped: root.scrubDay(1) }
          }
        }

        // Scrubber date indicator (clickable to snap back to today).
        Text {
          width: parent.width
          visible: !root.devMode && root.scrubDayOffset !== 0
          text: root.formatScrubDate(root.viewNowMs) + " · [T] Today"
          color: Commons.Color.accent
          font.family: root.uiFont
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter

          HoverHandler { cursorShape: Qt.PointingHandCursor }
          TapHandler { onTapped: root.resetScrub() }
        }

        // Traditional full-moon name & Supermoon / Micromoon / Blue Moon badge.
        Text {
          width: parent.width
          visible: !root.devMode && root.viewPhase.fullMoon !== null
          text: root.viewPhase.fullMoon ? root.viewPhase.fullMoon.label : ""
          color: (root.viewPhase.fullMoon && (root.viewPhase.fullMoon.isSuper || root.viewPhase.fullMoon.isBlue))
              ? Commons.Color.accent : root.mutedFg
          font.family: root.uiFont
          font.pixelSize: Style.font.bodySmall
          horizontalAlignment: Text.AlignHCenter
        }

        // Active lunar eclipse banner (with live countdown when not in dev mode).
        Text {
          width: parent.width
          visible: root.artEclipse !== null
          text: root.formatEclipseHeadline(root.artEclipse)
          color: Commons.Color.urgent
          font.family: root.uiFont
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          horizontalAlignment: Text.AlignHCenter
        }

        Item {
          id: artContainer
          anchors.horizontalCenter: parent.horizontalCenter
          // Breathing room around the moon and star field; constant across all
          // styles so switching to/from clay never resizes the popup.
          width: moonText.implicitWidth + Style.space(80)
          height: Math.max(moonText.implicitHeight + Style.space(48), Math.ceil(clayStack.height))
          clip: true

          // Scroll wheel over the moon scrubs ±1 day.
          WheelHandler {
            acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
            onWheel: function(event) {
              if (event.angleDelta.y > 0) root.scrubDay(1)
              else if (event.angleDelta.y < 0) root.scrubDay(-1)
            }
          }

          // One tap target for every style so overlapping layers never
          // advance two styles at once.
          TapHandler {
            id: artTap
            onTapped: function() {
              var p = artTap.point.position
              if (root.artStyle === "clay") {
                var cp = clayStack.mapFromItem(artContainer, p.x, p.y)
                if (!clayStack.contains(cp)) return
                if (Model.clayFlagHit(cp.x, cp.y, clayStack.width, clayStack.height, root.clayDiscFrac))
                  root.popClayFlag()
                else
                  root.cycleArtStyle(1)
                return
              }
              var q = moonText.mapFromItem(artContainer, p.x, p.y)
              if (q.x < 0 || q.y < 0 ||
                  q.x > moonText.implicitWidth || q.y > moonText.implicitHeight)
                return
              var fx = q.x / Math.max(1, moonText.implicitWidth)
              var fy = q.y / Math.max(1, moonText.implicitHeight)
              if (root.isTextArtStyle && Model.seaHit(fx, fy, root.displaySouthUp))
                root.startEagle()
              else if (root.artStyle === "vector" &&
                       Model.vecMouthHit(q.x, q.y, moonText.implicitWidth, moonText.implicitHeight))
                root.stickTongue()
              else if (root.artStyle === "cartoon" &&
                       Model.cartoonFaceHit(q.x, q.y, moonText.implicitWidth, moonText.implicitHeight))
                root.boopCartoon()
              else
                root.cycleArtStyle(1)
            }
          }

          // Dev-mode status line (bottom-left).
          Text {
            anchors.left: parent.left
            anchors.leftMargin: Style.space(12)
            anchors.bottom: parent.bottom
            visible: root.devMode && !root.devQuiet
            text: {
              var parts = [root.artStyle]
              if (root.devEclipseStage === 1) parts.push("eclipse:partial")
              else if (root.devEclipseStage === 2) parts.push("eclipse:total")
              else if (root.devEclipseStage === 3) parts.push("eclipse:soon")
              parts.push(root.displaySouthUp ? "south" : "north")
              return parts.join(" | ")
            }
            color: Commons.Color.accent
            font.family: root.uiFont
            font.pixelSize: Style.font.caption
          }

          // Interactive crater / mare hover label (bottom-right, text-art styles).
          Text {
            anchors.right: parent.right
            anchors.rightMargin: Style.space(12)
            anchors.bottom: parent.bottom
            visible: root.hoveredFeature !== "" && root.isTextArtStyle && !root.eagleRunning
            text: root.hoveredFeature
            color: root.mutedFg
            font.family: root.uiFont
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
              if (d <= 0) return root.fgColor
              return Qt.tint(root.fgColor, Qt.rgba(Commons.Color.urgent.r, Commons.Color.urgent.g, Commons.Color.urgent.b, Math.min(1, d * 0.85)))
            }
            font.family: "monospace"
            font.pixelSize: Style.font.caption

            HoverHandler {
              id: moonHover
              cursorShape: Qt.PointingHandCursor
              onHoveredChanged: if (!hovered) root.hoveredFeature = ""
              onPointChanged: {
                if (!hovered || !root.isTextArtStyle || moonText.implicitWidth <= 0 || moonText.implicitHeight <= 0) {
                  root.hoveredFeature = ""
                  return
                }
                var fx = point.position.x / moonText.implicitWidth
                var fy = point.position.y / moonText.implicitHeight
                root.hoveredFeature = Model.featureAt(fx, fy, root.displayFraction, root.displaySouthUp) || ""
              }
            }
          }

          // Canvas-drawn styles: "vector" and "cartoon". The text layer above
          // stays as an invisible placeholder so card sizing, tap mapping, and
          // star layout keep their geometry.
          Canvas {
            id: moonCanvas
            anchors.fill: moonText
            visible: root.artStyle === "vector" || root.artStyle === "cartoon"
            transformOrigin: Item.Center

            readonly property var _sig: [
              width, height, root.displayFraction, root.winkNow,
              root.artStyle, root.tongueOut, root.cartoonBooped,
              root.fgColor.toString(),
              Commons.Color.background.toString(),
              Commons.Color.accent.toString(),
              JSON.stringify(root.artEclipse)
            ]
            on_SigChanged: if (visible && root.opened) requestPaint()
            onVisibleChanged: if (visible && root.opened) requestPaint()

            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              var ecl = root.artEclipse
              var umbra = (ecl && ecl.depth > 0) ? Model.umbraFrame(ecl) : null
              if (root.artStyle === "cartoon") {
                Painters.paintHose(ctx, width, height, {
                  fraction: root.displayFraction,
                  wink: root.winkNow,
                  booped: root.cartoonBooped,
                  fg: root.fgColor,
                  bg: Commons.Color.popups ? Commons.Color.popups.background : Commons.Color.background,
                  baseBg: Commons.Color.background,
                  accent: Commons.Color.accent,
                  eclipse: ecl,
                  umbra: umbra
                })
              } else {
                Painters.paintVector(ctx, width, height, {
                  fraction: root.displayFraction,
                  wink: root.winkNow,
                  tongueOut: root.tongueOut,
                  eclipse: ecl,
                  umbra: umbra
                })
              }
            }
          }

          SequentialAnimation {
            id: boopAnim
            NumberAnimation { target: moonCanvas; property: "scale"; to: 1.09; duration: 110; easing.type: Easing.OutQuad }
            NumberAnimation { target: moonCanvas; property: "scale"; to: 0.94; duration: 110; easing.type: Easing.InOutQuad }
            NumberAnimation { target: moonCanvas; property: "scale"; to: 1.03; duration: 120; easing.type: Easing.InOutQuad }
            NumberAnimation { target: moonCanvas; property: "scale"; to: 1.00; duration: 140; easing.type: Easing.OutQuad }
          }

          // ---- Clay plates ----
          Item {
            id: clayStack
            visible: root.artStyle === "clay"
            width: Math.min(moonText.width, moonText.height) * 0.97 / root.clayDiscFrac
            height: width
            anchors.centerIn: moonText

            // Clay stars: baked sky cut into individual star images.
            Item {
              id: clayStars
              readonly property real inset: 0.93
              anchors.fill: parent
              transform: [
                Scale {
                  origin.x: clayStars.width / 2
                  origin.y: clayStars.height / 2
                  xScale: clayStars.inset
                  yScale: clayStars.inset
                },
                Scale {
                  origin.x: clayStars.width / 2
                  origin.y: clayStars.height / 2
                  xScale: root.displaySouthUp ? -1 : 1
                }
              ]

              Repeater {
                model: Stars.STARS

                Image {
                  required property var modelData
                  required property int index

                  source: root.clayLoaded ? Qt.resolvedUrl("art/star-" + index + ".webp") : ""
                  width: parent.width * Stars.CROP
                  height: width
                  x: modelData.fx * parent.width - width / 2
                  y: modelData.fy * parent.height - height / 2
                  fillMode: Image.PreserveAspectFit
                  smooth: true
                  asynchronous: true
                  opacity: 0.4

                  SequentialAnimation on opacity {
                    running: root.opened && root.artStyle === "clay"
                    loops: Animation.Infinite
                    NumberAnimation {
                      from: 1; to: 0.4
                      duration: 2300 + index * 420
                      easing.type: Easing.InOutQuad
                    }
                    NumberAnimation {
                      from: 0.4; to: 1
                      duration: 2300 + index * 420
                      easing.type: Easing.InOutQuad
                    }
                  }
                }
              }
            }

            Repeater {
              model: 8

              Image {
                required property int index
                anchors.fill: parent
                source: root.clayLoaded ? Qt.resolvedUrl("art/clay-" + index + ".webp") : ""
                fillMode: Image.PreserveAspectFit
                smooth: true
                mirror: root.displaySouthUp
                asynchronous: true
                z: root.clayPlateZ(index)
                opacity: root.clayPlateOpacity(index)
              }
            }

            HoverHandler { cursorShape: Qt.PointingHandCursor }
          }

          // Clay flag easter egg: tiny pennant popping out of the upper pole.
          Text {
            id: clayFlag
            visible: false
            opacity: 0
            text: "\u2691"
            color: Commons.Color.accent
            font.family: root.uiFont
            font.pixelSize: Style.font.title
            x: clayStack.x + clayStack.width / 2 - implicitWidth / 2
            y: clayStack.y + clayStack.height * (0.495 - root.clayDiscFrac / 2) - implicitHeight * 0.7
            transformOrigin: Item.Bottom
          }

          SequentialAnimation {
            id: clayFlagSequence
            ScriptAction {
              script: {
                clayFlag.visible = true
                clayFlag.opacity = 0
                clayFlag.scale = 0.2
                clayFlag.rotation = -14
              }
            }
            ParallelAnimation {
              NumberAnimation { target: clayFlag; property: "opacity"; to: 1; duration: 220 }
              NumberAnimation { target: clayFlag; property: "scale"; to: 1.0; duration: 360; easing.type: Easing.OutBack }
              NumberAnimation { target: clayFlag; property: "rotation"; to: 4; duration: 360; easing.type: Easing.OutQuad }
            }
            NumberAnimation { target: clayFlag; property: "rotation"; to: -5; duration: 280; easing.type: Easing.InOutSine }
            NumberAnimation { target: clayFlag; property: "rotation"; to: 3; duration: 280; easing.type: Easing.InOutSine }
            PauseAnimation { duration: 900 }
            ParallelAnimation {
              NumberAnimation { target: clayFlag; property: "opacity"; to: 0; duration: 260 }
              NumberAnimation { target: clayFlag; property: "scale"; to: 0.3; duration: 260; easing.type: Easing.InBack }
            }
            ScriptAction {
              script: {
                clayFlag.visible = false
                root.clayFlagRunning = false
              }
            }
          }

          // Clay eclipse shadow painted over the sculpted disc.
          Canvas {
            id: clayShadow
            anchors.centerIn: clayStack
            width: clayStack.width
            height: width
            visible: root.artStyle === "clay" && root.artEclipse !== null

            readonly property var _sig: [
              width, root.displaySouthUp,
              JSON.stringify(root.artEclipse),
              Commons.Color.urgent.toString()
            ]
            on_SigChanged: if (visible && root.opened) requestPaint()
            onVisibleChanged: if (visible && root.opened) requestPaint()

            onPaint: {
              var ctx = getContext("2d")
              ctx.reset()
              if (!root.artEclipse || root.artEclipse.depth <= 0) return
              Painters.paintClayShadow(ctx, width, height, {
                eclipse: root.artEclipse,
                umbra: Model.umbraFrame(root.artEclipse),
                southUp: root.displaySouthUp,
                discFrac: root.clayDiscFrac,
                alert: Commons.Color.urgent
              })
            }
          }

          // Twinkling text starfield (stopped & hidden when in clay style).
          Repeater {
            model: root.starField

            delegate: Text {
              required property var modelData
              required property int index

              visible: root.artStyle !== "clay"
              x: modelData.fx * parent.width - implicitWidth / 2
              y: modelData.fy * parent.height - implicitHeight / 2
              text: modelData.glyph
              color: root.fgColor
              font.family: "monospace"
              font.pixelSize: index % 2 === 0 ? Style.font.caption : Style.font.bodySmall

              SequentialAnimation on opacity {
                running: root.opened && root.artStyle !== "clay"
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

          // ---- Tranquillity Base anchor (shared by blocks / braille / ascii) ----
          readonly property real eggManX: {
            var c = Model.seaCenter(Model.EGG_SEA)
            if (!c) return 0
            var nx = root.displaySouthUp ? -c.x : c.x
            return moonText.x + ((nx + 1) / 2) * moonText.implicitWidth
          }
          readonly property real eggManY: {
            var c = Model.seaCenter(Model.EGG_SEA)
            if (!c) return 0
            return moonText.y + ((c.y + 1) / 2) * moonText.implicitHeight
          }

          // ---- Apollo 11 Eagle lander easter egg (all text/ASCII styles) ----
          Column {
            id: eagleLander
            visible: false
            opacity: 0
            x: artContainer.eggManX - width / 2
            y: Style.space(6)
            spacing: 0

            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: " /_\\ \n|===|\n/   \\"
              textFormat: Text.PlainText
              color: Commons.Color.accent
              style: Text.Outline
              styleColor: Commons.Color.background
              font.family: "monospace"
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            Text {
              id: eagleFlame
              anchors.horizontalCenter: parent.horizontalCenter
              text: " * "
              textFormat: Text.PlainText
              color: Commons.Color.urgent
              font.family: "monospace"
              font.pixelSize: Style.font.caption
              font.bold: true
              opacity: 0
            }
          }

          Text {
            id: eagleBanner
            visible: false
            opacity: 0
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            text: "THE EAGLE HAS LANDED"
            color: Commons.Color.accent
            font.family: root.uiFont
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
          }

          SequentialAnimation {
            id: thrusterAnim
            running: false
            loops: Animation.Infinite
            NumberAnimation { target: eagleFlame; property: "opacity"; to: 1.0; duration: 110 }
            NumberAnimation { target: eagleFlame; property: "opacity"; to: 0.25; duration: 110 }
          }

          SequentialAnimation {
            id: eagleSequence
            ScriptAction {
              script: {
                eagleLander.y = Style.space(6)
                eagleLander.opacity = 0
                eagleLander.visible = true
                eagleBanner.opacity = 0
                eagleBanner.visible = true
                thrusterAnim.restart()
              }
            }
            ParallelAnimation {
              NumberAnimation { target: eagleLander; property: "opacity"; to: 1; duration: 260 }
              NumberAnimation {
                target: eagleLander; property: "y"
                to: Math.max(Style.space(8), artContainer.eggManY - eagleLander.height)
                duration: 1800
                easing.type: Easing.OutCubic
              }
            }
            ScriptAction {
              script: {
                thrusterAnim.stop()
                eagleFlame.opacity = 0
              }
            }
            NumberAnimation { target: eagleBanner; property: "opacity"; to: 1; duration: 350 }
            PauseAnimation { duration: 1900 }
            ParallelAnimation {
              NumberAnimation { target: eagleLander; property: "opacity"; to: 0; duration: 400 }
              NumberAnimation { target: eagleBanner; property: "opacity"; to: 0; duration: 400 }
            }
            ScriptAction {
              script: {
                eagleLander.visible = false
                eagleBanner.visible = false
                root.eagleRunning = false
              }
            }
          }
        }

        // Mini 8-phase lunation progress strip (clickable to jump to any phase).
        Row {
          id: phaseStrip
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(10)

          Repeater {
            model: 8

            delegate: Column {
              id: phaseSlot
              required property int index
              readonly property bool active: Model.plateIndex(root.displayFraction) === index
              readonly property var slotInfo: root.viewLunationSlots[index]
              readonly property string slotGlyph: root.plainIcon
                  ? Model.plainGlyphFor(index / 8, root.displaySouthUp)
                  : Model.glyphFor(index / 8, root.displaySouthUp)
              readonly property string slotTooltip: {
                if (!slotInfo) return ""
                if (root.devMode) return slotInfo.name
                var ms = (index === root.livePhaseSlot && Math.abs(slotInfo.ms - root.liveNowMs) < 3 * 86400000)
                    ? root.liveNowMs : slotInfo.ms
                return slotInfo.name + " - " + root.formatShortDate(ms)
              }

              spacing: Style.space(3)

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: slotGlyph
                color: active ? root.fgColor : root.mutedFg
                opacity: active ? 1.0 : (stripHover.hovered ? 0.8 : 0.42)
                font.family: root.glyphFont
                font.pixelSize: Style.font.body
              }

              Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Style.space(4)
                height: width
                radius: width / 2
                color: Commons.Color.accent
                opacity: active ? 1.0 : 0.0
              }

              HoverHandler { id: stripHover; cursorShape: Qt.PointingHandCursor }
              TapHandler { onTapped: root.scrubToPhaseIndex(index) }

              PanelToolTip {
                visible: root.opened && stripHover.hovered && phaseSlot.slotTooltip !== ""
                delay: 150
                text: phaseSlot.slotTooltip
                fontFamily: root.uiFont
              }
            }
          }
        }

        Rectangle {
          width: parent.width
          height: Style.spacing.hairline
          color: root.fgColor
          opacity: 0.12
        }

        Grid {
          columns: 2
          columnSpacing: Style.space(36)
          rowSpacing: Style.space(12)
          anchors.horizontalCenter: parent.horizontalCenter

          Column {
            spacing: Style.space(4)

            Text {
              text: "ILLUMINATION"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.displayPhase.illuminationPct + "%"
              color: root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(4)

            Text {
              text: "MOON AGE"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.displayPhase.ageDays.toFixed(1) + " days"
              color: root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(4)

            Text {
              text: "NEXT FULL"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.formatDate(root.viewPhase.nextFullMs)
              color: root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.title
            }
          }

          Column {
            spacing: Style.space(4)

            Text {
              text: "NEXT NEW"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.bodySmall
              font.letterSpacing: 1
            }
            Text {
              text: root.formatDate(root.viewPhase.nextNewMs)
              color: root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.title
            }
          }
        }

        // Active eclipse stage times (Start · Totality / Peak · Ends).
        Row {
          anchors.horizontalCenter: parent.horizontalCenter
          visible: root.artEclipse !== null && root.artEclipse.u1Ms !== undefined
          spacing: Style.space(22)

          readonly property real eclNow: root.artEclipse
              ? (root.artEclipse.simNowMs !== undefined ? root.artEclipse.simNowMs : root.viewNowMs)
              : 0
          readonly property bool isTotal: root.artEclipse !== null && root.artEclipse.kind === "total"

          Column {
            spacing: Style.space(2)
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: "START"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: root.artEclipse && root.artEclipse.u1Ms ? root.formatClockTime(root.artEclipse.u1Ms) : ""
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.body
            }
          }

          Column {
            spacing: Style.space(2)
            readonly property bool inPeak: {
              if (!root.artEclipse || !root.artEclipse.u2Ms) return false
              if (parent.isTotal) return parent.eclNow >= root.artEclipse.u2Ms && parent.eclNow <= root.artEclipse.u3Ms
              return Math.abs(parent.eclNow - root.artEclipse.greatestMs) <= 10 * 60000
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: parent.parent.isTotal ? "TOTALITY" : "PEAK"
              color: parent.inPeak ? Commons.Color.urgent : root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: {
                if (!root.artEclipse || !root.artEclipse.greatestMs) return ""
                if (parent.parent.isTotal)
                  return root.formatClockTime(root.artEclipse.u2Ms) + "–" + root.formatClockTime(root.artEclipse.u3Ms)
                return root.formatClockTime(root.artEclipse.greatestMs)
              }
              color: parent.inPeak ? Commons.Color.urgent : root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.body
              font.bold: parent.inPeak
            }
          }

          Column {
            spacing: Style.space(2)
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: "ENDS"
              color: root.mutedFg
              font.family: root.uiFont
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: root.artEclipse && root.artEclipse.u4Ms ? root.formatClockTime(root.artEclipse.u4Ms) : ""
              color: root.fgColor
              font.family: root.uiFont
              font.pixelSize: Style.font.body
            }
          }
        }

        // Full-width row spanning both columns when an umbral eclipse is within 30 days.
        Column {
          width: parent.width
          visible: root.soonEclipse !== null
          spacing: Style.space(4)

          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "NEXT ECLIPSE"
            color: root.mutedFg
            font.family: root.uiFont
            font.pixelSize: Style.font.bodySmall
            font.letterSpacing: 1
          }
          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.formatSoonEclipse(root.soonEclipse)
            color: root.fgColor
            font.family: root.uiFont
            font.pixelSize: Style.font.title
          }
        }

        Item {
          width: parent.width
          height: hintLabel.height

          Text {
            id: hintLabel
            anchors.centerIn: parent
            text: "[s/S] Style · [I] Icon · [ / ] Day"
            color: root.mutedFg
            font.family: root.uiFont
            font.pixelSize: Style.font.bodySmall
          }
        }
      }
    }
  }
}
