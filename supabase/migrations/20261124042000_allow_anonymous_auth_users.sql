-- Anonymous participants authenticate through shared access tokens, not legacy invitations.
-- Keep invitation validation for any non-anonymous signup path.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invitation_admin boolean;
  invitation_hash text;
begin
  if new.is_anonymous then
    insert into public.profiles (id, display_name)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Jogador')
    )
    on conflict (id) do nothing;

    return new;
  end if;

  invitation_hash := new.raw_user_meta_data ->> 'invite_code_hash';

  if invitation_hash is null or length(invitation_hash) <> 64 then
    raise exception 'A valid invitation is required' using errcode = '28000';
  end if;

  update public.invitations
  set uses_count = uses_count + 1
  where code_hash = invitation_hash
    and (expires_at is null or expires_at > now())
    and uses_count < max_uses
  returning grant_global_admin into invitation_admin;

  if not found then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'jogador'), '@', 1))
  )
  on conflict (id) do nothing;

  if invitation_admin then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('global_role', 'admin')
    where id = new.id;
  end if;

  return new;
end;
$function$;
