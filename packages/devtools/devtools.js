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
