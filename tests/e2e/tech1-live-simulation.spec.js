import { test, expect } from "@playwright/test";

const BASE_URL = "/?emulators=0&qaOffline=1";

const TEAM_POOL = [
  "Team Bushido",
  "Team BubbleMilk",
  "Sittin Sidewayz",
  "Shibata International",
  "Team RAZR",
  "Dori Lounge",
  "Team Yokomo",
  "Team Weld",
  "Reve D Thailand",
  "DS Racing",
  "Team PDX BeastMode",
];

const CHASSIS_POOL = [
  "Yokomo RD2.0",
  "MST RMX 2.5",
  "Reve D RDX",
  "MC-1",
  "GRK5",
  "MST FXX",
  "YD-2ZX",
  "Rhino Racing",
];

const DRIVER_POOL = [
  "Ryan Chu", "Robin DZ", "Collin Bernard", "Tre Howard", "Brandon Britt", "Ryan Addis", "DJ Moore", "Brandon Strickland",
  "Tyson Tarumoto", "Justin Wilming", "Alfredo Chan III", "Put Suttiyapiwat", "Ryo Ishii", "Hayato Yoshiba", "Makato Nakajima",
  "Vittorio Santiago", "Steve Fujita", "Joey Tam", "Jason Fordyce", "Rody Takahashi", "Charles Ong", "Evan Kato", "Kaito Minami",
  "Dylan Park", "Marcus Del Rosario", "Keoni Sato", "Luca Villanueva", "Shane Nakamura", "Jasper Ocampo", "Riley Sakamoto",
  "Kenji Tan", "Mason Ibarra", "Nolan Reyes", "Victor Matsu", "Andre Velasco", "Hiroki Tanabe", "Tatsuya Mori", "Akira Endo",
  "Sora Ichikawa", "Daichi Nomura", "Naoki Kondo", "Kenta Watanabe", "Yuto Sakurai", "Renjiro Akiyama", "Tobias Lim",
  "Miguel Navarro", "Isaac Delos Santos", "Noah Velarde", "Wesley Tanaka", "Gavin Cortez", "Trey Nakamoto", "Logan Fujimoto",
  "Eli Matsuda", "Colby Hashimoto", "Damian Mercado", "Brice Panganiban", "Joel Balmes", "Aiden Quiambao", "Rylan Dizon",
  "Parker Munoz", "Jett Cabrera", "Brandon Elizondo", "Kobe Nishi", "Arvin Fermin", "Cyrus Inoue", "Drew Akimoto",
  "Mikael Santos", "Rei Komatsu", "Kent Arakaki", "Koji Narita", "Shota Yamada", "Haru Yamane", "Takumi Abe", "Seiji Okada",
  "Riku Taniguchi", "Genki Fujii", "Masato Ogawa", "Yuji Sagawa", "Daigo Uehara", "Tomoaki Noda", "Kazuya Sato",
  "Ian Padilla", "Carlo Miranda", "Nico Velasco", "KJ Bautista", "Arman Esquivel", "Nate Caballero", "Byron Reyes", "Marco Dela Cruz",
  "Ethan Villaflor", "Liam Cordova", "Ari Yamaguchi", "Ryota Miyasaki", "Shohei Ueda", "Takeshi Arai", "Koki Shimizu", "Ren Sugimoto",
];

