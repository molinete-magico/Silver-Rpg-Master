-- Keep exposed RPCs SECURITY INVOKER. Privileged work stays in private schema,
-- with explicit authorization checks and EXECUTE grants.

create or replace function private.redeem_access_token(p_token_hash text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare target_token uuid;
begin
  if (select auth.uid()) is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Anonymous participant session required' using errcode = '42501';
  end if;
  select t.id into target_token from public.access_tokens t
  where t.token_hash = p_token_hash and t.revoked_at is null;
  if target_token is null then raise exception 'Invalid or revoked access token' using errcode = '22023'; end if;
  insert into public.access_grants (user_id, token_id)
  values ((select auth.uid()), target_token)
  on conflict (user_id) do update set token_id = excluded.token_id, granted_at = now();
  return true;
end;
$$;

create or replace function private.create_access_token(p_token_hash text, p_label text default 'Acesso compartilhado') returns uuid
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

create or replace function private.list_access_tokens()
returns table(id uuid, label text, created_at timestamptz, revoked_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_global_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select t.id, t.label, t.created_at, t.revoked_at
  from public.access_tokens t order by t.created_at desc;
end;
$$;

create or replace function private.revoke_access_token(p_token_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_global_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.access_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_token_id;
  return found;
end;
$$;

create or replace function private.join_open_room(p_room_id uuid) returns uuid
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
language sql stable security invoker set search_path = ''
as $$ select private.has_valid_access(); $$;

create or replace function public.redeem_access_token(p_token_hash text) returns boolean
language sql security invoker set search_path = ''
as $$ select private.redeem_access_token(p_token_hash); $$;

create or replace function public.create_access_token(p_token_hash text, p_label text default 'Acesso compartilhado') returns uuid
language sql security invoker set search_path = ''
as $$ select private.create_access_token(p_token_hash, p_label); $$;

create or replace function public.list_access_tokens()
returns table(id uuid, label text, created_at timestamptz, revoked_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.list_access_tokens(); $$;

create or replace function public.revoke_access_token(p_token_id uuid) returns boolean
language sql security invoker set search_path = ''
as $$ select private.revoke_access_token(p_token_id); $$;

create or replace function public.join_open_room(p_room_id uuid) returns uuid
language sql security invoker set search_path = ''
as $$ select private.join_open_room(p_room_id); $$;

revoke all on function public.has_valid_access() from public, anon;
revoke all on function public.redeem_access_token(text) from public, anon;
revoke all on function public.create_access_token(text, text) from public, anon;
revoke all on function public.list_access_tokens() from public, anon;
revoke all on function public.revoke_access_token(uuid) from public, anon;
revoke all on function public.join_open_room(uuid) from public, anon;
grant execute on function public.has_valid_access() to authenticated;
grant execute on function public.redeem_access_token(text) to authenticated;
grant execute on function public.create_access_token(text, text) to authenticated;
grant execute on function public.list_access_tokens() to authenticated;
grant execute on function public.revoke_access_token(uuid) to authenticated;
grant execute on function public.join_open_room(uuid) to authenticated;

revoke all on function private.redeem_access_token(text) from public, anon;
revoke all on function private.create_access_token(text, text) from public, anon;
revoke all on function private.list_access_tokens() from public, anon;
revoke all on function private.revoke_access_token(uuid) from public, anon;
revoke all on function private.join_open_room(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.redeem_access_token(text) to authenticated;
grant execute on function private.create_access_token(text, text) to authenticated;
grant execute on function private.list_access_tokens() to authenticated;
grant execute on function private.revoke_access_token(uuid) to authenticated;
grant execute on function private.join_open_room(uuid) to authenticated;

create policy access_tokens_deny_direct on public.access_tokens for all to authenticated
using (false) with check (false);
create policy access_grants_deny_direct on public.access_grants for all to authenticated
using (false) with check (false);

create index if not exists access_tokens_created_by_idx on public.access_tokens(created_by);
