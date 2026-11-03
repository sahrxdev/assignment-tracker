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
  studentCourses: [],
  teacherCourses: [],
  teacherAssignments: [],
  selectedAssignment: null,
  submission: null,
  saveTimer: null,
  authPendingTimer: null,
  realtime: null,
  authSubscription: null,
  busy: false
};

const byId = id => document.getElementById(id);
const authForm = byId('auth-form');
const authStatus = byId('auth-status');
const dashboardView = byId('dashboard-view');
const authView = byId('auth-view');

if (!ready) {
  byId('setup-message').hidden = false;
  authStatus.textContent = configError;
  authStatus.dataset.state = 'error';
  byId('auth-submit').disabled = true;
} else {
  initializeAuth();
}

byId('auth-toggle').addEventListener('click', () => {
  const isCreating = authForm.dataset.mode !== 'signup';
  authForm.dataset.mode = isCreating ? 'signup' : 'signin';
  byId('name-field').hidden = !isCreating;
  byId('display-name').required = isCreating;
  byId('password').autocomplete = isCreating ? 'new-password' : 'current-password';
  byId('auth-title').textContent = isCreating ? 'Create your account' : 'Sign in';
  byId('auth-description').textContent = isCreating
    ? 'Student accounts can be created here. Teacher access is enabled by an administrator.'
    : 'Use your school or personal email to continue.';
  byId('auth-submit').textContent = isCreating ? 'Create student account' : 'Sign in';
  byId('auth-toggle').textContent = isCreating
    ? 'Already have an account? Sign in'
    : 'New here? Create a student account';
  setNotice(authStatus, configError, configError ? 'error' : '');
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase || state.busy) return;
  setBusy(true);
  const isSignup = authForm.dataset.mode === 'signup';
  setNotice(authStatus, isSignup ? 'Creating your account…' : 'Signing you in…', '');
  clearTimeout(state.authPendingTimer);
  state.authPendingTimer = window.setTimeout(() => {
    if (state.busy) {
      setNotice(authStatus, 'This is taking longer than expected. Check your connection and Supabase project status; we will show the result when it arrives.', '');
    }
  }, 12000);

  const email = byId('email').value.trim();
  const password = byId('password').value;
  try {
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: byId('display-name').value.trim() } }
      });
      if (error) throw error;

      if (data.session) {
        await loadWorkspace(data.session.user);
      } else {
        setNotice(authStatus, 'Account created. Check your inbox (and spam folder) for the confirmation email, then return here to sign in.', 'success');
        authForm.reset();
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadWorkspace(data.user);
    }
  } catch (error) {
    setNotice(authStatus, friendlyError(error), 'error');
  } finally {
    clearTimeout(state.authPendingTimer);
    state.authPendingTimer = null;
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
byId('refresh-student').addEventListener('click', loadStudentAssignments);
byId('refresh-teacher').addEventListener('click', loadTeacherAssignments);
byId('assignment-form').addEventListener('submit', createAssignment);
byId('join-course-form').addEventListener('submit', joinCourse);
byId('course-form').addEventListener('submit', createCourse);
byId('refresh-courses').addEventListener('click', loadTeacherCourses);

async function initializeAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setNotice(authStatus, `Could not restore your sign-in: ${friendlyError(error)}`, 'error');
  } else if (data.session) {
    await loadWorkspace(data.session.user).catch(showWorkspaceError);
  }

  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      window.setTimeout(() => {
        void resetWorkspace();
      }, 0);
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
    .select('id, email, display_name, role')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(`Could not load your account profile: ${friendlyError(error)}`);
  if (!profile || !['student', 'teacher'].includes(profile.role)) {
    throw new Error('Your account has no valid role. Contact your administrator.');
  }

  state.profile = profile;
  authView.hidden = true;
  dashboardView.hidden = false;
  byId('account-bar').hidden = false;
  byId('account-label').textContent = profile.display_name || profile.email;
  const isTeacher = profile.role === 'teacher';
  byId('student-panel').hidden = isTeacher;
  byId('teacher-panel').hidden = !isTeacher;
  byId('role-label').textContent = isTeacher ? 'Lecturer workspace' : 'Student workspace';
  byId('role-chip').textContent = isTeacher ? 'Lecturer' : 'Student';
  byId('welcome-title').textContent = isTeacher ? 'Your teaching space' : 'Your assignments';
  byId('welcome-copy').textContent = isTeacher
    ? 'Create assignment briefs and review student submissions.'
    : 'Choose an assignment to read the brief and work on your response.';

  await loadWorkspaceData();
  subscribeToChanges();
}

