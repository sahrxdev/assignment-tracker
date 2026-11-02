import { getEventsBySession, getSessions, getSettings } from './storage.js';

/**
 * Calculates aggregate metrics for an assignment.
 * @param {string} assignmentId
 * @returns {Promise<Object>}
 */
export async function calculateMetrics(assignmentId) {
  const sessions = await getSessions(assignmentId);
  const settings = await getSettings();
  const now = Date.now();

  let totalActiveMs = 0;
  let totalIdleMs = 0;
  let totalMs = 0;
  let totalTypedChars = 0;
  let totalPastedChars = 0;
  let totalPasteCount = 0;
  let totalSwitchCount = 0;

  const allEvents = [];

  for (const session of sessions) {
    totalActiveMs += session.activeMs || 0;
    totalIdleMs += session.idleMs || 0;
    totalMs += Math.max(0, (session.end || now) - session.start);
    if (!session.end && session.lastTickAt) {
      const elapsed = Math.max(0, now - session.lastTickAt);
      if (!session.isPaused && session.isFocused && !session.isSystemIdle) {
        const idleTimeoutMs = settings.idleTimeoutSec * 1000;
        const activeUntil = Math.min(now, (session.lastActivityAt || session.lastTickAt) + idleTimeoutMs);
        const activeMs = Math.max(0, activeUntil - session.lastTickAt);
        totalActiveMs += Math.min(elapsed, activeMs);
        totalIdleMs += Math.max(0, elapsed - activeMs);
      } else {
        totalIdleMs += elapsed;
      }
    }
    totalTypedChars += session.typedChars || 0;
    totalPastedChars += session.pastedChars || 0;
    totalPasteCount += session.pasteCount || 0;
    totalSwitchCount += session.switchCount || 0;

    const events = await getEventsBySession(session.id);
    allEvents.push(...events);
  }

  const pasteRatio = totalPastedChars > 0 ? totalPastedChars / (totalPastedChars + totalTypedChars) : 0;

  return {
    assignmentId,
    sessionCount: sessions.length,
    totalActiveMs,
    totalIdleMs,
    totalMs,
    totalTypedChars,
    totalPastedChars,
    totalPasteCount,
    totalSwitchCount,
    pasteRatio,
    events: allEvents.sort((a, b) => a.ts - b.ts)
  };
}
