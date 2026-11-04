import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATION_LEAGUE_FIXTURES, SIMULATION_PLAYOFF_SLOTS, SIMULATION_TEAMS } from '../simulation-fixtures.js';

test('simulation league has five teams and every team plays exactly two matches', () => {
  const appearances = new Map(SIMULATION_TEAMS.map((team) => [team, 0]));
  for (const fixture of SIMULATION_LEAGUE_FIXTURES) {
    assert.notEqual(fixture.teamA, fixture.teamB);
    appearances.set(fixture.teamA, appearances.get(fixture.teamA) + 1);
    appearances.set(fixture.teamB, appearances.get(fixture.teamB) + 1);
  }
  assert.equal(SIMULATION_LEAGUE_FIXTURES.length, 5);
  assert.deepEqual([...appearances.values()], [2, 2, 2, 2, 2]);
});

test('simulation has at least one match each day from November 8 to the final', () => {
  const days = new Set([
    ...SIMULATION_LEAGUE_FIXTURES.map((fixture) => fixture.startsAtIst.slice(0, 10)),
    ...SIMULATION_PLAYOFF_SLOTS.map((fixture) => fixture.startsAtIst.slice(0, 10))
  ]);
  assert.deepEqual([...days].sort(), [
    '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11',
    '2026-11-12', '2026-11-13', '2026-11-14'
  ]);
});

test('league fixtures use only 3:30 PM or 7:30 PM IST and playoffs have one match per day', () => {
  assert.ok(SIMULATION_LEAGUE_FIXTURES.every((fixture) => ['15:30', '19:30'].includes(fixture.startsAtIst.slice(-5))));
  assert.deepEqual(SIMULATION_PLAYOFF_SLOTS.map((fixture) => fixture.startsAtIst.slice(-5)), ['19:30', '19:30', '19:30', '19:30']);
});
