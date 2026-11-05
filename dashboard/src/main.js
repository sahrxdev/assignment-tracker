import { createClient } from '@supabase/supabase-js';
import '@fontsource-variable/inter';
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileInput,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  RefreshCw,
  ScrollText,
  Shield,
  Sun,
  Upload,
  UserRound,
  Users,
  X,
  createIcons
} from 'lucide';

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
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_BUCKET = 'avatars';
const navigationByRole = {
  student: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'My classes', icon: GraduationCap },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'submissions', label: 'Submissions', icon: FileText, badge: 'submissions' },
    { id: 'grades', label: 'Grades', icon: ClipboardCheck, badge: 'grades' },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ],
  teacher: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'Classes', icon: GraduationCap },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'submissions', label: 'Submissions', icon: FileText, badge: 'submissions' },
    { id: 'gradebook', label: 'Gradebook', icon: ClipboardCheck },
    { id: 'performance', label: 'Performance', icon: ChartNoAxesCombined },
    { id: 'attendance', label: 'Attendance', icon: Check },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ],
  admin: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'import-students', label: 'Import students', icon: Upload },
    { id: 'classes', label: 'Classes', icon: GraduationCap },
    { id: 'directory', label: 'Departments & terms', icon: Building2 },
    { id: 'audit-log', label: 'Audit log', icon: ScrollText },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ]
};
const iconRegistry = {
  Activity, Bell, BookOpen, Building2, CalendarDays, Camera, ChartNoAxesCombined, Check,
  ClipboardCheck, ClipboardList, Clock3, FileInput, FileText, GraduationCap, LayoutDashboard,
  LockKeyhole, LogOut, Megaphone, Menu, Moon, RefreshCw, ScrollText, Shield, Sun, Upload,
  UserRound, Users, X
};
const state = {
  user: null,
  profile: null,
  studentAssignments: [],
  studentSubmissions: new Map(),
  studentGroups: new Map(),
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
  teacherGroups: [],
  teacherSubmissionCount: 0,
  teacherNeedsGradingCount: 0,
  adminUsers: [],
  adminCourses: [],
  auditRows: [],
  notifications: [],
  selectedAssignment: null,
  selectedStudentGroup: null,
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
  shellInitialized: false,
  currentRoute: '',
  routePages: new Map(),
  profileCard: null,
  currentAvatarUrl: '',
  currentAvatarPath: '',
  busy: false
};

const byId = id => document.getElementById(id);
const authForm = byId('auth-form');
const authStatus = byId('auth-status');
const dashboardView = byId('dashboard-view');
const authView = byId('auth-view');
const routeContent = byId('route-content');
let followsSystemTheme = true;
let themeMediaQuery = null;
byId('attendance-date').value = localDateValue(new Date());
byId('term-year').value = String(new Date().getFullYear());
initializeTheme();
renderLucideIcons();
initializeRoleRoutes();

byId('app-navigation').addEventListener('click', event => {
  const link = event.target.closest('a[data-route]');
  if (!link) return;
  event.preventDefault();
  void navigateToRoute(link.dataset.route);
});
byId('theme-toggle').addEventListener('click', toggleTheme);
byId('profile-shortcut').addEventListener('click', () => void navigateToRoute('profile'));
byId('mobile-menu-toggle').addEventListener('click', toggleSidebar);
byId('sidebar-backdrop').addEventListener('click', closeSidebar);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSidebar();
});
window.addEventListener('popstate', () => {
  if (state.profile && !state.profile.must_change_password) {
    void navigateToRoute(new URLSearchParams(window.location.search).get('view') || '', { updateHistory: false });
  }
});

function toggleTheme() {
  followsSystemTheme = false;
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
}

function renderLucideIcons() {
  createIcons({ icons: iconRegistry, attrs: { 'stroke-width': '1.75' } });
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('unitrack-theme');
  followsSystemTheme = savedTheme !== 'dark' && savedTheme !== 'light';
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  setTheme(followsSystemTheme ? (themeMediaQuery.matches ? 'dark' : 'light') : savedTheme);
  themeMediaQuery.addEventListener('change', event => {
    if (followsSystemTheme) setTheme(event.matches ? 'dark' : 'light');
  });
}

function setTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111318' : '#f7f8fa';
  const toggle = byId('theme-toggle');
  const profileToggle = byId('profile-theme-toggle');
  for (const [control, showLabel] of [[toggle, false], [profileToggle, true]]) {
    if (!control) continue;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const icon = theme === 'dark' ? 'sun' : 'moon';
    control.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
    control.title = `Switch to ${nextTheme} theme`;
    control.replaceChildren();
    const iconElement = document.createElement('i');
    iconElement.dataset.lucide = icon;
    iconElement.setAttribute('aria-hidden', 'true');
    control.append(iconElement);
    if (showLabel) control.append(document.createTextNode(`Switch to ${nextTheme} theme`));
  }
  renderLucideIcons();
  if (persist) localStorage.setItem('unitrack-theme', theme);
}

function routeDescription(role, route) {
  const descriptions = {
    student: {
      dashboard: 'A quick view of your coursework and upcoming deadlines.',
      classes: 'Join classes and see the courses you are enrolled in.',
      assignments: 'Choose an assignment to read the brief and work on your response.',
      submissions: 'Review your submitted coursework and submission status.',
      grades: 'See marks and feedback released by your lecturers.',
      calendar: 'Keep upcoming assignment deadlines in view.',
      announcements: 'Updates shared by your class lecturers.',
      notifications: 'Recent account and coursework updates.',
      profile: 'Manage your profile photo and account password.'
    },
    teacher: {
      dashboard: 'A summary of your classes, assignments, and grading work.',
      classes: 'Create classes and share their join codes with students.',
      assignments: 'Publish assignment briefs and configure their requirements.',
      submissions: 'Review student work, discussions, and extension requests.',
      gradebook: 'Review submissions and release marks and feedback.',
      performance: 'A summary of assignment and grading activity.',
      attendance: 'Record attendance for an enrolled class.',
      announcements: 'Share class updates with your students.',
      notifications: 'Recent account and coursework updates.',
      profile: 'Manage your profile photo and account password.'
    },
    admin: {
      overview: 'A summary of university accounts and classes.',
      users: 'Manage roles and access for existing accounts.',
      'import-students': 'Account provisioning is handled securely through Supabase Authentication.',
      classes: 'Review the classes available in the portal.',
      directory: 'Manage academic departments and terms.',
      'audit-log': 'Review recent administrative and coursework changes.',
      notifications: 'Recent account and coursework updates.',
      profile: 'Manage your profile photo and account password.'
    }
  };
  return descriptions[role]?.[route] || 'Manage your UniTrack workspace.';
}

function makeRouteCard(title, icon, className = '') {
  const card = document.createElement('section');
  card.className = `card route-card${className ? ` ${className}` : ''}`;
  const heading = document.createElement('div');
  heading.className = 'panel-heading';
  const headingTitle = document.createElement('h2');
  const iconElement = document.createElement('i');
  iconElement.dataset.lucide = icon;
  iconElement.setAttribute('aria-hidden', 'true');
  headingTitle.append(iconElement, document.createTextNode(title));
  heading.append(headingTitle);
  const body = document.createElement('div');
  body.className = 'route-card-body';
  card.append(heading, body);
  return { card, body };
}

function createRoutePage(role, route) {
  const page = document.createElement('section');
  page.className = 'route-page';
  page.id = `route-page-${role}-${route.id}`;
  page.dataset.role = role;
  page.dataset.routePage = route.id;
  page.hidden = true;
  page.setAttribute('aria-label', `${route.label} page`);
  routeContent.append(page);
  state.routePages.set(`${role}:${route.id}`, page);
  return page;
}

function createSummaryStat(label, id) {
  const item = document.createElement('article');
  item.className = 'summary-stat card';
  const value = document.createElement('strong');
  value.id = id;
  value.textContent = '0';
  const caption = document.createElement('span');
  caption.textContent = label;
  item.append(value, caption);
  return item;
}

