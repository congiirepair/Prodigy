import { test, expect } from "@playwright/test";
import { applySingleEliminationWinner, buildRandomSingleEliminationBracket, getBracketDisplayWindow, getSingleEliminationBracketProjection, resetSingleEliminationWinners } from "../../assets/js/competition/singleElimination.js";
import { buildTech1RegistrationDoc } from "../../assets/js/data/tech1AnniversaryAdapter.js";
import { renderTech1CompetitionBracketPanel, renderTech1EventControlPanel } from "../../assets/js/views/tech1DriftView.js";

const homeUrl = "/?emulators=0&qaOffline=1";

function buildRegistrations(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tech1-window-driver-${String(index + 1).padStart(3, "0")}`,
    registrationId: `tech1-window-driver-${String(index + 1).padStart(3, "0")}`,
    name: `Window Driver ${index + 1}`,
    displayName: `Window Driver ${index + 1}`,
    teamName: index % 2 ? "Team Drift" : "",
    chassis: "RDX",
    instagram: `@window_${index + 1}`,
    checkedIn: true,
    bracketEligible: true,
    freeTickets: 1,
    paidTickets: index % 3,
    totalTickets: 1 + (index % 3),
    amountPaid: (index % 3) * 5,
  }));
}

function seededRandom(seed = 1) {
  let state = Math.max(1, Number(seed || 1));
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function buildEventAdminDeskSimulation(count, nonCompetingCount = 0) {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const paidTickets = 6 + (index % 10);
    const competing = index < count - nonCompetingCount;
    return buildTech1RegistrationDoc({
      id: `tech1-desk-sim-${number}`,
      name: `Desk Simulation Driver ${number}`,
      teamName: `Desk Team ${(index % 8) + 1}`,
      chassis: index % 2 === 0 ? "Yokomo RD2.0" : "MST RMX",
      instagram: `@desk_sim_${number}`,
      checkedIn: true,
      bracketEligible: competing,
      paidTickets,
      paymentMethod: index % 3 === 0 ? "cash" : "card",
    }, {
      eventId: "tech1drift-anniversary-may-30",
      registrationId: `tech1-desk-sim-${number}`,
      ownerUid: `desk-staff-${number}`,
      nowIso: "2026-05-30T12:00:00.000Z",
    });
  });
}

function buildWindowedBracketFixture() {
  return buildRandomSingleEliminationBracket(buildRegistrations(80), {
    random: () => 0.42,
    nowIso: "2026-05-30T12:00:00.000Z",
    createdBy: "playwright-staff",
  });
}

function advanceBracketToWinner(bracket) {
  let current = JSON.parse(JSON.stringify(bracket || {}));
  let guard = 0;
  while (current?.status !== "complete" && guard < 500) {
    const playable = Object.values(current.matches || {}).find((match) => match.driverA && match.driverB && !match.winnerId);
    if (!playable) break;
    current = applySingleEliminationWinner(current, playable.id, playable.driverA.id, {
      nowIso: "2026-05-30T13:00:00.000Z",
    });
    guard += 1;
  }
  return current;
}

test.describe("Tech 1 Drift anniversary mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(homeUrl);
    await expect(page.locator("body")).toHaveAttribute("data-role", "spectator", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "home", { timeout: 30_000 });
  });

  test("does not expose a standalone public Tech 1 page", async ({ page }) => {
    await page.goto("/tech1?emulators=0&qaOffline=1");
    await expect(page.locator("body")).toHaveAttribute("data-role", "spectator", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "home", { timeout: 30_000 });
    await expect(page.locator(".mode-tab[data-target='tech1']")).toHaveCount(0);
    await expect(page.locator("#view-tech1")).toHaveCount(0);
    await expect(page.locator("#tech1RegistrationForm")).toHaveCount(0);
    await expect(page.locator("#tech1RaffleForm")).toHaveCount(0);
    await expect(page.locator("[data-tech1-action='record-winner']")).toHaveCount(0);
    await expect(page.locator("[data-tech1-action='generate-bracket']")).toHaveCount(0);
  });

  test("renders the event-admin registration desk with Competing and extra ticket controls", async ({ page }) => {
    await page.setContent(renderTech1EventControlPanel({
      publicIndex: [],
      privateRegistrations: buildRegistrations(3),
      bracket: null,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
    }));

    await expect(page.getByRole("heading", { name: "Tech 1 Drift Anniversary Registration Desk" })).toBeVisible();
    await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible();
    await expect(page.locator("#tech1DeskRegistrationForm .modal-field span")).toHaveText([
      "Name",
      "Team",
      "Chassis",
      "Instagram",
      "Extra Raffle Tickets Purchased",
      "Payment Method",
    ]);
    await expect(page.locator("#tech1DeskCompeting")).toBeChecked();
    await expect(page.locator("#tech1DeskTech1Driver")).not.toBeChecked();
    await expect(page.locator("#tech1DeskRegistrationForm").getByText("Tech 1 Driver")).toBeVisible();
    await expect(page.locator("#tech1DeskPaidTickets")).toHaveValue("0");
    await expect(page.locator("#tech1DeskPaidTickets")).toHaveAttribute("data-tech1-entry-fee", "30");
    await expect(page.locator("#tech1DeskEntryFeePreview")).toHaveText("$40");
    await expect(page.locator("#tech1DeskRaffleAmountPreview")).toHaveText("$0");
    await expect(page.locator("#tech1DeskAmountPreview")).toHaveText("$40");
    await expect(page.getByText("Desk registrations are marked Checked In automatically")).toBeVisible();
    await expect(page.getByText("Bracket will be generated from drivers marked Competing")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generate From Competing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load Sample Drivers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Raffle CSV" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export Raffle PDF" })).toBeVisible();
    await expect(page.locator("#tech1RaffleForm")).toHaveCount(0);
    await expect(page.locator("[data-tech1-action='toggle-competing']")).toHaveCount(3);
    await expect(page.locator(".tech1-ticket-update-form")).toHaveCount(3);
  });

  test("keeps Tech 1 desk fields editable before the event shell is initialized", async ({ page }) => {
    await page.setContent(renderTech1EventControlPanel({
      publicIndex: [],
      privateRegistrations: [],
      bracket: null,
      isStaff: true,
      eventInitialized: false,
      registrationOpen: false,
      syncReady: true,
    }));

    await expect(page.locator("#tech1DeskName")).toBeEnabled();
    await expect(page.locator("#tech1DeskTeamName")).toBeEnabled();
    await expect(page.locator("#tech1DeskChassis")).toBeEnabled();
    await expect(page.locator("#tech1DeskInstagram")).toBeEnabled();
    await expect(page.locator("#tech1DeskCompeting")).toBeEnabled();
    await expect(page.locator("#tech1DeskTech1Driver")).toBeEnabled();
    await expect(page.locator("#tech1DeskPaidTickets")).toBeEnabled();
    await expect(page.locator("#tech1DeskPaymentMethod")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save Driver" })).toBeEnabled();
    await expect(page.getByText("The Tech 1 event shell will be initialized automatically")).toHaveCount(0);
    await expect(page.locator("#tech1DeskStatus")).toHaveText("Extra raffle tickets are staff-confirmed at $5 each.");
  });

  test("maps desk registration fields to raffle totals and bracket eligibility", async () => {
    const registration = buildTech1RegistrationDoc({
      id: "desk-driver-1",
      name: "Desk Driver",
      teamName: "Desk Team",
      chassis: "RDX",
      instagram: "deskdriver",
      checkedIn: true,
      bracketEligible: true,
      tech1Driver: true,
      paidTickets: 4,
    }, {
      eventId: "tech1drift-anniversary-may-30",
      registrationId: "desk-driver-1",
      ownerUid: "staff",
      nowIso: "2026-05-30T10:00:00.000Z",
    });

    expect(registration.name).toBe("Desk Driver");
    expect(registration.teamName).toBe("Desk Team");
    expect(registration.chassis).toBe("RDX");
    expect(registration.instagram).toBe("@deskdriver");
    expect(registration.freeTickets).toBe(1);
    expect(registration.paidTickets).toBe(4);
    expect(registration.totalTickets).toBe(5);
    expect(registration.amountPaid).toBe(20);
    expect(registration.bracketEligible).toBe(true);
    expect(registration.tech1Driver).toBe(true);
    expect(registration.entryFee).toBe(30);

    const standardRegistration = buildTech1RegistrationDoc({
      id: "desk-driver-2",
      name: "Standard Desk Driver",
      checkedIn: true,
      bracketEligible: true,
      paidTickets: 0,
    }, {
      eventId: "tech1drift-anniversary-may-30",
      registrationId: "desk-driver-2",
      ownerUid: "staff",
      nowIso: "2026-05-30T10:00:00.000Z",
    });

    expect(standardRegistration.tech1Driver).toBe(false);
    expect(standardRegistration.entryFee).toBe(40);
  });

  test("uses only Competing drivers for the default Tech 1 bracket pool", async () => {
    const registrations = [
      { id: "competing-1", name: "Competing One", checkedIn: true, bracketEligible: true },
      { id: "competing-2", name: "Competing Two", checkedIn: true, bracketEligible: true },
      { id: "raffle-only", name: "Raffle Only", checkedIn: true, bracketEligible: false, paidTickets: 20 },
    ];
    const projection = getSingleEliminationBracketProjection(registrations, { source: "bracketEligible" });
    const bracket = buildRandomSingleEliminationBracket(registrations, {
      source: "bracketEligible",
      random: () => 0.5,
      nowIso: "2026-05-30T12:00:00.000Z",
    });

    expect(projection.eligibleCount).toBe(2);
    expect(projection.bracketSize).toBe(2);
    expect(bracket.randomizedSeedOrder).toEqual(expect.arrayContaining(["competing-1", "competing-2"]));
    expect(bracket.randomizedSeedOrder).not.toContain("raffle-only");
  });

  test("simulates 50 event-admin desk drivers with raffle totals and a stable randomized bracket", async () => {
    const registrations = buildEventAdminDeskSimulation(50);
    const totals = registrations.reduce((summary, entry) => {
      summary.freeTickets += Number(entry.freeTickets || 0);
      summary.paidTickets += Number(entry.paidTickets || 0);
      summary.totalTickets += Number(entry.totalTickets || 0);
      summary.entryFee += 40;
      summary.raffleAmountPaid += Number(entry.amountPaid || 0);
      summary.amountPaid += 40 + Number(entry.amountPaid || 0);
      return summary;
    }, { freeTickets: 0, paidTickets: 0, totalTickets: 0, entryFee: 0, raffleAmountPaid: 0, amountPaid: 0 });

    expect(registrations).toHaveLength(50);
    expect(registrations.every((entry) => entry.paidTickets > 5)).toBe(true);
    expect(totals.freeTickets).toBe(50);
    expect(totals.paidTickets).toBe(525);
    expect(totals.totalTickets).toBe(575);
    expect(totals.entryFee).toBe(2000);
    expect(totals.raffleAmountPaid).toBe(2625);
    expect(totals.amountPaid).toBe(4625);

    const bracket = buildRandomSingleEliminationBracket(registrations, {
      source: "bracketEligible",
      random: seededRandom(50),
      nowIso: "2026-05-30T12:00:00.000Z",
    });
    const sameDriversWithoutRaffleTotals = registrations.map((entry) => ({
      ...entry,
      paidTickets: 0,
      totalTickets: 1,
      amountPaid: 0,
    }));
    const raffleNeutralBracket = buildRandomSingleEliminationBracket(sameDriversWithoutRaffleTotals, {
      source: "bracketEligible",
      random: seededRandom(50),
      nowIso: "2026-05-30T12:00:00.000Z",
    });

    expect(bracket.driverCount).toBe(50);
    expect(bracket.bracketSize).toBe(64);
    expect(bracket.byes).toHaveLength(14);
    expect(bracket.randomizedSeedOrder).toHaveLength(50);
    const firstPlayable = Object.values(bracket.matches || {}).find((match) => match.driverA && match.driverB && !match.winnerId);
    expect(firstPlayable).toBeTruthy();
    const afterFirstBattle = applySingleEliminationWinner(bracket, firstPlayable.id, firstPlayable.driverA.id, {
      nowIso: "2026-05-30T12:05:00.000Z",
    });
    expect(afterFirstBattle.status).not.toBe("complete");
    expect(bracket.randomizedSeedOrder).toEqual(raffleNeutralBracket.randomizedSeedOrder);
    expect(bracket.winnerRevealStatus).toBe("hidden");
    expect(bracket.winnerRevealedAt).toBeNull();
  });

  test("excludes non-competing Tech 1 desk drivers from the bracket", async () => {
    const registrations = buildEventAdminDeskSimulation(55, 5);
    const bracket = buildRandomSingleEliminationBracket(registrations, {
      source: "bracketEligible",
      random: seededRandom(55),
      nowIso: "2026-05-30T12:00:00.000Z",
    });

    expect(registrations.filter((entry) => entry.bracketEligible)).toHaveLength(50);
    expect(registrations.filter((entry) => !entry.bracketEligible)).toHaveLength(5);
    expect(registrations.reduce((sum) => sum + 40, 0)).toBe(2200);
    expect(bracket.driverCount).toBe(50);
    expect(bracket.bracketSize).toBe(64);
    expect(bracket.byes).toHaveLength(14);
    registrations.slice(50).forEach((entry) => {
      expect(bracket.randomizedSeedOrder).not.toContain(entry.id);
    });
  });

  test("keeps Tech 1 final winner hidden until event admin reveal", async ({ page }) => {
    const bracket = buildRandomSingleEliminationBracket(buildEventAdminDeskSimulation(5), {
      source: "bracketEligible",
      random: seededRandom(5),
      nowIso: "2026-05-30T12:00:00.000Z",
    });
    const completedBracket = advanceBracketToWinner(bracket);
    const finalMatch = Object.values(completedBracket.matches || {}).find((match) => !match.advancedToMatchId);

    expect(completedBracket.status).toBe("complete");
    expect(finalMatch?.winnerId).toBeTruthy();
    expect(completedBracket.winnerRevealStatus).toBe("hidden");

    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(5),
      privateRegistrations: [],
      bracket: completedBracket,
      isStaff: false,
      syncReady: true,
      eventInitialized: true,
      registrationOpen: false,
    }));
    await expect(page.getByText("Final battle complete. Winner reveal is pending.")).toBeVisible();
    await expect(page.getByText(/Final winner:/)).toHaveCount(0);
    await expect(page.locator("[data-tech1-action='reveal-winner']")).toHaveCount(0);
    await expect(page.locator(".broadcast-match-card").filter({ hasText: "Reveal Pending" }).locator(".is-current-driver")).toHaveCount(0);

    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(5),
      privateRegistrations: buildEventAdminDeskSimulation(5),
      bracket: completedBracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: false,
      syncReady: true,
    }));
    await expect(page.getByRole("button", { name: "Reveal Final Winner" })).toBeVisible();
    await expect(page.getByText(/Final winner:/)).toHaveCount(0);

    const revealedBracket = {
      ...completedBracket,
      winnerRevealStatus: "revealed",
      winnerRevealedAt: "2026-05-30T13:30:00.000Z",
      winnerRevealUpdatedBy: "event-admin",
    };
    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(5),
      privateRegistrations: [],
      bracket: revealedBracket,
      isStaff: false,
      syncReady: true,
      eventInitialized: true,
      registrationOpen: false,
    }));
    await expect(page.getByText(/Final winner:/)).toBeVisible();
    await expect(page.locator("[data-tech1-action='reveal-winner']")).toHaveCount(0);
  });

  test("windows an 80-driver bracket into 32-slot public-safe groups", async ({ page }) => {
    const bracket = buildWindowedBracketFixture();
    const seedOrder = [...bracket.randomizedSeedOrder];
    const group1 = getBracketDisplayWindow(bracket, { pageSize: 32, pageIndex: 0 });
    const group4 = getBracketDisplayWindow(bracket, { pageSize: 32, pageIndex: 3 });

    expect(bracket.driverCount).toBe(80);
    expect(bracket.bracketSize).toBe(128);
    expect(bracket.byes).toHaveLength(48);
    expect(group1.totalPages).toBe(4);
    expect(group1.startSlot).toBe(1);
    expect(group1.endSlot).toBe(32);
    expect(group4.startSlot).toBe(97);
    expect(group4.endSlot).toBe(128);
    expect(bracket.randomizedSeedOrder).toEqual(seedOrder);

    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: [],
      bracket,
      isStaff: false,
      syncReady: true,
      eventInitialized: true,
      registrationOpen: true,
      bracketPageIndex: 0,
    }));
    await expect(page.getByText("Viewing slots 1-32 of 128")).toBeVisible();
    await expect(page.getByRole("button", { name: "Group 4" })).toBeVisible();
    await expect(page.locator("[data-tech1-action='record-winner']")).toHaveCount(0);

    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: [],
      bracket,
      isStaff: false,
      syncReady: true,
      eventInitialized: true,
      registrationOpen: true,
      bracketPageIndex: 3,
    }));
    await expect(page.getByText("Viewing slots 97-128 of 128")).toBeVisible();
    await expect(page.getByText("Slot 97")).toBeVisible();
    await expect(page.getByText("Slot 128")).toBeVisible();
    await expect(page.locator("[data-tech1-action='record-winner']")).toHaveCount(0);
  });

  test("staff windowed bracket keeps winner advancement available on visible matches", async ({ page }) => {
    const bracket = buildWindowedBracketFixture();
    const displayWindow = getBracketDisplayWindow(bracket, { pageSize: 32, pageIndex: 2 });
    const playableMatch = displayWindow.visibleMatches.find((match) => match.driverA && match.driverB && !match.winnerId);
    expect(playableMatch).toBeTruthy();
    const advanced = applySingleEliminationWinner(bracket, playableMatch.id, playableMatch.driverA.id, {
      nowIso: "2026-05-30T12:05:00.000Z",
    });
    expect(advanced.matches[playableMatch.id].winnerId).toBe(playableMatch.driverA.id);
    expect(advanced.randomizedSeedOrder).toEqual(bracket.randomizedSeedOrder);
    const reset = resetSingleEliminationWinners(advanced, {
      nowIso: "2026-05-30T12:10:00.000Z",
      status: "generated",
    });
    expect(reset.matches[playableMatch.id].winnerId).toBeNull();
    expect(reset.randomizedSeedOrder).toEqual(bracket.randomizedSeedOrder);
    expect(reset.byes.length).toBe(48);

    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: buildRegistrations(80),
      bracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      bracketPageIndex: 2,
    }));
    await expect(page.getByText("Viewing slots 65-96 of 128")).toBeVisible();
    await expect(page.locator("[data-tech1-action='record-winner']")).not.toHaveCount(0);
    await expect(page.locator("[data-tech1-action='reset-winners']")).toHaveCount(1);
  });

  test("merges Tech 1 groups into one live Top 32 bracket", async ({ page }) => {
    let bracket = buildWindowedBracketFixture();
    let guard = 0;
    while (guard < 128) {
      const activeMatch = Object.values(bracket.matches || {})
        .filter((match) => match.driverA && match.driverB && !match.winnerId)
        .sort((left, right) => (Number(left.round || 0) - Number(right.round || 0))
          || (Number(left.matchNumber || 0) - Number(right.matchNumber || 0)))[0];
      if (!activeMatch) break;
      const activeFieldSize = Math.max(1, Math.round(Number(bracket.bracketSize || 0) / (2 ** (Math.max(1, Number(activeMatch.round || 1)) - 1))));
      if (activeFieldSize <= 32) break;
      bracket = applySingleEliminationWinner(bracket, activeMatch.id, activeMatch.driverA.id, {
        nowIso: "2026-05-30T13:00:00.000Z",
      });
      guard += 1;
    }
    const activeTop32Matches = Object.values(bracket.matches || {}).filter((match) => Number(match.round || 0) === 3 && match.driverA && match.driverB && !match.winnerId);
    expect(activeTop32Matches.length).toBeGreaterThan(0);

    await page.setViewportSize({ width: 2048, height: 1152 });
    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: buildRegistrations(80),
      bracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      bracketPageIndex: 3,
    }));

    await expect(page.locator(".tech1-bracket-window")).toHaveAttribute("data-bracket-mode", "top32");
    await expect(page.locator(".tech1-bracket-mode-note")).toContainText("Top 32 Bracket Locked In");
    await expect(page.locator(".tech1-bracket-group-buttons")).toHaveCount(0);
    await expect(page.getByText("Top 32 Unified Bracket")).toBeVisible();
    await expect(page.locator(".broadcast-match-card").first()).toContainText("Top 32");
  });

  test("unified Top 32 keeps previous columns visible as rounds advance", async ({ page }) => {
    let bracket = buildWindowedBracketFixture();
    let guard = 0;
    while (guard < 128) {
      const activeMatch = Object.values(bracket.matches || {})
        .filter((match) => match.driverA && match.driverB && !match.winnerId)
        .sort((left, right) => (Number(left.round || 0) - Number(right.round || 0))
          || (Number(left.matchNumber || 0) - Number(right.matchNumber || 0)))[0];
      if (!activeMatch) break;
      const activeFieldSize = Math.max(1, Math.round(Number(bracket.bracketSize || 0) / (2 ** (Math.max(1, Number(activeMatch.round || 1)) - 1))));
      if (activeFieldSize <= 16) break;
      bracket = applySingleEliminationWinner(bracket, activeMatch.id, activeMatch.driverA.id, {
        nowIso: "2026-05-30T14:00:00.000Z",
      });
      guard += 1;
    }

    await page.setViewportSize({ width: 2048, height: 1152 });
    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: buildRegistrations(80),
      bracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      bracketPageIndex: 0,
    }));

    const roundSections = page.locator(".streamer-help-grid > .panel");
    await expect(roundSections.filter({ has: page.locator(".section-kicker", { hasText: /^Top 32$/i }) })).toHaveCount(1);
    await expect(roundSections.filter({ has: page.locator(".section-kicker", { hasText: /^Top 16$/i }) })).toHaveCount(1);
    await expect(roundSections.filter({ has: page.locator(".section-kicker", { hasText: /^Top 8$/i }) })).toHaveCount(1);
    await expect(roundSections.filter({ has: page.locator(".section-kicker", { hasText: /^Semi Finals$/i }) })).toHaveCount(1);
  });

  test("staff bracket shows Tech 1 mobile judging status for the active battle", async ({ page }) => {
    const bracket = buildRandomSingleEliminationBracket(buildRegistrations(8), {
      source: "bracketEligible",
      random: seededRandom(8),
      nowIso: "2026-05-30T12:00:00.000Z",
    });
    const playableMatch = Object.values(bracket.matches || {}).find((match) => match.driverA && match.driverB && !match.winnerId);
    expect(playableMatch).toBeTruthy();
    const judgedBracket = {
      ...bracket,
      tech1JudgeControl: {
        status: "voting",
        cycle: 1,
        matchId: playableMatch.id,
        entry: {
          title: playableMatch.roundName,
          meta: `Match ${playableMatch.matchNumber}`,
        },
        votes: {
          j1: "left",
          j2: null,
          j3: null,
        },
      },
    };

    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(8),
      privateRegistrations: buildRegistrations(8),
      bracket: judgedBracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      bracketPageIndex: 0,
    }));

    await expect(page.getByText(/Mobile judging active/)).toBeVisible();
    await expect(page.getByText("Mobile judge flow active. 1/3 votes submitted.")).toBeVisible();
    await expect(page.locator(".broadcast-match-card").filter({ hasText: "Mobile judge flow active" })).toBeVisible();
  });

  test("Tech 1 bracket is available as the Competition tab surface", async ({ page }) => {
    const bracket = buildRandomSingleEliminationBracket(buildRegistrations(8), {
      source: "bracketEligible",
      random: seededRandom(8),
      nowIso: "2026-05-30T12:00:00.000Z",
    });

    await page.setContent(renderTech1EventControlPanel({
      publicIndex: buildRegistrations(8),
      privateRegistrations: buildRegistrations(8),
      bracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      includeBracketSection: false,
    }));
    await expect(page.getByRole("heading", { name: "Tech 1 Drift Anniversary Registration Desk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stored Randomized Bracket" })).toHaveCount(0);

    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(8),
      privateRegistrations: buildRegistrations(8),
      bracket,
      isStaff: true,
      eventInitialized: true,
      registrationOpen: true,
      syncReady: true,
      bracketPageIndex: 0,
    }));
    await expect(page.getByRole("heading", { name: "Competition Bracket" })).toBeVisible();
    await expect(page.getByText("Viewing slots 1-8 of 8")).toBeVisible();
    await expect(page.locator("#view-bracket #tech1DeskRegistrationForm")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generate From Competing" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reset Bracket" })).toBeVisible();
  });

  test("mobile windowed bracket keeps group controls usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const bracket = buildWindowedBracketFixture();
    await page.setContent(renderTech1CompetitionBracketPanel({
      publicIndex: buildRegistrations(80),
      privateRegistrations: [],
      bracket,
      isStaff: false,
      syncReady: true,
      eventInitialized: true,
      registrationOpen: true,
      bracketPageIndex: 3,
    }));
    await expect(page.getByText("Viewing slots 97-128 of 128")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Group 4" })).toBeVisible();
    const overflow = await page.locator(".tech1-bracket-window").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(4);
  });

  test("website admin event mode stays Tech 1 after save and reopening edit event", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.addInitScript(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
    await expect(page.locator("#editCurrentEventBtn")).toBeVisible({ timeout: 30_000 });

    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await expect(page.locator("#competitionModeInput")).toHaveValue("tech1-anniversary");
    await expect(page.locator("#judgeCountInput")).toBeEnabled();
    await page.selectOption("#judgeCountInput", "1");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await expect(page.locator("#competitionModeInput")).toHaveValue("tech1-anniversary");
    await expect(page.locator("#judgeCountInput")).toBeEnabled();
    await expect(page.locator("#judgeCountInput")).toHaveValue("1");
    await page.selectOption("#judgeCountInput", "3");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);
    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await expect(page.locator("#competitionModeInput")).toHaveValue("tech1-anniversary");
    await expect(page.locator("#judgeCountInput")).toHaveValue("3");
  });

  test("Tech 1 judge routes skip qualifying and open the competition judge panel", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });

    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    await page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({
        [activeEventId]: { j1: true, j2: true, j3: true },
      }));
      localStorage.setItem("rc-drift-event-role-v1", JSON.stringify({
        [activeEventId]: "j1",
      }));
      localStorage.setItem("rc-drift-theme-v1", "dark");
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await expect(page.locator("body")).toHaveAttribute("data-role", "j1", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#view-qualifying")).not.toHaveClass(/is-active/);
    await expect(page.locator("#competitionJudgePanel")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toContainText("Focus Mode");
    await expect(page.locator("#bracketBoard .main-board-canvas")).toHaveCount(0);
    await expect.poll(async () => page.locator("#competitionJudgePanel .judge-lane-toolbar").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(255, 255, 255)");

    await page.evaluate(() => localStorage.setItem("rc-drift-theme-v1", "light"));
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#view-qualifying")).not.toHaveClass(/is-active/);
    await expect.poll(async () => page.locator("#competitionJudgePanel .judge-lane-toolbar").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(17, 17, 17)");
  });

  test("fresh event-admin host session unlocks admin clicks on a second browser", async ({ page }) => {
    await page.addInitScript(() => {
      window.RC_DRIFT_CLIENT_CONFIG = {
        ...(window.RC_DRIFT_CLIENT_CONFIG || {}),
        routing: {
          ...((window.RC_DRIFT_CLIENT_CONFIG || {}).routing || {}),
          adminHost: "127.0.0.1",
        },
      };
      localStorage.removeItem("rc-drift-event-admin-browser-unlock-v1");
      sessionStorage.removeItem("rc-drift-event-admin-browser-unlock-v1");
      localStorage.removeItem("rc-drift-event-role-unlocks-v1");
      localStorage.removeItem("rc-drift-event-role-persist-v1");
      sessionStorage.removeItem("rc-drift-event-role-v1");
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin", { timeout: 30_000 });
    await expect(page.locator("#passwordModal")).toHaveClass(/hidden/);
    await expect(page.locator("#view-registration")).toHaveClass(/is-active/);
    await expect(page.getByRole("button", { name: "Add Driver" })).toBeEnabled();
    await expect.poll(async () => page.evaluate(() => ({
      browserUnlock: localStorage.getItem("rc-drift-event-admin-browser-unlock-v1"),
      role: document.body.dataset.role,
    }))).toEqual({
      browserUnlock: "true",
      role: "admin",
    });
  });

  test("Tech 1 mobile judging follows the configured judge count", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.addInitScript(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.selectOption("#judgeCountInput", "1");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      const directory = JSON.parse(localStorage.getItem("rc-drift-event-directory-v1") || "{}");
      const eventMeta = directory?.[activeEventId] || {};
      return {
        judgeCount: eventMeta.judgeCount,
        judgingMode: eventMeta.judgingMode,
      };
    }), { timeout: 30_000 }).toEqual({
      judgeCount: 1,
      judgingMode: "average",
    });

    let deskPageReady = false;
    async function saveDeskDriver(name, instagram) {
      if (!deskPageReady) {
        await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
        deskPageReady = true;
      }
      await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tech1DeskName").fill(name);
      await page.locator("#tech1DeskTeamName").fill("One Judge Team");
      await page.locator("#tech1DeskChassis").fill("RDX");
      await page.locator("#tech1DeskInstagram").fill(instagram);
      await page.locator("#tech1DeskRegistrationForm button[type='submit']").click();
      await expect(page.locator(".tech1-driver-card strong", { hasText: name })).toBeVisible({ timeout: 30_000 });
    }

    await saveDeskDriver("One Judge Alpha", "@one_judge_alpha");
    await saveDeskDriver("One Judge Bravo", "@one_judge_bravo");
    await expect(page.locator(".tech1-driver-card")).toHaveCount(2);
    await page.locator("[data-tech1-action='generate-bracket']").click();
    await expect.poll(async () => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return state?.bracket?.driverCount || 0;
    }), { timeout: 30_000 }).toBe(2);
    await page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({
        [activeEventId]: { j1: true },
      }));
      localStorage.setItem("rc-drift-event-role-v1", JSON.stringify({
        [activeEventId]: "j1",
      }));
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await expect(page.locator("body")).toHaveAttribute("data-role", "j1", { timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toContainText("0/1 Votes", { timeout: 30_000 });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("#bracketBoard .tech1-battle-flow-card").first()).toContainText("0/1 judge vote", { timeout: 30_000 });
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      const activeControl = state?.bracket?.tech1JudgeControl;
      state.event = {
        ...(state.event || {}),
        judgeCount: 3,
        judgingMode: "average",
        updatedAt: "2020-01-01T00:00:00.000Z",
      };
      if (activeControl) {
        activeControl.judgeRoles = ["j1", "j2", "j3"];
      }
      localStorage.setItem("rc-drift-tech1-local-state-v1", JSON.stringify(state));
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await page.locator("#competitionJudgePanel [data-action='judge-competition-vote'][data-side='left']").click();
    await expect(page.locator("#competitionJudgePanel")).toContainText("1/1 Votes", { timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).not.toContainText(/Waiting on 2 other judges?/i);

    await page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      const roleMap = { [activeEventId]: "admin" };
      sessionStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
      localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify(roleMap));
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("#competitionDecisionPanel:not(.hidden)")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#competitionDecisionPanel")).toContainText("Contest?");
    await expect(page.locator("#competitionDecisionPanel")).toContainText("Continue");
  });

  test("event-admin Tech 1 bracket uses the Solo Drivers bracket and judge surfaces", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.evaluate(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
      localStorage.removeItem("rc-drift-tech1-local-state-v1");
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    async function saveDeskDriver(name, instagram) {
      await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
      await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible({ timeout: 30_000 });
      await page.locator("#tech1DeskName").fill(name);
      await page.locator("#tech1DeskTeamName").fill("Solo Style Team");
      await page.locator("#tech1DeskChassis").fill("RDX");
      await page.locator("#tech1DeskInstagram").fill(instagram);
      await page.locator("#tech1DeskPaidTickets").fill("6");
      await page.locator("#tech1DeskRegistrationForm button[type='submit']").click();
      await expect(page.locator(".tech1-driver-card strong", { hasText: name })).toBeVisible({ timeout: 30_000 });
    }

    await saveDeskDriver("Solo Style Alpha", "@solo_style_alpha");
    await saveDeskDriver("Solo Style Bravo", "@solo_style_bravo");
    await page.locator("[data-tech1-action='generate-bracket']").click();

    await page.evaluate(() => localStorage.setItem("rc-drift-theme-v1", "light"));
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-theme", "light", { timeout: 30_000 });
    await expect(page.locator("#bracketBoard .main-board-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#bracketBoard .final-battle-card:not(.third-place-card)")).toBeVisible();
    await expect(page.locator("#bracketBoard .slot-button", { hasText: "Solo Style Alpha" })).toBeVisible();
    await expect(page.locator("#bracketBoard .slot-button", { hasText: "Solo Style Bravo" })).toBeVisible();
    await expect(page.locator("#bracketBoard .broadcast-match-card")).toHaveCount(0);
    await expect(page.locator("#bracketBoard .battle-flow-card")).toHaveCount(2);
    await expect(page.locator("#bracketBoard .battle-flow-card").filter({ hasText: "Current Battle" })).toBeVisible();
    await expect(page.locator("#bracketBoard .battle-flow-card").filter({ hasText: "Next Battle" })).toBeVisible();
    await expect(page.locator("#bracketBoard .tech1-main-bracket-panel .seed-chip")).toHaveCount(0);
    await expect.poll(async () => (await page.locator("#bracketBoard .battle-flow-card").allTextContents()).join(" ")).not.toMatch(/#\d+/);
    await expect(page.locator("#bracketBoard .tech1-bracket-brand img:visible")).toHaveCount(1);
    await expect.poll(async () => page.locator("#bracketBoard .tech1-bracket-brand img:visible").evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(90);
    await expect.poll(async () => page.evaluate(() => {
      const panel = document.querySelector(".tech1-main-bracket-panel");
      const windowPanel = document.querySelector(".tech1-bracket-window");
      const slot = document.querySelector(".tech1-main-bracket-panel .slot-button");
      const tech1SlotTeamLines = Array.from(document.querySelectorAll(".tech1-main-bracket-panel .slot-team"))
        .map((element) => element.textContent?.trim() || "")
        .filter(Boolean);
      return {
        panelBackground: panel ? getComputedStyle(panel).backgroundImage : "",
        logoBackground: windowPanel ? getComputedStyle(windowPanel, "::before").backgroundImage : "",
        slotBackground: slot ? getComputedStyle(slot).backgroundColor : "",
        tech1SlotTeamLines,
      };
    })).toEqual(expect.objectContaining({
      logoBackground: expect.stringContaining("tech1drift-vector-transparent-black.svg"),
      slotBackground: "rgba(255, 255, 255, 0.98)",
      tech1SlotTeamLines: expect.arrayContaining(["Solo Style Team"]),
    }));
    await expect.poll(async () => page.evaluate(() => (
      Array.from(document.querySelectorAll(".tech1-main-bracket-panel .slot-team"))
        .map((element) => element.textContent?.trim() || "")
        .filter(Boolean)
        .every((line) => line === "Solo Style Team")
    ))).toBe(true);

    await page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({
        [activeEventId]: { j1: true, j2: true, j3: true },
      }));
      localStorage.setItem("rc-drift-event-role-v1", JSON.stringify({
        [activeEventId]: "j1",
      }));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket", { timeout: 30_000 });
    await expect(page.locator("#view-qualifying")).not.toHaveClass(/is-active/);
    await expect(page.locator("#bracketBoard .main-board-canvas")).toHaveCount(0);
    await expect(page.locator("#competitionJudgePanel [data-action='judge-competition-vote']")).toHaveCount(3);
    await expect(page.locator("#competitionJudgePanel")).toContainText("Choose Winner Or OMT");
    await expect.poll(async () => page.evaluate(() => {
      const documentScroller = document.scrollingElement || document.documentElement;
      const panel = document.querySelector("#competitionJudgePanel");
      const voteButtons = Array.from(document.querySelectorAll("#competitionJudgePanel [data-action='judge-competition-vote']"));
      const viewportHeight = window.innerHeight;
      return {
        pageFits: documentScroller.scrollHeight <= viewportHeight + 2,
        panelFits: panel ? panel.scrollHeight <= panel.clientHeight + 2 : false,
        visibleVotes: voteButtons.filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= viewportHeight;
        }).length,
      };
    })).toEqual({
      pageFits: true,
      panelFits: true,
      visibleVotes: 3,
    });

    for (const role of ["j1", "j2", "j3"]) {
      const roleNumber = role.replace("j", "");
      await page.evaluate((nextRole) => {
        const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
        const roleMap = { [activeEventId]: nextRole };
        localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({
          [activeEventId]: { j1: true, j2: true, j3: true },
        }));
        sessionStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
        localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify(roleMap));
      }, role);
      await page.goto(`/?emulators=0&qaOffline=1&testMode=1#/judge-${roleNumber}`);
      await expect(page.locator("body")).toHaveAttribute("data-role", role, { timeout: 30_000 });
      await expect(page.locator("#competitionJudgePanel")).toBeVisible({ timeout: 30_000 });
      const leftVote = page.locator("#competitionJudgePanel [data-action='judge-competition-vote'][data-side='left']").first();
      await expect(leftVote).toBeVisible({ timeout: 20_000 });
      await leftVote.click();
    }

    await page.evaluate(() => {
      const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "main-event";
      const roleMap = { [activeEventId]: "admin" };
      sessionStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
      localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify(roleMap));
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin", { timeout: 30_000 });
    await expect(page.locator("#competitionDecisionPanel:not(.hidden)")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#competitionDecisionPanel")).toContainText("Contest?");
    await expect(page.locator("#competitionDecisionPanel .competition-contest-timer")).toBeVisible();
    await expect(page.locator("#competitionDecisionPanel .competition-contest-timer")).toHaveText(/1[0-5]/);
    const winnerFocusVisible = await page.locator("#competitionDecisionPanel .tech1-winner-name").count();
    if (!winnerFocusVisible) {
      await expect(page.locator("#competitionDecisionPanel")).toContainText("Result is locked for trophy reveal");
    }
    await expect(page.locator("#competitionDecisionPanel")).toContainText("Continue");
    await page.locator("#competitionDecisionPanel [data-action='tech1-admin-decision'][data-decision='advance']").click();
    await expect.poll(async () => page.evaluate(() => {
      const panel = document.querySelector("#competitionDecisionPanel");
      if (!panel) return "missing";
      if (panel.classList.contains("hidden")) return "hidden";
      return panel.classList.contains("is-contest-overlay") ? "contest" : "visible";
    }), { timeout: 20_000 }).toMatch(/hidden|contest/);
  });

  test("Tech 1 fullscreen bracket stays readable with sponsor footer", async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1152 });
    page.on("dialog", async (dialog) => dialog.accept());
    await page.evaluate(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
      localStorage.removeItem("rc-drift-tech1-local-state-v1");
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
    await expect(page.getByRole("button", { name: "Load Sample Drivers" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Load Sample Drivers" }).click();
    await expect(page.locator(".tech1-driver-card").first()).toBeVisible({ timeout: 30_000 });
    await page.locator("[data-tech1-action='generate-bracket']").click();

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("#bracketBoard .main-board-canvas")).toBeVisible({ timeout: 30_000 });
    await page.locator("#presentationFullscreenBracketBtn").click();
    await expect(page.locator("body")).toHaveClass(/bracket-fullscreen/, { timeout: 30_000 });
    await expect(page.locator("#bracketBoard .tech1-bracket-header-layout")).toBeVisible();
    await expect(page.locator("#bracketBoard .tech1-bracket-header-layout .battle-flow-card").first()).toBeVisible();
    await expect(page.locator("#bracketBoard .main-board-canvas")).toBeVisible();

    const measurements = await page.evaluate(() => {
      const toBox = (element) => {
        const rect = element?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom } : null;
      };
      const canvas = document.querySelector("#bracketBoard .main-board-canvas");
      const bracketWindow = document.querySelector("#bracketBoard .tech1-bracket-window");
      const header = document.querySelector("#bracketBoard .tech1-bracket-header-layout");
      const sponsorFooterImages = Array.from(document.querySelectorAll(".tech1-sponsor-footer img"));
      const sponsorBackdropImages = Array.from(document.querySelectorAll(".tech1-sponsor-backdrop img"));
      const sponsorFooter = document.querySelector(".tech1-sponsor-footer");
      const bracketSlots = Array.from(document.querySelectorAll("#bracketBoard .main-battle-slot"));
      const laterRoundLabels = Array.from(document.querySelectorAll('#bracketBoard .main-board-round[data-round-number]:not([data-round-number="1"]) .slot-name'))
        .map((element) => element.textContent?.trim() || "");
      const windowBox = toBox(bracketWindow);
      const headerBox = toBox(header);
      const slotBoxes = bracketSlots.map(toBox).filter(Boolean);
      return {
        canvas: toBox(canvas),
        windowBox,
        headerDisplay: header ? getComputedStyle(header).display : "",
        sponsorFooterDisplay: sponsorFooter ? getComputedStyle(sponsorFooter).display : "",
        sponsorCount: sponsorFooterImages.length + sponsorBackdropImages.length,
        laterRoundByeLabels: laterRoundLabels.filter((label) => label === "Bye").length,
        laterRoundPendingLabels: laterRoundLabels.filter((label) => label === "Pending").length,
        zoom: Number.parseFloat(canvas?.style.zoom || "1"),
        clippedBelowWindow: windowBox
          ? slotBoxes.filter((slot) => slot.bottom > windowBox.bottom + 1).length
          : null,
      };
    });

    expect(measurements.sponsorCount).toBeGreaterThanOrEqual(0);
    if (measurements.sponsorCount > 0) {
      expect(measurements.sponsorFooterDisplay).not.toBe("none");
    }
    expect(measurements.laterRoundByeLabels).toBe(0);
    expect(measurements.laterRoundPendingLabels).toBeGreaterThan(0);
    expect(measurements.zoom).toBeGreaterThan(0.75);
    expect(measurements.canvas.width).toBeGreaterThan(1200);
    expect(measurements.canvas.height).toBeGreaterThan(420);
    expect(measurements.headerDisplay).not.toBe("none");
    expect(measurements.clippedBelowWindow).toBe(0);
  });

  test("event-admin can advance Tech 1 battles from current battle card and bracket names", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.evaluate(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
      localStorage.removeItem("rc-drift-tech1-local-state-v1");
    });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
    await expect(page.getByRole("button", { name: "Load Sample Drivers" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Load Sample Drivers" }).click();
    await expect(page.locator(".tech1-driver-card").first()).toBeVisible({ timeout: 30_000 });
    await page.locator("[data-tech1-action='generate-bracket']").click();

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("#bracketBoard .main-board-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#bracketBoard .tech1-round-flow-note")).toContainText("Active round");
    await expect(page.locator("#bracketBoard .tech1-round-flow-note")).toContainText("Finish all");
    await expect(page.locator('#bracketBoard .main-board-round[data-round-number]:not([data-round-number="1"]) [data-tech1-action="record-winner"]')).toHaveCount(0);
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      const target = Object.values(stored.bracket?.matches || {})
        .find((match) => match?.round === 1 && match.matchNumber > 16 && match.driverA && match.driverB && !match.winnerId);
      if (!target) return;
      stored.bracket.tech1JudgeControl = {
        status: "voting",
        cycle: 1,
        matchId: target.id,
        entry: {
          bracketKey: "tech1",
          roundIndex: 0,
          matchIndex: target.matchNumber - 1,
          matchId: target.id,
          title: target.roundName,
          meta: `Match ${target.matchNumber}`,
          match: {
            left: target.driverA,
            right: target.driverB,
          },
        },
        votes: { j1: null, j2: null, j3: null },
        reason: null,
        resolvedWinnerSide: null,
        resolvedAt: null,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem("rc-drift-tech1-local-state-v1", JSON.stringify(stored));
    });
    await page.reload();
    await expect(page.locator("#bracketBoard .tech1-bracket-window")).toHaveAttribute("data-page-index", /^[01]$/, { timeout: 30_000 });
    await expect(page.locator("#bracketBoard .tech1-battle-flow-card.current")).toContainText("Current Battle");
    const bracketAdvanceButtons = page.locator("#bracketBoard .main-board-canvas [data-tech1-action='record-winner']");
    const groupButtons = page.locator("#bracketBoard .tech1-bracket-group-buttons [data-tech1-action='bracket-page']");
    const groupCount = await groupButtons.count();
    let visibleActiveBattleGroupFound = await bracketAdvanceButtons.count() > 0;
    for (let index = 0; !visibleActiveBattleGroupFound && index < groupCount; index += 1) {
      await groupButtons.nth(index).click();
      visibleActiveBattleGroupFound = await bracketAdvanceButtons.count() > 0;
    }
    expect(visibleActiveBattleGroupFound).toBe(true);
    await bracketAdvanceButtons.first().click();
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    })).toBeGreaterThan(0);
    await expect(page.locator("#bracketBoard .slot-button.retractable-winner").first()).toBeVisible({ timeout: 20_000 });
    await page.locator("#bracketBoard .slot-button.retractable-winner").first().click();
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      const control = stored.bracket?.tech1JudgeControl || {};
      return {
        manualWinners: Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId && match?.resultStatus !== "bye").length,
        controlStatus: control.status,
      };
    })).toEqual({
      manualWinners: 0,
      controlStatus: "voting",
    });
    await expect(page.locator("#bracketBoard .slot-button.retractable-winner")).toHaveCount(0);
    await page.locator("#bracketBoard .main-board-canvas [data-tech1-action='record-winner']").first().click();
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    })).toBeGreaterThan(0);
    const winnerCountAfterBracketClick = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    });

    await page.getByRole("button", { name: "Reset Bracket" }).click();
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    })).toBeLessThan(winnerCountAfterBracketClick);
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      const control = stored.bracket?.tech1JudgeControl || {};
      return {
        status: control.status,
        matchId: control.matchId || "",
      };
    })).toMatchObject({
      status: "voting",
    });
    const resetWinnerCount = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    });

    const currentBattleAdvanceButtons = page.locator("#bracketBoard .tech1-battle-flow-card.current [data-tech1-action='record-winner']");
    await expect(currentBattleAdvanceButtons).toHaveCount(2);
    await currentBattleAdvanceButtons.first().click();
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return Object.values(stored.bracket?.matches || {}).filter((match) => match?.winnerId).length;
    })).toBeGreaterThan(resetWinnerCount);
  });

  test("event-admin desk save persists locally after Enter and rerender", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await page.addInitScript(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
    });
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/website-admin");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });

    await page.locator("#editCurrentEventBtn").click();
    await expect(page.locator("#createEventModal:not(.hidden)")).toBeAttached();
    await page.selectOption("#competitionModeInput", "tech1-anniversary");
    await page.locator("#createEventSubmitBtn").click();
    await expect.poll(
      async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
      { timeout: 30_000 }
    ).toBe(true);

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin", { timeout: 30_000 });
    await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible({ timeout: 30_000 });
    await page.locator("#tech1DeskName").fill("QA Local Driver");
    await page.locator("#tech1DeskTeamName").fill("QA Team");
    await page.locator("#tech1DeskChassis").fill("RDX");
    await page.locator("#tech1DeskInstagram").fill("@qa_local_driver");
    await page.locator("#tech1DeskPaidTickets").fill("7");
    await page.locator("#tech1DeskPaymentMethod").fill("cash");
    await page.locator("#tech1DeskPaymentMethod").press("Enter");

    await expect(page.locator(".tech1-driver-card strong", { hasText: "QA Local Driver" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("7 total tickets")).toBeVisible();
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket", { timeout: 30_000 });
    await expect(page.locator("#bracketBoard .tech1-solo-bracket-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#bracketBoard")).not.toContainText("Generate From Competing");
    await expect(page.locator("#view-bracket #tech1DeskRegistrationForm")).toHaveCount(0);
    await page.reload();
    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/registration");
    await expect(page.locator(".tech1-driver-card strong", { hasText: "QA Local Driver" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
      return stored.privateRegistrations?.some((entry) => entry.name === "QA Local Driver" && entry.paidTickets === 7);
    })).toBe(true);
  });
});
