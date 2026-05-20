function defaultHasScoreValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function createEmptyScorecards() {
  return {
    j1: { left: null, right: null },
    j2: { left: null, right: null },
    j3: { left: null, right: null },
  };
}

export function calculateCompetitionDecisionResolution(controlOrVotes, {
  activeRoles = [],
  teamTandemMode = false,
  getTeamBonus = () => 0,
  hasScoreValue = defaultHasScoreValue,
} = {}) {
  if (teamTandemMode) {
    const control = controlOrVotes && typeof controlOrVotes === "object" && controlOrVotes.scorecards
      ? controlOrVotes
      : { scorecards: createEmptyScorecards(), entry: null };
    const scorecards = control.scorecards || createEmptyScorecards();
    const leftSubmittedCount = activeRoles.filter((role) => hasScoreValue(scorecards?.[role]?.left)).length;
    const rightSubmittedCount = activeRoles.filter((role) => hasScoreValue(scorecards?.[role]?.right)).length;
    const allVoted = activeRoles.length > 0
      && leftSubmittedCount === activeRoles.length
      && rightSubmittedCount === activeRoles.length;
    const currentSide = leftSubmittedCount < activeRoles.length
      ? "left"
      : rightSubmittedCount < activeRoles.length
        ? "right"
        : null;
    const submittedCount = currentSide === "left"
      ? leftSubmittedCount
      : currentSide === "right"
        ? rightSubmittedCount
        : activeRoles.length;
    const leftBase = activeRoles.reduce((sum, role) => sum + (Number(scorecards?.[role]?.left) || 0), 0);
    const rightBase = activeRoles.reduce((sum, role) => sum + (Number(scorecards?.[role]?.right) || 0), 0);
    const leftBonus = getTeamBonus(control?.entry?.match?.left);
    const rightBonus = getTeamBonus(control?.entry?.match?.right);
    const leftTotal = leftBase + leftBonus;
    const rightTotal = rightBase + rightBonus;
    const winnerSide = allVoted && leftTotal !== rightTotal
      ? (leftTotal > rightTotal ? "left" : "right")
      : null;
    return {
      mode: "scorecard",
      activeRoles,
      submittedCount,
      leftSubmittedCount,
      rightSubmittedCount,
      currentSide,
      leftVotes: leftTotal,
      rightVotes: rightTotal,
      leftBase,
      rightBase,
      leftBonus,
      rightBonus,
      leftTotal,
      rightTotal,
      allVoted,
      tied: allVoted && leftTotal === rightTotal,
      winnerSide,
    };
  }

  const votes = controlOrVotes && typeof controlOrVotes === "object" && controlOrVotes.votes
    ? controlOrVotes.votes
    : controlOrVotes;
  const tally = { left: 0, right: 0, omt: 0 };
  activeRoles.forEach((role) => {
    if (votes?.[role] === "left") tally.left += 1;
    if (votes?.[role] === "right") tally.right += 1;
    if (votes?.[role] === "omt") tally.omt += 1;
  });
  const allVoted = activeRoles.length > 0 && activeRoles.every((role) => ["left", "right", "omt"].includes(votes?.[role]));
  const omtMajority = allVoted && tally.omt > tally.left && tally.omt > tally.right;
  const winnerSide = allVoted && !omtMajority && tally.left !== tally.right
    ? (tally.left > tally.right ? "left" : "right")
    : null;
  return {
    mode: "vote",
    activeRoles,
    submittedCount: activeRoles.filter((role) => ["left", "right", "omt"].includes(votes?.[role])).length,
    leftVotes: tally.left,
    rightVotes: tally.right,
    omtVotes: tally.omt,
    allVoted,
    omtMajority,
    tied: allVoted && !omtMajority && tally.left === tally.right,
    winnerSide,
  };
}
