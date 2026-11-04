begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  full_name text not null default '',
  student_id text,
  photo_url text,
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists student_id text;
alter table public.profiles add column if not exists photo_url text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));
update public.profiles set full_name = display_name where full_name = '';
create unique index if not exists profiles_student_id_unique_idx
  on public.profiles (student_id) where student_id is not null;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  join_code text not null unique check (char_length(join_code) = 10),
  created_at timestamptz not null default now()
);

create table if not exists public.course_enrollments (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  due_at timestamptz,
  due_date timestamptz,
  allow_late boolean not null default false,
  late_penalty_percent numeric(5,2) check (late_penalty_percent between 0 and 100),
  max_marks numeric(10,2) not null default 100 check (max_marks > 0),
  allow_resubmission boolean not null default false,
  allowed_file_types text[] not null default '{}',
  max_file_size_bytes bigint not null default 10485760 check (max_file_size_bytes between 1 and 104857600),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  response text not null default '' check (char_length(response) <= 100000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  is_late boolean not null default false,
  version_number integer not null default 1 check (version_number > 0),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  academic_year integer not null check (academic_year between 2000 and 2200),
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  unique (name, academic_year),
  check (starts_at is null or ends_at is null or ends_at >= starts_at)
);

create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  max_points numeric(10,2) not null default 100 check (max_points > 0),
  weight_percent numeric(5,2) not null check (weight_percent between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  response text not null default '',
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete restrict,
  unique (submission_id, version_number)
);

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  version_id uuid references public.submission_versions (id) on delete set null,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  file_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  grader_id uuid not null references public.profiles (id) on delete restrict,
  mark numeric(10,2) not null check (mark >= 0),
  final_mark numeric(10,2) not null default 0 check (final_mark >= 0),
  feedback text not null default '',
  released_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_scores (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades (id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria (id) on delete cascade,
  score numeric(10,2) not null check (score >= 0),
  feedback text not null default '',
  unique (grade_id, criterion_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table if not exists public.extensions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  requested_due_at timestamptz,
  extended_due_at timestamptz,
  reason text not null default '',
  status text not null default 'requested' check (status in ('requested', 'approved', 'denied')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

alter table public.extensions
  drop constraint if exists extensions_decision_fields_check;

alter table public.extensions
  add constraint extensions_decision_fields_check
  check (
    (status = 'requested' and granted_by is null and extended_due_at is null)
    or (status = 'approved' and granted_by is not null and extended_due_at is not null)
    or (status = 'denied' and granted_by is not null and extended_due_at is null)
  ) not valid;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  parent_id uuid references public.comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('present', 'absent', 'late')),
  marked_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (course_id, student_id, session_date)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 80),
  message text not null check (char_length(message) between 1 and 1000),
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.courses add column if not exists department_id uuid;
alter table public.courses add column if not exists term_id uuid;
alter table public.courses add column if not exists archived_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_department_id_fkey') then
    alter table public.courses add constraint courses_department_id_fkey
      foreign key (department_id) references public.departments (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_term_id_fkey') then
    alter table public.courses add constraint courses_term_id_fkey
      foreign key (term_id) references public.terms (id) on delete set null;
  end if;
end;
$$;
create or replace view public.classes with (security_invoker = true) as
select id, teacher_id, name, join_code, department_id, term_id, archived_at, created_at
from public.courses;

create or replace view public.enrollments with (security_invoker = true) as
select course_id as class_id, student_id, joined_at
from public.course_enrollments;
alter table public.assignments add column if not exists due_date timestamptz;
alter table public.assignments add column if not exists allow_late boolean not null default false;
alter table public.assignments add column if not exists late_penalty_percent numeric(5,2);
alter table public.assignments add column if not exists max_marks numeric(10,2) not null default 100;
alter table public.assignments add column if not exists allow_resubmission boolean not null default false;
alter table public.assignments add column if not exists allowed_file_types text[] not null default '{}';
alter table public.assignments add column if not exists max_file_size_bytes bigint not null default 10485760;
alter table public.rubric_criteria add column if not exists max_points numeric(10,2) not null default 100;
alter table public.submissions add column if not exists is_late boolean not null default false;
alter table public.submissions add column if not exists version_number integer not null default 1;
update public.assignments set due_date = due_at where due_date is null and due_at is not null;
alter table public.assignments drop constraint if exists assignments_late_penalty_percent_check;
alter table public.assignments add constraint assignments_late_penalty_percent_check
  check (late_penalty_percent is null or late_penalty_percent between 0 and 100);
alter table public.assignments drop constraint if exists assignments_max_marks_check;
alter table public.assignments add constraint assignments_max_marks_check check (max_marks > 0);
alter table public.assignments drop constraint if exists assignments_max_file_size_bytes_check;
alter table public.assignments add constraint assignments_max_file_size_bytes_check
  check (max_file_size_bytes between 1 and 104857600);
alter table public.rubric_criteria drop constraint if exists rubric_criteria_max_points_check;
alter table public.rubric_criteria add constraint rubric_criteria_max_points_check
  check (max_points > 0);

create index if not exists assignments_teacher_id_idx on public.assignments (teacher_id, created_at desc);
create index if not exists assignments_course_id_idx on public.assignments (course_id, due_at);
create index if not exists assignments_published_due_at_idx on public.assignments (published, due_at);
create index if not exists submissions_assignment_id_idx on public.submissions (assignment_id, submitted_at desc);
create index if not exists submissions_student_id_idx on public.submissions (student_id, updated_at desc);
create index if not exists course_enrollments_student_id_idx on public.course_enrollments (student_id, joined_at desc);
create index if not exists assignments_due_date_idx on public.assignments (due_date);
create index if not exists rubric_criteria_assignment_id_idx on public.rubric_criteria (assignment_id, sort_order);
create index if not exists submission_versions_submission_id_idx on public.submission_versions (submission_id, version_number desc);
create index if not exists submission_files_submission_id_idx on public.submission_files (submission_id, created_at);
create index if not exists grades_grader_id_idx on public.grades (grader_id, updated_at desc);
create index if not exists rubric_scores_criterion_id_idx on public.rubric_scores (criterion_id);
create index if not exists groups_course_id_idx on public.groups (course_id, assignment_id);
create index if not exists group_members_student_id_idx on public.group_members (student_id, joined_at desc);
create index if not exists extensions_student_assignment_idx on public.extensions (assignment_id, student_id);
create index if not exists announcements_course_id_idx on public.announcements (course_id, published_at desc);
create index if not exists comments_assignment_id_idx on public.comments (assignment_id, created_at);
create index if not exists feedback_messages_submission_id_idx on public.feedback_messages (submission_id, created_at);
create index if not exists attendance_course_date_idx on public.attendance (course_id, session_date desc);
create index if not exists attendance_student_id_idx on public.attendance (student_id, session_date desc);
create index if not exists notifications_user_read_created_idx on public.notifications (user_id, read, created_at desc);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_created_idx on public.audit_log (actor_id, created_at desc);

create or replace function public.is_course_teacher(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = target_course_id
      and c.teacher_id = (select auth.uid())
      and exists (
        select 1 from public.profiles p
        where p.id = c.teacher_id
          and p.role = 'teacher'
          and p.active
          and not p.must_change_password
      )
  );
$$;

create or replace function public.is_course_student(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.course_id = target_course_id
      and e.student_id = (select auth.uid())
      and exists (
        select 1 from public.profiles p
        where p.id = e.student_id
          and p.role = 'student'
          and p.active
          and not p.must_change_password
      )
  );
$$;

create or replace function public.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = required_role
      and p.active
      and not p.must_change_password
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and not p.must_change_password
  );
$$;

create or replace function public.is_course_member(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_course_teacher(target_course_id)
    or public.is_course_student(target_course_id)
    or public.current_user_has_role('admin');
$$;

create or replace function public.can_view_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    where a.id = target_assignment_id
      and (
        public.current_user_has_role('admin')
        or (
          public.is_course_teacher(a.course_id)
          and a.teacher_id = (select auth.uid())
        )
        or (
          a.published
          and public.is_course_student(a.course_id)
        )
      )
  );
$$;

create or replace function public.can_view_submission(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = target_submission_id
      and (
        public.current_user_has_role('admin')
        or (
          s.student_id = (select auth.uid())
          and public.current_user_has_role('student')
        )
        or (
          a.teacher_id = (select auth.uid())
          and s.status = 'submitted'
          and public.is_course_teacher(a.course_id)
        )
      )
  );
$$;

create or replace function public.can_manage_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    where a.id = target_assignment_id
      and (
        public.current_user_has_role('admin')
        or (
          a.teacher_id = (select auth.uid())
          and public.is_course_teacher(a.course_id)
        )
      )
  );
$$;

create or replace function public.submission_deadline_open(
  target_assignment_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    where a.id = target_assignment_id
      and (
        a.allow_late
        or coalesce(
          (
            select greatest(
              coalesce(a.due_date, a.due_at),
              max(e.extended_due_at)
            )
            from public.extensions e
            where e.assignment_id = a.id
              and e.student_id = target_student_id
              and e.status = 'approved'
          ),
          coalesce(a.due_date, a.due_at)
        ) is null
        or statement_timestamp() <= coalesce(
          (
            select greatest(
              coalesce(a.due_date, a.due_at),
              max(e.extended_due_at)
            )
            from public.extensions e
            where e.assignment_id = a.id
              and e.student_id = target_student_id
              and e.status = 'approved'
          ),
          coalesce(a.due_date, a.due_at)
        )
      )
  );
$$;

create or replace function public.can_view_grade(target_grade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grades g
    join public.submissions s on s.id = g.submission_id
    join public.assignments a on a.id = s.assignment_id
    where g.id = target_grade_id
      and (
        public.current_user_has_role('admin')
        or (
          a.teacher_id = (select auth.uid())
          and public.is_course_teacher(a.course_id)
        )
        or (
          s.student_id = (select auth.uid())
          and s.status = 'submitted'
          and g.released_at is not null
          and public.current_user_has_role('student')
        )
      )
  );
$$;

create or replace function public.can_manage_grade(target_grade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grades g
    join public.submissions s on s.id = g.submission_id
    join public.assignments a on a.id = s.assignment_id
    where g.id = target_grade_id
      and (
        public.current_user_has_role('admin')
        or (
          a.teacher_id = (select auth.uid())
          and public.is_course_teacher(a.course_id)
        )
      )
  );
$$;

create or replace function public.get_course_roster(target_course_id uuid)
returns table(student_id uuid, full_name text, student_number text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.display_name, ''), p.student_id
  from public.course_enrollments e
  join public.profiles p on p.id = e.student_id
  where e.course_id = target_course_id
    and p.role = 'student'
    and p.active
    and (
      public.current_user_has_role('admin')
      or (
        public.current_user_has_role('teacher')
        and public.is_course_teacher(target_course_id)
      )
    )
  order by coalesce(nullif(p.full_name, ''), p.display_name, ''), p.id;
$$;

create or replace function public.admin_update_user_access(
  target_user_id uuid,
  new_role text,
  new_active boolean,
  require_password_change boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  other_active_admins integer;
begin
  if not public.current_user_has_role('admin') then
    raise exception 'Administrator access is required.';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own administrator account.';
  end if;
  if new_role not in ('student', 'teacher', 'admin') or new_active is null then
    raise exception 'Choose a valid role and account status.';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_update_user_access'));
  select * into target_profile
  from public.profiles
  where id = target_user_id
  for update;
  if not found then
    raise exception 'The selected account does not exist.';
  end if;

  if target_profile.role = 'admin'
     and target_profile.active
     and (new_role <> 'admin' or not new_active) then
    select count(*) into other_active_admins
    from public.profiles p
    where p.role = 'admin'
      and p.active
      and not p.must_change_password
      and p.id <> target_user_id;
    if other_active_admins = 0 then
      raise exception 'At least one other active administrator must remain.';
    end if;
  end if;

  if target_profile.role = 'teacher'
     and (new_role <> 'teacher' or not new_active)
     and exists (
       select 1 from public.courses c
       where c.teacher_id = target_user_id
     ) then
    raise exception 'Reassign this lecturer''s classes before changing their role or deactivating the account.';
  end if;

  update public.profiles
  set role = new_role,
      active = new_active,
      must_change_password = require_password_change
  where id = target_user_id;
end;
$$;

create or replace function public.save_submission_grade(
  target_submission_id uuid,
  requested_mark numeric,
  requested_feedback text,
  release_grade boolean,
  requested_rubric_scores jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_assignment public.assignments%rowtype;
  target_grade_id uuid;
  rubric_count integer;
  requested_count integer;
  distinct_count integer;
  calculated_mark numeric(10,2);
  rubric_total numeric(10,2);
  score_entry record;
  criterion public.rubric_criteria%rowtype;
begin
  if not public.current_user_has_role('teacher') then
    raise exception 'Active lecturer access is required to grade submissions.';
  end if;

  select a.* into target_assignment
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = target_submission_id
    and s.status = 'submitted'
    and a.teacher_id = (select auth.uid())
    and public.is_course_teacher(a.course_id)
  for update of s;
  if not found then
    raise exception 'The submitted work was not found in one of your classes.';
  end if;

  select count(*), coalesce(sum(rc.weight_percent), 0)
    into rubric_count, rubric_total
  from public.rubric_criteria rc
  where rc.assignment_id = target_assignment.id;

  if rubric_count > 0 then
    if jsonb_typeof(requested_rubric_scores) is distinct from 'array' then
      raise exception 'Provide a score for every rubric criterion.';
    end if;
    requested_count := jsonb_array_length(requested_rubric_scores);
    select count(distinct (entry.value ->> 'criterion_id')::uuid)
      into distinct_count
    from jsonb_array_elements(requested_rubric_scores) entry(value);
    if requested_count <> rubric_count or distinct_count <> rubric_count then
      raise exception 'Provide exactly one score for every rubric criterion.';
    end if;
    if abs(rubric_total - 100) > 0.01 then
      raise exception 'Rubric weights must total 100 percent before grading.';
    end if;

    calculated_mark := 0;
    for score_entry in
      select
        (entry.value ->> 'criterion_id')::uuid as criterion_id,
        (entry.value ->> 'score')::numeric as score,
        coalesce(entry.value ->> 'feedback', '') as feedback
      from jsonb_array_elements(requested_rubric_scores) entry(value)
    loop
      select rc.* into criterion
      from public.rubric_criteria rc
      where rc.id = score_entry.criterion_id
        and rc.assignment_id = target_assignment.id;
      if not found then
        raise exception 'A rubric score does not belong to this assignment.';
      end if;
      if score_entry.score is null
         or score_entry.score < 0
         or score_entry.score > criterion.max_points then
        raise exception 'A rubric score is outside its criterion maximum.';
      end if;
      if char_length(score_entry.feedback) > 4000 then
        raise exception 'Criterion feedback cannot exceed 4000 characters.';
      end if;
      calculated_mark := calculated_mark
        + (score_entry.score / criterion.max_points * criterion.weight_percent
          * target_assignment.max_marks / 100);
    end loop;
    calculated_mark := round(calculated_mark, 2);
  else
    if requested_rubric_scores is not null
       and jsonb_typeof(requested_rubric_scores) <> 'null'
       and requested_rubric_scores <> '[]'::jsonb then
      raise exception 'This assignment has no rubric criteria.';
    end if;
    if requested_mark is null
       or requested_mark < 0
       or requested_mark > target_assignment.max_marks then
      raise exception 'The mark must be within the assignment maximum.';
    end if;
    calculated_mark := round(requested_mark, 2);
  end if;

  if requested_feedback is null or char_length(requested_feedback) > 10000 then
    raise exception 'Overall feedback cannot exceed 10000 characters.';
  end if;

  insert into public.grades (
    submission_id, grader_id, mark, feedback, released_at
  ) values (
    target_submission_id,
    (select auth.uid()),
    calculated_mark,
    requested_feedback,
    case when release_grade then statement_timestamp() else null end
  )
  on conflict (submission_id) do update
  set grader_id = excluded.grader_id,
      mark = excluded.mark,
      feedback = excluded.feedback,
      released_at = excluded.released_at
  returning id into target_grade_id;

  delete from public.rubric_scores rs where rs.grade_id = target_grade_id;
  if rubric_count > 0 then
    for score_entry in
      select
        (entry.value ->> 'criterion_id')::uuid as criterion_id,
        (entry.value ->> 'score')::numeric as score,
        coalesce(entry.value ->> 'feedback', '') as feedback
      from jsonb_array_elements(requested_rubric_scores) entry(value)
    loop
      insert into public.rubric_scores (grade_id, criterion_id, score, feedback)
      values (target_grade_id, score_entry.criterion_id, score_entry.score, score_entry.feedback);
    end loop;
  end if;

  return target_grade_id;
end;
$$;

revoke all on function public.is_course_teacher(uuid) from public, anon;
revoke all on function public.is_course_student(uuid) from public, anon;
revoke all on function public.current_user_has_role(text) from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_course_member(uuid) from public, anon;
revoke all on function public.can_view_assignment(uuid) from public, anon;
revoke all on function public.can_view_submission(uuid) from public, anon;
revoke all on function public.can_manage_assignment(uuid) from public, anon;
revoke all on function public.submission_deadline_open(uuid, uuid) from public, anon;
revoke all on function public.can_view_grade(uuid) from public, anon;
revoke all on function public.can_manage_grade(uuid) from public, anon;
revoke all on function public.get_course_roster(uuid) from public, anon;
revoke all on function public.admin_update_user_access(uuid, text, boolean, boolean) from public, anon;
revoke all on function public.save_submission_grade(uuid, numeric, text, boolean, jsonb) from public, anon;
grant execute on function public.is_course_teacher(uuid) to authenticated;
grant execute on function public.is_course_student(uuid) to authenticated;
grant execute on function public.current_user_has_role(text) to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_course_member(uuid) to authenticated;
grant execute on function public.can_view_assignment(uuid) to authenticated;
grant execute on function public.can_view_submission(uuid) to authenticated;
grant execute on function public.can_manage_assignment(uuid) to authenticated;
grant execute on function public.submission_deadline_open(uuid, uuid) to authenticated;
grant execute on function public.can_view_grade(uuid) to authenticated;
grant execute on function public.can_manage_grade(uuid) to authenticated;
grant execute on function public.get_course_roster(uuid) to authenticated;
grant execute on function public.admin_update_user_access(uuid, text, boolean, boolean) to authenticated;
grant execute on function public.save_submission_grade(uuid, numeric, text, boolean, jsonb) to authenticated;

drop function if exists public.complete_password_change();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if old.id is distinct from (select auth.uid())
     and not public.current_user_has_role('admin') then
    raise exception 'You may only update your own profile.';
  end if;
  if not public.current_user_has_role('admin')
     and (
       new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.display_name is distinct from old.display_name
       or new.full_name is distinct from old.full_name
       or new.student_id is distinct from old.student_id
       or new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.must_change_password is distinct from old.must_change_password
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Only an administrator can edit protected account fields.';
  end if;
  return new;
end;
$$;

create or replace function public.clear_forced_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles
    set must_change_password = false
    where id = new.id and active and must_change_password;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_user_password_changed on auth.users;
create trigger auth_user_password_changed
after update of encrypted_password on auth.users
for each row execute function public.clear_forced_password_change();

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
before update on public.profiles
for each row execute function public.protect_profile_fields();

create or replace function public.join_course_by_code(input_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_course_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to join a class.';
  end if;
  if not public.current_user_has_role('student') then
    raise exception 'Only student accounts can join a class.';
  end if;

  select c.id into matched_course_id
  from public.courses c
  where c.join_code = upper(trim(input_code));

  if matched_course_id is null then
    raise exception 'That class code is invalid.';
  end if;

  insert into public.course_enrollments (course_id, student_id)
  values (matched_course_id, (select auth.uid()))
  on conflict (course_id, student_id) do nothing;
  return matched_course_id;
end;
$$;

revoke all on function public.join_course_by_code(text) from public, anon;
grant execute on function public.join_course_by_code(text) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_assignment_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.due_date := coalesce(new.due_date, new.due_at);
    new.due_at := coalesce(new.due_at, new.due_date);
  elsif new.due_date is distinct from old.due_date then
    new.due_at := new.due_date;
  elsif new.due_at is distinct from old.due_at then
    new.due_date := new.due_at;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_sync_deadline on public.assignments;
create trigger assignments_sync_deadline
before insert or update of due_at, due_date on public.assignments
for each row execute function public.sync_assignment_deadline();

create or replace function public.enforce_submission_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_deadline timestamptz;
  accepts_late boolean;
  resubmission_allowed boolean;
  effective_deadline timestamptz;
  submission_time timestamptz := statement_timestamp();
  is_new_version boolean;
begin
  if tg_op = 'UPDATE' then
    if new.assignment_id is distinct from old.assignment_id
       or new.student_id is distinct from old.student_id then
      raise exception 'A submission cannot be moved to another student or assignment.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'submitted'
     and new.status = 'submitted'
     and (
       new.response is distinct from old.response
       or exists (
         select 1 from public.submission_files f
         where f.submission_id = old.id
           and f.version_id is null
       )
     ) then
    select a.allow_resubmission
      into resubmission_allowed
    from public.assignments a
    where a.id = new.assignment_id;
    if not coalesce(resubmission_allowed, false) then
      raise exception 'This assignment does not allow resubmissions.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    is_new_version := new.status = 'submitted';
  else
    is_new_version := new.status = 'submitted'
      and (
        old.status is distinct from 'submitted'
        or new.response is distinct from old.response
        or exists (
          select 1 from public.submission_files f
          where f.submission_id = old.id
            and f.version_id is null
        )
      );
    if old.status = 'submitted' and new.status = 'submitted' and not is_new_version then
      raise exception 'Add a new response or attachment before resubmitting.';
    end if;
  end if;

  if is_new_version then
    select coalesce(a.due_date, a.due_at), a.allow_late
      into assignment_deadline, accepts_late
    from public.assignments a
    where a.id = new.assignment_id;

    select greatest(assignment_deadline, max(e.extended_due_at))
      into effective_deadline
    from public.extensions e
    where e.assignment_id = new.assignment_id
      and e.student_id = new.student_id
      and e.status = 'approved'
      and e.extended_due_at is not null;
    effective_deadline := coalesce(effective_deadline, assignment_deadline);

    if effective_deadline is not null
       and submission_time > effective_deadline
       and not coalesce(accepts_late, false) then
      raise exception 'The submission deadline has passed.';
    end if;

    new.submitted_at := submission_time;
    new.is_late := effective_deadline is not null and submission_time > effective_deadline;
    new.version_number := case
      when tg_op = 'INSERT' then 1
      else old.version_number + 1
    end;
  elsif new.status = 'draft' then
    new.submitted_at := null;
    new.is_late := false;
    new.version_number := case when tg_op = 'INSERT' then 1 else old.version_number end;
  elsif tg_op = 'UPDATE' then
    new.submitted_at := old.submitted_at;
    new.is_late := old.is_late;
    new.version_number := old.version_number;
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_enforce_deadline on public.submissions;
create trigger submissions_enforce_deadline
before insert or update of status, response on public.submissions
for each row execute function public.enforce_submission_deadline();

create or replace function public.snapshot_submission_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'submitted' then
      return new;
    end if;
  elsif new.status <> 'submitted'
     or (
       old.status = 'submitted'
       and new.response is not distinct from old.response
       and not exists (
         select 1 from public.submission_files f
         where f.submission_id = old.id
           and f.version_id is null
       )
     ) then
    return new;
  end if;

  if new.status = 'submitted' then
    insert into public.submission_versions (
      submission_id, version_number, response, submitted_at, is_late, created_by
    ) values (
      new.id, new.version_number, new.response, new.submitted_at, new.is_late, new.student_id
    );
    update public.submission_files
    set version_id = (
      select v.id
      from public.submission_versions v
      where v.submission_id = new.id
        and v.version_number = new.version_number
    )
    where submission_id = new.id
      and version_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_snapshot_version on public.submissions;
create trigger submissions_snapshot_version
after insert or update of status, response on public.submissions
for each row execute function public.snapshot_submission_version();

create or replace function public.validate_extension_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  original_deadline timestamptz;
begin
  select coalesce(a.due_date, a.due_at)
    into original_deadline
  from public.assignments a
  where a.id = new.assignment_id;

  if tg_op = 'INSERT' then
    if new.status <> 'requested'
       or new.granted_by is not null
       or new.extended_due_at is not null
       or new.requested_due_at is null
       or original_deadline is null
       or new.requested_due_at <= original_deadline
       or new.requested_due_at <= statement_timestamp()
       or char_length(btrim(new.reason)) = 0
       or char_length(new.reason) > 2000 then
      raise exception 'Extension requests must include a reason and a future date after the assignment deadline.';
    end if;
    return new;
  end if;

  if new.assignment_id is distinct from old.assignment_id
     or new.student_id is distinct from old.student_id
     or new.requested_due_at is distinct from old.requested_due_at
     or new.reason is distinct from old.reason
     or old.status <> 'requested'
     or new.status not in ('approved', 'denied') then
    raise exception 'Extension requests can only be decided once without changing their original details.';
  end if;

  if new.granted_by is distinct from (select auth.uid()) then
    raise exception 'The current lecturer must record the extension decision.';
  end if;

  if new.status = 'approved' then
    if new.extended_due_at is distinct from old.requested_due_at
       or new.extended_due_at <= statement_timestamp()
       or new.extended_due_at <= original_deadline then
      raise exception 'An approved extension must use the requested future deadline.';
    end if;
  elsif new.extended_due_at is not null then
    raise exception 'A declined extension cannot change the assignment deadline.';
  end if;

  return new;
end;
$$;

drop trigger if exists extensions_validate_request on public.extensions;
create trigger extensions_validate_request
before insert or update on public.extensions
for each row execute function public.validate_extension_request();

create or replace function public.apply_late_grade_penalty()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  submission_is_late boolean;
  penalty numeric(5,2);
  assignment_max numeric(10,2);
begin
  select s.is_late, a.late_penalty_percent, a.max_marks
    into submission_is_late, penalty, assignment_max
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = new.submission_id;

  if new.mark > assignment_max then
    raise exception 'The mark cannot exceed the assignment maximum.';
  end if;

  new.final_mark := case
    when submission_is_late and penalty is not null
      then round(new.mark * (100 - penalty) / 100, 2)
    else new.mark
  end;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists grades_apply_late_penalty on public.grades;
create trigger grades_apply_late_penalty
before insert or update of mark, submission_id on public.grades
for each row execute function public.apply_late_grade_penalty();

create or replace function public.validate_rubric_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  criterion_max numeric(10,2);
begin
  select rc.max_points
  into criterion_max
  from public.rubric_criteria rc
  join public.grades g on g.id = new.grade_id
  join public.submissions s on s.id = g.submission_id
  join public.assignments a on a.id = s.assignment_id
  where rc.id = new.criterion_id
    and rc.assignment_id = a.id;

  if not found then
    raise exception 'The rubric criterion must belong to the graded assignment.';
  end if;
  if new.score < 0 or new.score > criterion_max then
    raise exception 'The rubric score must be within the criterion maximum.';
  end if;
  return new;
end;
$$;

drop trigger if exists rubric_scores_validate on public.rubric_scores;
create trigger rubric_scores_validate
before insert or update of grade_id, criterion_id, score on public.rubric_scores
for each row execute function public.validate_rubric_score();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_record jsonb;
  new_record jsonb;
  record_key text;
  actor uuid;
begin
  old_record := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_record := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  record_key := coalesce(new_record ->> 'id', old_record ->> 'id');
  actor := (select auth.uid());
  if actor is null then
    actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_value, new_value)
  values (actor, tg_op, tg_table_name, coalesce(record_key, 'unknown'), old_record, new_record);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''),
    'student'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['courses', 'assignments', 'submissions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke update (display_name, full_name, student_id, photo_url, role, active, email)
  on public.profiles from authenticated;
grant update (display_name, full_name, student_id, photo_url)
  on public.profiles to authenticated;

revoke all on public.courses from anon, authenticated;
grant select, insert, update, delete on public.courses to authenticated;

revoke all on public.course_enrollments from anon, authenticated;
grant select, delete on public.course_enrollments to authenticated;

revoke all on public.assignments from anon, authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

revoke all on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;
grant insert (assignment_id, student_id, response, status) on public.submissions to authenticated;
grant update (response, status) on public.submissions to authenticated;

drop policy if exists "Users can read permitted profiles" on public.profiles;
create policy "Users can read permitted profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.current_user_has_role('admin')
  or exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.student_id = profiles.id
      and a.teacher_id = (select auth.uid())
      and s.status = 'submitted'
      and public.current_user_has_role('teacher')
  )
  or exists (
    select 1
    from public.extensions e
    join public.assignments a on a.id = e.assignment_id
    where e.student_id = profiles.id
      and a.teacher_id = (select auth.uid())
      and public.is_course_teacher(a.course_id)
  )
);

drop policy if exists "Users can update their display name" on public.profiles;
drop policy if exists "Students can update their own photo" on public.profiles;
create policy "Students can update their own photo"
on public.profiles for update to authenticated
using (
  (id = (select auth.uid()) and public.current_user_has_role('student'))
  or public.current_user_has_role('admin')
)
with check (
  (id = (select auth.uid()) and public.current_user_has_role('student'))
  or public.current_user_has_role('admin')
);

drop policy if exists "Course members can view their courses" on public.courses;
create policy "Course members can view their courses"
on public.courses for select to authenticated
using (
  public.is_course_teacher(id)
  or public.is_course_student(id)
);

drop policy if exists "Teachers can create courses" on public.courses;
create policy "Teachers can create courses"
on public.courses for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.current_user_has_role('teacher')
);

drop policy if exists "Teachers can update their courses" on public.courses;
create policy "Teachers can update their courses"
on public.courses for update to authenticated
using (teacher_id = (select auth.uid()) and public.current_user_has_role('teacher'))
with check (teacher_id = (select auth.uid()) and public.current_user_has_role('teacher'));

drop policy if exists "Teachers can delete their courses" on public.courses;
create policy "Teachers can delete their courses"
on public.courses for delete to authenticated
using (teacher_id = (select auth.uid()) and public.current_user_has_role('teacher'));

drop policy if exists "Students and course teachers can view enrollments" on public.course_enrollments;
create policy "Students and course teachers can view enrollments"
on public.course_enrollments for select to authenticated
using (
  (student_id = (select auth.uid()) and public.current_user_has_role('student'))
  or public.is_course_teacher(course_id)
);

drop policy if exists "Students can leave their courses" on public.course_enrollments;
create policy "Students can leave their courses"
on public.course_enrollments for delete to authenticated
using (
  student_id = (select auth.uid())
  and public.current_user_has_role('student')
);

drop policy if exists "Users can read published or owned assignments" on public.assignments;
create policy "Users can read published or owned assignments"
on public.assignments for select to authenticated
using (
  public.is_course_teacher(course_id)
  or (published and public.is_course_student(course_id))
);

drop policy if exists "Teachers can create assignments" on public.assignments;
create policy "Teachers can create assignments"
on public.assignments for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.is_course_teacher(course_id)
  and public.current_user_has_role('teacher')
);

drop policy if exists "Teachers can update their assignments" on public.assignments;
create policy "Teachers can update their assignments"
on public.assignments for update to authenticated
using (
  teacher_id = (select auth.uid())
  and public.is_course_teacher(course_id)
  and public.current_user_has_role('teacher')
)
with check (
  teacher_id = (select auth.uid())
  and public.is_course_teacher(course_id)
  and public.current_user_has_role('teacher')
);

drop policy if exists "Teachers can delete their assignments" on public.assignments;
create policy "Teachers can delete their assignments"
on public.assignments for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and public.current_user_has_role('teacher')
);

