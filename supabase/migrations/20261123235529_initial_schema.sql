create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  max_uses integer not null default 1 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0 and uses_count <= max_uses),
  created_at timestamptz not null default now()
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  room_type text not null check (room_type in ('temporary', 'permanent')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  discord_invite_url text,
  status text not null default 'active' check (status in ('active', 'closed')),
  expires_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discord_invite_url is null or discord_invite_url ~ '^https://(discord\\.gg|discord\\.com/invite)/[A-Za-z0-9-]+$'),
  check (room_type <> 'temporary' or expires_at is not null or status = 'closed')
);
create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('gm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  max_uses integer not null default 1 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0 and uses_count <= max_uses),
  created_at timestamptz not null default now()
);
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.room_characters (
  room_id uuid not null references public.rooms(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (room_id, character_id)
);
create table public.resource_bars (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 48),
  current_value numeric(12, 2) not null default 0 check (current_value >= 0),
  max_value numeric(12, 2) not null default 1 check (max_value >= 0 and current_value <= max_value),
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  source_type text not null check (source_type in ('upload', 'youtube')),
  storage_path text,
  youtube_video_id text,
  duration_seconds numeric(10, 2),
  created_at timestamptz not null default now(),
  check ((source_type = 'upload' and storage_path is not null and youtube_video_id is null)
      or (source_type = 'youtube' and youtube_video_id is not null and storage_path is null)),
  check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  check (duration_seconds is null or duration_seconds >= 0)
);
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  track_id uuid not null references public.music_tracks(id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, track_id)
);
create table public.room_music_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  current_track_id uuid references public.music_tracks(id) on delete set null,
  playlist_id uuid references public.playlists(id) on delete set null,
  status text not null default 'stopped' check (status in ('playing', 'paused', 'stopped')),
  position_seconds numeric(10, 2) not null default 0 check (position_seconds >= 0),
  playback_started_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.screen_share_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled', 'stopped')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index room_members_user_idx on public.room_members(user_id, room_id);
create index room_invites_room_idx on public.room_invites(room_id);
create index characters_owner_idx on public.characters(owner_id, created_at desc);
create index room_characters_character_idx on public.room_characters(character_id, room_id);
create index resource_bars_character_order_idx on public.resource_bars(character_id, sort_order, created_at);
create index music_tracks_owner_idx on public.music_tracks(owner_id, created_at desc);
create index playlists_owner_idx on public.playlists(owner_id, created_at desc);
create index playlist_tracks_order_idx on public.playlist_tracks(playlist_id, position);
create index screen_share_room_status_idx on public.screen_share_requests(room_id, status, created_at desc);

create function private.is_global_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$ select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'global_role') = 'admin', false); $$;

create function private.is_room_member(target_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.room_members m where m.room_id = target_room and m.user_id = (select auth.uid())
); $$;

create function private.is_room_gm(target_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.room_members m where m.room_id = target_room and m.user_id = (select auth.uid()) and m.role = 'gm'
); $$;

create function private.is_character_owner(target_character uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.characters c where c.id = target_character and c.owner_id = (select auth.uid())
); $$;

