'use strict';

const TOGGLES = ['enabled', 'skipVideoAds', 'hideCosmetic', 'blockAntiAdblock'];
const $ = (id) => document.getElementById(id);

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function render(state) {
  for (const key of TOGGLES) $(key).checked = Boolean(state[key]);
  $('tabBlocked').textContent = state.tabBlocked ?? 0;
  $('totalBlocked').textContent = state.totalBlocked ?? 0;
  document.body.classList.toggle('disabled', !state.enabled);

  let host = '';
  try {
    host = new URL(state.tabUrl).hostname.replace(/^www\./, '');
  } catch {
    /* chrome:// pages and the new tab page have no usable host */
  }
  $('status').textContent = state.enabled ? host || 'Active' : 'Blocking paused';
}

async function refresh() {
  render((await send({ type: 'getState' })) || {});
}

for (const key of TOGGLES) {
  $(key).addEventListener('change', async (event) => {
    await send({ type: 'setSettings', settings: { [key]: event.target.checked } });
    refresh();
  });
}

$('reset').addEventListener('click', async () => {
  await send({ type: 'resetStats' });
  refresh();
});

refresh();