drop policy if exists "Students and assignment teachers can read submissions" on public.submissions;
create policy "Students and assignment teachers can read submissions"
on public.submissions for select to authenticated
using (
  (student_id = (select auth.uid()) and public.current_user_has_role('student'))
  or exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.teacher_id = (select auth.uid())
      and submissions.status = 'submitted'
      and public.current_user_has_role('teacher')
  )
);

drop policy if exists "Students can create their own drafts" on public.submissions;
create policy "Students can create their own drafts"
on public.submissions for insert to authenticated
with check (
  student_id = (select auth.uid())
  and status = 'draft'
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.published
      and public.submission_deadline_open(a.id, submissions.student_id)
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students can edit drafts and submit once" on public.submissions;
create policy "Students can edit drafts and submit once"
on public.submissions for update to authenticated
using (
  student_id = (select auth.uid())
  and status = 'draft'
  and public.current_user_has_role('student')
)
with check (
  student_id = (select auth.uid())
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.published
      and public.submission_deadline_open(a.id, submissions.student_id)
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students can resubmit when allowed" on public.submissions;
create policy "Students can resubmit when allowed"
on public.submissions for update to authenticated
using (
  student_id = (select auth.uid())
  and status = 'submitted'
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.allow_resubmission
      and a.published
      and public.is_course_student(a.course_id)
  )
)
with check (
  student_id = (select auth.uid())
  and status = 'submitted'
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.allow_resubmission
      and a.published
      and public.submission_deadline_open(a.id, submissions.student_id)
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students and assignment teachers can read submission files" on storage.objects;
create policy "Students and assignment teachers can read submission files"
on storage.objects for select to authenticated
using (
  bucket_id = 'submission-files'
  and public.is_active_user()
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id::text = (storage.foldername(name))[2]
      and (
        s.student_id = (select auth.uid())
        or (
          a.teacher_id = (select auth.uid())
          and s.status = 'submitted'
          and public.current_user_has_role('teacher')
        )
      )
  )
);

drop policy if exists "Students can upload files to their own drafts" on storage.objects;
create policy "Students can upload files to their own drafts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'submission-files'
  and public.is_active_user()
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.current_user_has_role('student')
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (s.status = 'submitted' and a.allow_resubmission)
      )
      and a.published
      and (a.due_at is null or a.due_at > now())
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students can delete files from their own drafts" on storage.objects;
create policy "Students can delete files from their own drafts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'submission-files'
  and public.is_active_user()
  and public.current_user_has_role('student')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (
          s.status = 'submitted'
          and exists (
            select 1
            from public.assignments a
            join public.submission_files f on f.submission_id = s.id
            where a.id = s.assignment_id
              and a.allow_resubmission
              and f.storage_path = name
              and f.version_id is null
              and public.submission_deadline_open(a.id, s.student_id)
          )
        )
      )
  )
);

