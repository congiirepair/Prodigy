export function formatEventDate(dateString) {
  if (!dateString) return "Date TBD";
  const parsed = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export function formatDistanceMeters(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return "unknown distance";
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(2)} km`;
  return `${Math.round(distanceMeters)} m`;
}

export function formatCoordinateValue(value) {
  if (!Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(6).replace(/\.?0+$/, "");
}

export function formatScore(score) {
  return score === null ? "-" : score.toFixed(1);
}
