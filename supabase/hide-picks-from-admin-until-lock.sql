-- Run once in Supabase SQL Editor for an existing installation.
-- This keeps the existing fixture and account-management admin policies unchanged.

create or replace function public.can_view_match_picks(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and public.is_season_member(m.season_id)
      and now() >= m.starts_at - interval '30 minutes'
  );
$$;

drop policy if exists "members see own or locked picks" on public.predictions;
drop policy if exists "members see own or locked picks; admins cannot bypass lock" on public.predictions;
create policy "members see own or locked picks; admins cannot bypass lock"
on public.predictions for select to authenticated
using (user_id = auth.uid() or public.can_view_match_picks(match_id));
