import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  isPickWindowOpen,
  lockAt,
  parseIndiaDateTime,
  pendingRegistrationCount,
  visiblePicks
} from '../app-core.js';

const match = (startsAt, status = 'scheduled') => ({ starts_at: startsAt, status });

test('picks close exactly 30 minutes before the scheduled start', () => {
  const fixture = match('2027-04-01T14:30:00.000Z'); // 20:00 IST

  assert.equal(lockAt(fixture).toISOString(), '2027-04-01T14:00:00.000Z');
  assert.equal(isPickWindowOpen(fixture, Date.parse('2027-04-01T13:59:59.999Z')), true);
  assert.equal(isPickWindowOpen(fixture, Date.parse('2027-04-01T14:00:00.000Z')), false);
});

test('non-scheduled matches never accept picks', () => {
  assert.equal(isPickWindowOpen(match('2027-04-01T14:30:00.000Z', 'completed'), Date.parse('2027-04-01T13:00:00.000Z')), false);
});

test('IST fixture input is stored as the correct UTC instant', () => {
  assert.equal(parseIndiaDateTime('2027-04-01T20:00'), '2027-04-01T14:30:00.000Z');
});

test('open matches expose only the signed-in player pick', () => {
  const own = [{ id: 'own', user_id: 'player-1', predicted_team: 'team_a' }];
  assert.deepEqual(visiblePicks({ ownPicks: own, lockedPicks: [] }), own);
});

test('locked-match picks are combined without duplicate predictions', () => {
  const own = [{ id: 'one', user_id: 'player-1', predicted_team: 'team_a' }];
  const locked = [
    { id: 'one', user_id: 'player-1', predicted_team: 'team_a' },
    { id: 'two', user_id: 'player-2', predicted_team: 'team_b' }
  ];
  assert.deepEqual(visiblePicks({ ownPicks: own, lockedPicks: locked }), [own[0], locked[1]]);
});

test('HTML escaping prevents a registration name from becoming markup', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('only pending registration requests are counted', () => {
  assert.equal(pendingRegistrationCount([{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }]), 2);
});
