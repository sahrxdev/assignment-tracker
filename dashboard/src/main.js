import { createClient } from '@supabase/supabase-js';

const config = {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_ANON_KEY
};
const supabaseUrl = config.url?.trim() || '';
const supabaseKey = config.key?.trim() || '';
const validSupabaseUrl = (() => {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
})();
const configError = !supabaseUrl
  ? 'Add your Supabase URL and publishable/anon key to .env.local, then restart the portal.'
  : !validSupabaseUrl
    ? 'The Supabase URL must be a valid HTTP or HTTPS URL, such as https://your-project.supabase.co.'
    : !supabaseKey
      ? 'Add your Supabase publishable/anon key to .env.local, then restart the portal.'
      : '';
const ready = !configError;
const supabase = ready ? createClient(supabaseUrl, supabaseKey) : null;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const state = {
  user: null,
  profile: null,
  studentAssignments: [],
  studentSubmissions: new Map(),
  studentGrades: new Map(),
  studentRubricScores: new Map(),
  studentExtensions: new Map(),
  studentExtensionRequests: new Map(),
  studentCourses: [],
  teacherCourses: [],
  departments: [],
  terms: [],
  teacherAssignments: [],
  teacherSubmissions: [],
  notifications: [],
  selectedAssignment: null,
  submission: null,
  saveTimer: null,
  authPendingTimer: null,
  deadlineTimer: null,
  studentFiles: [],
  submissionHistory: [],
  realtime: null,
  authSubscription: null,
  recoveringPassword: false,
  deactivatedSignOut: false,
  busy: false
};

const byId = id => document.getElementById(id);
const authForm = byId('auth-form');
const authStatus = byId('auth-status');
const dashboardView = byId('dashboard-view');
const authView = byId('auth-view');
byId('attendance-date').value = localDateValue(new Date());
byId('term-year').value = String(new Date().getFullYear());

if (!ready) {
  byId('setup-message').hidden = false;
  authStatus.textContent = configError;
  authStatus.dataset.state = 'error';
  byId('auth-submit').disabled = true;
  byId('forgot-password').disabled = true;
  byId('reset-submit').disabled = true;
} else {
  initializeAuth();
}

byId('forgot-password').addEventListener('click', () => showAuthCard('password-reset-form'));
byId('return-to-login').addEventListener('click', () => showAuthCard('auth-form'));

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!supabase || state.busy) return;
  setBusy(true, 'Signing in');
  setNotice(authStatus, 'Signing you in…', '');
  clearTimeout(state.authPendingTimer);
  state.authPendingTimer = window.setTimeout(() => {
    if (state.busy) {
      setNotice(authStatus, 'This is taking longer than expected. Check your connection and Supabase project status; we will show the result when it arrives.', '');
    }
  }, 12000);

  const email = byId('email').value.trim();
  const password = byId('password').value;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadWorkspace(data.user);
    form.reset();
  } catch (error) {
    setNotice(authStatus, friendlyError(error), 'error');
  } finally {
    clearTimeout(state.authPendingTimer);
    state.authPendingTimer = null;
    setBusy(false);
  }
});

byId('password-reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!supabase) {
    setNotice(byId('reset-status'), configError, 'error');
    return;
  }
  const button = byId('reset-submit');
  button.disabled = true;
  setNotice(byId('reset-status'), 'Sending reset instructions…', '');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(byId('reset-email').value.trim(), {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    setNotice(byId('reset-status'), 'If an account exists for that email, a password reset link is on its way.', 'success');
    form.reset();
  } catch (error) {
    setNotice(byId('reset-status'), friendlyError(error), 'error');
  } finally {
    button.disabled = false;
  }
});

byId('recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!supabase) {
    setNotice(byId('recovery-status'), configError, 'error');
    return;
  }
  if (state.busy) return;
  const password = byId('recovery-password').value;
  if (password !== byId('recovery-password-confirm').value) {
    setNotice(byId('recovery-status'), 'The passwords do not match.', 'error');
    return;
  }
  setBusy(true, 'Saving password');
  setNotice(byId('recovery-status'), 'Saving your new password…', '');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    state.recoveringPassword = false;
    form.reset();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    await loadWorkspace(userData.user);
  } catch (error) {
    setNotice(byId('recovery-status'), friendlyError(error), 'error');
  } finally {
    setBusy(false);
  }
});

byId('forced-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!supabase || state.busy || !state.user) return;
  const password = byId('forced-password').value;
  if (password !== byId('forced-password-confirm').value) {
    setNotice(byId('forced-password-status'), 'The passwords do not match.', 'error');
    return;
  }
  setBusy(true, 'Updating password');
  setNotice(byId('forced-password-status'), 'Updating your password…', '');
  try {
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) throw passwordError;
    state.profile.must_change_password = false;
    form.reset();
    await showWorkspace();
  } catch (error) {
    setNotice(byId('forced-password-status'), friendlyError(error), 'error');
  } finally {
    setBusy(false);
  }
});

byId('sign-out').addEventListener('click', async () => {
  setBusy(true);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await resetWorkspace();
  } catch (error) {
    setNotice(authStatus, `Could not sign out: ${friendlyError(error)}`, 'error');
  } finally {
    setBusy(false);
  }
});

byId('student-response').addEventListener('input', () => {
  updateWordCount();
  scheduleDraftSave();
});
byId('student-response').addEventListener('blur', () => {
  if (state.selectedAssignment && !isSubmitted()) void saveDraft();
});
byId('student-files').addEventListener('change', uploadSelectedFiles);
byId('submit-assignment').addEventListener('click', submitAssignment);
byId('extension-request-form').addEventListener('submit', requestDeadlineExtension);
byId('student-discussion-form').addEventListener('submit', postDiscussionComment);
byId('teacher-discussion-form').addEventListener('submit', postDiscussionComment);
byId('student-discussion-list').addEventListener('click', event => {
  const button = event.target.closest('[data-comment-delete]');
  if (button) void deleteDiscussionComment(button);
});
byId('teacher-discussion-list').addEventListener('click', event => {
  const button = event.target.closest('[data-comment-delete]');
  if (button) void deleteDiscussionComment(button);
});
byId('refresh-student').addEventListener('click', loadStudentAssignments);
byId('refresh-teacher').addEventListener('click', loadTeacherAssignments);
byId('teacher-submissions').addEventListener('submit', event => {
  if (event.target.matches('.grade-form')) void saveGrade(event);
});
byId('assignment-form').addEventListener('submit', createAssignment);
byId('add-rubric-criterion').addEventListener('click', () => addRubricCriterion());
byId('rubric-criteria-editor').addEventListener('click', event => {
  const removeButton = event.target.closest('[data-remove-rubric-criterion]');
  if (removeButton) removeButton.closest('.rubric-criterion-row')?.remove();
});
byId('announcement-form').addEventListener('submit', createAnnouncement);
byId('join-course-form').addEventListener('submit', joinCourse);
byId('course-form').addEventListener('submit', createCourse);
byId('refresh-courses').addEventListener('click', loadTeacherCourses);
byId('refresh-notifications').addEventListener('click', loadNotifications);
byId('notification-list').addEventListener('click', event => {
  const button = event.target.closest('[data-notification-id]');
  if (button) void markNotificationRead(button);
});
byId('roster-course').addEventListener('change', loadCourseRoster);
byId('attendance-date').addEventListener('change', loadCourseRoster);
byId('course-roster-list').addEventListener('click', event => {
  const button = event.target.closest('[data-attendance-student]');
  if (button) void saveAttendance(button);
});
byId('refresh-admin-users').addEventListener('click', loadAdminUsers);
byId('refresh-directory').addEventListener('click', loadAcademicDirectory);
byId('department-form').addEventListener('submit', createDepartment);
byId('term-form').addEventListener('submit', createTerm);
byId('academic-directory').addEventListener('click', event => {
  const button = event.target.closest('[data-directory-delete]');
  if (button) void deleteDirectoryEntry(button);
});
byId('admin-user-list').addEventListener('click', event => {
  const button = event.target.closest('[data-admin-user-id]');
  if (button) void updateManagedUser(button);
});

async function initializeAuth() {
  state.recoveringPassword = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setNotice(authStatus, `Could not restore your sign-in: ${friendlyError(error)}`, 'error');
  } else if (state.recoveringPassword) {
    showAuthCard('recovery-form');
    window.history.replaceState(null, '', window.location.pathname);
  } else if (data.session) {
    await loadWorkspace(data.session.user).catch(showWorkspaceError);
  }

  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.recoveringPassword = true;
      showAuthCard('recovery-form');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (event === 'SIGNED_OUT' || !session) {
      if (state.deactivatedSignOut) {
        state.deactivatedSignOut = false;
        return;
      }
      window.setTimeout(() => {
        void resetWorkspace();
      }, 0);
    } else if (state.recoveringPassword) {
      return;
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      window.setTimeout(() => {
        void loadWorkspace(session.user).catch(showWorkspaceError);
      }, 0);
    }
  });
  state.authSubscription = listener.subscription;
}

async function loadWorkspace(user) {
  if (!user || !supabase) return;
  if (state.user?.id === user.id && state.profile) return;
  state.user = user;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, full_name, role, active, must_change_password')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(`Could not load your account profile: ${friendlyError(error)}`);
  if (!profile || !['student', 'teacher', 'admin'].includes(profile.role)) {
    throw new Error('Your account has no valid role. Contact your administrator.');
  }
  if (!profile.active) {
    state.deactivatedSignOut = true;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      state.deactivatedSignOut = false;
      throw new Error(`This account is deactivated, but sign-out failed: ${friendlyError(signOutError)}`);
    }
    throw new Error('This account is deactivated. Contact your university administrator.');
  }

  state.profile = profile;
  if (profile.must_change_password) {
    dashboardView.hidden = true;
    byId('account-bar').hidden = true;
    showAuthCard('forced-password-form');
    setNotice(byId('forced-password-status'), 'For your security, change the temporary password before continuing.', '');
    return;
  }
  await showWorkspace();
}

async function showWorkspace() {
  authView.hidden = true;
  dashboardView.hidden = false;
  byId('account-bar').hidden = false;
  const isTeacher = state.profile?.role === 'teacher';
  const isAdmin = state.profile?.role === 'admin';
  byId('account-label').textContent = state.profile?.full_name || state.profile?.display_name || state.profile?.email || '';
  byId('student-panel').hidden = isTeacher || isAdmin;
  byId('teacher-panel').hidden = !isTeacher;
  byId('admin-panel').hidden = !isAdmin;
  byId('role-label').textContent = isAdmin ? 'Administrator workspace' : isTeacher ? 'Lecturer workspace' : 'Student workspace';
  byId('role-chip').textContent = isAdmin ? 'Administrator' : isTeacher ? 'Lecturer' : 'Student';
  byId('welcome-title').textContent = isAdmin ? 'Administration' : isTeacher ? 'Your teaching space' : 'Your assignments';
  byId('welcome-copy').textContent = isAdmin
    ? 'Manage university accounts and coursework.'
    : isTeacher
      ? 'Create assignment briefs and review student submissions.'
      : 'Choose an assignment to read the brief and work on your response.';

  await loadWorkspaceData();
  await loadNotifications();
  subscribeToChanges();
}

