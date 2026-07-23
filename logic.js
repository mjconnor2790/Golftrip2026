// ---------------------------------------------------------------------------
// Pure logic module: course handicap, points allocation, tie splitting,
// leaderboard aggregation. No DOM access here so it can be unit-tested in
// Node and then loaded as a plain <script> in the browser (attaches to
// window.GolfLogic).
// ---------------------------------------------------------------------------

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (typeof root !== 'undefined') {
    root.GolfLogic = mod;
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const COURSES = {
    oconnor: { key: 'oconnor', name: "O'Connor Jnr", par: 72, rating: 70.7, slope: 129 },
    faldo:   { key: 'faldo',   name: 'Faldo',         par: 72, rating: 70.9, slope: 134 }
  };

  // Fixed tournament schedule. `format` drives which score-entry UI + scoring
  // logic applies. `leaderboard` says which leaderboard(s) the round feeds.
  const SCHEDULE = [
    { id: 'd1',  day: 1, session: 'Day 1',      course: 'oconnor', label: "O'Connor Jnr — Individual Stroke Play",             format: 'individual', leaderboard: ['individual', 'team'] },
    { id: 'd2am',day: 2, session: 'Day 2 AM',   course: 'faldo',   label: 'Faldo — Individual Stroke Play',                    format: 'individual', leaderboard: ['individual', 'team'] },
    { id: 'd2pm',day: 2, session: 'Day 2 PM',   course: 'faldo',   label: 'Faldo — 2v2 Scramble',                              format: 'scramble2v2', leaderboard: ['team'] },
    { id: 'd3am',day: 3, session: 'Day 3 AM',   course: 'oconnor', label: "O'Connor Jnr — Individual Stroke Play",             format: 'individual', leaderboard: ['individual', 'team'] },
    { id: 'd3pm',day: 3, session: 'Day 3 PM',   course: 'oconnor', label: "O'Connor Jnr — 2v2 Scramble",                       format: 'scramble2v2', leaderboard: ['team'] },
    { id: 'd4am',day: 4, session: 'Day 4 AM',   course: 'faldo',   label: 'Faldo — Individual Stroke Play',                    format: 'individual', leaderboard: ['individual', 'team'] },
    { id: 'd4pm',day: 4, session: 'Day 4 PM',   course: 'faldo',   label: 'Faldo — 2v2 Alternate Shot Scramble',               format: 'altshot2v2', leaderboard: ['team'] },
    { id: 'd5am',day: 5, session: 'Day 5 AM',   course: 'faldo',   label: 'Faldo — Full 4-Man Team Scramble',                  format: 'team4',       leaderboard: ['team'] }
  ];

  const INDIVIDUAL_POINTS_TABLE = [8, 7, 6, 5, 4, 3, 2, 1];
  const SCRAMBLE_POINTS_TABLE = [4, 3, 2, 1];

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // Course Handicap = HI x (Slope/113) + (Rating - Par), rounded to nearest whole number
  function courseHandicap(handicapIndex, courseKey) {
    const c = COURSES[courseKey];
    if (!c) throw new Error('Unknown course: ' + courseKey);
    const hi = Number(handicapIndex);
    if (Number.isNaN(hi)) return null;
    const raw = hi * (c.slope / 113) + (c.rating - c.par);
    return Math.round(raw);
  }

  // Generic "rank with ties, split points" helper.
  // entries: [{ id, value }] where LOWER value = better rank (used for both
  // net golf scores and gross scramble scores).
  // pointsTable: array where pointsTable[0] = points for 1st place, etc.
  // Returns: [{ id, value, rank, points }] rank is the position of the first
  // member of the tied group (1-based), points is the split average.
  function rankAndSplitPoints(entries, pointsTable) {
    if (!entries.length) return [];
    const sorted = entries.slice().sort((a, b) => a.value - b.value);
    const results = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) {
        j++;
      }
      // tied group is indices i..j (0-based), representing ranks i+1..j+1
      const groupSize = j - i + 1;
      let sum = 0;
      for (let k = i; k <= j; k++) {
        sum += pointsTable[k] !== undefined ? pointsTable[k] : 0;
      }
      const avg = round2(sum / groupSize);
      for (let k = i; k <= j; k++) {
        results.push({ id: sorted[k].id, value: sorted[k].value, rank: i + 1, points: avg });
      }
      i = j + 1;
    }
    return results;
  }

  // ---- Individual stroke play round ----
  // players: [{id, name, team, handicapIndex}]
  // grossScores: { playerId: number }
  // courseKey: 'oconnor' | 'faldo'
  // Returns array of { id, name, team, gross, courseHandicap, net, rank, points }
  function computeIndividualRound(players, grossScores, courseKey) {
    const entries = [];
    const details = {};
    players.forEach(p => {
      const gross = grossScores[p.id];
      if (gross === undefined || gross === null || gross === '') return;
      const ch = courseHandicap(p.handicapIndex, courseKey);
      const net = Number(gross) - ch;
      details[p.id] = { id: p.id, name: p.name, team: p.team, gross: Number(gross), courseHandicap: ch, net };
      entries.push({ id: p.id, value: net });
    });
    const ranked = rankAndSplitPoints(entries, INDIVIDUAL_POINTS_TABLE);
    return ranked.map(r => Object.assign({}, details[r.id], { rank: r.rank, points: r.points }));
  }

  // ---- 2v2 scramble round (also used for alt-shot, same scoring shape) ----
  // pairings: [{ id, team, playerIds: [a,b], gross }]  (expects 4 pairings, 2 per team)
  // Returns array of { id, team, playerIds, gross, rank, points }
  function computeScrambleRound(pairings) {
    const valid = pairings.filter(p => p.gross !== undefined && p.gross !== null && p.gross !== '');
    const entries = valid.map(p => ({ id: p.id, value: Number(p.gross) }));
    const ranked = rankAndSplitPoints(entries, SCRAMBLE_POINTS_TABLE);
    const byId = {};
    valid.forEach(p => byId[p.id] = p);
    return ranked.map(r => Object.assign({}, byId[r.id], { gross: Number(byId[r.id].gross), rank: r.rank, points: r.points }));
  }

  // ---- Day 5 full team scramble ----
  // scores: { teamA: number|null, teamB: number|null }
  // Returns { teamA: {gross, points}, teamB: {gross, points} } or null if incomplete
  function computeTeam4Round(scores) {
    const a = scores.teamA;
    const b = scores.teamB;
    if (a === undefined || a === null || a === '' || b === undefined || b === null || b === '') return null;
    const ga = Number(a), gb = Number(b);
    let pa, pb;
    if (ga < gb) { pa = 8; pb = 4; }
    else if (gb < ga) { pa = 4; pb = 8; }
    else { pa = 6; pb = 6; }
    return { teamA: { gross: ga, points: pa }, teamB: { gross: gb, points: pb } };
  }

  // ---- Full leaderboard aggregation ----
  // state: { players: [...], scores: { roundId: <round-specific-shape> } }
  // Returns { individual: [...], team: {A:{...}, B:{...}}, perRound: {...} }
  function computeLeaderboards(state) {
    const players = state.players || [];
    const scores = state.scores || {};

    const indivStats = {}; // playerId -> { points, played, nets: [] }
    players.forEach(p => { indivStats[p.id] = { points: 0, played: 0, nets: [] }; });

    const teamStats = {
      A: { total: 0, individual: 0, team: 0 },
      B: { total: 0, individual: 0, team: 0 }
    };

    const perRound = {};

    SCHEDULE.forEach(round => {
      const roundScores = scores[round.id];
      if (!roundScores) { perRound[round.id] = null; return; }

      if (round.format === 'individual') {
        const results = computeIndividualRound(players, roundScores, round.course);
        perRound[round.id] = results;
        results.forEach(r => {
          indivStats[r.id].points += r.points;
          indivStats[r.id].played += 1;
          indivStats[r.id].nets.push(r.net);
          teamStats[r.team].individual += r.points;
          teamStats[r.team].total += r.points;
        });
      } else if (round.format === 'scramble2v2' || round.format === 'altshot2v2') {
        const pairings = roundScores.pairings || [];
        const results = computeScrambleRound(pairings);
        perRound[round.id] = results;
        results.forEach(r => {
          teamStats[r.team].team += r.points;
          teamStats[r.team].total += r.points;
        });
      } else if (round.format === 'team4') {
        const result = computeTeam4Round(roundScores);
        perRound[round.id] = result;
        if (result) {
          teamStats.A.team += result.teamA.points;
          teamStats.A.total += result.teamA.points;
          teamStats.B.team += result.teamB.points;
          teamStats.B.total += result.teamB.points;
        }
      }
    });

    const individualLeaderboard = players.map(p => {
      const s = indivStats[p.id];
      const best = s.nets.length ? Math.min(...s.nets) : null;
      const avg = s.nets.length ? round2(s.nets.reduce((a, b) => a + b, 0) / s.nets.length) : null;
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        totalPoints: round2(s.points),
        roundsPlayed: s.played,
        bestNet: best,
        avgNet: avg
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints);

    const teamLeaderboard = {
      A: { team: 'A', total: round2(teamStats.A.total), individual: round2(teamStats.A.individual), team_: round2(teamStats.A.team) },
      B: { team: 'B', total: round2(teamStats.B.total), individual: round2(teamStats.B.individual), team_: round2(teamStats.B.team) }
    };

    return { individual: individualLeaderboard, team: teamLeaderboard, perRound };
  }

  return {
    COURSES,
    SCHEDULE,
    INDIVIDUAL_POINTS_TABLE,
    SCRAMBLE_POINTS_TABLE,
    courseHandicap,
    rankAndSplitPoints,
    computeIndividualRound,
    computeScrambleRound,
    computeTeam4Round,
    computeLeaderboards
  };
});
