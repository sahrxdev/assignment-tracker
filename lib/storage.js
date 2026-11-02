import { generateId } from './utils.js';

const SCHEMA_VERSION = 1;

/**
 * Initializes default settings.
 * @returns {Object}
 */
function getDefaultSettings() {
  return {
    role: 'student',
    pinHash: null,
    idleTimeoutSec: 60,
    thresholds: {
      normalPasteRatio: 0.2,
      reviewPasteRatio: 0.5,
      largePasteChars: 500,
      tabSwitchesPerHour: 15,
      activeTimeMinPct: 25
    },
    previewsEnabled: true,
    bannerEnabled: true,
    allowedSites: [
      "https://docs.google.com/*",
      "https://forms.google.com/*",
      "https://classroom.google.com/*"
    ],
    consentGiven: false,
    consentTimestamp: null,
    schemaVersion: SCHEMA_VERSION
  };
}

/**
 * Loads settings from storage, merging with defaults.
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const stored = result.settings || {};
  const defaults = getDefaultSettings();

  // Simple migration/version check could go here
  if (stored.schemaVersion !== SCHEMA_VERSION) {
    console.warn('Schema version mismatch, resetting settings.');
    await chrome.storage.local.set({ settings: defaults });
    return defaults;
  }

  return { ...defaults, ...stored };
}

/**
 * Saves settings to storage.
 * @param {Object} settings
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/**
 * Gets all assignments.
 * @returns {Promise<Object>}
 */
export async function getAssignments() {
  const result = await chrome.storage.local.get(['assignments']);
  return result.assignments || {};
}

/**
 * Saves or updates an assignment.
 * @param {string} id
 * @param {Object} data
 */
export async function saveAssignment(id, data) {
  const assignments = await getAssignments();
  assignments[id] = { ...data, updatedAt: Date.now() };
  await chrome.storage.local.set({ assignments });
}

/**
 * Gets sessions for an assignment.
 * @param {string} assignmentId
 * @returns {Promise<Array>}
 */
export async function getSessions(assignmentId) {
  const result = await chrome.storage.local.get(['sessions']);
  const sessions = result.sessions || {};
  const allSessions = Object.values(sessions);
  return assignmentId === undefined
    ? allSessions
    : allSessions.filter(session => session.assignmentId === assignmentId);
}

/**
 * Creates or updates a session.
 * @param {string} sessionId
 * @param {Object} data
 */
export async function saveSession(sessionId, data) {
  const result = await chrome.storage.local.get(['sessions']);
  const sessions = result.sessions || {};
  sessions[sessionId] = { ...sessions[sessionId], ...data };
  await chrome.storage.local.set({ sessions });
}

/**
 * Appends an event to the global events array.
 * @param {Object} event
 */
export async function addEvent(event) {
  const result = await chrome.storage.local.get(['events']);
  let events = result.events || [];

  // Cap events per session roughly by total count for simplicity in this demo
  // In production, you might want to cap per session specifically.
  if (events.length > 5000) {
    events = events.slice(-5000);
  }

  events.push(event);
  await chrome.storage.local.set({ events });
}

/**
 * Gets events for a specific session.
 * @param {string} sessionId
 * @returns {Promise<Array>}
 */
export async function getEventsBySession(sessionId) {
  const result = await chrome.storage.local.get(['events']);
  const events = result.events || [];
  return events.filter(e => e.sessionId === sessionId);
}

/**
 * Deletes all data related to an assignment.
 * @param {string} assignmentId
 */
export async function deleteAssignmentData(assignmentId) {
  const assignments = await getAssignments();
  delete assignments[assignmentId];
  await chrome.storage.local.set({ assignments });

  const resultSess = await chrome.storage.local.get(['sessions']);
  const sessions = resultSess.sessions || {};
  const sessionIdsToRemove = Object.keys(sessions).filter(id => sessions[id].assignmentId === assignmentId);
  sessionIdsToRemove.forEach(id => delete sessions[id]);
  await chrome.storage.local.set({ sessions });

  const resultEv = await chrome.storage.local.get(['events']);
  let events = resultEv.events || [];
  events = events.filter(e => !sessionIdsToRemove.includes(e.sessionId));
  await chrome.storage.local.set({ events });
}

/**
 * Clears all extension data.
 */
export async function clearAllData() {
  await chrome.storage.local.remove(['assignments', 'sessions', 'events']);
}
