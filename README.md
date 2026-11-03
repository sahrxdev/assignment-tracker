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

## Student and lecturer portal
The optional portal adds Supabase Auth, private class join codes, assignments, autosaved student drafts, final submissions, private attachments, and live updates. Assignment and submission access is enforced by Supabase row-level security; a UI role check is not an authorization boundary.

### Configure Supabase
1. Create a Supabase project and open its **SQL Editor**.
2. Run the entire `supabase/schema.sql` file to create the tables, private file bucket, role policies, and realtime publication entries.
3. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key). Never use a `service_role` or secret key in this browser app.
4. Copy `.env.example` to `.env.local` and replace the placeholder values:
   ```powershell
   Copy-Item .env.example .env.local
   ```
5. In Supabase **Authentication → URL Configuration**, set the local site URL to `http://localhost:5173`. Configure the email provider and confirmation policy you want before inviting real users.
6. Create an account in the portal. New self-service registrations are always students.
7. To authorize a lecturer, create their account in the portal, then run this administrative statement in the Supabase SQL Editor:
   ```sql
   update public.profiles
   set role = 'teacher'
   where email = 'lecturer@example.edu';
   ```
   Run it only as a trusted project administrator, after confirming the email address. Users cannot change their own role through the app or API.

### Run the portal locally
1. Run `npm install` from the project root.
2. Run `npm run dev:portal`.
3. Open the local URL printed by Vite (normally `http://localhost:5173`).
4. Lecturers create a class, share its join code with students, then publish an assignment to that class. Students join with the code, write their response, optionally attach files up to 10 MB each, and submit. Submitted work is locked in this first version.

To deploy the portal, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time environment variables in your static host, run `npm run build:portal`, and publish `dist/portal` as the site root over HTTPS. In Supabase **Authentication → URL Configuration**, set the production site URL and add your local development URL to the redirect URL allow list. The browser key is public by design; row-level security and storage policies protect the data. Keep passwords, service-role keys, and other secrets out of the frontend and Git.

This is a starter workflow, not a complete learning-management system: it does not yet include grading, class rosters, institutional single sign-on, extension-to-account linking, or policy/compliance review. Student activity tracking remains a separate extension feature and is not included in assignment submissions.

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