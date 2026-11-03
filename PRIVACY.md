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
The Chrome extension's activity data is stored on the user's local device using `chrome.storage.local`.

The optional student/lecturer portal sends account details, assignment responses, and uploaded attachments to the Supabase project configured by the project operator. Student responses and attachments are visible to the student and the lecturer who owns the student's enrolled class assignment. Assignments are visible only to their lecturer and students enrolled in the class. Attachments are held in a private bucket and served through short-lived signed links. Portal accounts, coursework, and file retention are managed by the project operator and can be subject to institutional policies. Do not collect real student work until the institution has approved the service and its retention/privacy terms.

## Security
- Supabase Auth handles portal passwords; the application does not store passwords itself.
- Role assignment is administrative; public registration creates student accounts only.
- Supabase row-level security protects course, assignment, submission, and file access.
- The browser app uses only the Supabase publishable/anon key; never put a service-role key in client code.
- Sensitive fields (passwords, credit cards) are explicitly ignored by the extension.
- DOM rendering uses `textContent` to prevent XSS.