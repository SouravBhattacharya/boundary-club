-- Boundary Club IPL Pool: run this entire script in Supabase SQL Editor.
-- All currency is calculated as integer paise. Never put the service_role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pool member',
  role text not null default 'member' check (role in ('member','admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected'));

create table if not exists public.registration_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stake_league integer not null check (stake_league > 0),
  stake_playoff integer not null check (stake_playoff > 0),
  stake_final integer not null check (stake_final > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.season_members (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_a text not null,
  team_b text not null,
  category text not null check (category in ('league','playoff','final')),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','void')),
  outcome text check (outcome in ('team_a','team_b','void')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lower(team_a) <> lower(team_b)),
  check ((status = 'scheduled' and outcome is null) or (status = 'completed' and outcome in ('team_a','team_b')) or (status = 'void' and outcome = 'void'))
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  predicted_team text not null check (predicted_team in ('team_a','team_b')),
  updated_at timestamptz not null default now(),
  unique (match_id,user_id)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  match_id uuid references public.matches(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stake_paise bigint not null default 0 check (stake_paise >= 0),
  payout_paise bigint not null default 0 check (payout_paise >= 0),
  net_paise bigint not null,
  entry_type text not null check (entry_type in ('win','loss','missed','refund','no_pick_refund')),
  created_at timestamptz not null default now(),
  unique (match_id,user_id)
);

create index if not exists matches_season_start_idx on public.matches(season_id, starts_at);
create index if not exists predictions_match_user_idx on public.predictions(match_id,user_id);
create index if not exists ledger_season_user_idx on public.ledger_entries(season_id,user_id);
create index if not exists audit_match_created_idx on public.admin_audit_log(match_id,created_at desc);

create or replace function public.is_pool_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.approval_status='approved'); $$;

create or replace function public.is_season_member(p_season_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.season_members sm join public.profiles p on p.id=sm.user_id where sm.season_id = p_season_id and sm.user_id = auth.uid() and p.approval_status='approved'); $$;

create or replace function public.can_view_match_picks(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id and (
      public.is_pool_admin() or
      public.is_season_member(m.season_id) and now() >= m.starts_at - interval '30 minutes'
    )
  );
$$;

create or replace function public.add_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, approval_status)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1), 'Pool member'), 'pending')
  on conflict (id) do nothing;
  insert into public.registration_requests(user_id,email,display_name)
  values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1),'Pool member'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.add_new_user();

alter table public.profiles enable row level security;
alter table public.registration_requests enable row level security;
alter table public.seasons enable row level security;
alter table public.season_members enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "profiles visible to signed-in pool" on public.profiles;
create policy "profiles visible to signed-in pool" on public.profiles for select to authenticated using (auth.uid() = id or public.is_pool_admin() or (approval_status='approved' and exists (select 1 from public.season_members a join public.season_members b on a.season_id=b.season_id where a.user_id=auth.uid() and b.user_id=profiles.id)));
drop policy if exists "admins review profiles" on public.profiles;
create policy "admins review profiles" on public.profiles for update to authenticated using (public.is_pool_admin()) with check (public.is_pool_admin());
revoke update on public.profiles from anon, authenticated;
grant update(approval_status,role) on public.profiles to authenticated;
drop policy if exists "admins read registrations" on public.registration_requests;
create policy "admins read registrations" on public.registration_requests for select to authenticated using (public.is_pool_admin());

drop policy if exists "season members can read season" on public.seasons;
create policy "season members can read season" on public.seasons for select to authenticated using (public.is_season_member(id) or public.is_pool_admin());
drop policy if exists "admins create season" on public.seasons;
create policy "admins create season" on public.seasons for insert to authenticated with check (public.is_pool_admin() and created_by = auth.uid());
drop policy if exists "admins update season" on public.seasons;
create policy "admins update season" on public.seasons for update to authenticated using (public.is_pool_admin()) with check (public.is_pool_admin());

drop policy if exists "members see their season roster" on public.season_members;
create policy "members see their season roster" on public.season_members for select to authenticated using (public.is_season_member(season_id) or public.is_pool_admin());
drop policy if exists "admins manage season roster" on public.season_members;
create policy "admins manage season roster" on public.season_members for all to authenticated using (public.is_pool_admin()) with check (public.is_pool_admin());

