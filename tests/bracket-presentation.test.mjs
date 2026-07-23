import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(
  html,
  /function supportsTruthfulMainBracketConnectors\(bracketKey, rounds\) \{[\s\S]*?bracketKey !== "main"[\s\S]*?tournamentState\?\.lowerBracket[\s\S]*?tournamentState\?\.qualifiedDrivers\?\.some\(isTeamTandemParticipant\)[\s\S]*?!Array\.isArray\(rounds\)[\s\S]*?rounds\.length < 2/,
  "connectors must stay limited to standard main brackets with no lower bracket or Team Tandem participants"
);
assert.match(
  html,
  /round\.matches\.length === nextRound\.matches\.length \* 2/,
  "connectors must require an actual two-to-one single-elimination feed"
);
assert.match(
  html,
  /data-progression-connectors="\$\{supportsConnectors \? "enabled" : "disabled"\}"/,
  "each rendered board must explicitly opt in before connectors can be drawn"
);
assert.match(
  html,
  /Math\.floor\(matchIndex \/ 2\)/,
  "connector destinations must follow the bracket match index, not visual alignment"
);
assert.match(
  html,
  /const bendX = \(sourcePoint\.x \+ targetPoint\.x\) \/ 2;/,
  "connector bends must be based on both rendered endpoints so dense fitted boards retain their actual relationships"
);
assert.match(
  html,
  /\.main-battle\[data-bracket-key="main"\]\[data-connector-side\]/,
  "connector rendering must target main-bracket match elements only"
);
assert.match(
  html,
  /renderBracketProgressionConnectors\(\);[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?renderBracketProgressionConnectors\(\);/,
  "connector geometry must be refreshed after bracket fitting and a second layout frame"
);
assert.match(
  html,
  /pointer-events: none;[\s\S]*?z-index: 0;/,
  "connectors must remain decorative and behind match cards"
);

console.log("bracket presentation regression tests passed");
