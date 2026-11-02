import { getSettings, saveSettings } from '../lib/storage.js';

const agreeButton = document.getElementById('btn-agree');
const declineButton = document.getElementById('btn-decline');
const status = document.getElementById('consent-status');

agreeButton.addEventListener('click', async () => {
  agreeButton.disabled = true;
  declineButton.disabled = true;
  try {
    const settings = await getSettings();
    settings.consentGiven = true;
    settings.consentTimestamp = Date.now();
    await saveSettings(settings);
    window.close();
  } catch (error) {
    status.textContent = `Could not save your choice: ${error.message}`;
    status.dataset.state = 'error';
    agreeButton.disabled = false;
    declineButton.disabled = false;
  }
});

declineButton.addEventListener('click', () => window.close());
