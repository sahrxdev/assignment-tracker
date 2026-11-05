begin;

alter table public.assignments
  add column if not exists is_group_assignment boolean not null default false;

alter table public.groups
  add column if not exists leader_id uuid references public.profiles (id) on delete restrict;

alter table public.group_members
  add column if not exists assignment_id uuid references public.assignments (id) on delete cascade;

update public.group_members gm
set assignment_id = g.assignment_id
from public.groups g
where g.id = gm.group_id
  and g.assignment_id is not null
  and gm.assignment_id is null;

alter table public.submissions
  add column if not exists group_id uuid references public.groups (id) on delete cascade;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('pending', 'student', 'teacher', 'admin'));
alter table public.profiles alter column role set default 'pending';

create unique index if not exists profiles_student_id_ci_unique_idx
  on public.profiles (lower(btrim(student_id)))
  where student_id is not null and btrim(student_id) <> '';

create unique index if not exists group_members_assignment_student_unique_idx
  on public.group_members (assignment_id, student_id)
  where assignment_id is not null;

create unique index if not exists submissions_assignment_group_unique_idx
  on public.submissions (assignment_id, group_id)
  where group_id is not null;

create index if not exists submissions_group_id_idx
  on public.submissions (group_id)
  where group_id is not null;

create or replace function public.prevent_assignment_group_mode_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_group_assignment is distinct from old.is_group_assignment
     and (
       exists (select 1 from public.groups g where g.assignment_id = old.id)
       or exists (select 1 from public.submissions s where s.assignment_id = old.id)
     ) then
    raise exception 'An assignment cannot change between individual and group mode after groups or submissions exist.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_prevent_group_mode_change on public.assignments;
create trigger assignments_prevent_group_mode_change
before update of is_group_assignment on public.assignments
for each row execute function public.prevent_assignment_group_mode_change();

create or replace function public.require_student_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.student_id is not null then
    new.student_id := nullif(btrim(new.student_id), '');
  end if;
  if new.student_id is not null and char_length(new.student_id) > 80 then
    raise exception 'Student IDs may contain at most 80 characters.';
  end if;
  if new.role = 'student' and new.student_id is null then
    raise exception 'A student ID is required for new student accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_require_student_id on public.profiles;
create trigger profiles_require_student_id
before insert or update of role, student_id on public.profiles
for each row execute function public.require_student_id();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, full_name, student_id, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''),
    new.raw_user_meta_data ->> 'student_id',
    'pending'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
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
  if new_role not in ('pending', 'student', 'teacher', 'admin') or new_active is null then
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

create or replace function public.admin_set_student_id(
  target_user_id uuid,
  new_student_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_student_id text := nullif(btrim(new_student_id), '');
begin
  if not public.current_user_has_role('admin') then
    raise exception 'Administrator access is required.';
  end if;
  if normalized_student_id is null or char_length(normalized_student_id) > 80 then
    raise exception 'Enter a student ID containing 1 to 80 characters.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = target_user_id and p.role in ('pending', 'student')
  ) then
    raise exception 'A student ID can only be assigned to an unassigned or student account.';
  end if;

  update public.profiles
  set student_id = normalized_student_id
  where id = target_user_id;
end;
$$;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_role('student')
    and exists (
      select 1 from public.group_members gm
      join public.groups g on g.id = gm.group_id
      where gm.group_id = target_group_id
        and gm.student_id = (select auth.uid())
        and public.is_course_student(g.course_id)
    );
$$;