function seededRandom(seed = 1) {
  let state = Math.max(1, Number(seed || 1));
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function buildRoster(count, seed = 1, startIndex = 0) {
  const random = seededRandom(seed);
  const slice = DRIVER_POOL.slice(startIndex, startIndex + count);
  return slice.map((name, index) => {
    const paidTickets = Math.floor(random() * 12);
    const teamName = TEAM_POOL[(startIndex + index) % TEAM_POOL.length];
    const chassis = CHASSIS_POOL[(startIndex + index) % CHASSIS_POOL.length];
    const ig = `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    return {
      name,
      teamName,
      chassis,
      instagram: ig,
      paidTickets,
    };
  });
}

const SCENARIOS = [
  {
    label: "tech1-live-1j",
    eventName: "Tech 1 Live Simulation 1 Judge",
    judgeCount: 1,
    eventDate: "2026-06-01",
    roster: buildRoster(18, 101, 0),
  },
  {
    label: "tech1-live-2j",
    eventName: "Tech 1 Live Simulation 2 Judges",
    judgeCount: 2,
    eventDate: "2026-06-02",
    roster: buildRoster(28, 202, 18),
  },
  {
    label: "tech1-live-3j",
    eventName: "Tech 1 Live Simulation 3 Judges",
    judgeCount: 3,
    eventDate: "2026-06-03",
    roster: buildRoster(50, 303, 46),
  },
];

function eventUrl(eventId, path = "spectator") {
  return `/events/${eventId}/${path}?emulators=0&qaOffline=1`;
}

async function closePasswordModalIfOpen(page) {
  const modal = page.locator("#passwordModal");
  if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const cancel = page.locator("#passwordCancelBtn");
    if (await cancel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancel.click();
    }
  }
}

async function createTech1Event(page, scenario) {
  await page.goto(`${BASE_URL}#/website-admin`);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
  await page.locator("#websiteAdminNewEventBtn").click();
  await expect(page.locator("#createEventModal:not(.hidden)")).toBeVisible({ timeout: 15_000 });
  await page.locator("#eventNameInput").fill(scenario.eventName);
  await page.locator("#eventDateInput").fill(scenario.eventDate);
  await page.selectOption("#competitionModeInput", "tech1-anniversary");
  await page.selectOption("#judgeCountInput", String(scenario.judgeCount));
  await page.locator("#createEventSubmitBtn").click();
  await expect.poll(
    async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
    { timeout: 30_000 },
  ).toBe(true);
  await closePasswordModalIfOpen(page);

  const meta = await page.evaluate((eventName) => {
    const directory = JSON.parse(localStorage.getItem("rc-drift-event-directory-v1") || "{}");
    const entries = Object.values(directory)
      .filter((item) => item?.name === eventName)
      .sort((left, right) => String(right?.updatedAt || right?.createdAt || "").localeCompare(String(left?.updatedAt || left?.createdAt || "")));
    return entries[0] || null;
  }, scenario.eventName);

  expect(meta).toBeTruthy();
  expect(meta.competitionMode).toBe("tech1-anniversary");
  expect(Number(meta.judgeCount || 0)).toBe(scenario.judgeCount);

  await page.goto(`${BASE_URL}#/website-admin`);
  const eventSelect = page.locator("#eventSelect");
  await expect(eventSelect).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`#eventSelect option[value='${meta.id}']`)).toHaveCount(1, { timeout: 30_000 });
  await eventSelect.selectOption(meta.id);
  await page.waitForTimeout(250);

  const selectedMeta = await page.evaluate(() => {
    const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "";
    const directory = JSON.parse(localStorage.getItem("rc-drift-event-directory-v1") || "{}");
    return directory?.[activeEventId] || null;
  });
  expect(selectedMeta?.name).toBe(scenario.eventName);
  expect(selectedMeta?.competitionMode).toBe("tech1-anniversary");
  expect(Number(selectedMeta?.judgeCount || 0)).toBe(scenario.judgeCount);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("rc-drift-active-event-v1")), { timeout: 30_000 }).toBe(meta.id);
  return meta;
}

async function registerDrivers(page, eventId, roster) {
  await page.goto(eventUrl(eventId, "admin/registration"));
  await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible({ timeout: 30_000 });

  for (let index = 0; index < roster.length; index += 1) {
    const driver = roster[index];
    await page.locator("#tech1DeskName").fill(driver.name);
    await page.locator("#tech1DeskTeamName").fill(driver.teamName);
    await page.locator("#tech1DeskChassis").fill(driver.chassis);
    await page.locator("#tech1DeskInstagram").fill(driver.instagram);
    await page.locator("#tech1DeskPaidTickets").fill(String(driver.paidTickets));
    await page.locator("#tech1DeskPaymentMethod").fill(index % 2 ? "card" : "cash");
    await page.locator("#tech1DeskCompeting").check();
    await page.locator("#tech1DeskRegistrationForm button[type='submit']").click();
    await expect(page.locator("#tech1DeskStatus")).toContainText("saved with 1 free raffle ticket", { timeout: 15_000 });
  }

  await expect.poll(async () => page.locator(".tech1-driver-card").count(), { timeout: 60_000 }).toBe(roster.length);

  const ticketSummary = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
    const list = state.privateRegistrations || [];
    return {
      count: list.length,
      paidTicketSum: list.reduce((sum, item) => sum + Number(item?.paidTickets || 0), 0),
      totalTicketSum: list.reduce((sum, item) => sum + Number(item?.totalTickets || 0), 0),
      names: list.map((item) => item?.name || ""),
      paidTickets: list.map((item) => ({ name: item?.name || "", paidTickets: Number(item?.paidTickets || 0) })),
    };
  });

  expect(ticketSummary.count).toBe(roster.length);
  expect(new Set(ticketSummary.names).size).toBe(roster.length);
  const expectedPaidSum = roster.reduce((sum, item) => sum + item.paidTickets, 0);
  expect(ticketSummary.paidTicketSum).toBe(expectedPaidSum);
  expect(ticketSummary.totalTicketSum).toBe(roster.length + expectedPaidSum);

  return ticketSummary;
}

