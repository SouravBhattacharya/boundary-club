# Boundary Club · IPL Prediction Pool

A private, mobile-friendly prediction pool for a small group of friends. The frontend is a static site for GitHub Pages; Supabase provides password sign-in, Postgres, row-level access rules, and settlement logic.

## Current status

This is a local starter app. It has **not** been connected to GitHub or Supabase and is not online. No account credentials are included. Create a Supabase project, run `supabase/schema.sql`, configure `config.js`, then publish this folder to a public GitHub repository with Pages enabled.

## Features in this starter

- Email/password registration. New accounts stay pending until an admin approves or rejects them; pending accounts cannot read seasons, picks, or standings.
- League, playoff, and final stakes configured per season.
- Fixture entry with India Standard Time; picks close 30 minutes before the scheduled start, enforced by Postgres.
- Picks are hidden from other participants before lock and visible after lock.
- Leaderboard, per-user match history, CSV export, and admin result entry.
- Integer-paise settlement, deterministic distribution of leftover paise, and idempotent result settlement. Result entry is currently manual; official result sync and auditable corrections are planned and require validation against the official source when the next season starts.
- Refunds for abandoned/tied/no-result matches, a match where every submitted pick is wrong, and a match where nobody submitted a pick. A missed pick is charged when at least one submitted pick correctly predicts the winner.

## Settlement behavior for no submissions

If nobody submits a pick, every participant is charged the configured stake and the total pool is divided equally among all participants. Each person gets their stake back and has zero P/L. This matches the result when everyone picks the same side: regardless of whether that side wins, each person gets their stake back.

## 1. Create Supabase project

1. Create a free project in Supabase and save its database password in your password manager.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Authentication → Providers**, enable Email and allow sign-ups. Registration is open, but database policies keep every new account pending until an admin approves it. Configure email confirmation to match your email delivery setup.
4. Copy the project URL and the **publishable key** (or legacy anon key) from **Project Settings → API**. The publishable/anon key is designed for browser use; database row-level policies protect the data. Never use the `service_role` key in frontend code.
5. Edit `config.js` and replace both placeholder values. `config.js` is public in the deployed site. It must contain only the project URL and publishable/anon key.
6. Publish the site, open its URL, and register your own account. If email confirmation is enabled, confirm the message before proceeding. In SQL Editor, promote your profile to the first approved admin. Replace the email with your own:

   ```sql
   update public.profiles
   set role = 'admin', approval_status = 'approved'
   where id = (select id from auth.users where email = 'you@example.com');
   update public.registration_requests
   set status = 'approved', reviewed_at = now()
   where user_id = (select id from auth.users where email = 'you@example.com');
   ```

7. Ask the rest of the group to register from the app. Their accounts remain pending and cannot access pool data until you approve them in **Admin desk → Review registrations**. Approval adds them to existing seasons.
8. In **Authentication → URL Configuration**, add the deployed GitHub Pages URL to allowed redirect URLs. This supports confirmation and future password recovery links.

The SQL creates a pending profile and registration request on sign-up. Approved users are added to each existing season; when you create a new season, approved profiles are enrolled automatically.

## 2. Publish with GitHub Pages for free

GitHub Pages on GitHub Free requires the Pages repository to be public. The app's source code will therefore be public, but the app requires an account approved by the pool admin to sign in to pool data. Do not commit passwords or service keys.

1. Create a **public** GitHub repository, for example `boundary-club`.
2. Upload the **contents of this folder** (so `index.html` is at the repository root).
3. In repository **Settings → Pages**, choose **GitHub Actions** as the publishing source. The workflow at `.github/workflows/pages.yml` will publish the site on pushes to `main`.
4. Wait for the Pages workflow to finish. Your URL will look like `https://YOUR-USERNAME.github.io/boundary-club/`.
5. Add that URL to Supabase's allowed redirect URL list.

You can also preview locally using Python's static server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. The Supabase URL/key must be configured first for sign-in to work.

## 3. Start a season

1. Sign in as the admin.
2. Open **Admin desk → Season & stakes**. Use a name such as `IPL 2027`; default stakes are ₹50 league, ₹100 qualifier/eliminator, and ₹200 final.
3. Once the official IPL/BCCI fixture list is announced, add each fixture and verify its scheduled start time against the official source. Enter times in IST. The app does not auto-scrape Google results or invent fixtures.
4. Picks open until exactly 30 minutes before the scheduled start. The database rejects late submissions and edits even if a browser page is stale.
5. Review new accounts in **Admin desk → Review registrations** and approve only your friends.
6. After a match, open **Admin desk → Record official result** and settle it once. Results should be checked against an official IPL/BCCI report before settlement.

## Accounting rules implemented

- For normal settled matches with at least one correct submitted pick, every season member has the match stake. A correct picker's payout is the whole pool divided equally among correct pickers; missed and incorrect picks lose their stake.
- Calculations use integer paise. Extra paise are assigned to correct pickers in stable user-ID order.
- For a void/no-result match, submitted picks are refunded and missed picks are not charged.
- If there are submitted picks but no correct pick, submitted picks are refunded and missed-pick defaults are waived. No carryover is created.
- If nobody submits a pick, everyone is charged and refunded the stake, resulting in zero P/L for every participant. No carryover is created.

## Data and backups

- Export the visible match history as CSV from the app.
- Supabase Free has usage quotas, no downloadable database backups, and may pause projects after a week of low activity. Restore a paused project from the Supabase dashboard. For anything users rely on, take periodic CSV exports or choose a plan with appropriate backup/availability support.
- Never rely on the browser UI alone for access control; the schema enables row-level security and server-side deadline checks.

## Project files

- `index.html` — app structure and views
- `styles.css` — responsive styling
- `app.js` — client behavior and Supabase calls
- `config.js` — public project URL and publishable key placeholders
- `supabase/schema.sql` — tables, access policies, triggers, and settlement function
- `.github/workflows/pages.yml` — GitHub Pages deployment