create or replace function public.is_group_leader(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_role('student')
    and exists (
      select 1 from public.groups g
      join public.group_members gm
        on gm.group_id = g.id and gm.student_id = g.leader_id
      where g.id = target_group_id
        and g.leader_id = (select auth.uid())
        and public.is_course_student(g.course_id)
    );
$$;

create or replace function public.set_group_member_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_assignment_id uuid;
  target_course_id uuid;
begin
  select g.assignment_id, g.course_id
  into target_assignment_id, target_course_id
  from public.groups g
  where g.id = new.group_id;

  if target_assignment_id is null or not exists (
    select 1 from public.assignments a
    where a.id = target_assignment_id
      and a.course_id = target_course_id
      and a.is_group_assignment
  ) then
    raise exception 'Group membership must belong to a group assignment.';
  end if;
  if not exists (
    select 1 from public.course_enrollments e
    join public.profiles p on p.id = e.student_id
    where e.course_id = target_course_id
      and e.student_id = new.student_id
      and p.role = 'student'
      and p.active
      and not p.must_change_password
      and p.student_id is not null
  ) then
    raise exception 'Every group member must be an active student enrolled in the assignment class.';
  end if;

  new.assignment_id := target_assignment_id;
  return new;
end;
$$;

drop trigger if exists group_members_set_assignment on public.group_members;
create trigger group_members_set_assignment
before insert or update of group_id, student_id on public.group_members
for each row execute function public.set_group_member_assignment();

create or replace function public.manage_assignment_group(
  target_assignment_id uuid,
  target_group_id uuid,
  requested_name text,
  requested_leader_student_id text,
  requested_member_student_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course_id uuid;
  leader_profile_id uuid;
  managed_group_id uuid;
  member_ids text[];
  valid_member_count integer;
begin
  if not public.current_user_has_role('teacher') then
    raise exception 'Active lecturer access is required to manage assignment groups.';
  end if;
  if nullif(btrim(requested_name), '') is null
     or char_length(btrim(requested_name)) > 120 then
    raise exception 'Enter a group name containing 1 to 120 characters.';
  end if;

  select a.course_id into target_course_id
  from public.assignments a
  where a.id = target_assignment_id
    and a.teacher_id = (select auth.uid())
    and a.is_group_assignment
    and public.is_course_teacher(a.course_id);
  if target_course_id is null then
    raise exception 'The selected group assignment was not found in your classes.';
  end if;

  select array_agg(distinct lower(btrim(input_id)))
  into member_ids
  from unnest(coalesce(requested_member_student_ids, array[]::text[])) as input_ids(input_id)
  where nullif(btrim(input_id), '') is not null;
  member_ids := coalesce(member_ids, array[]::text[]);
  if nullif(btrim(requested_leader_student_id), '') is null then
    raise exception 'Enter the group leader''s student ID.';
  end if;
  if not exists (
    select 1 from unnest(member_ids) as requested(student_id)
    where lower(requested.student_id) = lower(btrim(requested_leader_student_id))
  ) then
    member_ids := array_append(member_ids, lower(btrim(requested_leader_student_id)));
  end if;

  select p.id into leader_profile_id
  from public.profiles p
  join public.course_enrollments e
    on e.student_id = p.id and e.course_id = target_course_id
  where lower(btrim(p.student_id)) = lower(btrim(requested_leader_student_id))
    and p.role = 'student'
    and p.active
    and not p.must_change_password;
  if leader_profile_id is null then
    raise exception 'The leader student ID was not found in this class.';
  end if;

  select count(distinct p.id) into valid_member_count
  from unnest(member_ids) as requested(student_id)
  join public.profiles p
    on lower(btrim(p.student_id)) = lower(requested.student_id)
  join public.course_enrollments e
    on e.student_id = p.id and e.course_id = target_course_id
  where p.role = 'student'
    and p.active
    and not p.must_change_password;
  if valid_member_count <> cardinality(member_ids) then
    raise exception 'One or more student IDs are invalid, inactive, or not enrolled in this class.';
  end if;

  if target_group_id is null then
    insert into public.groups (course_id, assignment_id, name, leader_id)
    values (target_course_id, target_assignment_id, btrim(requested_name), leader_profile_id)
    returning id into managed_group_id;
  else
    select g.id into managed_group_id
    from public.groups g
    where g.id = target_group_id
      and g.assignment_id = target_assignment_id
      and g.course_id = target_course_id
    for update;
    if managed_group_id is null then
      raise exception 'The selected group does not belong to this assignment.';
    end if;
    if exists (
      select 1 from public.submissions s
      where s.group_id = managed_group_id
    ) then
      raise exception 'Group membership and leadership cannot change after a draft or submission has been created.';
    end if;
    update public.groups
    set name = btrim(requested_name),
        leader_id = leader_profile_id
    where id = managed_group_id;
    delete from public.group_members where group_id = managed_group_id;
  end if;

  insert into public.group_members (group_id, student_id)
  select managed_group_id, p.id
  from unnest(member_ids) as requested(student_id)
  join public.profiles p
    on lower(btrim(p.student_id)) = lower(requested.student_id);
  return managed_group_id;
end;
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
        or (s.group_id is not null and public.is_group_member(s.group_id))
        or (
          a.teacher_id = (select auth.uid())
          and s.status = 'submitted'
          and public.is_course_teacher(a.course_id)
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
          s.status = 'submitted'
          and g.released_at is not null
          and public.current_user_has_role('student')
          and (
            s.student_id = (select auth.uid())
            or (s.group_id is not null and public.is_group_member(s.group_id))
          )
        )
      )
  );
$$;

create or replace function public.prevent_submission_resubmission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'submitted'
     and (
       new.status is distinct from old.status
       or new.response is distinct from old.response
       or new.assignment_id is distinct from old.assignment_id
       or new.student_id is distinct from old.student_id
       or new.group_id is distinct from old.group_id
     ) then
    raise exception 'A submitted assignment cannot be changed or submitted again.';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_prevent_resubmission on public.submissions;
create trigger submissions_prevent_resubmission
before update on public.submissions
for each row execute function public.prevent_submission_resubmission();

create or replace function public.notify_student_about_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_student_id uuid;
  target_group_id uuid;
  target_title text;
  grade_was_released boolean := false;
  notification_message text;
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

  select s.student_id, s.group_id, a.title
  into target_student_id, target_group_id, target_title
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = new.submission_id;

  notification_message :=
    case when grade_was_released then 'Your grade for "' else 'An update to your grade for "' end
    || coalesce(target_title, 'an assignment')
    || '" is available.';

  if target_group_id is not null then
    insert into public.notifications (user_id, type, message)
    select gm.student_id, 'grade', notification_message
    from public.group_members gm
    where gm.group_id = target_group_id;
  elsif target_student_id is not null then
    insert into public.notifications (user_id, type, message)
    values (target_student_id, 'grade', notification_message);
  end if;
  return new;
