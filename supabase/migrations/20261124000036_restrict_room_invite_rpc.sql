create or replace function private.join_room_with_invite(p_code_hash text)
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
  where ri.code_hash = p_code_hash and ri.room_id = target_room and r.id = ri.room_id
    and r.status = 'active' and (r.expires_at is null or r.expires_at > now())
    and (ri.expires_at is null or ri.expires_at > now()) and ri.uses_count < ri.max_uses;
  if not found then raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023'; end if;
  insert into public.room_members (room_id, user_id, role)
  values (target_room, (select auth.uid()), 'player') on conflict (room_id, user_id) do nothing;
  return target_room;
end;
$$;
revoke all on function private.join_room_with_invite(text) from public, anon;
grant execute on function private.join_room_with_invite(text) to authenticated;

create or replace function public.join_room_with_invite(p_code_hash text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.join_room_with_invite(p_code_hash); $$;
revoke all on function public.join_room_with_invite(text) from public, anon;
grant execute on function public.join_room_with_invite(text) to authenticated;