create function private.can_view_character(target_character uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_character_owner(target_character) or exists (
  select 1 from public.room_characters rc join public.room_members rm on rm.room_id = rc.room_id
  where rc.character_id = target_character and rm.user_id = (select auth.uid())
); $$;

create function private.can_manage_character(target_character uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_character_owner(target_character) or exists (
  select 1 from public.room_characters rc join public.room_members rm on rm.room_id = rc.room_id
  where rc.character_id = target_character and rm.user_id = (select auth.uid()) and rm.role = 'gm'
) or private.is_global_admin(); $$;

create function private.is_track_owner(target_track uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.music_tracks t where t.id = target_track and t.owner_id = (select auth.uid())
); $$;

create function private.is_playlist_owner(target_playlist uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
  select 1 from public.playlists p where p.id = target_playlist and p.owner_id = (select auth.uid())
); $$;

create function private.can_view_playlist(target_playlist uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_playlist_owner(target_playlist) or exists (
  select 1 from public.room_music_state s join public.room_members m on m.room_id = s.room_id
  where s.playlist_id = target_playlist and m.user_id = (select auth.uid())
); $$;

create function private.can_view_track(target_track uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_track_owner(target_track) or exists (
  select 1 from public.room_music_state s join public.room_members m on m.room_id = s.room_id
  where m.user_id = (select auth.uid()) and (
    s.current_track_id = target_track or exists (
      select 1 from public.playlist_tracks pt where pt.playlist_id = s.playlist_id and pt.track_id = target_track
    )
  )
); $$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'jogador'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create function private.add_room_creator_as_gm() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_members (room_id, user_id, role) values (new.id, new.owner_id, 'gm')
  on conflict (room_id, user_id) do nothing;
  insert into public.room_music_state (room_id) values (new.id) on conflict (room_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
create trigger on_room_created after insert on public.rooms
for each row execute function private.add_room_creator_as_gm();
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger rooms_touch_updated_at before update on public.rooms for each row execute function private.touch_updated_at();
create trigger characters_touch_updated_at before update on public.characters for each row execute function private.touch_updated_at();
create trigger resource_bars_touch_updated_at before update on public.resource_bars for each row execute function private.touch_updated_at();
create trigger playlists_touch_updated_at before update on public.playlists for each row execute function private.touch_updated_at();
create trigger room_music_state_touch_updated_at before update on public.room_music_state for each row execute function private.touch_updated_at();

create function public.join_room_with_invite(p_code_hash text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare target_room uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  update public.room_invites set uses_count = uses_count + 1
  where code_hash = p_code_hash and (expires_at is null or expires_at > now()) and uses_count < max_uses
  returning room_id into target_room;
  if target_room is null then raise exception 'Invalid or expired room invitation' using errcode = '22023'; end if;
  insert into public.room_members (room_id, user_id, role) values (target_room, (select auth.uid()), 'player')
  on conflict (room_id, user_id) do nothing;
  return target_room;
end;
$$;
revoke all on function public.join_room_with_invite(text) from public, anon;
grant execute on function public.join_room_with_invite(text) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.is_global_admin() to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_room_gm(uuid) to authenticated;
grant execute on function private.is_character_owner(uuid) to authenticated;
grant execute on function private.can_view_character(uuid) to authenticated;
grant execute on function private.can_manage_character(uuid) to authenticated;
grant execute on function private.is_track_owner(uuid) to authenticated;
grant execute on function private.is_playlist_owner(uuid) to authenticated;
grant execute on function private.can_view_playlist(uuid) to authenticated;
grant execute on function private.can_view_track(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.characters enable row level security;
alter table public.room_characters enable row level security;
alter table public.resource_bars enable row level security;
alter table public.music_tracks enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.room_music_state enable row level security;
alter table public.screen_share_requests enable row level security;

create policy profiles_select_self_or_shared_room on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.is_global_admin() or exists (
  select 1 from public.room_members target_member
  join public.room_members viewer_member on viewer_member.room_id = target_member.room_id
  where target_member.user_id = profiles.id and viewer_member.user_id = (select auth.uid())
));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy invitations_admin_all on public.invitations for all to authenticated
using (private.is_global_admin()) with check (private.is_global_admin());

create policy rooms_select_members on public.rooms for select to authenticated
using (private.is_room_member(id) or private.is_global_admin());
create policy rooms_insert_creator on public.rooms for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy rooms_update_gm on public.rooms for update to authenticated
using (private.is_room_gm(id) or private.is_global_admin())
with check (private.is_global_admin() or (private.is_room_gm(id) and owner_id = (select auth.uid())));
create policy rooms_delete_gm on public.rooms for delete to authenticated
using (private.is_room_gm(id) or private.is_global_admin());

create policy room_members_select_room on public.room_members for select to authenticated
using (private.is_room_member(room_id) or private.is_global_admin());
create policy room_members_insert_gm on public.room_members for insert to authenticated
with check (private.is_room_gm(room_id) or private.is_global_admin());
create policy room_members_update_admin on public.room_members for update to authenticated
using (private.is_global_admin()) with check (private.is_global_admin());
create policy room_members_delete_self_or_gm on public.room_members for delete to authenticated
using (private.is_global_admin() or (user_id = (select auth.uid()) and role = 'player')
or (private.is_room_gm(room_id) and role = 'player' and user_id <> (select auth.uid())));

create policy room_invites_gm_all on public.room_invites for all to authenticated
using (private.is_room_gm(room_id) or private.is_global_admin())
with check (private.is_room_gm(room_id) or private.is_global_admin());

create policy characters_select_owner_or_room on public.characters for select to authenticated
using (private.can_view_character(id) or private.is_global_admin());
create policy characters_insert_owner on public.characters for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy characters_update_owner on public.characters for update to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin())
with check (owner_id = (select auth.uid()) or private.is_global_admin());
create policy characters_delete_owner on public.characters for delete to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin());

create policy room_characters_select_members on public.room_characters for select to authenticated
using (private.is_room_member(room_id) or private.is_global_admin());
create policy room_characters_insert_owner_or_gm on public.room_characters for insert to authenticated
with check (private.is_room_gm(room_id) or (private.is_room_member(room_id) and private.is_character_owner(character_id)) or private.is_global_admin());
create policy room_characters_delete_owner_or_gm on public.room_characters for delete to authenticated
using (private.is_room_gm(room_id) or private.is_character_owner(character_id) or private.is_global_admin());

create policy resource_bars_select_shared on public.resource_bars for select to authenticated
using (private.can_view_character(character_id) or private.is_global_admin());
create policy resource_bars_insert_owner_or_gm on public.resource_bars for insert to authenticated
with check (private.can_manage_character(character_id));
create policy resource_bars_update_owner_or_gm on public.resource_bars for update to authenticated
using (private.can_manage_character(character_id)) with check (private.can_manage_character(character_id));
create policy resource_bars_delete_owner_or_gm on public.resource_bars for delete to authenticated
using (private.can_manage_character(character_id));

create policy music_tracks_select_owner_or_playing_room on public.music_tracks for select to authenticated
using (private.can_view_track(id) or private.is_global_admin());
create policy music_tracks_insert_owner on public.music_tracks for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy music_tracks_update_owner on public.music_tracks for update to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin())
with check (owner_id = (select auth.uid()) or private.is_global_admin());
create policy music_tracks_delete_owner on public.music_tracks for delete to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin());

create policy playlists_select_owner_or_playing_room on public.playlists for select to authenticated
using (private.can_view_playlist(id) or private.is_global_admin());
create policy playlists_insert_owner on public.playlists for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy playlists_update_owner on public.playlists for update to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin())
with check (owner_id = (select auth.uid()) or private.is_global_admin());
create policy playlists_delete_owner on public.playlists for delete to authenticated
using (owner_id = (select auth.uid()) or private.is_global_admin());

create policy playlist_tracks_select_shared on public.playlist_tracks for select to authenticated
using (private.can_view_playlist(playlist_id) or private.is_global_admin());
create policy playlist_tracks_insert_owner on public.playlist_tracks for insert to authenticated
with check (private.is_playlist_owner(playlist_id) and private.is_track_owner(track_id));
create policy playlist_tracks_delete_owner on public.playlist_tracks for delete to authenticated
using (private.is_playlist_owner(playlist_id) or private.is_global_admin());

create policy room_music_state_select_members on public.room_music_state for select to authenticated
using (private.is_room_member(room_id) or private.is_global_admin());
create policy room_music_state_insert_gm on public.room_music_state for insert to authenticated
with check (private.is_room_gm(room_id) and (current_track_id is null or private.is_track_owner(current_track_id))
and (playlist_id is null or private.is_playlist_owner(playlist_id)));
create policy room_music_state_update_gm on public.room_music_state for update to authenticated
using (private.is_room_gm(room_id) or private.is_global_admin())
with check ((private.is_global_admin() or private.is_room_gm(room_id))
and (current_track_id is null or private.is_track_owner(current_track_id) or private.is_global_admin())
and (playlist_id is null or private.is_playlist_owner(playlist_id) or private.is_global_admin()));
create policy room_music_state_delete_gm on public.room_music_state for delete to authenticated
using (private.is_room_gm(room_id) or private.is_global_admin());

create policy screen_share_requests_select_members on public.screen_share_requests for select to authenticated
using (private.is_room_member(room_id) or private.is_global_admin());
create policy screen_share_requests_insert_member on public.screen_share_requests for insert to authenticated
with check (requester_id = (select auth.uid()) and private.is_room_member(room_id));
create policy screen_share_requests_update_gm_or_requester on public.screen_share_requests for update to authenticated
using (private.is_room_gm(room_id) or (requester_id = (select auth.uid()) and status = 'pending') or private.is_global_admin())
with check (private.is_room_gm(room_id) or (requester_id = (select auth.uid()) and status = 'cancelled') or private.is_global_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.invitations, public.rooms, public.room_members, public.room_invites,
  public.characters, public.room_characters, public.resource_bars, public.music_tracks,
  public.playlists, public.playlist_tracks, public.room_music_state, public.screen_share_requests
to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
