export function safeUnsubscribe(unsubscribe) {
  if (typeof unsubscribe !== "function") return;
  try {
    unsubscribe();
  } catch (error) {
    console.warn("Subscription cleanup failed:", error);
  }
}

export function createSubscriptionRegistry() {
  const subscriptions = new Map();

  return {
    replace(name, unsubscribe) {
      safeUnsubscribe(subscriptions.get(name));
      if (typeof unsubscribe === "function") {
        subscriptions.set(name, unsubscribe);
      } else {
        subscriptions.delete(name);
      }
      return unsubscribe;
    },
    clear(name) {
      safeUnsubscribe(subscriptions.get(name));
      subscriptions.delete(name);
    },
    clearAll() {
      subscriptions.forEach((unsubscribe) => safeUnsubscribe(unsubscribe));
      subscriptions.clear();
    },
    get(name) {
      return subscriptions.get(name) || null;
    },
  };
}