async function generateBracket(page, eventId) {
  await page.goto(eventUrl(eventId, "admin/registration"));
  await expect(page.locator("#tech1DeskRegistrationForm")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}"));
    return Number(state?.privateRegistrations?.length || 0);
  }, { timeout: 30_000 }).toBeGreaterThan(1);
  await page.locator("[data-tech1-action='generate-bracket']").click();
  await expect.poll(async () => {
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}"));
    return Number(state?.bracket?.driverCount || 0);
  }, { timeout: 30_000 }).toBeGreaterThan(1);
}

async function verifyJudgeFlow(page, eventId, judgeCount) {
  await page.evaluate(({ count, activeEventId }) => {
    const unlocks = {};
    for (let idx = 1; idx <= 3; idx += 1) {
      unlocks[`j${idx}`] = idx <= count;
    }
    localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({ [activeEventId]: unlocks }));
  }, { count: judgeCount, activeEventId: eventId });

  for (let index = 1; index <= judgeCount; index += 1) {
    await page.evaluate(({ idx, activeEventId }) => {
      const role = `j${idx}`;
      const roleMap = { [activeEventId]: role };
      sessionStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
      localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify(roleMap));
      localStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
    }, { idx: index, activeEventId: eventId });
    await page.goto(eventUrl(eventId, `judge/${index}/bracket`));
    await expect(page.locator("body")).toHaveAttribute("data-role", `j${index}`, { timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toBeVisible({ timeout: 30_000 });
    const side = "left";
    await page.locator(`#competitionJudgePanel [data-action='judge-competition-vote'][data-side='${side}']`).first().click();
    await expect(page.locator("#competitionJudgePanel")).toContainText(`${index}/${judgeCount} Votes`, { timeout: 30_000 });
  }

  await page.evaluate((activeEventId) => {
    const roleMap = { [activeEventId]: "admin" };
    sessionStorage.setItem("rc-drift-event-role-v1", JSON.stringify(roleMap));
    localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify(roleMap));
  }, eventId);
  await page.goto(eventUrl(eventId, "admin/bracket"));
  await expect(page.locator("#competitionDecisionPanel:not(.hidden)")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#competitionDecisionPanel .competition-contest-timer")).toBeVisible();
}

async function driveBracketToCompletion(page, eventId) {
  await page.goto(eventUrl(eventId, "admin/bracket"));
  await expect(page.locator("#bracketBoard .tech1-solo-bracket-panel")).toBeVisible({ timeout: 30_000 });

  let guard = 0;
  while (guard < 300) {
    guard += 1;
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}"));
    if (state?.bracket?.status === "complete") break;

    const decisionVisible = await page.locator("#competitionDecisionPanel:not(.hidden)").isVisible().catch(() => false);
    if (decisionVisible) {
      const continueBtn = page.locator("#competitionDecisionPanel [data-action='tech1-admin-decision'][data-decision='advance'], #competitionDecisionPanel [data-action='continue-competition-flow']").first();
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
        continue;
      }
    }

    const activeButtons = page.locator("#bracketBoard .tech1-battle-flow-card.current [data-tech1-action='record-winner']");
    const activeCount = await activeButtons.count();
    if (activeCount > 0) {
      const clicked = await page.evaluate(() => {
        const button = document.querySelector("#bracketBoard .tech1-battle-flow-card.current [data-tech1-action='record-winner']");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      });
      if (!clicked) {
        await activeButtons.first().click({ timeout: 5000 }).catch(() => {});
      }
      continue;
    }

    const anyWinnerButton = page.locator("#bracketBoard [data-tech1-action='record-winner']");
    if (await anyWinnerButton.count() > 0) {
      const clicked = await page.evaluate(() => {
        const button = document.querySelector("#bracketBoard [data-tech1-action='record-winner']");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      });
      if (!clicked) {
        await anyWinnerButton.first().click({ timeout: 5000 }).catch(() => {});
      }
      continue;
    }

    await page.waitForTimeout(100);
  }

  const endState = await page.evaluate(() => JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}"));
  expect(endState?.bracket?.status).toBe("complete");

  const finalSummary = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
    const bracket = state?.bracket || {};
    const finalMatch = Object.values(bracket.matches || {}).find((entry) => !entry?.advancedToMatchId) || null;
    const third = bracket.thirdPlaceMatch || null;
    const finalWinner = [finalMatch?.driverA, finalMatch?.driverB].find((driver) => driver?.id === finalMatch?.winnerId) || null;
    const finalLoser = [finalMatch?.driverA, finalMatch?.driverB].find((driver) => driver?.id && driver?.id !== finalMatch?.winnerId) || null;
    const thirdWinner = [third?.driverA, third?.driverB].find((driver) => driver?.id === third?.winnerId) || null;
    return {
      status: bracket.status,
      winnerRevealStatus: bracket.winnerRevealStatus,
      winnerRevealedAt: bracket.winnerRevealedAt || null,
      finalWinner: finalWinner?.name || null,
      finalLoser: finalLoser?.name || null,
      thirdWinner: thirdWinner?.name || null,
      completedMatches: Object.values(bracket.matches || {}).filter((entry) => entry?.winnerId).length,
      totalMatches: Object.values(bracket.matches || {}).length,
      top32Merged: Boolean(document.querySelector(".tech1-bracket-mode-note")?.textContent?.includes("Top 32 Bracket Locked In")),
      activeHighlightVisible: Boolean(document.querySelector("[data-current-battle='true'], .current-tech1-battle")),
      topbarEventName: document.querySelector("#topbarEventName")?.textContent?.trim() || "",
    };
  });

  expect(finalSummary.status).toBe("complete");
  expect(finalSummary.finalWinner).toBeTruthy();
  expect(finalSummary.finalLoser).toBeTruthy();
  expect(finalSummary.thirdWinner).toBeTruthy();
  expect(finalSummary.completedMatches).toBe(finalSummary.totalMatches);

  await page.locator("[data-action='main-show-podium-reveal'], [data-action='main-podium-reveal']").first().click().catch(() => {});
  const revealModal = page.locator("#mainPodiumRevealModal");
  if (await revealModal.isVisible().catch(() => false)) {
    await page.locator("#mainPodiumRevealModal [data-action='main-podium-reveal'][data-place='3']").first().click();
    await page.locator("#mainPodiumRevealModal [data-action='main-podium-reveal'][data-place='1']").first().click();
    await page.locator("#mainPodiumRevealModal [data-action='main-podium-reveal'][data-place='2']").first().click();
  }

  return finalSummary;
}