function initializeRoleRoutes() {
  for (const [role, routes] of Object.entries(navigationByRole)) {
    for (const route of routes) createRoutePage(role, route);
  }
  document.querySelector('.notification-center').hidden = true;

  const studentDashboard = makeRouteCard('Your coursework', 'book-open');
  const studentStats = document.createElement('div');
  studentStats.className = 'summary-grid';
  studentStats.append(
    createSummaryStat('Due soon', 'student-due-count'),
    createSummaryStat('Submitted', 'student-submitted-count'),
    createSummaryStat('Grades released', 'student-released-count')
  );
  const studentDueList = document.createElement('div');
  studentDueList.id = 'student-dashboard-list';
  studentDueList.className = 'route-list';
  studentDashboard.body.append(studentStats, studentDueList);
  state.routePages.get('student:dashboard').append(studentDashboard.card);

  const studentClasses = makeRouteCard('Your classes', 'graduation-cap');
  const studentCourseList = document.createElement('div');
  studentCourseList.id = 'student-class-list';
  studentCourseList.className = 'route-list';
  studentClasses.body.append(studentCourseList);
  const studentClassesPage = state.routePages.get('student:classes');
  studentClassesPage.append(studentClasses.card);
  studentClassesPage.append(byId('join-course-form'));

  const studentPanel = byId('student-panel');
  studentPanel.hidden = false;
  const studentAnnouncements = studentPanel.querySelector('.course-announcements');
  const studentGradebook = studentPanel.querySelector('.student-gradebook');
  studentAnnouncements.remove();
  studentGradebook.remove();
  const studentAnnouncementsCard = makeRouteCard('Class announcements', 'megaphone');
  studentAnnouncementsCard.body.append(studentAnnouncements);
  state.routePages.get('student:announcements').append(studentAnnouncementsCard.card);
  const studentGradebookCard = makeRouteCard('Released grades', 'clipboard-check');
  studentGradebookCard.body.append(studentGradebook);
  state.routePages.get('student:grades').append(studentGradebookCard.card);
  state.routePages.get('student:assignments').append(studentPanel);

  const studentSubmissions = makeRouteCard('Submission history', 'file-text');
  const studentSubmissionList = document.createElement('div');
  studentSubmissionList.id = 'student-submissions-list';
  studentSubmissionList.className = 'route-list';
  studentSubmissions.body.append(studentSubmissionList);
  state.routePages.get('student:submissions').append(studentSubmissions.card);
  const studentCalendar = makeRouteCard('Upcoming deadlines', 'calendar-days');
  const studentCalendarList = document.createElement('div');
  studentCalendarList.id = 'student-calendar-list';
  studentCalendarList.className = 'route-list';
  studentCalendar.body.append(studentCalendarList);
  state.routePages.get('student:calendar').append(studentCalendar.card);

  const teacherPanel = byId('teacher-panel');
  teacherPanel.hidden = false;
  const teacherClasses = teacherPanel.querySelector('.teacher-classes');
  const teacherRoster = teacherClasses.querySelector('.course-roster');
  const teacherAnnouncements = byId('announcement-form');
  teacherRoster.remove();
  teacherAnnouncements.remove();
  state.routePages.get('teacher:classes').append(teacherClasses);
  state.routePages.get('teacher:assignments').append(teacherPanel.querySelector('.teacher-create'));
  state.routePages.get('teacher:submissions').append(teacherPanel.querySelector('.teacher-list'));
  const teacherAttendanceCard = makeRouteCard('Class attendance', 'clipboard-check');
  teacherAttendanceCard.body.append(teacherRoster);
  state.routePages.get('teacher:attendance').append(teacherAttendanceCard.card);
  const teacherAnnouncementCard = makeRouteCard('Post a class update', 'megaphone');
  teacherAnnouncementCard.body.append(teacherAnnouncements);
  state.routePages.get('teacher:announcements').append(teacherAnnouncementCard.card);
  teacherPanel.remove();

  const teacherDashboard = makeRouteCard('Teaching overview', 'chart-no-axes-combined');
  const teacherStats = document.createElement('div');
  teacherStats.className = 'summary-grid';
  teacherStats.append(
    createSummaryStat('Classes', 'teacher-class-count'),
    createSummaryStat('Assignments', 'teacher-assignment-count'),
    createSummaryStat('Needs grading', 'teacher-needs-grading-count')
  );
  teacherDashboard.body.append(teacherStats);
  const teacherSummaryStatus = document.createElement('p');
  teacherSummaryStatus.id = 'teacher-summary-status';
  teacherSummaryStatus.className = 'notice';
  teacherSummaryStatus.setAttribute('role', 'status');
  teacherDashboard.body.append(teacherSummaryStatus);
  state.routePages.get('teacher:dashboard').append(teacherDashboard.card);
  const teacherPerformance = makeRouteCard('Grading activity', 'activity');
  const teacherPerformanceList = document.createElement('div');
  teacherPerformanceList.id = 'teacher-performance-list';
  teacherPerformanceList.className = 'route-list';
  teacherPerformance.body.append(teacherPerformanceList);
  state.routePages.get('teacher:performance').append(teacherPerformance.card);

  const adminPanel = byId('admin-panel');
  adminPanel.hidden = false;
  const academicDirectory = byId('academic-directory');
  academicDirectory.remove();
  state.routePages.get('admin:users').append(adminPanel);
  state.routePages.get('admin:directory').append(academicDirectory);
  const importCard = makeRouteCard('Student account import', 'file-input');
  const importMessage = document.createElement('p');
  importMessage.className = 'muted import-guidance';
  importMessage.textContent = 'Bulk account import is not available. Create accounts individually in Users with a full name, email, role, and student ID when needed. Use a secure channel to give the account holder their temporary password.';
  importCard.body.append(importMessage);
  state.routePages.get('admin:import-students').append(importCard.card);
  const adminClassCard = makeRouteCard('Portal classes', 'graduation-cap');
  const adminClassStatus = document.createElement('p');
  adminClassStatus.id = 'admin-class-status';
  adminClassStatus.className = 'notice';
  const adminClassList = document.createElement('div');
  adminClassList.id = 'admin-class-list';
  adminClassList.className = 'route-list';
  adminClassCard.body.append(adminClassStatus, adminClassList);
  state.routePages.get('admin:classes').append(adminClassCard.card);
  const auditCard = makeRouteCard('Recent activity', 'scroll-text');
  const auditStatus = document.createElement('p');
  auditStatus.id = 'audit-status';
  auditStatus.className = 'notice';
  const auditList = document.createElement('div');
  auditList.id = 'audit-list';
  auditList.className = 'route-list';
  auditCard.body.append(auditStatus, auditList);
  state.routePages.get('admin:audit-log').append(auditCard.card);
  const adminOverview = makeRouteCard('University overview', 'layout-dashboard');
  const adminStats = document.createElement('div');
  adminStats.className = 'summary-grid';
  adminStats.append(
    createSummaryStat('Accounts', 'admin-account-count'),
    createSummaryStat('Students', 'admin-student-count'),
    createSummaryStat('Classes', 'admin-class-count')
  );
  adminOverview.body.append(adminStats);
  state.routePages.get('admin:overview').append(adminOverview.card);

  createProfileRoute();
  state.shellInitialized = true;
  renderLucideIcons();
}