async function loadWorkspaceData() {
  if (state.profile?.role === 'admin') {
    await Promise.all([loadAdminUsers(), loadAcademicDirectory()]);
  } else if (state.profile?.role === 'teacher') {
    await Promise.all([loadTeacherAssignments(), loadAcademicDirectory()]);
  } else if (state.profile?.role === 'student') {
    await loadStudentAssignments();
  }
}

async function loadAcademicDirectory() {
  if (!state.user) return;
  setNotice(byId('directory-status'), 'Loading departments and terms…', '');
  const [departmentResult, termResult] = await Promise.all([
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('terms').select('id, name, academic_year, starts_at, ends_at').order('academic_year', { ascending: false }).order('name')
  ]);
  if (departmentResult.error) {
    setNotice(byId('directory-status'), `Could not load departments: ${friendlyError(departmentResult.error)}`, 'error');
    return;
  }
  if (termResult.error) {
    setNotice(byId('directory-status'), `Could not load academic terms: ${friendlyError(termResult.error)}`, 'error');
    return;
  }
  state.departments = departmentResult.data || [];
  state.terms = termResult.data || [];
  renderAcademicDirectory();
  if (state.profile?.role === 'teacher') renderTeacherCourses();
}

function renderAcademicDirectory() {
  const directory = byId('academic-directory-list');
  directory.replaceChildren();
  const entries = [
    ...state.departments.map(item => ({ ...item, kind: 'department' })),
    ...state.terms.map(item => ({ ...item, kind: 'term', label: `${item.name} · ${item.academic_year}` }))
  ];
  if (!entries.length) {
    directory.append(makeListMessage('No departments or academic terms have been added.'));
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('article');
    item.className = 'directory-item';
    const name = document.createElement('strong');
    name.textContent = entry.label || entry.name;
    const type = document.createElement('small');
    type.textContent = entry.kind === 'department' ? 'Department' : 'Academic term';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.dataset.directoryDelete = entry.kind;
    remove.dataset.directoryId = entry.id;
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${entry.kind} ${entry.label || entry.name}`);
    item.append(name, type, remove);
    directory.append(item);
  }
}

async function createDepartment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const name = byId('department-name').value.trim();
  if (!name || !state.user || state.profile?.role !== 'admin') return;
  button.disabled = true;
  setNotice(byId('directory-status'), 'Adding department…', '');
  try {
    const { error } = await supabase.from('departments').insert({ name });
    if (error) throw error;
    form.reset();
    await loadAcademicDirectory();
    setNotice(byId('directory-status'), 'Department added.', 'success');
  } catch (error) {
    setNotice(byId('directory-status'), `Could not add department: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function createTerm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const name = byId('term-name').value.trim();
  const academicYear = Number(byId('term-year').value);
  const startsAt = byId('term-start').value || null;
  const endsAt = byId('term-end').value || null;
  if (!name || !state.user || state.profile?.role !== 'admin') return;
  if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200
    || (startsAt && endsAt && endsAt < startsAt)) {
    setNotice(byId('directory-status'), 'Enter a valid academic year and a term end date on or after its start date.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('directory-status'), 'Adding academic term…', '');
  try {
    const { error } = await supabase.from('terms').insert({
      name,
      academic_year: academicYear,
      starts_at: startsAt,
      ends_at: endsAt
    });
    if (error) throw error;
    form.reset();
    byId('term-year').value = String(new Date().getFullYear());
    await loadAcademicDirectory();
    setNotice(byId('directory-status'), 'Academic term added.', 'success');
  } catch (error) {
    setNotice(byId('directory-status'), `Could not add academic term: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteDirectoryEntry(button) {
  if (state.profile?.role !== 'admin' || !state.user) return;
  const kind = button.dataset.directoryDelete;
  const id = button.dataset.directoryId;
  const entries = kind === 'department' ? state.departments : state.terms;
  const entry = entries.find(item => item.id === id);
  if (!entry || !window.confirm(`Delete ${kind} "${kind === 'term' ? `${entry.name} ${entry.academic_year}` : entry.name}"?`)) return;
  button.disabled = true;
  try {
    const table = kind === 'department' ? 'departments' : 'terms';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    await loadAcademicDirectory();
    setNotice(byId('directory-status'), `${kind === 'term' ? 'Academic term' : 'Department'} deleted. Classes using it will no longer be linked to it.`, 'success');
  } catch (error) {
    button.disabled = false;
    setNotice(byId('directory-status'), `Could not delete ${kind}: ${friendlyError(error)}`, 'error');
  }
}

async function loadNotifications() {
  if (!state.user) return;
  const list = byId('notification-list');
  list.replaceChildren(makeListMessage('Loading notifications…'));
  setNotice(byId('notification-status'), '', '');
  try {
    const { data, error } = await supabase.from('notifications')
      .select('id, type, message, link, read, created_at')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    state.notifications = data || [];
    renderNotifications();
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load notifications: ${friendlyError(error)}`));
  }
}

function renderNotifications() {
  const list = byId('notification-list');
  const unreadCount = state.notifications.filter(item => !item.read).length;
  byId('notification-count').textContent = String(unreadCount);
  list.replaceChildren();
  if (!state.notifications.length) {
    list.append(makeListMessage('You are all caught up.'));
    return;
  }
  for (const notification of state.notifications) {
    const item = document.createElement('article');
    item.className = `notification-item${notification.read ? '' : ' is-unread'}`;
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = notification.message;
    const created = document.createElement('small');
    created.textContent = formatDate(notification.created_at);
    content.append(message, created);
    item.append(content);
    if (!notification.read) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.dataset.notificationId = notification.id;
      button.textContent = 'Mark read';
      item.append(button);
    }
    list.append(item);
  }
}

async function markNotificationRead(button) {
  const notification = state.notifications.find(item => item.id === button.dataset.notificationId);
  if (!notification || notification.read) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('notifications')
      .update({ read: true })
      .eq('id', notification.id)
      .eq('user_id', state.user.id)
      .eq('read', false);
    if (error) throw error;
    notification.read = true;
    renderNotifications();
  } catch (error) {
    button.disabled = false;
    setNotice(byId('notification-status'), `Could not mark notification as read: ${friendlyError(error)}`, 'error');
  }
}