test.describe("Tech 1 full live workflow simulation", () => {
  test("creates 1/2/3 judge Tech 1 events and simulates live competition flows", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    page.on("dialog", async (dialog) => dialog.accept());
    await page.addInitScript(() => {
      localStorage.setItem("rc-drift-website-admin-session-v1", "true");
      localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
    });
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.removeItem("rc-drift-tech1-local-state-v1");
    });

    const report = [];

    for (const scenario of SCENARIOS) {
      await page.evaluate(() => {
        localStorage.removeItem("rc-drift-tech1-local-state-v1");
      });
      const meta = await createTech1Event(page, scenario);
      const eventId = meta.id;
      const ticketSummary = await registerDrivers(page, eventId, scenario.roster);
      await generateBracket(page, eventId);

      const bracketSnapshot = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("rc-drift-tech1-local-state-v1") || "{}");
        const bracket = state?.bracket || {};
        return {
          status: bracket.status,
          driverCount: Number(bracket.driverCount || 0),
          bracketSize: Number(bracket.bracketSize || 0),
          byes: Number((bracket.byes || []).length),
        };
      });

      await verifyJudgeFlow(page, eventId, scenario.judgeCount);
      const finalSummary = await driveBracketToCompletion(page, eventId);

      await page.goto(eventUrl(eventId, "admin/bracket"));
      await page.locator("#presentationFullscreenBracketBtn").click().catch(() => {});
      const fullscreenMetrics = await page.evaluate(() => {
        const body = document.body;
        const canvas = document.querySelector("#bracketBoard .main-board-canvas");
        const shell = document.querySelector("#bracketBoard .main-board-scale-shell");
        const sponsors = document.querySelectorAll("#bracketBoard .tech1-sponsor-backdrop img");
        const rect = canvas?.getBoundingClientRect();
        const shellRect = shell?.getBoundingClientRect();
        return {
          fullscreen: body.classList.contains("bracket-fullscreen"),
          canvasHeight: rect?.height || 0,
          viewportHeight: window.innerHeight,
          bottomGap: rect ? Math.max(0, window.innerHeight - rect.bottom) : null,
          sponsorCount: sponsors.length,
          shellHeight: shellRect?.height || 0,
        };
      });

      report.push({
        scenario: scenario.label,
        eventId,
        eventName: scenario.eventName,
        judgeCount: scenario.judgeCount,
        driverCount: scenario.roster.length,
        drivers: scenario.roster.map((driver) => driver.name),
        raffleTickets: scenario.roster.map((driver) => ({ name: driver.name, paidTickets: driver.paidTickets, totalTickets: driver.paidTickets + 1 })),
        ticketSummary,
        bracketSnapshot,
        finalSummary,
        fullscreenMetrics,
      });

      await page.keyboard.press("Escape").catch(() => {});
    }

    await testInfo.attach("tech1-live-simulation-report", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    expect(report).toHaveLength(3);
    expect(report.every((entry) => entry.bracketSnapshot.driverCount > 1)).toBe(true);
    expect(report.find((entry) => entry.judgeCount === 3)?.bracketSnapshot.bracketSize).toBeGreaterThanOrEqual(64);
  });
});
