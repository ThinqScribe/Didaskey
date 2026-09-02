/**
 * Classroom WebView config injector.
 *
 * ── Why this changed ──────────────────────────────────────────────────────────
 * The original approach built the entire HTML page as a TypeScript string and
 * loaded it via `source={{ html: ... }}`.  React Native WebView renders that
 * as a `data:text/html` document, and both iOS WebKit and Android WebView
 * block `navigator.mediaDevices.getUserMedia` on `data:` origins entirely —
 * no props or flags can override that restriction.
 *
 * The fix is to serve the HTML shell from the backend at a real `http://`
 * URL (`GET /classroom.html`) and load it via `source={{ uri: ... }}`.
 * The page contains no secrets; LiveKit credentials are injected by the
 * React Native WebView via `injectedJavaScriptBeforeContentLoaded`, which
 * runs before any page script so `window.__CLS` is available the moment
 * the inline script boots.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * The token is injected into the WebView's JS context only — it never
 * appears in the URL, request headers, or any network log.  It lives only
 * in the WebView's memory for the lifetime of the page.
 */

export interface ClassroomConfig {
  livekitUrl:  string;
  token:       string;
  displayName: string;
  isTutor:     boolean;
}

/**
 * Return a JS snippet to run via `injectedJavaScriptBeforeContentLoaded`.
 *
 * Sets `window.__CLS` with the room config before the page's own script
 * executes, so the classroom boot function finds the values immediately.
 *
 * All values are JSON-encoded to produce safe JS string/boolean literals —
 * no manual escaping needed.
 */
export function buildClassroomInjection(cfg: ClassroomConfig): string {
  return (
    `window.__CLS = {` +
    `  livekitUrl:  ${JSON.stringify(cfg.livekitUrl)},` +
    `  token:       ${JSON.stringify(cfg.token)},` +
    `  displayName: ${JSON.stringify(cfg.displayName)},` +
    `  isTutor:     ${JSON.stringify(cfg.isTutor)}` +
    `};`
  );
}

/**
 * Return the URL of the classroom HTML shell served by the backend.
 *
 * @param backendBaseUrl  Root URL of the API server, e.g. "http://host:8000".
 *                        Should NOT include /api/v1 path.
 */
export function classroomShellUrl(backendBaseUrl: string): string {
  // Strip any trailing slashes for consistency
  const root = backendBaseUrl.replace(/\/$/, "");
  return `${root}/classroom.html`;
}
