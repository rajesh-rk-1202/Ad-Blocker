# Personal Ad Blocker — maintainer notes

Unpacked Manifest V3 Chrome extension. **No build step** — edit files and hit reload
in `chrome://extensions`.

See `README.md` for full documentation (architecture, usage, troubleshooting, design
rationale). This file is the terse version: layout, commands, and the gotchas that
cost time.

## Layout

| Path                 | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `manifest.json`      | MV3 manifest                                                            |
| `rules/ads.json`     | **Generated** declarativeNetRequest ruleset — do not edit by hand       |
| `tools/gen-rules.js` | Source of truth for the blocklist; edit the domain arrays here          |
| `tools/gen-icons.js` | Generates `icons/*.png`                                                 |
| `src/background.js`  | Service worker: settings, ruleset toggle, per-tab block counts + badge  |
| `src/youtube.js`     | Drives the YouTube player to skip ads; dismisses anti-adblock modals    |
| `src/youtube.css`    | Cosmetic filtering, scoped to `html:not(.pab-off)` so it can be toggled |
| `popup/`             | Popup UI                                                                |

## Commands

```bash
node tools/gen-rules.js   # regenerate rules/ads.json after editing the domain lists
node tools/gen-icons.js   # regenerate icons
node --check src/*.js     # syntax check
```

## Verification

```bash
# Full manifest + ruleset validation via Chrome itself (exit 0 == valid):
"/c/Program Files/Google/Chrome/Application/chrome.exe" --pack-extension="$PWD" --no-message-box
# Delete the resulting ../Ad-Blocker.crx and ../Ad-Blocker.pem afterwards.
```

Manual test: reload the extension, open a YouTube video with ads, and watch the
service worker console (`chrome://extensions` → _service worker_) plus the page
console for errors.

## Notes / gotchas

- **Never block YouTube's ad requests at the network layer.** The player blocks in
  its `ad-showing` state waiting for a response that never arrives: black screen,
  frozen `0:00 / 0:00`, no progress bar, then the real video once it times out.
  All rules therefore carry `excludedInitiatorDomains: ['youtube.com',
'youtube-nocookie.com']`, and there are no `youtube.com`/`googlevideo.com`
  urlFilters. YouTube ads are handled in-page by `src/youtube.js`: let the ad load,
  then click the real skip button or mute + seek to its end.
- Only seek the ad once `video.readyState >= 1` and `duration` is finite. Seeking or
  setting `playbackRate` earlier stalls the player on a black frame.
- Do not add `googletagmanager.com` or `connect.facebook.net` to the blocklist —
  they break site functionality and logins respectively.
- Do not block `googlevideo.com` broadly; it serves the actual video streams.
- `declarativeNetRequestFeedback` / `onRuleMatchedDebug` only work for **unpacked**
  extensions. The badge counter silently stops working if installed packed.
- YouTube renames its `ytd-*` element names fairly often; if ads reappear, inspect
  the element and add the selector to both `COSMETIC_SELECTORS` in `src/youtube.js`
  and `src/youtube.css`. Keep the `html:not(.pab-off)` prefix on new CSS rules or the
  popup toggle stops working for them.

## Known shortcomings (not bugs — deliberate or unaddressed)

- The blocklist is only 67 hand-written domains. For non-YouTube sites this is
  strictly worse than uBlock Origin. Do not oversell it as a general ad blocker.
- `host_permissions: <all_urls>` in the manifest is **not needed** (DNR `block` rules
  are implicitly permitted; content scripts are authorised by their own `matches`).
  Removing it is a pending least-privilege improvement.
- The 400 ms `setInterval` plus a whole-document MutationObserver runs in every
  iframe (`all_frames: true`). Driving off the video element's own events and scoping
  the observer to `#movie_player` is the correct fix.
- No tests. Selector drift is the most likely source of silent rot; jsdom fixtures
  for `handleVideoAd()` would catch it.
- Minor: SPA navigation never resets the badge count (`onUpdated` only resets on
  `status === 'loading'`); `restorePlayback()` clobbers a mute toggled during an ad;
  `totalBlocked` can be lost if the worker is evicted inside its 2 s debounce.