alter table public.departments enable row level security;
alter table public.terms enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.submission_versions enable row level security;
alter table public.submission_files enable row level security;
alter table public.grades enable row level security;
alter table public.rubric_scores enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.extensions enable row level security;
alter table public.announcements enable row level security;
alter table public.comments enable row level security;
alter table public.feedback_messages enable row level security;
alter table public.attendance enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.departments, public.terms, public.rubric_criteria,
  public.submission_versions, public.submission_files, public.grades,
  public.rubric_scores, public.groups, public.group_members, public.extensions,
  public.announcements, public.comments, public.feedback_messages,
  public.attendance, public.notifications, public.audit_log
from anon, authenticated;

grant select, insert, update, delete on public.departments, public.terms,
  public.rubric_criteria, public.submission_files,
  public.groups, public.group_members, public.extensions,
  public.announcements, public.comments, public.feedback_messages,
  public.attendance, public.notifications to authenticated;
revoke update on public.submission_files from authenticated;
revoke insert, update, delete on public.extensions from authenticated;
grant insert (assignment_id, student_id, requested_due_at, reason, status)
  on public.extensions to authenticated;
grant update (status, extended_due_at, granted_by)
  on public.extensions to authenticated;
grant delete on public.extensions to authenticated;
grant select on public.submission_versions, public.audit_log to authenticated;
revoke update, delete on public.submission_versions from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.grades, public.rubric_scores from authenticated;
grant select on public.grades, public.rubric_scores to authenticated;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
grant select, insert, update, delete on public.classes, public.enrollments to authenticated;

