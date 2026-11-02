/**
 * Generates a unique ID.
 * @returns {string} UUID-like string
 */
export function generateId() {
  return 'id-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Normalizes URL to extract assignment ID (e.g., Google Doc ID).
 * @param {string} url
 * @returns {string} normalized ID
 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('docs.google.com')) {
      // Extract /d/<ID>/
      const match = u.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) return `gdoc:${match[1]}`;
    }
    if (u.hostname.includes('forms.google.com')) {
      const match = u.pathname.match(/\/forms\/d\/e\/viewform\?id=([a-zA-Z0-9-_]+)/);
      if (match) return `gform:${match[1]}`;
    }
    return `${u.origin}${u.pathname}`;
  } catch (e) {
    return url;
  }
}

/**
 * Throttles a function.
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
export function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Debounces a function.
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Checks if an element is sensitive (password, credit card).
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function isSensitiveElement(el) {
  if (!el) return false;
  const type = el.type || '';
  const autocomplete = el.getAttribute('autocomplete') || '';
  return type === 'password' || autocomplete.startsWith('cc-');
}

/**
 * Sanitizes text for display (basic escaping).
 * @param {string} str
 * @returns {string}
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
