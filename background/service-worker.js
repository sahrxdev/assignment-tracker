import {
  addEvent,
  deleteAssignmentData,
  getAssignments,
  getSettings,
  getSessions,
  saveAssignment,
  saveSession
} from '../lib/storage.js';
import { generateId, normalizeUrl } from '../lib/utils.js';

const currentSessions = {};
let initialization;

chrome.alarms.create('flushData', { periodInMinutes: 0.5 });

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const settings = await getSettings();
  if (reason === 'install' && !settings.consentGiven) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('consent/consent.html') });
  }
  await initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    void initialize().then(() => refreshTab(tab));
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await initialize();
  const tabs = await chrome.tabs.query({ windowId });
  const activeTab = tabs.find(tab => tab.id === tabId);
  for (const id of Object.keys(currentSessions)) {
    const sessionTabId = Number(id);
    await setFocused(sessionTabId, sessionTabId === tabId, sessionTabId !== tabId);
  }
  if (activeTab) {
    await refreshTab(activeTab);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  void initialize().then(() => endSession(tabId));
});

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    for (const tabId of Object.keys(currentSessions)) {
      await setFocused(Number(tabId), false);
    }
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, windowId });
  const focusedTabId = tabs[0]?.id;
  for (const tabId of Object.keys(currentSessions)) {
    await setFocused(Number(tabId), Number(tabId) === focusedTabId);
  }
});

chrome.idle.onStateChanged.addListener(async state => {
  if (state !== 'idle' && state !== 'active') return;
  await initialize();
  const now = Date.now();
  for (const tabId of Object.keys(currentSessions)) {
    const session = await getSessionFromStorage(currentSessions[tabId]);
    if (!session || session.end) continue;
    await accountElapsed(session, now);
    session.isSystemIdle = state === 'idle';
    session.lastActivityAt = state === 'active' ? now : session.lastActivityAt;
    await saveSession(session.id, session);
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'flushData') {
    void initialize().then(flushSessions);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    void initialize().then(refreshOpenTabs);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!['ACTIVITY', 'EVENT', 'GET_SESSION_ID', 'GET_STATS', 'GET_ASSIGNMENT_ID', 'TOGGLE_PAUSE', 'DELETE_ASSIGNMENT'].includes(request.type)) {
    return false;
  }

  void handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error(`Unable to handle ${request.type}:`, error);
      sendResponse({ error: error.message });
    });
  return true;
});

async function handleMessage(request, sender) {
  await initialize();
  const senderTabId = sender.tab?.id;

  if (request.type === 'GET_SESSION_ID') {
    const sessionId = senderTabId === undefined ? null : currentSessions[senderTabId] || null;
    const settings = await getSettings();
    return {
      sessionId,
      isPaused: sessionId ? Boolean((await getSessionFromStorage(sessionId))?.isPaused) : false,
      bannerEnabled: settings.bannerEnabled
    };
  }

  if (request.type === 'GET_STATS' || request.type === 'GET_ASSIGNMENT_ID') {
    const tabId = Number(request.tabId ?? senderTabId);
    if (!Number.isInteger(tabId)) return { stats: null, assignmentId: null };
    const sessionId = currentSessions[tabId];
    if (!sessionId) return { stats: null, assignmentId: null };
    const session = await getSessionFromStorage(sessionId);
    if (!session || session.end) return { stats: null, assignmentId: null };

    if (request.type === 'GET_ASSIGNMENT_ID') {
      return { assignmentId: session.assignmentId };
    }

    return { stats: await getLiveStats(session) };
  }

  if (request.type === 'ACTIVITY') {
    if (senderTabId === undefined) return { ok: false };
    await handleActivity(senderTabId);
    return { ok: true };
  }

  if (request.type === 'EVENT') {
    if (senderTabId === undefined) return { ok: false };
    await handleEvent(senderTabId, request.data);
    return { ok: true };
  }

  if (request.type === 'TOGGLE_PAUSE') {
    const tabId = Number(request.tabId);
    const sessionId = currentSessions[tabId];
    if (!sessionId) return { ok: false };
    const session = await getSessionFromStorage(sessionId);
    if (!session || session.end) return { ok: false };
    await accountElapsed(session, Date.now());
    session.isPaused = !session.isPaused;
    session.lastTickAt = Date.now();
    await saveSession(session.id, session);
    await setContentActive(tabId, session);
    return { ok: true, isPaused: session.isPaused };
  }

  if (request.type === 'DELETE_ASSIGNMENT') {
    const assignmentId = request.assignmentId;
    for (const [tabId, sessionId] of Object.entries(currentSessions)) {
      const session = await getSessionFromStorage(sessionId);
      if (session?.assignmentId === assignmentId) {
        await endSession(Number(tabId));
      }
    }
    await deleteAssignmentData(assignmentId);
    return { ok: true };
  }

  if (senderTabId === undefined) return { ok: false };
  return { ok: false };
}