drop policy if exists "Active users can read departments" on public.departments;
create policy "Active users can read departments" on public.departments
for select to authenticated using (public.is_active_user());
drop policy if exists "Admins manage departments" on public.departments;
create policy "Admins manage departments" on public.departments
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Active users can read terms" on public.terms;
create policy "Active users can read terms" on public.terms
for select to authenticated using (public.is_active_user());
drop policy if exists "Admins manage terms" on public.terms;
create policy "Admins manage terms" on public.terms
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Class members can read rubrics" on public.rubric_criteria;
create policy "Class members can read rubrics" on public.rubric_criteria
for select to authenticated using (public.can_view_assignment(assignment_id));
drop policy if exists "Teachers manage rubrics" on public.rubric_criteria;
create policy "Teachers manage rubrics" on public.rubric_criteria
for all to authenticated using (
  public.can_manage_assignment(assignment_id)
  and exists (
    select 1 from public.assignments a
    where a.id = rubric_criteria.assignment_id
      and public.is_course_teacher(a.course_id)
  )
) with check (
  public.can_manage_assignment(assignment_id)
  and exists (
    select 1 from public.assignments a
    where a.id = rubric_criteria.assignment_id
      and public.is_course_teacher(a.course_id)
  )
);
drop policy if exists "Admins manage rubric criteria" on public.rubric_criteria;
create policy "Admins manage rubric criteria" on public.rubric_criteria
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Participants can read submission versions" on public.submission_versions;
create policy "Participants can read submission versions" on public.submission_versions
for select to authenticated using (public.can_view_submission(submission_id));
drop policy if exists "Admins read all submission versions" on public.submission_versions;
create policy "Admins read all submission versions" on public.submission_versions
for select to authenticated using (public.current_user_has_role('admin'));

