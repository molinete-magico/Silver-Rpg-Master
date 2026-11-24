-- Shared, reusable access tokens for the private table.
-- Players use anonymous Supabase Auth identities; only the owner/admin keeps a permanent account.

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'Acesso compartilhado' check (char_length(trim(label)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_id uuid not null references public.access_tokens(id) on delete restrict,
  granted_at timestamptz not null default now()
);

create index access_grants_token_idx on public.access_grants(token_id);
alter table public.access_tokens enable row level security;
alter table public.access_grants enable row level security;
revoke all on public.access_tokens, public.access_grants from anon, authenticated;

create or replace function private.is_global_master() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'global_role') in ('admin', 'master'), false);
$$;

create or replace function private.has_valid_access() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'global_role') = 'admin', false)
    or exists (
      select 1
      from public.access_grants g
      join public.access_tokens t on t.id = g.token_id
      where g.user_id = (select auth.uid())
        and t.revoked_at is null
    );
$$;

create or replace function private.can_view_character(target_character uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_valid_access()
    and exists (select 1 from public.characters c where c.id = target_character);
$$;

create or replace function private.can_manage_character(target_character uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_valid_access()
    and exists (select 1 from public.characters c where c.id = target_character);
$$;

create function public.has_valid_access() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_valid_access(); $$;

create function public.redeem_access_token(p_token_hash text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare target_token uuid;
begin
  if (select auth.uid()) is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Anonymous participant session required' using errcode = '42501';
  end if;

  select t.id into target_token
  from public.access_tokens t
  where t.token_hash = p_token_hash and t.revoked_at is null;

  if target_token is null then
    raise exception 'Invalid or revoked access token' using errcode = '22023';
  end if;

  insert into public.access_grants (user_id, token_id)
  values ((select auth.uid()), target_token)
  on conflict (user_id) do update
    set token_id = excluded.token_id, granted_at = now();

  return true;
end;
$$;

create function public.create_access_token(p_token_hash text, p_label text default 'Acesso compartilhado') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare created_id uuid;
begin
  if not private.is_global_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash' using errcode = '22023'; end if;
  insert into public.access_tokens (token_hash, label, created_by)
  values (p_token_hash, coalesce(nullif(trim(p_label), ''), 'Acesso compartilhado'), (select auth.uid()))
  returning id into created_id;
  return created_id;
end;
$$;

create function public.list_access_tokens()
returns table(id uuid, label text, created_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_global_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query
    select t.id, t.label, t.created_at, t.revoked_at
    from public.access_tokens t
    order by t.created_at desc;
end;
$$;

create function public.revoke_access_token(p_token_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_global_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.access_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_token_id;
  return found;
end;
$$;

create function public.join_open_room(p_room_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_valid_access() then raise exception 'Valid access token required' using errcode = '42501'; end if;
  if not exists (select 1 from public.rooms r where r.id = p_room_id and r.status = 'active') then
    raise exception 'Session is not open' using errcode = '22023';
  end if;
  insert into public.room_members (room_id, user_id, role)
  values (p_room_id, (select auth.uid()), 'player')
  on conflict (room_id, user_id) do nothing;
  return p_room_id;
end;
$$;

create or replace function public.has_valid_access() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_valid_access(); $$;

revoke all on function private.is_global_master() from public, anon;
revoke all on function private.has_valid_access() from public, anon;
revoke all on function private.can_manage_character(uuid) from public, anon;
revoke all on function public.has_valid_access() from public, anon;
revoke all on function public.redeem_access_token(text) from public, anon;
revoke all on function public.create_access_token(text, text) from public, anon;
revoke all on function public.list_access_tokens() from public, anon;
revoke all on function public.revoke_access_token(uuid) from public, anon;
revoke all on function public.join_open_room(uuid) from public, anon;
grant execute on function private.is_global_master() to authenticated;
grant execute on function private.has_valid_access() to authenticated;
grant execute on function private.can_manage_character(uuid) to authenticated;
grant execute on function public.has_valid_access() to authenticated;
grant execute on function public.redeem_access_token(text) to authenticated;
grant execute on function public.create_access_token(text, text) to authenticated;
grant execute on function public.list_access_tokens() to authenticated;
grant execute on function public.revoke_access_token(uuid) to authenticated;
grant execute on function public.join_open_room(uuid) to authenticated;

drop policy if exists rooms_select_members on public.rooms;
create policy rooms_select_open_or_member on public.rooms for select to authenticated
using (private.has_valid_access() and (status = 'active' or private.is_room_member(id) or private.is_global_master()));

drop policy if exists rooms_insert_creator on public.rooms;
create policy rooms_insert_master on public.rooms for insert to authenticated
with check (private.is_global_master() and owner_id = (select auth.uid()));

drop policy if exists characters_select_owner_or_room on public.characters;
create policy characters_select_shared on public.characters for select to authenticated
using (private.has_valid_access());

drop policy if exists characters_insert_owner on public.characters;
create policy characters_insert_shared on public.characters for insert to authenticated
with check (private.has_valid_access() and owner_id = (select auth.uid()));

drop policy if exists characters_update_owner on public.characters;
create policy characters_update_shared on public.characters for update to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());

drop policy if exists characters_delete_owner on public.characters;
create policy characters_delete_shared on public.characters for delete to authenticated
using (private.has_valid_access());

drop policy if exists resource_bars_insert_owner_or_gm on public.resource_bars;
create policy resource_bars_insert_shared on public.resource_bars for insert to authenticated
with check (private.can_manage_character(character_id));

drop policy if exists resource_bars_update_owner_or_gm on public.resource_bars;
create policy resource_bars_update_shared on public.resource_bars for update to authenticated
using (private.can_manage_character(character_id)) with check (private.can_manage_character(character_id));

drop policy if exists resource_bars_delete_owner_or_gm on public.resource_bars;
create policy resource_bars_delete_shared on public.resource_bars for delete to authenticated
using (private.can_manage_character(character_id));

-- Restrictive gates ensure that old permissive policies cannot bypass token revocation.
create policy access_gate_profiles on public.profiles as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_invitations on public.invitations as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_rooms on public.rooms as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_room_members on public.room_members as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_room_invites on public.room_invites as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_characters on public.characters as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_room_characters on public.room_characters as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_resource_bars on public.resource_bars as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_music_tracks on public.music_tracks as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_playlists on public.playlists as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_playlist_tracks on public.playlist_tracks as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_room_music_state on public.room_music_state as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
create policy access_gate_screen_share_requests on public.screen_share_requests as restrictive for all to authenticated
using (private.has_valid_access()) with check (private.has_valid_access());
