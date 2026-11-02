# AssignmentTracker

## Overview
A Chrome Extension for teachers to monitor student engagement on online assignments by tracking active time and paste behavior. It prioritizes privacy by storing all data locally.

## Installation
1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `assignment-tracker` folder.

## Development
The unpacked Chrome extension itself does not need a build step. After editing extension files, return to `chrome://extensions` and click the extension's **Reload** button.

The ZIP packaging helper uses Node.js and JSZip:

1. Install Node.js.
2. Run `npm install` in the project folder.
3. Run `npm run package` to create `assignment-tracker.zip`.

The popup refreshes live session data while open, and an open report refreshes when local session data changes. Settings are applied to currently open allowed tabs when saved.

## Usage
1. **Consent**: On first install, a consent screen appears. Agree to enable tracking.
2. **Tracking**: Visit allowed sites (Google Docs/Forms by default). The badge turns green.
3. **Popup**: Click the icon to see live stats.
4. **Report**: Click "Open Full Report" in the popup for detailed analysis and exports.
5. **Settings**: Configure thresholds, roles, and allowed sites in the Options page.

## Permissions Justification
- `storage`: To save settings, sessions, and events locally.
- `alarms`: To periodically flush data and check idle states.
- `idle`: To detect when the user stops interacting with the computer.
- `tabs`: To track tab visibility and switching.
- `activeTab`: To access the current tab's URL for matching against allow-lists.
- `host_permissions`: To inject content scripts into Google Docs/Forms.

## Limitations
- Cannot detect AI-written text.
- Cannot distinguish between retyped text and pasted text if paste detection fails.
- Relies on browser focus/visibility APIs which may vary.

## Test Plan
1. Install extension. Verify consent screen.
2. Decline consent. Verify tracking does not start.
3. Accept consent. Open Google Doc. Verify badge is green.
4. Type 50 chars. Verify `typed_chars` increases.
5. Paste 100 chars. Verify `paste_count` is 1 and `chars` is 100.
6. Switch tabs 3 times. Verify `switch_count` is 3.
7. Copy internal text and paste. Verify `sourceType` is "internal".
8. Export CSV/JSON. Verify file integrity.
9. Delete data. Verify stats reset.
10. Check Network tab in DevTools. Verify 0 requests.

## Roadmap
- Revision history analysis.
- Multi-student dashboard.
- Localization.