async function loadWorkspaceData() {
  if (state.profile?.role === 'teacher') {
    await loadTeacherAssignments();
  } else if (state.profile?.role === 'student') {
    await loadStudentAssignments();
  }
}

async function loadStudentAssignments() {
  if (!state.user || state.profile?.role !== 'student') return;
  const list = byId('student-assignment-list');
  list.replaceChildren(makeListMessage('Loading assignments…'));

  try {
    const [assignmentResult, submissionResult, courseResult] = await Promise.all([
      supabase.from('assignments')
        .select('id, course_id, title, instructions, due_at, created_at')
        .eq('published', true)
        .order('due_at', { ascending: true, nullsFirst: false }),
      supabase.from('submissions')
        .select('id, assignment_id, response, status, submitted_at, updated_at')
        .eq('student_id', state.user.id),
      supabase.from('courses').select('id, name').order('name')
    ]);
    if (assignmentResult.error) throw assignmentResult.error;
    if (submissionResult.error) throw submissionResult.error;
    if (courseResult.error) throw courseResult.error;
    state.studentAssignments = assignmentResult.data || [];
    state.studentSubmissions = new Map((submissionResult.data || []).map(item => [item.assignment_id, item]));
    state.studentCourses = courseResult.data || [];
    renderStudentAssignments();

    if (state.selectedAssignment) {
      const refreshed = state.studentAssignments.find(item => item.id === state.selectedAssignment.id);
      if (refreshed) {
        state.selectedAssignment = refreshed;
        const submission = state.studentSubmissions.get(refreshed.id);
        if (submission && submission.status !== state.submission?.status) {
          await openStudentAssignment(refreshed, submission);
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assignment-item';
    button.setAttribute('aria-current', state.selectedAssignment?.id === assignment.id ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = assignment.title;
    const status = document.createElement('span');
    status.className = 'assignment-status';
    status.textContent = submission?.status === 'submitted' ? 'Submitted' : submission ? 'Draft' : '';
    title.append(status);
    const due = document.createElement('small');
    const course = state.studentCourses.find(item => item.id === assignment.course_id);
    due.textContent = `${course?.name || 'Class'} · ${assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : 'No due date'}`;
    button.append(title, due);
    button.addEventListener('click', () => {
      void switchStudentAssignment(assignment, submission);
    });
    list.append(button);
  }
}

async function switchStudentAssignment(assignment, submission) {
  if (state.selectedAssignment?.id === assignment.id) return;
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
  byId('student-due').textContent = assignment.due_at
    ? `Due ${formatDate(assignment.due_at)}`
    : 'No due date';
  byId('student-instructions').textContent = assignment.instructions || 'No additional instructions were provided.';

  if (!submission) {
    const { data, error } = await supabase.from('submissions')
      .select('id, assignment_id, response, status, submitted_at, updated_at')
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
  byId('student-response').value = submission?.response || '';
  byId('student-submission-state').textContent = submission?.status === 'submitted'
    ? 'Submitted'
    : submission ? 'Draft' : 'Not started';
  const submitted = submission?.status === 'submitted';
  const pastDue = isPastDue(assignment.due_at);
  byId('student-response').disabled = submitted || pastDue;
  byId('student-files').disabled = submitted || pastDue;
  byId('attachment-picker').classList.toggle('disabled', submitted || pastDue);
  byId('submit-assignment').disabled = submitted || pastDue;
  byId('submit-assignment').textContent = submitted ? 'Submitted' : pastDue ? 'Deadline passed' : 'Submit assignment';
  setDraftStatus(
    submitted ? `Submitted ${formatDate(submission.submitted_at)}` : pastDue ? 'Deadline passed; draft is read-only.' : 'Drafts save automatically',
    submitted ? 'success' : pastDue ? 'error' : ''
  );
  updateWordCount();
  await loadStudentFiles();
  if (submission) state.studentSubmissions.set(assignment.id, submission);
  renderStudentAssignments();
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
        .select('id, assignment_id, response, status, submitted_at, updated_at')
        .single();
      if (error) throw error;
      state.submission = data;
    } else {
      const { data, error } = await supabase.from('submissions')
        .update({ response: byId('student-response').value })
        .eq('id', state.submission.id)
        .eq('status', 'draft')
        .select('id, assignment_id, response, status, submitted_at, updated_at')
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
  if (!files.length || !state.selectedAssignment || isSubmitted()) return;
  const assignment = state.selectedAssignment;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      setDraftStatus(`${file.name} is larger than 10 MB.`, 'error');
      continue;
    }
    const submission = await saveDraft();
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
  if (!state.selectedAssignment || !state.submission) return;

  try {
    const folder = `${state.selectedAssignment.id}/${state.user.id}/${state.submission.id}`;
    const { data, error } = await supabase.storage.from('submission-files').list(folder, {
      sortBy: { column: 'created_at', order: 'asc' }
    });
    if (error) throw error;
    if (!data?.length) {
      const empty = document.createElement('li');
      empty.className = 'list-empty';
      empty.textContent = 'No files attached.';
      list.append(empty);
      return;
    }
    for (const file of data) {
      const path = `${folder}/${file.name}`;
      const item = document.createElement('li');
      item.className = 'file-item';
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name.replace(/^[0-9a-f-]{36}-/i, '');
      const actions = document.createElement('span');
      const download = await makeDownloadLink(path, file.name, file.name.replace(/^[0-9a-f-]{36}-/i, ''));
      actions.append(download);
      if (!isSubmitted()) {
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
  } catch (error) {
    const item = makeListMessage(`Could not load attachments: ${friendlyError(error)}`);
    list.append(item);
  }
}

async function removeStudentFile(path) {
  if (isSubmitted()) return;
  const { error } = await supabase.storage.from('submission-files').remove([path]);
  if (error) {
    setDraftStatus(`Could not remove attachment: ${friendlyError(error)}`, 'error');
    return;
  }
  await loadStudentFiles();
}

async function submitAssignment() {
  if (!state.selectedAssignment || isSubmitted()) return;
  if (!byId('student-response').value.trim()) {
    const submission = state.submission || await saveDraft();
    if (!submission) return;
    const folder = `${state.selectedAssignment.id}/${state.user.id}/${submission.id}`;
    const { data: files, error: fileError } = await supabase.storage.from('submission-files').list(folder);
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
  const submission = await saveDraft();
  if (!submission) {
    button.disabled = false;
    return;
  }
  const { data, error } = await supabase.from('submissions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', submission.id)
    .eq('status', 'draft')
    .select('id, assignment_id, response, status, submitted_at, updated_at')
    .maybeSingle();
  if (error || !data) {
    setDraftStatus(error ? `Could not submit: ${friendlyError(error)}` : 'This draft could not be submitted. Refresh and try again.', 'error');
    button.disabled = false;
    return;
  }
  state.submission = data;
  await openStudentAssignment(state.selectedAssignment, data);
  await loadStudentAssignments();
}

async function createAssignment(event) {
  event.preventDefault();
  if (!state.user || state.profile?.role !== 'teacher') return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const title = byId('assignment-title').value.trim();
  const instructions = byId('assignment-instructions').value.trim();
  const dueValue = byId('assignment-due').value;
  const courseId = byId('assignment-course').value;
  if (!title) return;
  if (!courseId) {
    setNotice(byId('teacher-status'), 'Create a class before publishing an assignment.', 'error');
    return;
  }
  if (dueValue && new Date(dueValue).getTime() <= Date.now()) {
    setNotice(byId('teacher-status'), 'Choose a due date in the future.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('teacher-status'), 'Publishing assignment…', '');

  try {
    const { error } = await supabase.from('assignments').insert({
      teacher_id: state.user.id,
      course_id: courseId,
      title,
      instructions,
      due_at: dueValue ? new Date(dueValue).toISOString() : null,
      published: true
    });
    if (error) throw error;
    event.currentTarget.reset();
    setNotice(byId('teacher-status'), 'Assignment published for students.', 'success');
    await loadTeacherAssignments();
  } catch (error) {
    setNotice(byId('teacher-status'), `Could not publish: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function createCourse(event) {
  event.preventDefault();
  if (!state.user || state.profile?.role !== 'teacher') return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const name = byId('course-name').value.trim();
  if (!name) return;
  button.disabled = true;
  setNotice(byId('course-status'), 'Creating class…', '');
  try {
    const joinCode = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const { error } = await supabase.from('courses').insert({
      teacher_id: state.user.id,
      name,
      join_code: joinCode
    });
    if (error) throw error;
    event.currentTarget.reset();
    setNotice(byId('course-status'), 'Class created. Share its join code with students.', 'success');
    await loadTeacherCourses();
  } catch (error) {
    setNotice(byId('course-status'), `Could not create class: ${friendlyError(error)}`, 'error');
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
      .select('id, name, join_code, created_at')
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
  list.replaceChildren();
  select.replaceChildren();
  if (!state.teacherCourses.length) {
    list.append(makeListMessage('Create a class to get a student join code.'));
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Create a class first';
    select.append(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const course of state.teacherCourses) {
    const option = document.createElement('option');
    option.value = course.id;
    option.textContent = course.name;
    select.append(option);

    const item = document.createElement('article');
    item.className = 'course-item';
    const title = document.createElement('strong');
    title.textContent = course.name;
    const created = document.createElement('small');
    created.textContent = `Created ${formatDate(course.created_at)}`;
    const code = document.createElement('button');
    code.type = 'button';
    code.className = 'join-code';
    code.textContent = course.join_code;
    code.title = 'Click to copy the class join code';
    code.addEventListener('click', () => copyJoinCode(course.join_code, code));
    item.append(title, created, code);
    list.append(item);
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
  if (!state.user || state.profile?.role !== 'student') return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  setNotice(byId('join-status'), 'Joining class…', '');
  try {
    const code = byId('join-code').value.trim().toUpperCase();
    const { error } = await supabase.rpc('join_course_by_code', { input_code: code });
    if (error) throw error;
    event.currentTarget.reset();
    setNotice(byId('join-status'), 'You joined the class. Its assignments are now available.', 'success');
    await loadStudentAssignments();
  } catch (error) {
    setNotice(byId('join-status'), `Could not join class: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadTeacherAssignments() {
  if (!state.user || state.profile?.role !== 'teacher') return;
  await loadTeacherCourses();
  const list = byId('teacher-assignment-list');
  list.replaceChildren(makeListMessage('Loading your assignments…'));
  try {
    const { data, error } = await supabase.from('assignments')
      .select('id, course_id, title, instructions, due_at, created_at')
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
    due.textContent = `${course?.name || 'Class'} · ${assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : 'No due date'}`;
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
  list.replaceChildren(makeListMessage('Loading submissions…'));
  try {
    const { data: submissions, error } = await supabase.from('submissions')
      .select('id, student_id, response, status, submitted_at, updated_at')
      .eq('assignment_id', assignment.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    list.replaceChildren();
    if (!submissions?.length) {
      list.append(makeListMessage('No students have submitted this assignment yet.'));
      return;
    }
    const ids = [...new Set(submissions.map(item => item.student_id))];
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('id, display_name, email')
      .in('id', ids);
    if (profileError) throw profileError;
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
    for (const submission of submissions) {
      list.append(await renderSubmissionCard(assignment, submission, profileById.get(submission.student_id)));
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load submissions: ${friendlyError(error)}`));
  }
}

async function renderSubmissionCard(assignment, submission, profile) {
  const card = document.createElement('article');
  card.className = 'submission-card';
  const name = document.createElement('h3');
  name.textContent = profile?.display_name || profile?.email || 'Student';
  const meta = document.createElement('div');
  meta.className = 'submission-meta';
  const email = document.createElement('span');
  email.textContent = profile?.email || '';
  const submittedAt = document.createElement('span');
  submittedAt.textContent = `Submitted ${formatDate(submission.submitted_at)}`;
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
  return card;
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
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Live updates are unavailable. Use the refresh button to reload coursework.');
      }
    });
}

async function resetWorkspace() {
  clearTimeout(state.saveTimer);
  if (state.realtime && supabase) {
    await supabase.removeChannel(state.realtime);
    state.realtime = null;
  }
  state.user = null;
  state.profile = null;
  state.studentAssignments = [];
  state.studentSubmissions = new Map();
  state.studentCourses = [];
  state.teacherCourses = [];
  state.teacherAssignments = [];
  state.selectedAssignment = null;
  state.submission = null;
  dashboardView.hidden = true;
  authView.hidden = false;
  byId('account-bar').hidden = true;
  byId('student-assignment-list').replaceChildren();
  byId('teacher-assignment-list').replaceChildren();
  byId('teacher-submissions').replaceChildren();
  byId('student-detail').hidden = true;
  byId('student-empty').hidden = false;
  authForm.reset();
  setNotice(authStatus, '', '');
  setBusy(false);
}

function showWorkspaceError(error) {
  dashboardView.hidden = true;
  authView.hidden = false;
  setNotice(authStatus, friendlyError(error), 'error');
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
    byId('auth-submit').textContent = busy
      ? authForm.dataset.mode === 'signup' ? 'Creating account…' : 'Signing in…'
      : authForm.dataset.mode === 'signup' ? 'Create student account' : 'Sign in';
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