drop policy if exists "members see fixtures" on public.matches;
create policy "members see fixtures" on public.matches for select to authenticated using (public.is_season_member(season_id) or public.is_pool_admin());
drop policy if exists "admins create fixtures" on public.matches;
create policy "admins create fixtures" on public.matches for insert to authenticated with check (public.is_pool_admin() and created_by = auth.uid());
drop policy if exists "admins update fixtures" on public.matches;
create policy "admins update fixtures" on public.matches for update to authenticated using (public.is_pool_admin()) with check (public.is_pool_admin());
revoke update on public.matches from anon, authenticated;
grant update(team_a,team_b,category,starts_at) on public.matches to authenticated;

drop policy if exists "members see own or locked picks" on public.predictions;
create policy "members see own or locked picks" on public.predictions for select to authenticated using (user_id = auth.uid() or public.can_view_match_picks(match_id));
drop policy if exists "members create own timely pick" on public.predictions;
create policy "members create own timely pick" on public.predictions for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.matches m join public.season_members sm on sm.season_id=m.season_id
    where m.id=match_id and sm.user_id=auth.uid() and m.status='scheduled' and now() < m.starts_at - interval '30 minutes'
  )
);
drop policy if exists "members update own timely pick" on public.predictions;
create policy "members update own timely pick" on public.predictions for update to authenticated using (
  user_id = auth.uid() and exists (select 1 from public.matches m where m.id=match_id and m.status='scheduled' and now() < m.starts_at - interval '30 minutes')
) with check (user_id = auth.uid() and predicted_team in ('team_a','team_b') and exists (select 1 from public.matches m join public.season_members sm on sm.season_id=m.season_id where m.id=match_id and sm.user_id=auth.uid() and m.status='scheduled' and now() < m.starts_at - interval '30 minutes'));

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log" on public.admin_audit_log for select to authenticated using (public.is_pool_admin());

create or replace function public.audit_match_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_audit_log(actor_id,action,match_id,details) values(auth.uid(),'match_created',new.id,jsonb_build_object('team_a',new.team_a,'team_b',new.team_b,'category',new.category,'starts_at',new.starts_at));
    return new;
  end if;
  if row(new.team_a,new.team_b,new.category,new.starts_at) is distinct from row(old.team_a,old.team_b,old.category,old.starts_at) then
    insert into public.admin_audit_log(actor_id,action,match_id,details) values(auth.uid(),'match_schedule_updated',new.id,jsonb_build_object('before',jsonb_build_object('team_a',old.team_a,'team_b',old.team_b,'category',old.category,'starts_at',old.starts_at),'after',jsonb_build_object('team_a',new.team_a,'team_b',new.team_b,'category',new.category,'starts_at',new.starts_at)));
  end if;
  if row(new.status,new.outcome) is distinct from row(old.status,old.outcome) then
    insert into public.admin_audit_log(actor_id,action,match_id,details) values(auth.uid(),'match_result_recorded',new.id,jsonb_build_object('status',new.status,'outcome',new.outcome));
  end if;
  return new;
end;
$$;
drop trigger if exists matches_audit_changes on public.matches;
create trigger matches_audit_changes after insert or update on public.matches for each row execute procedure public.audit_match_change();

-- Only members can view accounting after a match has been settled.
drop policy if exists "members view settled ledger" on public.ledger_entries;
create policy "members view settled ledger" on public.ledger_entries for select to authenticated using (
  public.is_season_member(season_id) and exists (select 1 from public.matches m where m.id=match_id and m.status in ('completed','void'))
);

