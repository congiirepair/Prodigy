export async function refreshUserClaims({ auth, force = false, previousClaims = null, onRefreshed = null, onError = null }) {
  if (!auth?.currentUser) {
    const emptyResult = { claims: null, loadedAt: 0 };
    onRefreshed?.(emptyResult);
    return emptyResult;
  }

  try {
    const tokenResult = await auth.currentUser.getIdTokenResult(force);
    const result = {
      claims: tokenResult?.claims || {},
      loadedAt: Date.now(),
    };
    onRefreshed?.(result);
    return result;
  } catch (error) {
    onError?.(error);
    return {
      claims: previousClaims,
      loadedAt: previousClaims ? Date.now() : 0,
      error,
    };
  }
}
