/**
 * Minimal MV3 service worker. All capture logic lives in the side panel, which
 * calls extension APIs directly — the background only wires the toolbar action
 * to the panel. No remote code, no message relays, no secrets.
 */
export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[consenttrace] setPanelBehavior failed', err));
});
