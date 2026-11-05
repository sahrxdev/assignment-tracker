drop policy if exists "Students can update their own photo" on public.profiles;
drop policy if exists "Users can update their own photo" on public.profiles;
create policy "Users can update their own photo"
on public.profiles for update to authenticated
using (
  public.is_active_user()
  and (
    id = (select auth.uid())
    or public.current_user_has_role('admin')
  )
)
with check (
  public.is_active_user()
  and (
    id = (select auth.uid())
    or public.current_user_has_role('admin')
  )
);

drop policy if exists "Users manage their own avatar" on storage.objects;
create policy "Users manage their own avatar" on storage.objects
for all to authenticated using (
  bucket_id = 'avatars'
  and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'avatars'
  and public.is_active_user()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
