document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = document.getElementById('status-line');
  const statusLabel = document.getElementById('status-label');
  const statsSection = document.getElementById('stats-section');
  const emptyState = document.getElementById('empty-state');
  const pauseButton = document.getElementById('btn-pause');
  const reportButton = document.getElementById('btn-report');

  if (!tab?.id) {
    statusLabel.textContent = 'No active tab found.';
    statsSection.hidden = true;
    emptyState.hidden = false;
    pauseButton.disabled = true;
    return;
  }

  async function refresh() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATS',
        tabId: tab.id
      });

      if (!response || response.error) {
        throw new Error(response?.error || 'Could not load live session data.');
      }

      if (!response.stats) {
        status.dataset.state = '';
        statusLabel.textContent = 'Not tracking this page';
        statsSection.hidden = true;
        emptyState.hidden = false;
        pauseButton.disabled = true;
        reportButton.disabled = true;
        return;
      }

      const stats = response.stats;
      const paused = stats.isPaused;
      status.dataset.state = paused ? 'paused' : 'active';
      statusLabel.textContent = paused ? 'Tracking is paused' : 'Tracking this assignment';
      statsSection.hidden = false;
      emptyState.hidden = true;
      pauseButton.disabled = false;
      reportButton.disabled = false;
      pauseButton.textContent = paused ? 'Resume tracking' : 'Pause tracking';

      document.getElementById('val-active').textContent = formatTime(stats.activeMs);
      document.getElementById('val-total').textContent = formatTime(stats.totalMs);
      document.getElementById('val-pastes').textContent = stats.pasteCount;
      document.getElementById('val-ratio').textContent = `${Math.round(stats.pasteRatio * 100)}%`;
      document.getElementById('val-switches').textContent = stats.switchCount;
    } catch (error) {
      status.dataset.state = '';
      statusLabel.textContent = error.message;
      statsSection.hidden = true;
      emptyState.hidden = false;
      pauseButton.disabled = true;
      reportButton.disabled = true;
    }
  }

  pauseButton.addEventListener('click', async () => {
    pauseButton.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_PAUSE', tabId: tab.id });
      await refresh();
    } catch (error) {
      statusLabel.textContent = error.message;
    } finally {
      pauseButton.disabled = false;
    }
  });

  reportButton.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`report/report.html?tabId=${tab.id}`)
    });
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.sessions || changes.events || changes.settings)) {
      refresh();
    }
  });

  await refresh();
  window.setInterval(refresh, 1500);
});

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
