alter table public.rooms drop constraint rooms_check;

create or replace function private.sync_room_closed_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status = 'active' and old.status = 'closed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger rooms_sync_closed_at
before update of status on public.rooms
for each row execute function private.sync_room_closed_at();

drop policy if exists "rooms_insert_creator" on public.rooms;
create policy rooms_insert_creator on public.rooms for insert to authenticated
with check (owner_id = (select auth.uid()) and status = 'active' and closed_at is null);
