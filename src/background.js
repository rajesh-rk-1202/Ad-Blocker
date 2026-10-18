/**
 * Service worker: owns settings, the static ruleset toggle, and block stats.
 */
'use strict';

const DEFAULTS = {
  enabled: true,
  skipVideoAds: true,
  hideCosmetic: true,
  blockAntiAdblock: true,
};

const RULESET_ID = 'ads';

/** tabId -> blocks counted since that tab last started navigating. */
const tabCounts = new Map();
let totalBlocked = 0;
let persistTimer = null;
/** Cached so the hot path (every blocked request) never touches storage. */
let enabled = true;

const ready = (async () => {
  const stored = await chrome.storage.local.get({
    ...DEFAULTS,
    totalBlocked: 0,
  });
  totalBlocked = stored.totalBlocked;
  enabled = stored.enabled;
  // Fill in any settings that have never been written (e.g. first run).
  const missing = Object.fromEntries(
    Object.entries(DEFAULTS).filter(
      ([key]) => !(key in stored) || stored[key] === undefined,
    ),
  );
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  await syncRuleset(stored.enabled);
})();

async function syncRuleset(isEnabled) {
  enabled = isEnabled;
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled
      ? { enableRulesetIds: [RULESET_ID] }
      : { disableRulesetIds: [RULESET_ID] },
  );
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? '#d32f2f' : '#6b6b6b',
  });
  tabCounts.clear();
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      chrome.action
        .setBadgeText({ tabId: tab.id, text: enabled ? '' : 'off' })
        .catch(() => {}),
    ),
  );
}

function persistTotal() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    chrome.storage.local.set({ totalBlocked });
  }, 2000);
}

function countBlock(tabId, n = 1) {
  totalBlocked += n;
  persistTotal();
  if (!enabled || tabId == null || tabId < 0) return;

  const count = (tabCounts.get(tabId) || 0) + n;
  tabCounts.set(tabId, count);
  chrome.action
    .setBadgeText({ tabId, text: count > 999 ? '999+' : String(count) })
    .catch(() => {});
}

/* Network-level blocks. onRuleMatchedDebug is only available to unpacked
 * extensions, which is exactly how this one is loaded. */
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(({ request }) => {
    countBlock(request.tabId);
  });
}

/* Cosmetic / in-player blocks reported by the YouTube content script. */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'adBlocked') {
    countBlock(sender.tab?.id, message.count || 1);
    return false;
  }

  if (message?.type === 'getState') {
    ready
      .then(() => chrome.storage.local.get({ ...DEFAULTS, totalBlocked: 0 }))
      .then(async (state) => {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        sendResponse({
          ...state,
          totalBlocked,
          tabBlocked: tab ? tabCounts.get(tab.id) || 0 : 0,
          tabUrl: tab?.url || '',
        });
      });
    return true;
  }

  if (message?.type === 'setSettings') {
    chrome.storage.local
      .set(message.settings)
      .then(async () => {
        if ('enabled' in message.settings)
          await syncRuleset(message.settings.enabled);
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === 'resetStats') {
    totalBlocked = 0;
    tabCounts.clear();
    chrome.storage.local
      .set({ totalBlocked: 0 })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' || !changeInfo.url) return;
  tabCounts.delete(tabId);
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));
