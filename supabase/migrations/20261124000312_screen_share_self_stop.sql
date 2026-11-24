create policy screen_share_requests_update_self_stop
on public.screen_share_requests for update to authenticated
using (requester_id = (select auth.uid()) and status = 'approved')
with check (requester_id = (select auth.uid()) and status = 'stopped');
