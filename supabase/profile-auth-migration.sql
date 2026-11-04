begin;

alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists student_id text,
  add column if not exists photo_url text,
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default false;

update public.profiles
set full_name = display_name
where full_name = '' and display_name <> '';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

create unique index if not exists profiles_student_id_unique_idx
  on public.profiles (student_id)
  where student_id is not null;

commit;