function createProfileRoute() {
  const profileCard = makeRouteCard('Your profile', 'user-round');
  const profileLayout = document.createElement('div');
  profileLayout.className = 'profile-layout';
  const photoPanel = document.createElement('section');
  photoPanel.className = 'profile-photo-panel';
  const avatar = document.createElement('span');
  avatar.id = 'profile-avatar';
  avatar.className = 'avatar profile-avatar';
  avatar.setAttribute('aria-label', 'Profile photo');
  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'button button-secondary profile-upload';
  const uploadIcon = document.createElement('i');
  uploadIcon.dataset.lucide = 'camera';
  uploadIcon.setAttribute('aria-hidden', 'true');
  uploadLabel.append(uploadIcon, document.createTextNode('Change photo'));
  const uploadInput = document.createElement('input');
  uploadInput.id = 'profile-photo-input';
  uploadInput.type = 'file';
  uploadInput.accept = 'image/jpeg,image/png,image/webp';
  uploadInput.setAttribute('aria-label', 'Upload a profile photo');
  uploadLabel.append(uploadInput);
  const photoStatus = document.createElement('p');
  photoStatus.id = 'profile-photo-status';
  photoStatus.className = 'notice';
  photoStatus.setAttribute('role', 'status');
  photoPanel.append(avatar, uploadLabel, photoStatus);

  const fields = document.createElement('dl');
  fields.className = 'profile-fields';
  for (const [label, id] of [
    ['Full name', 'profile-full-name'],
    ['Email', 'profile-email'],
    ['Role', 'profile-role'],
    ['Student ID', 'profile-student-id']
  ]) {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    value.id = id;
    value.textContent = '—';
    group.append(term, value);
    fields.append(group);
  }

  const passwordForm = document.createElement('form');
  passwordForm.id = 'profile-password-form';
  passwordForm.className = 'profile-password-form';
  const passwordHeading = document.createElement('h3');
  passwordHeading.textContent = 'Change password';
  const password = document.createElement('label');
  password.className = 'form-field';
  password.innerHTML = '<span>New password</span>';
  const passwordInput = document.createElement('input');
  passwordInput.id = 'profile-new-password';
  passwordInput.type = 'password';
  passwordInput.autocomplete = 'new-password';
  passwordInput.minLength = 8;
  passwordInput.required = true;
  password.append(passwordInput);
  const confirm = document.createElement('label');
  confirm.className = 'form-field';
  confirm.innerHTML = '<span>Confirm new password</span>';
  const confirmInput = document.createElement('input');
  confirmInput.id = 'profile-confirm-password';
  confirmInput.type = 'password';
  confirmInput.autocomplete = 'new-password';
  confirmInput.minLength = 8;
  confirmInput.required = true;
  confirm.append(confirmInput);
  const passwordStatus = document.createElement('p');
  passwordStatus.id = 'profile-password-status';
  passwordStatus.className = 'notice';
  passwordStatus.setAttribute('role', 'status');
  const passwordButton = document.createElement('button');
  passwordButton.className = 'button button-primary';
  passwordButton.type = 'submit';
  passwordButton.textContent = 'Update password';
  passwordForm.append(passwordHeading, password, confirm, passwordStatus, passwordButton);
  const appearance = document.createElement('section');
  appearance.className = 'appearance-setting';
  const appearanceHeading = document.createElement('h3');
  appearanceHeading.textContent = 'Appearance';
  const appearanceCopy = document.createElement('p');
  appearanceCopy.textContent = 'The theme follows your device preference until you choose a different one.';
  const appearanceButton = document.createElement('button');
  appearanceButton.id = 'profile-theme-toggle';
  appearanceButton.className = 'button button-secondary';
  appearanceButton.type = 'button';
  appearanceButton.addEventListener('click', toggleTheme);
  appearance.append(appearanceHeading, appearanceCopy, appearanceButton);
  profileLayout.append(photoPanel, fields, appearance, passwordForm);
  profileCard.body.append(profileLayout);
  state.profileCard = profileCard.card;
  state.routePages.get('student:profile').append(profileCard.card);
  byId('profile-photo-input').addEventListener('change', uploadProfilePhoto);
  byId('profile-password-form').addEventListener('submit', changeProfilePassword);
  setTheme(document.documentElement.dataset.theme);
}

function createNavigation(role) {
  const navigation = byId('app-navigation');
  navigation.replaceChildren();
  for (const item of navigationByRole[role] || []) {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = `?view=${encodeURIComponent(item.id)}`;
    link.dataset.route = item.id;
    const icon = document.createElement('i');
    icon.dataset.lucide = item.id === 'import-students' ? 'file-input' : item.id === 'performance' ? 'chart-no-axes-combined' : item.id === 'audit-log' ? 'scroll-text' : iconNameForRoute(item.id);
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = item.label;
    link.append(icon, label);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.dataset.badge = item.badge;
      badge.hidden = true;
      link.append(badge);
    }
    navigation.append(link);
  }
  renderLucideIcons();
}

function iconNameForRoute(route) {
  const icons = {
    dashboard: 'layout-dashboard',
    overview: 'layout-dashboard',
    classes: 'graduation-cap',
    assignments: 'clipboard-list',
    submissions: 'file-text',
    grades: 'clipboard-check',
    gradebook: 'clipboard-check',
    calendar: 'calendar-days',
    announcements: 'megaphone',
    notifications: 'bell',
    profile: 'user-round',
    users: 'users',
    directory: 'building-2',
    attendance: 'check'
  };
  return icons[route] || 'circle';
}

function toggleSidebar() {
  const isOpen = byId('app-sidebar').classList.toggle('is-open');
  byId('mobile-menu-toggle').setAttribute('aria-expanded', String(isOpen));
  byId('mobile-menu-toggle').setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  byId('sidebar-backdrop').hidden = !isOpen;
  document.body.classList.toggle('sidebar-open', isOpen);
  if (isOpen) byId('app-navigation').querySelector('a')?.focus();
}

function closeSidebar() {
  if (!byId('app-sidebar').classList.contains('is-open')) return;
  byId('app-sidebar').classList.remove('is-open');
  byId('mobile-menu-toggle').setAttribute('aria-expanded', 'false');
  byId('mobile-menu-toggle').setAttribute('aria-label', 'Open navigation');
  byId('sidebar-backdrop').hidden = true;
  document.body.classList.remove('sidebar-open');
  if (window.matchMedia('(max-width: 850px)').matches) byId('mobile-menu-toggle').focus();
}