async function initialize() {
  if (initialization) return initialization;

  initialization = (async () => {
    const [sessions, tabs] = await Promise.all([
      getSessions(),
      chrome.tabs.query({})
    ]);
    const tabsById = new Map(tabs.filter(tab => tab.id !== undefined).map(tab => [tab.id, tab]));

    for (const session of sessions) {
      if (!session.end && Number.isInteger(session.tabId) && tabsById.has(session.tabId)) {
        currentSessions[session.tabId] = session.id;
        } else if (!session.end) {
          await accountElapsed(session, Date.now());
          session.end = Date.now();
          await saveSession(session.id, session);
        }
      }

    for (const tab of tabs) {
      if (tab.id !== undefined && tab.url) {
        await refreshTab(tab);
      }
    }
  })().catch(error => {
    initialization = null;
    throw error;
  });

  return initialization;
}

async function refreshOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url) {
      await refreshTab(tab);
    }
  }
}

async function refreshTab(tab) {
  if (tab.id === undefined || !tab.url) return;
  const settings = await getSettings();
  const allowed = settings.consentGiven && settings.allowedSites.some(pattern => matchesPattern(tab.url, pattern));

  if (!allowed) {
    await endSession(tab.id);
    return;
  }

  if (!currentSessions[tab.id]) {
    await startSession(tab, settings);
  } else {
    const session = await getSessionFromStorage(currentSessions[tab.id]);
    if (session && !session.end) {
      await setContentActive(tab.id, session, settings.bannerEnabled);
    }
  }
}