drop policy if exists "Participants can read submission file metadata" on public.submission_files;
create policy "Participants can read submission file metadata" on public.submission_files
for select to authenticated using (public.can_view_submission(submission_id));
drop policy if exists "Students manage draft file metadata" on public.submission_files;
drop policy if exists "Students add submission file metadata" on public.submission_files;
create policy "Students add submission file metadata" on public.submission_files
for insert to authenticated with check (
  public.current_user_has_role('student')
  and version_id is null
  and size_bytes >= 0
  and exists (
    select 1 from public.submissions s
    where s.id = submission_files.submission_id
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (
          s.status = 'submitted'
          and exists (
            select 1 from public.assignments a
            where a.id = s.assignment_id
              and a.allow_resubmission
              and public.submission_deadline_open(a.id, s.student_id)
          )
        )
      )
      and exists (
        select 1 from public.assignments a
        where a.id = s.assignment_id
          and submission_files.size_bytes <= a.max_file_size_bytes
          and (
            cardinality(a.allowed_file_types) = 0
            or lower(submission_files.content_type) = any(a.allowed_file_types)
          )
          and submission_files.storage_path like (
            a.id::text || '/' || s.student_id::text || '/' || s.id::text || '/%'
          )
      )
  )
);
drop policy if exists "Students delete unversioned submission file metadata" on public.submission_files;
create policy "Students delete unversioned submission file metadata" on public.submission_files
for delete to authenticated using (
  public.current_user_has_role('student')
  and submission_files.version_id is null
  and exists (
    select 1 from public.submissions s
    where s.id = submission_files.submission_id
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (
          s.status = 'submitted'
          and exists (
            select 1 from public.assignments a
            where a.id = s.assignment_id
              and a.allow_resubmission
              and public.submission_deadline_open(a.id, s.student_id)
          )
        )
      )
  )
);
drop policy if exists "Admins manage submission file metadata" on public.submission_files;
create policy "Admins manage submission file metadata" on public.submission_files
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Students see released grades and teachers see their grades" on public.grades;
create policy "Students see released grades and teachers see their grades" on public.grades
for select to authenticated using (public.can_view_grade(id));
drop policy if exists "Teachers manage grades" on public.grades;
create policy "Teachers manage grades" on public.grades
for all to authenticated using (
  exists (
    select 1 from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = grades.submission_id
      and s.status = 'submitted'
      and a.teacher_id = (select auth.uid())
      and public.is_course_teacher(a.course_id)
  )
) with check (
  exists (
    select 1 from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = grades.submission_id
      and s.status = 'submitted'
      and a.teacher_id = (select auth.uid())
      and public.is_course_teacher(a.course_id)
  )
  and grader_id = (select auth.uid())
);
drop policy if exists "Admins manage grades" on public.grades;
create policy "Admins manage grades" on public.grades
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Participants read rubric scores" on public.rubric_scores;
create policy "Participants read rubric scores" on public.rubric_scores
for select to authenticated using (public.can_view_grade(grade_id));
drop policy if exists "Teachers manage rubric scores" on public.rubric_scores;
create policy "Teachers manage rubric scores" on public.rubric_scores
for all to authenticated using (public.can_manage_grade(grade_id))
with check (public.can_manage_grade(grade_id));
drop policy if exists "Admins manage rubric scores" on public.rubric_scores;
create policy "Admins manage rubric scores" on public.rubric_scores
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Course members read groups" on public.groups;
create policy "Course members read groups" on public.groups
for select to authenticated using (public.is_course_member(course_id));
drop policy if exists "Teachers manage groups" on public.groups;
create policy "Teachers manage groups" on public.groups
for all to authenticated using (public.is_course_teacher(course_id))
with check (public.is_course_teacher(course_id));
drop policy if exists "Admins manage groups" on public.groups;
create policy "Admins manage groups" on public.groups
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Members and teachers read group membership" on public.group_members;
create policy "Members and teachers read group membership" on public.group_members
for select to authenticated using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and public.is_course_teacher(g.course_id)
  )
);
drop policy if exists "Teachers manage group membership" on public.group_members;
create policy "Teachers manage group membership" on public.group_members
for all to authenticated using (
  exists (
    select 1 from public.groups g
    where g.id = group_members.group_id and public.is_course_teacher(g.course_id)
  )
) with check (
  exists (
    select 1 from public.groups g
    join public.course_enrollments e on e.course_id = g.course_id
    where g.id = group_members.group_id
      and public.is_course_teacher(g.course_id)
      and e.student_id = group_members.student_id
  )
);
drop policy if exists "Admins manage group membership" on public.group_members;
create policy "Admins manage group membership" on public.group_members
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Students and class teachers read extensions" on public.extensions;
create policy "Students and class teachers read extensions" on public.extensions
for select to authenticated using (
  (student_id = (select auth.uid()) and public.current_user_has_role('student'))
  or (
    exists (
      select 1 from public.assignments a
      where a.id = extensions.assignment_id and public.is_course_teacher(a.course_id)
    )
  )
);
drop policy if exists "Students request extensions" on public.extensions;
create policy "Students request extensions" on public.extensions
for insert to authenticated with check (
  student_id = (select auth.uid())
  and status = 'requested'
  and requested_due_at is not null
  and extended_due_at is null
  and granted_by is null
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = extensions.assignment_id
      and public.is_course_student(a.course_id)
  )
);
drop policy if exists "Teachers decide extensions" on public.extensions;
create policy "Teachers decide extensions" on public.extensions
for update to authenticated using (
  status = 'requested'
  and exists (
    select 1 from public.assignments a
    where a.id = extensions.assignment_id and public.is_course_teacher(a.course_id)
  )
) with check (
  granted_by = (select auth.uid())
  and status in ('approved', 'denied')
  and exists (
    select 1 from public.assignments a
    where a.id = extensions.assignment_id and public.is_course_teacher(a.course_id)
  )
);
drop policy if exists "Admins manage extensions" on public.extensions;
create policy "Admins manage extensions" on public.extensions
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Course members read announcements" on public.announcements;
create policy "Course members read announcements" on public.announcements
for select to authenticated using (public.is_course_member(course_id));
drop policy if exists "Teachers manage announcements" on public.announcements;
create policy "Teachers manage announcements" on public.announcements
for all to authenticated using (
  author_id = (select auth.uid()) and public.is_course_teacher(course_id)
) with check (
  author_id = (select auth.uid()) and public.is_course_teacher(course_id)
);
drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements" on public.announcements
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Course participants read comments" on public.comments;
create policy "Course participants read comments" on public.comments
for select to authenticated using (
  exists (
    select 1 from public.assignments a
    where a.id = comments.assignment_id
      and (
        public.current_user_has_role('admin')
        or (
          a.teacher_id = (select auth.uid())
          and public.is_course_teacher(a.course_id)
        )
        or (
          a.published
          and public.is_course_student(a.course_id)
        )
      )
  )
);
drop policy if exists "Course participants create comments" on public.comments;
create policy "Course participants create comments" on public.comments
for insert to authenticated with check (
  author_id = (select auth.uid())
  and (
    (
      public.current_user_has_role('teacher')
      and exists (
        select 1 from public.assignments a
        where a.id = comments.assignment_id
          and public.is_course_teacher(a.course_id)
      )
    )
    or (
      public.current_user_has_role('student')
      and exists (
        select 1 from public.assignments a
        where a.id = comments.assignment_id
          and a.published
          and public.is_course_student(a.course_id)
      )
    )
  )
);
drop policy if exists "Authors and admins delete comments" on public.comments;
create policy "Authors and admins delete comments" on public.comments
for delete to authenticated using (
  author_id = (select auth.uid())
  or public.current_user_has_role('admin')
);

