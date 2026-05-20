export function applyScopedJudgeSubmissionDocsToDrivers(drivers = [], docs = [], { getRunKey } = {}) {
  if (!docs.length) return { drivers, changed: false };
  const nextDrivers = JSON.parse(JSON.stringify(drivers));
  let changed = false;
  docs.forEach(({ data }) => {
    const driver = nextDrivers.find((entry) => entry.id === data.driverId);
    if (!driver || !data.judgeSlot?.startsWith?.("j")) return;
    const runKey = getRunKey(data.runKey || "run1");
    if (!driver.scores?.[data.judgeSlot] || !runKey) return;
    const numericScore = Number(data.submittedScore ?? data.score);
    if (!Number.isFinite(numericScore)) return;
    driver.scores[data.judgeSlot][runKey] = numericScore;
    driver.scores[data.judgeSlot].submitted = {
      ...(driver.scores[data.judgeSlot].submitted || {}),
      [runKey]: numericScore,
    };
    changed = true;
  });
  return { drivers: nextDrivers, changed };
}
