# UniTrack

## Overview
UniTrack includes a Chrome extension for studying and a separate Supabase-powered coursework portal. The extension records assignment activity locally on the device; it does not send extension activity to the portal or a server.

## Installation
1. Clone this repository, or extract `unitrack.zip` and open its `UniTrack` folder.
2. Open Chrome and go to `chrome://extensions`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the repository folder (or the extracted `UniTrack` folder).

## Development
The unpacked Chrome extension itself does not need a build step. After editing extension files, return to `chrome://extensions` and click the extension's **Reload** button.

The ZIP packaging helper uses Node.js and JSZip:

1. Install Node.js.
2. Run `npm install` in the project folder.
3. Run `npm run package` to create `unitrack.zip`.

The popup refreshes live session data while open, and an open report refreshes when local session data changes. Settings are applied to currently open allowed tabs when saved.

## Student and lecturer portal
The UniTrack portal adds Supabase Auth, role-based workspaces, profile photos, private class join codes, department and academic-term setup, assignments, assignment-specific student groups, class discussions, optional weighted grading rubrics, class announcements, in-app notifications, student extension requests, autosaved drafts, private attachments, lecturer grading, a student gradebook, and live updates. Each student or group may make one final submission per assignment; group assignments use a lecturer-designated leader. Assignment and submission access is enforced by Supabase row-level security; a UI role check is not an authorization boundary.

### Configure Supabase
1. Create a Supabase project and open its **SQL Editor**.
2. The focused `supabase/profile-auth-migration.sql` has already been applied to the existing project; do not run it again. For a new project, back up the database and review/run the current `supabase/schema.sql` once in the SQL Editor. It adds the portal tables and missing columns to the existing schema, replaces row-level security policies, and configures private file buckets and realtime entries. If this project already has the schema installed, do not rerun it; apply only new migrations. Do not run it against a different project without first checking that project's existing schema.
3. Run `supabase/profile-avatar-policy.sql` in the SQL Editor to permit active users to manage their own profile photos. This policy remains restricted to the signed-in account; the portal does not use a service-role key.
4. Run `supabase/assignment-groups-migration.sql` in the SQL Editor. It enables assignment groups, leader-only group submissions, one-final-submission enforcement, and student-ID provisioning. Back up the database first and resolve any duplicate non-empty student IDs before running it.
5. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key). Never use a `service_role` or secret key in this browser app.
6. Copy `.env.example` to `.env.local` and replace the placeholder values:
   ```powershell
   Copy-Item .env.example .env.local
   ```
7. Deploy the secure account-provisioning Edge Function from the repository root:
   ```powershell
   npx supabase init
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase secrets set PORTAL_ORIGINS=https://your-production-domain.example
   npx supabase functions deploy admin-create-user
   ```
   Run `npx supabase init` only if this repository has not already been initialized for the Supabase CLI. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The function verifies the signed-in administrator and keeps the service-role key server-side; never add that key to `.env.local`, Vercel variables prefixed with `VITE_`, or browser code. Add each production portal origin as an exact origin in `PORTAL_ORIGINS`; local `localhost:5173` and `127.0.0.1:5173` origins are already allowed.
8. In Supabase **Authentication → URL Configuration**, set the local site URL to `http://localhost:5173` and add `http://localhost:5173/**` to the redirect URL allow list.
9. Disable public account creation in Supabase **Authentication → Settings**. Administrators create accounts in the portal’s **Users** page. Enter full name, email, role, a temporary password, and student ID for student accounts. Accounts require a password change at first sign-in. Give temporary passwords to account holders through a secure channel; the portal does not email them.

### Authentication checks
After running the schema and configuring Supabase Auth:
1. Confirm public email signups are disabled; the portal should show only sign-in and password recovery.
2. As an administrator, create a test student through the portal’s **Users** form with full name, email, unique student ID, and a temporary password. Give the password to the account holder securely, sign in, and confirm the student workspace opens and requires a password change.
3. Set `must_change_password = true` for a test account; sign in and verify coursework stays hidden until the new password is saved.
4. Use **Forgot password?**, follow the emailed link, and confirm the recovery form updates the password without leaving a token in the page URL after it is consumed.
5. Set the test profile's `active` flag to `false`; confirm sign-in is rejected and, after the database policies are installed, that account cannot read coursework.

### Run the portal locally
1. Run `npm install` from the project root.
2. Run `npm run dev:portal`.
3. Open the local URL printed by Vite (normally `http://localhost:5173`).
4. An administrator creates student, lecturer, and admin accounts in the portal with full name, email, role, and a temporary password; students also require a unique student ID. Account holders must change temporary passwords at first sign-in. Password resets remain in Supabase Auth; never put the service-role key in the browser app. Lecturers can associate classes with a department and term, share the class join code with students, then publish individual or group assignments, optionally defining a weighted rubric. For group assignments, lecturers create assignment-specific groups and assign enrolled students by student ID, then designate one leader who submits once for the group. Individual students can also submit only once per assignment. Students join with the code, write their response, optionally attach permitted files, submit, and discuss assignment questions with their lecturer and classmates. For assignments with a strict deadline, students can request an extension and lecturers can approve or decline it. Lecturers can also view enrolled class rosters, record daily attendance, grade submissions by rubric or overall mark, and release marks and feedback to students.

### Deploy to Vercel
1. After backing up your Supabase database and applying the reviewed `supabase/schema.sql`, `supabase/profile-avatar-policy.sql`, and `supabase/assignment-groups-migration.sql`, deploy the `admin-create-user` Edge Function as described above, then deploy the portal. Account provisioning and coursework features require their matching database schema and function.
2. In Vercel, import `sahrxdev/assignment-tracker` from GitHub. The included `vercel.json` sets the build command to `npm run build:portal` and the output directory to `dist/portal`.
3. In the Vercel project’s **Settings → Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the Project URL and publishable/anon key from Supabase. Never use a `service_role` or secret key.
4. Deploy, then copy the Vercel production URL into Supabase **Authentication → URL Configuration** as the Site URL. Add that URL and `http://localhost:5173` to the redirect URL allow list.

The browser key is public by design; row-level security and storage policies protect the data. Keep passwords, service-role keys, and other secrets out of the frontend and Git. The same build command and `dist/portal` output directory can be used with other static hosts.

This is a starter workflow, not a complete learning-management system: institutional single sign-on, extension-to-account linking, and policy/compliance review still need implementation. Student activity tracking remains a separate extension feature and is not included in assignment submissions.

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