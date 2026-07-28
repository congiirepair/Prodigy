export function getPreBracketLineup(state = {}, eventMeta = {}) {
  const mode = String(eventMeta?.competitionMode || "").toLowerCase();
  const historical = ["completed", "archived"].includes(String(eventMeta?.status || "").toLowerCase())
    || eventMeta?.historicalBracketStatus === "unavailable";
  if (historical) return { available: false, reason: "historical" };
  if (mode === "twin-triple") return { available: false, reason: "twin" };

  const candidates = [
    { key: "lower", rounds: state?.lowerBracket?.rounds },
    { key: "main", rounds: state?.mainBracket?.rounds },
  ];
  for (const candidate of candidates) {
    const matches = Array.isArray(candidate.rounds?.[0]?.matches) ? candidate.rounds[0].matches : [];
    const playable = matches.filter((match) => match?.left && match?.right);
    if (!playable.length) continue;
    return {
      available: true,
      bracketKey: candidate.key,
      battles: playable.map((match, index) => ({
        battleNumber: index + 1,
        participants: [match.left, match.right].map((participant, slotIndex) => ({
          participant,
          participantId: String(participant?.id || participant?.registrationNumber || participant?.reg || participant?.signUpPosition || ""),
          position: (index * 2) + slotIndex + 1,
          slotLabel: slotIndex === 0 ? "Upper Slot" : "Lower Slot",
        })),
      })),
    };
  }
  return { available: false, reason: "not-ready" };
}
