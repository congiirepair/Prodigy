export function normalizeRunKey(runRef) {
  if (runRef === "r1") return "run1";
  if (runRef === "r2") return "run2";
  return typeof runRef === "string" ? runRef : `run${runRef}`;
}

export function calculateRunAverage(driver, runRef, {
  activeRoles = [],
  categoryJudging = false,
} = {}) {
  const runKey = normalizeRunKey(runRef);
  if (driver?.runFlags?.[runKey]) return 0;
  const scores = driver?.scores || {};
  const submittedScores = activeRoles.map((role) => {
    const judgeScores = scores?.[role] || {};
    const submitted = judgeScores?.submitted || {};
    return submitted?.[runKey] ?? null;
  });
  if (submittedScores.some((value) => value === null)) return null;
  const validScores = submittedScores.filter((value) => value !== null);
  if (!validScores.length) return null;
  const sum = validScores.reduce((total, value) => total + value, 0);
  return categoryJudging ? sum : sum / validScores.length;
}

export function calculateLiveRunAverage(driver, runRef, {
  activeRoles = [],
  categoryJudging = false,
} = {}) {
  const runKey = normalizeRunKey(runRef);
  if (driver?.runFlags?.[runKey]) return 0;
  const scores = driver?.scores || {};
  const submittedScores = activeRoles
    .map((role) => {
      const judgeScores = scores?.[role] || {};
      const submitted = judgeScores?.submitted || {};
      return submitted?.[runKey] ?? null;
    })
    .filter((value) => value !== null && value !== undefined);
  if (!submittedScores.length) return null;
  const sum = submittedScores.reduce((total, value) => total + value, 0);
  return categoryJudging ? sum : sum / submittedScores.length;
}

export function getBestQualifyingScore(run1Average, run2Average) {
  const scores = [run1Average, run2Average].filter((score) => score !== null);
  return scores.length ? Math.max(...scores) : null;
}

export function getSecondaryQualifyingScore(run1Average, run2Average) {
  const scores = [run1Average, run2Average]
    .filter((score) => score !== null)
    .sort((left, right) => right - left);
  return scores.length >= 2 ? scores[1] : null;
}

export function rankDriversByQualifying(driversStateList, {
  normalizeDrivers,
  getRegistrationNumber,
  activeRoles = [],
  categoryJudging = false,
} = {}) {
  const normalizedDrivers = typeof normalizeDrivers === "function"
    ? normalizeDrivers(driversStateList)
    : (Array.isArray(driversStateList) ? driversStateList : []);
  const baseRanked = normalizedDrivers
    .map((driver, index) => {
      const run1Average = calculateRunAverage(driver, 1, { activeRoles, categoryJudging });
      const run2Average = calculateRunAverage(driver, 2, { activeRoles, categoryJudging });
      const bestScore = getBestQualifyingScore(run1Average, run2Average);
      const secondaryScore = getSecondaryQualifyingScore(run1Average, run2Average);
      const runoffScore = calculateRunAverage(driver, "runoff", { activeRoles, categoryJudging });
      return {
        id: driver.id,
        order: index,
        signUpPosition: driver.signUpPosition ?? (index + 1),
        registrationNumber: typeof getRegistrationNumber === "function"
          ? getRegistrationNumber(driver)
          : driver.registrationNumber,
        name: driver.name,
        teamName: driver.teamName || "",
        chassis: driver.chassis || "",
        run1: run1Average,
        run2: run2Average,
        runoff: runoffScore,
        secondaryScore,
        bestScore,
      };
    })
    .filter((driver) => {
      const hasName = typeof driver.name === "string" && driver.name.trim() !== "";
      return hasName || driver.bestScore !== null || driver.runoff !== null;
    });

  const sortedDrivers = [...baseRanked].sort((left, right) => {
    if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
    if (right.secondaryScore !== left.secondaryScore) return (right.secondaryScore ?? -1) - (left.secondaryScore ?? -1);
    if (left.signUpPosition !== right.signUpPosition) return left.signUpPosition - right.signUpPosition;
    return left.order - right.order;
  });

  if (!sortedDrivers.length) return [];
  return sortedDrivers.map((driver, index) => ({ ...driver, seed: index + 1 }));
}
