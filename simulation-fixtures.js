export const SIMULATION_TEAMS = [
  'Chennai Super Kings',
  'Mumbai Indians',
  'Kolkata Knight Riders',
  'Royal Challengers Bengaluru',
  'Rajasthan Royals'
];

// All values are India Standard Time. The league fixture graph is a five-team
// ring: every team plays exactly two different opponents.
export const SIMULATION_LEAGUE_FIXTURES = [
  { stage: 'league-1', teamA: 'Chennai Super Kings', teamB: 'Mumbai Indians', startsAtIst: '2026-11-08T15:30' },
  { stage: 'league-2', teamA: 'Kolkata Knight Riders', teamB: 'Royal Challengers Bengaluru', startsAtIst: '2026-11-08T19:30' },
  { stage: 'league-3', teamA: 'Rajasthan Royals', teamB: 'Chennai Super Kings', startsAtIst: '2026-11-09T19:30' },
  { stage: 'league-4', teamA: 'Mumbai Indians', teamB: 'Kolkata Knight Riders', startsAtIst: '2026-11-10T15:30' },
  { stage: 'league-5', teamA: 'Royal Challengers Bengaluru', teamB: 'Rajasthan Royals', startsAtIst: '2026-11-10T19:30' }
];

export const SIMULATION_PLAYOFF_SLOTS = [
  { stage: 'qualifier-1', category: 'playoff', startsAtIst: '2026-11-11T19:30' },
  { stage: 'eliminator', category: 'playoff', startsAtIst: '2026-11-12T19:30' },
  { stage: 'qualifier-2', category: 'playoff', startsAtIst: '2026-11-13T19:30' },
  { stage: 'final', category: 'final', startsAtIst: '2026-11-14T19:30' }
];
