/**
 * Converts metrics/events to CSV format.
 * @param {Object} metrics
 * @returns {string}
 */
export function exportToCSV(metrics) {
  let csv = "Type,Timestamp,Characters,Words,Preview,Meta\n";
  metrics.events.forEach(e => {
    const preview = e.preview ? `"${e.preview.replace(/"/g, '""')}"` : "";
    const meta = e.meta ? `"${JSON.stringify(e.meta).replace(/"/g, '""')}"` : "";
    csv += `${e.type},${new Date(e.ts).toISOString()},${e.chars || 0},${e.words || 0},${preview},${meta}\n`;
  });
  return csv;
}

/**
 * Converts metrics to JSON format.
 * @param {Object} metrics
 * @returns {string}
 */
export function exportToJSON(metrics) {
  return JSON.stringify(metrics, null, 2);
}
