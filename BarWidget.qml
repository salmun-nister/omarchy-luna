import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "salmun-nister.luna"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  // Shape contract for shell.summon/hide/toggle routing (Bar.findPanelWidget
  // requires open/close/opened on the bar-widget root).
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // Eclipse accent inputs, read off the live panel state (real event XOR dev
  // preview). Depth 0..1 scales both effects; kind is irrelevant here.
  readonly property real eclipseDepth: panelLoader.item ? panelLoader.item.pillEclipseDepth : 0
  readonly property bool pillIsPlainGlyph: panelLoader.item ? panelLoader.item.plainIcon === true : false

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  // Emoji bitmaps ignore text colors, so during an eclipse a soft red halo
  // sits behind the button instead. Only for the emoji flavor; the plain
  // glyph gets its foreground tinted below.
  Rectangle {
    anchors.centerIn: button
    visible: root.bar && root.eclipseDepth > 0 && !root.pillIsPlainGlyph
    width: Math.min(button.implicitWidth, button.implicitHeight) * 1.25
    height: width
    radius: width / 2
    color: root.bar ? root.bar.urgent : "transparent"
    opacity: 0.10 + 0.28 * root.eclipseDepth
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: panelLoader.item ? panelLoader.item.label : ""
    slotSize: Style.bar.statusSlot
    tooltipText: panelLoader.item ? panelLoader.item.tooltipText : ""

    // During an eclipse the plain glyph shifts toward the theme's urgent
    // color with depth (Binding restores the default when inactive).
    Binding on foreground {
      when: root.pillIsPlainGlyph && root.eclipseDepth > 0 && root.bar !== null
      value: Qt.tint(root.bar.foreground, Qt.rgba(root.bar.urgent.r, root.bar.urgent.g, root.bar.urgent.b, Math.min(1, root.eclipseDepth * 0.9)))
    }

    // The plain-icon glyph lives in the Nerd Font PUA range, where unrelated
    // fonts (Material Symbols, CJK fonts) claim overlapping slots. The bar's
    // generic "monospace" family lets Qt's fallback wander into those; pin
    // the concrete resolved family so the moon glyph always comes from the
    // Nerd Font that actually ships it.
    fontFamily: Style.resolvedFontFamily !== "monospace" ? Style.resolvedFontFamily : "JetBrainsMono Nerd Font"

    onPressed: function(b) {
      if (!root.bar) return
      if (b === Qt.RightButton) {
        var p = panelLoader.item
        if (p) root.bar.run("omarchy-notification-send '" + p.notificationSummary + "'")
      } else if (b === Qt.MiddleButton) {
        if (panelLoader.item && panelLoader.item.cycleArtStyle) panelLoader.item.cycleArtStyle()
      } else {
        root.togglePanel()
      }
    }
  }
}
