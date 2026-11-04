import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { escapeHtml, isPickWindowOpen, lockAt, parseIndiaDateTime, pendingRegistrationCount, visiblePicks } from './app-core.js';
import { fetchRegistrationRequests } from './app-data.js';

const configured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_URL.includes('YOUR_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const state = { session: null, profile: null, seasons: [], season: null, members: [], matches: [], picks: [], ledger: [], profiles: [], registrationRequests: [], view: 'home', selectedSeasonId: null, activeMatch: null, activeSettle: null };
const $ = (id) => document.getElementById(id);
document.addEventListener('click', (event) => {
  if (!event.target.closest('#refresh-registrations')) return;
  event.preventDefault();
  refreshRegistrations();
}, true);
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0) / 100);
const rupees = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0));
const initials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const teamCode = (s) => (s || '??').split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase();
const esc = escapeHtml;
const isOpen = (m) => isPickWindowOpen(m);
const memberName = (id) => state.profiles.find(p => p.id === id)?.display_name || 'Pool member';

function notice(message, type = 'info') {
  const el = $('notice'); el.className = `notice ${type}`; el.textContent = message;
  window.clearTimeout(notice.timer); notice.timer = window.setTimeout(() => el.classList.add('hidden'), 6500);
}
function fail(error, fallback = 'Something went wrong. Please try again.') {
  console.error(error); notice(error?.message || fallback, 'error');
}
function indiaDate(date, options = {}) { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(new Date(date)); }
const parseIndiaInput = parseIndiaDateTime;
function setView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('page-title').textContent = ({ home: 'Pick your winner', standings: 'Season standings', history: 'Season history', admin: 'Admin desk' })[view] || 'Pick your winner';
  if (state.session) render();
}

function syncAuth() {
  const signedIn = !!state.session;
  const approved = state.profile?.approval_status === 'approved';
  $('auth-view').classList.toggle('hidden', signedIn);
  $('approval-view').classList.toggle('hidden', !signedIn || approved);
  $('app-view').classList.toggle('hidden', !approved || state.view !== 'home');
  $('sign-out').classList.toggle('hidden', !signedIn);
  $('user-name').textContent = state.profile?.display_name || state.session?.user.email || 'Guest';
  $('header-name').textContent = state.profile?.display_name || 'Member';
  $('user-avatar').textContent = initials(state.profile?.display_name || state.session?.user.email);
  $('header-avatar').textContent = initials(state.profile?.display_name || state.session?.user.email);
  $('user-role').textContent = state.profile?.role === 'admin' ? 'Pool admin' : approved ? 'Pool member' : 'Awaiting approval';
  $('header-sign-out').classList.toggle('hidden', !signedIn);
  if (state.profile?.approval_status === 'rejected') { $('approval-title').textContent = 'Registration not approved'; $('approval-copy').textContent = 'Your request was not approved. Contact the pool admin if you think this is a mistake.'; }
  else { $('approval-title').textContent = 'Your request is pending approval'; $('approval-copy').textContent = 'Your registration is in the admin desk. You can play as soon as the admin approves your account.'; }
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', state.profile?.role !== 'admin' || !approved));
}
async function loadData() {
  if (!supabase || !state.session) return;
  const profileRes = await supabase.from('profiles').select('id,display_name,role,approval_status').eq('id', state.session.user.id).maybeSingle();
  if (profileRes.error) throw profileRes.error;
  state.profile = profileRes.data || { id: state.session.user.id, display_name: state.session.user.email, role: 'member', approval_status: 'pending' };
  state.seasons = []; state.season = null; state.members = []; state.matches = []; state.picks = []; state.ledger = []; state.profiles = []; state.registrationRequests = [];
  if (state.profile.approval_status !== 'approved') return;
  const seasonsRes = await supabase.from('seasons').select('*').order('created_at', { ascending: false });
  if (seasonsRes.error) throw seasonsRes.error;
  state.seasons = seasonsRes.data || [];
  state.season = state.seasons.find(s => s.id === state.selectedSeasonId) || state.seasons[0] || null;
  state.selectedSeasonId = state.season?.id || null;
  if (state.season) {
    const [memberRes, matchRes, ownPickRes, ledgerRes, peopleRes] = await Promise.all([
      supabase.from('season_members').select('user_id,season_id').eq('season_id', state.season.id),
      supabase.from('matches').select('*').eq('season_id', state.season.id).order('starts_at'),
      supabase.from('predictions').select('id,match_id,user_id,predicted_team,updated_at').eq('user_id', state.session.user.id),
      supabase.from('ledger_entries').select('*').eq('season_id', state.season.id),
      supabase.from('profiles').select('id,display_name,role,approval_status')
    ]);
    for (const r of [memberRes, matchRes, ownPickRes, ledgerRes, peopleRes]) if (r.error) throw r.error;
    state.members = memberRes.data || []; state.matches = matchRes.data || [];
    const lockedMatchIds = state.matches.filter(m => !isOpen(m)).map(m => m.id);
    let lockedPickRows = [];
    if (lockedMatchIds.length) {
      const lockedPickRes = await supabase.from('predictions').select('id,match_id,user_id,predicted_team,updated_at').in('match_id', lockedMatchIds);
      if (lockedPickRes.error) throw lockedPickRes.error;
      lockedPickRows = lockedPickRes.data || [];
    }
    state.picks = visiblePicks({ ownPicks: ownPickRes.data || [], lockedPicks: lockedPickRows });
    state.ledger = ledgerRes.data || []; state.profiles = peopleRes.data || [];
  } else if (state.profile.role === 'admin') {
    const { data, error } = await supabase.from('profiles').select('id,display_name,role,approval_status'); if (error) throw error; state.profiles = data || [];
  }
  if (state.profile.role === 'admin') {
    state.registrationRequests = await fetchRegistrationRequests(supabase);
  }
  const seasonSelect = $('season-select');
  seasonSelect.innerHTML = state.seasons.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  seasonSelect.value = state.season?.id || ''; seasonSelect.classList.toggle('hidden', state.seasons.length < 2);
  $('season-label').textContent = state.season?.name || 'No season selected';
  $('season-label').title = state.season ? `${state.season.name} · ${state.members.length} members` : 'Create a season to begin';
}

