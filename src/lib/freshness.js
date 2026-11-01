// After a new version of DMS is deployed, a tab opened before it still runs the old code, whose
// parts loaded on demand (the PDF signer, the PDF viewer…) no longer exist on the site: "Failed to
// fetch dynamically imported module". DMS then reloads itself once to get the new version, and
// tells an open tab when a new version is out.

const KEY = 'dms-reloaded-at';
export const isStaleChunkError = (e) => /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i
  .test(String(e?.message || e || ''));

// Reload, but not again within a minute (the site itself may be down).
// Where the browser blocks storage, the tab's own name keeps the time across the reload.
const readLast = () => {
  try { return Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
  const m = String(window.name || '').match(/dms-reloaded-at:(\d+)/);
  return m ? Number(m[1]) : 0;
};
const writeLast = (t) => {
  try { sessionStorage.setItem(KEY, String(t)); return; } catch { /* storage blocked */ }
  window.name = `${String(window.name || '').replace(/dms-reloaded-at:\d+/, '')}dms-reloaded-at:${t}`;
};
export function reloadForNewVersion() {
  if (Date.now() - readLast() < 60000) return false;
  writeLast(Date.now());
  window.location.reload();
  return true;
}

// An action failed because this tab runs an old version: reload (true) instead of showing the error.
export const staleReload = (e) => isStaleChunkError(e) && reloadForNewVersion();

export function watchStaleChunks() {
  // Vite reports a part that failed to load.
  window.addEventListener('vite:preloadError', (event) => { if (reloadForNewVersion()) event.preventDefault(); });
  window.addEventListener('unhandledrejection', (event) => { if (isStaleChunkError(event.reason)) reloadForNewVersion(); });
}

// The main script of the page as deployed now, compared with the one this tab runs.
const scriptOf = (html) => (String(html).match(/\/assets\/index-[\w-]+\.js/) || [''])[0];
const running = () => scriptOf([...document.scripts].map((s) => s.getAttribute('src') || '').join(' '));

export async function newVersionOut() {
  const mine = running();
  if (!mine) return false; // local development: no built assets
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    const live = scriptOf(await res.text());
    return Boolean(live) && live !== mine;
  } catch {
    return false;
  }
}