end;
$$;

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
  or exists (
    select 1
    from public.group_members own_member
    join public.group_members peer_member on peer_member.group_id = own_member.group_id
    where own_member.student_id = (select auth.uid())
      and peer_member.student_id = profiles.id
      and public.is_group_member(own_member.group_id)
  )
  or exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.student_id = profiles.id
      and public.is_course_teacher(g.course_id)
  )
);

drop policy if exists "Members and teachers read group membership" on public.group_members;
create policy "Members and teachers read group membership" on public.group_members
for select to authenticated using (
  public.is_group_member(group_id)
  or exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and public.is_course_teacher(g.course_id)
  )
);

drop policy if exists "Students and assignment teachers can read submissions" on public.submissions;
create policy "Students and assignment teachers can read submissions"
on public.submissions for select to authenticated
using (
  (student_id = (select auth.uid()) and public.current_user_has_role('student'))
  or (group_id is not null and public.is_group_member(group_id))
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
  status = 'draft'
  and public.current_user_has_role('student')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.published
      and public.submission_deadline_open(a.id, submissions.student_id)
      and public.is_course_student(a.course_id)
      and (
        (
          not a.is_group_assignment
          and submissions.group_id is null
          and submissions.student_id = (select auth.uid())
        )
        or (
          a.is_group_assignment
          and submissions.group_id is not null
          and submissions.student_id = (select auth.uid())
          and public.is_group_leader(submissions.group_id)
          and exists (
            select 1 from public.groups g
            where g.id = submissions.group_id
              and g.assignment_id = a.id
              and g.course_id = a.course_id
          )
        )
      )
  )
);

drop policy if exists "Students can edit drafts and submit once" on public.submissions;
create policy "Students can edit drafts and submit once"
on public.submissions for update to authenticated
using (
  status = 'draft'
  and public.current_user_has_role('student')
  and (
    (group_id is null and student_id = (select auth.uid()))
    or (group_id is not null and public.is_group_leader(group_id) and student_id = (select auth.uid()))
  )
)
with check (
  public.current_user_has_role('student')
  and status in ('draft', 'submitted')
  and exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.published
      and public.submission_deadline_open(a.id, submissions.student_id)
      and public.is_course_student(a.course_id)
      and (
        (
          not a.is_group_assignment
          and submissions.group_id is null
          and submissions.student_id = (select auth.uid())
        )
        or (
          a.is_group_assignment
          and submissions.group_id is not null
          and submissions.student_id = (select auth.uid())
          and public.is_group_leader(submissions.group_id)
          and exists (
            select 1 from public.groups g
            where g.id = submissions.group_id
              and g.assignment_id = a.id
              and g.course_id = a.course_id
          )
        )
      )
  )
);

drop policy if exists "Students can resubmit when allowed" on public.submissions;
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
      and (s.group_id is null or public.is_group_leader(s.group_id))
      and s.status = 'draft'
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
      and (s.group_id is null or public.is_group_leader(s.group_id))
      and s.status = 'draft'
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
        or (s.group_id is not null and public.is_group_member(s.group_id))
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
  and public.current_user_has_role('student')
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (s.group_id is null or public.is_group_leader(s.group_id))
      and s.status = 'draft'
      and a.published
      and (a.due_at is null or a.due_at > now())
      and public.is_course_student(a.course_id)
      and (storage.foldername(name))[2] = s.student_id::text
  )
);

drop policy if exists "Students can delete files from their own drafts" on storage.objects;
create policy "Students can delete files from their own drafts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'submission-files'
  and public.is_active_user()
  and public.current_user_has_role('student')
  and exists (
    select 1
    from public.submissions s
    where s.id::text = (storage.foldername(name))[3]
      and s.assignment_id::text = (storage.foldername(name))[1]
      and s.student_id = (select auth.uid())
      and (s.group_id is null or public.is_group_leader(s.group_id))
      and s.status = 'draft'
      and (storage.foldername(name))[2] = s.student_id::text
  )
);

revoke insert, update, delete on public.groups, public.group_members from authenticated;
grant select on public.groups, public.group_members to authenticated;

revoke insert on public.submissions from authenticated;
grant insert (assignment_id, student_id, group_id, response, status) on public.submissions to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['groups', 'group_members'] loop
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

revoke all on function public.require_student_id() from public, anon, authenticated;
revoke all on function public.set_group_member_assignment() from public, anon, authenticated;
revoke all on function public.prevent_submission_resubmission() from public, anon, authenticated;
revoke all on function public.prevent_assignment_group_mode_change() from public, anon, authenticated;
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_leader(uuid) from public, anon;
revoke all on function public.admin_set_student_id(uuid, text) from public, anon;
revoke all on function public.manage_assignment_group(uuid, uuid, text, text, text[]) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_leader(uuid) to authenticated;
grant execute on function public.admin_set_student_id(uuid, text) to authenticated;
grant execute on function public.manage_assignment_group(uuid, uuid, text, text, text[]) to authenticated;

commit;
