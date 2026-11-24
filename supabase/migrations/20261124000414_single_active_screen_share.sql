create unique index screen_share_one_approved_per_room
on public.screen_share_requests(room_id)
where status = 'approved';