function render() {
  syncAuth();
  if (state.session && state.profile?.approval_status !== 'approved') { for (const v of ['standings','history','admin']) $(`${v}-view`).classList.add('hidden'); return; }
  $('app-view').classList.toggle('hidden', !state.session || state.view !== 'home');
  for (const v of ['standings', 'history', 'admin']) $(`${v}-view`).classList.toggle('hidden', !state.session || state.view !== v || (v === 'admin' && state.profile?.role !== 'admin'));
  $('today-label').textContent = indiaDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  if (!state.season) {
    $('open-count').textContent = '0 OPEN'; $('open-matches').innerHTML = `<div class="empty-state"><strong>No season yet.</strong><br>The pool admin can create the season in Admin desk.</div>`;
    $('upcoming-matches').innerHTML = `<div class="empty-state compact">The fixture list will appear after the official schedule is added.</div>`;
    $('mini-leaderboard').innerHTML = '<div class="empty-state compact">Standings appear once the season starts.</div>';
    $('standings-body').innerHTML = '<tr><td colspan="5" class="empty-state">No season has been created yet.</td></tr>';
    $('history-body').innerHTML = '<tr><td colspan="6" class="empty-state">No matches have been added yet.</td></tr>';
    $('settle-list').innerHTML = '<div class="empty-state compact">No matches waiting for a result.</div>';
    return;
  }
  const open = pickWindowMatches();
  const locked = state.matches.filter(m => m.status === 'scheduled' && !isOpen(m));
  $('open-count').textContent = `${open.length} OPEN`;
  $('open-matches').innerHTML = open.length ? open.map(matchCard).join('') : `<div class="empty-state"><strong>No open picks right now.</strong><br>Upcoming fixtures will appear below when the admin adds them.</div>`;
  $('upcoming-matches').innerHTML = locked.length ? locked.slice(0, 5).map(upcomingRow).join('') : `<div class="empty-state compact">No more fixtures are on the card yet.</div>`;
  renderStandings(); renderHistory(); renderAdmin();
}
function indiaDayKey(value) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
function pickWindowMatches() {
  const today = indiaDayKey(new Date());
  const tomorrow = indiaDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const todays = state.matches.filter(m => isOpen(m) && indiaDayKey(m.starts_at) === today);
  return todays.length ? todays : state.matches.filter(m => isOpen(m) && indiaDayKey(m.starts_at) === tomorrow);
}
function matchCard(m) {
  const pick = state.picks.find(p => p.match_id === m.id && p.user_id === state.session.user.id);
  const hours = Math.max(0, Math.floor((lockAt(m) - Date.now()) / 3600000));
  const mins = Math.max(0, Math.floor(((lockAt(m) - Date.now()) % 3600000) / 60000));
  const stake = stakeFor(m);
  return `<article class="match-card"><div class="match-top"><div class="match-label"><span class="tiny-ball">●</span> ${esc(typeName(m.category))} <span>·</span> ${esc(indiaDate(m.starts_at, { weekday: 'short', day: 'numeric', month: 'short' }))}</div><span class="match-stake">${rupees(stake)} stake</span></div><div class="match-main"><div class="team"><span class="team-badge">${esc(teamCode(m.team_a))}</span><span class="team-name">${esc(m.team_a)}</span></div><span class="vs">VS</span><div class="team"><span class="team-badge blue">${esc(teamCode(m.team_b))}</span><span class="team-name">${esc(m.team_b)}</span></div><div class="match-meta"><div class="match-time">${indiaDate(m.starts_at, { hour: 'numeric', minute: '2-digit' })} IST</div><div class="match-date">${indiaDate(m.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })}</div></div></div><div class="match-bottom"><span class="deadline">${pick ? `Your pick: <strong>${esc(pick.predicted_team === 'team_a' ? m.team_a : m.team_b)}</strong>` : `Locks in <strong>${hours ? `${hours}h ` : ''}${mins}m</strong>`}</span>${pick ? `<button class="button button-secondary" data-pick="${m.id}">Change pick <span>↗</span></button>` : `<button class="button button-primary" data-pick="${m.id}">Make your pick <span>→</span></button>`}</div></article>`;
}
function upcomingRow(m) {
  const d = new Date(m.starts_at);
  return `<div class="upcoming-row"><span class="upcoming-date"><strong>${indiaDate(d, { day: 'numeric' })}</strong>${indiaDate(d, { month: 'short' })}</span><span class="upcoming-teams">${esc(m.team_a)} <span style="color:#a2aca4">vs</span> ${esc(m.team_b)}</span><span class="upcoming-type">${esc(typeName(m.category))}</span><span class="upcoming-stake">${rupees(stakeFor(m))}</span></div>`;
}
function typeName(c) { return ({ league: 'LEAGUE MATCH', playoff: 'QUALIFIER / ELIMINATOR', final: 'FINAL' })[c] || 'MATCH'; }
function stakeFor(m) { return m.category === 'final' ? state.season.stake_final : m.category === 'playoff' ? state.season.stake_playoff : state.season.stake_league; }
function renderStandings() {
  const totals = new Map(state.profiles.map(p => [p.id, { profile: p, net: 0, matches: 0, wins: 0 }]));
  for (const e of state.ledger) { const x = totals.get(e.user_id); if (!x) continue; x.net += Number(e.net_paise); x.matches++; if (e.entry_type === 'win') x.wins++; }
  const rows = [...totals.values()].sort((a, b) => b.net - a.net || a.profile.display_name.localeCompare(b.profile.display_name));
  $('standings-body').innerHTML = rows.length ? rows.map((r, i) => `<tr><td><span class="rank-medal">${String(i + 1).padStart(2, '0')}</span></td><td><div class="table-player"><span class="avatar avatar-small">${esc(initials(r.profile.display_name))}</span>${esc(r.profile.display_name)}</div></td><td>${r.matches}</td><td>${r.wins}</td><td class="money ${r.net >= 0 ? 'positive' : 'negative'}">${r.net >= 0 ? '+' : ''}${money(r.net)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">Add participants to start the standings.</td></tr>';
  $('mini-leaderboard').innerHTML = rows.length ? rows.slice(0, 4).map((r, i) => `<div class="mini-row"><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="mini-person">${esc(r.profile.display_name)}</span><span class="mini-net ${r.net >= 0 ? 'positive' : 'negative'}">${r.net >= 0 ? '+' : ''}${money(r.net)}</span></div>`).join('') : '<div class="empty-state compact">No participants in this season yet.</div>';
}
function renderHistory() {
  const matchById = new Map(state.matches.map(m => [m.id, m]));
  const ownEntries = state.ledger.filter(e => e.user_id === state.session.user.id).sort((a, b) => new Date(matchById.get(b.match_id)?.starts_at || 0) - new Date(matchById.get(a.match_id)?.starts_at || 0));
  $('history-body').innerHTML = ownEntries.length ? ownEntries.map(e => {
    const m = matchById.get(e.match_id); if (!m) return '';
    const p = state.picks.find(x => x.match_id === m.id && x.user_id === e.user_id);
    const pickName = p ? (p.predicted_team === 'team_a' ? m.team_a : m.team_b) : 'Missed';
    const result = e.entry_type === 'refund' || e.entry_type === 'no_pick_refund' ? 'Refunded' : m.outcome === 'void' ? 'No result' : (m.outcome === 'team_a' ? m.team_a : m.team_b);
    return `<tr><td><strong>${esc(m.team_a)} vs ${esc(m.team_b)}</strong></td><td>${indiaDate(m.starts_at, { day: 'numeric', month: 'short' })}</td><td>${esc(typeName(m.category))}</td><td>${esc(pickName)}</td><td>${esc(result)}</td><td class="money ${e.net_paise >= 0 ? 'positive' : 'negative'}">${Number(e.net_paise) > 0 ? '+' : ''}${money(e.net_paise)}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-state">Settled matches will show here.</td></tr>';
}
function renderAdmin() {
  const pending = state.registrationRequests.filter(r => r.status === 'pending');
  $('registration-list').innerHTML = pending.length ? pending.map(r => `<div class="settle-row"><div><strong>${esc(r.display_name)}</strong><span>${esc(r.email)} · Requested ${indiaDate(r.created_at, { day: 'numeric', month: 'short' })}</span></div><div class="review-actions"><button class="button button-primary" data-review="${r.user_id}" data-approve="true">Approve</button><button class="button button-secondary" data-review="${r.user_id}" data-approve="false">Reject</button></div></div>`).join('') : '<div class="empty-state compact">No registrations are waiting for approval.</div>';
  $('fixture-list').innerHTML = state.matches.length ? state.matches.map(m => `<div class="settle-row"><div><strong>${esc(m.team_a)} vs ${esc(m.team_b)}</strong><span>${indiaDate(m.starts_at, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} IST · ${esc(typeName(m.category))} · ${esc(m.status)}</span></div><button class="button button-secondary" data-edit="${m.id}">Edit fixture</button></div>`).join('') : '<div class="empty-state compact">No fixtures have been added.</div>';
  $('settle-list').innerHTML = state.matches.filter(m => m.status === 'scheduled' && !isOpen(m)).length ? state.matches.filter(m => m.status === 'scheduled' && !isOpen(m)).map(m => `<div class="settle-row"><div><strong>${esc(m.team_a)} vs ${esc(m.team_b)}</strong><span>${indiaDate(m.starts_at, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} IST · ${esc(typeName(m.category))}</span></div><button class="button button-secondary" data-settle="${m.id}">Record result →</button></div>`).join('') : '<div class="empty-state compact">No matches waiting for a result.</div>';
}
async function refreshRegistrations() {
  const button = $('refresh-registrations'); button.disabled = true;
  notice('Refreshing registration requests…', 'info');
  try {
    state.registrationRequests = await fetchRegistrationRequests(supabase);
    renderAdmin();
    const pendingCount = pendingRegistrationCount(state.registrationRequests);
    notice(pendingCount ? `Loaded ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}.` : `No pending requests returned for ${state.session?.user.email} from ${new URL(SUPABASE_URL).host}.`, pendingCount ? 'success' : 'info');
  } catch (error) { fail(error, 'Could not load registration requests.'); }
  finally { button.disabled = false; }
}
function showPick(matchId) {
  const m = state.matches.find(x => x.id === matchId); if (!m || !isOpen(m)) return notice('Voting has closed for this match.', 'error');
  state.activeMatch = m;
  $('pick-title').textContent = `${m.team_a} or ${m.team_b}?`;
  $('pick-details').textContent = `${typeName(m.category)} · ${rupees(stakeFor(m))} stake · locks ${indiaDate(lockAt(m), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} IST`;
  $('pick-choices').innerHTML = ['team_a', 'team_b'].map((side, i) => `<button class="pick-choice" data-choice="${side}"><span class="choice-badge">${esc(teamCode(m[side]))}</span>${esc(m[side])}<span style="margin-left:auto">→</span></button>`).join('');
  $('pick-dialog').showModal();
}
function toIndiaInput(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = k => parts.find(p => p.type === k)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
function showEdit(matchId) {
  const m = state.matches.find(x => x.id === matchId); if (!m) return;
  state.activeMatch = m;
  $('edit-team-a').value = m.team_a; $('edit-team-b').value = m.team_b;
  $('edit-type').value = m.category; $('edit-start').value = toIndiaInput(m.starts_at);
  $('edit-dialog').showModal();
}
async function saveEdit(event) {
  event.preventDefault(); const m = state.activeMatch; if (!m) return;
  const update = { team_a: $('edit-team-a').value.trim(), team_b: $('edit-team-b').value.trim(), category: $('edit-type').value, starts_at: parseIndiaInput($('edit-start').value) };
  if (update.team_a.toLowerCase() === update.team_b.toLowerCase()) return notice('Choose two different teams.', 'error');
  const { error } = await supabase.from('matches').update(update).eq('id', m.id);
  if (error) return fail(error, 'Could not update fixture.');
  $('edit-dialog').close(); state.activeMatch = null; await refresh(); notice('Schedule updated and recorded in the audit log.', 'success');
}
function showSettle(matchId) {
  const m = state.matches.find(x => x.id === matchId); if (!m) return;
  state.activeSettle = m;
  $('settle-title').textContent = `${m.team_a} vs ${m.team_b}`;
  $('settle-choices').innerHTML = ['team_a', 'team_b'].map(side => `<button class="pick-choice" data-result="${side}"><span class="choice-badge">${esc(teamCode(m[side]))}</span>${esc(m[side])} won<span style="margin-left:auto">→</span></button>`).join('');
  $('settle-dialog').showModal();
}
async function refresh() { await loadData(); render(); }
function setAuthMode(mode) {
  const registering = mode === 'register';
  $('login-form').classList.toggle('hidden', registering);
  $('register-form').classList.toggle('hidden', !registering);
  $('show-register').classList.toggle('hidden', registering);
  $('show-login').classList.toggle('hidden', !registering);
  $('auth-success').classList.add('hidden'); $('auth-error').classList.add('hidden');
  $('auth-heading').textContent = registering ? 'Create your account' : 'Welcome back';
  $('auth-subtitle').textContent = registering ? 'Request access to your friends’ pool.' : 'Sign in to make your picks.';
}
async function register(event) {
  event.preventDefault(); if (!supabase) return notice('Add your Supabase URL and publishable key in config.js first.', 'error');
  const button = $('register-button'); button.disabled = true; $('auth-success').classList.add('hidden'); $('auth-error').classList.add('hidden');
  const { data, error } = await supabase.auth.signUp({
    email: $('register-email').value.trim(), password: $('register-password').value,
    options: { data: { display_name: $('register-name').value.trim() } }
  });
  button.disabled = false;
  if (error) { $('auth-error').textContent = error.message; $('auth-error').classList.remove('hidden'); return; }
  $('auth-success').textContent = data.session ? 'Your request is pending approval. You can play as soon as the admin approves your account.' : 'Your request was received. Check your email to confirm your address, then sign in and wait for admin approval.';
  $('auth-success').classList.remove('hidden'); $('register-form').reset();
}
async function reviewRegistration(userId, approved) {
  const { error } = await supabase.rpc('review_registration', { p_user_id: userId, p_approved: approved });
  if (error) return fail(error, 'Could not review registration.');
  await refresh(); notice(approved ? 'Account approved and added to this season.' : 'Registration rejected.', 'success');
}
async function login(event) {
  event.preventDefault(); if (!supabase) return notice('Add your Supabase URL and publishable key in config.js first.', 'error');
  $('login-button').disabled = true; $('auth-error').classList.add('hidden');
  const { error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  $('login-button').disabled = false;
  if (error) { $('auth-error').textContent = error.message; $('auth-error').classList.remove('hidden'); }
}
async function savePick(side) {
  const m = state.activeMatch; $('pick-dialog').close(); if (!m) return;
  const { error } = await supabase.from('predictions').upsert({ match_id: m.id, user_id: state.session.user.id, predicted_team: side, updated_at: new Date().toISOString() }, { onConflict: 'match_id,user_id' });
  if (error) return fail(error, 'Could not save the pick. Check the cutoff and try again.');
  notice('Pick saved. It stays private until the match locks.', 'success'); await refresh();
}
async function createSeason(event) {
  event.preventDefault(); if (!state.profile || state.profile.role !== 'admin') return;
  const season = { name: $('season-name').value.trim(), stake_league: Number($('stake-league').value), stake_playoff: Number($('stake-playoff').value), stake_final: Number($('stake-final').value), created_by: state.session.user.id };
  const { data, error } = await supabase.from('seasons').insert(season).select().single(); if (error) return fail(error);
  state.selectedSeasonId = data.id;
  const ids = state.profiles.filter(p => p.approval_status === 'approved').map(p => ({ season_id: data.id, user_id: p.id }));
  if (ids.length) { const r = await supabase.from('season_members').upsert(ids, { onConflict: 'season_id,user_id' }); if (r.error) return fail(r.error); }
  $('season-form').reset(); await refresh(); notice('Season created. Add fixtures after the official schedule is released.', 'success');
}
async function addMatch(event) {
  event.preventDefault(); if (!state.season) return notice('Create a season first.', 'error');
  const match = { season_id: state.season.id, team_a: $('team-a').value.trim(), team_b: $('team-b').value.trim(), category: $('match-type').value, starts_at: parseIndiaInput($('match-start').value), status: 'scheduled', created_by: state.session.user.id };
  if (match.team_a.toLowerCase() === match.team_b.toLowerCase()) return notice('Choose two different teams.', 'error');
  const { error } = await supabase.from('matches').insert(match); if (error) return fail(error);
  $('match-form').reset(); await refresh(); notice('Fixture added. Picks open until 30 minutes before start.', 'success');
}
async function settle(outcome) {
  const m = state.activeSettle; $('settle-dialog').close(); if (!m) return;
  const { error } = await supabase.rpc('settle_match', { p_match_id: m.id, p_outcome: outcome });
  if (error) return fail(error, 'Could not settle match. Confirm the result and try again.');
  state.activeSettle = null; await refresh(); notice(outcome === 'void' ? 'Match marked no-result. Submitted picks were refunded.' : 'Result recorded and standings updated.', 'success');
}
function exportCsv() {
  const matchById = new Map(state.matches.map(m => [m.id, m]));
  const rows = [['Match', 'Date', 'Type', 'Pick', 'Result', 'Stake INR', 'Payout INR', 'Net INR']];
  for (const e of state.ledger.filter(x => x.user_id === state.session.user.id)) {
    const m = matchById.get(e.match_id); if (!m) continue;
    const p = state.picks.find(x => x.match_id === m.id && x.user_id === e.user_id);
    rows.push([`${m.team_a} vs ${m.team_b}`, indiaDate(m.starts_at, { day: 'numeric', month: 'short', year: 'numeric' }), typeName(m.category), p ? (p.predicted_team === 'team_a' ? m.team_a : m.team_b) : 'Missed', m.outcome || 'Pending', Number(e.stake_paise) / 100, Number(e.payout_paise) / 100, Number(e.net_paise) / 100]);
  }
  const csv = rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'ipl-pool-history.csv'; a.click(); URL.revokeObjectURL(a.href);
}

$('login-form').addEventListener('submit', login); $('register-form').addEventListener('submit', register);
$('show-register').addEventListener('click', () => setAuthMode('register')); $('show-login').addEventListener('click', () => setAuthMode('login')); $('pending-sign-out').addEventListener('click', async () => { await supabase?.auth.signOut(); });
$('toggle-password').addEventListener('click', () => { const input = $('password'); input.type = input.type === 'password' ? 'text' : 'password'; $('toggle-password').textContent = input.type === 'password' ? 'Show' : 'Hide'; });
$('sign-out').addEventListener('click', async () => { await supabase?.auth.signOut(); });
$('header-sign-out').addEventListener('click', async () => { await supabase?.auth.signOut(); });
$('season-form').addEventListener('submit', createSeason); $('match-form').addEventListener('submit', addMatch); $('edit-form').addEventListener('submit', saveEdit);
$('season-select').addEventListener('change', async (event) => { state.selectedSeasonId = event.target.value; try { await refresh(); } catch (e) { fail(e); } });
$('export-csv').addEventListener('click', exportCsv); $('history-export').addEventListener('click', exportCsv);
document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-view],[data-nav]'); if (nav) { event.preventDefault(); setView(nav.dataset.view || nav.dataset.nav); return; }
  const pick = event.target.closest('[data-pick]'); if (pick) { showPick(pick.dataset.pick); return; }
  const choice = event.target.closest('[data-choice]'); if (choice) { savePick(choice.dataset.choice); return; }
  const reviewBtn = event.target.closest('[data-review]'); if (reviewBtn) { reviewRegistration(reviewBtn.dataset.review, reviewBtn.dataset.approve === 'true'); return; }
  const editBtn = event.target.closest('[data-edit]'); if (editBtn) { showEdit(editBtn.dataset.edit); return; }
  const settleBtn = event.target.closest('[data-settle]'); if (settleBtn) { showSettle(settleBtn.dataset.settle); return; }
  const result = event.target.closest('[data-result]'); if (result) { settle(result.dataset.result); return; }
  if (event.target.closest('[data-void-result]')) settle('void');
});
window.setInterval(async () => {
  if (!state.session) return;
  try { await loadData(); render(); }
  catch (error) { fail(error, 'Could not refresh pool data.'); }
}, 30000);
if (!supabase) {
  $('auth-view').classList.add('hidden'); $('app-view').classList.remove('hidden'); $('app-view').innerHTML = `<div class="auth-card setup-card"><span class="eyebrow">LOCAL SETUP</span><h2>Connect Supabase to begin</h2><p class="muted">Open <code>config.js</code> and add your Supabase project URL and publishable key. Then run the schema in <code>supabase/schema.sql</code>.</p><p class="muted">No credentials are stored in this project right now.</p></div>`;
} else {
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    window.setTimeout(async () => {
      try { if (session) await loadData(); else { state.profile = null; state.season = null; } render(); }
      catch (error) { fail(error, 'Could not load pool data. Check Supabase setup and access policies.'); }
    }, 0);
  });
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) return fail(error);
    state.session = data.session;
    try { if (state.session) await loadData(); render(); }
    catch (e) { fail(e, 'Could not load pool data. Check Supabase setup and access policies.'); }
  });
}
