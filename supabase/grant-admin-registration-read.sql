-- Run this for an existing project if the Admin desk cannot read requests.
-- Row-level security remains enabled and the existing admins-read policy
-- continues to restrict which authenticated users can see request rows.
grant select on table public.registration_requests to authenticated;