drop policy if exists "Submission participants read feedback messages" on public.feedback_messages;
create policy "Submission participants read feedback messages" on public.feedback_messages
for select to authenticated using (public.can_view_submission(submission_id));
drop policy if exists "Submission participants send feedback messages" on public.feedback_messages;
create policy "Submission participants send feedback messages" on public.feedback_messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and public.can_view_submission(submission_id)
);
drop policy if exists "Admins manage feedback messages" on public.feedback_messages;
create policy "Admins manage feedback messages" on public.feedback_messages
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Students and class teachers read attendance" on public.attendance;
create policy "Students and class teachers read attendance" on public.attendance
for select to authenticated using (
  (student_id = (select auth.uid()) and public.current_user_has_role('student'))
  or public.is_course_teacher(course_id)
);
drop policy if exists "Teachers manage attendance" on public.attendance;
create policy "Teachers manage attendance" on public.attendance
for all to authenticated using (
  public.is_course_teacher(course_id)
) with check (
  marked_by = (select auth.uid())
  and public.is_course_teacher(course_id)
  and exists (
    select 1 from public.course_enrollments e
    where e.course_id = attendance.course_id and e.student_id = attendance.student_id
  )
);
drop policy if exists "Admins manage attendance" on public.attendance;
create policy "Admins manage attendance" on public.attendance
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

