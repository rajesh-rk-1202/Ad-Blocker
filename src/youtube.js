/**
 * YouTube ad handling.
 *
 * Network blocking alone cannot remove YouTube's in-stream video ads: they are
 * served from the same hosts and through the same player API as the real video.
 * So we drive the player directly - click real skip buttons, and fast-forward
 * muted through unskippable ads - and hide promoted surfaces with CSS.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    skipVideoAds: true,
    hideCosmetic: true,
    blockAntiAdblock: true,
  };

  /** Promoted / ad containers that CSS collapses. Used here only to count them. */
  const COSMETIC_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-search-pyv-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    'ytd-primetime-promo-renderer',
    'ytd-brand-video-shelf-renderer',
    'ytd-brand-video-singleton-renderer',
    'ytd-video-masthead-ad-v3-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '#masthead-ad',
    '#player-ads',
  ].join(',');

  const SKIP_BUTTONS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
  ].join(',');

  const OVERLAY_CLOSE_BUTTONS = [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-close-container',
    '.ytp-ad-text-overlay-close-button',
    '.ytp-ad-image-overlay .ytp-ad-overlay-close-button',
  ].join(',');

  let settings = { ...DEFAULTS };
  let pendingCount = 0;
  let adState = { active: false, prevMuted: null, prevRate: null };
  let scheduled = false;

  /* ------------------------------------------------------------------ utils */

  function applyCosmeticFlag() {
    // youtube.css is scoped to `html:not(.pab-off)`, so toggling this class
    // enables/disables all cosmetic hiding without reloading the page.
    const off = !settings.enabled || !settings.hideCosmetic;
    document.documentElement.classList.toggle('pab-off', off);
  }

  function click(selector) {
    for (const el of document.querySelectorAll(selector)) {
      if (
        el.offsetParent !== null ||
        el.getClientRects().length > 0 ||
        el.closest('.video-ads')
      ) {
        el.click();
        return true;
      }
    }
    return false;
  }

  function report(n = 1) {
    pendingCount += n;
  }

  function flushReport() {
    if (!pendingCount) return;
    const count = pendingCount;
    pendingCount = 0;
    chrome.runtime.sendMessage({ type: 'adBlocked', count }).catch(() => {});
  }

  /* ------------------------------------------------------------- video ads */

  function getPlayer() {
    return document.querySelector(
      '#movie_player, #shorts-player, .html5-video-player',
    );
  }

  function restorePlayback(video) {
    if (video) {
      if (adState.prevMuted === false) video.muted = false;
      if (adState.prevRate != null) video.playbackRate = adState.prevRate;
    }
    adState = { active: false, prevMuted: null, prevRate: null };
  }

  function handleVideoAd() {
    const player = getPlayer();
    if (!player) return;

    const video =
      player.querySelector('video.html5-main-video') ||
      player.querySelector('video');
    const adShowing =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');

    if (!adShowing) {
      if (adState.active) restorePlayback(video);
      // Overlay banners can appear outside of an ad break too.
      click(OVERLAY_CLOSE_BUTTONS);
      return;
    }

    if (!adState.active) {
      adState.active = true;
      if (video) {
        adState.prevMuted = video.muted;
        adState.prevRate = video.playbackRate;
      }
      report();
    }

    click(OVERLAY_CLOSE_BUTTONS);

    // A real skip button is the cleanest exit - YouTube counts it as a skip.
    if (click(SKIP_BUTTONS)) return;

    // Unskippable: mute and jump to the end of the ad.
    if (!video) return;
    video.muted = true;

    // Wait until the ad's metadata is loaded. Seeking before `duration` is
    // known is a no-op, and touching playbackRate on a stream that has not
    // loaded can stall the player on a black frame.
    if (
      video.readyState < 1 ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    ) {
      return;
    }

    try {
      video.currentTime = video.duration;
    } catch {
      /* seeking can throw while the ad is still buffering */
    }
    if (video.paused) video.play().catch(() => {});
  }

  /* ------------------------------------------------- anti-adblock dialogues */

  function dismissEnforcement() {
    const message = document.querySelector(
      'ytd-enforcement-message-view-model, ytd-enforcement-message-view-model-wiz',
    );
    if (!message) return;

    (message.closest('tp-yt-paper-dialog') || message).remove();
    document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
    // YouTube locks scrolling while the modal is open.
    document.documentElement.style.removeProperty('overflow');
    document.body?.style.removeProperty('overflow');

    const video = getPlayer()?.querySelector('video');
    if (video?.paused) video.play().catch(() => {});
    report();
  }

  /* ------------------------------------------------------- cosmetic counting */

  function countCosmetic() {
    let found = 0;
    for (const el of document.querySelectorAll(COSMETIC_SELECTORS)) {
      if (el.dataset.pabSeen) continue;
      el.dataset.pabSeen = '1';
      found++;
    }
    if (found) report(found);
  }

  /* ------------------------------------------------------------------- loop */

  function tick() {
    scheduled = false;
    if (!settings.enabled) return;
    if (settings.skipVideoAds) handleVideoAd();
    if (settings.blockAntiAdblock) dismissEnforcement();
    if (settings.hideCosmetic) countCosmetic();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  }

  function start() {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributeFilter: ['class'],
    });
    // Safety net: YouTube mutates a lot inside shadow DOM / the player, where
    // the observer above does not always fire.
    setInterval(tick, 400);
    setInterval(flushReport, 1000);
    schedule();
  }

  chrome.storage.local.get(DEFAULTS).then((stored) => {
    settings = { ...DEFAULTS, ...stored };
    applyCosmeticFlag();
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) {
        settings[key] = changes[key].newValue;
        touched = true;
      }
    }
    if (touched) {
      applyCosmeticFlag();
      schedule();
    }
  });
})();