async function navigateToRoute(route, options = {}) {
  const role = state.profile?.role;
  const routes = navigationByRole[role] || [];
  const selected = routes.find(item => item.id === route) || routes[0];
  if (!selected) return;
  state.currentRoute = selected.id;
  for (const page of state.routePages.values()) page.hidden = true;
  const page = state.routePages.get(`${role}:${selected.id}`);
  if (!page) throw new Error(`The ${selected.label} page is not available for this account.`);

  const notificationCenter = document.querySelector('.notification-center');
  if (selected.id === 'notifications' && notificationCenter) {
    page.append(notificationCenter);
    notificationCenter.hidden = false;
  }
  if (selected.id === 'profile' && state.profileCard) page.append(state.profileCard);
  if (role === 'teacher' && selected.id === 'gradebook') {
    page.append(document.querySelector('.teacher-list'));
  }
  if (role === 'teacher' && selected.id === 'submissions') {
    page.append(document.querySelector('.teacher-list'));
  }
  page.hidden = false;

  for (const link of byId('app-navigation').querySelectorAll('[data-route]')) {
    const active = link.dataset.route === selected.id;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  byId('role-label').textContent = role === 'admin' ? 'Administrator workspace' : role === 'teacher' ? 'Lecturer workspace' : 'Student workspace';
  const isDashboardRoute = selected.id === 'dashboard' || selected.id === 'overview';
  const name = state.profile?.full_name || state.profile?.display_name || 'there';
  byId('welcome-title').textContent = isDashboardRoute ? `Welcome back, ${name}` : selected.label;
  byId('welcome-copy').textContent = routeDescription(role, selected.id);
  byId('role-chip').textContent = role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Lecturer' : 'Student';
  closeSidebar();
  updateProfileFields();
  updateRouteBadges();
  renderRoleOverview();
  if (role === 'admin' && selected.id === 'classes') void loadAdminClasses();
  if (role === 'admin' && selected.id === 'audit-log') void loadAuditLog();
  if (options.updateHistory !== false || options.replaceHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', selected.id);
    if (options.replaceHistory) window.history.replaceState({ route: selected.id }, '', url);
    else window.history.pushState({ route: selected.id }, '', url);
  }
  renderLucideIcons();
}

function renderRoleOverview() {
  if (state.profile?.role === 'student') {
    renderStudentOverview();
    renderStudentClasses();
    renderStudentSubmissions();
    renderStudentCalendar();
  } else if (state.profile?.role === 'teacher') {
    renderTeacherOverview();
    renderTeacherPerformance();
  } else if (state.profile?.role === 'admin') {
    renderAdminOverview();
  }
}

function updateRouteBadges() {
  const counts = {
    notifications: state.notifications.filter(item => !item.read).length,
    submissions: state.profile?.role === 'student'
      ? [...state.studentSubmissions.values()].filter(item => item.status === 'submitted').length
      : state.teacherSubmissionCount,
    grades: [...state.studentGrades.values()].filter(item => item.released_at).length
  };
  for (const badge of byId('app-navigation').querySelectorAll('[data-badge]')) {
    const count = counts[badge.dataset.badge] || 0;
    badge.textContent = String(count);
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', `${count} ${badge.dataset.badge}`);
  }
}

function setSummaryValue(id, value) {
  const target = byId(id);
  if (target) target.textContent = String(value);
}

function renderStudentOverview() {
  const upcoming = state.studentAssignments.filter(item => {
    const dueAt = effectiveDueDate(item);
    return dueAt && new Date(dueAt) >= new Date() && !isClosed(item);
  });
  const submitted = [...state.studentSubmissions.values()].filter(item => item.status === 'submitted').length;
  const released = [...state.studentGrades.values()].filter(item => item.released_at).length;
  setSummaryValue('student-due-count', upcoming.length);
  setSummaryValue('student-submitted-count', submitted);
  setSummaryValue('student-released-count', released);
  const list = byId('student-dashboard-list');
  if (!list) return;
  list.replaceChildren();
  const next = upcoming.slice(0, 4);
  if (!next.length) {
    list.append(makeListMessage('No upcoming deadlines. Your assignments will appear here.'));
    return;
  }
  for (const assignment of next) {
    const item = document.createElement('article');
    item.className = 'route-list-item';
    const title = document.createElement('strong');
    title.textContent = assignment.title;
    const due = document.createElement('small');
    due.textContent = `Due ${formatDate(effectiveDueDate(assignment))}`;
    item.append(title, due);
    list.append(item);
  }
}

function renderStudentClasses() {
  const list = byId('student-class-list');
  if (!list) return;
  list.replaceChildren();
  if (!state.studentCourses.length) {
    list.append(makeListMessage('You have not joined a class yet.'));
    return;
  }
  for (const course of state.studentCourses) {
    const item = document.createElement('article');
    item.className = 'route-list-item';
    const title = document.createElement('strong');
    title.textContent = course.name;
    const detail = document.createElement('small');
    detail.textContent = 'Enrolled class';
    item.append(title, detail);
    list.append(item);
  }
}

function renderStudentSubmissions() {
  const list = byId('student-submissions-list');
  if (!list) return;
  list.replaceChildren();
  const entries = state.studentAssignments
    .map(assignment => ({ assignment, submission: state.studentSubmissions.get(assignment.id) }))
    .filter(entry => entry.submission)
    .sort((left, right) => new Date(right.submission.updated_at) - new Date(left.submission.updated_at));
  if (!entries.length) {
    list.append(makeListMessage('Submitted coursework will appear here.'));
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('article');
    item.className = 'route-list-item';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.assignment.title;
    const status = document.createElement('small');
    status.textContent = `${entry.submission.status === 'submitted' ? 'Submitted' : 'Draft'} · ${formatDate(entry.submission.updated_at)}`;
    details.append(title, status);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button button-secondary';
    open.textContent = 'View';
    open.addEventListener('click', () => {
      void navigateToRoute('assignments').then(() => switchStudentAssignment(entry.assignment, entry.submission));
    });
    item.append(details, open);
    list.append(item);
  }
}

function renderStudentCalendar() {
  const list = byId('student-calendar-list');
  if (!list) return;
  list.replaceChildren();
  const upcoming = state.studentAssignments
    .map(assignment => ({ assignment, dueAt: effectiveDueDate(assignment) }))
    .filter(entry => entry.dueAt && !isClosed(entry.assignment))
    .sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt));
  if (!upcoming.length) {
    list.append(makeListMessage('Upcoming assignment deadlines will appear here.'));
    return;
  }
  for (const entry of upcoming) {
    const item = document.createElement('article');
    item.className = 'route-list-item';
    const title = document.createElement('strong');
    title.textContent = entry.assignment.title;
    const due = document.createElement('small');
    due.textContent = `Due ${formatDate(entry.dueAt)}`;
    item.append(title, due);
    list.append(item);
  }
}

function renderTeacherOverview() {
  setSummaryValue('teacher-class-count', state.teacherCourses.length);
  setSummaryValue('teacher-assignment-count', state.teacherAssignments.length);
  setSummaryValue('teacher-needs-grading-count', state.teacherNeedsGradingCount);
}

function renderTeacherPerformance() {
  const list = byId('teacher-performance-list');
  if (!list) return;
  list.replaceChildren();
  const reviewed = state.teacherSubmissions.filter(item => item.grade?.released_at).length;
  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.textContent = `${reviewed} released grade${reviewed === 1 ? '' : 's'} in the selected assignment; ${state.teacherNeedsGradingCount} submission${state.teacherNeedsGradingCount === 1 ? '' : 's'} awaiting grading across your classes.`;
  list.append(summary);
}

function renderAdminOverview() {
  setSummaryValue('admin-account-count', state.adminUsers.length);
  setSummaryValue('admin-student-count', state.adminUsers.filter(item => item.role === 'student').length);
  setSummaryValue('admin-class-count', state.adminCourses.length);
}

function updateProfileFields() {
  const profile = state.profile;
  if (!profile) return;
  const name = profile.full_name || profile.display_name || 'Name not set';
  byId('profile-full-name').textContent = name;
  byId('profile-email').textContent = profile.email || '';
  byId('profile-role').textContent = profile.role === 'teacher' ? 'Lecturer' : profile.role === 'admin' ? 'Administrator' : 'Student';
  byId('profile-student-id').textContent = profile.student_id || 'Not provided';
  byId('sidebar-name').textContent = name;
  byId('sidebar-email').textContent = profile.email || '';
  byId('sidebar-role').textContent = profile.role === 'teacher' ? 'Lecturer workspace' : profile.role === 'admin' ? 'Administrator workspace' : 'Student workspace';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  for (const element of [byId('profile-avatar'), byId('sidebar-avatar')]) {
    if (!element) continue;
    element.replaceChildren();
    if (state.currentAvatarUrl) {
      const image = document.createElement('img');
      image.src = state.currentAvatarUrl;
      image.alt = '';
      element.append(image);
    } else {
      element.textContent = initials;
    }
  }
  if (state.currentAvatarPath !== (profile.photo_url || '')) void refreshProfileAvatar();
}

async function refreshProfileAvatar() {
  if (!state.profile?.photo_url || !supabase) {
    state.currentAvatarUrl = '';
    state.currentAvatarPath = '';
    return;
  }
  if (/^https?:\/\//i.test(state.profile.photo_url)) {
    state.currentAvatarUrl = state.profile.photo_url;
  } else {
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(state.profile.photo_url, 3600);
    if (error) {
      setNotice(byId('profile-photo-status'), `Could not load your profile photo: ${friendlyError(error)}`, 'error');
      return;
    }
    state.currentAvatarUrl = data.signedUrl;
  }
  state.currentAvatarPath = state.profile.photo_url;
  updateProfileFieldsWithoutRefreshingAvatar();
}

function updateProfileFieldsWithoutRefreshingAvatar() {
  const profile = state.profile;
  if (!profile) return;
  const name = profile.full_name || profile.display_name || 'Name not set';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  for (const element of [byId('profile-avatar'), byId('sidebar-avatar')]) {
    if (!element) continue;
    element.replaceChildren();
    if (state.currentAvatarUrl) {
      const image = document.createElement('img');
      image.src = state.currentAvatarUrl;
      image.alt = '';
      element.append(image);
    } else {
      element.textContent = initials;
    }
  }
}