drop policy if exists "Users manage their own notifications" on public.notifications;
drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications" on public.notifications
for select to authenticated using (
  user_id = (select auth.uid()) and public.is_active_user()
);
drop policy if exists "Users mark their own notifications read" on public.notifications;
create policy "Users mark their own notifications read" on public.notifications
for update to authenticated using (
  user_id = (select auth.uid()) and public.is_active_user()
) with check (
  user_id = (select auth.uid()) and public.is_active_user()
);
drop policy if exists "Admins read notifications" on public.notifications;
create policy "Admins read notifications" on public.notifications
for select to authenticated using (public.current_user_has_role('admin'));

create or replace function public.notify_students_about_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, message)
  select e.student_id, 'announcement', 'New class update: ' || new.title
  from public.course_enrollments e
  join public.profiles p on p.id = e.student_id
  where e.course_id = new.course_id
    and p.role = 'student'
    and p.active;
  return new;
end;
$$;

create or replace function public.notify_student_about_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student_id uuid;
  target_title text;
  grade_was_released boolean := false;
begin
  if new.released_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.released_at is null then
      grade_was_released := true;
    elsif new.mark is not distinct from old.mark
      and new.final_mark is not distinct from old.final_mark
      and new.feedback is not distinct from old.feedback then
      return new;
    end if;
  else
    grade_was_released := true;
  end if;

  select s.student_id, a.title
  into target_student_id, target_title
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = new.submission_id;

  if target_student_id is not null then
    insert into public.notifications (user_id, type, message)
    values (
      target_student_id,
      'grade',
      case when grade_was_released then 'Your grade for "' else 'An update to your grade for "' end
        || coalesce(target_title, 'an assignment')
        || '" is available.'
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_student_about_extension_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_title text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('approved', 'denied') then
    return new;
  end if;

  select a.title into target_title
  from public.assignments a
  where a.id = new.assignment_id;

  insert into public.notifications (user_id, type, message)
  values (
    new.student_id,
    'extension',
    'Your deadline extension request for "'
      || coalesce(target_title, 'an assignment')
      || case when new.status = 'approved' then '" was approved.' else '" was declined.' end
  );
  return new;
end;
$$;

revoke all on function public.notify_students_about_announcement() from public, anon, authenticated;
revoke all on function public.notify_student_about_grade() from public, anon, authenticated;
revoke all on function public.notify_student_about_extension_decision() from public, anon, authenticated;
revoke all on function public.validate_rubric_score() from public, anon, authenticated;

drop trigger if exists announcements_notify_enrolled_students on public.announcements;
create trigger announcements_notify_enrolled_students
after insert on public.announcements
for each row execute function public.notify_students_about_announcement();

drop trigger if exists grades_notify_student_on_release on public.grades;
create trigger grades_notify_student_on_release
after insert or update of released_at, mark, final_mark, feedback on public.grades
for each row execute function public.notify_student_about_grade();

drop trigger if exists extensions_notify_student_on_decision on public.extensions;
create trigger extensions_notify_student_on_decision
after update of status on public.extensions
for each row execute function public.notify_student_about_extension_decision();

drop policy if exists "Admins read audit log" on public.audit_log;
create policy "Admins read audit log" on public.audit_log
for select to authenticated using (public.current_user_has_role('admin'));

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses" on public.courses
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));
drop policy if exists "Admins manage enrollments" on public.course_enrollments;
create policy "Admins manage enrollments" on public.course_enrollments
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));
drop policy if exists "Admins manage assignments" on public.assignments;
create policy "Admins manage assignments" on public.assignments
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));
drop policy if exists "Admins manage submissions" on public.submissions;
create policy "Admins manage submissions" on public.submissions
for all to authenticated using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'departments', 'terms', 'courses', 'course_enrollments',
    'assignments', 'rubric_criteria', 'submissions', 'submission_versions',
    'submission_files', 'grades', 'rubric_scores', 'groups', 'group_members',
    'extensions', 'announcements', 'comments', 'feedback_messages',
    'attendance', 'notifications', 'audit_log'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'Admins all access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_user_has_role(''admin'')) with check (public.current_user_has_role(''admin''))',
      'Admins all access',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function public.audit_row_change();
