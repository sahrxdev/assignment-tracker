import { clearAllData, getSettings, saveSettings } from '../lib/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const settings = await getSettings();
  const saveStatus = document.getElementById('save-status');
  const saveButton = document.getElementById('btn-save');

  document.getElementById('sel-role').value = settings.role;
  document.getElementById('inp-idle').value = settings.idleTimeoutSec;
  document.getElementById('inp-norm').value = settings.thresholds.normalPasteRatio * 100;
  document.getElementById('inp-rev').value = settings.thresholds.reviewPasteRatio * 100;
  document.getElementById('inp-large').value = settings.thresholds.largePasteChars;
  document.getElementById('chk-preview').checked = settings.previewsEnabled;
  document.getElementById('chk-banner').checked = settings.bannerEnabled;
  renderSites(settings.allowedSites);
  await updateStorageUsage();

  document.getElementById('btn-add-site').addEventListener('click', addSite);
  document.getElementById('inp-new-site').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addSite();
    }
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const idleTimeoutSec = Number(document.getElementById('inp-idle').value);
    const normalPasteRatio = Number(document.getElementById('inp-norm').value) / 100;
    const reviewPasteRatio = Number(document.getElementById('inp-rev').value) / 100;
    const largePasteChars = Number(document.getElementById('inp-large').value);

    if (!Number.isInteger(idleTimeoutSec) || idleTimeoutSec < 5 || idleTimeoutSec > 3600) {
      showStatus('Idle timeout must be between 5 and 3,600 seconds.', 'error');
      return;
    }
    if (
      !Number.isFinite(normalPasteRatio) ||
      !Number.isFinite(reviewPasteRatio) ||
      normalPasteRatio < 0 ||
      reviewPasteRatio > 1 ||
      normalPasteRatio > reviewPasteRatio
    ) {
      showStatus('Paste ratios must be between 0% and 100%, with normal at or below review.', 'error');
      return;
    }
    if (!Number.isInteger(largePasteChars) || largePasteChars < 1) {
      showStatus('Large paste threshold must be a positive whole number.', 'error');
      return;
    }

    settings.role = document.getElementById('sel-role').value;
    settings.idleTimeoutSec = idleTimeoutSec;
    settings.thresholds.normalPasteRatio = normalPasteRatio;
    settings.thresholds.reviewPasteRatio = reviewPasteRatio;
    settings.thresholds.largePasteChars = largePasteChars;
    settings.previewsEnabled = document.getElementById('chk-preview').checked;
    settings.bannerEnabled = document.getElementById('chk-banner').checked;

    saveButton.disabled = true;
    try {
      await saveSettings(settings);
      showStatus('Your changes are saved.', 'success');
    } catch (error) {
      showStatus(`Could not save settings: ${error.message}`, 'error');
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    if (!confirm('Delete all stored assignments, sessions, and activity events? Your settings and consent choice will be kept. This cannot be undone.')) {
      return;
    }
    try {
      await clearAllData();
      location.reload();
    } catch (error) {
      showStatus(`Could not delete local data: ${error.message}`, 'error');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes) {
      updateStorageUsage();
    }
  });

  function addSite() {
    const input = document.getElementById('inp-new-site');
    const site = input.value.trim();
    if (!site) {
      showStatus('Enter a website pattern first.', 'error');
      input.focus();
      return;
    }
    if (!/^https:\/\/[^*\s]+(?:\*[^*\s]*)?$/.test(site)) {
      showStatus('Use a valid HTTPS pattern, for example https://example.com/*.', 'error');
      input.focus();
      return;
    }
    if (settings.allowedSites.includes(site)) {
      showStatus('That website is already in the list.', 'error');
      input.focus();
      return;
    }
    settings.allowedSites.push(site);
    renderSites(settings.allowedSites);
    input.value = '';
    showStatus('Website added. Save changes to apply it.', '');
  }

  function renderSites(sites) {
    const list = document.getElementById('list-sites');
    list.replaceChildren();

    for (const site of sites) {
      const item = document.createElement('li');
      item.className = 'site-item';
      const address = document.createElement('code');
      address.textContent = site;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-site';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', `Remove ${site}`);
      removeButton.addEventListener('click', () => {
        settings.allowedSites = settings.allowedSites.filter(value => value !== site);
        renderSites(settings.allowedSites);
        showStatus('Website removed. Save changes to apply it.', '');
      });
      item.append(address, removeButton);
      list.appendChild(item);
    }
  }

  function showStatus(message, state) {
    saveStatus.textContent = message;
    saveStatus.dataset.state = state;
  }
});

async function updateStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  document.getElementById('val-storage').textContent = bytesInUse < 1024 * 1024
    ? `${(bytesInUse / 1024).toFixed(1)} KB`
    : `${(bytesInUse / (1024 * 1024)).toFixed(2)} MB`;
}
