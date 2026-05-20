export function isPermissionDeniedError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.name || "");
  return code.includes("permission-denied") || /permission[- ]denied|missing or insufficient permissions/i.test(message);
}
