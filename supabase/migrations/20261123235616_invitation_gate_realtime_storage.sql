create extension if not exists pgcrypto with schema extensions;
alter table public.invitations add column grant_global_admin boolean not null default false;

drop policy if exists "invitations_admin_all" on public.invitations;
create policy invitations_admin_select on public.invitations for select to authenticated
using (private.is_global_admin());
create policy invitations_admin_insert_regular on public.invitations for insert to authenticated
with check (private.is_global_admin() and grant_global_admin = false and created_by = (select auth.uid()));
create policy invitations_admin_update_regular on public.invitations for update to authenticated
using (private.is_global_admin() and grant_global_admin = false)
with check (private.is_global_admin() and grant_global_admin = false);
create policy invitations_admin_delete_regular on public.invitations for delete to authenticated
using (private.is_global_admin() and grant_global_admin = false);

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  invitation_admin boolean;
  invitation_hash text;
begin
  invitation_hash := new.raw_user_meta_data ->> 'invite_code_hash';
  if invitation_hash is null or length(invitation_hash) <> 64 then
    raise exception 'A valid invitation is required' using errcode = '28000';
  end if;

  update public.invitations set uses_count = uses_count + 1
  where code_hash = invitation_hash
    and (expires_at is null or expires_at > now())
    and uses_count < max_uses
  returning grant_global_admin into invitation_admin;

  if not found then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'jogador'), '@', 1)))
  on conflict (id) do nothing;

  if invitation_admin then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('global_role', 'admin')
    where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.join_room_with_invite(p_code_hash text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare target_room uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select ri.room_id into target_room
  from public.room_invites ri join public.rooms r on r.id = ri.room_id
  where ri.code_hash = p_code_hash
    and (ri.expires_at is null or ri.expires_at > now())
    and ri.uses_count < ri.max_uses
    and r.status = 'active'
    and (r.expires_at is null or r.expires_at > now());

  if target_room is null then
    raise exception 'Invalid or expired room invitation' using errcode = '22023';
  end if;

  if exists (select 1 from public.room_members m where m.room_id = target_room and m.user_id = (select auth.uid())) then
    return target_room;
  end if;

  update public.room_invites ri set uses_count = uses_count + 1
  from public.rooms r
  where ri.code_hash = p_code_hash and ri.room_id = target_room
    and r.id = ri.room_id and r.status = 'active'
    and (r.expires_at is null or r.expires_at > now())
    and (ri.expires_at is null or ri.expires_at > now())
    and ri.uses_count < ri.max_uses;

  if not found then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (target_room, (select auth.uid()), 'player')
  on conflict (room_id, user_id) do nothing;
  return target_room;
end;
$$;

create or replace function private.set_resource_bar_updated_by()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger resource_bars_set_updated_by
before insert or update on public.resource_bars
for each row execute function private.set_resource_bar_updated_by();

alter publication supabase_realtime add table
  public.rooms, public.room_members, public.characters, public.room_characters,
  public.resource_bars, public.room_music_state, public.screen_share_requests;

insert into storage.buckets (id, name, public)
values ('music', 'music', false)
on conflict (id) do nothing;

create policy music_storage_insert_owner on storage.objects for insert to authenticated
with check (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy music_storage_select_owner_or_room on storage.objects for select to authenticated
using (
  bucket_id = 'music' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.music_tracks t
      where t.storage_path = storage.objects.name and private.can_view_track(t.id)
    )
  )
);
create policy music_storage_update_owner on storage.objects for update to authenticated
using (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy music_storage_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'music' and (storage.foldername(name))[1] = (select auth.uid())::text);