function matchesPattern(url, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

async function startSession(tab, settings) {
  const tabId = tab.id;
  if (tabId === undefined || currentSessions[tabId]) return;

  const assignmentId = normalizeUrl(tab.url);
  const assignments = await getAssignments();
  if (!assignments[assignmentId]) {
    await saveAssignment(assignmentId, {
      label: tab.title || 'Untitled assignment',
      url: tab.url,
      createdAt: Date.now(),
      expectedMinutes: null
    });
  }

  const now = Date.now();
  const sessionId = generateId();
  currentSessions[tabId] = sessionId;
  const session = {
    id: sessionId,
    tabId,
    assignmentId,
    start: now,
    end: null,
    lastTickAt: now,
    lastActivityAt: now,
    isFocused: Boolean(tab.active),
    isPaused: false,
    isSystemIdle: false,
    activeMs: 0,
    idleMs: 0,
    typedChars: 0,
    pastedChars: 0,
    pasteCount: 0,
    switchCount: 0
  };
  await saveSession(sessionId, session);
  await setContentActive(tabId, session, settings.bannerEnabled);
  updateBadge(tabId, 'ON', '#16845c');
}

async function endSession(tabId) {
  const sessionId = currentSessions[tabId];
  if (!sessionId) return;

  const session = await getSessionFromStorage(sessionId);
  if (session && !session.end) {
    await accountElapsed(session, Date.now());
    session.end = Date.now();
    await saveSession(sessionId, session);
  }

  delete currentSessions[tabId];
  updateBadge(tabId, '', '');
  try {
    await chrome.tabs.sendMessage(tabId, { command: 'SET_ACTIVE', value: false });
  } catch (error) {
    if (!error.message.includes('Receiving end does not exist')) throw error;
  }
}

async function setFocused(tabId, isFocused, countSwitch = false) {
  const sessionId = currentSessions[tabId];
  if (!sessionId) return;
  const session = await getSessionFromStorage(sessionId);
  if (!session || session.end || session.isFocused === isFocused) return;

  await accountElapsed(session, Date.now());
  session.isFocused = isFocused;
  if (countSwitch && !isFocused) {
    session.switchCount = (session.switchCount || 0) + 1;
  }
  session.lastTickAt = Date.now();
  await saveSession(sessionId, session);
}

async function accountElapsed(session, now) {
  const lastTickAt = session.lastTickAt || session.start;
  const elapsed = Math.max(0, now - lastTickAt);
  if (!elapsed) return;

  if (!session.isPaused && session.isFocused && !session.isSystemIdle) {
    const idleTimeoutMs = (await getSettings()).idleTimeoutSec * 1000;
    const activeUntil = Math.min(now, (session.lastActivityAt || lastTickAt) + idleTimeoutMs);
    const activeMs = Math.max(0, activeUntil - lastTickAt);
    session.activeMs = (session.activeMs || 0) + Math.min(elapsed, activeMs);
    session.idleMs = (session.idleMs || 0) + Math.max(0, elapsed - activeMs);
  } else {
    session.idleMs = (session.idleMs || 0) + elapsed;
  }
  session.lastTickAt = now;
}

async function getLiveStats(session) {
  const now = Date.now();
  const activeMs = session.activeMs || 0;
  const idleMs = session.idleMs || 0;
  const projected = { ...session };
  await accountElapsed(projected, now);
  const typedChars = session.typedChars || 0;
  const pastedChars = session.pastedChars || 0;

  return {
    isPaused: Boolean(session.isPaused),
    isActive: !session.isPaused && Boolean(session.isFocused),
    activeMs: projected.activeMs || activeMs,
    totalMs: Math.max(0, now - session.start),
    pasteCount: session.pasteCount || 0,
    pasteRatio: pastedChars + typedChars > 0 ? pastedChars / (pastedChars + typedChars) : 0,
    switchCount: session.switchCount || 0,
    idleMs
  };
}

async function handleActivity(tabId) {
  const sessionId = currentSessions[tabId];
  if (!sessionId) return;
  const session = await getSessionFromStorage(sessionId);
  if (!session || session.end || session.isPaused) return;
  const now = Date.now();
  await accountElapsed(session, now);
  session.lastActivityAt = now;
  session.isSystemIdle = false;
  await saveSession(sessionId, session);
}

async function handleEvent(tabId, data) {
  const sessionId = currentSessions[tabId];
  if (!sessionId || !data || typeof data.type !== 'string') return;
  const event = { ...data, id: generateId(), sessionId, ts: Date.now() };
  if ((event.type === 'paste' || event.type === 'drop') && !(await getSettings()).previewsEnabled) {
    delete event.preview;
  }
  await addEvent(event);

  const session = await getSessionFromStorage(sessionId);
  if (!session || session.end || session.isPaused) return;
  if (event.type === 'typing' || event.type === 'paste' || event.type === 'drop') {
    const now = Date.now();
    await accountElapsed(session, now);
    session.lastActivityAt = now;
    session.isSystemIdle = false;
  }
  if (event.type === 'paste') {
    session.pasteCount = (session.pasteCount || 0) + 1;
    session.pastedChars = (session.pastedChars || 0) + (Number(event.chars) || 0);
  } else if (event.type === 'typing') {
    session.typedChars = (session.typedChars || 0) + (Number(event.chars) || 0);
  } else if (event.type === 'blur') {
    session.switchCount = (session.switchCount || 0) + 1;
  }
  await saveSession(sessionId, session);
}

async function flushSessions() {
  const now = Date.now();
  for (const sessionId of Object.values(currentSessions)) {
    const session = await getSessionFromStorage(sessionId);
    if (!session || session.end) continue;
    await accountElapsed(session, now);
    await saveSession(sessionId, session);
  }
}

async function getSessionFromStorage(sessionId) {
  const sessions = await getSessions();
  return sessions.find(session => session.id === sessionId);
}

async function setContentActive(tabId, session, bannerEnabled) {
  const settings = bannerEnabled === undefined ? await getSettings() : null;
  try {
    await chrome.tabs.sendMessage(tabId, {
      command: 'SET_ACTIVE',
      value: !session.isPaused,
      bannerEnabled: bannerEnabled ?? settings.bannerEnabled
    });
  } catch (error) {
    if (!error.message.includes('Receiving end does not exist')) throw error;
  }
}

function updateBadge(tabId, text, color) {
  void chrome.action.setBadgeText({ text, tabId });
  if (color) {
    void chrome.action.setBadgeBackgroundColor({ color, tabId });
  }
}
