function isSensitiveElement(element) {
  if (!(element instanceof Element)) return false;
  const field = element.closest('input, textarea, [contenteditable="true"]');
  if (!field) return false;
  const type = field.getAttribute('type') || '';
  const autocomplete = field.getAttribute('autocomplete') || '';
  return type === 'password' || autocomplete.startsWith('cc-');
}

function throttle(callback, limit) {
  let lastCall = 0;
  let timeout;
  return function (...args) {
    const remaining = limit - (Date.now() - lastCall);
    if (remaining <= 0) {
      clearTimeout(timeout);
      timeout = null;
      lastCall = Date.now();
      callback.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        timeout = null;
        callback.apply(this, args);
      }, remaining);
    }
  };
}

let isActive = false;
let bannerEnabled = true;
let lastCopyText = '';
let lastCopyTime = 0;

function updateBanner() {
  const currentBanner = document.getElementById('at-banner');
  if (!isActive || !bannerEnabled) {
    currentBanner?.remove();
    return;
  }
  if (currentBanner || !document.body) return;

  const banner = document.createElement('div');
  banner.id = 'at-banner';
  banner.textContent = 'UniTrack is recording session activity';
  document.body.appendChild(banner);
}

const reportActivity = throttle(() => {
  if (isActive) chrome.runtime.sendMessage({ type: 'ACTIVITY' });
}, 1000);

window.addEventListener('keydown', event => {
  if (!isActive) return;
  if (event.key.length === 1 && !isSensitiveElement(event.target)) {
    chrome.runtime.sendMessage({
      type: 'EVENT',
      data: { type: 'typing', chars: 1 }
    });
  }
  reportActivity();
}, true);

window.addEventListener('mousedown', reportActivity, true);
window.addEventListener('scroll', reportActivity, true);
window.addEventListener('touchstart', reportActivity, true);

document.addEventListener('paste', event => {
  if (!isActive || isSensitiveElement(event.target)) return;
  const pastedText = event.clipboardData?.getData('text/plain') || '';
  const sourceType = lastCopyText && pastedText === lastCopyText &&
    Date.now() - lastCopyTime < 5 * 60 * 1000 ? 'internal' : 'external';

  chrome.runtime.sendMessage({
    type: 'EVENT',
    data: {
      type: 'paste',
      chars: pastedText.length,
      words: pastedText.trim() ? pastedText.trim().split(/\s+/).length : 0,
      preview: pastedText.slice(0, 50),
      meta: { sourceType, tag: event.target?.tagName || 'unknown' }
    }
  });
}, true);

document.addEventListener('copy', event => {
  if (!isActive || isSensitiveElement(event.target)) return;
  lastCopyText = window.getSelection()?.toString() || '';
  lastCopyTime = Date.now();
}, true);

document.addEventListener('drop', event => {
  if (!isActive || isSensitiveElement(event.target)) return;
  const text = event.dataTransfer?.getData('text/plain');
  if (!text) return;
  chrome.runtime.sendMessage({
    type: 'EVENT',
    data: {
      type: 'drop',
      chars: text.length,
      preview: text.slice(0, 50),
      meta: { tag: event.target?.tagName || 'unknown' }
    }
  });
}, true);

chrome.runtime.sendMessage({ type: 'GET_SESSION_ID' }, response => {
  if (chrome.runtime.lastError) return;
  isActive = Boolean(response?.sessionId && !response.isPaused);
  bannerEnabled = response?.bannerEnabled !== false;
  updateBanner();
});

chrome.runtime.onMessage.addListener(request => {
  if (request.command !== 'SET_ACTIVE') return;
  isActive = Boolean(request.value);
  if (typeof request.bannerEnabled === 'boolean') {
    bannerEnabled = request.bannerEnabled;
  }
  updateBanner();
});
