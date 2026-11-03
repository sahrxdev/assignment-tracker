create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

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
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists assignments_teacher_id_idx on public.assignments (teacher_id, created_at desc);
create index if not exists assignments_course_id_idx on public.assignments (course_id, due_at);
create index if not exists assignments_published_due_at_idx on public.assignments (published, due_at);
create index if not exists submissions_assignment_id_idx on public.submissions (assignment_id, submitted_at desc);
create index if not exists submissions_student_id_idx on public.submissions (student_id, updated_at desc);
create index if not exists course_enrollments_student_id_idx on public.course_enrollments (student_id, joined_at desc);

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
    where p.id = (select auth.uid()) and p.role = required_role
  );
$$;

revoke all on function public.is_course_teacher(uuid) from public, anon;
revoke all on function public.is_course_student(uuid) from public, anon;
revoke all on function public.current_user_has_role(text) from public, anon;
grant execute on function public.is_course_teacher(uuid) to authenticated;
grant execute on function public.is_course_student(uuid) to authenticated;
grant execute on function public.current_user_has_role(text) to authenticated;

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
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
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
grant update (display_name) on public.profiles to authenticated;

revoke all on public.courses from anon, authenticated;
grant select, insert, update, delete on public.courses to authenticated;

revoke all on public.course_enrollments from anon, authenticated;
grant select, delete on public.course_enrollments to authenticated;

revoke all on public.assignments from anon, authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

revoke all on public.submissions from anon, authenticated;
grant select, insert, update, delete on public.submissions to authenticated;

drop policy if exists "Users can read permitted profiles" on public.profiles;
create policy "Users can read permitted profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.student_id = profiles.id
      and a.teacher_id = (select auth.uid())
      and s.status = 'submitted'
  )
);

drop policy if exists "Users can update their display name" on public.profiles;
create policy "Users can update their display name"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Course members can view their courses" on public.courses;
create policy "Course members can view their courses"
on public.courses for select to authenticated
using (
  teacher_id = (select auth.uid())
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
  student_id = (select auth.uid())
  or public.is_course_teacher(course_id)
);

drop policy if exists "Students can leave their courses" on public.course_enrollments;
create policy "Students can leave their courses"
on public.course_enrollments for delete to authenticated
using (student_id = (select auth.uid()));

drop policy if exists "Users can read published or owned assignments" on public.assignments;
create policy "Users can read published or owned assignments"
on public.assignments for select to authenticated
using (
  teacher_id = (select auth.uid())
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
  student_id = (select auth.uid())
  or exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.teacher_id = (select auth.uid())
      and submissions.status = 'submitted'
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
      and (a.due_at is null or a.due_at > now())
      and public.is_course_student(a.course_id)
  )
);

drop policy if exists "Students can edit drafts and submit once" on public.submissions;
create policy "Students can edit drafts and submit once"
on public.submissions for update to authenticated
using (
  student_id = (select auth.uid())
  and status = 'draft'
)
with check (
  student_id = (select auth.uid())
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.published
      and (a.due_at is null or a.due_at > now())
      and public.is_course_student(a.course_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('submission-files', 'submission-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "Students and assignment teachers can read submission files" on storage.objects;
create policy "Students and assignment teachers can read submission files"
on storage.objects for select to authenticated
using (
  bucket_id = 'submission-files'
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id::text = (storage.foldername(name))[2]
      and (
        s.student_id = (select auth.uid())
        or (a.teacher_id = (select auth.uid()) and s.status = 'submitted')
      )
  )
);

drop policy if exists "Students can upload files to their own drafts" on storage.objects;
create policy "Students can upload files to their own drafts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'submission-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.current_user_has_role('student')
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and s.status = 'draft'
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
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and s.status = 'draft'
  )
);

-- Promote lecturer accounts manually in the Supabase SQL Editor:
-- update public.profiles set role = 'teacher' where email = 'lecturer@example.edu';