drop trigger if exists courses_audit on public.courses;
create trigger courses_audit after insert or update or delete on public.courses
for each row execute function public.audit_row_change();
drop trigger if exists assignments_audit on public.assignments;
create trigger assignments_audit after insert or update or delete on public.assignments
for each row execute function public.audit_row_change();
drop trigger if exists grades_audit on public.grades;
create trigger grades_audit after insert or update or delete on public.grades
for each row execute function public.audit_row_change();

insert into storage.buckets (id, name, public, file_size_limit)
values ('submission-files', 'submission-files', false, 104857600),
       ('avatars', 'avatars', false, 5242880)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Students and assignment teachers can read submission files" on storage.objects;
drop policy if exists "Students can upload files to their own drafts" on storage.objects;
drop policy if exists "Students can delete files from their own drafts" on storage.objects;

drop policy if exists "Users read permitted submission files" on storage.objects;
create policy "Users read permitted submission files" on storage.objects
for select to authenticated using (
  bucket_id = 'submission-files'
  and public.is_active_user()
  and exists (
    select 1 from public.submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id::text = (storage.foldername(name))[2]
      and public.can_view_submission(s.id)
  )
);

drop policy if exists "Students upload permitted submission files" on storage.objects;
create policy "Students upload permitted submission files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'submission-files'
  and public.current_user_has_role('student')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and a.id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (s.status = 'submitted' and a.allow_resubmission)
      )
      and (a.max_file_size_bytes >= coalesce((metadata ->> 'size')::bigint, 0))
      and (
        cardinality(a.allowed_file_types) = 0
        or lower(coalesce(metadata ->> 'mimetype', 'application/octet-stream')) = any(a.allowed_file_types)
      )
      and public.submission_deadline_open(a.id, s.student_id)
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students delete permitted draft files" on storage.objects;
create policy "Students delete permitted draft files" on storage.objects
for delete to authenticated using (
  bucket_id = 'submission-files'
  and public.current_user_has_role('student')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (
        s.status = 'draft'
        or (
          s.status = 'submitted'
          and exists (
            select 1 from public.assignments a
            where a.id = s.assignment_id
              and a.allow_resubmission
              and public.submission_deadline_open(a.id, s.student_id)
              and not exists (
                select 1 from public.submission_files f
                where f.storage_path = name
                  and f.version_id is not null
              )
          )
        )
      )
  )
);

drop policy if exists "Users read permitted avatars" on storage.objects;
create policy "Users read permitted avatars" on storage.objects
for select to authenticated using (
  bucket_id = 'avatars'
  and public.is_active_user()
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.current_user_has_role('admin')
    or (
      public.current_user_has_role('teacher')
      and exists (
        select 1 from public.course_enrollments e
        where e.student_id::text = (storage.foldername(name))[1]
          and public.is_course_teacher(e.course_id)
      )
    )
  )
);

drop policy if exists "Users manage their own avatar" on storage.objects;
create policy "Users manage their own avatar" on storage.objects
for all to authenticated using (
  bucket_id = 'avatars'
  and public.current_user_has_role('student')
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'avatars'
  and public.current_user_has_role('student')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['courses', 'assignments', 'submissions', 'grades', 'announcements', 'notifications', 'comments'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

commit;
