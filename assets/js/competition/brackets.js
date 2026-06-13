export function nextPowerOfTwoValue(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function previousPowerOfTwoValue(value) {
  let result = 1;
  while (result * 2 <= value) result *= 2;
  return result;
}

export function getBracketRoundName(size) {
  if (size === 2) return "Final";
  if (size === 4) return "Final 4";
  if (size === 8) return "Elite 8";
  return `Top ${size}`;
}

export function getSeedOrderForBracket(bracketSize) {
  let order = [1, 2];
  while (order.length < bracketSize) {
    const nextSize = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, nextSize - seed]);
  }
  return order;
}
