// ---------------------------------------------------------------------------
// Debug logging for react-three-dom
//
// Three-layer system:
//   Layer 1 (this file): r3fLog() writes to browser console.log
//   Layer 2 (Playwright): r3f.enableDebug() forwards browser logs to test terminal
//   Layer 3 (Cypress):    cy.r3fEnableDebug() mirrors to Cypress command log
//
// Enable via:
//   - <ThreeDom debug /> prop
//   - enableDebug(true) programmatically
//   - window.__R3F_DOM_DEBUG__ = true (from test code or DevTools console)
// ---------------------------------------------------------------------------

let _enabled = false;

/**
 * Enable or disable debug logging globally.
 * When enabled, all r3fLog calls will output to console.log.
 */
export function enableDebug(on = true): void {
  _enabled = on;
}

/**
 * Check if debug logging is currently enabled.
 */
export function isDebugEnabled(): boolean {
  return (
    _enabled ||
    (typeof window !== 'undefined' && !!window.__R3F_DOM_DEBUG__)
  );
}

/**
 * Log a debug message. Only outputs when debug is enabled via:
 *   - enableDebug(true)
 *   - window.__R3F_DOM_DEBUG__ = true
 *   - <ThreeDom debug /> prop
 *
 * @param area - Module area (e.g. 'setup', 'store', 'patch', 'click', 'drag')
 * @param msg  - Human-readable message
 * @param data - Optional data payload (object, error, etc.)
 */
export function r3fLog(area: string, msg: string, data?: unknown): void {
  if (
    !_enabled &&
    !(typeof window !== 'undefined' && window.__R3F_DOM_DEBUG__)
  ) {
    return;
  }
  if (data !== undefined) {
    console.log(`[r3f-dom:${area}]`, msg, data);
  } else {
    console.log(`[r3f-dom:${area}]`, msg);
  }
}
