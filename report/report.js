import { getAssignments, getSessions } from '../lib/storage.js';
import { calculateMetrics } from '../lib/metrics.js';
import { computeRiskFlag } from '../lib/flags.js';
import { exportToCSV, exportToJSON } from '../lib/export.js';

const params = new URLSearchParams(window.location.search);
const tabId = Number(params.get('tabId'));
let assignmentId;
let currentMetrics;
let refreshTimer;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (currentMetrics) downloadFile(exportToCSV(currentMetrics), 'assignment-report.csv', 'text/csv');
  });
  document.getElementById('btn-export-json').addEventListener('click', () => {
    if (currentMetrics) downloadFile(exportToJSON(currentMetrics), 'assignment-report.json', 'application/json');
  });
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-delete').addEventListener('click', deleteCurrentAssignment);

  try {
    if (!Number.isInteger(tabId)) throw new Error('The active tab was not provided.');
    const response = await chrome.runtime.sendMessage({ type: 'GET_ASSIGNMENT_ID', tabId });
    if (!response?.assignmentId) throw new Error('No assignment data is available for this tab.');
    assignmentId = response.assignmentId;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && (changes.sessions || changes.events || changes.assignments || changes.settings)) {
        clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => refreshReport(), 150);
      }
    });

    await refreshReport();
  } catch (error) {
    showStatus(error.message, 'error');
    document.getElementById('date-range').textContent = 'Unable to load session activity.';
  }
});

async function refreshReport() {
  try {
    const [metrics, assignments, sessions] = await Promise.all([
      calculateMetrics(assignmentId),
      getAssignments(),
      getSessions(assignmentId)
    ]);
    currentMetrics = metrics;
    const risk = await computeRiskFlag(metrics);
    renderReport(metrics, risk, assignments[assignmentId], sessions);
  } catch (error) {
    showStatus(`Could not refresh the report: ${error.message}`, 'error');
  }
}

function renderReport(metrics, risk, assignment, sessions) {
  document.getElementById('assign-label').textContent = assignment?.label || 'Assignment report';
  document.getElementById('date-range').textContent = formatDateRange(sessions);
  document.getElementById('sum-total').textContent = formatTime(metrics.totalMs);
  document.getElementById('sum-active').textContent = formatTime(metrics.totalActiveMs);
  document.getElementById('sum-ratio').textContent = `${Math.round(metrics.pasteRatio * 100)}%`;

  const flagElement = document.getElementById('sum-flag');
  const riskCard = document.getElementById('risk-card');
  flagElement.textContent = risk.flag;
  riskCard.dataset.risk = risk.flag === 'High attention'
    ? 'high'
    : risk.flag === 'Review suggested' ? 'review' : 'normal';
  document.getElementById('risk-detail').textContent =
    risk.reasons.length ? risk.reasons.join(' · ') : 'No review thresholds were reached';

  drawTimeline(metrics.events);
  populateTable(metrics.events);
}

function drawTimeline(events) {
  const canvas = document.getElementById('timeline-canvas');
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bounds.width * ratio));
  const height = Math.max(1, Math.floor(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  const baseline = Math.round(height * 0.58);
  context.strokeStyle = '#e3eae6';
  context.lineWidth = Math.max(1, ratio);
  context.beginPath();
  context.moveTo(0, baseline);
  context.lineTo(width, baseline);
  context.stroke();

  const relevantEvents = events.filter(event => event.type === 'paste' || event.type === 'blur');
  if (!relevantEvents.length) {
    context.fillStyle = '#718078';
    context.font = `${12 * ratio}px Segoe UI, sans-serif`;
    context.textAlign = 'center';
    context.fillText('Paste and tab-switch activity will appear here', width / 2, baseline + 30 * ratio);
    return;
  }

  const minTime = relevantEvents[0].ts;
  const timeRange = Math.max(1, relevantEvents[relevantEvents.length - 1].ts - minTime);
  for (const event of relevantEvents) {
    const x = ((event.ts - minTime) / timeRange) * Math.max(1, width - 18 * ratio) + 9 * ratio;
    if (event.type === 'paste') {
      context.fillStyle = '#22956a';
      context.beginPath();
      context.arc(x, baseline, Math.min(9, Math.max(4, Math.sqrt(event.chars || 1) / 2)) * ratio, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = '#e49a39';
      context.fillRect(x - ratio, baseline - 12 * ratio, 2 * ratio, 24 * ratio);
    }
  }
}

function populateTable(events) {
  const body = document.querySelector('#paste-table tbody');
  const pastes = events.filter(event => event.type === 'paste').slice().reverse();
  body.replaceChildren();
  document.getElementById('event-count').textContent = `${pastes.length} ${pastes.length === 1 ? 'event' : 'events'}`;

  if (!pastes.length) {
    const row = body.insertRow();
    row.className = 'empty-row';
    const cell = row.insertCell();
    cell.colSpan = 3;
    cell.textContent = 'No paste events recorded for this assignment yet.';
    return;
  }

  for (const paste of pastes) {
    const row = body.insertRow();
    row.insertCell().textContent = new Date(paste.ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
    row.insertCell().textContent = (paste.chars || 0).toLocaleString();
    row.insertCell().textContent = paste.meta?.sourceType === 'internal' ? 'Copied on this page' : 'Other source';
  }
}

async function deleteCurrentAssignment() {
  if (!confirm('Delete all stored data for this assignment? This cannot be undone.')) return;
  const button = document.getElementById('btn-delete');
  button.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_ASSIGNMENT',
      assignmentId
    });
    if (!response?.ok) throw new Error(response?.error || 'The assignment data could not be deleted.');
    currentMetrics = null;
    showStatus('Assignment data deleted.', 'success');
    await refreshReport();
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function formatDateRange(sessions) {
  if (!sessions.length) return 'No session activity recorded';
  const first = Math.min(...sessions.map(session => session.start));
  const last = Math.max(...sessions.map(session => session.end || Date.now()));
  const start = new Date(first);
  const end = new Date(last);
  const date = start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${date} · ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function showStatus(message, state) {
  const status = document.getElementById('report-status');
  status.textContent = message;
  status.dataset.state = state;
}

window.addEventListener('resize', () => {
  if (currentMetrics) drawTimeline(currentMetrics.events);
});