async function uploadProfilePhoto(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !supabase || !state.user || !state.profile) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    setNotice(byId('profile-photo-status'), 'Choose a JPEG, PNG, or WebP image.', 'error');
    return;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    setNotice(byId('profile-photo-status'), 'Profile photos must be 5 MB or smaller.', 'error');
    return;
  }
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${state.user.id}/${crypto.randomUUID()}.${extension}`;
  const button = byId('profile-photo-input').closest('label');
  button.classList.add('is-busy');
  setNotice(byId('profile-photo-status'), 'Uploading your photo…', '');
  try {
    const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw uploadError;
    const previousPath = state.profile.photo_url;
    const { data: updatedProfile, error: profileError } = await supabase.from('profiles')
      .update({ photo_url: path })
      .eq('id', state.user.id)
      .select('photo_url')
      .single();
    if (profileError || updatedProfile?.photo_url !== path) {
      const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      const saveError = profileError || new Error('The profile photo could not be saved to your account.');
      if (cleanupError) throw new Error(`Could not save your profile photo: ${friendlyError(saveError)}. The uploaded file also could not be removed: ${friendlyError(cleanupError)}`);
      throw saveError;
    }
    state.profile.photo_url = path;
    state.currentAvatarUrl = '';
    state.currentAvatarPath = '';
    await refreshProfileAvatar();
    if (previousPath && !/^https?:\/\//i.test(previousPath) && previousPath !== path) {
      const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
      if (removeError) setNotice(byId('profile-photo-status'), `Photo updated, but the previous image could not be removed: ${friendlyError(removeError)}`, 'error');
    }
    if (!byId('profile-photo-status').dataset.state) {
      setNotice(byId('profile-photo-status'), 'Profile photo updated.', 'success');
    }
  } catch (error) {
    setNotice(byId('profile-photo-status'), `Could not update your photo: ${friendlyError(error)}`, 'error');
  } finally {
    button.classList.remove('is-busy');
  }
}

async function changeProfilePassword(event) {
  event.preventDefault();
  if (!supabase || !state.user) return;
  const password = byId('profile-new-password').value;
  if (password !== byId('profile-confirm-password').value) {
    setNotice(byId('profile-password-status'), 'The passwords do not match.', 'error');
    return;
  }
  const submit = byId('profile-password-form').querySelector('button[type="submit"]');
  submit.disabled = true;
  setNotice(byId('profile-password-status'), 'Updating your password…', '');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    byId('profile-password-form').reset();
    setNotice(byId('profile-password-status'), 'Password updated.', 'success');
  } catch (error) {
    setNotice(byId('profile-password-status'), `Could not update your password: ${friendlyError(error)}`, 'error');
  } finally {
    submit.disabled = false;
  }
}

async function loadAdminClasses() {
  if (!supabase || state.profile?.role !== 'admin') return;
  const list = byId('admin-class-list');
  const status = byId('admin-class-status');
  list.replaceChildren(makeListMessage('Loading classes…'));
  setNotice(status, '', '');
  try {
    const { data, error } = await supabase.from('courses')
      .select('id, name, created_at, archived_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.adminCourses = data || [];
    list.replaceChildren();
    if (!state.adminCourses.length) {
      list.append(makeListMessage('No classes have been created yet.'));
    }
    for (const course of state.adminCourses) {
      const item = document.createElement('article');
      item.className = 'route-list-item';
      const title = document.createElement('strong');
      title.textContent = course.name;
      const meta = document.createElement('small');
      meta.textContent = `${course.archived_at ? 'Archived' : 'Active'} · Created ${formatDate(course.created_at)}`;
      item.append(title, meta);
      list.append(item);
    }
    renderAdminOverview();
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load classes: ${friendlyError(error)}`));
  }
}

async function loadAuditLog() {
  if (!supabase || state.profile?.role !== 'admin') return;
  const list = byId('audit-list');
  list.replaceChildren(makeListMessage('Loading recent activity…'));
  setNotice(byId('audit-status'), '', '');
  try {
    const { data, error } = await supabase.from('audit_log')
      .select('id, actor_id, action, table_name, record_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    state.auditRows = data || [];
    list.replaceChildren();
    if (!state.auditRows.length) {
      list.append(makeListMessage('No audit activity has been recorded yet.'));
      return;
    }
    for (const entry of state.auditRows) {
      const item = document.createElement('article');
      item.className = 'route-list-item';
      const title = document.createElement('strong');
      title.textContent = `${entry.action} · ${entry.table_name}`;
      const meta = document.createElement('small');
      meta.textContent = `${entry.actor_id ? `Account ${entry.actor_id}` : 'System'} · Record ${entry.record_id} · ${formatDate(entry.created_at)}`;
      item.append(title, meta);
      list.append(item);
    }
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load audit activity: ${friendlyError(error)}`));
    setNotice(byId('audit-status'), friendlyError(error), 'error');
  }
}

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
byId('admin-create-user-form').addEventListener('submit', createManagedUser);
byId('new-user-role').addEventListener('change', () => {
  const isStudent = byId('new-user-role').value === 'student';
  byId('new-user-student-id-field').hidden = !isStudent;
  byId('new-user-student-id').required = isStudent;
});
byId('assignment-group-select').addEventListener('change', loadSelectedTeacherGroup);
byId('assignment-group-form').addEventListener('submit', saveTeacherGroup);
byId('assignment-group-list').addEventListener('click', event => {
  const button = event.target.closest('[data-edit-group-id]');
  if (!button) return;
  byId('assignment-group-select').value = button.dataset.editGroupId;
  loadSelectedTeacherGroup();
});
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
    .select('id, email, display_name, full_name, student_id, photo_url, role, active, must_change_password')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(`Could not load your account profile: ${friendlyError(error)}`);
  if (profile?.role === 'pending') {
    throw new Error('Your account is waiting for an administrator to assign a role. Contact your university administrator.');
  }
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
    byId('auth-shell').hidden = false;
    byId('account-bar').hidden = true;
    showAuthCard('forced-password-form');
    setNotice(byId('forced-password-status'), 'For your security, change the temporary password before continuing.', '');
    return;
  }
  await showWorkspace();
}

async function showWorkspace() {
  authView.hidden = true;
  byId('auth-shell').hidden = true;
  dashboardView.hidden = false;
  byId('account-bar').hidden = false;
  const role = state.profile?.role;
  if (!navigationByRole[role]) throw new Error('Your account role cannot open a workspace.');
  byId('account-label').textContent = state.profile?.full_name || state.profile?.display_name || state.profile?.email || '';
  createNavigation(role);
  updateProfileFields();
  await loadWorkspaceData();
  await loadNotifications();
  const requestedRoute = new URLSearchParams(window.location.search).get('view') || navigationByRole[role][0].id;
  const allowedRoute = navigationByRole[role].some(item => item.id === requestedRoute);
  await navigateToRoute(requestedRoute, { updateHistory: false, replaceHistory: !allowedRoute });
  subscribeToChanges();
}

async function loadWorkspaceData() {
  if (state.profile?.role === 'admin') {
    await Promise.all([loadAdminUsers(), loadAcademicDirectory(), loadAdminClasses()]);
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
    updateRouteBadges();
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load notifications: ${friendlyError(error)}`));
  }
}

function renderNotifications() {
  const list = byId('notification-list');
  const unreadCount = state.notifications.filter(item => !item.read).length;
  byId('notification-count').textContent = String(unreadCount);
  updateRouteBadges();
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

async function createManagedUser(event) {
  event.preventDefault();
  if (!state.user || state.profile?.role !== 'admin') return;
  const form = event.currentTarget;
  const role = byId('new-user-role').value;
  const temporaryPassword = byId('new-user-temporary-password').value;
  if (temporaryPassword !== byId('new-user-confirm-password').value) {
    setNotice(byId('admin-create-user-status'), 'The temporary passwords do not match.', 'error');
    return;
  }
  if (role === 'student' && !byId('new-user-student-id').value.trim()) {
    setNotice(byId('admin-create-user-status'), 'Enter the student ID.', 'error');
    return;
  }

  const button = byId('create-admin-user');
  button.disabled = true;
  setNotice(byId('admin-create-user-status'), 'Creating account…', '');
  try {
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: byId('new-user-email').value.trim(),
        full_name: byId('new-user-full-name').value.trim(),
        role,
        student_id: byId('new-user-student-id').value.trim(),
        temporary_password: temporaryPassword
      }
    });
    if (error) {
      const response = error.context instanceof Response
        ? await error.context.clone().json().catch(() => null)
        : null;
      throw new Error(response?.error || friendlyError(error));
    }
    if (!data?.user?.id) throw new Error('The account service returned an invalid response.');
    form.reset();
    byId('new-user-role').value = 'student';
    byId('new-user-student-id-field').hidden = false;
    byId('new-user-student-id').required = true;
    setNotice(
      byId('admin-create-user-status'),
      `Created ${data.user.full_name} (${data.user.email}) as ${data.user.role}. Give them the temporary password securely; they must change it at first sign-in.`,
      'success'
    );
    await loadAdminUsers();
  } catch (error) {
    setNotice(byId('admin-create-user-status'), `Could not create account: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadAdminUsers() {
  if (!state.user || state.profile?.role !== 'admin') return;
  const list = byId('admin-user-list');
  list.replaceChildren(makeListMessage('Loading user accounts…'));
  setNotice(byId('admin-status'), '', '');
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, email, full_name, display_name, student_id, role, active, must_change_password, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.adminUsers = data || [];
    list.replaceChildren();
    if (!data?.length) {
      list.append(makeListMessage('No accounts found.'));
      renderAdminOverview();
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
      for (const optionValue of ['pending', 'student', 'teacher', 'admin']) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue === 'pending'
          ? 'Unassigned'
          : optionValue === 'teacher' ? 'Lecturer' : optionValue === 'admin' ? 'Admin' : 'Student';
        option.selected = profile.role === optionValue;
        role.append(option);
      }
      const studentId = document.createElement('input');
      studentId.type = 'text';
      studentId.maxLength = 80;
      studentId.value = profile.student_id || '';
      studentId.placeholder = 'Required to assign student role';
      studentId.setAttribute('aria-label', `Student ID for ${profile.email}`);
      studentId.hidden = !['pending', 'student'].includes(role.value);
      studentId.addEventListener('input', () => { button.dataset.studentId = studentId.value.trim(); });
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
      button.dataset.studentId = studentId.value.trim();
      button.dataset.originalStudentId = profile.student_id || '';
      button.textContent = 'Save account settings';
      role.addEventListener('change', () => {
        button.dataset.role = role.value;
        studentId.hidden = !['pending', 'student'].includes(role.value);
      });
      forceInput.addEventListener('change', () => { button.dataset.forcePassword = String(forceInput.checked); });
      activeInput.addEventListener('change', () => { button.dataset.active = String(activeInput.checked); });
      if (profile.id === state.user.id) {
        role.disabled = true;
        forceInput.disabled = true;
        activeInput.disabled = true;
        button.disabled = true;
        button.title = 'You cannot change your own administrator account.';
      }
      controls.append(role, studentId, activeAccess, forcePassword, button);
      card.append(details, controls);
      list.append(card);
    }
    renderAdminOverview();
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load user accounts: ${friendlyError(error)}`));
  }
}

