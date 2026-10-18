# Personal Ad Blocker

A personal, unpacked Chrome extension (Manifest V3) that removes YouTube ads and
blocks common third-party ad and tracker domains elsewhere.

No build step, no dependencies, no npm install — it is plain JavaScript that Chrome
loads straight from this folder.

---

## Contents

- [Scope and honest limitations](#scope-and-honest-limitations)
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Configuration and maintenance](#configuration-and-maintenance)
- [Permissions](#permissions)
- [Development workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Design decisions](#design-decisions)

---

## Scope and honest limitations

Read this before relying on it.

**YouTube: genuinely effective.** The in-player ad handling is the part of this
project with real value. It skips pre-roll, mid-roll and overlay ads, hides promoted
content throughout the UI, and dismisses YouTube's "ad blockers violate our Terms of
Service" modal.

**Everywhere else: weak.** The network blocklist is **71 rules built from 67
hand-written domains**. Production blocklists (EasyList, uBlock Origin's defaults)
carry on the order of hundreds of thousands of filters plus per-site cosmetic rules.
For non-YouTube browsing, this extension is **strictly worse than installing uBlock
Origin**. It catches the large ad exchanges and trackers and nothing more.

A reasonable setup is this extension for YouTube plus a mature blocker for general
browsing.

**Other known limitations:**

| Limitation | Detail |
| --- | --- |
| Unskippable ads flicker | They are muted and fast-forwarded, so you see a ~0.5s black frame rather than a seamless cut. A truly seamless result requires intercepting YouTube's player-response JSON, which breaks every time YouTube reshapes that payload. |
| Selectors rot | YouTube renames its `ytd-*` custom elements regularly. Expect to add selectors every few months — see [Configuration and maintenance](#configuration-and-maintenance). |
| Badge counter is unpacked-only | The network-block counter uses `onRuleMatchedDebug`, which Chrome only exposes to unpacked extensions. |
| Mobile layout unstyled | The manifest matches `m.youtube.com`, but every cosmetic selector targets the desktop `ytd-*` elements. |
| No tests | Nothing guards against selector drift. |
| Settings are per-profile | They live in `chrome.storage.local` and do not sync across machines. |

---

## Installation

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder — the one containing `manifest.json`, not a subfolder

Pin the extension via the toolbar's puzzle-piece menu to reach the popup easily.

**Two caveats of self-loaded extensions:**

- Chrome shows a *"Disable developer mode extensions"* balloon on every launch.
  Dismiss it. This is unavoidable without publishing to the Chrome Web Store.
- **Do not move or delete this folder.** Chrome references the directory on disk;
  moving it disables the extension.

Do **not** pack it into a `.crx` — that silently breaks the badge counter (see
[Permissions](#permissions)).

---

## Usage

Click the toolbar icon for the popup:

- **Master switch** (header) — disables all blocking, including the network ruleset.
  The badge reads `off` and turns grey.
- **Skip YouTube video ads** — the in-player logic (skip buttons, mute + seek).
- **Hide promoted content & banners** — cosmetic filtering.
- **Dismiss "ad blocker detected" popups** — removes YouTube's enforcement modal.
- **Stats** — blocks on the current page, and all-time. **Reset stats** clears both.

The toolbar badge shows the number of blocks on the current page.

All four toggles apply live — no page reload needed. This works because
`src/youtube.css` is scoped to `html:not(.pab-off)`, so toggling a single class on
`<html>` enables or disables every cosmetic rule at once.

---

## How it works

Two independent layers, because neither is sufficient alone.

### Layer 1 — Network blocking (non-YouTube sites)

`rules/ads.json` is a static `declarativeNetRequest` ruleset: 67 domain rules
(`||domain^`, covering all subdomains) and 4 generic ad-path rules. Chrome enforces
these in its network stack, so there is no per-request JavaScript cost.

Every rule carries `excludedInitiatorDomains: ["youtube.com",
"youtube-nocookie.com"]`. That exclusion is essential — see
[Design decisions](#design-decisions).

### Layer 2 — In-page handling (YouTube)

`src/youtube.js` drives the player directly. YouTube's in-stream video ads **cannot**
be removed by network blocking: they are served from the same hosts and through the
same player API as the real video. So the content script watches for the player's
`ad-showing` / `ad-interrupting` class and, in order:

1. Closes any ad overlay via its real close button.
2. Clicks a real skip button if one exists — the cleanest exit, since YouTube
   registers it as a genuine skip.
3. Otherwise, for unskippable ads: mutes the video and seeks to `video.duration`,
   then restores your previous mute state and playback rate once the ad ends.

Step 3 only fires once `video.readyState >= 1` and `duration` is finite. Seeking
earlier is a no-op, and touching `playbackRate` on an unloaded stream stalls the
player on a black frame.

Separately, it removes `ytd-enforcement-message-view-model` (the anti-adblock modal)
along with its backdrop, unlocks page scrolling, and resumes playback.

`src/youtube.css` handles cosmetic filtering: in-player ad surfaces, feed/search/
sidebar promoted items, mastheads, merch shelves and premium upsell nags. It also
collapses wrapper elements (`ytd-rich-item-renderer:has(ytd-ad-slot-renderer)`) so
the grid does not leave an empty slot behind.

### Layer 3 — Bookkeeping

`src/background.js` is the service worker. It owns the settings, toggles the static
ruleset on the master switch, and maintains per-tab and all-time block counts for the
badge and popup. Network blocks are observed via `onRuleMatchedDebug`; cosmetic and
in-player blocks are reported by the content script (batched once per second).

---

## Project layout

```
manifest.json          MV3 manifest
rules/ads.json         GENERATED declarativeNetRequest ruleset — do not edit by hand
src/background.js      Service worker: settings, ruleset toggle, block counts, badge
src/youtube.js         In-player ad skipping, anti-adblock modal removal
src/youtube.css        Cosmetic filtering, scoped to html:not(.pab-off)
popup/                 Popup UI (html / css / js)
icons/                 GENERATED PNG icons
tools/gen-rules.js     Source of truth for the blocklist — edit this, then regenerate
tools/gen-icons.js     Icon generator (writes PNGs with no image dependencies)
AGENTS.md              Terse maintainer/agent notes and gotchas
```

---

## Configuration and maintenance

### Adding or removing blocked domains

`rules/ads.json` is generated. Edit the `AD_DOMAINS` or `URL_PATTERNS` arrays in
`tools/gen-rules.js`, then:

```bash
node tools/gen-rules.js
```

Reload the extension afterwards.

**Domains you must not add:**

| Domain | Why |
| --- | --- |
| `googletagmanager.com` | Many sites load real content through GTM; blocking it breaks them. |
| `connect.facebook.net` | Breaks "Log in with Facebook" everywhere. |
| `googlevideo.com` | Serves the actual YouTube video streams. |
| any `youtube.com` ad path | Hangs the player — see [Design decisions](#design-decisions). |

DNR caps static rules at 30,000 per ruleset. At 71 rules there is plenty of headroom.

### When YouTube ads reappear

YouTube renames its custom elements often. To fix:

1. Right-click the ad → **Inspect**.
2. Find the enclosing `ytd-*` element name.
3. Add it to **both** `COSMETIC_SELECTORS` in `src/youtube.js` (so it is counted) and
   `src/youtube.css` (so it is hidden). Keep the `html:not(.pab-off)` prefix in the
   CSS or the toggle will stop working for that rule.
4. Reload the extension and hard-refresh YouTube.

If *video* ads reappear instead, the skip-button class names in `SKIP_BUTTONS` are
the likely culprit — inspect the skip button during an ad and update the list.

### Changing the icon

Edit the drawing logic in `tools/gen-icons.js`, then `node tools/gen-icons.js`. It
writes valid PNGs at 16/32/48/128 px using only Node's built-in `zlib`, with 3×3
supersampled edges — no image libraries needed.

---

## Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | The blocklist. Grants implicit access to `block` rules, so **no host permissions are required**. |
| `declarativeNetRequestFeedback` | `onRuleMatchedDebug`, used only to count network blocks for the badge. Unpacked-only, and triggers a *"Read your browsing history"* warning. |
| `storage` | Persists the four settings and the all-time counter. |
| `tabs` | Reads the active tab's URL for the popup's status line. |
| `host_permissions: <all_urls>` | **Currently declared but not actually needed** — see below. |

`<all_urls>` is a known wart. Per the
[declarativeNetRequest docs](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest),
the `declarativeNetRequest` permission already provides implicit access to `block`
rules, and content scripts are authorised by their own `matches` patterns. Removing
the key would be a pure least-privilege improvement and would drop an install
warning.

The extension makes **no network requests of its own** and sends no data anywhere.
All state is local to your Chrome profile.

---

## Development workflow

There is no build step. Edit a file, then click the **reload** (↻) icon on the
extension's card in `chrome://extensions`, then hard-refresh the page
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>).

Only two things need regenerating:

```bash
node tools/gen-rules.js   # after editing the domain lists
node tools/gen-icons.js   # after changing the icon design
```

### Verification

```bash
# Syntax check
node --check src/background.js
node --check src/youtube.js
node --check popup/popup.js

# Full manifest + ruleset validation, by Chrome itself. Exit 0 means valid.
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --pack-extension="$PWD" --no-message-box
# Then delete the ../Ad-Blocker.crx and ../Ad-Blocker.pem it produces.
```

### Where to find logs

- **Service worker:** `chrome://extensions` → *Personal Ad Blocker* → **service
  worker** link.
- **Content script:** <kbd>F12</kbd> on the YouTube tab.

Note that the service worker is evicted when idle; reopening its console restarts it.

---

## Troubleshooting

### Black screen and a frozen `0:00 / 0:00`, then the real video

The player is waiting on an ad request that something blocked. Check for a second ad
blocker (see below). If you added any `youtube.com` or `googlevideo.com` pattern to
`tools/gen-rules.js`, remove it — see [Design decisions](#design-decisions).

### Isolating which layer is at fault

Use the popup toggles to bisect:

| Action | If the problem disappears |
| --- | --- |
| Uncheck **Skip YouTube video ads** | The in-player logic in `src/youtube.js`. |
| Uncheck **Hide promoted content** | A cosmetic rule in `src/youtube.css`. |
| Turn off the **master switch** | The network ruleset in `rules/ads.json`. |
| Still broken with master off | Not this extension. |

### Another blocker is installed

Two blockers both racing the YouTube player produce hangs and black frames that
cannot be fixed from inside this extension. Disable one.

### Ads are back after a YouTube update

Expected. See [When YouTube ads reappear](#when-youtube-ads-reappear).

### Badge always reads 0

You packed the extension. `onRuleMatchedDebug` is unpacked-only. Load it unpacked.

### Changes do nothing

You edited `rules/ads.json` directly (it is overwritten by `gen-rules.js`), or you
did not reload the extension card, or the CSS rule is missing its
`html:not(.pab-off)` prefix.

---

## Design decisions

### Never block YouTube's ad requests at the network layer

The single most important constraint in this project, and a mistake worth not
repeating.

Blocking YouTube's ad endpoints (`youtube.com/pagead/`, `/api/stats/ads`,
`/ptracking`, `doubleclick.net/pagead/`) does **not** skip the ad. YouTube's player
awaits that response before starting the real video, so killing the request leaves it
stuck in its `ad-showing` state: black screen, frozen `0:00 / 0:00`, no progress bar,
until an internal timeout expires. The net effect is a *longer* wait than simply
watching the ad.

The working approach is the opposite: let the ad request succeed, then skip the ad
in-page. Hence `excludedInitiatorDomains` on every rule and no YouTube urlFilters.

### Why `declarativeNetRequest` and not `webRequest`

MV3 blocking `webRequest` is unavailable to non-enterprise extensions. DNR is also
faster — rules are enforced natively, with no JavaScript in the request path.

### Why CSS is scoped to `html:not(.pab-off)`

Static content-script CSS cannot be un-injected. Scoping every rule to a negated
class on `<html>` lets the popup toggle cosmetic filtering instantly, with no reload.

### Why polling as well as a MutationObserver

The observer covers DOM structure and class changes, but YouTube mutates state inside
the player and shadow DOM where it does not reliably fire. A 400 ms interval is the
safety net. This is acknowledged as wasteful — `all_frames: true` means every iframe
runs its own timer, and the observer watches the whole document subtree. Driving off
the video element's own events and scoping the observer to `#movie_player` would be
the correct fix.

### Why generated rules and icons

Keeping `tools/gen-rules.js` as the source of truth makes the blocklist a readable,
commentable domain list instead of 1,970 lines of JSON. `gen-icons.js` keeps the repo
dependency-free — no image toolchain for four small PNGs.
