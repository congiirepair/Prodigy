function createTeams(count = 8) {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    seed: index + 1,
    name: `Team ${index + 1}`,
    eliminationPoints: 0,
    active: true,
    roundScores: [],
    roundEliminated: null,
  }));
}

function activeTeams(teams) {
  return teams.filter((team) => team.active && team.eliminationPoints < 3);
}

function scoreRound(teams, roundNumber) {
  const active = activeTeams(teams);
  return active.map((team, index) => ({
    teamId: team.id,
    round: roundNumber,
    score: 100 - ((index + roundNumber * 2) % active.length) - (team.eliminationPoints * 0.5),
  }));
}

function pointCandidates(scores) {
  const sorted = [...scores].sort((left, right) => left.score - right.score);
  const pointCount = Math.max(0, Math.min(3, sorted.length - 1));
  return sorted.slice(0, pointCount).map((score) => score.teamId);
}

function finalizeRound(teams, roundNumber, scores) {
  const pointIds = pointCandidates(scores);
  let remaining = 0;
  let winner = null;

  const nextTeams = teams.map((team) => {
    const score = scores.find((entry) => entry.teamId === team.id);
    const nextRoundScores = score
      ? [...team.roundScores, score]
      : team.roundScores;

    if (!team.active || !pointIds.includes(team.id)) {
      if (team.active) {
        remaining += 1;
        winner = team;
      }
      return { ...team, roundScores: nextRoundScores };
    }

    const eliminationPoints = Math.min(3, team.eliminationPoints + 1);
    const active = eliminationPoints < 3;
    if (active) {
      remaining += 1;
      winner = { ...team, eliminationPoints, active };
    }

    return {
      ...team,
      roundScores: nextRoundScores,
      eliminationPoints,
      active,
      roundEliminated: active ? team.roundEliminated : roundNumber,
    };
  });

  return {
    teams: nextTeams,
    pointIds,
    complete: remaining <= 1,
    winner,
  };
}

let teams = createTeams(8);
const rounds = [];

for (let roundNumber = 1; roundNumber <= 20; roundNumber += 1) {
  const scores = scoreRound(teams, roundNumber);
  const result = finalizeRound(teams, roundNumber, scores);
  teams = result.teams;
  rounds.push({ roundNumber, pointIds: result.pointIds, activeCount: activeTeams(teams).length });
  if (result.complete) {
    console.log(JSON.stringify({
      status: "pass",
      winner: result.winner?.name || null,
      rounds,
      finalTeams: teams.map(({ name, eliminationPoints, active, roundEliminated }) => ({
        name,
        eliminationPoints,
        active,
        roundEliminated,
      })),
    }, null, 2));
    process.exit(0);
  }
}

console.error("Twin Comp simulation did not complete within 20 rounds.");
process.exit(1);
