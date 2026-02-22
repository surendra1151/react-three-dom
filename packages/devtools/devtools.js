/**
 * DevTools page script — runs when DevTools opens.
 * Creates the "R3F" panel tab that loads panel.html.
 */
chrome.devtools.panels.create(
  'R3F',
  'icons/icon48.png',
  'panel.html',
  function (panel) {
    // Panel created; panel.html loads the React inspector UI
  }
);

// Inspect mode is OFF by default — user must click the toggle in the R3F panel.

// ---------------------------------------------------------------------------
// Direction 1: Elements tab → Scene (hover highlight)
//
// onSelectionChanged fires when you click or arrow-key to a new element.
// We read $0 (the selected element) and set __r3fdom_hovered__ on the page.
// The Highlighter polls __r3fdom_hovered__ and shows the 3D hover highlight.
// ---------------------------------------------------------------------------

var _lastSyncedUuid = null;

function syncHoveredElement() {
  // $0 is available inside inspectedWindow.eval as a DevTools console API.
  // We run everything in a single eval to avoid serialization issues with
  // DOM element references.
  chrome.devtools.inspectedWindow.eval(
    "(function() {" +
    "  try {" +
    "    var el = $0;" +
    "    if (!el) { window.__r3fdom_hovered__ = null; return null; }" +
    "    var uuid = el.getAttribute ? el.getAttribute('data-uuid') : null;" +
    "    if (!uuid && el.closest) {" +
    "      var closest = el.closest('[data-uuid]');" +
    "      if (closest) { uuid = closest.getAttribute('data-uuid'); el = closest; }" +
    "    }" +
    "    if (uuid) {" +
    "      window.__r3fdom_hovered__ = el;" +
    "      return uuid;" +
    "    }" +
    "    window.__r3fdom_hovered__ = null;" +
    "    return null;" +
    "  } catch(e) { return null; }" +
    "})()",
    function (uuid) {
      if (uuid !== _lastSyncedUuid) {
        _lastSyncedUuid = uuid;
      }
    }
  );
}

// Fire immediately on selection change in Elements tab
if (chrome.devtools.panels.elements && chrome.devtools.panels.elements.onSelectionChanged) {
  chrome.devtools.panels.elements.onSelectionChanged.addListener(function () {
    syncHoveredElement();
  });
}

// Poll as backup — $0 updates on selection, this catches it
setInterval(syncHoveredElement, 200);

// ---------------------------------------------------------------------------
// Direction 2: Scene → Elements tab
//
// When the user clicks an object on the canvas (via InspectController),
// the page sets window.__r3fdom_selected_element__ to the mirror DOM node.
// We poll for it and call inspect() to reveal it in the Elements tab.
// ---------------------------------------------------------------------------

setInterval(function () {
  chrome.devtools.inspectedWindow.eval(
    "(function() {" +
    "  var el = window.__r3fdom_selected_element__;" +
    "  if (el) { window.__r3fdom_selected_element__ = null; inspect(el); return true; }" +
    "  return false;" +
    "})()",
    function () {}
  );
}, 200);
