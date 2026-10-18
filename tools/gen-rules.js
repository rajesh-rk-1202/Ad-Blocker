#!/usr/bin/env node
/**
 * Source of truth for the declarativeNetRequest blocklist.
 * Edit the lists below, then run:  node tools/gen-rules.js
 */
const fs = require('node:fs');
const path = require('node:path');

// Whole domains (and all subdomains) to block outright.
const AD_DOMAINS = [
  // Google ad stack
  'doubleclick.net',
  '2mdn.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  // Big ad exchanges / SSPs / DSPs
  'adnxs.com',
  'adnxs-simple.com',
  'adsrvr.org',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com',
  'bidswitch.net',
  'smartadserver.com',
  'adform.net',
  'criteo.com',
  'criteo.net',
  'serving-sys.com',
  'advertising.com',
  'adtechus.com',
  'amazon-adsystem.com',
  'media.net',
  'sharethrough.com',
  'yieldmo.com',
  'teads.tv',
  'zedo.com',
  'adroll.com',
  'adcolony.com',
  'applovin.com',
  'unityads.unity3d.com',
  'inmobi.com',
  'smaato.net',
  'mopub.com',
  // Content recommendation / native ad spam
  'taboola.com',
  'outbrain.com',
  'revcontent.com',
  'mgid.com',
  'zergnet.com',
  'content-ad.net',
  // Measurement / behavioural trackers
  'moatads.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcast.com',
  'omtrdc.net',
  'demdex.net',
  'everesttech.net',
  'bluekai.com',
  'krxd.net',
  'rlcdn.com',
  'agkn.com',
  'crwdcntrl.net',
  'exelator.com',
  'mathtag.com',
  'simpli.fi',
  'tapad.com',
  'turn.com',
  'yieldoptimizer.com',
  // Popup / malvertising-adjacent networks
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'onclickads.net',
  'adsterra.com',
  'exoclick.com',
  'juicyads.com',
  'trafficjunky.net',
];

// URL-path patterns. Uses DNR urlFilter syntax (`||` = domain anchor, `^` = separator).
//
// NOTE: deliberately no YouTube ad endpoints here. Killing YouTube's ad
// requests does NOT remove the ad - the player blocks in its `ad-showing`
// state waiting for a response that never arrives, giving a black screen and a
// frozen 0:00 / 0:00 until it times out. YouTube ads are handled in-page by
// src/youtube.js instead: let the ad load, then skip it immediately.
const URL_PATTERNS = [
  '/pagead/conversion',
  '/adserver/',
  '/ad-choices/',
  '/banner-ads/',
];

// Requests initiated by these sites are never blocked. See the note above:
// a half-blocked YouTube player hangs, which is worse than showing the ad.
const EXCLUDED_INITIATORS = ['youtube.com', 'youtube-nocookie.com'];

let id = 1;
const rules = [];

for (const domain of AD_DOMAINS) {
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      excludedInitiatorDomains: EXCLUDED_INITIATORS,
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'script',
        'xmlhttprequest',
        'image',
        'media',
        'stylesheet',
        'font',
        'object',
        'ping',
        'websocket',
        'other',
      ],
    },
  });
}

for (const pattern of URL_PATTERNS) {
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: pattern,
      excludedInitiatorDomains: EXCLUDED_INITIATORS,
      resourceTypes: [
        'sub_frame',
        'script',
        'xmlhttprequest',
        'image',
        'media',
        'ping',
        'other',
      ],
    },
  });
}

const out = path.join(__dirname, '..', 'rules', 'ads.json');
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log(
  `Wrote ${rules.length} rules to ${path.relative(process.cwd(), out)}`,
);
