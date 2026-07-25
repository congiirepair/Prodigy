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
assert.match(
  html,
  /id="bracketFullscreenExitBtn"[\s\S]*?Exit Fullscreen/,
  "bracket fullscreen must provide a dedicated exit control outside hidden toolbar chrome"
);
assert.match(
  html,
  /body\.bracket-fullscreen \.bracket-fullscreen-exit-control \{[\s\S]*?display: inline-flex;/,
  "the dedicated fullscreen exit control must stay visible while toolbar controls are hidden"
);
assert.match(
  html,
  /\.bracket-fullscreen-exit-control \{[\s\S]*?position: fixed;[\s\S]*?z-index: 2400;[\s\S]*?min-height: 44px;[\s\S]*?pointer-events: auto;[\s\S]*?touch-action: manipulation;/,
  "the fullscreen exit control must be a touch-sized fixed layer above bracket overlays"
);
assert.match(
  html,
  /bracketFullscreenFallbackActive[\s\S]*?exitBracketFullscreen\(\)/,
  "native and fallback fullscreen states must share a safe exit path"
);

// -- Bracket flow redesign: Battle Flow cards removed, state lives on the
// bracket's own match cards instead. --

assert.doesNotMatch(
  html,
  /id="battleFlowPanel"/,
  "the standalone Battle Flow panel must be fully removed, not merely hidden"
);
assert.doesNotMatch(
  html,
  /class="battle-flow-card/,
  "Battle Flow card markup must be fully removed"
);
assert.doesNotMatch(
  html,
  /\.battle-flow-card|\.battle-flow-option|\.bracket-flow-slot|\.bracket-header-layout/,
  "no obsolete Battle Flow CSS selectors may remain"
);

assert.match(
  html,
  /function resolveBattleFlowState\(bracketKey, roundIndex, matchIndex, currentEntry, nextEntry\)/,
  "the bracket board must resolve current/up-next state per match from the same authoritative entries used elsewhere"
);
assert.match(
  html,
  /function renderBattleStateBadge\(battleState\)[\s\S]*?"current"[\s\S]*?Current Battle[\s\S]*?"next"[\s\S]*?Up Next/,
  "the actual match card must render its own Current Battle / Up Next label"
);
assert.match(
  html,
  /data-battle-state="\$\{battleState\}"/,
  "the match card wrapper must carry the current/next state as a data attribute for CSS to key off"
);
assert.match(
  html,
  /\.main-battle\[data-battle-state="current"\]::after \{[\s\S]*?conic-gradient/,
  "the Current Battle card must have an animated conic-gradient border trace"
);
assert.match(
  html,
  /\.main-battle\[data-battle-state="next"\][\s\S]*?upNextPulse/,
  "the Up Next card must have its own calmer, non-traveling pulse"
);

// -- Connector states: current/up-next/winning-persistent, all reusing
// authoritative state (winnerAnimationState, data-battle-state) rather
// than introducing new selection logic. --

assert.match(
  html,
  /canvas\.querySelector\(".bracket-connector-layer"\)\?\.remove\(\);/,
  "the connector layer must be removed before a fresh one is built, so exactly one SVG can ever exist per canvas"
);
assert.match(
  html,
  /if \(source\.dataset\.battleState === "current"\) path\.classList\.add\("is-current-outgoing"\);/,
  "the current battle's outgoing connector must be marked from the same data-battle-state the match card already carries"
);
assert.match(
  html,
  /if \(target\.dataset\.battleState === "next"\) path\.classList\.add\("is-up-next-incoming"\);/,
  "the up-next match's incoming connector must be marked the same way"
);
assert.match(
  html,
  /winnerAnimationState\?\.selected\?\.bracketKey === source\.dataset\.bracketKey[\s\S]*?path\.classList\.add\("is-just-advanced"\);/,
  "the one-time winning-connector streak must be keyed off the same transient winnerAnimationState window the morph and slot-pop animations already use"
);
assert.match(
  html,
  /if \(!Number\.isInteger\(roundIndex\) \|\| !Number\.isInteger\(matchIndex\) \|\| side === "center"\) return;/,
  "a center (championship) match must never produce an outgoing connector"
);
assert.doesNotMatch(
  html,
  /renderPlacementBattle\([^)]*\)[\s\S]{0,40}data-connector-side/,
  "third-place must never carry a connector-side attribute that could route it into the championship path"
);

// -- Reduced motion: every new bracket-flow animation collapses to a
// static state under prefers-reduced-motion. --

assert.match(
  html,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.battle-state-badge\.is-current::before \{ animation: none; \}/,
  "current-battle badge pulse must stop under reduced motion"
);
assert.match(
  html,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-entrance="stagger"\] \{ animation: none; \}/,
  "bracket entrance stagger must be skipped under reduced motion"
);
assert.match(
  html,
  /@media \(prefers-reduced-motion: reduce\) \{\s*\.bracket-connector-path\.is-current-outgoing \{[\s\S]*?animation: none;/,
  "the current-battle connector energy flow must stop under reduced motion"
);

// -- Hydration/replay safety and preserved advancement guarantees. --

assert.match(
  html,
  /let bracketEntranceAnimatedForEventId = null;/,
  "the one-time bracket entrance stagger must be tracked per-event so a routine rerender of the same event never replays it"
);
assert.match(
  html,
  /const animateEntrance = bracketEntranceAnimatedForEventId !== entranceEventId;/,
  "entrance animation must only be requested when this event's bracket has not already been animated in this session"
);
assert.match(
  html,
  /if \(match && roundIndex < \(rounds\?\.length \|\| 0\) - 1\)/,
  "a match in the final round must not compute a forward target -- the championship never morphs forward"
);

// -- Morph selectors untouched by the redesign. --

assert.match(
  html,
  /document\.querySelector\(`button\.slot-button\$\{attrSelector\}, button\.driver-button\$\{attrSelector\}`\)/,
  "findBracketSlotElement's selector contract must remain exactly what the winner-card morph depends on"
);

console.log("bracket presentation regression tests passed");
