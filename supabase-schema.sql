-- Patalympics Supabase schema
-- In Supabase: SQL Editor öffnen, diesen Inhalt einfügen und ausführen.
-- Wichtig: Niemals den service_role key in die Website einbauen.

create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_availability_answers (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  answers jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_name)
);

create table if not exists public.poll_game_suggestions (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  suggestion text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_game_votes (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_name)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  participant_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  login_name text unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users add column if not exists login_name text unique;

alter table public.site_content enable row level security;
alter table public.poll_availability_answers enable row level security;
alter table public.poll_game_suggestions enable row level security;
alter table public.poll_game_votes enable row level security;
alter table public.participants enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant select on public.site_content to anon;
grant select, insert, update, delete on public.site_content to authenticated;
grant select, insert, update, delete on public.poll_availability_answers to anon;
grant select, insert, update, delete on public.poll_availability_answers to authenticated;
grant select, insert, delete on public.poll_game_suggestions to anon;
grant select, insert, update, delete on public.poll_game_suggestions to authenticated;
grant select, insert, update, delete on public.poll_game_votes to anon;
grant select, insert, update, delete on public.poll_game_votes to authenticated;
grant insert on public.participants to anon;
grant select, insert, update, delete on public.participants to authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.resolve_admin_login(login_value text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.admin_users
  where lower(email) = lower(trim(login_value))
     or lower(split_part(email, '@', 1)) = lower(trim(login_value))
     or lower(coalesce(login_name, '')) = lower(trim(login_value))
  limit 1;
$$;

grant execute on function public.resolve_admin_login(text) to anon, authenticated;

create or replace function public.register_participant(participant_name_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text := nullif(trim(participant_name_input), '');
begin
  if cleaned_name is null or char_length(cleaned_name) > 80 then
    raise exception 'Invalid participant name';
  end if;

  insert into public.participants (participant_name)
  values (cleaned_name)
  on conflict (participant_name) do nothing;
end;
$$;

create or replace function public.participant_exists(participant_name_input text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants
    where lower(trim(participant_name)) = lower(trim(participant_name_input))
  );
$$;

create or replace function public.admin_rename_participant(old_name text, new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_clean text := nullif(trim(old_name), '');
  new_clean text := nullif(trim(new_name), '');
begin
  if not exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  ) then
    raise exception 'Admin access required';
  end if;

  if old_clean is null or new_clean is null or char_length(new_clean) > 80 then
    raise exception 'Invalid participant name';
  end if;

  if lower(old_clean) = lower(new_clean) then
    insert into public.participants (participant_name)
    values (new_clean)
    on conflict (participant_name) do nothing;
    return;
  end if;

  if exists (select 1 from public.participants where lower(trim(participant_name)) = lower(new_clean)) then
    delete from public.participants
    where lower(trim(participant_name)) = lower(old_clean);
  else
    update public.participants
    set participant_name = new_clean
    where lower(trim(participant_name)) = lower(old_clean);

    if not found then
      insert into public.participants (participant_name)
      values (new_clean)
      on conflict (participant_name) do nothing;
    end if;
  end if;

  if exists (select 1 from public.poll_availability_answers where lower(trim(participant_name)) = lower(new_clean)) then
    delete from public.poll_availability_answers
    where lower(trim(participant_name)) = lower(old_clean);
  else
    update public.poll_availability_answers
    set participant_name = new_clean
    where lower(trim(participant_name)) = lower(old_clean);
  end if;

  update public.poll_game_suggestions
  set participant_name = new_clean
  where lower(trim(participant_name)) = lower(old_clean);

  if exists (select 1 from public.poll_game_votes where lower(trim(participant_name)) = lower(new_clean)) then
    delete from public.poll_game_votes
    where lower(trim(participant_name)) = lower(old_clean);
  else
    update public.poll_game_votes
    set participant_name = new_clean
    where lower(trim(participant_name)) = lower(old_clean);
  end if;
end;
$$;

create or replace function public.admin_delete_participant(participant_name_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text := nullif(trim(participant_name_input), '');
begin
  if not exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  ) then
    raise exception 'Admin access required';
  end if;

  if cleaned_name is null then
    raise exception 'Invalid participant name';
  end if;

  delete from public.participants where lower(trim(participant_name)) = lower(cleaned_name);
  delete from public.poll_availability_answers where lower(trim(participant_name)) = lower(cleaned_name);
  delete from public.poll_game_suggestions where lower(trim(participant_name)) = lower(cleaned_name);
  delete from public.poll_game_votes where lower(trim(participant_name)) = lower(cleaned_name);
end;
$$;

grant execute on function public.register_participant(text) to anon, authenticated;
grant execute on function public.participant_exists(text) to anon, authenticated;
grant execute on function public.admin_rename_participant(text, text) to authenticated;
grant execute on function public.admin_delete_participant(text) to authenticated;

drop policy if exists "public read site content" on public.site_content;
create policy "public read site content"
on public.site_content for select
to anon, authenticated
using (true);

drop policy if exists "admin insert site content" on public.site_content;
create policy "admin insert site content"
on public.site_content for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin update site content" on public.site_content;
create policy "admin update site content"
on public.site_content for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin delete site content" on public.site_content;
create policy "admin delete site content"
on public.site_content for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "public read availability" on public.poll_availability_answers;
create policy "public read availability"
on public.poll_availability_answers for select
to anon, authenticated
using (true);

drop policy if exists "public write availability" on public.poll_availability_answers;
create policy "public write availability"
on public.poll_availability_answers for insert
to anon, authenticated
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public update own availability by name" on public.poll_availability_answers;
create policy "public update own availability by name"
on public.poll_availability_answers for update
to anon, authenticated
using (char_length(participant_name) between 1 and 80)
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public delete availability" on public.poll_availability_answers;
drop policy if exists "admin delete availability" on public.poll_availability_answers;
create policy "admin delete availability"
on public.poll_availability_answers for delete
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "public read suggestions" on public.poll_game_suggestions;
create policy "public read suggestions"
on public.poll_game_suggestions for select
to anon, authenticated
using (true);

drop policy if exists "public write suggestions" on public.poll_game_suggestions;
create policy "public write suggestions"
on public.poll_game_suggestions for insert
to anon, authenticated
with check (
  char_length(participant_name) between 1 and 80
  and char_length(suggestion) between 1 and 500
);

drop policy if exists "public delete suggestions" on public.poll_game_suggestions;
drop policy if exists "admin delete suggestions" on public.poll_game_suggestions;
create policy "admin delete suggestions"
on public.poll_game_suggestions for delete
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and char_length(suggestion) between 1 and 500
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin update suggestions" on public.poll_game_suggestions;
create policy "admin update suggestions"
on public.poll_game_suggestions for update
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and char_length(suggestion) between 1 and 500
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  char_length(participant_name) between 1 and 80
  and char_length(suggestion) between 1 and 500
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "public read votes" on public.poll_game_votes;
create policy "public read votes"
on public.poll_game_votes for select
to anon, authenticated
using (true);

drop policy if exists "public write votes" on public.poll_game_votes;
create policy "public write votes"
on public.poll_game_votes for insert
to anon, authenticated
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public update own votes by name" on public.poll_game_votes;
create policy "public update own votes by name"
on public.poll_game_votes for update
to anon, authenticated
using (char_length(participant_name) between 1 and 80)
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "public delete votes" on public.poll_game_votes;
drop policy if exists "admin delete votes" on public.poll_game_votes;
create policy "admin delete votes"
on public.poll_game_votes for delete
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "public write participants" on public.participants;
create policy "public write participants"
on public.participants for insert
to anon, authenticated
with check (char_length(participant_name) between 1 and 80);

drop policy if exists "admin read participants" on public.participants;
create policy "admin read participants"
on public.participants for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin delete participants" on public.participants;
create policy "admin delete participants"
on public.participants for delete
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin update participants" on public.participants;
create policy "admin update participants"
on public.participants for update
to authenticated
using (
  char_length(participant_name) between 1 and 80
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
)
with check (
  char_length(participant_name) between 1 and 80
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = auth.uid()
  )
);

drop policy if exists "admin users can read own row" on public.admin_users;
create policy "admin users can read own row"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

insert into public.site_content (key, value)
values
  ('adminNewsData', '[]'::jsonb),
  ('adminCalendarData', '[]'::jsonb),
  ('adminScheduleNoteData', '{"height":420,"boxes":[]}'::jsonb),
  ('adminPollData', '{
    "availability": { "published": false, "info": "", "startDate": "", "endDate": "" },
    "suggestions": { "published": false, "info": "" },
    "gameVote": { "published": false, "info": "", "groups": [] }
  }'::jsonb),
  ('adminRankingData', '{
    "mode": "solo",
    "bracketEnabled": false,
    "bracketResults": {},
    "days": [
      { "label": "Day 1", "games": ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] },
      { "label": "Day 2", "games": ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5"] }
    ],
    "players": []
  }'::jsonb),
  ('adminHallOfFameData', '[]'::jsonb),
  ('adminSponsorData', '[]'::jsonb),
  ('adminShopData', '[]'::jsonb)
on conflict (key) do nothing;

insert into public.admin_users (user_id, email, login_name)
values ('b8c123a0-29b9-4b28-9dba-5a5eb9d1a2a5', 'paddy@patalympics.com', 'paddy')
on conflict (user_id) do update
set email = excluded.email,
    login_name = excluded.login_name;
