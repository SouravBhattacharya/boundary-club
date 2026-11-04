# Boundary Club · IPL Prediction Pool

A private, mobile-friendly prediction pool for a small group of friends. The frontend is a static site for GitHub Pages; Supabase provides password sign-in, Postgres, row-level access rules, and settlement logic.

## Current status

The app is hosted with GitHub Pages and uses Supabase for authentication, data storage, and settlement. Keep `config.js` limited to the public project URL and publishable/anon key; never add a Supabase service-role key or passwords.

## Features in this starter

- Email/password registration. New accounts are immediately marked pending; an admin must approve them before they can read pool data.
- League, playoff, and final stakes configured per season.
- Fixture entry with India Standard Time; picks close 30 minutes before the scheduled start, enforced by Postgres.
- Picks and live team counts are hidden from everyone, including the admin, before lock. Admin privileges do not bypass pick privacy.
- Leaderboard, per-user match history, CSV export, and admin result entry.
- Integer-paise settlement, deterministic distribution of leftover paise, and idempotent result settlement. Result entry is currently manual; official result sync and auditable corrections are planned and require validation against the official source when the next season starts.
- Registration requires admin approval. The admin also plays under the same pick and visibility rules as other participants.

## Playing rules

### Players and season stakes

- Only registered players approved by the admin can participate. The admin is also a player and follows the same voting and visibility rules as everyone else.
- Before the season starts, the group sets a fixed stake for each match type: league, qualifier/eliminator, and final. The app shows the stake before a player submits a pick.

### Voting window and privacy

- Players can pick one of the two teams for an open match and may change that pick until voting closes.
- Voting closes **30 minutes before the scheduled match start**. This is intended to be before the toss. The database enforces the deadline, even if a browser page is stale.
- After the deadline, picks cannot be changed. If the schedule changes, the admin can update the fixture details.
- Before voting closes, nobody can see another player's pick or the vote count for either team—not even the admin. Each player can see their own pick. After voting closes, picks become visible to approved season members.

### Pool payout and missed picks

- For a match with at least one submitted pick correctly predicting the winning team, every season member's stake is included in the pool. The pool is divided equally among the correct predictors. Players who picked incorrectly or missed the deadline lose their stake for that match.
- Calculations use integer paise. Any indivisible remainder is assigned in stable user-ID order.
- If you miss the deadline and at least one submitted pick is correct, your stake is treated as lost and included in the pool.

### Refunds and no-result matches

- If nobody submits a pick, everyone gets their stake back and has zero profit or loss for that match.
- If all submitted picks choose the losing team, submitted picks are refunded and missed picks are not charged. Everyone breaks even for that match.
- If a match is abandoned, tied, or has no result, submitted picks are refunded and missed picks are not charged.
- No amount carries over to another match.

### Results, records, and fixtures

- The admin records the official match result and settles the match. The app then updates each player's profit/loss and the season standings. Match history shows picks and settlement details after the result is recorded.
- Fixtures and start times should follow the official IPL schedule. The admin may add or edit fixtures if needed and can enter a result manually.
- Fixture and result updates are currently manual. Automatic official schedule/result lookup and an in-app audited result-correction flow are not yet implemented.

## 1. Create Supabase project

1. Create a free project in Supabase and save its database password in your password manager.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Authentication → Providers**, enable Email, allow sign-ups, and turn **Confirm email** off. Registration creates a pending account without sending a confirmation email; pending users cannot read pool data. Supabase treats email addresses as confirmed when this option is off, so approve only people whose identity and email address you recognize.
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
8. In **Authentication → URL Configuration**, set **Site URL** to the deployed GitHub Pages app URL (`https://souravbhattacharya.github.io/boundary-club/`) and add that same URL to allowed redirect URLs for future authentication links. Remove any development URLs from the production allowlist. Signup sends no confirmation email or redirect.

The SQL creates a pending profile and registration request on sign-up. Approved users are added to each existing season; when you create a new season, approved profiles are enrolled automatically.

## 2. Publish with GitHub Pages for free

GitHub Pages on GitHub Free requires the Pages repository to be public. The app's source code will therefore be public, but the app requires an account approved by the pool admin to sign in to pool data. Do not commit passwords or service keys.

1. Create a **public** GitHub repository, for example `boundary-club`.
2. Upload the **contents of this folder** (so `index.html` is at the repository root).
3. In repository **Settings → Pages**, choose **GitHub Actions** as the publishing source. The workflow at `.github/workflows/pages.yml` will publish the site on pushes to `main`.
4. Wait for the Pages workflow to finish. Your URL will look like `https://YOUR-USERNAME.github.io/boundary-club/`.
5. Add that URL to Supabase's allowed redirect URL list.

## 3. Start a season

1. Sign in as the admin.
2. Open **Admin desk → Season & stakes**. Use a name such as `IPL 2027`; default stakes are ₹50 league, ₹100 qualifier/eliminator, and ₹200 final.
3. Once the official IPL/BCCI fixture list is announced, add each fixture and verify its scheduled start time against the official source. Enter times in IST. The app does not auto-scrape Google results or invent fixtures.
4. Apply the voting, privacy, payout, and refund rules in **Playing rules** above.
5. Review new accounts in **Admin desk → Review registrations** and approve only your friends.
6. After a match, open **Admin desk → Record official result** and settle it once. Results should be checked against an official IPL/BCCI report before settlement.

## Data and backups

- Export the visible match history as CSV from the app.
- Supabase Free has usage quotas, no downloadable database backups, and may pause projects after a week of low activity. Restore a paused project from the Supabase dashboard. For anything users rely on, take periodic CSV exports or choose a plan with appropriate backup/availability support.
- Never rely on the browser UI alone for access control; the schema enables row-level security and server-side deadline checks.

## Tests

Run the browser-independent unit tests with a current Node.js installation:

```powershell
node --test
```

These tests cover the pick cutoff, IST-to-UTC fixture conversion, pre-lock pick privacy data selection, duplicate-pick handling, registration status counting, HTML escaping, and mocked Supabase registration-request reads. Database policies and settlement SQL require integration tests against a Supabase/Postgres instance and are not exercised by this command.

## Project files

- `index.html` — app structure and views
- `styles.css` — responsive styling
- `app.js` — client behavior and Supabase calls
- `config.js` — public project URL and publishable key placeholders
- `supabase/schema.sql` — tables, access policies, triggers, and settlement function
- `.github/workflows/pages.yml` — GitHub Pages deployment