create or replace function public.review_registration(p_user_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_pool_admin() then raise exception 'Only an approved pool admin can review registrations'; end if;
  if not exists (select 1 from public.registration_requests where user_id=p_user_id and status='pending') then raise exception 'Registration is not pending'; end if;
  update public.profiles set approval_status=case when p_approved then 'approved' else 'rejected' end where id=p_user_id;
  update public.registration_requests set status=case when p_approved then 'approved' else 'rejected' end, reviewed_at=now(), reviewed_by=auth.uid() where user_id=p_user_id;
  if p_approved then
    insert into public.season_members(season_id,user_id) select s.id,p_user_id from public.seasons s on conflict do nothing;
  else
    delete from public.season_members where user_id=p_user_id;
  end if;
end;
$$;
revoke all on function public.review_registration(uuid,boolean) from public;
grant execute on function public.review_registration(uuid,boolean) to authenticated;

create or replace function public.settle_match(p_match_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_season public.seasons%rowtype;
  v_stake bigint;
  v_members integer;
  v_submitted integer;
  v_correct integer;
  v_pool bigint;
  v_base bigint;
  v_remainder bigint;
  v_member record;
  v_pred text;
  v_entry_type text;
  v_user_stake bigint;
  v_payout bigint;
  v_net bigint;
  v_final_outcome text;
begin
  if not public.is_pool_admin() then raise exception 'Only a pool admin can record a result'; end if;
  if p_outcome not in ('team_a','team_b','void') then raise exception 'Invalid result'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'scheduled' then raise exception 'This match has already been settled'; end if;
  if now() < v_match.starts_at then raise exception 'A result cannot be recorded before the scheduled start time'; end if;
  select * into v_season from public.seasons where id=v_match.season_id;
  v_stake := case v_match.category when 'final' then v_season.stake_final when 'playoff' then v_season.stake_playoff else v_season.stake_league end * 100;
  select count(*) into v_members from public.season_members where season_id=v_match.season_id;
  if v_members = 0 then raise exception 'Add season participants before settling this match'; end if;
  select count(*) into v_submitted from public.predictions where match_id=p_match_id;
  select count(*) into v_correct from public.predictions where match_id=p_match_id and predicted_team=p_outcome;
  v_final_outcome := case when p_outcome='void' then 'void' else p_outcome end;
  update public.matches set status=case when p_outcome='void' then 'void' else 'completed' end, outcome=v_final_outcome, updated_at=now() where id=p_match_id;

  -- Void/no-result, no submissions, or no correct submitted picks: refund the applicable stake and record zero P/L.
  if p_outcome='void' or v_submitted=0 or v_correct=0 then
    for v_member in select sm.user_id from public.season_members sm where sm.season_id=v_match.season_id loop
      select pr.predicted_team into v_pred from public.predictions pr where pr.match_id=p_match_id and pr.user_id=v_member.user_id;
      v_user_stake := case when v_submitted=0 or v_pred is not null then v_stake else 0 end;
      v_payout := v_user_stake;
      v_net := 0;
      v_entry_type := case when v_pred is null and v_submitted>0 then 'no_pick_refund' else 'refund' end;
      insert into public.ledger_entries(season_id,match_id,user_id,stake_paise,payout_paise,net_paise,entry_type)
      values(v_match.season_id,p_match_id,v_member.user_id,v_user_stake,v_payout,v_net,v_entry_type);
    end loop;
    return;
  end if;

  v_pool := v_members * v_stake;
  v_base := v_pool / v_correct;
  v_remainder := v_pool % v_correct;
  for v_member in select sm.user_id from public.season_members sm where sm.season_id=v_match.season_id order by sm.user_id loop
    select pr.predicted_team into v_pred from public.predictions pr where pr.match_id=p_match_id and pr.user_id=v_member.user_id;
    v_user_stake := v_stake;
    if v_pred=p_outcome then
      v_payout := v_base;
      if v_remainder > 0 then v_payout := v_payout + 1; v_remainder := v_remainder - 1; end if;
      v_net := v_payout-v_user_stake;
      v_entry_type := 'win';
    elsif v_pred is null then
      v_payout := 0; v_net := -v_user_stake; v_entry_type := 'missed';
    else
      v_payout := 0; v_net := -v_user_stake; v_entry_type := 'loss';
    end if;
    insert into public.ledger_entries(season_id,match_id,user_id,stake_paise,payout_paise,net_paise,entry_type)
    values(v_match.season_id,p_match_id,v_member.user_id,v_user_stake,v_payout,v_net,v_entry_type);
  end loop;
end;
$$;
revoke all on function public.settle_match(uuid,text) from public;
grant execute on function public.settle_match(uuid,text) to authenticated;

-- Use Supabase Auth to add invited users. Their profiles and season memberships are created automatically.
-- After creating your own Auth user, promote that profile using the one-time SQL shown in README.md.
