# Privacy Policy

## Data Collection
We collect:
- Active time (duration of focus + interaction).
- Idle time.
- Character counts (typed vs pasted).
- Paste previews (first 50 chars, optional).
- Tab switch counts.

We do NOT collect:
- Keystrokes or passwords.
- Screenshots or audio/video.
- Data from non-allowed sites.

## Storage
All data is stored exclusively on the user's local device using `chrome.storage.local`. No data is sent to external servers.

## Security
- PINs are hashed with SHA-256.
- Sensitive fields (passwords, credit cards) are explicitly ignored.
- DOM rendering uses `textContent` to prevent XSS.