async function loadAdminUsers() {
  if (!state.user || state.profile?.role !== 'admin') return;
  const list = byId('admin-user-list');
  list.replaceChildren(makeListMessage('Loading user accounts…'));
  setNotice(byId('admin-status'), '', '');
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, email, full_name, display_name, role, active, must_change_password, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    list.replaceChildren();
    if (!data?.length) {
      list.append(makeListMessage('No accounts found.'));
      return;
    }
    for (const profile of data) {
      const card = document.createElement('article');
      card.className = 'admin-user-card';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = profile.full_name || profile.display_name || 'Name not set';
      const email = document.createElement('small');
      email.textContent = profile.email;
      const metadata = document.createElement('small');
      metadata.textContent = `${profile.active ? 'Active' : 'Deactivated'} · ${profile.must_change_password ? 'Password change required' : 'Password set'} · Joined ${formatDate(profile.created_at)}`;
      details.append(name, email, metadata);
      const controls = document.createElement('div');
      controls.className = 'admin-user-controls';
      const role = document.createElement('select');
      role.setAttribute('aria-label', `Role for ${profile.email}`);
      for (const optionValue of ['student', 'teacher', 'admin']) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue === 'teacher' ? 'Lecturer' : optionValue === 'admin' ? 'Admin' : 'Student';
        option.selected = profile.role === optionValue;
        role.append(option);
      }
      const forcePassword = document.createElement('label');
      forcePassword.className = 'form-check';
      const forceInput = document.createElement('input');
      forceInput.type = 'checkbox';
      forceInput.checked = profile.must_change_password;
      forceInput.setAttribute('aria-label', `Require password change for ${profile.email}`);
      const forceText = document.createElement('span');
      forceText.textContent = 'Require password change';
      forcePassword.append(forceInput, forceText);
      const activeAccess = document.createElement('label');
      activeAccess.className = 'form-check';
      const activeInput = document.createElement('input');
      activeInput.type = 'checkbox';
      activeInput.checked = profile.active;
      activeInput.setAttribute('aria-label', `Account active for ${profile.email}`);
      const activeText = document.createElement('span');
      activeText.textContent = 'Account active';
      activeAccess.append(activeInput, activeText);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-secondary';
      button.dataset.adminUserId = profile.id;
      button.dataset.role = role.value;
      button.dataset.active = String(activeInput.checked);
      button.dataset.forcePassword = String(forceInput.checked);
      button.textContent = 'Save account settings';
      role.addEventListener('change', () => { button.dataset.role = role.value; });
      forceInput.addEventListener('change', () => { button.dataset.forcePassword = String(forceInput.checked); });
      activeInput.addEventListener('change', () => { button.dataset.active = String(activeInput.checked); });
      if (profile.id === state.user.id) {
        role.disabled = true;
        forceInput.disabled = true;
        activeInput.disabled = true;
        button.disabled = true;
        button.title = 'You cannot change your own administrator account.';
      }
      controls.append(role, activeAccess, forcePassword, button);
      card.append(details, controls);
      list.append(card);
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load user accounts: ${friendlyError(error)}`));
  }
}

async function updateManagedUser(button) {
  const userId = button.dataset.adminUserId;
  const nextActive = button.dataset.active === 'true';
  const role = button.dataset.role;
  const forcePassword = button.dataset.forcePassword === 'true';
  if (userId === state.user?.id && (!nextActive || role !== 'admin')) {
    setNotice(byId('admin-status'), 'You cannot deactivate or remove your own administrator access.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('admin-status'), 'Saving account settings…', '');
  try {
    const { error } = await supabase.rpc('admin_update_user_access', {
      target_user_id: userId,
      new_role: role,
      new_active: nextActive,
      require_password_change: forcePassword
    });
    if (error) throw error;
    setNotice(byId('admin-status'), 'Account settings updated.', 'success');
    await loadAdminUsers();
  } catch (error) {
    setNotice(byId('admin-status'), `Could not update account: ${friendlyError(error)}`, 'error');
    button.disabled = false;
  }
}

async function loadStudentAssignments() {
  if (!state.user || state.profile?.role !== 'student') return;
  const list = byId('student-assignment-list');
  const previousDueDate = state.selectedAssignment ? effectiveDueDate(state.selectedAssignment) : null;
  const previousSubmission = state.submission;
  const previousGrade = previousSubmission ? state.studentGrades.get(previousSubmission.id) : null;
  list.replaceChildren(makeListMessage('Loading assignments…'));

  try {
    const [assignmentResult, submissionResult, courseResult, extensionResult, gradeResult] = await Promise.all([
      supabase.from('assignments')
        .select('id, course_id, title, instructions, due_at, due_date, allow_late, late_penalty_percent, max_marks, allow_resubmission, allowed_file_types, max_file_size_bytes, created_at')
        .eq('published', true),
      supabase.from('submissions')
        .select('id, assignment_id, response, status, is_late, version_number, submitted_at, updated_at')
        .eq('student_id', state.user.id),
      supabase.from('courses').select('id, name').order('name'),
      supabase.from('extensions')
        .select('id, assignment_id, requested_due_at, extended_due_at, reason, status, granted_by')
        .eq('student_id', state.user.id),
      supabase.from('grades')
        .select('id, submission_id, mark, final_mark, feedback, released_at, updated_at')
    ]);
    if (assignmentResult.error) throw assignmentResult.error;
    if (submissionResult.error) throw submissionResult.error;
    if (courseResult.error) throw courseResult.error;
    if (extensionResult.error) throw extensionResult.error;
    if (gradeResult.error) throw gradeResult.error;
    const gradeIds = (gradeResult.data || []).map(item => item.id);
    let rubricScores = [];
    if (gradeIds.length) {
      const { data, error } = await supabase.from('rubric_scores')
        .select('id, grade_id, criterion_id, score, feedback')
        .in('grade_id', gradeIds);
      if (error) throw error;
      rubricScores = data || [];
    }
    const criterionIds = [...new Set(rubricScores.map(item => item.criterion_id))];
    let rubricCriteria = [];
    if (criterionIds.length) {
      const { data, error } = await supabase.from('rubric_criteria')
        .select('id, title, max_points, weight_percent')
        .in('id', criterionIds);
      if (error) throw error;
      rubricCriteria = data || [];
    }
    const criteriaById = new Map(rubricCriteria.map(item => [item.id, item]));
    state.studentAssignments = assignmentResult.data || [];
    state.studentSubmissions = new Map((submissionResult.data || []).map(item => [item.assignment_id, item]));
    state.studentGrades = new Map((gradeResult.data || []).map(item => [item.submission_id, item]));
    state.studentRubricScores = new Map();
    for (const rubricScore of rubricScores) {
      const criterion = criteriaById.get(rubricScore.criterion_id);
      if (!criterion) continue;
      const scores = state.studentRubricScores.get(rubricScore.grade_id) || [];
      scores.push({ ...rubricScore, criterion });
      state.studentRubricScores.set(rubricScore.grade_id, scores);
    }
    state.studentExtensions = new Map();
    state.studentExtensionRequests = new Map();
    for (const extension of extensionResult.data || []) {
      state.studentExtensionRequests.set(extension.assignment_id, extension);
      if (extension.status === 'approved' && extension.extended_due_at) {
        const current = state.studentExtensions.get(extension.assignment_id);
        if (!current || new Date(extension.extended_due_at) > new Date(current)) {
          state.studentExtensions.set(extension.assignment_id, extension.extended_due_at);
        }
      }
    }
    state.studentCourses = courseResult.data || [];
    await loadStudentAnnouncements();
    state.studentAssignments.sort((left, right) => {
      const leftDue = assignmentDueDate(left);
      const rightDue = assignmentDueDate(right);
      if (!leftDue) return rightDue ? 1 : 0;
      if (!rightDue) return -1;
      return new Date(leftDue) - new Date(rightDue);
    });
    renderStudentAssignments();
    renderStudentGradebook();

    if (state.selectedAssignment) {
      const refreshed = state.studentAssignments.find(item => item.id === state.selectedAssignment.id);
      if (refreshed) {
        const submission = state.studentSubmissions.get(refreshed.id);
        const grade = submission ? state.studentGrades.get(submission.id) : null;
        const submissionChanged = submission?.id !== previousSubmission?.id
          || submission?.status !== previousSubmission?.status
          || submission?.is_late !== previousSubmission?.is_late
          || submission?.version_number !== previousSubmission?.version_number
          || submission?.updated_at !== previousSubmission?.updated_at;
        const gradeChanged = grade?.id !== previousGrade?.id
          || grade?.updated_at !== previousGrade?.updated_at
          || grade?.released_at !== previousGrade?.released_at;
        if (submissionChanged || gradeChanged
          || effectiveDueDate(refreshed) !== previousDueDate) {
          await openStudentAssignment(refreshed, submission);
        } else {
          state.selectedAssignment = refreshed;
          renderStudentAssignments();
        }
      } else {
        state.selectedAssignment = null;
        state.submission = null;
        byId('student-detail').hidden = true;
        byId('student-empty').hidden = false;
      }
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(friendlyError(error)));
  }
}

function renderStudentAssignments() {
  const list = byId('student-assignment-list');
  list.replaceChildren();
  if (!state.studentAssignments.length) {
    list.append(makeListMessage('No assignments have been published yet.'));
    return;
  }

  for (const assignment of state.studentAssignments) {
    const submission = state.studentSubmissions.get(assignment.id);
    const grade = submission ? state.studentGrades.get(submission.id) : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assignment-item';
    button.setAttribute('aria-current', state.selectedAssignment?.id === assignment.id ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = assignment.title;
    const status = document.createElement('span');
    status.className = 'assignment-status';
    status.textContent = getAssignmentStatus(assignment, submission, grade);
    title.append(status);
    const due = document.createElement('small');
    const course = state.studentCourses.find(item => item.id === assignment.course_id);
    const dueAt = effectiveDueDate(assignment);
    due.textContent = `${course?.name || 'Class'} · ${dueAt ? `Due ${formatDate(dueAt)}` : 'No due date'}`;
    if (dueAt && !isClosed(assignment)) {
      const countdown = document.createElement('span');
      countdown.className = 'assignment-countdown';
      countdown.textContent = formatCountdown(dueAt);
      due.append(' · ', countdown);
    }
    button.append(title, due);
    button.addEventListener('click', () => {
      void switchStudentAssignment(assignment, submission);
    });
    list.append(button);
  }
}

function renderStudentGradebook() {
  const list = byId('student-gradebook-list');
  list.replaceChildren();
  const released = state.studentAssignments
    .map(assignment => {
      const submission = state.studentSubmissions.get(assignment.id);
      const grade = submission ? state.studentGrades.get(submission.id) : null;
      return grade?.released_at
        ? { assignment, submission, grade }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.grade.released_at) - new Date(left.grade.released_at));

  if (!released.length) {
    list.append(makeListMessage('Released marks and feedback will appear here.'));
    return;
  }

  for (const entry of released) {
    const item = document.createElement('article');
    item.className = 'gradebook-item';
    const heading = document.createElement('strong');
    heading.textContent = entry.assignment.title;
    const course = state.studentCourses.find(value => value.id === entry.assignment.course_id);
    const score = document.createElement('span');
    score.className = 'gradebook-score';
    score.textContent = `${entry.grade.final_mark} / ${entry.assignment.max_marks}`;
    const meta = document.createElement('small');
    meta.textContent = `${course?.name || 'Class'} · Released ${formatDate(entry.grade.released_at)}`;
    item.append(heading, score, meta);
    if (entry.grade.feedback) {
      const feedback = document.createElement('p');
      feedback.textContent = entry.grade.feedback;
      item.append(feedback);
    }
    const rubricScores = state.studentRubricScores.get(entry.grade.id) || [];
    if (rubricScores.length) {
      const rubric = document.createElement('ul');
      rubric.className = 'gradebook-rubric';
      for (const rubricScore of rubricScores) {
        const row = document.createElement('li');
        const criterion = document.createElement('strong');
        criterion.textContent = `${rubricScore.criterion.title}: ${rubricScore.score}/${rubricScore.criterion.max_points}`;
        row.append(criterion);
        if (rubricScore.feedback) {
          const criterionFeedback = document.createElement('small');
          criterionFeedback.textContent = rubricScore.feedback;
          row.append(criterionFeedback);
        }
        rubric.append(row);
      }
      item.append(rubric);
    }
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'text-button gradebook-open';
    open.textContent = 'View submission';
    open.addEventListener('click', () => {
      void switchStudentAssignment(entry.assignment, entry.submission);
    });
    item.append(open);
    list.append(item);
  }
}

async function switchStudentAssignment(assignment, submission) {
  if (state.selectedAssignment?.id === assignment.id) return;
  if (isSubmitted() && byId('student-response').value !== (state.submission?.response || '')
    && !window.confirm('Discard your unsent resubmission edits?')) return;
  if (state.selectedAssignment && !isSubmitted() &&
      (state.submission || byId('student-response').value.length > 0)) {
    const saved = await saveDraft();
    if (!saved && byId('student-response').value.trim()) return;
  }
  await openStudentAssignment(assignment, submission);
}

async function openStudentAssignment(assignment, submission) {
  clearTimeout(state.saveTimer);
  state.selectedAssignment = assignment;
  state.submission = null;
  byId('student-response').value = '';
  byId('student-file-list').replaceChildren();
  byId('student-empty').hidden = true;
  byId('student-detail').hidden = false;
  byId('student-assignment-title').textContent = assignment.title;
  const dueAt = effectiveDueDate(assignment);
  byId('student-due').textContent = dueAt
    ? `Due ${formatDate(dueAt)}${usesExtensionDueDate(assignment) ? ' (extension)' : ''} · ${formatCountdown(dueAt)}`
    : 'No due date';
  byId('student-instructions').textContent = assignment.instructions || 'No additional instructions were provided.';
  renderStudentExtensionRequest(assignment);

  if (!submission) {
    const { data, error } = await supabase.from('submissions')
      .select('id, assignment_id, response, status, is_late, version_number, submitted_at, updated_at')
      .eq('assignment_id', assignment.id)
      .eq('student_id', state.user.id)
      .maybeSingle();
    if (error) {
      setDraftStatus(friendlyError(error), 'error');
      return;
    }
    submission = data;
  }

  state.submission = submission;
  await loadAssignmentDiscussion(assignment, 'student');
  renderStudentExtensionRequest(assignment);
  const submitted = submission?.status === 'submitted';
  const closed = isClosed(assignment);
  const grade = submission ? state.studentGrades.get(submission.id) : null;
  byId('student-response').value = submission?.response || '';
  byId('student-submission-state').textContent = getAssignmentStatus(assignment, submission, grade);
  updateStudentSubmissionControls();
  const fileSize = Math.ceil((assignment.max_file_size_bytes || MAX_FILE_BYTES) / (1024 * 1024));
  byId('attachment-limit').textContent =
    `Up to ${fileSize} MB per file${assignment.allowed_file_types?.length ? ` · ${assignment.allowed_file_types.join(', ')}` : ''}. Keep your original copies.`;
  byId('student-files').accept = assignment.allowed_file_types?.join(',') || '';
  setDraftStatus(
    submitted ? `${submission.is_late ? 'Submitted late' : 'Submitted'} ${formatDate(submission.submitted_at)}` : closed ? 'Submissions closed.' : 'Drafts save automatically',
    submitted ? submission.is_late ? 'warning' : 'success' : closed ? 'error' : ''
  );
  byId('submission-receipt').hidden = !submitted;
  if (submitted) {
    const gradeText = grade?.released_at
      ? ` Mark: ${grade.final_mark}/${assignment.max_marks}.${grade.feedback ? ` Feedback: ${grade.feedback}` : ''}`
      : '';
    byId('receipt-summary').textContent = `Version ${submission.version_number || 1} submitted ${formatDate(submission.submitted_at)}${submission.is_late ? ' · Late' : ''}.${gradeText}`;
  }
  await loadSubmissionHistory(submission);
  updateWordCount();
  await loadStudentFiles();
  if (submission) state.studentSubmissions.set(assignment.id, submission);
  renderStudentAssignments();
  if (!state.deadlineTimer) {
    state.deadlineTimer = window.setInterval(() => {
      renderStudentAssignments();
      updateStudentSubmissionControls();
      if (state.selectedAssignment) {
        const currentDueDate = effectiveDueDate(state.selectedAssignment);
        byId('student-due').textContent = currentDueDate
          ? `Due ${formatDate(currentDueDate)}${usesExtensionDueDate(state.selectedAssignment) ? ' (extension)' : ''} · ${formatCountdown(currentDueDate)}`
          : 'No due date';
      }
    }, 30000);
  }
}

function scheduleDraftSave() {
  if (!state.selectedAssignment || isSubmitted()) return;
  setDraftStatus('Saving soon…', '');
  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    void saveDraft();
  }, 650);
}

async function saveDraft() {
  if (!state.selectedAssignment || isSubmitted() || !state.user) return null;
  clearTimeout(state.saveTimer);
  setDraftStatus('Saving…', '');
  try {
    if (!state.submission) {
      const { data, error } = await supabase.from('submissions')
        .insert({
          assignment_id: state.selectedAssignment.id,
          student_id: state.user.id,
          response: byId('student-response').value,
          status: 'draft'
        })
        .select('id, assignment_id, response, status, is_late, version_number, submitted_at, updated_at')
        .single();
      if (error) throw error;
      state.submission = data;
    } else {
      const { data, error } = await supabase.from('submissions')
        .update({ response: byId('student-response').value })
        .eq('id', state.submission.id)
        .eq('status', 'draft')
        .select('id, assignment_id, response, status, is_late, version_number, submitted_at, updated_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This submission is no longer an editable draft. Refresh to see its current status.');
      state.submission = data;
    }
    setDraftStatus(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'success');
    await loadStudentAssignments();
    return state.submission;
  } catch (error) {
    setDraftStatus(`Could not save: ${friendlyError(error)}`, 'error');
    return null;
  }
}

async function uploadSelectedFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length || !state.selectedAssignment || !canEditSubmission()) return;
  const assignment = state.selectedAssignment;

  for (const file of files) {
    const maxFileSize = assignment.max_file_size_bytes || MAX_FILE_BYTES;
    if (file.size > maxFileSize) {
      setDraftStatus(`${file.name} is larger than the ${Math.ceil(maxFileSize / (1024 * 1024))} MB assignment limit.`, 'error');
      continue;
    }
    if (!isAllowedFileType(file, assignment.allowed_file_types)) {
      setDraftStatus(`${file.name} is not an allowed file type for this assignment.`, 'error');
      continue;
    }
    const submission = isSubmitted() ? state.submission : await saveDraft();
    if (!submission) return;
    const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-120) || 'attachment';
    const objectPath = `${assignment.id}/${state.user.id}/${submission.id}/${crypto.randomUUID()}-${safeName}`;
    setDraftStatus(`Uploading ${file.name}…`, '');
    try {
      const { error } = await supabase.storage.from('submission-files').upload(objectPath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (error) throw error;
      const { error: metadataError } = await supabase.from('submission_files').insert({
        submission_id: submission.id,
        storage_path: objectPath,
        original_name: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size
      });
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from('submission-files').remove([objectPath]);
        if (cleanupError) {
          throw new Error(`Could not save attachment metadata (${friendlyError(metadataError)}) or remove the uploaded file (${friendlyError(cleanupError)}).`);
        }
        throw metadataError;
      }
      setDraftStatus(`${file.name} attached.`, 'success');
    } catch (error) {
      setDraftStatus(`Could not upload ${file.name}: ${friendlyError(error)}`, 'error');
    }
  }
  await loadStudentFiles();
}

async function loadStudentFiles() {
  const list = byId('student-file-list');
  list.replaceChildren();
  byId('receipt-files').replaceChildren();
  if (!state.selectedAssignment || !state.submission) return;

  try {
    const { data, error } = await supabase.from('submission_files')
      .select('id, storage_path, original_name, version_id, size_bytes')
      .eq('submission_id', state.submission.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const latestVersionId = state.submissionHistory[0]?.id;
    const visibleFiles = (data || []).filter(file => state.submission.status !== 'submitted'
      ? !file.version_id
      : latestVersionId ? file.version_id === latestVersionId || !file.version_id : !file.version_id);
    if (!visibleFiles.length) {
      const empty = document.createElement('li');
      empty.className = 'list-empty';
      empty.textContent = 'No files attached.';
      list.append(empty);
      return;
    }
    for (const file of visibleFiles) {
      const path = file.storage_path;
      const item = document.createElement('li');
      item.className = 'file-item';
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.original_name;
      const actions = document.createElement('span');
      const download = await makeDownloadLink(path, file.original_name, file.original_name);
      actions.append(download);
      if (canEditSubmission() && !file.version_id) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'file-action remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => removeStudentFile(path));
        actions.append(' · ', remove);
      }
      item.append(name, actions);
      list.append(item);
    }
    const receiptFiles = byId('receipt-files');
    receiptFiles.replaceChildren();
    if (isSubmitted()) {
      for (const file of visibleFiles.filter(item => item.version_id === latestVersionId)) {
        const item = document.createElement('li');
        item.className = 'file-item';
        item.append(await makeDownloadLink(file.storage_path, file.original_name, file.original_name));
        receiptFiles.append(item);
      }
    }
  } catch (error) {
    const item = makeListMessage(`Could not load attachments: ${friendlyError(error)}`);
    list.append(item);
  }
}

async function removeStudentFile(path) {
  if (!canEditSubmission()) return;
  const { error } = await supabase.storage.from('submission-files').remove([path]);
  if (error) {
    setDraftStatus(`Could not remove attachment: ${friendlyError(error)}`, 'error');
    return;
  }
  const { error: metadataError } = await supabase.from('submission_files').delete().eq('storage_path', path);
  if (metadataError) {
    setDraftStatus(`File removed from storage, but its metadata could not be removed: ${friendlyError(metadataError)}`, 'error');
    return;
  }
  await loadStudentFiles();
}

async function submitAssignment() {
  if (!state.selectedAssignment || !canEditSubmission()) return;
  const assignment = state.selectedAssignment;
  const isResubmission = isSubmitted();
  if (!byId('student-response').value.trim()) {
    const submission = state.submission || await saveDraft();
    if (!submission) return;
    const { data: files, error: fileError } = await supabase.from('submission_files')
      .select('id')
      .eq('submission_id', submission.id)
      .is('version_id', null);
    if (fileError) {
      setDraftStatus(`Could not check attachments: ${friendlyError(fileError)}`, 'error');
      return;
    }
    if (!files?.length) {
      setDraftStatus('Write a response or attach a file before submitting.', 'error');
      return;
    }
  }
  const button = byId('submit-assignment');
  button.disabled = true;
  const submission = isResubmission ? state.submission : await saveDraft();
  if (!submission) {
    button.disabled = false;
    return;
  }
  const { data, error } = await supabase.from('submissions')
    .update({
      response: byId('student-response').value,
      status: 'submitted'
    })
    .eq('id', submission.id)
    .eq('status', isResubmission ? 'submitted' : 'draft')
    .select('id, assignment_id, response, status, is_late, version_number, submitted_at, updated_at')
    .maybeSingle();
  if (error || !data) {
    setDraftStatus(error ? `Could not submit: ${friendlyError(error)}` : 'This draft could not be submitted. Refresh and try again.', 'error');
    button.disabled = false;
    return;
  }
  state.submission = data;
  await openStudentAssignment(assignment, data);
  await loadStudentAssignments();
}

async function createAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!state.user || state.profile?.role !== 'teacher') return;
  const button = form.querySelector('button[type="submit"]');
  const title = byId('assignment-title').value.trim();
  const instructions = byId('assignment-instructions').value.trim();
  const dueValue = byId('assignment-due').value;
  const courseId = byId('assignment-course').value;
  const maxMarks = Number(byId('assignment-max-marks').value);
  const latePenaltyValue = byId('assignment-late-penalty').value;
  const maxFileSizeBytes = Number(byId('assignment-file-size').value) * 1024 * 1024;
  const allowedFileTypes = byId('assignment-file-types').value
    .split(',')
    .map(type => type.trim().toLowerCase())
    .filter(Boolean);
  const rubricCriteria = [...byId('rubric-criteria-editor').querySelectorAll('.rubric-criterion-row')]
    .map(row => ({
      title: row.querySelector('[name="rubric-title"]').value.trim(),
      description: row.querySelector('[name="rubric-description"]').value.trim(),
      max_points: Number(row.querySelector('[name="rubric-max-points"]').value),
      weight_percent: Number(row.querySelector('[name="rubric-weight"]').value),
      sort_order: [...row.parentElement.children].indexOf(row)
    }));
  if (!title) return;
  if (!courseId) {
    setNotice(byId('teacher-status'), 'Create a class before publishing an assignment.', 'error');
    return;
  }
  if (!Number.isFinite(maxMarks) || maxMarks <= 0
    || !Number.isFinite(maxFileSizeBytes) || maxFileSizeBytes < 1024 * 1024
    || maxFileSizeBytes > 100 * 1024 * 1024
    || (latePenaltyValue && (!Number.isFinite(Number(latePenaltyValue))
      || Number(latePenaltyValue) < 0 || Number(latePenaltyValue) > 100))
    || allowedFileTypes.some(type => !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type))) {
    setNotice(byId('teacher-status'), 'Check the marks, file size, penalty, and MIME type values.', 'error');
    return;
  }
  if (dueValue && new Date(dueValue).getTime() <= Date.now()) {
    setNotice(byId('teacher-status'), 'Choose a due date in the future.', 'error');
    return;
  }
  if (rubricCriteria.some(item => !item.title
    || !Number.isFinite(item.max_points) || item.max_points <= 0
    || !Number.isFinite(item.weight_percent) || item.weight_percent < 0 || item.weight_percent > 100)
    || (rubricCriteria.length && Math.abs(
      rubricCriteria.reduce((total, item) => total + item.weight_percent, 0) - 100
    ) > 0.01)) {
    setNotice(byId('teacher-status'), 'Complete each rubric criterion and make the weights total 100%.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('teacher-status'), 'Publishing assignment…', '');

  try {
    const { data: assignment, error } = await supabase.from('assignments').insert({
      teacher_id: state.user.id,
      course_id: courseId,
      title,
      instructions,
      due_date: dueValue ? new Date(dueValue).toISOString() : null,
      allow_late: byId('assignment-allow-late').checked,
      late_penalty_percent: latePenaltyValue ? Number(latePenaltyValue) : null,
      max_marks: maxMarks,
      allow_resubmission: byId('assignment-allow-resubmission').checked,
      allowed_file_types: allowedFileTypes,
      max_file_size_bytes: maxFileSizeBytes,
      published: true
    }).select('id').single();
    if (error) throw error;
    if (rubricCriteria.length) {
      const { error: rubricError } = await supabase.from('rubric_criteria').insert(
        rubricCriteria.map(criterion => ({ ...criterion, assignment_id: assignment.id }))
      );
      if (rubricError) {
        const { error: cleanupError } = await supabase.from('assignments').delete().eq('id', assignment.id);
        if (cleanupError) {
          setNotice(
            byId('teacher-status'),
            `The assignment was published, but its rubric could not be saved (${friendlyError(rubricError)}). Automatic cleanup failed (${friendlyError(cleanupError)}). Refresh the assignments list and review it.`,
            'error'
          );
          await loadTeacherAssignments();
          return;
        }
        throw rubricError;
      }
    }
    form.reset();
    byId('rubric-criteria-editor').replaceChildren();
    setNotice(byId('teacher-status'), 'Assignment published for students.', 'success');
    await loadTeacherAssignments();
  } catch (error) {
    setNotice(byId('teacher-status'), `Could not publish: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

function addRubricCriterion(criterion = {}) {
  const row = document.createElement('fieldset');
  row.className = 'rubric-criterion-row';
  const legend = document.createElement('legend');
  legend.textContent = `Criterion ${byId('rubric-criteria-editor').children.length + 1}`;
  const titleField = document.createElement('label');
  titleField.className = 'form-field';
  const titleLabel = document.createElement('span');
  titleLabel.textContent = 'Criterion';
  const title = document.createElement('input');
  title.name = 'rubric-title';
  title.maxLength = 160;
  title.required = true;
  title.value = criterion.title || '';
  title.placeholder = 'e.g. Evidence and reasoning';
  titleField.append(titleLabel, title);

  const descriptionField = document.createElement('label');
  descriptionField.className = 'form-field';
  const descriptionLabel = document.createElement('span');
  descriptionLabel.textContent = 'Description (optional)';
  const description = document.createElement('textarea');
  description.name = 'rubric-description';
  description.rows = 2;
  description.maxLength = 4000;
  description.value = criterion.description || '';
  descriptionField.append(descriptionLabel, description);

  const limits = document.createElement('div');
  limits.className = 'rubric-criterion-limits';
  for (const [name, labelText, max, value] of [
    ['rubric-max-points', 'Criterion points', 100000, criterion.max_points ?? 10],
    ['rubric-weight', 'Weight (%)', 100, criterion.weight_percent ?? 100]
  ]) {
    const field = document.createElement('label');
    field.className = 'form-field';
    const label = document.createElement('span');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.name = name;
    input.type = 'number';
    input.min = '0.01';
    input.max = String(max);
    input.step = '0.01';
    input.required = true;
    input.value = String(value);
    field.append(label, input);
    limits.append(field);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'text-button rubric-remove';
  remove.dataset.removeRubricCriterion = '';
  remove.textContent = 'Remove criterion';
  row.append(legend, titleField, descriptionField, limits, remove);
  byId('rubric-criteria-editor').append(row);
}

async function createCourse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!state.user || state.profile?.role !== 'teacher') return;
  const button = form.querySelector('button[type="submit"]');
  const name = byId('course-name').value.trim();
  const departmentId = byId('course-department').value || null;
  const termId = byId('course-term').value || null;
  if (!name) return;
  button.disabled = true;
  setNotice(byId('course-status'), 'Creating class…', '');
  try {
    const joinCode = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const { error } = await supabase.from('courses').insert({
      teacher_id: state.user.id,
      name,
      join_code: joinCode,
      department_id: departmentId,
      term_id: termId
    });
    if (error) throw error;
    form.reset();
    setNotice(byId('course-status'), 'Class created. Share its join code with students.', 'success');
    await loadTeacherCourses();
  } catch (error) {
    setNotice(byId('course-status'), `Could not create class: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function createAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!state.user || state.profile?.role !== 'teacher') return;
  const button = form.querySelector('button[type="submit"]');
  const title = byId('announcement-title').value.trim();
  const body = byId('announcement-body').value.trim();
  const courseId = byId('announcement-course').value;
  if (!title || !courseId) {
    setNotice(byId('announcement-status'), 'Choose a class and enter an update title.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('announcement-status'), 'Posting update…', '');
  try {
    const { error } = await supabase.from('announcements').insert({
      course_id: courseId,
      author_id: state.user.id,
      title,
      body
    });
    if (error) throw error;
    form.reset();
    setNotice(byId('announcement-status'), 'Update posted to the class.', 'success');
  } catch (error) {
    setNotice(byId('announcement-status'), `Could not post update: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

function renderStudentExtensionRequest(assignment) {
  const form = byId('extension-request-form');
  const summary = byId('extension-request-summary');
  const existing = state.studentExtensionRequests.get(assignment.id);
  const dueAt = assignment.due_date || assignment.due_at;
  const canRequest = Boolean(
    dueAt
    && !assignment.allow_late
    && !state.studentExtensions.has(assignment.id)
    && state.submission?.status !== 'submitted'
  );
  form.hidden = !canRequest || Boolean(existing);
  byId('extension-requested-due').min = toLocalDateTimeInput(new Date(Date.now() + 60000));
  setNotice(summary, '', '');
  summary.hidden = true;
  if (existing) {
    const message = existing.status === 'requested'
      ? 'Your request is waiting for your lecturer.'
      : existing.status === 'approved'
        ? `Approved. Your new deadline is ${formatDate(existing.extended_due_at)}.`
        : 'Your previous request was declined. Contact your lecturer if you need to discuss it.';
    setNotice(summary, message, existing.status === 'approved' ? 'success' : '');
    summary.hidden = false;
  }
}

async function requestDeadlineExtension(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const assignment = state.selectedAssignment;
  if (!state.user || state.profile?.role !== 'student' || !assignment) return;
  const requestedValue = byId('extension-requested-due').value;
  const requestedDate = new Date(requestedValue);
  const baseline = assignment.due_date || assignment.due_at;
  if (!requestedValue || Number.isNaN(requestedDate.getTime())
    || requestedDate.getTime() <= new Date(baseline).getTime()) {
    setNotice(byId('extension-request-status'), 'Choose a requested deadline later than the current deadline.', 'error');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setNotice(byId('extension-request-status'), 'Sending request…', '');
  try {
    const { data, error } = await supabase.from('extensions').insert({
      assignment_id: assignment.id,
      student_id: state.user.id,
      requested_due_at: requestedDate.toISOString(),
      reason: byId('extension-request-reason').value.trim(),
      status: 'requested'
    }).select('id, assignment_id, requested_due_at, extended_due_at, reason, status, granted_by').single();
    if (error) throw error;
    state.studentExtensionRequests.set(assignment.id, data);
    form.reset();
    renderStudentExtensionRequest(assignment);
  } catch (error) {
    setNotice(byId('extension-request-status'), `Could not send request: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadTeacherCourses() {
  if (!state.user || state.profile?.role !== 'teacher') return;
  const list = byId('teacher-course-list');
  list.replaceChildren(makeListMessage('Loading classes…'));
  try {
    const { data, error } = await supabase.from('courses')
      .select('id, name, join_code, department_id, term_id, created_at')
      .eq('teacher_id', state.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.teacherCourses = data || [];
    renderTeacherCourses();
  } catch (error) {
    list.replaceChildren(makeListMessage(friendlyError(error)));
  }
}

function renderTeacherCourses() {
  const list = byId('teacher-course-list');
  const select = byId('assignment-course');
  const announcementSelect = byId('announcement-course');
  const rosterSelect = byId('roster-course');
  const departmentSelect = byId('course-department');
  const termSelect = byId('course-term');
  list.replaceChildren();
  select.replaceChildren();
  announcementSelect.replaceChildren();
  const selectedRosterCourse = rosterSelect.value;
  const selectedDepartment = departmentSelect.value;
  const selectedTerm = termSelect.value;
  rosterSelect.replaceChildren();
  departmentSelect.replaceChildren();
  termSelect.replaceChildren();
  appendSelectOption(departmentSelect, '', 'No department');
  for (const department of state.departments) appendSelectOption(departmentSelect, department.id, department.name);
  appendSelectOption(termSelect, '', 'No academic term');
  for (const term of state.terms) appendSelectOption(termSelect, term.id, `${term.name} · ${term.academic_year}`);
  departmentSelect.value = state.departments.some(item => item.id === selectedDepartment) ? selectedDepartment : '';
  termSelect.value = state.terms.some(item => item.id === selectedTerm) ? selectedTerm : '';
  if (!state.teacherCourses.length) {
    list.append(makeListMessage('Create a class to get a student join code.'));
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Create a class first';
    select.append(option);
    select.disabled = true;
    const announcementOption = document.createElement('option');
    announcementOption.value = '';
    announcementOption.textContent = 'Create a class first';
    announcementSelect.append(announcementOption);
    announcementSelect.disabled = true;
    const rosterOption = document.createElement('option');
    rosterOption.value = '';
    rosterOption.textContent = 'Create a class first';
    rosterSelect.append(rosterOption);
    rosterSelect.disabled = true;
    byId('course-roster-list').replaceChildren();
    return;
  }
  select.disabled = false;
  announcementSelect.disabled = false;
  rosterSelect.disabled = false;
  const rosterPlaceholder = document.createElement('option');
  rosterPlaceholder.value = '';
  rosterPlaceholder.textContent = 'Choose a class';
  rosterSelect.append(rosterPlaceholder);
  for (const course of state.teacherCourses) {
    const option = document.createElement('option');
    option.value = course.id;
    option.textContent = course.name;
    select.append(option);
    const announcementOption = document.createElement('option');
    announcementOption.value = course.id;
    announcementOption.textContent = course.name;
    announcementSelect.append(announcementOption);
    const rosterOption = document.createElement('option');
    rosterOption.value = course.id;
    rosterOption.textContent = course.name;
    rosterSelect.append(rosterOption);

    const item = document.createElement('article');
    item.className = 'course-item';
    const title = document.createElement('strong');
    title.textContent = course.name;
    const created = document.createElement('small');
    created.textContent = `Created ${formatDate(course.created_at)}`;
    const metadata = document.createElement('small');
    const departmentName = state.departments.find(item => item.id === course.department_id)?.name;
    const term = state.terms.find(item => item.id === course.term_id);
    metadata.textContent = [departmentName, term ? `${term.name} · ${term.academic_year}` : ''].filter(Boolean).join(' · ');
    const code = document.createElement('button');
    code.type = 'button';
    code.className = 'join-code';
    code.textContent = course.join_code;
    code.title = 'Click to copy the class join code';
    code.addEventListener('click', () => copyJoinCode(course.join_code, code));
    item.append(title, created);
    if (metadata.textContent) item.append(metadata);
    item.append(code);
    list.append(item);
  }
  rosterSelect.value = state.teacherCourses.some(course => course.id === selectedRosterCourse)
    ? selectedRosterCourse
    : '';
  if (rosterSelect.value) void loadCourseRoster();
  else byId('course-roster-list').replaceChildren(makeListMessage('Choose a class to view its roster.'));
}

function localDateValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function appendSelectOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

async function loadCourseRoster() {
  if (!state.user || state.profile?.role !== 'teacher') return;
  const courseId = byId('roster-course').value;
  const sessionDate = byId('attendance-date').value;
  const list = byId('course-roster-list');
  if (!courseId || !sessionDate) {
    list.replaceChildren(makeListMessage('Choose a class and date to view attendance.'));
    return;
  }
  list.replaceChildren(makeListMessage('Loading class roster…'));
  setNotice(byId('roster-status'), '', '');
  try {
    const [{ data: students, error: rosterError }, { data: attendance, error: attendanceError }] = await Promise.all([
      supabase.rpc('get_course_roster', { target_course_id: courseId }),
      supabase.from('attendance')
        .select('student_id, status')
        .eq('course_id', courseId)
        .eq('session_date', sessionDate)
    ]);
    if (rosterError) throw rosterError;
    if (attendanceError) throw attendanceError;
    list.replaceChildren();
    if (!students?.length) {
      list.append(makeListMessage('No students have joined this class yet.'));
      return;
    }
    const attendanceByStudent = new Map((attendance || []).map(record => [record.student_id, record.status]));
    for (const student of students) {
      const row = document.createElement('article');
      row.className = 'roster-row';
      row.dataset.studentId = student.student_id;
      const name = document.createElement('div');
      name.className = 'roster-student';
      const fullName = document.createElement('strong');
      fullName.textContent = student.full_name || 'Name not set';
      name.append(fullName);
      if (student.student_number) {
        const studentNumber = document.createElement('small');
        studentNumber.textContent = student.student_number;
        name.append(studentNumber);
      }
      const status = document.createElement('select');
      status.className = 'roster-attendance-status';
      status.setAttribute('aria-label', `Attendance for ${fullName.textContent}`);
      for (const [value, label] of [['', 'Not marked'], ['present', 'Present'], ['absent', 'Absent'], ['late', 'Late']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = attendanceByStudent.get(student.student_id) === value;
        status.append(option);
      }
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'button button-secondary';
      save.dataset.attendanceStudent = student.student_id;
      save.textContent = 'Save';
      row.append(name, status, save);
      list.append(row);
    }
    setNotice(byId('roster-status'), `${students.length} student${students.length === 1 ? '' : 's'} in this class.`, '');
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load class roster: ${friendlyError(error)}`));
  }
}

async function saveAttendance(button) {
  if (!state.user || state.profile?.role !== 'teacher') return;
  const courseId = byId('roster-course').value;
  const sessionDate = byId('attendance-date').value;
  const row = button.closest('.roster-row');
  const studentId = row?.dataset.studentId;
  const status = row?.querySelector('.roster-attendance-status')?.value;
  if (!courseId || !sessionDate || !studentId || !row) return;
  button.disabled = true;
  try {
    if (!status) {
      const { error } = await supabase.from('attendance').delete()
        .eq('course_id', courseId)
        .eq('student_id', studentId)
        .eq('session_date', sessionDate);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('attendance').upsert({
        course_id: courseId,
        student_id: studentId,
        session_date: sessionDate,
        status,
        marked_by: state.user.id
      }, { onConflict: 'course_id,student_id,session_date' });
      if (error) throw error;
    }
    setNotice(byId('roster-status'), 'Attendance saved.', 'success');
  } catch (error) {
    setNotice(byId('roster-status'), `Could not save attendance: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function copyJoinCode(joinCode, button) {
  try {
    await navigator.clipboard.writeText(joinCode);
    button.textContent = 'Copied';
    window.setTimeout(() => {
      button.textContent = joinCode;
    }, 1400);
  } catch (error) {
    setNotice(byId('course-status'), `Could not copy the code: ${friendlyError(error)}`, 'error');
  }
}

async function joinCourse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!state.user || state.profile?.role !== 'student') return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setNotice(byId('join-status'), 'Joining class…', '');
  try {
    const code = byId('join-code').value.trim().toUpperCase();
    const { error } = await supabase.rpc('join_course_by_code', { input_code: code });
    if (error) throw error;
    form.reset();
    setNotice(byId('join-status'), 'You joined the class. Its assignments are now available.', 'success');
    await loadStudentAssignments();
  } catch (error) {
    setNotice(byId('join-status'), `Could not join class: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadStudentAnnouncements() {
  const list = byId('student-announcements');
  list.replaceChildren(makeListMessage('Loading class updates…'));
  try {
    const { data, error } = await supabase.from('announcements')
      .select('id, course_id, title, body, published_at')
      .order('published_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    list.replaceChildren();
    if (!data?.length) {
      list.append(makeListMessage('No class updates yet.'));
      return;
    }
    for (const announcement of data) {
      const item = document.createElement('article');
      item.className = 'announcement-item';
      const course = state.studentCourses.find(entry => entry.id === announcement.course_id);
      const heading = document.createElement('h3');
      heading.textContent = announcement.title;
      const meta = document.createElement('small');
      meta.textContent = `${course?.name || 'Class'} · ${formatDate(announcement.published_at)}`;
      const body = document.createElement('p');
      body.textContent = announcement.body || '';
      item.append(heading, meta, body);
      list.append(item);
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load class updates: ${friendlyError(error)}`));
  }
}

async function loadTeacherAssignments() {
  if (!state.user || state.profile?.role !== 'teacher') return;
  await loadTeacherCourses();
  const list = byId('teacher-assignment-list');
  list.replaceChildren(makeListMessage('Loading your assignments…'));
  try {
    const { data, error } = await supabase.from('assignments')
      .select('id, course_id, title, instructions, due_at, due_date, max_marks, late_penalty_percent, created_at')
      .eq('teacher_id', state.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.teacherAssignments = data || [];
    renderTeacherAssignments();
  } catch (error) {
    list.replaceChildren(makeListMessage(friendlyError(error)));
  }
}

function renderTeacherAssignments() {
  const list = byId('teacher-assignment-list');
  list.replaceChildren();
  if (!state.teacherAssignments.length) {
    list.append(makeListMessage('Publish your first assignment to get started.'));
    byId('teacher-submissions').replaceChildren();
    byId('teacher-extension-requests').hidden = true;
    byId('teacher-discussion').hidden = true;
    return;
  }
  for (const assignment of state.teacherAssignments) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assignment-item';
    button.setAttribute('aria-current', state.selectedAssignment?.id === assignment.id ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = assignment.title;
    const due = document.createElement('small');
    const course = state.teacherCourses.find(item => item.id === assignment.course_id);
    const dueAt = assignment.due_date || assignment.due_at;
    due.textContent = `${course?.name || 'Class'} · ${dueAt ? `Due ${formatDate(dueAt)}` : 'No due date'}`;
    button.append(title, due);
    button.addEventListener('click', () => {
      state.selectedAssignment = assignment;
      renderTeacherAssignments();
      void loadTeacherSubmissions(assignment);
    });
    list.append(button);
  }
  const selected = state.teacherAssignments.find(item => item.id === state.selectedAssignment?.id)
    || state.teacherAssignments[0];
  if (state.selectedAssignment?.id !== selected.id) {
    state.selectedAssignment = selected;
    void loadTeacherSubmissions(selected);
  }
}

async function loadTeacherSubmissions(assignment) {
  const list = byId('teacher-submissions');
  byId('teacher-discussion').hidden = false;
  list.replaceChildren(makeListMessage('Loading submissions…'));
  await loadAssignmentDiscussion(assignment, 'teacher');
  await loadTeacherExtensionRequests(assignment);
  try {
    const { data: submissions, error } = await supabase.from('submissions')
      .select('id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
      .eq('assignment_id', assignment.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    state.teacherSubmissions = submissions || [];
    list.replaceChildren();
    if (!submissions?.length) {
      list.append(makeListMessage('No students have submitted this assignment yet.'));
      return;
    }
    const submissionIds = submissions.map(item => item.id);
    const { data: grades, error: gradeError } = await supabase.from('grades')
      .select('id, submission_id, mark, final_mark, feedback, released_at')
      .in('submission_id', submissionIds);
    if (gradeError) throw gradeError;
    const gradeBySubmission = new Map((grades || []).map(grade => [grade.submission_id, grade]));
    const { data: rubricCriteria, error: criteriaError } = await supabase.from('rubric_criteria')
      .select('id, assignment_id, title, description, max_points, weight_percent, sort_order')
      .eq('assignment_id', assignment.id)
      .order('sort_order', { ascending: true });
    if (criteriaError) throw criteriaError;
    const gradeIds = (grades || []).map(grade => grade.id);
    let rubricScores = [];
    if (gradeIds.length) {
      const { data, error: scoresError } = await supabase.from('rubric_scores')
        .select('id, grade_id, criterion_id, score, feedback')
        .in('grade_id', gradeIds);
      if (scoresError) throw scoresError;
      rubricScores = data || [];
    }
    const ids = [...new Set(submissions.map(item => item.student_id))];
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('id, display_name, email')
      .in('id', ids);
    if (profileError) throw profileError;
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
    for (const submission of submissions) {
      list.append(await renderSubmissionCard(
        assignment,
        submission,
        profileById.get(submission.student_id),
        gradeBySubmission.get(submission.id),
        rubricCriteria || [],
        rubricScores.filter(score => score.grade_id === gradeBySubmission.get(submission.id)?.id)
      ));
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load submissions: ${friendlyError(error)}`));
  }
}

async function loadAssignmentDiscussion(assignment, audience) {
  const listId = audience === 'teacher' ? 'teacher-discussion-list' : 'student-discussion-list';
  const list = byId(listId);
  const formId = audience === 'teacher' ? 'teacher-discussion-form' : 'student-discussion-form';
  const form = byId(formId);
  form.dataset.assignmentId = assignment.id;
  list.replaceChildren(makeListMessage('Loading discussion…'));
  try {
    const { data, error } = await supabase.from('comments')
      .select('id, author_id, body, created_at')
      .eq('assignment_id', assignment.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    renderAssignmentDiscussion(data || [], audience);
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load discussion: ${friendlyError(error)}`));
  }
}

function renderAssignmentDiscussion(comments, audience) {
  const list = byId(audience === 'teacher' ? 'teacher-discussion-list' : 'student-discussion-list');
  list.replaceChildren();
  if (!comments.length) {
    list.append(makeListMessage('No messages yet. Start the discussion.'));
    return;
  }
  for (const comment of [...comments].reverse()) {
    const item = document.createElement('article');
    item.className = 'discussion-message';
    const metadata = document.createElement('div');
    metadata.className = 'discussion-message-meta';
    const author = document.createElement('strong');
    author.textContent = comment.author_id === state.user?.id
      ? 'You'
      : audience === 'teacher' ? 'Class member' : 'Lecturer or classmate';
    const created = document.createElement('small');
    created.textContent = formatDate(comment.created_at);
    metadata.append(author, created);
    const body = document.createElement('p');
    body.textContent = comment.body;
    item.append(metadata, body);
    if (comment.author_id === state.user?.id) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-button';
      remove.dataset.commentDelete = comment.id;
      remove.textContent = 'Delete';
      item.append(remove);
    }
    list.append(item);
  }
}

async function postDiscussionComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!state.user || !['student', 'teacher'].includes(state.profile?.role)) return;
  const assignmentId = form.dataset.assignmentId;
  const body = String(new FormData(form).get('body') || '').trim();
  const status = form.querySelector('.notice');
  const button = form.querySelector('button[type="submit"]');
  if (!assignmentId || !body) {
    setNotice(status, 'Choose an assignment and enter a message.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(status, 'Posting message…', '');
  try {
    const { error } = await supabase.from('comments').insert({
      assignment_id: assignmentId,
      author_id: state.user.id,
      body
    });
    if (error) throw error;
    form.reset();
    const audience = state.profile.role === 'teacher' ? 'teacher' : 'student';
    const assignment = audience === 'teacher'
      ? state.teacherAssignments.find(item => item.id === assignmentId)
      : state.studentAssignments.find(item => item.id === assignmentId);
    if (assignment) await loadAssignmentDiscussion(assignment, audience);
    setNotice(status, 'Message posted to the class discussion.', 'success');
  } catch (error) {
    setNotice(status, `Could not post message: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteDiscussionComment(button) {
  const commentId = button.dataset.commentDelete;
  if (!commentId || !window.confirm('Delete this discussion message?')) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('comments').delete()
      .eq('id', commentId)
      .eq('author_id', state.user.id);
    if (error) throw error;
    const teacher = state.profile?.role === 'teacher';
    const assignmentId = byId(teacher ? 'teacher-discussion-form' : 'student-discussion-form').dataset.assignmentId;
    const assignment = teacher
      ? state.teacherAssignments.find(item => item.id === assignmentId)
      : state.studentAssignments.find(item => item.id === assignmentId);
    if (assignment) await loadAssignmentDiscussion(assignment, teacher ? 'teacher' : 'student');
  } catch (error) {
    button.disabled = false;
    const list = button.closest('.discussion-list');
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.dataset.state = 'error';
    notice.textContent = `Could not delete message: ${friendlyError(error)}`;
    list?.before(notice);
  }
}

async function loadTeacherExtensionRequests(assignment) {
  const section = byId('teacher-extension-requests');
  const list = byId('teacher-extension-list');
  list.replaceChildren(makeListMessage('Loading requests…'));
  try {
    const { data: requests, error } = await supabase.from('extensions')
      .select('id, assignment_id, student_id, requested_due_at, reason, status, created_at')
      .eq('assignment_id', assignment.id)
      .eq('status', 'requested')
      .order('created_at', { ascending: true });
    if (error) throw error;
    list.replaceChildren();
    section.hidden = !requests?.length;
    if (!requests?.length) return;
    const studentIds = [...new Set(requests.map(request => request.student_id))];
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('id, display_name, full_name, email')
      .in('id', studentIds);
    if (profileError) throw profileError;
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
    for (const request of requests) {
      const card = document.createElement('article');
      card.className = 'extension-request-card';
      const student = profileById.get(request.student_id);
      const heading = document.createElement('h4');
      heading.textContent = student?.full_name || student?.display_name || student?.email || 'Student';
      const due = document.createElement('p');
      due.textContent = `Requested deadline: ${formatDate(request.requested_due_at)}`;
      const reason = document.createElement('p');
      reason.textContent = request.reason || 'No reason provided.';
      const actions = document.createElement('div');
      actions.className = 'extension-actions';
      for (const decision of ['approved', 'denied']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = decision === 'approved' ? 'button button-primary' : 'button button-secondary';
        button.dataset.extensionId = request.id;
        button.dataset.decision = decision;
        button.textContent = decision === 'approved' ? 'Approve request' : 'Decline';
        button.addEventListener('click', () => {
          void decideExtensionRequest(request, decision, button);
        });
        actions.append(button);
      }
      card.append(heading, due, reason, actions);
      list.append(card);
    }
  } catch (error) {
    section.hidden = false;
    list.replaceChildren(makeListMessage(`Could not load extension requests: ${friendlyError(error)}`));
  }
}

async function decideExtensionRequest(request, decision, button) {
  if (!state.user || state.profile?.role !== 'teacher') return;
  button.disabled = true;
  const assignment = state.teacherAssignments.find(item => item.id === request.assignment_id);
  try {
    const { data, error } = await supabase.from('extensions')
      .update({
        status: decision,
        extended_due_at: decision === 'approved' ? request.requested_due_at : null,
        granted_by: state.user.id
      })
      .eq('id', request.id)
      .eq('status', 'requested')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This request has already been handled. Refresh to see its current status.');
    if (assignment) await loadTeacherExtensionRequests(assignment);
  } catch (error) {
    button.disabled = false;
    const status = document.createElement('p');
    status.className = 'notice';
    status.dataset.state = 'error';
    status.textContent = `Could not ${decision === 'approved' ? 'approve' : 'decline'} request: ${friendlyError(error)}`;
    button.closest('.extension-request-card')?.append(status);
  }
}

async function renderSubmissionCard(assignment, submission, profile, grade, rubricCriteria = [], rubricScores = []) {
  const card = document.createElement('article');
  card.className = 'submission-card';
  const name = document.createElement('h3');
  name.textContent = profile?.display_name || profile?.email || 'Student';
  const meta = document.createElement('div');
  meta.className = 'submission-meta';
  const email = document.createElement('span');
  email.textContent = profile?.email || '';
  const submittedAt = document.createElement('span');
  submittedAt.textContent = `${submission.is_late ? 'Submitted late' : 'Submitted'} ${formatDate(submission.submitted_at)}`;
  meta.append(email, submittedAt);
  const response = document.createElement('p');
  response.className = 'submission-response';
  response.textContent = submission.response || 'No written response.';
  card.append(name, meta, response);

  const folder = `${assignment.id}/${submission.student_id}/${submission.id}`;
  try {
    const { data: files, error } = await supabase.storage.from('submission-files').list(folder);
    if (error) throw error;
    if (files?.length) {
      const links = document.createElement('div');
      links.className = 'submission-files';
      for (const file of files) {
        links.append(await makeDownloadLink(
          `${folder}/${file.name}`,
          file.name,
          file.name.replace(/^[0-9a-f-]{36}-/i, '')
        ));
      }
      card.append(links);
    }
  } catch (error) {
    const warning = document.createElement('small');
    warning.className = 'notice';
    warning.textContent = `Attachments unavailable: ${friendlyError(error)}`;
    card.append(warning);
  }

  const gradeForm = document.createElement('form');
  gradeForm.className = 'grade-form';
  gradeForm.dataset.submissionId = submission.id;
  const heading = document.createElement('h4');
  heading.textContent = grade ? `Grade · ${grade.final_mark}/${assignment.max_marks}` : 'Grade this submission';
  const markField = document.createElement('label');
  markField.className = 'form-field';
  const markLabel = document.createElement('span');
  markLabel.textContent = `Mark (maximum ${assignment.max_marks})`;
  const markInput = document.createElement('input');
  markInput.name = 'mark';
  markInput.type = 'number';
  markInput.min = '0';
  markInput.max = String(assignment.max_marks);
  markInput.step = '0.01';
  markInput.required = true;
  markInput.value = grade ? String(grade.mark) : '';
  if (rubricCriteria.length) {
    markInput.readOnly = true;
    markInput.placeholder = 'Calculated from rubric scores';
  }
  markField.append(markLabel, markInput);
  const rubricScoreByCriterion = new Map(rubricScores.map(score => [score.criterion_id, score]));
  const rubricFields = document.createElement('section');
  rubricFields.className = 'grade-rubric-scores';
  if (rubricCriteria.length) {
    const rubricHeading = document.createElement('h5');
    rubricHeading.textContent = 'Rubric scores';
    rubricFields.append(rubricHeading);
    for (const criterion of rubricCriteria) {
      const existingScore = rubricScoreByCriterion.get(criterion.id);
      const field = document.createElement('fieldset');
      field.className = 'grade-rubric-criterion';
      field.dataset.rubricCriterionId = criterion.id;
      const legend = document.createElement('legend');
      legend.textContent = `${criterion.title} · ${criterion.weight_percent}%`;
      const description = document.createElement('p');
      description.textContent = criterion.description || `Score out of ${criterion.max_points}`;
      const scoreField = document.createElement('label');
      scoreField.className = 'form-field';
      const scoreLabel = document.createElement('span');
      scoreLabel.textContent = `Score (maximum ${criterion.max_points})`;
      const scoreInput = document.createElement('input');
      scoreInput.name = `rubric-score-${criterion.id}`;
      scoreInput.type = 'number';
      scoreInput.min = '0';
      scoreInput.max = String(criterion.max_points);
      scoreInput.step = '0.01';
      scoreInput.required = true;
      scoreInput.value = existingScore ? String(existingScore.score) : '';
      scoreInput.addEventListener('input', () => updateRubricCalculatedMark(gradeForm, rubricCriteria, assignment.max_marks));
      scoreField.append(scoreLabel, scoreInput);
      const feedbackField = document.createElement('label');
      feedbackField.className = 'form-field';
      const feedbackLabel = document.createElement('span');
      feedbackLabel.textContent = 'Criterion feedback (optional)';
      const feedbackInput = document.createElement('textarea');
      feedbackInput.name = `rubric-feedback-${criterion.id}`;
      feedbackInput.rows = 2;
      feedbackInput.maxLength = 4000;
      feedbackInput.value = existingScore?.feedback || '';
      feedbackField.append(feedbackLabel, feedbackInput);
      field.append(legend, description, scoreField, feedbackField);
      rubricFields.append(field);
    }
  }
  const feedbackField = document.createElement('label');
  feedbackField.className = 'form-field';
  const feedbackLabel = document.createElement('span');
  feedbackLabel.textContent = 'Feedback';
  const feedback = document.createElement('textarea');
  feedback.name = 'feedback';
  feedback.rows = 3;
  feedback.maxLength = 10000;
  feedback.value = grade?.feedback || '';
  feedbackField.append(feedbackLabel, feedback);
  const releaseLabel = document.createElement('label');
  releaseLabel.className = 'form-check';
  const releaseInput = document.createElement('input');
  releaseInput.name = 'release';
  releaseInput.type = 'checkbox';
  releaseInput.checked = Boolean(grade?.released_at);
  const releaseText = document.createElement('span');
  releaseText.textContent = 'Release grade and feedback to student';
  releaseLabel.append(releaseInput, releaseText);
  const saveButton = document.createElement('button');
  saveButton.className = 'button button-secondary';
  saveButton.type = 'submit';
  saveButton.textContent = grade ? 'Save grade' : 'Save grade';
  const status = document.createElement('p');
  status.className = 'notice grade-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  gradeForm.append(heading, markField);
  if (rubricCriteria.length) gradeForm.append(rubricFields);
  gradeForm.append(feedbackField, releaseLabel, saveButton, status);
  card.append(gradeForm);
  if (rubricCriteria.length && rubricScores.length === rubricCriteria.length) {
    updateRubricCalculatedMark(gradeForm, rubricCriteria, assignment.max_marks);
  }
  return card;
}

function updateRubricCalculatedMark(form, criteria, maximumMark) {
  const markInput = form.querySelector('[name="mark"]');
  let total = 0;
  for (const criterion of criteria) {
    const input = form.querySelector(`[name="rubric-score-${CSS.escape(criterion.id)}"]`);
    const score = Number(input?.value);
    if (!input?.value || !Number.isFinite(score) || score < 0 || score > Number(criterion.max_points)) {
      markInput.value = '';
      return;
    }
    total += score / Number(criterion.max_points) * Number(criterion.weight_percent);
  }
  markInput.value = String(Math.round(total / 100 * Number(maximumMark) * 100) / 100);
}

async function saveGrade(event) {
  event.preventDefault();
  const form = event.target;
  if (!state.user || state.profile?.role !== 'teacher') return;
  const submissionId = form.dataset.submissionId;
  const assignment = state.teacherAssignments.find(item => item.id === state.selectedAssignment?.id);
  const submission = state.teacherSubmissions?.find(item => item.id === submissionId);
  const status = form.querySelector('.grade-status');
  const button = form.querySelector('button[type="submit"]');
  const mark = Number(new FormData(form).get('mark'));
  const feedback = String(new FormData(form).get('feedback') || '').trim();
  const released = new FormData(form).get('release') === 'on';
  const rubricFields = [...form.querySelectorAll('.grade-rubric-criterion')];
  const rubricScores = rubricFields.map(field => ({
    criterion_id: field.dataset.rubricCriterionId,
    score: Number(field.querySelector('[name^="rubric-score-"]').value),
    feedback: field.querySelector('[name^="rubric-feedback-"]').value.trim()
  }));
  const rubricMaximum = rubricFields.map(field => Number(field.querySelector('[name^="rubric-score-"]').max));
  if (rubricScores.some((item, index) => !Number.isFinite(item.score) || item.score < 0 || item.score > rubricMaximum[index])) {
    setNotice(status, 'Each rubric score must be within its criterion maximum.', 'error');
    return;
  }
  if (!assignment || !submission || !Number.isFinite(mark) || mark < 0 || mark > assignment.max_marks) {
    setNotice(status, 'Enter a mark from 0 to the assignment maximum.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(status, 'Saving grade…', '');
  try {
    const { error } = await supabase.rpc('save_submission_grade', {
      target_submission_id: submissionId,
      requested_mark: mark,
      requested_feedback: feedback,
      release_grade: released,
      requested_rubric_scores: rubricScores.length ? rubricScores : null
    });
    if (error) throw error;
    setNotice(status, `Grade saved${released ? ' and released' : ''}.`, 'success');
    await loadTeacherSubmissions(assignment);
  } catch (error) {
    setNotice(status, `Could not save grade: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function makeDownloadLink(path, objectName, label) {
  const link = document.createElement('a');
  link.className = 'file-link';
  link.textContent = `Download ${label}`;
  const { data, error } = await supabase.storage.from('submission-files')
    .createSignedUrl(path, 300, { download: objectName });
  if (error) {
    link.textContent = `Download unavailable: ${friendlyError(error)}`;
    return link;
  }
  link.href = data.signedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function subscribeToChanges() {
  if (state.realtime) void supabase.removeChannel(state.realtime);
  if (!state.user) return;
  state.realtime = supabase.channel(`portal-${state.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, () => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher') void loadTeacherCourses();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher') void loadTeacherAssignments();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, payload => {
      if (state.profile?.role === 'teacher') {
        const assignmentId = payload.new?.assignment_id || payload.old?.assignment_id;
        const selected = state.teacherAssignments.find(item => item.id === assignmentId);
        if (selected) void loadTeacherSubmissions(selected);
      } else {
        void loadStudentAssignments();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, () => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher') {
        const selected = state.teacherAssignments.find(item => item.id === state.selectedAssignment?.id);
        if (selected) void loadTeacherSubmissions(selected);
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
      if (state.profile?.role === 'student') void loadStudentAnnouncements();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, payload => {
      const assignmentId = payload.new?.assignment_id || payload.old?.assignment_id;
      if (state.profile?.role === 'teacher') {
        const assignment = state.teacherAssignments.find(item => item.id === assignmentId);
        if (assignment?.id === state.selectedAssignment?.id) void loadAssignmentDiscussion(assignment, 'teacher');
      } else {
        const assignment = state.studentAssignments.find(item => item.id === assignmentId);
        if (assignment?.id === state.selectedAssignment?.id) void loadAssignmentDiscussion(assignment, 'student');
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${state.user.id}`
    }, () => {
      void loadNotifications();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'extensions' }, () => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher') {
        const selected = state.teacherAssignments.find(item => item.id === state.selectedAssignment?.id);
        if (selected) void loadTeacherExtensionRequests(selected);
      }
    })
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Live updates are unavailable. Use the refresh button to reload coursework.');
      }
    });
}

async function resetWorkspace() {
  clearTimeout(state.saveTimer);
  clearInterval(state.deadlineTimer);
  state.deadlineTimer = null;
  if (state.realtime && supabase) {
    await supabase.removeChannel(state.realtime);
    state.realtime = null;
  }
  state.user = null;
  state.profile = null;
  state.studentAssignments = [];
  state.studentSubmissions = new Map();
  state.studentGrades = new Map();
  state.studentRubricScores = new Map();
  state.studentExtensions = new Map();
  state.studentExtensionRequests = new Map();
  state.submissionHistory = [];
  state.studentCourses = [];
  state.teacherCourses = [];
  state.teacherAssignments = [];
  state.teacherSubmissions = [];
  byId('teacher-discussion').hidden = true;
  state.notifications = [];
  state.selectedAssignment = null;
  state.submission = null;
  state.recoveringPassword = false;
  dashboardView.hidden = true;
  authView.hidden = false;
  byId('account-bar').hidden = true;
  byId('student-assignment-list').replaceChildren();
  byId('teacher-assignment-list').replaceChildren();
  byId('teacher-submissions').replaceChildren();
  byId('student-detail').hidden = true;
  byId('student-empty').hidden = false;
  authForm.reset();
  showAuthCard('auth-form');
  setNotice(authStatus, '', '');
  setBusy(false);
}

function showWorkspaceError(error) {
  dashboardView.hidden = true;
  authView.hidden = false;
  showAuthCard('auth-form');
  setNotice(authStatus, friendlyError(error), 'error');
}

function showAuthCard(formId) {
  authView.hidden = false;
  dashboardView.hidden = true;
  byId('account-bar').hidden = true;
  for (const id of ['auth-form', 'password-reset-form', 'recovery-form', 'forced-password-form']) {
    byId(id).hidden = id !== formId;
  }
  if (formId === 'auth-form' && configError) {
    setNotice(authStatus, configError, 'error');
  }
}

function makeListMessage(message) {
  const item = document.createElement('p');
  item.className = 'list-empty';
  item.textContent = message;
  return item;
}

function setBusy(busy) {
  state.busy = busy;
  if (byId('auth-submit')) {
    byId('auth-submit').disabled = busy || !ready;
    byId('auth-submit').textContent = busy ? 'Please wait…' : 'Sign in';
  }
  if (byId('sign-out')) byId('sign-out').disabled = busy;
}

function setNotice(element, message, stateName) {
  element.textContent = message;
  element.dataset.state = stateName;
}

function setDraftStatus(message, stateName) {
  const status = byId('draft-status');
  status.textContent = message;
  status.dataset.state = stateName;
}

function isSubmitted() {
  return state.submission?.status === 'submitted';
}

function assignmentDueDate(assignment) {
  const baseline = assignment.due_date || assignment.due_at || null;
  const extension = state.studentExtensions.get(assignment.id);
  if (!extension) return baseline;
  if (!baseline || new Date(extension).getTime() > new Date(baseline).getTime()) return extension;
  return baseline;
}

function effectiveDueDate(assignment) {
  return assignmentDueDate(assignment);
}

function usesExtensionDueDate(assignment) {
  const baseline = assignment.due_date || assignment.due_at;
  const extension = state.studentExtensions.get(assignment.id);
  return Boolean(extension && (!baseline
    || new Date(extension).getTime() > new Date(baseline).getTime()));
}

function isClosed(assignment) {
  if (!assignment || assignment.allow_late) return false;
  const dueAt = effectiveDueDate(assignment);
  return Boolean(dueAt && isPastDue(dueAt));
}

function canEditSubmission() {
  if (!state.selectedAssignment || isClosed(state.selectedAssignment)) return false;
  return !isSubmitted() || Boolean(state.selectedAssignment.allow_resubmission);
}

function updateStudentSubmissionControls() {
  if (!state.selectedAssignment) return;
  const assignment = state.selectedAssignment;
  const submitted = isSubmitted();
  const closed = isClosed(assignment);
  const resubmissionAllowed = submitted && assignment.allow_resubmission && !closed;
  const locked = closed || (submitted && !resubmissionAllowed);
  byId('student-response').disabled = locked;
  byId('student-files').disabled = locked;
  byId('attachment-picker').classList.toggle('disabled', locked);
  byId('submit-assignment').disabled = locked;
  byId('submit-assignment').textContent = submitted
    ? resubmissionAllowed ? 'Resubmit' : 'Submitted'
    : closed ? 'Submissions closed' : 'Submit assignment';
  byId('submit-help').textContent = submitted
    ? resubmissionAllowed
      ? 'You can submit a new version before the effective deadline.'
      : 'This submitted response is locked.'
    : closed ? 'Submissions are closed for this assignment.' : 'Submitting saves a new version and receipt.';
}

function getAssignmentStatus(assignment, submission, grade) {
  if (grade?.released_at) return 'Graded';
  if (submission?.status === 'submitted') return submission.is_late ? 'Submitted late' : 'Submitted';
  if (isClosed(assignment)) return 'Closed';
  if (isPastDue(effectiveDueDate(assignment))) return 'Late accepted';
  return submission ? 'Draft' : 'Open';
}

function formatCountdown(dueAt) {
  if (!dueAt) return '';
  const remaining = new Date(dueAt).getTime() - Date.now();
  if (remaining <= 0) return 'Deadline passed';
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h left`;
  if (hours) return `${hours}h ${minutes}m left`;
  return `${Math.max(1, minutes)}m left`;
}

function isAllowedFileType(file, allowedTypes = []) {
  if (!allowedTypes.length) return true;
  return allowedTypes.includes((file.type || 'application/octet-stream').toLowerCase());
}

async function loadSubmissionHistory(submission) {
  const section = byId('submission-history');
  const list = byId('submission-version-list');
  list.replaceChildren();
  if (!submission?.id || submission.status !== 'submitted') {
    section.hidden = true;
    return;
  }
  try {
    const { data, error } = await supabase.from('submission_versions')
      .select('id, version_number, response, submitted_at, is_late')
      .eq('submission_id', submission.id)
      .order('version_number', { ascending: false });
    if (error) throw error;
    state.submissionHistory = data || [];
    section.hidden = !state.submissionHistory.length;
    for (const version of state.submissionHistory) {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = `Version ${version.version_number} · ${formatDate(version.submitted_at)}${version.is_late ? ' · Late' : ''}`;
      const response = document.createElement('p');
      response.textContent = version.response || 'No written response.';
      item.append(heading, response);
      list.append(item);
    }
  } catch (error) {
    section.hidden = false;
    const item = document.createElement('li');
    item.textContent = `Could not load submission history: ${friendlyError(error)}`;
    list.append(item);
  }
}

function updateWordCount() {
  const text = byId('student-response').value;
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  byId('word-count').textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${text.length.toLocaleString()} characters`;
}

function isPastDue(dueAt) {
  return Boolean(dueAt && new Date(dueAt).getTime() <= Date.now());
}

function formatDate(value) {
  if (!value) return 'Not submitted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function toLocalDateTimeInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function friendlyError(error) {
  const message = error?.message || 'An unexpected error occurred.';
  if (/Invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(message)) return 'Confirm your email from the link we sent, then sign in.';
  if (/User already registered/i.test(message)) return 'An account already uses this email. Try signing in.';
  if (/row-level security|permission denied/i.test(message)) {
    return 'You do not have permission for this action. Check your account role and project policies.';
  }
  return message;
}
