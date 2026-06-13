export function getFirebaseDataScopeKey(testModeEnabled = false) {
  return testModeEnabled ? "testData" : "data";
}

export function getEventCollectionKey(standaloneDemoMode = false) {
  return standaloneDemoMode ? "demoEvents" : "events";
}
