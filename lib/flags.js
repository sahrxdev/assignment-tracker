import { getSettings } from './storage.js';

/**
 * Determines risk flag based on metrics and settings.
 * @param {Object} metrics
 * @returns {Promise<{flag: string, reasons: string[]}>}
 */
export async function computeRiskFlag(metrics) {
  const settings = await getSettings();
  const t = settings.thresholds;
  const reasons = [];
  let flag = 'Normal';

  const pasteRatio = metrics.pasteRatio;
  const hasLargePaste = metrics.events.some(e => e.type === 'paste' && e.chars > t.largePasteChars);
  const multipleLargePastes = metrics.events.filter(e => e.type === 'paste' && e.chars > t.largePasteChars).length > 1;

  // Calculate switches per hour roughly
  const totalTimeHours = (metrics.totalActiveMs + metrics.totalIdleMs) / 3600000;
  const switchesPerHour = totalTimeHours > 0 ? metrics.totalSwitchCount / totalTimeHours : 0;

  // Expected time check requires assignment label/data which isn't passed here directly,
  // assuming caller provides expectedMinutes or we skip this complex check for now.
  // For simplicity, we rely on ratio and counts.

  if (pasteRatio < t.normalPasteRatio && !hasLargePaste) {
    flag = 'Normal';
  } else if (
    (pasteRatio >= t.normalPasteRatio && pasteRatio <= t.reviewPasteRatio) ||
    hasLargePaste ||
    switchesPerHour > t.tabSwitchesPerHour
  ) {
    flag = 'Review suggested';
    if (pasteRatio >= t.normalPasteRatio && pasteRatio <= t.reviewPasteRatio) reasons.push(`Paste ratio ${Math.round(pasteRatio*100)}% is between ${t.normalPasteRatio*100}%-${t.reviewPasteRatio*100}%`);
    if (hasLargePaste) reasons.push(`Single paste over ${t.largePasteChars} characters detected`);
    if (switchesPerHour > t.tabSwitchesPerHour) reasons.push(`${Math.round(switchesPerHour)} tab switches/hour exceeds limit of ${t.tabSwitchesPerHour}`);
  } else if (
    pasteRatio > t.reviewPasteRatio ||
    multipleLargePastes ||
    metrics.events.some(e => e.type === 'burst')
  ) {
    flag = 'High attention';
    if (pasteRatio > t.reviewPasteRatio) reasons.push(`Paste ratio ${Math.round(pasteRatio*100)}% exceeds ${t.reviewPasteRatio*100}%`);
    if (multipleLargePastes) reasons.push(`Multiple large pastes detected`);
    if (metrics.events.some(e => e.type === 'burst')) reasons.push(`Unnatural typing bursts detected`);
  }

  return { flag, reasons };
}