async function updateManagedUser(button) {
  const userId = button.dataset.adminUserId;
  const nextActive = button.dataset.active === 'true';
  const role = button.dataset.role;
  const forcePassword = button.dataset.forcePassword === 'true';
  const studentId = button.dataset.studentId || '';
  const originalStudentId = button.dataset.originalStudentId || '';
  if (userId === state.user?.id && (!nextActive || role !== 'admin')) {
    setNotice(byId('admin-status'), 'You cannot deactivate or remove your own administrator access.', 'error');
    return;
  }
  if (role === 'student' && !studentId) {
    setNotice(byId('admin-status'), 'Enter a unique student ID before assigning the student role.', 'error');
    return;
  }
  button.disabled = true;
  setNotice(byId('admin-status'), 'Saving account settings…', '');
  try {
    if (role === 'student' && studentId && studentId !== originalStudentId) {
      const { error: studentIdError } = await supabase.rpc('admin_set_student_id', {
        target_user_id: userId,
        new_student_id: studentId
      });
      if (studentIdError) throw studentIdError;
    }
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
  const previousGroup = state.selectedStudentGroup;
  const previousGrade = previousSubmission ? state.studentGrades.get(previousSubmission.id) : null;
  list.replaceChildren(makeListMessage('Loading assignments…'));

  try {
    const [
      assignmentResult,
      submissionResult,
      courseResult,
      extensionResult,
      gradeResult,
      membershipResult
    ] = await Promise.all([
      supabase.from('assignments')
        .select('id, course_id, title, instructions, due_at, due_date, allow_late, late_penalty_percent, max_marks, is_group_assignment, allowed_file_types, max_file_size_bytes, created_at')
        .eq('published', true),
      supabase.from('submissions')
        .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
        .eq('student_id', state.user.id),
      supabase.from('courses').select('id, name').order('name'),
      supabase.from('extensions')
        .select('id, assignment_id, requested_due_at, extended_due_at, reason, status, granted_by')
        .eq('student_id', state.user.id),
      supabase.from('grades')
        .select('id, submission_id, mark, final_mark, feedback, released_at, updated_at'),
      supabase.from('group_members')
        .select('group_id, assignment_id')
        .eq('student_id', state.user.id)
        .not('assignment_id', 'is', null)
    ]);
    if (assignmentResult.error) throw assignmentResult.error;
    if (submissionResult.error) throw submissionResult.error;
    if (courseResult.error) throw courseResult.error;
    if (extensionResult.error) throw extensionResult.error;
    if (gradeResult.error) throw gradeResult.error;
    if (membershipResult.error) throw membershipResult.error;
    const ownMemberships = membershipResult.data || [];
    const groupIds = [...new Set(ownMemberships.map(item => item.group_id))];
    let groups = [];
    let groupSubmissions = [];
    if (groupIds.length) {
      const [{ data: groupData, error: groupError }, { data: groupSubmissionData, error: groupSubmissionError }] = await Promise.all([
        supabase.from('groups')
          .select('id, assignment_id, name, leader_id')
          .in('id', groupIds),
        supabase.from('submissions')
          .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
          .in('group_id', groupIds)
      ]);
      if (groupError) throw groupError;
      if (groupSubmissionError) throw groupSubmissionError;
      groups = groupData || [];
      groupSubmissions = groupSubmissionData || [];
    }
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
    state.studentGroups = new Map(groups.map(group => [group.assignment_id, group]));
    state.studentSubmissions = new Map(
      [...(submissionResult.data || []), ...groupSubmissions].map(item => [item.assignment_id, item])
    );
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
    renderRoleOverview();
    updateRouteBadges();

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
        const group = state.studentGroups.get(refreshed.id);
        const groupChanged = group?.id !== previousGroup?.id
          || group?.name !== previousGroup?.name
          || group?.leader_id !== previousGroup?.leader_id;
        const gradeChanged = grade?.id !== previousGrade?.id
          || grade?.updated_at !== previousGrade?.updated_at
          || grade?.released_at !== previousGrade?.released_at;
        if (submissionChanged || groupChanged || gradeChanged
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
    && !window.confirm('Discard your unsaved edits?')) return;
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
  state.selectedStudentGroup = assignment.is_group_assignment
    ? state.studentGroups.get(assignment.id) || null
    : null;
  state.submission = null;
  byId('student-response').value = '';
  byId('student-file-list').replaceChildren();
  byId('student-empty').hidden = true;
  byId('student-detail').hidden = false;
  byId('student-assignment-title').textContent = assignment.title;
  const groupStatus = byId('student-group-status');
  groupStatus.hidden = !assignment.is_group_assignment;
  if (assignment.is_group_assignment) {
    groupStatus.textContent = state.selectedStudentGroup
      ? `Group: ${state.selectedStudentGroup.name}. ${
        state.selectedStudentGroup.leader_id === state.user.id
          ? 'You are the designated group leader and are responsible for submitting once.'
          : 'Only your designated group leader can submit.'
      }`
      : 'Your lecturer has not assigned you to a group yet. Contact them before working on this assignment.';
  }
  const dueAt = effectiveDueDate(assignment);
  byId('student-due').textContent = dueAt
    ? `Due ${formatDate(dueAt)}${usesExtensionDueDate(assignment) ? ' (extension)' : ''} · ${formatCountdown(dueAt)}`
    : 'No due date';
  byId('student-instructions').textContent = assignment.instructions || 'No additional instructions were provided.';
  renderStudentExtensionRequest(assignment);

  if (!submission && (!assignment.is_group_assignment || state.selectedStudentGroup)) {
    const { data, error } = await supabase.from('submissions')
      .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
      .eq('assignment_id', assignment.id)
      .eq(assignment.is_group_assignment ? 'group_id' : 'student_id',
        assignment.is_group_assignment ? state.selectedStudentGroup.id : state.user.id)
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
  if (!state.selectedAssignment || !canEditSubmission() || !state.user) return null;
  clearTimeout(state.saveTimer);
  setDraftStatus('Saving…', '');
  try {
    if (!state.submission) {
      const { data, error } = await supabase.from('submissions')
        .insert({
          assignment_id: state.selectedAssignment.id,
          student_id: state.user.id,
          group_id: state.selectedAssignment.is_group_assignment
            ? state.selectedStudentGroup?.id
            : null,
          response: byId('student-response').value,
          status: 'draft'
        })
        .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
        .single();
      if (error) throw error;
      state.submission = data;
    } else {
      const { data, error } = await supabase.from('submissions')
        .update({ response: byId('student-response').value })
        .eq('id', state.submission.id)
        .eq('status', 'draft')
        .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
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
    const objectPath = `${assignment.id}/${submission.student_id}/${submission.id}/${crypto.randomUUID()}-${safeName}`;
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
  const submission = state.submission || await saveDraft();
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
    .eq('status', 'draft')
    .select('id, assignment_id, group_id, student_id, response, status, is_late, version_number, submitted_at, updated_at')
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
      allow_resubmission: false,
      is_group_assignment: byId('assignment-group-work').checked,
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
    renderTeacherOverview();
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
      name.append(makeInitialAvatar(fullName.textContent), fullName);
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
      .select('id, course_id, title, instructions, due_at, due_date, max_marks, late_penalty_percent, is_group_assignment, created_at')
      .eq('teacher_id', state.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.teacherAssignments = data || [];
    renderTeacherAssignments();
    await loadTeacherSubmissionSummary();
    renderTeacherOverview();
  } catch (error) {
    list.replaceChildren(makeListMessage(friendlyError(error)));
  }
}

async function loadTeacherSubmissionSummary() {
  if (!supabase || state.profile?.role !== 'teacher') return;
  try {
    const assignmentIds = state.teacherAssignments.map(item => item.id);
    if (!assignmentIds.length) {
      state.teacherSubmissionCount = 0;
      state.teacherNeedsGradingCount = 0;
      setNotice(byId('teacher-summary-status'), '', '');
      updateRouteBadges();
      renderTeacherOverview();
      return;
    }
    const { data: submissions, error: submissionError } = await supabase.from('submissions')
      .select('id')
      .in('assignment_id', assignmentIds)
      .eq('status', 'submitted');
    if (submissionError) throw submissionError;
    const submissionIds = (submissions || []).map(item => item.id);
    state.teacherSubmissionCount = submissionIds.length;
    if (!submissionIds.length) {
      state.teacherNeedsGradingCount = 0;
      setNotice(byId('teacher-summary-status'), '', '');
      updateRouteBadges();
      renderTeacherOverview();
      return;
    }
    const { data: grades, error: gradeError } = await supabase.from('grades')
      .select('submission_id, released_at')
      .in('submission_id', submissionIds);
    if (gradeError) throw gradeError;
    const releasedIds = new Set((grades || []).filter(item => item.released_at).map(item => item.submission_id));
    state.teacherNeedsGradingCount = submissionIds.filter(id => !releasedIds.has(id)).length;
    setNotice(byId('teacher-summary-status'), '', '');
    updateRouteBadges();
    renderTeacherOverview();
  } catch (error) {
    setNotice(byId('teacher-summary-status'), `Could not update grading totals: ${friendlyError(error)}`, 'error');
  }
}

function renderTeacherAssignments() {
  const list = byId('teacher-assignment-list');
  list.replaceChildren();
  if (!state.teacherAssignments.length) {
    list.append(makeListMessage('Publish your first assignment to get started.'));
    byId('teacher-submissions').replaceChildren();
    byId('assignment-groups').hidden = true;
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
    due.textContent = `${assignment.is_group_assignment ? 'Group assignment · ' : ''}${course?.name || 'Class'} · ${dueAt ? `Due ${formatDate(dueAt)}` : 'No due date'}`;
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
  state.teacherSubmissions = [];
  updateRouteBadges();
  byId('teacher-discussion').hidden = false;
  list.replaceChildren(makeListMessage('Loading submissions…'));
  await loadTeacherGroups(assignment);
  await loadAssignmentDiscussion(assignment, 'teacher');
  await loadTeacherExtensionRequests(assignment);
  try {
    const { data: submissions, error } = await supabase.from('submissions')
      .select('id, student_id, group_id, response, status, is_late, version_number, submitted_at, updated_at')
      .eq('assignment_id', assignment.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    list.replaceChildren();
    if (!submissions?.length) {
      state.teacherSubmissions = [];
      list.append(makeListMessage('No students have submitted this assignment yet.'));
      renderTeacherOverview();
      renderTeacherPerformance();
      updateRouteBadges();
      return;
    }
    const submissionIds = submissions.map(item => item.id);
    const { data: grades, error: gradeError } = await supabase.from('grades')
      .select('id, submission_id, mark, final_mark, feedback, released_at')
      .in('submission_id', submissionIds);
    if (gradeError) throw gradeError;
    const gradeBySubmission = new Map((grades || []).map(grade => [grade.submission_id, grade]));
    state.teacherSubmissions = submissions.map(submission => ({
      ...submission,
      grade: gradeBySubmission.get(submission.id) || null
    }));
    await loadTeacherSubmissionSummary();
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
    const submissionGroupIds = [...new Set(submissions.map(item => item.group_id).filter(Boolean))];
    let groupData = [];
    let groupMemberData = [];
    if (submissionGroupIds.length) {
      const [{ data: groups, error: groupsError }, { data: members, error: membersError }] = await Promise.all([
        supabase.from('groups').select('id, name, leader_id').in('id', submissionGroupIds),
        supabase.from('group_members').select('group_id, student_id').in('group_id', submissionGroupIds)
      ]);
      if (groupsError) throw groupsError;
      if (membersError) throw membersError;
      groupData = groups || [];
      groupMemberData = members || [];
    }
    const ids = [...new Set([
      ...submissions.map(item => item.student_id),
      ...groupMemberData.map(item => item.student_id)
    ])];
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('id, display_name, full_name, email, student_id')
      .in('id', ids);
    if (profileError) throw profileError;
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
    const groupById = new Map(groupData.map(group => [group.id, group]));
    const membersByGroup = new Map();
    for (const member of groupMemberData) {
      const members = membersByGroup.get(member.group_id) || [];
      const profile = profileById.get(member.student_id);
      if (profile) members.push(profile);
      membersByGroup.set(member.group_id, members);
    }
    for (const submission of submissions) {
      list.append(await renderSubmissionCard(
        assignment,
        submission,
        profileById.get(submission.student_id),
        gradeBySubmission.get(submission.id),
        rubricCriteria || [],
        rubricScores.filter(score => score.grade_id === gradeBySubmission.get(submission.id)?.id),
        groupById.get(submission.group_id),
        membersByGroup.get(submission.group_id) || []
      ));
    }
    renderTeacherOverview();
    renderTeacherPerformance();
    updateRouteBadges();
  } catch (error) {
    list.replaceChildren(makeListMessage(`Could not load submissions: ${friendlyError(error)}`));
  }
}

async function loadTeacherGroups(assignment) {
  const section = byId('assignment-groups');
  section.hidden = !assignment.is_group_assignment;
  state.teacherGroups = [];
  byId('assignment-group-list').replaceChildren();
  if (!assignment.is_group_assignment) return;
  setNotice(byId('assignment-group-status'), '', '');
  try {
    const { data: groups, error: groupsError } = await supabase.from('groups')
      .select('id, name, leader_id')
      .eq('assignment_id', assignment.id)
      .order('name');
    if (groupsError) throw groupsError;
    const groupIds = (groups || []).map(group => group.id);
    let memberships = [];
    if (groupIds.length) {
      const { data, error } = await supabase.from('group_members')
        .select('group_id, student_id')
        .in('group_id', groupIds);
      if (error) throw error;
      memberships = data || [];
    }
    const studentIds = [...new Set([
      ...(groups || []).map(group => group.leader_id),
      ...memberships.map(member => member.student_id)
    ])];
    let profiles = [];
    if (studentIds.length) {
      const { data, error } = await supabase.from('profiles')
        .select('id, student_id, full_name, display_name')
        .in('id', studentIds);
      if (error) throw error;
      profiles = data || [];
    }
    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const membersByGroup = new Map();
    for (const member of memberships) {
      const values = membersByGroup.get(member.group_id) || [];
      const profile = profileById.get(member.student_id);
      if (profile) values.push(profile);
      membersByGroup.set(member.group_id, values);
    }
    state.teacherGroups = (groups || []).map(group => ({
      ...group,
      leader: profileById.get(group.leader_id) || null,
      members: membersByGroup.get(group.id) || []
    }));
    renderTeacherGroups();
  } catch (error) {
    setNotice(byId('assignment-group-status'), `Could not load assignment groups: ${friendlyError(error)}`, 'error');
    byId('assignment-group-list').replaceChildren(makeListMessage('Group management is unavailable until the database migration is applied.'));
  }
}

function renderTeacherGroups() {
  const select = byId('assignment-group-select');
  const selectedGroupId = select.value;
  select.replaceChildren();
  appendSelectOption(select, '', 'Create a new group');
  for (const group of state.teacherGroups) {
    appendSelectOption(select, group.id, group.name);
  }
  select.value = state.teacherGroups.some(group => group.id === selectedGroupId) ? selectedGroupId : '';
  loadSelectedTeacherGroup();

  const list = byId('assignment-group-list');
  list.replaceChildren();
  if (!state.teacherGroups.length) {
    list.append(makeListMessage('No groups yet. Add a group and assign enrolled students by student ID.'));
    return;
  }
  for (const group of state.teacherGroups) {
    const item = document.createElement('article');
    item.className = 'assignment-group-item';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = group.name;
    const leader = document.createElement('small');
    leader.textContent = `Leader ID: ${group.leader?.student_id || 'Missing'}`;
    const members = document.createElement('small');
    members.textContent = `${group.members.length} member${group.members.length === 1 ? '' : 's'} · ${group.members.map(member => member.student_id).filter(Boolean).join(', ')}`;
    details.append(name, leader, members);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button button-secondary';
    edit.dataset.editGroupId = group.id;
    edit.textContent = 'Edit group';
    item.append(details, edit);
    list.append(item);
  }
}

function loadSelectedTeacherGroup() {
  const group = state.teacherGroups.find(item => item.id === byId('assignment-group-select').value);
  byId('assignment-group-name').value = group?.name || '';
  byId('assignment-group-leader-id').value = group?.leader?.student_id || '';
  byId('assignment-group-member-ids').value = group?.members
    .map(member => member.student_id)
    .filter(Boolean)
    .join('\n') || '';
  setNotice(byId('assignment-group-status'), '', '');
}

async function saveTeacherGroup(event) {
  event.preventDefault();
  const assignment = state.teacherAssignments.find(item => item.id === state.selectedAssignment?.id);
  if (!assignment?.is_group_assignment || state.profile?.role !== 'teacher') return;
  const name = byId('assignment-group-name').value.trim();
  const leaderStudentId = byId('assignment-group-leader-id').value.trim();
  const memberStudentIds = byId('assignment-group-member-ids').value
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
  if (!name || !leaderStudentId) {
    setNotice(byId('assignment-group-status'), 'Enter a group name and the group leader’s student ID.', 'error');
    return;
  }
  const button = byId('save-assignment-group');
  button.disabled = true;
  setNotice(byId('assignment-group-status'), 'Saving group…', '');
  try {
    const { data: savedGroupId, error } = await supabase.rpc('manage_assignment_group', {
      target_assignment_id: assignment.id,
      target_group_id: byId('assignment-group-select').value || null,
      requested_name: name,
      requested_leader_student_id: leaderStudentId,
      requested_member_student_ids: memberStudentIds
    });
    if (error) throw error;
    setNotice(byId('assignment-group-status'), 'Group and membership saved.', 'success');
    await loadTeacherGroups(assignment);
    byId('assignment-group-select').value = savedGroupId;
    loadSelectedTeacherGroup();
    setNotice(byId('assignment-group-status'), 'Group and membership saved.', 'success');
  } catch (error) {
    setNotice(byId('assignment-group-status'), `Could not save group: ${friendlyError(error)}`, 'error');
  } finally {
    button.disabled = false;
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

async function renderSubmissionCard(
  assignment,
  submission,
  profile,
  grade,
  rubricCriteria = [],
  rubricScores = [],
  group = null,
  groupMembers = []
) {
  const card = document.createElement('article');
  card.className = 'submission-card';
  const student = document.createElement('div');
  student.className = 'submission-student';
  const name = document.createElement('h3');
  name.textContent = profile?.display_name || profile?.email || 'Student';
  student.append(makeInitialAvatar(name.textContent), name);
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
  card.append(student, meta, response);
  if (group) {
    const groupDetails = document.createElement('p');
    groupDetails.className = 'submission-group-details';
    const leader = groupMembers.find(member => member.id === group.leader_id);
    groupDetails.textContent = `Group: ${group.name} · Leader ID: ${leader?.student_id || 'Unknown'} · Members: ${
      groupMembers.map(member => member.student_id).filter(Boolean).join(', ') || 'No IDs available'
    }`;
    card.append(groupDetails);
  }

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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, payload => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher') {
        const assignmentId = payload.new?.assignment_id || payload.old?.assignment_id;
        if (assignmentId === state.selectedAssignment?.id) {
          void loadTeacherGroups(state.selectedAssignment);
        }
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, payload => {
      if (state.profile?.role === 'student') void loadStudentAssignments();
      if (state.profile?.role === 'teacher' && payload.new?.assignment_id === state.selectedAssignment?.id) {
        void loadTeacherGroups(state.selectedAssignment);
      }
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
  state.studentGroups = new Map();
  state.studentGrades = new Map();
  state.studentRubricScores = new Map();
  state.studentExtensions = new Map();
  state.studentExtensionRequests = new Map();
  state.submissionHistory = [];
  state.studentCourses = [];
  state.teacherCourses = [];
  state.teacherAssignments = [];
  state.teacherSubmissions = [];
  state.teacherGroups = [];
  state.teacherSubmissionCount = 0;
  state.teacherNeedsGradingCount = 0;
  state.adminUsers = [];
  state.adminCourses = [];
  state.auditRows = [];
  state.currentAvatarUrl = '';
  state.currentAvatarPath = '';
  byId('teacher-discussion').hidden = true;
  state.notifications = [];
  state.currentRoute = '';
  closeSidebar();
  state.selectedAssignment = null;
  state.selectedStudentGroup = null;
  state.submission = null;
  state.recoveringPassword = false;
  dashboardView.hidden = true;
  byId('auth-shell').hidden = false;
  authView.hidden = false;
  byId('account-bar').hidden = true;
  byId('student-assignment-list').replaceChildren();
  byId('teacher-assignment-list').replaceChildren();
  byId('teacher-submissions').replaceChildren();
  byId('assignment-groups').hidden = true;
  byId('student-group-status').hidden = true;
  byId('student-detail').hidden = true;
  byId('student-empty').hidden = false;
  authForm.reset();
  showAuthCard('auth-form');
  setNotice(authStatus, '', '');
  setBusy(false);
}

function showWorkspaceError(error) {
  dashboardView.hidden = true;
  byId('auth-shell').hidden = false;
  authView.hidden = false;
  showAuthCard('auth-form');
  setNotice(authStatus, friendlyError(error), 'error');
}

function showAuthCard(formId) {
  byId('auth-shell').hidden = false;
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

function makeInitialAvatar(name) {
  const avatar = document.createElement('span');
  avatar.className = 'avatar name-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  return avatar;
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
  if (!state.selectedAssignment || isClosed(state.selectedAssignment) || isSubmitted()) return false;
  if (state.selectedAssignment.is_group_assignment) {
    return state.selectedStudentGroup?.leader_id === state.user?.id;
  }
  return true;
}

function updateStudentSubmissionControls() {
  if (!state.selectedAssignment) return;
  const assignment = state.selectedAssignment;
  const submitted = isSubmitted();
  const closed = isClosed(assignment);
  const hasGroup = !assignment.is_group_assignment || Boolean(state.selectedStudentGroup);
  const isLeader = !assignment.is_group_assignment
    || state.selectedStudentGroup?.leader_id === state.user?.id;
  const locked = closed || submitted || !hasGroup || !isLeader;
  byId('student-response').disabled = locked;
  byId('student-files').disabled = locked;
  byId('attachment-picker').classList.toggle('disabled', locked);
  byId('submit-assignment').disabled = locked;
  byId('submit-assignment').textContent = submitted
    ? 'Submitted'
    : closed ? 'Submissions closed'
      : !hasGroup ? 'No group assigned'
        : !isLeader ? 'Group leader submits' : 'Submit assignment';
  byId('submit-help').textContent = submitted
    ? 'This submission is final and locked.'
    : closed ? 'Submissions are closed for this assignment.'
      : !hasGroup ? 'Ask your lecturer to add you to an assignment group.'
        : !isLeader ? 'Only the designated group leader can edit and submit this response.'
          : assignment.is_group_assignment
            ? 'The group leader can submit one final response for the group.'
            : 'Submitting saves a final response and receipt.';
}

function getAssignmentStatus(assignment, submission, grade) {
  if (assignment.is_group_assignment && !state.studentGroups.has(assignment.id)) return 'No group assigned';
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
