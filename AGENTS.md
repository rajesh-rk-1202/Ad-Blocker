# Personal Ad Blocker

Unpacked Manifest V3 Chrome extension. **No build step** — edit files and hit reload
in `chrome://extensions`.

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
  and `src/youtube.css`.
