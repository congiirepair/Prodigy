    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
  import { getFirestore, doc, setDoc, onSnapshot, deleteDoc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

    // ==========================================
    // DATA MODEL & STATE
    // ==========================================
    const FORMAT_CLASSIC = "classic";
    const FORMAT_SDC = "sdc";
    const FORMAT_SDC_TOP_8 = "sdc-top-8";
    const FORMAT_SDC_TOP_16 = "sdc-top-16";
    const FORMAT_SDC_TOP_32 = "sdc-top-32";
    const APP_STATE_VERSION = 9;
    const EVENT_STORAGE_VERSION = 1;
    const APP_BUILD_LABEL = "Build 2026.04.11.3";
    const WEBSITE_ADMIN_STORAGE_KEY = "rc-drift-website-admin-session-v1";
    const WEBSITE_ADMIN_PASSWORD_HASH = "29647f834c4aa7d575cf81b7a5f6f694727b0383e523d05ba4521ea3539affbf";
    const DEFAULT_EVENT_ID = "main-event";
    const EVENT_DIRECTORY_STORAGE_KEY = `rc-drift-event-directory-v${EVENT_STORAGE_VERSION}`;
    const ACTIVE_EVENT_STORAGE_KEY = `rc-drift-active-event-v${EVENT_STORAGE_VERSION}`;
    const EVENT_ROLE_SESSION_KEY = `rc-drift-event-role-v${EVENT_STORAGE_VERSION}`;
    const EVENT_ROLE_PERSIST_KEY = `rc-drift-event-role-persist-v${EVENT_STORAGE_VERSION}`;
    const EVENT_ROLE_UNLOCK_KEY = `rc-drift-event-role-unlocks-v${EVENT_STORAGE_VERSION}`;
    const THEME_STORAGE_KEY = `rc-drift-theme-v${EVENT_STORAGE_VERSION}`;
    const SELF_REGISTER_PROFILE_STORAGE_KEY = `rc-drift-self-register-profile-v${EVENT_STORAGE_VERSION}`;
    const SELF_REGISTER_PROFILES_STORAGE_KEY = `rc-drift-self-register-profiles-v${EVENT_STORAGE_VERSION}`;
    const PAGE_SEARCH_PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search || "") : new URLSearchParams();
    const STANDALONE_DEMO_MODE = PAGE_SEARCH_PARAMS.get("demoWindow") === "1";
    const ROLE_ORDER = ["admin", "j1", "j2", "j3"];
    const JUDGE_ROLE_ORDER = ["j1", "j2", "j3"];
    const ROLE_ROUTE_SLUGS = Object.freeze({
      spectator: "spectator",
      admin: "event-admin",
      j1: "judge-1",
      j2: "judge-2",
      j3: "judge-3",
    });
    const ROLE_ROUTE_LOOKUP = Object.freeze(Object.fromEntries(
      Object.entries(ROLE_ROUTE_SLUGS).map(([role, slug]) => [slug, role])
    ));
    const HOST_ROUTE_CONTEXTS = Object.freeze({
      "websiteadmin.prodigyrccomp.com": { kind: "website-admin", slug: "website-admin" },
      "eventadmin.prodigyrccomp.com": { kind: "role", role: "admin", view: "registration", slug: "event-admin" },
      "judge1.prodigyrccomp.com": { kind: "role", role: "j1", view: "qualifying", slug: "judge-1" },
      "judge2.prodigyrccomp.com": { kind: "role", role: "j2", view: "qualifying", slug: "judge-2" },
      "judge3.prodigyrccomp.com": { kind: "role", role: "j3", view: "qualifying", slug: "judge-3" },
      "prodigyrccomp.com": { kind: "role", role: "spectator", view: "qualifying", slug: "spectator" },
      "www.prodigyrccomp.com": { kind: "role", role: "spectator", view: "qualifying", slug: "spectator" },
      "prodigy-rc-competitions.web.app": { kind: "role", role: "spectator", view: "qualifying", slug: "spectator" },
      "prodigy-rc-competitions.firebaseapp.com": { kind: "role", role: "spectator", view: "qualifying", slug: "spectator" },
    });
    const PUBLIC_ROLE_HOSTNAMES = Object.freeze({
      spectator: "prodigyrccomp.com",
      admin: "eventadmin.prodigyrccomp.com",
      j1: "judge1.prodigyrccomp.com",
      j2: "judge2.prodigyrccomp.com",
      j3: "judge3.prodigyrccomp.com",
      "website-admin": "websiteadmin.prodigyrccomp.com",
    });
    const ROUTABLE_VIEWS = new Set(["registration", "self-register", "self-register-display", "simulation", "qualifying", "bracket", "results"]);
    const ROLE_LABELS = {
      admin: "Event Admin",
      spectator: "Spectator",
      j1: "Judge 1",
      j2: "Judge 2",
      j3: "Judge 3",
    };
    const LEGACY_PASSWORDS = {
      admin: "prodigy_event123",
      j1: "prodigy_judge1231",
      j2: "prodigy_judge1232",
      j3: "prodigy_judge1233",
    };

    function getEventStateStorageKey(eventId) {
      return `rc-drift-event-state-${eventId}-v${EVENT_STORAGE_VERSION}`;
    }

    function buildDefaultRoleNames(overrides = {}) {
      return {
        admin: ROLE_LABELS.admin,
        j1: overrides.j1?.trim() || ROLE_LABELS.j1,
        j2: overrides.j2?.trim() || ROLE_LABELS.j2,
        j3: overrides.j3?.trim() || ROLE_LABELS.j3,
      };
    }

    function normalizeJudgeCount(value) {
      const parsed = Number.parseInt(value, 10);
      if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
      return 3;
    }

    function getEventJudgeCount(eventMeta = activeEventMeta) {
      return normalizeJudgeCount(eventMeta?.judgeCount);
    }

    function getActiveJudgeRoles(eventMeta = activeEventMeta) {
      return JUDGE_ROLE_ORDER.slice(0, getEventJudgeCount(eventMeta));
    }

    function isEventCompleted(eventMeta = activeEventMeta) {
      const results = eventMeta?.results || {};
      return Boolean(results.completedAt || results.championName);
    }

    function isJudgeAccessLocked(eventMeta = activeEventMeta) {
      return eventMeta?.status === "archived" || isEventCompleted(eventMeta);
    }

    function isRoleAvailableForEvent(role, eventMeta = activeEventMeta) {
      if (role === "spectator" || role === "admin") return true;
      if (role?.startsWith("j") && isJudgeAccessLocked(eventMeta)) return false;
      return getActiveJudgeRoles(eventMeta).includes(role);
    }

    function getJudgeSystemLabel(eventMeta = activeEventMeta) {
      const judgeCount = getEventJudgeCount(eventMeta);
      return judgeCount === 1 ? "1-Judge Scoring" : `${judgeCount}-Judge Cloud Sync`;
    }

    function getAverageColumnLabel(runNumber, role = currentRole, eventMeta = activeEventMeta) {
      if (role.startsWith("j")) return `Run ${runNumber} (Your Score)`;
      return getEventJudgeCount(eventMeta) === 1 ? `Run ${runNumber} (Score)` : `Run ${runNumber} (Avg)`;
    }

    function generateId() { return Math.random().toString(36).substring(2, 11); }

    function createDriverSet(count = 1) {
      return Array.from({ length: count }, (_, index) => createEmptyDriver(index + 1));
    }

    function slugifyEventId(name) {
      return (name || "event")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "event";
    }

    function makeUniqueEventId(name) {
      const base = slugifyEventId(name);
      let candidate = base;
      let index = 2;
      while (eventDirectory[candidate]) {
        candidate = `${base}-${index}`;
        index += 1;
      }
      return candidate;
    }

    function generateInviteCode() {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const segment = () => Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
      return `${segment()}-${segment()}`;
    }

    function formatEventDate(dateString) {
      if (!dateString) return "Date TBD";
      const parsed = new Date(`${dateString}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return dateString;
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
    }

    function createDefaultVenueConfig(overrides = {}) {
      return {
        enabled: false,
        label: "",
        latitude: null,
        longitude: null,
        radiusMeters: 150,
        closeAt: null,
        ...overrides,
      };
    }

    function normalizePendingRegistrationList(entries) {
      return (Array.isArray(entries) ? entries : [])
        .map((entry) => {
          const normalized = entry && typeof entry === "object" ? entry : {};
          return {
            id: normalized.id || generateId(),
            name: typeof normalized.name === "string" ? normalized.name : "",
            teamName: typeof normalized.teamName === "string" ? normalized.teamName : "",
            chassis: typeof normalized.chassis === "string" ? normalized.chassis : "",
            selfRegisteredAt: normalized.selfRegisteredAt || null,
            paidAt: normalized.paidAt || null,
            selfRegisteredDistanceMeters: Number.isFinite(Number(normalized.selfRegisteredDistanceMeters))
              ? Number(normalized.selfRegisteredDistanceMeters)
              : null,
          };
        })
        .filter((entry) => Boolean(entry.name.trim()));
    }

    async function hashSecret(value) {
      if (!value) return null;
      const bytes = new TextEncoder().encode(value.trim());
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function isMasterPasswordHash(hashValue) {
      return Boolean(hashValue) && hashValue === WEBSITE_ADMIN_PASSWORD_HASH;
    }

    async function createRoleAccessFromInvites(invites) {
      const entries = await Promise.all(ROLE_ORDER.map(async (role) => [
        role,
        {
          inviteCode: null,
          inviteHash: null,
          passwordHash: null,
          claimedAt: null,
        },
      ]));
      return Object.fromEntries(entries);
    }

    async function createRoleAccessFromPasswords(passwords) {
      const now = new Date().toISOString();
      const entries = await Promise.all(ROLE_ORDER.map(async (role) => [
        role,
        {
          inviteCode: null,
          inviteHash: null,
          passwordHash: await hashSecret(passwords[role]),
          claimedAt: now,
        },
      ]));
      return Object.fromEntries(entries);
    }

    function buildEmptyEventResults() {
      return {
        championName: null,
        championSeed: null,
        runnerUpName: null,
        runnerUpSeed: null,
        thirdPlaceName: null,
        thirdPlaceSeed: null,
        fourthPlaceName: null,
        fourthPlaceSeed: null,
        qualifiedCount: 0,
        totalDrivers: 0,
        planDescription: "Waiting for qualifying scores.",
        updatedAt: null,
        completedAt: null,
      };
    }

    function createEmptyQualifyingFlow() {
      return {
        currentDriverId: null,
        readyRoles: {},
        started: false,
        completed: false,
      };
    }

    async function createEventRecord({ name, date, invites, roleNames = {}, judgeCount = 3, id = null, status = "active" }) {
      const createdAt = new Date().toISOString();
      return {
        id: id || makeUniqueEventId(name),
        name: name.trim(),
        date: date || "",
        status,
        judgeCount: normalizeJudgeCount(judgeCount),
        createdAt,
        updatedAt: createdAt,
        syncStamp: Date.now(),
        roleNames: buildDefaultRoleNames(roleNames),
        venueConfig: createDefaultVenueConfig(),
        pendingRegistrations: [],
        latestApprovalToast: null,
        roleAccess: await createRoleAccessFromInvites(invites),
        results: buildEmptyEventResults(),
      };
    }

    async function createLegacySeedEventRecord() {
      const createdAt = new Date().toISOString();
      return {
        id: DEFAULT_EVENT_ID,
        name: "Main Event",
        date: new Date().toISOString().slice(0, 10),
        status: "active",
        judgeCount: 3,
        createdAt,
        updatedAt: createdAt,
        syncStamp: Date.now(),
        roleNames: buildDefaultRoleNames(),
        venueConfig: createDefaultVenueConfig(),
        pendingRegistrations: [],
        latestApprovalToast: null,
        roleAccess: await createRoleAccessFromPasswords(LEGACY_PASSWORDS),
        results: buildEmptyEventResults(),
      };
    }

    function createEmptyDriver(position = null) {
      const normalizedPosition = Number.isInteger(position) && position > 0 ? position : null;
      return {
        id: generateId(),
        name: "",
        teamName: "",
        chassis: "",
        reg: normalizedPosition,
        signUpPosition: normalizedPosition,
        runFlags: {
          run1: null,
          run2: null,
          runoff: null,
        },
        scores: {
          j1: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
          j2: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
          j3: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } }
        }
      };
    }

    function normalizeDriverState(driver, index) {
      const normalized = {
        ...createEmptyDriver(),
        ...driver,
      };
      normalized.signUpPosition = Number.isInteger(normalized.signUpPosition) && normalized.signUpPosition > 0
        ? normalized.signUpPosition
        : index + 1;
      normalized.runFlags = {
        run1: normalized.runFlags?.run1 || null,
        run2: normalized.runFlags?.run2 || null,
        runoff: normalized.runFlags?.runoff || null,
      };
      normalized.scores = {
        j1: {
          run1: null, run2: null, runoff: null, ...(normalized.scores?.j1 || {}),
          submitted: { run1: null, run2: null, runoff: null, ...(normalized.scores?.j1?.submitted || {}) },
          deductionHistory: { run1: [], run2: [], runoff: [], ...(normalized.scores?.j1?.deductionHistory || {}) },
        },
        j2: {
          run1: null, run2: null, runoff: null, ...(normalized.scores?.j2 || {}),
          submitted: { run1: null, run2: null, runoff: null, ...(normalized.scores?.j2?.submitted || {}) },
          deductionHistory: { run1: [], run2: [], runoff: [], ...(normalized.scores?.j2?.deductionHistory || {}) },
        },
        j3: {
          run1: null, run2: null, runoff: null, ...(normalized.scores?.j3 || {}),
          submitted: { run1: null, run2: null, runoff: null, ...(normalized.scores?.j3?.submitted || {}) },
          deductionHistory: { run1: [], run2: [], runoff: [], ...(normalized.scores?.j3?.deductionHistory || {}) },
        },
      };
      for (const role of JUDGE_ROLE_ORDER) {
        const judgeScores = normalized.scores[role];
        if (!judgeScores.submitted) {
          judgeScores.submitted = { run1: judgeScores.run1, run2: judgeScores.run2, runoff: judgeScores.runoff };
        }
      }
      normalized.teamName = typeof normalized.teamName === "string" ? normalized.teamName : "";
      normalized.chassis = typeof normalized.chassis === "string" ? normalized.chassis : "";
      normalized.reg = normalized.signUpPosition;
      return normalized;
    }

    function normalizeDriverList(drivers) {
      return (Array.isArray(drivers) ? drivers : []).map((driver, index) => normalizeDriverState(driver, index));
    }

    function resequenceDrivers(drivers, forceRegistrationNumbers = false) {
      return normalizeDriverList(drivers).map((driver, index) => {
        const nextPosition = index + 1;
        return {
          ...driver,
          signUpPosition: nextPosition,
          reg: nextPosition,
        };
      });
    }

    function driverHasScoreActivity(driver) {
      const scoreValues = Object.values(driver?.scores || {}).flatMap((judgeScores) => Object.values(judgeScores || {}));
      const hasScore = scoreValues.some((value) => value !== null && value !== undefined && value !== "");
      const hasFlag = Object.values(driver?.runFlags || {}).some((value) => Boolean(value));
      return hasScore || hasFlag;
    }

    function driverHasMeaningfulEntry(driver) {
      const hasName = typeof driver?.name === "string" && driver.name.trim() !== "";
      const hasTeamName = typeof driver?.teamName === "string" && driver.teamName.trim() !== "";
      const hasChassis = typeof driver?.chassis === "string" && driver.chassis.trim() !== "";
      return hasName || hasTeamName || hasChassis || driverHasScoreActivity(driver);
    }

    function sanitizeLoadedDrivers(drivers) {
      const normalized = resequenceDrivers(Array.isArray(drivers) ? drivers : [], true);
      if (!normalized.length) return createDriverSet();
      if (normalized.some((driver) => driverHasMeaningfulEntry(driver))) {
        return normalized;
      }
      return createDriverSet();
    }

    function getNextSignUpPosition(drivers) {
      return normalizeDriverList(drivers).reduce((maxValue, driver) => Math.max(maxValue, driver.signUpPosition || 0), 0) + 1;
    }

    function getVenueConfig(eventMeta = activeEventMeta) {
      return createDefaultVenueConfig(eventMeta?.venueConfig || {});
    }

    function hasValidVenueConfig(eventMeta = activeEventMeta) {
      const venueConfig = getVenueConfig(eventMeta);
      return Boolean(
        venueConfig.enabled
        && Number.isFinite(Number(venueConfig.latitude))
        && Number.isFinite(Number(venueConfig.longitude))
        && Number.isFinite(Number(venueConfig.radiusMeters))
        && Number(venueConfig.radiusMeters) > 0
      );
    }

    function toRadians(value) {
      return (value * Math.PI) / 180;
    }

    function calculateDistanceMeters(fromLat, fromLng, toLat, toLng) {
      const earthRadius = 6371000;
      const deltaLat = toRadians(toLat - fromLat);
      const deltaLng = toRadians(toLng - fromLng);
      const sinLat = Math.sin(deltaLat / 2);
      const sinLng = Math.sin(deltaLng / 2);
      const a = (sinLat * sinLat)
        + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * (sinLng * sinLng);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return earthRadius * c;
    }

    function formatDistanceMeters(distanceMeters) {
      if (!Number.isFinite(distanceMeters)) return "unknown distance";
      if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(2)} km`;
      return `${Math.round(distanceMeters)} m`;
    }

    function updateSelfRegistrationState(status, copy, unlocked, lastDistanceMeters = null) {
      selfRegistrationState = {
        status,
        copy,
        unlocked,
        lastDistanceMeters,
      };
    }

    function toNumber(value) {
      if (value === "" || value === null || value === undefined) return null;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function toRegistrationNumber(value) {
      if (value === "" || value === null || value === undefined) return null;
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    function getRunKey(runRef) {
      if (runRef === "r1") return "run1";
      if (runRef === "r2") return "run2";
      return typeof runRef === "string" ? runRef : `run${runRef}`;
    }

    const QUICK_DEDUCTION_VALUES = [1, 2, 5, 10, 20];

    function clampJudgeScoreValue(value) {
      const numericValue = Number.isFinite(value) ? value : 100;
      return Math.max(0, Math.min(100, Math.round(numericValue * 10) / 10));
    }

    function getJudgeDraftScoreValue(driver, role, runRef) {
      const runKey = getRunKey(runRef);
      const judgeScores = driver?.scores?.[role];
      if (!judgeScores) return 100;
      if (judgeScores[runKey] !== null && judgeScores[runKey] !== undefined) {
        return clampJudgeScoreValue(judgeScores[runKey]);
      }
      if (judgeScores.submitted?.[runKey] !== null && judgeScores.submitted?.[runKey] !== undefined) {
        return clampJudgeScoreValue(judgeScores.submitted[runKey]);
      }
      return 100;
    }

    function getJudgeDeductionHistory(driver, role, runRef) {
      const runKey = getRunKey(runRef);
      return Array.isArray(driver?.scores?.[role]?.deductionHistory?.[runKey])
        ? driver.scores[role].deductionHistory[runKey]
        : [];
    }

    function setJudgeDeductionHistory(driver, role, runRef, nextHistory) {
      const runKey = getRunKey(runRef);
      if (!driver?.scores?.[role]) return;
      if (!driver.scores[role].deductionHistory) {
        driver.scores[role].deductionHistory = { run1: [], run2: [], runoff: [] };
      }
      driver.scores[role].deductionHistory[runKey] = Array.isArray(nextHistory) ? nextHistory : [];
    }

    function clearJudgeDeductionHistory(driver, role, runRef) {
      setJudgeDeductionHistory(driver, role, runRef, []);
    }

    function appendJudgeDeductionHistory(driver, role, runRef, label) {
      const history = getJudgeDeductionHistory(driver, role, runRef);
      setJudgeDeductionHistory(driver, role, runRef, [...history, label].slice(-10));
    }

    function renderDeductionHistory(driver, role, runRef) {
      const history = getJudgeDeductionHistory(driver, role, runRef);
      const runKey = getRunKey(runRef);
      const flag = driver?.runFlags?.[runKey];
      const historyText = history.length ? history.join("  ") : "No deductions yet.";
      return `<div class="judge-score-help">Deductions: ${escapeHtml(historyText)}${flag ? ` | Auto zero: ${escapeHtml(flag)}` : ""}</div>`;
    }

    function renderScoreDeductionButtons(runKey) {
      return `
        <div class="score-deduction-strip" data-run="${runKey}">
          ${QUICK_DEDUCTION_VALUES.map((value) => `
            <button class="score-deduction-btn" type="button" data-action="apply-deduction" data-col="${runKey}" data-deduction="${value}">
              -${value}
            </button>
          `).join("")}
          <button class="score-deduction-btn" type="button" data-action="apply-deduction" data-col="${runKey}" data-deduction="crash">
            Crash
          </button>
        </div>
      `;
    }

    function getSubmittedScoreValue(driver, role, runRef) {
      const runKey = getRunKey(runRef);
      return driver?.scores?.[role]?.submitted?.[runKey] ?? null;
    }

    function hasPendingJudgeChanges(driver, role) {
      const judgeScores = driver?.scores?.[role];
      if (!judgeScores) return false;
      return ["run1", "run2", "runoff"].some((runKey) => getJudgeDraftScoreValue(driver, role, runKey) !== (judgeScores.submitted?.[runKey] ?? null));
    }

    function hasPendingJudgeRunChanges(driver, role, runRef) {
      const runKey = getRunKey(runRef);
      const judgeScores = driver?.scores?.[role];
      if (!judgeScores) return false;
      return getJudgeDraftScoreValue(driver, role, runKey) !== (judgeScores.submitted?.[runKey] ?? null);
    }

    function hasSubmittedJudgeRun(driver, role, runRef) {
      return getSubmittedScoreValue(driver, role, runRef) !== null;
    }

    function submitJudgeScores(driverId, role = currentRole) {
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver || !role.startsWith("j") || isJudgeAccessLocked()) return;
      const judgeScores = driver.scores?.[role];
      if (!judgeScores) return;
      judgeScores.run1 = getJudgeDraftScoreValue(driver, role, "run1");
      judgeScores.run2 = getJudgeDraftScoreValue(driver, role, "run2");
      const runoffValue = (judgeScores.runoff !== null && judgeScores.runoff !== undefined)
        || (judgeScores.submitted?.runoff !== null && judgeScores.submitted?.runoff !== undefined)
        ? getJudgeDraftScoreValue(driver, role, "runoff")
        : null;
      judgeScores.runoff = runoffValue;
      judgeScores.submitted = {
        run1: judgeScores.run1,
        run2: judgeScores.run2,
        runoff: runoffValue,
      };
      triggerJudgeSubmissionFeedback(driverId, role, "all");
    }

    function submitJudgeRun(driverId, runRef, role = currentRole) {
      const runKey = getRunKey(runRef);
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver || !role.startsWith("j") || isJudgeAccessLocked()) return;
      const judgeScores = driver.scores?.[role];
      if (!judgeScores || !(runKey in judgeScores.submitted)) return;
      judgeScores[runKey] = getJudgeDraftScoreValue(driver, role, runKey);
      judgeScores.submitted[runKey] = judgeScores[runKey];
      triggerJudgeSubmissionFeedback(driverId, role, runKey);
    }

    function confirmJudgeScoreSubmission(driverId, role = currentRole, runRef = null) {
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver || !role?.startsWith("j")) return false;
      const judgeScores = driver.scores?.[role];
      if (!judgeScores) return false;
      const driverName = driver.name || "this driver";

      if (runRef) {
        const runKey = getRunKey(runRef);
        const scoreValue = getJudgeDraftScoreValue(driver, role, runKey);
        if (scoreValue === null || scoreValue === undefined) return false;
        const runLabel = runKey === "run1" ? "Run 1" : runKey === "run2" ? "Run 2" : "Runoff";
        return window.confirm(
          `Are you sure you want to submit a score of ${formatScore(scoreValue)} for ${driverName} (${runLabel})?`
        );
      }

      const parts = [];
      parts.push(`Run 1: ${formatScore(getJudgeDraftScoreValue(driver, role, "run1"))}`);
      parts.push(`Run 2: ${formatScore(getJudgeDraftScoreValue(driver, role, "run2"))}`);
      if (judgeScores.runoff !== null && judgeScores.runoff !== undefined) parts.push(`Runoff: ${formatScore(getJudgeDraftScoreValue(driver, role, "runoff"))}`);
      if (!parts.length) return false;
      return window.confirm(
        `Are you sure you want to submit these scores for ${driverName}?\n\n${parts.join("\n")}`
      );
    }

    function hasSubmittedRequiredRuns(driver, role) {
      const judgeScores = driver?.scores?.[role]?.submitted;
      if (!judgeScores) return false;
      return judgeScores.run1 !== null && judgeScores.run2 !== null;
    }

    function haveAllActiveJudgesSubmitted(driver) {
      const activeJudgeRoles = getActiveJudgeRoles(activeEventMeta);
      return activeJudgeRoles.length > 0 && activeJudgeRoles.every((role) => hasSubmittedRequiredRuns(driver, role));
    }

    function haveAllActiveJudgesSubmittedRun(driver, runRef) {
      const runKey = getRunKey(runRef);
      const activeJudgeRoles = getActiveJudgeRoles(activeEventMeta);
      return activeJudgeRoles.length > 0 && activeJudgeRoles.every((role) => getSubmittedScoreValue(driver, role, runKey) !== null);
    }

    function maybeAdvanceQualifyingAfterSubmit(driverId) {
      if (!driverId || qualifyingFlow.currentDriverId !== driverId) return false;
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver) return false;
      if (!haveAllActiveJudgesSubmitted(driver)) return false;
      advanceQualifyingDriver();
      return true;
    }

    function maybeAdvanceQualifyingAfterRunSubmit(driverId, runRef) {
      const runKey = getRunKey(runRef);
      if (!driverId || qualifyingFlow.currentDriverId !== driverId || runKey !== "run2") return false;
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver) return false;
      if (!haveAllActiveJudgesSubmittedRun(driver, "run2")) return false;
      advanceQualifyingDriver();
      return true;
    }

    function driverHasAllSubmittedRunsForRoles(driver, roles, runKeys) {
      return roles.length > 0 && roles.every((role) => runKeys.every((runKey) => driver?.scores?.[role]?.submitted?.[runKey] !== null));
    }

    async function syncJudgeSubmission(driverId, role = currentRole, runRef = null) {
      if (!role?.startsWith("j")) {
        publishState();
        return true;
      }
      if (isJudgeAccessLocked()) {
        applyRoleChange("spectator");
        switchView("qualifying");
        return false;
      }
      if (!db || !activeEventId) {
        publishState();
        return true;
      }

      const localDriver = appDrivers.find((entry) => entry.id === driverId);
      if (!localDriver) {
        publishState();
        return false;
      }

      clearTimeout(syncTimeout);
      const runKey = runRef ? getRunKey(runRef) : null;
      const localRoleScores = JSON.parse(JSON.stringify(localDriver.scores?.[role] || {}));
      lastLocalPush = Date.now();
      let transactionResult = null;
      let remoteJudgeLocked = false;
      let lockedRemotePayload = null;
      judgeSubmissionInFlight = true;

      try {
        await runTransaction(db, async (transaction) => {
          const eventRef = getEventDocRef(activeEventId);
          const eventSnap = await transaction.get(eventRef);
          const remotePayload = eventSnap.exists() ? eventSnap.data() : {};
          const remoteMeta = extractEventMeta(remotePayload, activeEventId) || cloneEventMeta(eventDirectory[activeEventId] || activeEventMeta);
          if (isJudgeAccessLocked(remoteMeta)) {
            remoteJudgeLocked = true;
            lockedRemotePayload = remotePayload;
            return;
          }
          const remoteDrivers = Array.isArray(remotePayload.drivers) && remotePayload.drivers.length
            ? sanitizeLoadedDrivers(remotePayload.drivers)
            : createDriverSet();
          const remoteDriver = remoteDrivers.find((entry) => entry.id === driverId);
          if (!remoteDriver) return;

          if (runKey) {
            remoteDriver.scores[role][runKey] = localRoleScores[runKey] ?? null;
            remoteDriver.scores[role].submitted[runKey] = localRoleScores?.submitted?.[runKey] ?? localRoleScores[runKey] ?? null;
          } else {
            remoteDriver.scores[role] = {
              run1: localRoleScores.run1 ?? null,
              run2: localRoleScores.run2 ?? null,
              runoff: localRoleScores.runoff ?? null,
              submitted: {
                run1: localRoleScores?.submitted?.run1 ?? localRoleScores.run1 ?? null,
                run2: localRoleScores?.submitted?.run2 ?? localRoleScores.run2 ?? null,
                runoff: localRoleScores?.submitted?.runoff ?? localRoleScores.runoff ?? null,
              },
            };
          }

          const activeJudgeRoles = getActiveJudgeRoles(remoteMeta);
          const nextQualifyingFlow = remotePayload.qualifyingFlow || createEmptyQualifyingFlow();
          if (nextQualifyingFlow.currentDriverId === driverId) {
            const shouldAdvanceAfterAllRuns = !runKey && driverHasAllSubmittedRunsForRoles(remoteDriver, activeJudgeRoles, ["run1", "run2"]);
            const shouldAdvanceAfterRun2 = runKey === "run2" && driverHasAllSubmittedRunsForRoles(remoteDriver, activeJudgeRoles, ["run2"]);
            if (shouldAdvanceAfterAllRuns || shouldAdvanceAfterRun2) {
              const queue = getRegisteredDrivers(remoteDrivers);
              const currentIndex = Math.max(0, queue.findIndex((entry) => entry.id === driverId));
              const nextIndex = currentIndex + 1;
              nextQualifyingFlow.currentDriverId = nextIndex < queue.length ? (queue[nextIndex]?.id || null) : null;
              nextQualifyingFlow.readyRoles = {};
            }
          }

          const updatedMeta = {
            ...remoteMeta,
            updatedAt: new Date().toISOString(),
            syncStamp: lastLocalPush,
          };

          transaction.set(eventRef, {
            ...remotePayload,
            ...updatedMeta,
            drivers: remoteDrivers,
            bracket: remotePayload.bracket || tournamentState,
            qualifyingFlow: nextQualifyingFlow,
            formatMode: remotePayload.formatMode || bracketModeSelect.value,
            lowerCount: remotePayload.lowerCount || String(getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0),
            syncStamp: lastLocalPush,
          }, { merge: true });

          transaction.set(getDirectoryDocRef(), {
            events: {
              [activeEventId]: cloneEventMeta({
                ...(eventDirectory[activeEventId] || activeEventMeta || updatedMeta),
                ...updatedMeta,
              }),
            },
            activeEventId,
            syncStamp: lastLocalPush,
          }, { merge: true });

          transactionResult = {
            remoteDrivers: JSON.parse(JSON.stringify(remoteDrivers)),
            remoteQualifyingFlow: JSON.parse(JSON.stringify(nextQualifyingFlow)),
            remoteMeta: cloneEventMeta(updatedMeta),
          };
        });

        if (transactionResult) {
          const localJudgeDrafts = captureJudgeDraftScores(role);
          appDrivers = restoreJudgeDraftScores(
            sanitizeLoadedDrivers(transactionResult.remoteDrivers),
            role,
            localJudgeDrafts,
          );
          qualifyingFlow = transactionResult.remoteQualifyingFlow || createEmptyQualifyingFlow();
          syncQualifyingFlowState();
          activeEventMeta = transactionResult.remoteMeta || activeEventMeta;
          eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
          saveDirectoryCache();
          saveEventStateCache();
        } else if (remoteJudgeLocked) {
          if (lockedRemotePayload) {
            applyRemoteEventState(lockedRemotePayload);
          }
          window.alert("Judging is locked for this event now. Your last submission was not saved.");
          applyRoleChange("spectator");
          switchView("qualifying");
          renderDriversTable();
          return false;
        }
        return true;
      } catch (error) {
        console.error("Judge submission sync failed:", error);
        publishState();
        return false;
      } finally {
        judgeSubmissionInFlight = false;
      }
    }

    function getJudgeSubmitButtonLabel(driver, role = currentRole) {
      if (!driver || !role?.startsWith("j")) return "Submit Scores";
      if (hasPendingJudgeChanges(driver, role)) return "Submit Scores";
      if (driver.id === qualifyingFlow.currentDriverId && !haveAllActiveJudgesSubmitted(driver)) {
        return "Waiting for other judges";
      }
      return "Re-submit to update";
    }

    function isJudgeSubmitWaiting(driver, role = currentRole) {
      return getJudgeSubmitButtonLabel(driver, role) === "Waiting for other judges";
    }

    function captureJudgeDraftScores(role = currentRole) {
      if (!role?.startsWith("j")) return new Map();
      const drafts = new Map();
      appDrivers.forEach((driver) => {
        const judgeScores = driver?.scores?.[role];
        if (!judgeScores) return;
        const hasPending = ["run1", "run2", "runoff"].some((runKey) => (judgeScores[runKey] ?? null) !== (judgeScores.submitted?.[runKey] ?? null));
        if (!hasPending) return;
        drafts.set(driver.id, {
          run1: judgeScores.run1,
          run2: judgeScores.run2,
          runoff: judgeScores.runoff,
        });
      });
      return drafts;
    }

    function applyJudgeScoreDeduction(driverId, runRef, deduction, role = currentRole) {
      const runKey = getRunKey(runRef);
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver || !role?.startsWith("j")) return false;
      if (deduction === "crash") {
        driver.scores[role][runKey] = 0;
        driver.runFlags[runKey] = "Crash";
        appendJudgeDeductionHistory(driver, role, runKey, "Crash");
        return true;
      }
      const numericDeduction = Number(deduction);
      if (!Number.isFinite(numericDeduction)) return false;
      const nextValue = clampJudgeScoreValue(getJudgeDraftScoreValue(driver, role, runKey) - numericDeduction);
      driver.scores[role][runKey] = nextValue;
      if (driver.runFlags?.[runKey]) {
        driver.runFlags[runKey] = null;
      }
      appendJudgeDeductionHistory(driver, role, runKey, `-${numericDeduction}`);
      return true;
    }

    function refreshJudgeDraftUi(container, driver, role = currentRole) {
      if (!container || !driver || !role?.startsWith("j")) return;

      ["r1", "r2", "runoff"].forEach((col) => {
        const input = container.querySelector(`.score-input[data-col="${col}"]`);
        if (!input) return;
        const runKey = col === "r1" ? "run1" : col === "r2" ? "run2" : "runoff";
        if (runKey === "runoff") {
          const runoffValue = driver.scores?.[role]?.runoff;
          input.value = runoffValue === null || runoffValue === undefined ? "" : String(clampJudgeScoreValue(runoffValue));
          return;
        }
        input.value = String(getJudgeDraftScoreValue(driver, role, runKey));
      });

      ["r1", "r2", "runoff"].forEach((col) => {
        const historyEl = container.querySelector(`.judge-deduction-history[data-col="${col}"]`);
        if (!historyEl) return;
        const runKey = col === "r1" ? "run1" : col === "r2" ? "run2" : "runoff";
        historyEl.innerHTML = renderDeductionHistory(driver, role, runKey);
      });

      const submitButton = container.querySelector("[data-action='submit-judge-scores']");
      if (submitButton) {
        submitButton.textContent = getJudgeSubmitButtonLabel(driver, role);
        submitButton.disabled = isJudgeSubmitWaiting(driver, role);
      }

      const runSubmitButton = container.querySelector("[data-action='submit-judge-run']");
      if (runSubmitButton) {
        const runKey = runSubmitButton.dataset.run;
        const runValue = getJudgeDraftScoreValue(driver, role, runKey);
        const isPending = hasPendingJudgeRunChanges(driver, role, runKey);
        const isSubmitted = hasSubmittedJudgeRun(driver, role, runKey);
        runSubmitButton.disabled = runValue === null || (isSubmitted && !isPending);
        runSubmitButton.textContent = isPending || !isSubmitted
          ? `Submit ${runKey === "run1" ? "Run 1" : "Run 2"}`
          : `Waiting For ${runKey === "run1" ? "Run 1" : "Run 2"} Scores`;
      }
    }

    function restoreJudgeDraftScores(drivers, role, drafts) {
      if (!role?.startsWith("j") || !(drafts instanceof Map) || !drafts.size) return drivers;
      return drivers.map((driver) => {
        const draft = drafts.get(driver.id);
        if (!draft) return driver;
        return {
          ...driver,
          scores: {
            ...driver.scores,
            [role]: {
              ...driver.scores[role],
              run1: draft.run1,
              run2: draft.run2,
              runoff: draft.runoff,
            },
          },
        };
      });
    }

    function getRunAverage(driver, runRef) {
      const runKey = getRunKey(runRef);
      if (driver.runFlags?.[runKey]) return 0;
      const s = driver?.scores || {};
      const submittedScores = getActiveJudgeRoles().map((role) => {
        const judgeScores = s?.[role] || {};
        const submitted = judgeScores?.submitted || {};
        return submitted?.[runKey] ?? null;
      });
      if (submittedScores.some((val) => val === null)) return null;
      const validScores = submittedScores.filter((val) => val !== null);
      if (validScores.length === 0) return null;
      const sum = validScores.reduce((a, b) => a + b, 0);
      return sum / validScores.length;
    }

    function getLiveRunAverage(driver, runRef) {
      const runKey = getRunKey(runRef);
      if (driver.runFlags?.[runKey]) return 0;
      const s = driver?.scores || {};
      const submittedScores = getActiveJudgeRoles().map((role) => {
        const judgeScores = s?.[role] || {};
        const submitted = judgeScores?.submitted || {};
        return submitted?.[runKey] ?? null;
      }).filter((value) => value !== null && value !== undefined);
      if (!submittedScores.length) return null;
      const sum = submittedScores.reduce((a, b) => a + b, 0);
      return sum / submittedScores.length;
    }

    function parseAdminJudgeRoleChoice(inputValue, activeRoles) {
      if (!inputValue) return null;
      const normalized = String(inputValue).trim().toLowerCase();
      if (!normalized) return null;
      if (activeRoles.includes(normalized)) return normalized;
      const numeric = Number.parseInt(normalized, 10);
      if (Number.isFinite(numeric)) {
        const mappedRole = `j${numeric}`;
        if (activeRoles.includes(mappedRole)) return mappedRole;
      }
      const matchedRole = activeRoles.find((role) => getRoleDisplayName(role).toLowerCase() === normalized);
      return matchedRole || null;
    }

    function parseAdminRunChoice(inputValue, includeRunoff = false) {
      if (!inputValue) return null;
      const normalized = String(inputValue).trim().toLowerCase();
      if (!normalized) return null;
      if (normalized === "1" || normalized === "run1" || normalized === "run 1" || normalized === "r1") return "run1";
      if (normalized === "2" || normalized === "run2" || normalized === "run 2" || normalized === "r2") return "run2";
      if (includeRunoff && (normalized === "3" || normalized === "runoff" || normalized === "top runoff")) return "runoff";
      return null;
    }

    async function editJudgeScoreByAdmin(driverId) {
      if (!adminCanEdit()) return;
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver) return;

      const activeRoles = getActiveJudgeRoles(activeEventMeta);
      if (!activeRoles.length) {
        window.alert("No active judges are configured for this event.");
        return;
      }

      const judgePrompt = activeRoles.map((role, index) => `${index + 1}. ${getRoleDisplayName(role)}`).join("\n");
      const selectedRoleInput = window.prompt(
        `Edit which judge for ${driver.name || "this driver"}?\n\n${judgePrompt}\n\nEnter the number or judge id.`,
        "1"
      );
      if (selectedRoleInput === null) return;

      const selectedRole = parseAdminJudgeRoleChoice(selectedRoleInput, activeRoles);
      if (!selectedRole) {
        window.alert("That judge selection was not recognized.");
        return;
      }

      const includeRunoff = activeRoles.some((role) => {
        const judgeScores = driver?.scores?.[role];
        return judgeScores?.runoff !== null || judgeScores?.submitted?.runoff !== null;
      });
      const runPrompt = includeRunoff
        ? "1. Run 1\n2. Run 2\n3. Runoff"
        : "1. Run 1\n2. Run 2";
      const selectedRunInput = window.prompt(
        `Edit which run for ${getRoleDisplayName(selectedRole)}?\n\n${runPrompt}\n\nEnter the number or run name.`,
        "1"
      );
      if (selectedRunInput === null) return;

      const runKey = parseAdminRunChoice(selectedRunInput, includeRunoff);
      if (!runKey) {
        window.alert("That run selection was not recognized.");
        return;
      }

      const judgeScores = driver?.scores?.[selectedRole];
      if (!judgeScores?.submitted) return;
      const currentValue = judgeScores.submitted?.[runKey] ?? judgeScores[runKey] ?? null;
      const runLabel = runKey === "run1" ? "Run 1" : runKey === "run2" ? "Run 2" : "Runoff";
      const nextValueInput = window.prompt(
        `Enter the corrected ${runLabel} score for ${getRoleDisplayName(selectedRole)} on ${driver.name || "this driver"}.\n\nCurrent: ${formatScore(currentValue)}\n\nEnter a number from 0 to 100, or type CLEAR to remove it.`,
        currentValue === null ? "" : String(currentValue)
      );
      if (nextValueInput === null) return;

      const trimmedValue = nextValueInput.trim();
      let nextValue = currentValue;
      if (/^clear$/i.test(trimmedValue)) {
        nextValue = null;
      } else {
        const parsedValue = toNumber(trimmedValue);
        if (parsedValue === null) {
          window.alert("Enter a valid score between 0 and 100, or type CLEAR.");
          return;
        }
        nextValue = clampJudgeScoreValue(parsedValue);
      }

      judgeScores[runKey] = nextValue;
      judgeScores.submitted[runKey] = nextValue;
      if (nextValue !== null && driver.runFlags?.[runKey]) {
        driver.runFlags[runKey] = null;
      }

      if (driver.id === qualifyingFlow.currentDriverId) {
        if (runKey === "run2" && haveAllActiveJudgesSubmittedRun(driver, "run2")) {
          advanceQualifyingDriver();
        } else if (haveAllActiveJudgesSubmitted(driver)) {
          advanceQualifyingDriver();
        }
      }

      await publishStateImmediately();
      renderDriversTable();
    }

    function getBestScore(r1Avg, r2Avg) {
      const scores = [r1Avg, r2Avg].filter(s => s !== null);
      return scores.length ? Math.max(...scores) : null;
    }

    function getSecondaryScore(r1Avg, r2Avg) {
      const scores = [r1Avg, r2Avg].filter(s => s !== null).sort((left, right) => right - left);
      return scores.length >= 2 ? scores[1] : null;
    }

    function formatScore(score) { return score === null ? "-" : score.toFixed(1); }

    function formatDateTimeForExport(value) {
      if (!value) return "Not completed";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed);
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function cloneDriver(driver) {
      return driver ? {
        seed: driver.seed,
        name: driver.name,
        teamName: driver.teamName || "",
        chassis: driver.chassis || "",
        registrationNumber: driver.registrationNumber,
        run1: driver.run1,
        run2: driver.run2,
        bestScore: driver.bestScore,
      } : null;
    }

    function cloneMatch(match) {
      return {
        left: cloneDriver(match.left),
        right: cloneDriver(match.right),
        winner: cloneDriver(match.winner),
        winnerMode: match.winnerMode ?? null,
        lockedLeft: Boolean(match.lockedLeft),
        lockedRight: Boolean(match.lockedRight),
        nextMatchIndex: match.nextMatchIndex ?? null,
        nextSlot: match.nextSlot ?? null,
      };
    }

    function createEmptyMatch() {
      return {
        left: null,
        right: null,
        winner: null,
        winnerMode: null,
        lockedLeft: false,
        lockedRight: false,
        nextMatchIndex: null,
        nextSlot: null,
      };
    }

    function participantKey(driver) {
      return driver ? `${driver.seed}-${driver.registrationNumber}-${driver.name}` : "";
    }

    function buildSlotSignature(bracketKey, roundIndex, matchIndex, side, driver) {
      return driver ? `${bracketKey}:${roundIndex}:${matchIndex}:${side}:${participantKey(driver)}` : "";
    }

    function clearWinnerAnimationState() {
      if (winnerAnimationTimer) {
        clearTimeout(winnerAnimationTimer);
        winnerAnimationTimer = null;
      }
      winnerAnimationState = null;
    }

    function triggerWinnerAnimation(state) {
      clearWinnerAnimationState();
      winnerAnimationState = state;
      winnerAnimationTimer = setTimeout(() => {
        winnerAnimationState = null;
        winnerAnimationTimer = null;
        if (document.getElementById("view-bracket")?.classList.contains("is-active")) {
          renderBracket();
        }
      }, 920);
    }

    function buildWinnerAnimationState(bracketKey, roundIndex, matchIndex, side, selectedDriver) {
      if (!selectedDriver) return null;
      const selected = {
        bracketKey,
        roundIndex,
        matchIndex,
        side,
        signature: buildSlotSignature(bracketKey, roundIndex, matchIndex, side, selectedDriver),
      };
      let target = null;

      if (bracketKey === "third") {
        return { selected, target: null };
      }

      if (
        bracketKey === "lower"
        && tournamentState?.lowerBracket?.rounds
        && roundIndex === tournamentState.lowerBracket.rounds.length - 1
        && tournamentState.lowerBracket.feedsInto
      ) {
        const feed = tournamentState.lowerBracket.feedsInto;
        target = {
          bracketKey: "main",
          roundIndex: 0,
          matchIndex: feed.matchIndex,
          side: feed.side,
          signature: buildSlotSignature("main", 0, feed.matchIndex, feed.side, selectedDriver),
        };
        return { selected, target };
      }

      const rounds = bracketKey === "lower"
        ? tournamentState?.lowerBracket?.rounds
        : tournamentState?.mainBracket?.rounds;
      const match = rounds?.[roundIndex]?.matches?.[matchIndex];
      if (match && roundIndex < (rounds?.length || 0) - 1) {
        const nextMatchIndex = match.nextMatchIndex ?? Math.floor(matchIndex / 2);
        const nextSlot = match.nextSlot ?? (matchIndex % 2 === 0 ? "left" : "right");
        target = {
          bracketKey,
          roundIndex: roundIndex + 1,
          matchIndex: nextMatchIndex,
          side: nextSlot,
          signature: buildSlotSignature(bracketKey, roundIndex + 1, nextMatchIndex, nextSlot, selectedDriver),
        };
      }

      return { selected, target };
    }

    function triggerJudgeSubmissionFeedback(driverId, role = currentRole, runKey = "all") {
      if (!driverId || !role?.startsWith("j")) return;
      if (judgeSubmissionFeedbackTimer) {
        clearTimeout(judgeSubmissionFeedbackTimer);
      }
      judgeSubmissionFeedback = { driverId, role, runKey, stamp: Date.now() };
      judgeSubmissionFeedbackTimer = setTimeout(() => {
        judgeSubmissionFeedback = null;
        judgeSubmissionFeedbackTimer = null;
        renderDriversTable();
      }, 760);
    }

    function isJudgeSubmissionFeedbackActive(driverId, role = currentRole, runKey = "all") {
      return Boolean(
        judgeSubmissionFeedback
        && judgeSubmissionFeedback.driverId === driverId
        && judgeSubmissionFeedback.role === role
        && (judgeSubmissionFeedback.runKey === "all" || judgeSubmissionFeedback.runKey === runKey)
      );
    }

    function normalizePdfText(value) {
      return String(value ?? "")
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "")
        .trim();
    }

    function escapePdfText(value) {
      return normalizePdfText(value)
        .replaceAll("\\", "\\\\")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)");
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Unable to read blob as data URL."));
        reader.readAsDataURL(blob);
      });
    }

    async function getResultsPdfLogoDataUrl() {
      if (!resultsPdfLogoDataUrlPromise) {
        resultsPdfLogoDataUrlPromise = (async () => {
          try {
            const response = await fetch("./assets/prodigy-rc-logo-transparent.png", { cache: "force-cache" });
            if (!response.ok) throw new Error(`Logo request failed with ${response.status}`);
            const blob = await response.blob();
            return await blobToDataUrl(blob);
          } catch (error) {
            console.warn("Results PDF logo unavailable", error);
            return null;
          }
        })();
      }
      return await resultsPdfLogoDataUrlPromise;
    }

    function padPdfCell(value, width, align = "left") {
      const text = normalizePdfText(value);
      const clipped = text.length > width ? `${text.slice(0, Math.max(width - 3, 0))}...` : text;
      return align === "right" ? clipped.padStart(width, " ") : clipped.padEnd(width, " ");
    }

    function buildResultsPdfLines(eventMeta, results, rankedDrivers) {
      const lines = [];
      const addLine = (line = "") => lines.push(normalizePdfText(line));
      const addSeparator = (length = 96) => addLine("-".repeat(length));
      const rankedLookup = new Map(rankedDrivers.map((driver) => [`${driver.seed}:${driver.name}`, driver]));
      const resolvePlacedDriver = (seed, name) => {
        if (!seed || !name) return null;
        return rankedLookup.get(`${seed}:${name}`) || { seed, name, bestScore: null, teamName: "" };
      };
      const formatPlacedDriverLine = (label, seed, name, fallback) => {
        const driver = resolvePlacedDriver(seed, name);
        if (!driver) return `${label}: ${fallback}`;
        const teamText = driver.teamName?.trim() ? ` | Team ${driver.teamName.trim()}` : "";
        return `${label}: #${driver.seed} ${driver.name} | Qual ${formatScore(driver.bestScore ?? null)}${teamText}`;
      };

      addLine("PRODIGY RC DRIFT ARENA");
      addLine("COMPETITION RESULTS");
      addSeparator();
      addLine(`Event: ${eventMeta.name || "Event Results"}`);
      addLine(`Date: ${formatEventDate(eventMeta.date)}`);
      addLine(`Format: ${results.planDescription || "Waiting for qualifying scores."}`);
      addLine(`Total Drivers: ${results.totalDrivers || rankedDrivers.length || 0}`);
      addLine(`Qualified Drivers: ${results.qualifiedCount || 0}`);
      addLine(`Completed: ${formatDateTimeForExport(results.completedAt || results.updatedAt)}`);
      addLine("");
      addLine("TOP RESULTS");
      addSeparator();
      addLine(formatPlacedDriverLine("1st Place", results.championSeed, results.championName, "Waiting for winner"));
      addLine(formatPlacedDriverLine("2nd Place", results.runnerUpSeed, results.runnerUpName, "Waiting for finalist"));
      addLine(formatPlacedDriverLine("3rd Place", results.thirdPlaceSeed, results.thirdPlaceName, "Waiting for 3rd place battle"));
      addLine(formatPlacedDriverLine("4th Place", results.fourthPlaceSeed, results.fourthPlaceName, "Waiting for 4th place result"));
      addLine("");
      addLine("QUALIFYING STANDINGS");
      addSeparator();

      const tableHeader = [
        padPdfCell("POS", 4),
        padPdfCell("REG", 5),
        padPdfCell("DRIVER", 24),
        padPdfCell("TEAM", 18),
        padPdfCell("CHASSIS", 14),
        padPdfCell("RUN1", 6, "right"),
        padPdfCell("RUN2", 6, "right"),
        padPdfCell("BEST", 6, "right"),
      ].join(" ");

      addLine(tableHeader);
      addSeparator();

      if (!rankedDrivers.length) {
        addLine("No standings available yet.");
      } else {
        rankedDrivers.forEach((driver, index) => {
          const run1 = driver.run1 ?? null;
          const run2 = driver.run2 ?? null;
          const best = driver.bestScore ?? getBestScore(run1, run2);
          addLine([
            padPdfCell(index + 1, 4),
            padPdfCell(driver.registrationNumber || driver.reg || driver.signUpPosition || "-", 5),
            padPdfCell(driver.name || "Unnamed Driver", 24),
            padPdfCell(driver.teamName || "-", 18),
            padPdfCell(driver.chassis || "-", 14),
            padPdfCell(formatScore(run1), 6, "right"),
            padPdfCell(formatScore(run2), 6, "right"),
            padPdfCell(formatScore(best), 6, "right"),
          ].join(" "));
        });
      }

      addLine("");
      addLine(`Generated ${formatDateTimeForExport(new Date().toISOString())}`);
      return { lines, tableHeader };
    }

    function buildPdfFromTextPagesLegacy(pages) {
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const marginLeft = 36;
      const marginTop = 44;
      const lineHeight = 13;

      const objects = [];
      const pushObject = (content) => {
        objects.push(content);
        return objects.length;
      };

      const pagesId = pushObject("");
      const fontId = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
      const pageIds = [];

      pages.forEach((lines) => {
        const commands = lines.map((line, index) => {
          const y = pageHeight - (marginTop + (index * lineHeight));
          return `BT\n/F1 10 Tf\n1 0 0 1 ${marginLeft.toFixed(2)} ${y.toFixed(2)} Tm\n(${escapePdfText(line)}) Tj\nET`;
        }).join("\n");
        const stream = `${commands}\n`;
        const contentId = pushObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
        const pageId = pushObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
      });

      objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
      const catalogId = pushObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

      let pdf = "%PDF-1.4\n";
      const offsets = [0];
      objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      });
      const xrefOffset = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n`;
      pdf += "0000000000 65535 f \n";
      offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
      });
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      return new Blob([pdf], { type: "application/pdf" });
    }

    function buildPdfFromTextPages(pages) {
      const JsPdfCtor = window?.jspdf?.jsPDF;
      if (!JsPdfCtor) {
        return buildPdfFromTextPagesLegacy(pages);
      }

      try {
        const doc = new JsPdfCtor({
          orientation: "portrait",
          unit: "pt",
          format: "letter",
          compress: true,
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 36;
        const marginTop = 44;
        const lineHeight = 13;

        doc.setFont("courier", "normal");
        doc.setFontSize(10);

        pages.forEach((lines, pageIndex) => {
          if (pageIndex > 0) doc.addPage("letter", "portrait");
          lines.forEach((line, lineIndex) => {
            const y = marginTop + (lineIndex * lineHeight);
            if (y > pageHeight - 36) return;
            doc.text(String(line ?? ""), marginLeft, y, {
              baseline: "alphabetic",
              maxWidth: pageWidth - (marginLeft * 2),
            });
          });
        });

        return doc.output("blob");
      } catch (error) {
        console.warn("jsPDF generation failed, falling back to legacy PDF builder", error);
        return buildPdfFromTextPagesLegacy(pages);
      }
    }

    async function buildResultsPdfBlob(eventMeta, results, rankedDrivers) {
      const JsPdfCtor = window?.jspdf?.jsPDF;
      if (!JsPdfCtor) {
        const { lines, tableHeader } = buildResultsPdfLines(eventMeta, results, rankedDrivers);
        const maxLinesPerPage = 54;
        const pages = [];
        let pageLines = [];
        let standingsContinued = false;

        const flushPage = () => {
          if (pageLines.length) pages.push(pageLines);
          pageLines = [];
        };

        lines.forEach((line) => {
          if (pageLines.length >= maxLinesPerPage) {
            flushPage();
            if (standingsContinued) {
              pageLines.push("QUALIFYING STANDINGS (CONT.)");
              pageLines.push("-".repeat(96));
              pageLines.push(tableHeader);
              pageLines.push("-".repeat(96));
            }
          }
          pageLines.push(line);
          if (line === "QUALIFYING STANDINGS") standingsContinued = true;
        });
        flushPage();
        return buildPdfFromTextPages(pages);
      }

      const doc = new JsPdfCtor({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
        compress: true,
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 38;
      const contentWidth = pageWidth - (marginX * 2);
      const footerY = pageHeight - 22;
      const cardGap = 12;
      const sectionGap = 18;
      const logoDataUrl = await getResultsPdfLogoDataUrl();
      const generatedAtLabel = formatDateTimeForExport(new Date().toISOString());
      let cursorY = 34;

      const truncatePdfWidth = (value, width) => {
        const safe = normalizePdfText(value || "-");
        if (!safe) return "-";
        if (doc.getTextWidth(safe) <= width) return safe;
        let base = safe;
        while (base.length > 1 && doc.getTextWidth(`${base}...`) > width) {
          base = base.slice(0, -1);
        }
        return `${base}...`;
      };

      const drawSectionHeader = (title) => {
        doc.setFillColor(10, 10, 10);
        doc.roundedRect(marginX, cursorY, contentWidth, 22, 8, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(normalizePdfText(title).toUpperCase(), marginX + 12, cursorY + 14);
        cursorY += 32;
      };

      const drawInfoCard = (x, y, w, h, label, value) => {
        doc.setDrawColor(24, 24, 24);
        doc.setFillColor(252, 252, 252);
        doc.roundedRect(x, y, w, h, 10, 10, "FD");
        doc.setTextColor(110, 110, 110);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(normalizePdfText(label).toUpperCase(), x + 12, y + 16);
        doc.setTextColor(18, 18, 18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        const lines = doc.splitTextToSize(normalizePdfText(value || "-"), w - 24).slice(0, 2);
        lines.forEach((line, lineIndex) => {
          doc.text(line, x + 12, y + 34 + (lineIndex * 14));
        });
      };

      const drawPodiumCard = (x, y, w, h, place, driver, fallback) => {
        doc.setDrawColor(20, 20, 20);
        doc.setFillColor(place === "1st Place" ? 245 : 251, place === "1st Place" ? 245 : 251, place === "1st Place" ? 245 : 251);
        doc.roundedRect(x, y, w, h, 12, 12, "FD");
        doc.setTextColor(95, 95, 95);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(normalizePdfText(place).toUpperCase(), x + 12, y + 16);
        doc.setTextColor(12, 12, 12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        const primary = driver
          ? `#${driver.seed} ${normalizePdfText(driver.name)}`
          : normalizePdfText(fallback);
        doc.text(doc.splitTextToSize(primary, w - 24).slice(0, 2), x + 12, y + 34);
        doc.setTextColor(110, 110, 110);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const secondary = driver?.teamName?.trim()
          ? `Team ${normalizePdfText(driver.teamName.trim())}`
          : driver
            ? `Qual ${formatScore(driver.bestScore ?? null)}`
            : "Waiting for result";
        const tertiary = driver?.teamName?.trim()
          ? `Qual ${formatScore(driver.bestScore ?? null)}`
          : "";
        doc.text(doc.splitTextToSize(secondary, w - 24).slice(0, 2), x + 12, y + h - 28);
        if (tertiary) {
          doc.text(doc.splitTextToSize(tertiary, w - 24).slice(0, 1), x + 12, y + h - 14);
        }
      };

      const rowHeights = {
        header: 24,
        body: 22,
      };
      const tableColumns = [
        { key: "pos", label: "Pos", width: 28, align: "center" },
        { key: "reg", label: "Reg", width: 34, align: "center" },
        { key: "driver", label: "Driver", width: 148, align: "left" },
        { key: "team", label: "Team", width: 96, align: "left" },
        { key: "chassis", label: "Chassis", width: 92, align: "left" },
        { key: "run1", label: "Run 1", width: 44, align: "right" },
        { key: "run2", label: "Run 2", width: 44, align: "right" },
        { key: "best", label: "Best", width: 44, align: "right" },
      ];

      const drawTableHeader = () => {
        let x = marginX;
        doc.setFillColor(14, 14, 14);
        doc.roundedRect(marginX, cursorY, contentWidth, rowHeights.header, 8, 8, "F");
        tableColumns.forEach((column) => {
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          const textX = column.align === "right"
            ? x + column.width - 8
            : column.align === "center"
              ? x + (column.width / 2)
              : x + 8;
          doc.text(column.label.toUpperCase(), textX, cursorY + 15, {
            align: column.align === "right" ? "right" : column.align === "center" ? "center" : "left",
          });
          x += column.width;
        });
        cursorY += rowHeights.header + 8;
      };

      const drawTableRow = (row, rowIndex) => {
        let x = marginX;
        doc.setDrawColor(222, 222, 222);
        doc.setFillColor(rowIndex % 2 === 0 ? 253 : 245, rowIndex % 2 === 0 ? 253 : 245, rowIndex % 2 === 0 ? 253 : 245);
        doc.roundedRect(marginX, cursorY, contentWidth, rowHeights.body, 6, 6, "FD");
        tableColumns.forEach((column) => {
          const rawText = row[column.key] ?? "-";
          doc.setTextColor(18, 18, 18);
          doc.setFont("helvetica", column.key === "driver" ? "bold" : "normal");
          doc.setFontSize(9);
          const availableWidth = column.width - 14;
          const displayText = truncatePdfWidth(rawText, availableWidth);
          const textX = column.align === "right"
            ? x + column.width - 7
            : column.align === "center"
              ? x + (column.width / 2)
              : x + 7;
          doc.text(displayText, textX, cursorY + 14, {
            align: column.align === "right" ? "right" : column.align === "center" ? "center" : "left",
          });
          x += column.width;
        });
        cursorY += rowHeights.body + 6;
      };

      const beginNewPage = (repeatStandingsHeader = false) => {
        doc.addPage("letter", "portrait");
        cursorY = 30;
        doc.setDrawColor(222, 222, 222);
        doc.line(marginX, cursorY + 36, pageWidth - marginX, cursorY + 36);
        if (logoDataUrl) {
          try {
            const props = doc.getImageProperties(logoDataUrl);
            const ratio = props.width / props.height;
            const logoW = 138;
            const logoH = logoW / ratio;
            doc.addImage(logoDataUrl, "PNG", marginX, cursorY, logoW, logoH, undefined, "FAST");
          } catch (error) {
            console.warn("Unable to add results PDF logo on additional page", error);
          }
        }
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(normalizePdfText(eventMeta.name || "Competition Results"), pageWidth - marginX, cursorY + 16, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        doc.text("Qualifying Standings", pageWidth - marginX, cursorY + 30, { align: "right" });
        cursorY += 52;
        if (repeatStandingsHeader) {
          drawSectionHeader("Qualifying Standings");
          drawTableHeader();
        }
      };

      if (logoDataUrl) {
        try {
          const props = doc.getImageProperties(logoDataUrl);
          const ratio = props.width / props.height;
          const logoW = Math.min(220, contentWidth * 0.45);
          const logoH = logoW / ratio;
          doc.addImage(logoDataUrl, "PNG", (pageWidth - logoW) / 2, cursorY, logoW, logoH, undefined, "FAST");
          cursorY += logoH + 12;
        } catch (error) {
          console.warn("Unable to add results PDF logo", error);
          cursorY += 12;
        }
      }

      doc.setTextColor(12, 12, 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("Competition Results", pageWidth / 2, cursorY, { align: "center" });
      cursorY += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text(normalizePdfText(formatEventDate(eventMeta.date)), pageWidth / 2, cursorY, { align: "center" });
      cursorY += 16;
      doc.setDrawColor(22, 22, 22);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += sectionGap;

      drawSectionHeader("Event Summary");
      const summaryCards = [
        ["Event", eventMeta.name || "Event Results"],
        ["Date", formatEventDate(eventMeta.date)],
        ["Format", results.planDescription || "Waiting for qualifying scores."],
        ["Completed", formatDateTimeForExport(results.completedAt || results.updatedAt)],
        ["Total Drivers", String(results.totalDrivers || rankedDrivers.length || 0)],
        ["Qualified Drivers", String(results.qualifiedCount || 0)],
      ];
      const summaryCardWidth = (contentWidth - cardGap) / 2;
      const summaryCardHeight = 56;
      summaryCards.forEach(([label, value], index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        drawInfoCard(
          marginX + (col * (summaryCardWidth + cardGap)),
          cursorY + (row * (summaryCardHeight + 10)),
          summaryCardWidth,
          summaryCardHeight,
          label,
          value,
        );
      });
      cursorY += (Math.ceil(summaryCards.length / 2) * (summaryCardHeight + 10)) - 10 + sectionGap;

      drawSectionHeader("Top Results");
      const rankedLookup = new Map(rankedDrivers.map((driver) => [`${driver.seed}:${driver.name}`, driver]));
      const podiumCards = [
        ["1st Place", results.championName ? (rankedLookup.get(`${results.championSeed}:${results.championName}`) || { seed: results.championSeed, name: results.championName, bestScore: null, teamName: "" }) : null, "Waiting for winner"],
        ["2nd Place", results.runnerUpName ? (rankedLookup.get(`${results.runnerUpSeed}:${results.runnerUpName}`) || { seed: results.runnerUpSeed, name: results.runnerUpName, bestScore: null, teamName: "" }) : null, "Waiting for finalist"],
        ["3rd Place", results.thirdPlaceName ? (rankedLookup.get(`${results.thirdPlaceSeed}:${results.thirdPlaceName}`) || { seed: results.thirdPlaceSeed, name: results.thirdPlaceName, bestScore: null, teamName: "" }) : null, "Waiting for 3rd place battle"],
        ["4th Place", results.fourthPlaceName ? (rankedLookup.get(`${results.fourthPlaceSeed}:${results.fourthPlaceName}`) || { seed: results.fourthPlaceSeed, name: results.fourthPlaceName, bestScore: null, teamName: "" }) : null, "Waiting for 4th place result"],
      ];
      const podiumWidth = (contentWidth - cardGap) / 2;
      const podiumHeight = 84;
      podiumCards.forEach(([place, driver, fallback], index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        drawPodiumCard(
          marginX + (col * (podiumWidth + cardGap)),
          cursorY + (row * (podiumHeight + 10)),
          podiumWidth,
          podiumHeight,
          place,
          driver,
          fallback,
        );
      });
      cursorY += (Math.ceil(podiumCards.length / 2) * (podiumHeight + 10)) - 10 + sectionGap;

      drawSectionHeader("Qualifying Standings");
      drawTableHeader();

      const tableRows = rankedDrivers.length
        ? rankedDrivers.map((driver, index) => {
            const run1 = driver.run1 ?? null;
            const run2 = driver.run2 ?? null;
            const best = driver.bestScore ?? getBestScore(run1, run2);
            return {
              pos: String(index + 1),
              reg: String(driver.registrationNumber || driver.reg || driver.signUpPosition || "-"),
              driver: normalizePdfText(driver.name || "Unnamed Driver"),
              team: normalizePdfText(driver.teamName || "-"),
              chassis: normalizePdfText(driver.chassis || "-"),
              run1: formatScore(run1),
              run2: formatScore(run2),
              best: formatScore(best),
            };
          })
        : [{
            pos: "-",
            reg: "-",
            driver: "No standings available yet.",
            team: "-",
            chassis: "-",
            run1: "-",
            run2: "-",
            best: "-",
          }];

      tableRows.forEach((row, index) => {
        if (cursorY + rowHeights.body + 28 > footerY) {
          beginNewPage(true);
        }
        drawTableRow(row, index);
      });

      const pageCount = doc.getNumberOfPages();
      for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
        doc.setPage(pageIndex);
        doc.setDrawColor(224, 224, 224);
        doc.line(marginX, footerY - 8, pageWidth - marginX, footerY - 8);
        doc.setTextColor(110, 110, 110);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Generated ${generatedAtLabel}`, marginX, footerY);
        doc.text(`Page ${pageIndex} of ${pageCount}`, pageWidth - marginX, footerY, { align: "right" });
      }

      return doc.output("blob");
    }

    function triggerPdfDownload(blob, fileName) {
      if (!blob) return false;
      const previewShown = showPdfPreview(
        blob,
        fileName,
        prefersPdfPreviewModal()
          ? "The PDF was generated successfully. Use Download PDF or Open PDF below."
          : "The PDF was generated successfully. Use Download PDF or Open PDF below."
      );
      if (!prefersPdfPreviewModal()) {
        startDirectBlobDownload(blob, fileName);
      }
      return previewShown;
    }

    async function exportResultsPdf() {
      try {
        if (!activeEventMeta) {
          window.alert("Select an event before exporting results.");
          return;
        }
        const liveResults = buildEventResults();
        const results = {
          ...(activeEventMeta.results || buildEmptyEventResults()),
          ...liveResults,
        };
        const rankedDrivers = rankDrivers(appDrivers);
        const blob = await buildResultsPdfBlob(activeEventMeta, results, rankedDrivers);
        if (!(blob instanceof Blob) || !blob.size) {
          window.alert("The PDF file could not be generated for this event.");
          return;
        }
        const safeFileName = `${(activeEventMeta.name || "event-results").replace(/[<>:"/\\|?*]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "event-results"}-results.pdf`;
        const downloadStarted = triggerPdfDownload(blob, safeFileName);
        if (!downloadStarted) {
          window.alert("PDF export could not start on this browser yet.");
        }
      } catch (error) {
        console.error("Results PDF export failed", error);
        window.alert(`Results PDF export failed: ${error?.message || "Unknown error"}`);
      }
    }

    function nextPowerOfTwo(value) {
      let result = 1;
      while (result < value) result *= 2;
      return result;
    }

    function previousPowerOfTwo(value) {
      let result = 1;
      while (result * 2 <= value) result *= 2;
      return result;
    }

    function getRoundName(size) {
      if (size === 2) return "Final";
      if (size === 4) return "Final 4";
      if (size === 8) return "Elite 8";
      return `Top ${size}`;
    }

    function getBracketSeedOrder(bracketSize) {
      let order = [1, 2];
      while (order.length < bracketSize) {
        const nextSize = order.length * 2 + 1;
        order = order.flatMap((seed) => [seed, nextSize - seed]);
      }
      return order;
    }

    function createRoundShells(bracketSize) {
      const rounds = [];
      for (let size = bracketSize; size >= 2; size /= 2) {
        rounds.push({
          name: getRoundName(size),
          matches: Array.from({ length: size / 2 }, () => createEmptyMatch()),
        });
      }
      return rounds;
    }

    function createRoundsFromOpeningMatches(bracketSize, openingMatches) {
      const rounds = createRoundShells(bracketSize);
      rounds[0].matches = openingMatches.map(cloneMatch);
      return rounds;
    }

    function rankDrivers(driversStateList) {
      const normalizedDrivers = normalizeDriverList(driversStateList);
      const baseRanked = normalizedDrivers
        .map((driver, index) => {
          const run1Avg = getRunAverage(driver, 1);
          const run2Avg = getRunAverage(driver, 2);
          const bestScore = getBestScore(run1Avg, run2Avg);
          const secondaryScore = getSecondaryScore(run1Avg, run2Avg);
          const runoffScore = getRunAverage(driver, "runoff");
          return {
             id: driver.id,
             order: index,
             signUpPosition: driver.signUpPosition ?? (index + 1),
             registrationNumber: driver.reg,
             name: driver.name,
             teamName: driver.teamName || "",
             chassis: driver.chassis || "",
              run1: run1Avg,
              run2: run2Avg,
              runoff: runoffScore,
              secondaryScore,
              bestScore: bestScore
           };
         })
        .filter((driver) => {
          const hasName = typeof driver.name === "string" && driver.name.trim() !== "";
          return hasName || driver.bestScore !== null || driver.runoff !== null;
        });

      const sortedDrivers = [...baseRanked].sort((left, right) => {
           if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
           if (right.secondaryScore !== left.secondaryScore) return (right.secondaryScore ?? -1) - (left.secondaryScore ?? -1);
           if (left.signUpPosition !== right.signUpPosition) return left.signUpPosition - right.signUpPosition;
           return left.order - right.order;
        });

      if (!sortedDrivers.length) return [];

      const topBestScore = sortedDrivers[0].bestScore;
      const topTieCandidates = sortedDrivers.filter((driver) => driver.bestScore === topBestScore && topBestScore !== null);

      if (topTieCandidates.length > 1 && topTieCandidates.every((driver) => driver.runoff !== null)) {
        const topWinner = [...topTieCandidates].sort((left, right) => {
          if (right.runoff !== left.runoff) return right.runoff - left.runoff;
          if (right.secondaryScore !== left.secondaryScore) return (right.secondaryScore ?? -1) - (left.secondaryScore ?? -1);
          if (left.signUpPosition !== right.signUpPosition) return left.signUpPosition - right.signUpPosition;
          return left.order - right.order;
        })[0];

        const remainingDrivers = sortedDrivers.filter((driver) => driver.id !== topWinner.id);
        return [topWinner, ...remainingDrivers].map((driver, index) => ({ ...driver, seed: index + 1 }));
      }

      return sortedDrivers.map((driver, index) => ({ ...driver, seed: index + 1 }));
    }

    function getEnteredDriverCount(driversStateList) {
      return (Array.isArray(driversStateList) ? driversStateList : []).filter((driver) => {
        return driverHasMeaningfulEntry(driver);
      }).length;
    }

    function createStandardOpeningMatches(drivers, bracketSize) {
      const seedOrder = getBracketSeedOrder(bracketSize);
      const slots = seedOrder.map((seedNumber) => cloneDriver(drivers[seedNumber - 1] ?? null));
      const matches = [];
      for (let index = 0; index < bracketSize / 2; index += 1) {
        matches.push({ left: slots[index * 2], right: slots[index * 2 + 1], winner: null });
      }
      return matches;
    }

    function createHighVsLowOpeningMatches(drivers, bracketSize) {
      const matches = [];
      for (let matchIndex = 0; matchIndex < bracketSize / 2; matchIndex += 1) {
        const leftDriver = cloneDriver(drivers[matchIndex] ?? null);
        const rightDriver = cloneDriver(drivers[bracketSize - 1 - matchIndex] ?? null);
        matches.push({ left: leftDriver, right: rightDriver, winner: null });
      }
      return matches;
    }

    function createSeededOpeningMatches(seedAssignments, bracketSize) {
      const seedOrder = getBracketSeedOrder(bracketSize);
      const slots = seedOrder.map((seedNumber) => cloneDriver(seedAssignments[seedNumber] ?? null));
      const matches = [];
      for (let index = 0; index < bracketSize / 2; index += 1) {
        matches.push({ left: slots[index * 2], right: slots[index * 2 + 1], winner: null });
      }
      return matches;
    }

    function findFeedTarget(openingMatches) {
      for (let matchIndex = 0; matchIndex < openingMatches.length; matchIndex += 1) {
        const match = openingMatches[matchIndex];
        if (!match.left) return { matchIndex, side: "left" };
        if (!match.right) return { matchIndex, side: "right" };
      }
      return { matchIndex: 0, side: "right" };
    }

    function getSdcPlayInSeed(bracketSize) {
      return Math.max(2, bracketSize - 1);
    }

    function isSdcFormat(format) {
      return [
        FORMAT_SDC,
        FORMAT_SDC_TOP_8,
        FORMAT_SDC_TOP_16,
        FORMAT_SDC_TOP_32,
      ].includes(format);
    }

    function getRequestedSdcMainBracketSize(format) {
      if (format === FORMAT_SDC_TOP_8) return 8;
      if (format === FORMAT_SDC_TOP_16) return 16;
      if (format === FORMAT_SDC_TOP_32) return 32;
      return null;
    }

    function getSdcFeedTarget(bracketSize) {
      const seedOrder = getBracketSeedOrder(bracketSize);
      const playInSeed = getSdcPlayInSeed(bracketSize);
      for (let matchIndex = 0; matchIndex < bracketSize / 2; matchIndex += 1) {
        const leftSeed = seedOrder[matchIndex * 2];
        const rightSeed = seedOrder[matchIndex * 2 + 1];
        if (leftSeed === playInSeed) return { matchIndex, side: "left" };
        if (rightSeed === playInSeed) return { matchIndex, side: "right" };
      }
      return { matchIndex: 0, side: "right" };
    }

    function createSdcMainOpeningMatches(directDrivers, bracketSize) {
      const seedAssignments = {};
      for (let seed = 1; seed <= bracketSize - 2; seed += 1) {
        seedAssignments[seed] = directDrivers[seed - 1] ?? null;
      }
      seedAssignments[bracketSize] = directDrivers[bracketSize - 2] ?? null;

      const matches = createSeededOpeningMatches(seedAssignments, bracketSize);
      return {
        matches,
        feedTarget: getSdcFeedTarget(bracketSize),
      };
    }

    function createSdc24MainBracket(directDrivers) {
      const seedMap = {};
      for (let seed = 1; seed <= 22; seed += 1) {
        seedMap[seed] = cloneDriver(directDrivers[seed - 1] ?? null);
      }
      seedMap[24] = cloneDriver(directDrivers[22] ?? null);

      const rounds = [
        {
          name: "Top 24",
          matches: [
            { left: seedMap[9], right: seedMap[24], winner: null, winnerMode: null, nextMatchIndex: 1, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[12], right: seedMap[21], winner: null, winnerMode: null, nextMatchIndex: 3, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[13], right: seedMap[20], winner: null, winnerMode: null, nextMatchIndex: 2, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[16], right: seedMap[17], winner: null, winnerMode: null, nextMatchIndex: 0, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[10], right: null, winner: null, winnerMode: null, nextMatchIndex: 5, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[11], right: seedMap[22], winner: null, winnerMode: null, nextMatchIndex: 7, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[14], right: seedMap[19], winner: null, winnerMode: null, nextMatchIndex: 6, nextSlot: "right", lockedLeft: false, lockedRight: false },
            { left: seedMap[15], right: seedMap[18], winner: null, winnerMode: null, nextMatchIndex: 4, nextSlot: "right", lockedLeft: false, lockedRight: false },
          ],
        },
        {
          name: "Top 16",
          matches: [
            { left: seedMap[1], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[8], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[4], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[5], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[2], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[7], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[3], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
            { left: seedMap[6], right: null, winner: null, winnerMode: null, lockedLeft: true, lockedRight: false },
          ],
        },
        ...createRoundShells(8),
      ];

      return {
        rounds,
        feedTarget: { matchIndex: 4, side: "right" },
      };
    }

    function createLowerMainOpeningMatches(directDrivers, bracketSize) {
      const matches = [];
      let lowIndex = 0;
      let highIndex = directDrivers.length - 1;

      for (let matchIndex = 0; matchIndex < bracketSize / 2; matchIndex += 1) {
        if (matchIndex === 1) {
          matches.push({
            left: cloneDriver(directDrivers[lowIndex] ?? null),
            right: null, 
            winner: null,
          });
          lowIndex += 1;
          continue;
        }

        const leftDriver = lowIndex <= highIndex ? cloneDriver(directDrivers[lowIndex]) : null;
        lowIndex += 1;
        let rightDriver = null;
        if (lowIndex <= highIndex) {
          rightDriver = cloneDriver(directDrivers[highIndex]);
          highIndex -= 1;
        }
        matches.push({ left: leftDriver, right: rightDriver, winner: null });
      }
      return matches;
    }

    function createSdcDirectQualifiers(limitedDrivers, mainBracketSize) {
      const playInSeed = getSdcPlayInSeed(mainBracketSize);
      const directQualifiers = limitedDrivers.slice(0, mainBracketSize - 1).map(cloneDriver);
      return directQualifiers.map((driver, index) => ({
        ...driver,
        seed: index + 1 >= playInSeed ? index + 2 : index + 1,
      }));
    }

    function normalizePreferredFormat(preferredFormat) {
      if (preferredFormat === FORMAT_SDC_TOP_8) return FORMAT_SDC_TOP_8;
      if (preferredFormat === FORMAT_SDC_TOP_16) return FORMAT_SDC_TOP_16;
      if (preferredFormat === FORMAT_SDC_TOP_32) return FORMAT_SDC_TOP_32;
      if (preferredFormat === FORMAT_SDC) return FORMAT_SDC_TOP_32;
      return FORMAT_CLASSIC;
    }

    function getValidLowerBracketCounts(fieldCount) {
      const validCounts = [];
      for (let mainBracketSize = previousPowerOfTwo(fieldCount); mainBracketSize >= 2; mainBracketSize /= 2) {
        const lowerCount = fieldCount - (mainBracketSize - 1);
        if (lowerCount >= 2 && lowerCount < fieldCount) {
          validCounts.push(lowerCount);
        }
      }
      return [...new Set(validCounts)].sort((left, right) => left - right);
    }

    function resolveLowerBracketCount(fieldCount, requestedCount) {
      const validCounts = getValidLowerBracketCounts(fieldCount);
      if (!validCounts.length) return { lowerBracketCount: 0, validCounts: [] };
      const fallback = validCounts[0];
      if (!requestedCount || Number.isNaN(requestedCount)) {
        return { lowerBracketCount: fallback, validCounts };
      }

      let bestCount = validCounts[0];
      let bestDistance = Math.abs(requestedCount - bestCount);
      validCounts.forEach((count) => {
        const distance = Math.abs(requestedCount - count);
        if (distance < bestDistance || (distance === bestDistance && count > bestCount)) {
          bestCount = count;
          bestDistance = distance;
        }
      });
      return { lowerBracketCount: bestCount, validCounts };
    }

    function getValidSdcMainBracketSizes(fieldCount) {
      const validSizes = [];
      [8, 16, 24, 32].forEach((size) => {
        if (size <= fieldCount) validSizes.push(size);
      });
      return validSizes;
    }

    function resolveSdcMainBracketSize(fieldCount, requestedSize) {
      const validSizes = getValidSdcMainBracketSizes(fieldCount);
      if (!validSizes.length) return { mainBracketSize: 0, validSizes: [] };
      const fallback = validSizes[validSizes.length - 1];
      if (!requestedSize || Number.isNaN(requestedSize)) {
        return { mainBracketSize: fallback, validSizes };
      }

      let bestSize = validSizes[0];
      let bestDistance = Math.abs(requestedSize - bestSize);
      validSizes.forEach((size) => {
        const distance = Math.abs(requestedSize - size);
        if (distance < bestDistance || (distance === bestDistance && size > bestSize)) {
          bestSize = size;
          bestDistance = distance;
        }
      });
      return { mainBracketSize: bestSize, validSizes };
    }

    function getCompetitionPlan(fieldCount, preferredFormat = FORMAT_CLASSIC, customLowerCount = 0) {
      preferredFormat = normalizePreferredFormat(preferredFormat);
      const qualifiedCount = Math.max(0, fieldCount);
      if (qualifiedCount < 2) {
        return {
          qualifiedCount, preferredFormat, resolvedFormat: FORMAT_CLASSIC,
          mainBracketSize: 0, usesLowerBracket: false, lowerBracketSize: 0,
          lowerBracketCount: 0, directMainCount: 0,
          description: "Need at least 2 scored drivers.",
        };
      }

      if (isSdcFormat(preferredFormat) && qualifiedCount >= 3) {
        const requestedMainBracketSize = getRequestedSdcMainBracketSize(preferredFormat);
        const resolution = resolveSdcMainBracketSize(qualifiedCount, requestedMainBracketSize || (customLowerCount > 0 ? customLowerCount : null));
        const mainBracketSize = resolution.mainBracketSize;
        if (!mainBracketSize) {
          return {
            qualifiedCount, preferredFormat, resolvedFormat: FORMAT_CLASSIC,
            mainBracketSize: nextPowerOfTwo(qualifiedCount), usesLowerBracket: false, lowerBracketSize: 0, lowerBracketCount: 0,
            directMainCount: qualifiedCount, validLowerCounts: [], validMainBracketSizes: [],
            description: `Need at least ${requestedMainBracketSize || 8} drivers for this SDC bracket format.`,
          };
        }
        const directMainCount = Math.max(0, mainBracketSize - 1);
        const lowerBracketCount = Math.max(0, qualifiedCount - directMainCount);
        const lowerBracketSize = lowerBracketCount <= 1 ? 2 : nextPowerOfTwo(lowerBracketCount);
        const normalizedRequested = requestedMainBracketSize && requestedMainBracketSize !== mainBracketSize;

        return {
          qualifiedCount, preferredFormat, resolvedFormat: FORMAT_SDC, mainBracketSize,
          usesLowerBracket: true, lowerBracketSize, lowerBracketCount, directMainCount,
          validMainBracketSizes: resolution.validSizes, validLowerCounts: [],
          description: normalizedRequested
            ? `SDC Top ${mainBracketSize} selected. ${lowerBracketCount} driver${lowerBracketCount === 1 ? "" : "s"} in the lower bracket; winner fills seed ${getSdcPlayInSeed(mainBracketSize)} against the #2 qualifier.`
            : `SDC Top ${mainBracketSize}. ${lowerBracketCount} driver${lowerBracketCount === 1 ? "" : "s"} in the lower bracket; winner fills seed ${getSdcPlayInSeed(mainBracketSize)} against the #2 qualifier.`,
        };
      }

      const mainBracketSize = nextPowerOfTwo(qualifiedCount);
      const byes = mainBracketSize - qualifiedCount;
      return {
        qualifiedCount, preferredFormat, resolvedFormat: FORMAT_CLASSIC,
        mainBracketSize, usesLowerBracket: false, lowerBracketSize: 0, lowerBracketCount: 0,
        directMainCount: qualifiedCount, validLowerCounts: [], validMainBracketSizes: [],
        description: byes > 0 ? `Classic Top ${mainBracketSize} (${byes} byes).` : `Classic Top ${mainBracketSize}.`,
      };
    }

    function createTournamentState(qualifiedDrivers, preferredFormat = FORMAT_CLASSIC, customLowerCount = 0) {
      preferredFormat = normalizePreferredFormat(preferredFormat);
      const plan = getCompetitionPlan(qualifiedDrivers.length, preferredFormat, customLowerCount);
      const limitedDrivers = qualifiedDrivers.slice(0, plan.qualifiedCount).map(cloneDriver);

      let lowerBracket = null;
      let mainOpeningMatches;
      let mainRounds = null;

      if (plan.usesLowerBracket) {
        const directQualifiers = plan.resolvedFormat === FORMAT_SDC
          ? createSdcDirectQualifiers(limitedDrivers, plan.mainBracketSize)
          : limitedDrivers.slice(0, plan.directMainCount);
        const lowerParticipants = limitedDrivers.slice(plan.directMainCount);
        const lowerOpeningMatches = createHighVsLowOpeningMatches(lowerParticipants, plan.lowerBracketSize);
        const sdcOpening = plan.resolvedFormat === FORMAT_SDC
          ? (plan.mainBracketSize === 24
            ? createSdc24MainBracket(directQualifiers)
            : createSdcMainOpeningMatches(directQualifiers, plan.mainBracketSize))
          : null;

        lowerBracket = {
          title: `Lower Bracket Play-In (${lowerParticipants.length} drivers)`,
          rounds: createRoundsFromOpeningMatches(
            plan.lowerBracketSize,
            lowerOpeningMatches
          ),
          feedsInto: sdcOpening?.feedTarget || { matchIndex: 1, side: "right" },
        };
        mainOpeningMatches = sdcOpening?.matches || createLowerMainOpeningMatches(directQualifiers, plan.mainBracketSize);
        mainRounds = sdcOpening?.rounds || null;
      } else {
        mainOpeningMatches = createHighVsLowOpeningMatches(limitedDrivers, plan.mainBracketSize);
      }

      return {
        version: APP_STATE_VERSION,
        createdAt: new Date().toISOString(),
        preferredFormat,
        customLowerCount,
        qualifiedDrivers: limitedDrivers,
        plan,
        lowerBracket,
        mainBracket: {
          title: getRoundName(plan.mainBracketSize),
          rounds: mainRounds || createRoundsFromOpeningMatches(plan.mainBracketSize, mainOpeningMatches),
          thirdPlaceMatch: plan.mainBracketSize >= 4 ? createEmptyMatch() : null,
        },
      };
    }

    function normalizeBracketRounds(rounds, pendingFeed = null) {
      const normalizedRounds = rounds.map((round, roundIndex) => ({
        name: round.name,
        matches: round.matches.map((match, matchIndex) => {
          if (roundIndex === 0) return cloneMatch(match);
          return {
            left: match.lockedLeft ? cloneDriver(round.matches[matchIndex]?.left) : null,
            right: match.lockedRight ? cloneDriver(round.matches[matchIndex]?.right) : null,
            winner: cloneDriver(round.matches[matchIndex]?.winner),
            winnerMode: round.matches[matchIndex]?.winnerMode ?? null,
            lockedLeft: Boolean(round.matches[matchIndex]?.lockedLeft),
            lockedRight: Boolean(round.matches[matchIndex]?.lockedRight),
            nextMatchIndex: round.matches[matchIndex]?.nextMatchIndex ?? null,
            nextSlot: round.matches[matchIndex]?.nextSlot ?? null,
          };
        }),
      }));

      for (let roundIndex = 0; roundIndex < normalizedRounds.length; roundIndex += 1) {
        normalizedRounds[roundIndex].matches = normalizedRounds[roundIndex].matches.map((match, matchIndex) => {
          const left = cloneDriver(match.left);
          const right = cloneDriver(match.right);
          let winner = null;

          const isPendingLeft = pendingFeed && roundIndex === 0 && matchIndex === pendingFeed.matchIndex && pendingFeed.side === 'left';
          const isPendingRight = pendingFeed && roundIndex === 0 && matchIndex === pendingFeed.matchIndex && pendingFeed.side === 'right';

          // ONLY AUTO ADVANCE BYES IN ROUND 0
          if (roundIndex === 0) {
            if (left && !right && !isPendingRight) {
              winner = cloneDriver(left);
              return { ...match, left, right, winner, winnerMode: "auto" };
            } else if (!left && right && !isPendingLeft) {
              winner = cloneDriver(right);
              return { ...match, left, right, winner, winnerMode: "auto" };
            }
          }

          if (left && right && match.winnerMode === "manual" &&
              (participantKey(match.winner) === participantKey(left) || participantKey(match.winner) === participantKey(right))) {
            winner = cloneDriver(match.winner);
            return { ...match, left, right, winner, winnerMode: "manual" };
          }
          return { ...match, left, right, winner: null, winnerMode: null };
        });

        if (roundIndex === normalizedRounds.length - 1) continue;

        normalizedRounds[roundIndex].matches.forEach((match, matchIndex) => {
          if (!match.winner) return;
          const nextMatchIndex = match.nextMatchIndex ?? Math.floor(matchIndex / 2);
          const nextMatch = normalizedRounds[roundIndex + 1].matches[nextMatchIndex];
          const nextSlot = match.nextSlot ?? (matchIndex % 2 === 0 ? "left" : "right");
          nextMatch[nextSlot] = cloneDriver(match.winner);
        });
      }
      return normalizedRounds;
    }

    function getBracketWinner(rounds) {
      const lastRound = rounds[rounds.length - 1];
      return lastRound?.matches?.[0]?.winner ? cloneDriver(lastRound.matches[0].winner) : null;
    }

    // ==========================================
    // CLOUD SYNC & LOCAL STORAGE LOGIC
    // ==========================================
    let appDrivers = [];
    let tournamentState = null;
    let activeCompetitionBracketPage = "main";
    let judgeLaneIndex = 0;
    let qualifyingFlow = createEmptyQualifyingFlow();
    let lastBattleFlowSignature = null;
    let lastStandingsSignature = null;
    let lastPodiumSignature = null;
    let winnerAnimationState = null;
    let winnerAnimationTimer = null;
    let judgeSubmissionFeedback = null;
    let judgeSubmissionFeedbackTimer = null;
    let lastQualifyingDriverId = null;
    let currentRole = "spectator"; // 'admin', 'spectator', 'j1', 'j2', 'j3'
    let isWebsiteAdmin = false;
    let localEventPreviewMode = false;
    let pendingRouteView = null;
    let routeHandlingInProgress = false;
    let forcedHostContext = null;
    let eventDirectory = {};
    let activeEventId = null;
    let activeEventMeta = null;
    
    // Cloud Variables
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'prodigy-rc-competitions';
    const firebaseConfig = typeof __firebase_config !== 'undefined'
      ? JSON.parse(__firebase_config)
      : {
          apiKey: "AIzaSyD-Do4oY_hpAB7zYHp9OzzzfPUU63UH1Ow",
          authDomain: "prodigy-rc-competitions.firebaseapp.com",
          databaseURL: "https://prodigy-rc-competitions-default-rtdb.firebaseio.com",
          projectId: "prodigy-rc-competitions",
          storageBucket: "prodigy-rc-competitions.firebasestorage.app",
          messagingSenderId: "292850527697",
          appId: "1:292850527697:web:6b9cb5249f2716e42e44f0",
        };
    let db = null;
    let auth = null;
    let syncTimeout = null;
    let lastLocalPush = 0;
    let eventDocUnsubscribe = null;
    let directoryDocUnsubscribe = null;
    let activeEventSelectionUnsubscribe = null;

    function openingMatchesMatch(actualMatches, expectedMatches) {
      if (!Array.isArray(actualMatches) || actualMatches.length !== expectedMatches.length) {
        return false;
      }

      return actualMatches.every((match, index) =>
        participantKey(match?.left) === participantKey(expectedMatches[index]?.left)
        && participantKey(match?.right) === participantKey(expectedMatches[index]?.right)
      );
    }

    function openingMatchesMatchWithFeedAllowance(actualMatches, expectedMatches, feedTarget = null) {
      if (!Array.isArray(actualMatches) || actualMatches.length !== expectedMatches.length) {
        return false;
      }

      return actualMatches.every((match, index) => {
        const expectedMatch = expectedMatches[index];
        if (!expectedMatch) return false;

        const leftMatches = !feedTarget || index !== feedTarget.matchIndex || feedTarget.side !== "left"
          ? participantKey(match?.left) === participantKey(expectedMatch?.left)
          : true;
        const rightMatches = !feedTarget || index !== feedTarget.matchIndex || feedTarget.side !== "right"
          ? participantKey(match?.right) === participantKey(expectedMatch?.right)
          : true;

        return leftMatches && rightMatches;
      });
    }

    function shouldRebuildTournamentState(state) {
      if (!state?.mainBracket?.rounds?.length) {
        return true;
      }

      const rebuiltState = createTournamentState(
        state.qualifiedDrivers,
        normalizePreferredFormat(state.preferredFormat || FORMAT_CLASSIC),
        state.customLowerCount || 0,
      );

      if (state.mainBracket.rounds.length !== rebuiltState.mainBracket.rounds.length) {
        return true;
      }

      if (!openingMatchesMatchWithFeedAllowance(
        state.mainBracket.rounds[0]?.matches,
        rebuiltState.mainBracket.rounds[0].matches,
        rebuiltState.lowerBracket?.feedsInto || state.lowerBracket?.feedsInto || null,
      )) {
        return true;
      }

      if (Boolean(state.lowerBracket) !== Boolean(rebuiltState.lowerBracket)) {
        return true;
      }

      if (rebuiltState.lowerBracket) {
        if (!state.lowerBracket?.rounds?.length) {
          return true;
        }

        if (state.lowerBracket.rounds.length !== rebuiltState.lowerBracket.rounds.length) {
          return true;
        }

        if (!openingMatchesMatch(state.lowerBracket.rounds[0]?.matches, rebuiltState.lowerBracket.rounds[0].matches)) {
          return true;
        }
      }

      return false;
    }

    function upgradeStoredTournamentState(state) {
      if (!state || !Array.isArray(state.qualifiedDrivers) || state.qualifiedDrivers.length < 2) {
        return state;
      }

      if (state.version === APP_STATE_VERSION && !shouldRebuildTournamentState(state)) {
        return state;
      }

      return createTournamentState(
        state.qualifiedDrivers,
        normalizePreferredFormat(state.preferredFormat || FORMAT_CLASSIC),
        state.customLowerCount || 0,
      );
    }
    
    function isEventReadOnly() {
      return activeEventMeta?.status === "archived";
    }

    function userCanEdit() {
      return currentRole !== "spectator" && !isEventReadOnly();
    }

    function registrationCanEdit() {
      return currentRole === "admin" && !isEventReadOnly();
    }

    function adminCanEdit() {
      return currentRole === "admin" && !isEventReadOnly();
    }

    function cloneEventMeta(meta) {
      return meta ? JSON.parse(JSON.stringify(meta)) : null;
    }

    function extractEventMeta(payload, fallbackId = activeEventId) {
      if (!payload) return null;
      return {
        id: payload.id || fallbackId,
        name: payload.name || "Untitled Event",
        date: payload.date || "",
        status: payload.status || "active",
        judgeCount: normalizeJudgeCount(payload.judgeCount),
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: payload.updatedAt || new Date().toISOString(),
        syncStamp: payload.syncStamp || 0,
        roleNames: buildDefaultRoleNames(payload.roleNames || {}),
        venueConfig: createDefaultVenueConfig(payload.venueConfig || {}),
        pendingRegistrations: normalizePendingRegistrationList(payload.pendingRegistrations),
        latestApprovalToast: payload.latestApprovalToast || null,
        roleAccess: payload.roleAccess || {},
        results: payload.results || buildEmptyEventResults(),
      };
    }

    function getRoleDisplayName(role, eventMeta = activeEventMeta) {
      if (role === "spectator") return ROLE_LABELS.spectator;
      if (role === "admin") return eventMeta?.roleNames?.admin || ROLE_LABELS.admin;
      return eventMeta?.roleNames?.[role] || ROLE_LABELS[role] || role;
    }

    function buildEventResults() {
      const rankedDrivers = rankDrivers(appDrivers);
      const champion = tournamentState?.mainBracket ? getBracketWinner(tournamentState.mainBracket.rounds) : null;
      const finalMatch = tournamentState?.mainBracket?.rounds?.[tournamentState.mainBracket.rounds.length - 1]?.matches?.[0] || null;
      const runnerUp = getMatchLoser(finalMatch);
      const thirdPlace = tournamentState?.mainBracket?.thirdPlaceMatch?.winner || null;
      const fourthPlace = getMatchLoser(tournamentState?.mainBracket?.thirdPlaceMatch || null);
      const previousCompletedAt = activeEventMeta?.results?.completedAt || null;
      const completedAt = champion ? previousCompletedAt || new Date().toISOString() : null;
      return {
        championName: champion?.name || null,
        championSeed: champion?.seed || null,
        runnerUpName: runnerUp?.name || null,
        runnerUpSeed: runnerUp?.seed || null,
        thirdPlaceName: thirdPlace?.name || null,
        thirdPlaceSeed: thirdPlace?.seed || null,
        fourthPlaceName: fourthPlace?.name || null,
        fourthPlaceSeed: fourthPlace?.seed || null,
        qualifiedCount: tournamentState?.qualifiedDrivers?.length || 0,
        totalDrivers: rankedDrivers.length,
        planDescription: tournamentState?.plan?.description || "Waiting for qualifying scores.",
        updatedAt: new Date().toISOString(),
        completedAt,
      };
    }

    function getLegacyLocalEventState() {
      const storedDrivers = localStorage.getItem("rc-drift-drivers-v7") || localStorage.getItem("rc-drift-drivers-v6");
      const storedBracket = localStorage.getItem("rc-drift-bracket-state-v7") || localStorage.getItem("rc-drift-bracket-state-v6");
      const payload = {};
      if (storedDrivers) {
        try { payload.drivers = JSON.parse(storedDrivers); } catch (e) {}
      }
      if (storedBracket) {
        try { payload.bracket = upgradeStoredTournamentState(JSON.parse(storedBracket)); } catch (e) {}
      }
      return payload;
    }

    function readEventStateCache(eventId) {
      const cached = localStorage.getItem(getEventStateStorageKey(eventId));
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {}
      }
      if (eventId === DEFAULT_EVENT_ID) {
        return getLegacyLocalEventState();
      }
      return null;
    }

    function getQualifyingDriverQueue(drivers = appDrivers) {
      return getRegisteredDrivers(drivers);
    }

    function getQualifyingFlowPhase(flow = qualifyingFlow, drivers = appDrivers) {
      const queue = getQualifyingDriverQueue(drivers);
      if (!queue.length) return "empty";
      if (flow?.completed) return "complete";
      if (!flow?.started || !flow?.currentDriverId) return "waiting";
      return "live";
    }

    function syncQualifyingFlowState() {
      const queue = getQualifyingDriverQueue();
      const activeJudgeRoles = getActiveJudgeRoles(activeEventMeta);
      const previousCurrentId = qualifyingFlow?.currentDriverId || null;
      const previousReadyRoles = qualifyingFlow?.readyRoles || {};
      const previousStarted = Boolean(qualifyingFlow?.started);
      const previousCompleted = Boolean(qualifyingFlow?.completed);

      if (!queue.length) {
        qualifyingFlow = createEmptyQualifyingFlow();
        judgeLaneIndex = 0;
        return previousCurrentId !== null || Object.keys(previousReadyRoles).length > 0 || previousStarted || previousCompleted;
      }

      if (previousCompleted) {
        qualifyingFlow = {
          currentDriverId: null,
          readyRoles: {},
          started: true,
          completed: true,
        };
        judgeLaneIndex = Math.max(0, queue.length - 1);
        return previousCurrentId !== null || Object.keys(previousReadyRoles).length > 0 || !previousStarted || !previousCompleted;
      }

      if (!previousStarted) {
        qualifyingFlow = {
          currentDriverId: null,
          readyRoles: {},
          started: false,
          completed: false,
        };
        judgeLaneIndex = 0;
        return previousCurrentId !== null || Object.keys(previousReadyRoles).length > 0 || previousStarted || previousCompleted;
      }

      const queueIds = new Set(queue.map((driver) => driver.id));
      const currentDriverId = queueIds.has(previousCurrentId) ? previousCurrentId : queue[0].id;
      const readyRoles = {};
      activeJudgeRoles.forEach((role) => {
        if (previousReadyRoles?.[role]) readyRoles[role] = true;
      });

      qualifyingFlow = {
        currentDriverId,
        readyRoles,
        started: true,
        completed: false,
      };

      const queueIndex = queue.findIndex((driver) => driver.id === currentDriverId);
      if (queueIndex > -1) {
        judgeLaneIndex = queueIndex;
      }

      return previousCurrentId !== currentDriverId
        || JSON.stringify(previousReadyRoles) !== JSON.stringify(readyRoles)
        || !previousStarted
        || previousCompleted;
    }

    function getCurrentQualifyingDriver() {
      syncQualifyingFlowState();
      return appDrivers.find((driver) => driver.id === qualifyingFlow.currentDriverId) || null;
    }

    function clearQualifyingReady(role) {
      if (!role?.startsWith("j") || !qualifyingFlow?.readyRoles?.[role]) return false;
      const nextReadyRoles = { ...(qualifyingFlow.readyRoles || {}) };
      delete nextReadyRoles[role];
      qualifyingFlow = {
        ...qualifyingFlow,
        readyRoles: nextReadyRoles,
      };
      return true;
    }

    function advanceQualifyingDriver() {
      const queue = getQualifyingDriverQueue();
      if (!queue.length) {
        qualifyingFlow = createEmptyQualifyingFlow();
        return;
      }

      const currentIndex = Math.max(0, queue.findIndex((driver) => driver.id === qualifyingFlow.currentDriverId));
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        qualifyingFlow = {
          currentDriverId: null,
          readyRoles: {},
          started: true,
          completed: true,
        };
        judgeLaneIndex = Math.max(0, queue.length - 1);
        return;
      }
      qualifyingFlow = {
        currentDriverId: queue[nextIndex]?.id || null,
        readyRoles: {},
        started: true,
        completed: false,
      };
      judgeLaneIndex = nextIndex;
    }

    function startQualifyingFlow() {
      const queue = getQualifyingDriverQueue();
      if (!queue.length) return false;
      if (activeEventMeta) {
        activeEventMeta = {
          ...activeEventMeta,
          venueConfig: {
            ...getVenueConfig(),
            enabled: false,
          },
        };
        eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      }
      qualifyingFlow = {
        currentDriverId: queue[0]?.id || null,
        readyRoles: {},
        started: true,
        completed: false,
      };
      judgeLaneIndex = 0;
      return true;
    }

    function markQualifyingRoleReady(role) {
      if (!role?.startsWith("j")) return false;
      syncQualifyingFlowState();
      qualifyingFlow = {
        ...qualifyingFlow,
        readyRoles: {
          ...(qualifyingFlow.readyRoles || {}),
          [role]: true,
        },
      };

      const activeJudgeRoles = getActiveJudgeRoles(activeEventMeta);
      const allReady = activeJudgeRoles.length > 0 && activeJudgeRoles.every((judgeRole) => qualifyingFlow.readyRoles?.[judgeRole]);
      if (allReady) {
        advanceQualifyingDriver();
      }
      return true;
    }

    function saveEventStateCache() {
      if (!activeEventId || !activeEventMeta) return;
      syncQualifyingFlowState();
      localStorage.setItem(getEventStateStorageKey(activeEventId), JSON.stringify({
        drivers: appDrivers,
        bracket: tournamentState,
        qualifyingFlow,
        formatMode: bracketModeSelect.value,
        lowerCount: String(getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0),
        meta: activeEventMeta,
      }));

      if (activeEventId === DEFAULT_EVENT_ID) {
        localStorage.setItem("rc-drift-drivers-v7", JSON.stringify(appDrivers));
        localStorage.removeItem("rc-drift-drivers-v6");
        if (tournamentState) {
          localStorage.setItem("rc-drift-bracket-state-v7", JSON.stringify(tournamentState));
          localStorage.removeItem("rc-drift-bracket-state-v6");
        }
      }
    }

    function saveDirectoryCache() {
      localStorage.setItem(EVENT_DIRECTORY_STORAGE_KEY, JSON.stringify(eventDirectory));
      if (activeEventId) {
        localStorage.setItem(ACTIVE_EVENT_STORAGE_KEY, activeEventId);
      }
    }

    function readRoleSessionMap() {
      const raw = sessionStorage.getItem(EVENT_ROLE_SESSION_KEY) || localStorage.getItem(EVENT_ROLE_PERSIST_KEY);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function writeRoleSessionMap(nextMap) {
      sessionStorage.setItem(EVENT_ROLE_SESSION_KEY, JSON.stringify(nextMap));
      localStorage.setItem(EVENT_ROLE_PERSIST_KEY, JSON.stringify(nextMap));
    }

    function readRoleUnlockMap() {
      const raw = localStorage.getItem(EVENT_ROLE_UNLOCK_KEY);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    function writeRoleUnlockMap(nextMap) {
      localStorage.setItem(EVENT_ROLE_UNLOCK_KEY, JSON.stringify(nextMap));
    }

    function saveBracketPagePreference(eventId, page) {
      if (!eventId || !page) return;
      try {
        const raw = localStorage.getItem(`rc-drift-bracket-page-v${EVENT_STORAGE_VERSION}`);
        const parsed = raw ? JSON.parse(raw) : {};
        const nextMap = parsed && typeof parsed === "object" ? parsed : {};
        nextMap[eventId] = page;
        localStorage.setItem(`rc-drift-bracket-page-v${EVENT_STORAGE_VERSION}`, JSON.stringify(nextMap));
      } catch (error) {
        console.warn("Bracket page preference save failed:", error);
      }
    }

    function getSavedRoleForEvent(eventId) {
      if (!eventId) return "spectator";
      const role = readRoleSessionMap()[eventId];
      return typeof role === "string" ? role : "spectator";
    }

    function saveRoleForEvent(eventId, role) {
      if (!eventId) return;
      const sessionMap = readRoleSessionMap();
      if (!role || role === "spectator") {
        delete sessionMap[eventId];
      } else {
        sessionMap[eventId] = role;
      }
      writeRoleSessionMap(sessionMap);
    }

    function isRoleUnlockedForEvent(eventId, role) {
      if (!eventId || !role || role === "spectator") return false;
      const unlockMap = readRoleUnlockMap();
      return Boolean(unlockMap?.[eventId]?.[role]);
    }

    function canApplyRoleForEvent(eventId, role, eventMeta = activeEventMeta) {
      if (!role || role === "spectator") return true;
      if (!isRoleAvailableForEvent(role, eventMeta)) return false;
      if (role?.startsWith("j") && isJudgeAccessLocked(eventMeta)) return false;
      return isRoleUnlockedForEvent(eventId, role);
    }

    function setRoleUnlockedForEvent(eventId, role, unlocked) {
      if (!eventId || !role || role === "spectator") return;
      const unlockMap = readRoleUnlockMap();
      const eventUnlocks = { ...(unlockMap[eventId] || {}) };
      if (unlocked) {
        eventUnlocks[role] = true;
        unlockMap[eventId] = eventUnlocks;
      } else {
        delete eventUnlocks[role];
        if (Object.keys(eventUnlocks).length) {
          unlockMap[eventId] = eventUnlocks;
        } else {
          delete unlockMap[eventId];
        }
      }
      writeRoleUnlockMap(unlockMap);
    }

    async function initLocalState() {
      localStorage.removeItem(WEBSITE_ADMIN_STORAGE_KEY);
      isWebsiteAdmin = sessionStorage.getItem(WEBSITE_ADMIN_STORAGE_KEY) === "true";
      const storedDirectory = localStorage.getItem(EVENT_DIRECTORY_STORAGE_KEY);
      if (storedDirectory) {
        try { eventDirectory = JSON.parse(storedDirectory) || {}; } catch (e) {}
      }

      if (!Object.keys(eventDirectory).length) {
        eventDirectory[DEFAULT_EVENT_ID] = await createLegacySeedEventRecord();
      }

      activeEventId = localStorage.getItem(ACTIVE_EVENT_STORAGE_KEY) || Object.keys(eventDirectory)[0];
      if (!eventDirectory[activeEventId]) {
        activeEventId = Object.keys(eventDirectory)[0];
      }

      activeEventMeta = cloneEventMeta(eventDirectory[activeEventId]);

      const cachedState = readEventStateCache(activeEventId) || {};
      appDrivers = Array.isArray(cachedState.drivers) && cachedState.drivers.length ? sanitizeLoadedDrivers(cachedState.drivers) : createDriverSet();
      tournamentState = cachedState.bracket ? upgradeStoredTournamentState(cachedState.bracket) : null;
      qualifyingFlow = cachedState.qualifyingFlow || createEmptyQualifyingFlow();
      syncQualifyingFlowState();
      bracketModeSelect.value = normalizePreferredFormat(cachedState.formatMode || FORMAT_CLASSIC);
      lowerCountInput.value = cachedState.lowerCount || "0";
      lowerCountContainer.style.display = "none";
      currentRole = getSavedRoleForEvent(activeEventId);
      const roleLockedForEvent = currentRole?.startsWith("j") && isJudgeAccessLocked(activeEventMeta);
      if (!isRoleAvailableForEvent(currentRole, activeEventMeta) || roleLockedForEvent || (currentRole !== "spectator" && !isRoleUnlockedForEvent(activeEventId, currentRole))) {
        currentRole = "spectator";
      }
      document.body.dataset.role = currentRole;
      saveDirectoryCache();
      saveEventStateCache();
    }

    function applyRemoteEventState(data) {
      if (!data) return;
      const localJudgeDrafts = captureJudgeDraftScores(currentRole);
      const nextDrivers = Array.isArray(data.drivers) && data.drivers.length ? sanitizeLoadedDrivers(data.drivers) : createDriverSet();
      appDrivers = restoreJudgeDraftScores(nextDrivers, currentRole, localJudgeDrafts);
      tournamentState = data.bracket ? upgradeStoredTournamentState(data.bracket) : null;
      qualifyingFlow = data.qualifyingFlow || createEmptyQualifyingFlow();
      syncQualifyingFlowState();
      bracketModeSelect.value = normalizePreferredFormat(data.formatMode || FORMAT_CLASSIC);
      lowerCountInput.value = data.lowerCount || "0";
      lowerCountContainer.style.display = "none";
      activeEventMeta = extractEventMeta(data, activeEventId);
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      saveDirectoryCache();
      saveEventStateCache();
      renderRoleAdminPanel();
    }

    let deferredInteractiveRenderPending = false;
    let judgeSubmissionInFlight = false;

    function isJudgeEditingScoreInput() {
      if (!currentRole?.startsWith("j")) return false;
      if (judgeSubmissionInFlight) return false;
      const activeEl = document.activeElement;
      return Boolean(activeEl && activeEl.classList?.contains("score-input"));
    }

    function renderAfterRemoteSync() {
      renderEventDirectory();
      renderRoleAdminPanel();
      if (currentRole.startsWith("j") && isJudgeAccessLocked()) {
        deferredInteractiveRenderPending = false;
        applyRoleChange("spectator");
        switchView("qualifying");
        return;
      }
      if (isJudgeEditingScoreInput()) {
        deferredInteractiveRenderPending = true;
        return;
      }
      deferredInteractiveRenderPending = false;
      renderDriversTable();
      renderSimulationView();
      if (document.getElementById('view-bracket').classList.contains('is-active')) {
        renderBracket();
      }
    }

    function getDirectoryDocRef() {
      return doc(db, 'artifacts', appId, 'public', 'data', 'meta', 'eventDirectory');
    }

    function getEventDocRef(eventId) {
      return doc(db, 'artifacts', appId, 'public', 'data', 'events', eventId);
    }

    function getActiveEventSelectionDocRef() {
      return doc(db, 'artifacts', appId, 'public', 'data', 'meta', 'activeEventSelection');
    }

    function loadActiveEventStateFromCache() {
      if (!activeEventId || !eventDirectory[activeEventId]) return;
      activeEventMeta = cloneEventMeta(eventDirectory[activeEventId]);
      const cachedState = readEventStateCache(activeEventId) || {};
      appDrivers = Array.isArray(cachedState.drivers) && cachedState.drivers.length ? sanitizeLoadedDrivers(cachedState.drivers) : createDriverSet();
      tournamentState = cachedState.bracket ? upgradeStoredTournamentState(cachedState.bracket) : null;
      qualifyingFlow = cachedState.qualifyingFlow || createEmptyQualifyingFlow();
      syncQualifyingFlowState();
      bracketModeSelect.value = normalizePreferredFormat(cachedState.formatMode || FORMAT_CLASSIC);
      lowerCountInput.value = cachedState.lowerCount || "0";
      lowerCountContainer.style.display = "none";
    }

    function publishActiveEventSelection() {
      if (!db || !activeEventId) return;
      lastLocalPush = Date.now();
      saveDirectoryCache();
      const activeEventPayload = {
        activeEventId,
        eventMeta: cloneEventMeta(eventDirectory[activeEventId] || activeEventMeta),
        syncStamp: lastLocalPush,
      };
      Promise.all([
        setDoc(getActiveEventSelectionDocRef(), activeEventPayload, { merge: true }),
        setDoc(getDirectoryDocRef(), {
          events: eventDirectory,
          activeEventId,
          syncStamp: lastLocalPush,
        }),
      ]).catch((error) => {
        console.error("Active event sync failed:", error);
      });
    }

    function resolveRoleForActiveEventSwitch(nextActiveEventId, preferredRole = currentRole) {
      const nextMeta = eventDirectory[nextActiveEventId];
      if (!nextMeta) return "spectator";
      const nextJudgeAccessLocked = isJudgeAccessLocked(nextMeta);
      const preferredRoleBlocked = preferredRole?.startsWith("j") ? nextJudgeAccessLocked : false;
      if (preferredRole && preferredRole !== "spectator" && isRoleAvailableForEvent(preferredRole, nextMeta) && !preferredRoleBlocked && isRoleUnlockedForEvent(nextActiveEventId, preferredRole)) {
        return preferredRole;
      }
      const savedRole = getSavedRoleForEvent(nextActiveEventId);
      const savedRoleBlocked = savedRole?.startsWith("j") ? nextJudgeAccessLocked : false;
      if (savedRole && savedRole !== "spectator" && isRoleAvailableForEvent(savedRole, nextMeta) && !savedRoleBlocked && isRoleUnlockedForEvent(nextActiveEventId, savedRole)) {
        return savedRole;
      }
      return "spectator";
    }

    function adoptActiveEvent(nextActiveEventId, preferredRole = currentRole) {
      if (!nextActiveEventId || !eventDirectory[nextActiveEventId]) return false;
      const activeEventChanged = nextActiveEventId !== activeEventId;
      activeEventId = nextActiveEventId;
      loadActiveEventStateFromCache();
      applyRoleChange(resolveRoleForActiveEventSwitch(nextActiveEventId, preferredRole));
      saveDirectoryCache();
      if (activeEventChanged) {
        judgeLaneIndex = 0;
        switchView("qualifying");
        subscribeToActiveEvent();
      }
      return activeEventChanged;
    }

    function applyDirectorySnapshotData(data) {
      if (!data) return false;
      eventDirectory = data.events || eventDirectory;
      const shouldFollowSharedActiveEvent = data.activeEventId
        && eventDirectory[data.activeEventId]
        && currentRole !== "admin"
        && !localEventPreviewMode
        && data.activeEventId !== activeEventId;
      if (shouldFollowSharedActiveEvent) {
        adoptActiveEvent(data.activeEventId, currentRole);
      } else if (!activeEventId || !eventDirectory[activeEventId]) {
        const fallbackId = data.activeEventId && eventDirectory[data.activeEventId]
          ? data.activeEventId
          : Object.keys(eventDirectory)[0] || null;
        if (fallbackId) {
          adoptActiveEvent(fallbackId, currentRole);
        }
      } else {
        activeEventMeta = cloneEventMeta(eventDirectory[activeEventId]);
      }
      saveDirectoryCache();
      renderAfterRemoteSync();
      return false;
    }

    function applyActiveEventSelectionData(data) {
      if (!data?.activeEventId) return false;
      const nextActiveEventId = data.activeEventId;
      if (data.eventMeta) {
        eventDirectory[nextActiveEventId] = cloneEventMeta(data.eventMeta);
      }
      if (localEventPreviewMode && activeEventId && eventDirectory[activeEventId] && nextActiveEventId !== activeEventId) {
        renderAfterRemoteSync();
        return false;
      }
      const activeEventChanged = adoptActiveEvent(nextActiveEventId, currentRole);
      renderAfterRemoteSync();
      return activeEventChanged;
    }

    function subscribeToActiveEvent() {
      if (!db || !auth?.currentUser || !activeEventId) return;
      if (eventDocUnsubscribe) eventDocUnsubscribe();

      const eventDoc = getEventDocRef(activeEventId);
      const subscribedEventId = activeEventId;
      eventDocUnsubscribe = onSnapshot(eventDoc, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (subscribedEventId !== activeEventId) return;
        applyRemoteEventState(data);
        renderAfterRemoteSync();
      }, (error) => {
        const statusEl = document.getElementById('syncStatus');
        statusEl.textContent = "Sync Error";
        statusEl.classList.remove("online");
        console.error(error);
      });
      getDoc(eventDoc).then((snap) => {
        if (!snap.exists()) return;
        if (subscribedEventId !== activeEventId) return;
        applyRemoteEventState(snap.data());
        renderAfterRemoteSync();
      }).catch((error) => {
        console.error("Event refresh failed:", error);
      });
    }

    function publishState() {
      if (!activeEventId || !activeEventMeta) return;
      syncQualifyingFlowState();

      const updatedAt = new Date().toISOString();
      activeEventMeta = {
        ...activeEventMeta,
        updatedAt,
        results: buildEventResults(),
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);

      saveDirectoryCache();
      saveEventStateCache();

      if (!db) return;
      lastLocalPush = Date.now();
      activeEventMeta.syncStamp = lastLocalPush;
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      saveDirectoryCache();

      const publishEventId = activeEventId;
      const publishEventMeta = cloneEventMeta(activeEventMeta);
      const publishDrivers = JSON.parse(JSON.stringify(appDrivers));
      const publishBracket = tournamentState ? JSON.parse(JSON.stringify(tournamentState)) : null;
      const publishQualifyingFlow = JSON.parse(JSON.stringify(qualifyingFlow));
      const publishFormatMode = bracketModeSelect.value;
      const publishLowerCount = String(getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0);
      const publishDirectory = JSON.parse(JSON.stringify(eventDirectory));
      const publishSyncStamp = lastLocalPush;

      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(async () => {
        try {
          await Promise.all([
            setDoc(getEventDocRef(publishEventId), {
              ...publishEventMeta,
              drivers: publishDrivers,
              bracket: publishBracket,
              qualifyingFlow: publishQualifyingFlow,
              formatMode: publishFormatMode,
              lowerCount: publishLowerCount,
              syncStamp: publishSyncStamp,
            }),
            setDoc(getDirectoryDocRef(), {
              events: publishDirectory,
              activeEventId: publishEventId,
              syncStamp: publishSyncStamp,
            }),
          ]);
        } catch (e) {
          console.error("Cloud sync failed:", e);
        }
      }, 800);
    }

    async function publishStateImmediately() {
      if (!activeEventId || !activeEventMeta) return;
      syncQualifyingFlowState();

      clearTimeout(syncTimeout);

      const updatedAt = new Date().toISOString();
      activeEventMeta = {
        ...activeEventMeta,
        updatedAt,
        results: buildEventResults(),
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);

      saveDirectoryCache();
      saveEventStateCache();

      if (!db) return;
      lastLocalPush = Date.now();
      activeEventMeta.syncStamp = lastLocalPush;
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      saveDirectoryCache();

      try {
        await Promise.all([
          setDoc(getEventDocRef(activeEventId), {
            ...activeEventMeta,
            drivers: appDrivers,
            bracket: tournamentState,
            qualifyingFlow,
            formatMode: bracketModeSelect.value,
            lowerCount: String(getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0),
            syncStamp: lastLocalPush,
          }),
          setDoc(getDirectoryDocRef(), {
            events: eventDirectory,
            activeEventId,
            syncStamp: lastLocalPush,
          }),
          setDoc(getActiveEventSelectionDocRef(), {
            activeEventId,
            eventMeta: cloneEventMeta(eventDirectory[activeEventId] || activeEventMeta),
            syncStamp: lastLocalPush,
          }, { merge: true }),
        ]);
      } catch (e) {
        console.error("Immediate cloud sync failed:", e);
      }
    }

    function setupCloudSync(user) {
      if (!db || !user) return;
      const statusEl = document.getElementById('syncStatus');
      if (STANDALONE_DEMO_MODE) {
        statusEl.textContent = "Demo Window";
        statusEl.classList.remove("online");
        return;
      }
      statusEl.textContent = "Sync Online";
      statusEl.classList.add("online");

      if (directoryDocUnsubscribe) directoryDocUnsubscribe();
      directoryDocUnsubscribe = onSnapshot(getDirectoryDocRef(), (snap) => {
        if (!snap.exists()) return;
        applyDirectorySnapshotData(snap.data());
      }, (error) => {
        statusEl.textContent = "Sync Error";
        statusEl.classList.remove("online");
        console.error(error);
      });

      getDoc(getDirectoryDocRef()).then((snap) => {
        if (!snap.exists()) return;
        applyDirectorySnapshotData(snap.data());
      }).catch((error) => {
        console.error("Directory refresh failed:", error);
      });

      if (activeEventSelectionUnsubscribe) activeEventSelectionUnsubscribe();
      activeEventSelectionUnsubscribe = onSnapshot(getActiveEventSelectionDocRef(), (snap) => {
        if (!snap.exists()) return;
        applyActiveEventSelectionData(snap.data());
      }, (error) => {
        statusEl.textContent = "Sync Error";
        statusEl.classList.remove("online");
        console.error(error);
      });

      getDoc(getActiveEventSelectionDocRef()).then((snap) => {
        if (!snap.exists()) return;
        applyActiveEventSelectionData(snap.data());
      }).catch((error) => {
        console.error("Active event refresh failed:", error);
      });

      subscribeToActiveEvent();
    }

    // Initialize Database if available
    if (firebaseConfig) {
      const app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);

      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      };
      
      initAuth().then(() => {
        onAuthStateChanged(auth, (user) => {
          if (user) setupCloudSync(user);
        });
      });
    }

    // ==========================================
    // UI RENDERING & EVENTS
    // ==========================================
    const eventSelect = document.getElementById("eventSelect");
    const newEventBtn = document.getElementById("newEventBtn");
    const buildLabel = document.getElementById("buildLabel");
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const websiteAdminBtn = document.getElementById("websiteAdminBtn");
    const globalRoleSelect = document.getElementById("globalRoleSelect");
    const registrationHeroEventName = document.getElementById("registrationHeroEventName");
    const registrationHeroEventDate = document.getElementById("registrationHeroEventDate");
    const registrationDriverCount = document.getElementById("registrationDriverCount");
    const registrationAdminAlerts = document.getElementById("registrationAdminAlerts");
    const registrationDraftRegLabel = document.getElementById("registrationDraftRegLabel");
    const registrationEntryForm = document.getElementById("registrationEntryForm");
    const registrationDraftName = document.getElementById("registrationDraftName");
    const registrationDraftTeam = document.getElementById("registrationDraftTeam");
    const registrationDraftChassis = document.getElementById("registrationDraftChassis");
    const registrationForms = document.getElementById("registrationForms");
    const registrationAddDriverBtn = document.getElementById("registrationAddDriverBtn");
    const registrationAddDriverSecondaryBtn = document.getElementById("registrationAddDriverSecondaryBtn");
    const registrationToQualifyingBtn = document.getElementById("registrationToQualifyingBtn");
    const pendingRegistrationForms = document.getElementById("pendingRegistrationForms");
    const pendingRegistrationCount = document.getElementById("pendingRegistrationCount");
    const venueEnabledSelect = document.getElementById("venueEnabledSelect");
    const venueLabelInput = document.getElementById("venueLabelInput");
    const venueLatitudeInput = document.getElementById("venueLatitudeInput");
    const venueLongitudeInput = document.getElementById("venueLongitudeInput");
    const venueRadiusInput = document.getElementById("venueRadiusInput");
    const venueCloseAtInput = document.getElementById("venueCloseAtInput");
    const saveVenueConfigBtn = document.getElementById("saveVenueConfigBtn");
    const venueConfigStatus = document.getElementById("venueConfigStatus");
    const selfRegisterQrImage = document.getElementById("selfRegisterQrImage");
    const selfRegisterQrLabel = document.getElementById("selfRegisterQrLabel");
    const selfRegisterPublicLink = document.getElementById("selfRegisterPublicLink");
    const copySelfRegisterLinkBtn = document.getElementById("copySelfRegisterLinkBtn");
    const openSelfRegisterDisplayBtn = document.getElementById("openSelfRegisterDisplayBtn");
    const selfRegisterForm = document.getElementById("selfRegisterForm");
    const selfRegisterName = document.getElementById("selfRegisterName");
    const selfRegisterTeam = document.getElementById("selfRegisterTeam");
    const selfRegisterChassis = document.getElementById("selfRegisterChassis");
    const selfRegisterSavedProfileSelect = document.getElementById("selfRegisterSavedProfileSelect");
    const useSavedSelfRegisterProfileBtn = document.getElementById("useSavedSelfRegisterProfileBtn");
    const saveCurrentSelfRegisterProfileBtn = document.getElementById("saveCurrentSelfRegisterProfileBtn");
    const clearSavedSelfRegisterProfileBtn = document.getElementById("clearSavedSelfRegisterProfileBtn");
    const deleteSavedSelfRegisterProfileBtn = document.getElementById("deleteSavedSelfRegisterProfileBtn");
    const selfRegisterSavedProfileNote = document.getElementById("selfRegisterSavedProfileNote");
    const selfRegisterLocateBtn = document.getElementById("selfRegisterLocateBtn");
    const selfRegisterSubmitBtn = document.getElementById("selfRegisterSubmitBtn");
    const selfRegisterStatus = document.getElementById("selfRegisterStatus");
    const selfRegisterStatusCopy = document.getElementById("selfRegisterStatusCopy");
    const selfRegisterFormNote = document.getElementById("selfRegisterFormNote");
    const selfRegisterVenueMeta = document.getElementById("selfRegisterVenueMeta");
    const selfRegisterDriverCount = document.getElementById("selfRegisterDriverCount");
    const selfRegisterDisplayQrImage = document.getElementById("selfRegisterDisplayQrImage");
    const selfRegisterDisplayTitle = document.getElementById("selfRegisterDisplayTitle");
    const selfRegisterDisplayCopy = document.getElementById("selfRegisterDisplayCopy");
    const selfRegisterDisplayLink = document.getElementById("selfRegisterDisplayLink");
    const toggleSelfRegisterDisplayFullscreenBtn = document.getElementById("toggleSelfRegisterDisplayFullscreenBtn");
    const closeSelfRegisterDisplayBtn = document.getElementById("closeSelfRegisterDisplayBtn");
    const approvalToast = document.getElementById("approvalToast");
    const approvalToastTitle = document.getElementById("approvalToastTitle");
    const approvalToastCopy = document.getElementById("approvalToastCopy");
    const spectatorSimulationGrid = document.getElementById("spectatorSimulationGrid");
    const spectatorSimulationSummary = document.getElementById("spectatorSimulationSummary");
    const spectatorSimulationEventTitle = document.getElementById("spectatorSimulationEventTitle");
    const openStandaloneDemoWindowBtn = document.getElementById("openStandaloneDemoWindowBtn");
    const qualifyingLivePanel = document.getElementById("qualifyingLivePanel");
    const startQualifyingBtn = document.getElementById("startQualifyingBtn");
    const resultsEventList = document.getElementById("resultsEventList");
    const broadcastTicker = document.getElementById("broadcastTicker");
    const broadcastTickerTrack = document.getElementById("broadcastTickerTrack");
    const websiteAdminCurrentEventName = document.getElementById("websiteAdminCurrentEventName");
    const websiteAdminCurrentEventDate = document.getElementById("websiteAdminCurrentEventDate");
    const websiteAdminJudgeCount = document.getElementById("websiteAdminJudgeCount");
    const websiteAdminAccessStatus = document.getElementById("websiteAdminAccessStatus");
    const websiteAdminEventList = document.getElementById("websiteAdminEventList");
    const websiteAdminNewEventBtn = document.getElementById("websiteAdminNewEventBtn");
    const websiteAdminBackBtn = document.getElementById("websiteAdminBackBtn");
    const websiteAdminSignOutBtn = document.getElementById("websiteAdminSignOutBtn");
    const qualifyingPanelTitle = document.getElementById("qualifyingPanelTitle");
    const driversTableBody = document.getElementById("driversTableBody");
    const driversTableWrap = document.getElementById("driversTableWrap");
    const mobileDriversList = document.getElementById("mobileDriversList");
    const loadSampleBtn = document.getElementById("loadSampleBtn");
    const fullscreenQualifyingBtn = document.getElementById("fullscreenQualifyingBtn");
    const openBracketBtn = document.getElementById("openBracketBtn");
    const resultsExportPdfBtn = document.getElementById("resultsExportPdfBtn");
    const searchInput = document.getElementById("searchInput");
    const bracketModeSelect = document.getElementById("bracketModeSelect");
    const lowerCountContainer = document.getElementById("lowerCountContainer");
    const formatCountLabel = document.getElementById("formatCountLabel");
    const lowerCountInput = document.getElementById("lowerCountInput");
    const launchWarning = document.getElementById("launchWarning");
    const topQualifierTiePanel = document.getElementById("topQualifierTiePanel");
    const fullscreenBracketBtn = document.getElementById("fullscreenBracketBtn");
    const heroEventName = document.getElementById("heroEventName");
    const heroEventDate = document.getElementById("heroEventDate");
    const currentEventStatus = document.getElementById("currentEventStatus");
    const eventArchiveList = document.getElementById("eventArchiveList");
    const roleAdminPanel = document.getElementById("roleAdminPanel");
    let registrationDraft = {
      name: "",
      teamName: "",
      chassis: "",
    };
    let selfRegistrationDraft = loadSavedSelfRegisterProfile();
    let selfRegistrationState = {
      status: "idle",
      copy: "Allow location access and verify you are at the venue to unlock the registration form.",
      unlocked: false,
      lastDistanceMeters: null,
    };
    let lastShownApprovalToastId = null;
    let approvalToastDismissTimer = null;
    
    let pendingRole = null;
    let pendingAuthMode = "login";
    let passwordSubmitInFlight = false;
    const passwordModal = document.getElementById("passwordModal");
    const passwordInput = document.getElementById("passwordInput");
    const passwordModalCopy = document.getElementById("passwordModalCopy");
    const passwordError = document.getElementById("passwordError");
    const authInviteGroup = document.getElementById("authInviteGroup");
    const authInviteInput = document.getElementById("authInviteInput");
    const authConfirmInput = document.getElementById("authConfirmInput");
    const passwordHelperText = document.getElementById("passwordHelperText");
    const passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
    const passwordCancelBtn = document.getElementById("passwordCancelBtn");
    const createEventModal = document.getElementById("createEventModal");
    const eventNameInput = document.getElementById("eventNameInput");
    const eventDateInput = document.getElementById("eventDateInput");
    const judgeCountInput = document.getElementById("judgeCountInput");
    const adminInviteInput = document.getElementById("adminInviteInput");
    const judge1NameInput = document.getElementById("judge1NameInput");
    const judge1InviteInput = document.getElementById("judge1InviteInput");
    const judge2NameInput = document.getElementById("judge2NameInput");
    const judge2InviteInput = document.getElementById("judge2InviteInput");
    const judge3NameInput = document.getElementById("judge3NameInput");
    const judge3InviteInput = document.getElementById("judge3InviteInput");
    const createEventError = document.getElementById("createEventError");
    const createEventSubmitBtn = document.getElementById("createEventSubmitBtn");
    const heroJudgeSystem = document.getElementById("heroJudgeSystem");
    const createEventCancelBtn = document.getElementById("createEventCancelBtn");
    const websiteAdminModal = document.getElementById("websiteAdminModal");
    const websiteAdminModalTitle = document.getElementById("websiteAdminModalTitle");
    const websiteAdminModalCopy = document.getElementById("websiteAdminModalCopy");
    const websiteAdminPasswordInput = document.getElementById("websiteAdminPasswordInput");
    const websiteAdminError = document.getElementById("websiteAdminError");
    const websiteAdminCancelBtn = document.getElementById("websiteAdminCancelBtn");
    const websiteAdminSubmitBtn = document.getElementById("websiteAdminSubmitBtn");
    const pdfPreviewModal = document.getElementById("pdfPreviewModal");
    const pdfPreviewCopy = document.getElementById("pdfPreviewCopy");
    const pdfPreviewFrame = document.getElementById("pdfPreviewFrame");
    const pdfPreviewDownloadLink = document.getElementById("pdfPreviewDownloadLink");
    const pdfPreviewOpenLink = document.getElementById("pdfPreviewOpenLink");
    const pdfPreviewCloseBtn = document.getElementById("pdfPreviewCloseBtn");
    const createEventInviteFields = [
      adminInviteInput?.closest(".modal-field"),
      judge1InviteInput?.closest(".modal-field"),
      judge2InviteInput?.closest(".modal-field"),
      judge3InviteInput?.closest(".modal-field"),
    ].filter(Boolean);
    let pdfPreviewUrl = "";
    let resultsPdfLogoDataUrlPromise = null;
    let websiteAdminTapCount = 0;
    let websiteAdminTapResetTimer = null;

    function applyTheme(theme = "light") {
      const normalizedTheme = theme === "dark" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
      syncThemeState();
    }

    function isJudgeThemeLocked() {
      return typeof currentRole === "string" && currentRole.startsWith("j");
    }

    function syncWebsiteAdminButtonVisibility() {
      if (!websiteAdminBtn) return;
      if (forcedHostContext) {
        const shouldShowForced = forcedHostContext.kind === "website-admin";
        websiteAdminBtn.classList.toggle("hidden", !shouldShowForced);
        websiteAdminBtn.textContent = "Website Admin";
        websiteAdminBtn.classList.remove("button-accent");
        return;
      }
      const shouldShow = isWebsiteAdmin || currentRole === "admin";
      websiteAdminBtn.classList.toggle("hidden", !shouldShow);
      websiteAdminBtn.textContent = isWebsiteAdmin ? "Website Admin Panel" : "Website Admin";
      websiteAdminBtn.classList.toggle("button-accent", isWebsiteAdmin);
    }

    function syncThemeState() {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const preferredTheme = storedTheme === "dark" ? "dark" : "light";
      const effectiveTheme = isJudgeThemeLocked() ? "light" : preferredTheme;
      document.body.dataset.theme = effectiveTheme;
      if (themeToggleBtn) {
        themeToggleBtn.textContent = preferredTheme === "dark" ? "Light Mode" : "Dark Mode";
        themeToggleBtn.setAttribute("aria-pressed", preferredTheme === "dark" ? "true" : "false");
        themeToggleBtn.classList.toggle("hidden", isJudgeThemeLocked());
        themeToggleBtn.disabled = isJudgeThemeLocked();
      }
      syncWebsiteAdminButtonVisibility();
    }

    function initializeTheme() {
      syncThemeState();
    }

    if (buildLabel) {
      buildLabel.textContent = APP_BUILD_LABEL;
      buildLabel.setAttribute("title", APP_BUILD_LABEL);
    }

    function getRoleAccess(role) {
      return activeEventMeta?.roleAccess?.[role] || null;
    }

    function setWebsiteAdminAccess(enabled) {
      isWebsiteAdmin = Boolean(enabled);
      document.body.dataset.siteAdmin = String(isWebsiteAdmin);
      syncWebsiteAdminButtonVisibility();
      if (isWebsiteAdmin) {
        sessionStorage.setItem(WEBSITE_ADMIN_STORAGE_KEY, "true");
      } else {
        sessionStorage.removeItem(WEBSITE_ADMIN_STORAGE_KEY);
        localStorage.removeItem(WEBSITE_ADMIN_STORAGE_KEY);
        if (document.getElementById("view-website-admin").classList.contains("is-active")) {
          switchView("registration");
        }
      }
      updateEventChrome();
      renderEventDirectory();
      renderRoleAdminPanel();
    }

    function openModal(modalEl, focusEl = null) {
      if (!modalEl) return;
      modalEl.classList.remove("hidden");
      modalEl.style.display = "flex";
      modalEl.setAttribute("aria-hidden", "false");
      if (focusEl) {
        setTimeout(() => focusEl.focus(), 0);
      }
    }

    function closeModal(modalEl) {
      if (!modalEl) return;
      modalEl.classList.add("hidden");
      modalEl.style.removeProperty("display");
      modalEl.setAttribute("aria-hidden", "true");
    }

    function cleanupPdfPreview() {
      if (pdfPreviewFrame) pdfPreviewFrame.src = "about:blank";
      if (pdfPreviewDownloadLink) pdfPreviewDownloadLink.removeAttribute("href");
      if (pdfPreviewOpenLink) pdfPreviewOpenLink.removeAttribute("href");
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
        pdfPreviewUrl = "";
      }
    }

    function showPdfPreview(blob, fileName, message = "") {
      if (!blob || !pdfPreviewModal) return false;
      cleanupPdfPreview();
      pdfPreviewUrl = URL.createObjectURL(blob);
      if (pdfPreviewFrame) pdfPreviewFrame.src = pdfPreviewUrl;
      if (pdfPreviewDownloadLink) {
        pdfPreviewDownloadLink.href = pdfPreviewUrl;
        pdfPreviewDownloadLink.download = fileName;
      }
      if (pdfPreviewOpenLink) pdfPreviewOpenLink.href = pdfPreviewUrl;
      if (pdfPreviewCopy) {
        pdfPreviewCopy.textContent = message || "Your browser can open the generated PDF here even if it does not auto-download it.";
      }
      openModal(pdfPreviewModal);
      return true;
    }

    function hidePdfPreview() {
      closeModal(pdfPreviewModal);
      setTimeout(cleanupPdfPreview, 120);
    }

    function prefersPdfPreviewModal() {
      if (typeof navigator === "undefined") return false;
      const ua = navigator.userAgent || "";
      const platform = navigator.platform || "";
      const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
      return /iPhone|iPad|iPod/i.test(ua) || touchMac;
    }

    function startDirectBlobDownload(blob, fileName) {
      try {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = fileName;
        anchor.rel = "noopener";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
        return true;
      } catch (error) {
        console.warn("Direct PDF download attempt failed", error);
        return false;
      }
    }

    function showWebsiteAdminModal() {
      websiteAdminModalTitle.textContent = "Website Admin";
      websiteAdminModalCopy.textContent = "Enter the website admin password to manage event creation and invite access.";
      websiteAdminPasswordInput.value = "";
      websiteAdminError.style.display = "none";
      openModal(websiteAdminModal, websiteAdminPasswordInput);
    }

    function hideWebsiteAdminModal() {
      closeModal(websiteAdminModal);
      websiteAdminPasswordInput.value = "";
      websiteAdminError.style.display = "none";
      syncRouteWithState();
    }

    function openWebsiteAdminAccess() {
      if (forcedHostContext && forcedHostContext.kind !== "website-admin") return;
      if (forcedHostContext?.kind === "website-admin") {
        switchView("website-admin");
      }
      if (isWebsiteAdmin) {
        switchView("website-admin");
      } else {
        showWebsiteAdminModal();
      }
    }

    function maybeOpenWebsiteAdminFromLocation() {
      if (typeof window === "undefined") return;
      const hash = String(window.location.hash || "").toLowerCase();
      const search = new URLSearchParams(window.location.search || "");
      if (hash === "#website-admin" || search.get("admin") === "1") {
        setTimeout(() => openWebsiteAdminAccess(), 0);
      }
    }

    function detectForcedHostContext() {
      if (typeof window === "undefined") return null;
      const host = String(window.location.hostname || "").toLowerCase();
      return HOST_ROUTE_CONTEXTS[host] || null;
    }

    function syncForcedHostContext() {
      forcedHostContext = detectForcedHostContext();
      document.body.dataset.hostRoute = forcedHostContext?.slug || "shared";
      if (globalRoleSelect) {
        globalRoleSelect.disabled = Boolean(forcedHostContext && forcedHostContext.kind === "role");
      }
    }

    function isRoleAllowedForHost(role) {
      if (!forcedHostContext) return true;
      if (forcedHostContext.kind === "website-admin") {
        return role === "spectator";
      }
      if (forcedHostContext.kind === "role") {
        return role === forcedHostContext.role || role === "spectator";
      }
      return true;
    }

    function getForcedRoleForHost() {
      return forcedHostContext?.kind === "role" ? forcedHostContext.role : null;
    }

    function getActiveViewName() {
      const views = ["registration", "self-register", "self-register-display", "simulation", "qualifying", "results", "website-admin", "bracket"];
      return views.find((viewName) => document.getElementById(`view-${viewName}`)?.classList.contains("is-active")) || "qualifying";
    }

    function getDefaultViewForRole(role) {
      if (role === "admin") return "registration";
      if (role?.startsWith("j")) return "qualifying";
      return "qualifying";
    }

    function normalizeRouteViewForRole(role, requestedView = null) {
      const fallbackView = getDefaultViewForRole(role);
      const viewName = ROUTABLE_VIEWS.has(requestedView) ? requestedView : fallbackView;
      if (role?.startsWith("j")) return "qualifying";
      if (role !== "admin" && viewName === "registration") return "qualifying";
      if (role !== "spectator" && viewName === "self-register") return fallbackView;
      if (role !== "spectator" && viewName === "simulation") return fallbackView;
      if (role !== "admin" && viewName === "self-register-display") return fallbackView;
      return viewName;
    }

    function buildRoleRouteHash(role = currentRole, viewName = getActiveViewName()) {
      const roleSlug = ROLE_ROUTE_SLUGS[role] || ROLE_ROUTE_SLUGS.spectator;
      const resolvedView = normalizeRouteViewForRole(role, viewName);
      const defaultView = getDefaultViewForRole(role);
      if (role?.startsWith("j")) {
        return `#/${roleSlug}`;
      }
      if (resolvedView === defaultView) {
        return `#/${roleSlug}`;
      }
      return `#/${roleSlug}/${resolvedView}`;
    }

    function buildRoleRouteUrl(role, viewName = null) {
      if (typeof window === "undefined") return "";
      const routeKey = role === "website-admin" ? "website-admin" : role;
      const publicHost = PUBLIC_ROLE_HOSTNAMES[routeKey];
      if (publicHost) {
        const targetUrl = new URL(window.location.href || "https://prodigyrccomp.com/");
        targetUrl.protocol = "https:";
        targetUrl.hostname = publicHost;
        targetUrl.port = "";
        targetUrl.pathname = "/";
        targetUrl.hash = "";
        targetUrl.search = "";
        const resolvedView = normalizeRouteViewForRole(role, viewName || getDefaultViewForRole(role));
        if (!forcedHostContext && routeKey !== "website-admin" && resolvedView && resolvedView !== getDefaultViewForRole(role)) {
          targetUrl.hash = buildRoleRouteHash(role, resolvedView);
        }
        return targetUrl.toString();
      }
      const baseUrl = String(window.location.href || "").split("#")[0];
      return `${baseUrl}${buildRoleRouteHash(role, viewName || getDefaultViewForRole(role))}`;
    }

    function syncRouteWithState(options = {}) {
      if (typeof window === "undefined" || routeHandlingInProgress) return;
      const { replace = false } = options || {};
      const nextHash = getActiveViewName() === "website-admin" || forcedHostContext?.kind === "website-admin"
        ? "#/website-admin"
        : buildRoleRouteHash(forcedHostContext?.kind === "role" ? forcedHostContext.role : currentRole, getActiveViewName());
      if (!nextHash || window.location.hash === nextHash) return;
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      if (replace) {
        history.replaceState(null, "", nextUrl);
      } else {
        history.pushState(null, "", nextUrl);
      }
    }

    function parseRouteFromLocation() {
      if (typeof window === "undefined") return null;
      const rawHash = String(window.location.hash || "").trim().toLowerCase();
      const search = new URLSearchParams(window.location.search || "");
      if (!rawHash && search.get("admin") === "1") {
        return { kind: "website-admin" };
      }

      const cleanedHash = rawHash.replace(/^#\/?/, "");
      const segments = cleanedHash.split("/").filter(Boolean);
      if (!segments.length) return null;
      if (segments[0] === "website-admin") {
        return { kind: "website-admin" };
      }

      const routeRole = ROLE_ROUTE_LOOKUP[segments[0]];
      if (!routeRole) return null;
      return {
        kind: "role",
        role: routeRole,
        view: segments[1] || null,
      };
    }

    function copyTextToClipboard(text) {
      if (!text) return Promise.resolve(false);
      if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
      }
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      return Promise.resolve(Boolean(copied));
    }

    async function copyRoleRoute(role) {
      const routeUrl = buildRoleRouteUrl(role);
      const copied = await copyTextToClipboard(routeUrl);
      if (!copied) {
        window.prompt("Copy this direct role link:", routeUrl);
        return;
      }
      window.alert(`${getRoleDisplayName(role)} link copied.`);
    }

    function buildSelfRegisterUrl() {
      if (typeof window === "undefined") return "";
      const targetUrl = new URL(window.location.href || "https://prodigyrccomp.com/");
      targetUrl.protocol = "https:";
      targetUrl.hostname = PUBLIC_ROLE_HOSTNAMES.spectator || "prodigyrccomp.com";
      targetUrl.port = "";
      targetUrl.pathname = "/";
      targetUrl.search = "";
      targetUrl.hash = "#/spectator/self-register";
      return targetUrl.toString();
    }

    function buildSelfRegisterQrUrl() {
      const selfRegisterUrl = buildSelfRegisterUrl();
      if (!selfRegisterUrl) return "";
      return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(selfRegisterUrl)}`;
    }

    function buildStandaloneDemoUrl() {
      if (typeof window === "undefined") return "";
      const targetUrl = new URL(buildRoleRouteUrl("spectator", "bracket") || "https://prodigyrccomp.com/");
      targetUrl.searchParams.set("demoWindow", "1");
      targetUrl.hash = "#/spectator/bracket";
      return targetUrl.toString();
    }

    function createStandaloneDemoDrivers() {
      const demoEntries = [
        ["Takumi Sato", "Project D", "Yokomo MD 2.0", 99.2, 98.7],
        ["Mika Torres", "Slide Theory", "MST RMX 2.5", 98.8, 98.1],
        ["Jordan Lee", "White Smoke", "Reve D RDX", 98.1, 97.9],
        ["Chris Vega", "Night Shift", "Overdose Galm", 97.6, 97.2],
        ["Noah Kim", "Apex Line", "Yokomo SD 3.0", 97.4, 96.9],
        ["Aiden Brooks", "Countersteer Crew", "MST RMX EX GT", 96.8, 96.1],
        ["Luis Ramirez", "Static Works", "Reve D RDX", 96.2, 95.7],
        ["Kai Foster", "Blackout Drift", "Yokomo MD 1.0", 95.9, 95.1],
        ["Mason Hill", "Side Bite", "MST RMX 2.5", 95.4, 94.8],
        ["Eli Carter", "Ghost Angle", "Overdose Galm", 94.9, 94.2],
        ["Asher Bell", "Prime Slide", "Reve D RDX", 94.4, 93.9],
        ["Roman Ward", "Late Apex", "Yokomo SD 2.0", 93.8, 93.2],
        ["Caleb Reed", "Steel Smoke", "MST RMX 2.0", 93.1, 92.4],
        ["Hunter Miles", "Street Limit", "Yokomo MD 2.0", 92.6, 92.1],
        ["Tristan Holt", "Clean Line", "Reve D RDX", 92.0, 91.5],
        ["Blake Griffin", "North Side", "MST RMX EX GT", 91.4, 90.9],
      ];

      return demoEntries.map(([name, teamName, chassis, run1, run2], index) => {
        const driver = createEmptyDriver(index + 1);
        driver.name = name;
        driver.teamName = teamName;
        driver.chassis = chassis;
        driver.runFlags = { run1: null, run2: null, runoff: null };
        JUDGE_ROLE_ORDER.forEach((role, roleIndex) => {
          const run1Score = clampJudgeScoreValue(run1 - (roleIndex * 0.1));
          const run2Score = clampJudgeScoreValue(run2 - (roleIndex * 0.1));
          driver.scores[role] = {
            run1: run1Score,
            run2: run2Score,
            runoff: null,
            submitted: { run1: run1Score, run2: run2Score, runoff: null },
            deductionHistory: { run1: [], run2: [], runoff: [] },
          };
        });
        return driver;
      });
    }

    function createStandaloneDemoSnapshot() {
      const createdAt = new Date().toISOString();
      const demoDrivers = createStandaloneDemoDrivers();
      const rankedDrivers = rankDrivers(demoDrivers);
      const demoTournament = createTournamentState(rankedDrivers, FORMAT_CLASSIC, 0);

      return {
        meta: {
          id: "standalone-demo-window",
          name: "Prodigy Live Demo",
          date: new Date().toISOString().slice(0, 10),
          status: "active",
          judgeCount: 3,
          createdAt,
          updatedAt: createdAt,
          syncStamp: Date.now(),
          roleNames: buildDefaultRoleNames(),
          venueConfig: createDefaultVenueConfig({
            enabled: true,
            label: "Prodigy Demo Arena",
            latitude: 33,
            longitude: -117,
            radiusMeters: 150,
          }),
          pendingRegistrations: [],
          latestApprovalToast: null,
          roleAccess: {},
          results: {
            ...buildEmptyEventResults(),
            qualifiedCount: rankedDrivers.length,
            totalDrivers: rankedDrivers.length,
            planDescription: demoTournament?.plan?.description || "Live demo bracket ready.",
          },
        },
        drivers: demoDrivers,
        qualifyingFlow: {
          currentDriverId: null,
          readyRoles: {},
          started: true,
          completed: true,
        },
        tournament: demoTournament,
      };
    }

    function activateStandaloneDemoWindow() {
      const demoSnapshot = createStandaloneDemoSnapshot();
      activeEventId = demoSnapshot.meta.id;
      activeEventMeta = cloneEventMeta(demoSnapshot.meta);
      eventDirectory = { [activeEventId]: cloneEventMeta(demoSnapshot.meta) };
      appDrivers = sanitizeLoadedDrivers(demoSnapshot.drivers);
      qualifyingFlow = demoSnapshot.qualifyingFlow;
      tournamentState = demoSnapshot.tournament;
      currentRole = "spectator";
      localEventPreviewMode = true;
      bracketModeSelect.value = FORMAT_CLASSIC;
      lowerCountInput.value = "0";
      lowerCountContainer.style.display = "none";
      activeCompetitionBracketPage = tournamentState?.lowerBracket ? "lower" : "main";
      document.body.dataset.role = "spectator";
    }

    function openStandaloneDemoWindow() {
      const targetUrl = buildStandaloneDemoUrl();
      if (!targetUrl) return null;
      return window.open(targetUrl, "prodigy-live-demo-window", "noopener,noreferrer,width=1680,height=960");
    }

    function applyRouteFromLocation() {
      if (forcedHostContext) {
        routeHandlingInProgress = true;
        try {
          if (forcedHostContext.kind === "website-admin") {
            openWebsiteAdminAccess();
            return;
          }
          const parsedRoute = parseRouteFromLocation();
          const requestedForcedView = parsedRoute?.kind === "role" && parsedRoute.role === forcedHostContext.role
            ? parsedRoute.view
            : forcedHostContext.view;
          pendingRouteView = normalizeRouteViewForRole(forcedHostContext.role, requestedForcedView);
          if (currentRole === forcedHostContext.role) {
            applyRoleChange(forcedHostContext.role);
            return;
          }
          requestRoleAccess(forcedHostContext.role);
          return;
        } finally {
          routeHandlingInProgress = false;
        }
      }

      const route = parseRouteFromLocation();
      if (!route) {
        syncRouteWithState({ replace: true });
        return;
      }

      routeHandlingInProgress = true;
      try {
        if (route.kind === "website-admin") {
          openWebsiteAdminAccess();
          return;
        }

        pendingRouteView = normalizeRouteViewForRole(route.role, route.view);
        if (route.role === "spectator") {
          applyRoleChange("spectator");
          return;
        }

        requestRoleAccess(route.role);
      } finally {
        routeHandlingInProgress = false;
      }
    }

    function resetWebsiteAdminTapSequence() {
      websiteAdminTapCount = 0;
      if (websiteAdminTapResetTimer) {
        clearTimeout(websiteAdminTapResetTimer);
        websiteAdminTapResetTimer = null;
      }
    }

    function registerWebsiteAdminHiddenTap() {
      websiteAdminTapCount += 1;
      if (websiteAdminTapResetTimer) {
        clearTimeout(websiteAdminTapResetTimer);
      }
      websiteAdminTapResetTimer = setTimeout(() => {
        resetWebsiteAdminTapSequence();
      }, 1800);
      if (websiteAdminTapCount >= 5) {
        resetWebsiteAdminTapSequence();
        openWebsiteAdminAccess();
      }
    }

    function formatClaimedAt(value) {
      if (!value) return "Invite not claimed yet";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "Claimed";
      return `Claimed ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed)}`;
    }

    function getTopQualifierTieInfo(rankedDrivers) {
      if (!rankedDrivers.length || rankedDrivers[0].bestScore === null) return null;
      const topBestScore = rankedDrivers[0].bestScore;
      const tiedDrivers = rankedDrivers.filter((driver) => driver.bestScore === topBestScore);
      if (tiedDrivers.length < 2) return null;
      return {
        tiedDrivers,
        requiresRunoff: tiedDrivers.some((driver) => driver.runoff === null),
      };
    }

    function setRunFlag(driverId, runKey, reason) {
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver) return;
      if (currentRole.startsWith("j")) {
        driver.scores[currentRole][runKey] = 0;
        renderDriversTable();
        return;
      }
      driver.runFlags[runKey] = reason;
      if (reason) {
        driver.scores.j1[runKey] = 0;
        driver.scores.j2[runKey] = 0;
        driver.scores.j3[runKey] = 0;
      }
      publishState();
      renderDriversTable();
    }

    function updateEventChrome() {
      heroEventName.textContent = activeEventMeta?.name || "Main Event";
      heroEventDate.textContent = formatEventDate(activeEventMeta?.date);
      heroJudgeSystem.textContent = getJudgeSystemLabel(activeEventMeta);
      const judgeCount = getEventJudgeCount(activeEventMeta);
      document.getElementById("qualifyingBoardCopy").textContent = `Manage the driver list, monitor the ${judgeCount === 1 ? "live score" : "averaged scores"} from ${judgeCount} judge${judgeCount === 1 ? "" : "s"}, and launch the competition bracket when qualifying is complete.`;
      document.getElementById("judgeBoardCopy").textContent = judgeCount === 1
        ? "Enter the official run score for each driver. That score becomes the driver's final run score immediately."
        : `Enter your personal scores for each driver. Your score will be averaged dynamically with the other ${judgeCount - 1} judge${judgeCount === 2 ? "" : "s"} to form the driver's final run score.`;
      if (qualifyingPanelTitle) {
        qualifyingPanelTitle.textContent = currentRole.startsWith("j") ? "Judges Panel" : "Driver Scores";
      }
      document.getElementById("thRun1").textContent = getAverageColumnLabel(1, currentRole, activeEventMeta);
      document.getElementById("thRun2").textContent = getAverageColumnLabel(2, currentRole, activeEventMeta);
      currentEventStatus.textContent = activeEventMeta?.status === "archived" ? "Archived" : "Active";
      currentEventStatus.className = `status-pill ${activeEventMeta?.status === "archived" ? "archived" : "active"}`;
      document.title = activeEventMeta?.name ? `${activeEventMeta.name} | RC Drift Event Control` : "RC Drift Event Control";
      if (startQualifyingBtn) {
        const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);
        startQualifyingBtn.textContent = qualifyingPhase === "complete" ? "Restart Qualifying" : "Start Qualifying";
        startQualifyingBtn.disabled = !adminCanEdit() || !getQualifyingDriverQueue().length;
      }
      Array.from(globalRoleSelect.options).forEach((option) => {
        option.textContent = getRoleDisplayName(option.value);
        option.hidden = !isRoleAvailableForEvent(option.value, activeEventMeta);
        option.disabled = !isRoleAvailableForEvent(option.value, activeEventMeta);
      });
      if (currentRole.startsWith("j") && isJudgeAccessLocked()) {
        applyRoleChange("spectator");
        switchView("qualifying");
        return;
      }
      if (!isRoleAvailableForEvent(currentRole, activeEventMeta)) {
        currentRole = "spectator";
        document.body.dataset.role = currentRole;
        saveRoleForEvent(activeEventId, currentRole);
      }
      globalRoleSelect.value = currentRole;
      if (registrationHeroEventName) registrationHeroEventName.textContent = activeEventMeta?.name || "Main Event";
      if (registrationHeroEventDate) registrationHeroEventDate.textContent = formatEventDate(activeEventMeta?.date);
      if (registrationAddDriverBtn) registrationAddDriverBtn.classList.toggle("hidden", !registrationCanEdit());
      if (registrationAddDriverSecondaryBtn) registrationAddDriverSecondaryBtn.classList.toggle("hidden", !registrationCanEdit());
      if (websiteAdminCurrentEventName) websiteAdminCurrentEventName.textContent = activeEventMeta?.name || "Main Event";
      if (websiteAdminCurrentEventDate) websiteAdminCurrentEventDate.textContent = formatEventDate(activeEventMeta?.date);
      if (websiteAdminJudgeCount) websiteAdminJudgeCount.textContent = getJudgeSystemLabel(activeEventMeta);
      if (websiteAdminAccessStatus) websiteAdminAccessStatus.textContent = isWebsiteAdmin ? "Unlocked" : "Locked";
      if (websiteAdminNewEventBtn) websiteAdminNewEventBtn.disabled = !isWebsiteAdmin;
      if (websiteAdminSignOutBtn) websiteAdminSignOutBtn.disabled = !isWebsiteAdmin;
      syncVenueConfigForm();
      syncSelfRegisterForm();
      syncSelfRegisterQrPanel();
      syncRegistrationAdminAlerts();
      syncApprovalToast();
      syncBroadcastTicker();
    }

    function sortEventsForDisplay() {
      return Object.values(eventDirectory).sort((left, right) => {
        if ((left.status === "archived") !== (right.status === "archived")) {
          return left.status === "archived" ? 1 : -1;
        }
        const rightDate = right.date || "";
        const leftDate = left.date || "";
        if (rightDate !== leftDate) return rightDate.localeCompare(leftDate);
        return (right.updatedAt || "").localeCompare(left.updatedAt || "");
      });
    }

    function getRegisteredDrivers(drivers = appDrivers) {
      return normalizeDriverList(drivers).filter((driver) => {
        const hasName = Boolean(driver.name?.trim());
        return hasName;
      });
    }

    function getPendingRegistrations(eventMeta = activeEventMeta) {
      return normalizePendingRegistrationList(eventMeta?.pendingRegistrations);
    }

    function normalizeDriverName(value) {
      return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function findDuplicateDriverEntry(name, options = {}) {
      const normalizedName = normalizeDriverName(name);
      if (!normalizedName) return null;
      const excludePendingId = options.excludePendingId || null;
      const excludeDriverId = options.excludeDriverId || null;
      const liveDriver = getRegisteredDrivers(options.drivers || appDrivers)
        .find((driver) => driver.id !== excludeDriverId && normalizeDriverName(driver.name) === normalizedName);
      if (liveDriver) {
        return { type: "roster", entry: liveDriver };
      }
      const pendingEntry = getPendingRegistrations(options.eventMeta || activeEventMeta)
        .find((entry) => entry.id !== excludePendingId && normalizeDriverName(entry.name) === normalizedName);
      if (pendingEntry) {
        return { type: "pending", entry: pendingEntry };
      }
      return null;
    }

    function getSelfRegistrationCloseReason(eventMeta = activeEventMeta, flow = qualifyingFlow, drivers = appDrivers) {
      const venueConfig = getVenueConfig(eventMeta);
      if (getQualifyingFlowPhase(flow, drivers) === "live") return "qualifying-live";
      if (getQualifyingFlowPhase(flow, drivers) === "complete") return "qualifying-complete";
      if (venueConfig.closeAt) {
        const closeAtMs = new Date(venueConfig.closeAt).getTime();
        if (Number.isFinite(closeAtMs) && Date.now() >= closeAtMs) return "scheduled-close";
      }
      return null;
    }

    function isSelfRegistrationClosedByQualifying(eventMeta = activeEventMeta, flow = qualifyingFlow, drivers = appDrivers) {
      return Boolean(getSelfRegistrationCloseReason(eventMeta, flow, drivers));
    }

    function loadSavedSelfRegisterProfile() {
      try {
        const raw = localStorage.getItem(SELF_REGISTER_PROFILE_STORAGE_KEY);
        if (!raw) return { name: "", teamName: "", chassis: "" };
        const parsed = JSON.parse(raw);
        return {
          name: typeof parsed?.name === "string" ? parsed.name : "",
          teamName: typeof parsed?.teamName === "string" ? parsed.teamName : "",
          chassis: typeof parsed?.chassis === "string" ? parsed.chassis : "",
        };
      } catch (error) {
        console.warn("Failed to load saved self-registration profile.", error);
        return { name: "", teamName: "", chassis: "" };
      }
    }

    function normalizeSavedSelfRegisterProfiles(entries) {
      return (Array.isArray(entries) ? entries : [])
        .map((entry) => {
          const normalized = entry && typeof entry === "object" ? entry : {};
          return {
            id: normalized.id || generateId(),
            label: typeof normalized.label === "string" ? normalized.label : "",
            name: typeof normalized.name === "string" ? normalized.name : "",
            teamName: typeof normalized.teamName === "string" ? normalized.teamName : "",
            chassis: typeof normalized.chassis === "string" ? normalized.chassis : "",
            lastUsedAt: normalized.lastUsedAt || null,
          };
        })
        .filter((entry) => Boolean(entry.name.trim()))
        .sort((left, right) => String(right.lastUsedAt || "").localeCompare(String(left.lastUsedAt || "")));
    }

    function loadSavedSelfRegisterProfiles() {
      try {
        const raw = localStorage.getItem(SELF_REGISTER_PROFILES_STORAGE_KEY);
        if (!raw) return [];
        return normalizeSavedSelfRegisterProfiles(JSON.parse(raw));
      } catch (error) {
        console.warn("Failed to load saved self-registration profiles.", error);
        return [];
      }
    }

    function persistSavedSelfRegisterProfiles(profiles) {
      try {
        localStorage.setItem(SELF_REGISTER_PROFILES_STORAGE_KEY, JSON.stringify(normalizeSavedSelfRegisterProfiles(profiles)));
      } catch (error) {
        console.warn("Failed to save self-registration profiles.", error);
      }
    }

    function persistSelfRegisterProfile() {
      try {
        localStorage.setItem(SELF_REGISTER_PROFILE_STORAGE_KEY, JSON.stringify({
          name: selfRegistrationDraft.name || "",
          teamName: selfRegistrationDraft.teamName || "",
          chassis: selfRegistrationDraft.chassis || "",
        }));
      } catch (error) {
        console.warn("Failed to save self-registration profile.", error);
      }
    }

    function clearSavedSelfRegisterProfile() {
      try {
        localStorage.removeItem(SELF_REGISTER_PROFILE_STORAGE_KEY);
      } catch (error) {
        console.warn("Failed to clear saved self-registration profile.", error);
      }
    }

    function buildSelfRegisterProfileLabel(profile) {
      const name = (profile?.name || "").trim() || "Unnamed Driver";
      const team = (profile?.teamName || "").trim();
      return team ? `${name} | ${team}` : name;
    }

    function syncSavedSelfRegisterProfilesUi(selectedId = "") {
      if (!selfRegisterSavedProfileSelect) return;
      const profiles = loadSavedSelfRegisterProfiles();
      if (!profiles.length) {
        selfRegisterSavedProfileSelect.innerHTML = `<option value="">No saved profiles yet</option>`;
        selfRegisterSavedProfileSelect.value = "";
        return;
      }
      selfRegisterSavedProfileSelect.innerHTML = [
        `<option value="">Choose a saved driver</option>`,
        ...profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(buildSelfRegisterProfileLabel(profile))}</option>`)
      ].join("");
      selfRegisterSavedProfileSelect.value = profiles.some((profile) => profile.id === selectedId) ? selectedId : "";
    }

    function saveCurrentSelfRegisterProfile() {
      const name = (selfRegistrationDraft.name || "").trim();
      if (!name) {
        if (selfRegisterName) selfRegisterName.focus();
        return false;
      }
      const now = new Date().toISOString();
      const profiles = loadSavedSelfRegisterProfiles();
      const matchingProfile = profiles.find((profile) =>
        profile.name.trim().toLowerCase() === name.toLowerCase()
        && (profile.teamName || "").trim().toLowerCase() === (selfRegistrationDraft.teamName || "").trim().toLowerCase()
      );
      const nextProfile = {
        id: matchingProfile?.id || generateId(),
        label: "",
        name,
        teamName: (selfRegistrationDraft.teamName || "").trim(),
        chassis: (selfRegistrationDraft.chassis || "").trim(),
        lastUsedAt: now,
      };
      const nextProfiles = [
        nextProfile,
        ...profiles.filter((profile) => profile.id !== nextProfile.id),
      ].slice(0, 20);
      persistSavedSelfRegisterProfiles(nextProfiles);
      syncSavedSelfRegisterProfilesUi(nextProfile.id);
      return true;
    }

    function applySavedSelfRegisterProfile(profileId) {
      const profile = loadSavedSelfRegisterProfiles().find((entry) => entry.id === profileId);
      if (!profile) return false;
      selfRegistrationDraft = {
        name: profile.name || "",
        teamName: profile.teamName || "",
        chassis: profile.chassis || "",
      };
      persistSelfRegisterProfile();
      syncSavedSelfRegisterProfilesUi(profile.id);
      syncSelfRegisterForm();
      return true;
    }

    function deleteSavedSelfRegisterProfile(profileId) {
      if (!profileId) return false;
      const profiles = loadSavedSelfRegisterProfiles();
      if (!profiles.some((profile) => profile.id === profileId)) return false;
      persistSavedSelfRegisterProfiles(profiles.filter((profile) => profile.id !== profileId));
      syncSavedSelfRegisterProfilesUi("");
      return true;
    }

    function syncRegistrationDraftForm() {
      const canEditRegistration = registrationCanEdit();
      if (registrationDraftName) registrationDraftName.value = registrationDraft.name || "";
      if (registrationDraftTeam) registrationDraftTeam.value = registrationDraft.teamName || "";
      if (registrationDraftChassis) registrationDraftChassis.value = registrationDraft.chassis || "";
      if (registrationDraftName) registrationDraftName.disabled = !canEditRegistration;
      if (registrationDraftTeam) registrationDraftTeam.disabled = !canEditRegistration;
      if (registrationDraftChassis) registrationDraftChassis.disabled = !canEditRegistration;
      if (registrationAddDriverBtn) registrationAddDriverBtn.disabled = !canEditRegistration;
      if (registrationAddDriverSecondaryBtn) registrationAddDriverSecondaryBtn.disabled = !canEditRegistration;
      if (registrationDraftRegLabel) {
        registrationDraftRegLabel.textContent = `Next registration number: #${getNextSignUpPosition(appDrivers)}`;
      }
    }

    function syncVenueConfigForm() {
      const venueConfig = getVenueConfig();
      const canEditVenue = adminCanEdit();
      const isClosedByQualifying = isSelfRegistrationClosedByQualifying();
      if (venueEnabledSelect) {
        venueEnabledSelect.value = venueConfig.enabled ? "true" : "false";
        venueEnabledSelect.disabled = !canEditVenue;
      }
      if (venueLabelInput) {
        venueLabelInput.value = venueConfig.label || "";
        venueLabelInput.disabled = !canEditVenue;
      }
      if (venueLatitudeInput) {
        venueLatitudeInput.value = venueConfig.latitude ?? "";
        venueLatitudeInput.disabled = !canEditVenue;
      }
      if (venueLongitudeInput) {
        venueLongitudeInput.value = venueConfig.longitude ?? "";
        venueLongitudeInput.disabled = !canEditVenue;
      }
      if (venueRadiusInput) {
        venueRadiusInput.value = venueConfig.radiusMeters ?? 150;
        venueRadiusInput.disabled = !canEditVenue;
      }
      if (venueCloseAtInput) {
        venueCloseAtInput.value = venueConfig.closeAt
          ? new Date(venueConfig.closeAt).toISOString().slice(0, 16)
          : "";
        venueCloseAtInput.disabled = !canEditVenue;
      }
      if (saveVenueConfigBtn) saveVenueConfigBtn.disabled = !canEditVenue;
      if (venueConfigStatus) {
        const closeReason = getSelfRegistrationCloseReason();
        venueConfigStatus.textContent = closeReason
          ? closeReason === "scheduled-close"
            ? `Self-registration is closed because the scheduled close time has passed${venueConfig.closeAt ? ` (${new Date(venueConfig.closeAt).toLocaleString()})` : ""}.`
            : "Self-registration is automatically closed because qualifying has already started."
          : hasValidVenueConfig()
          ? `Enabled for ${venueConfig.label || activeEventMeta?.name || "this venue"} within ${Math.round(Number(venueConfig.radiusMeters) || 0)} meters${venueConfig.closeAt ? ` until ${new Date(venueConfig.closeAt).toLocaleString()}` : ""}.`
          : "Public self-registration is disabled for this event.";
      }
    }

    function syncSelfRegisterForm() {
      const venueIsValid = hasValidVenueConfig();
      const closeReason = getSelfRegistrationCloseReason();
      const isClosedByQualifying = Boolean(closeReason);
      const isReady = selfRegistrationState.unlocked && venueIsValid && !isEventReadOnly() && !isClosedByQualifying;
      const effectiveCopy = venueIsValid
        ? selfRegistrationState.copy
        : "Self-registration is disabled until event admin saves a valid venue location and radius.";
      const effectiveStatus = !venueIsValid || isClosedByQualifying ? "error" : selfRegistrationState.status;
      if (selfRegisterName) selfRegisterName.value = selfRegistrationDraft.name || "";
      if (selfRegisterTeam) selfRegisterTeam.value = selfRegistrationDraft.teamName || "";
      if (selfRegisterChassis) selfRegisterChassis.value = selfRegistrationDraft.chassis || "";
      if (selfRegisterName) selfRegisterName.disabled = !isReady;
      if (selfRegisterTeam) selfRegisterTeam.disabled = !isReady;
      if (selfRegisterChassis) selfRegisterChassis.disabled = !isReady;
      if (selfRegisterSubmitBtn) selfRegisterSubmitBtn.disabled = !isReady;
      if (selfRegisterStatus) {
        selfRegisterStatus.classList.remove("is-ready", "is-locked", "is-error");
        selfRegisterStatus.classList.add(
          effectiveStatus === "ready"
            ? "is-ready"
            : effectiveStatus === "error"
              ? "is-error"
              : "is-locked"
        );
      }
      if (selfRegisterStatusCopy) selfRegisterStatusCopy.textContent = isClosedByQualifying
        ? closeReason === "scheduled-close"
          ? `Self-registration closed at the scheduled time${getVenueConfig().closeAt ? ` (${new Date(getVenueConfig().closeAt).toLocaleString()})` : ""}.`
          : "Self-registration is closed because qualifying has already started for this event."
        : effectiveCopy;
      if (selfRegisterFormNote) {
        selfRegisterFormNote.textContent = isReady
          ? "You are inside the venue geofence. Submit your details to join the roster."
          : isClosedByQualifying
            ? closeReason === "scheduled-close"
              ? "Registration is closed because the scheduled close time has passed."
              : "Registration is closed once qualifying is live."
            : "Registration unlocks once your phone is inside the event geofence.";
      }
      if (selfRegisterVenueMeta) {
        const venueConfig = getVenueConfig();
        const pendingCount = getPendingRegistrations().length;
        selfRegisterVenueMeta.textContent = isClosedByQualifying
          ? closeReason === "scheduled-close"
            ? `Self-registration is closed because the scheduled close time passed. Live roster: ${getRegisteredDrivers(appDrivers).length} drivers | Pending payment: ${pendingCount}`
            : `Self-registration is closed because qualifying is already ${getQualifyingFlowPhase(qualifyingFlow, appDrivers) === "complete" ? "complete" : "live"}. Live roster: ${getRegisteredDrivers(appDrivers).length} drivers | Pending payment: ${pendingCount}`
          : hasValidVenueConfig()
          ? `${venueConfig.label || activeEventMeta?.name || "Current venue"} | Radius ${Math.round(Number(venueConfig.radiusMeters) || 0)} m | Live roster: ${getRegisteredDrivers(appDrivers).length} drivers | Pending payment: ${pendingCount}`
          : "Self-registration is disabled for this event.";
      }
      if (selfRegisterDriverCount) {
        const count = getRegisteredDrivers(appDrivers).length;
        selfRegisterDriverCount.textContent = `${count} Driver${count === 1 ? "" : "s"}`;
      }
      if (selfRegisterSavedProfileNote) {
        const hasSavedProfile = Boolean(
          (selfRegistrationDraft.name || "").trim()
          || (selfRegistrationDraft.teamName || "").trim()
          || (selfRegistrationDraft.chassis || "").trim()
        );
        const savedProfiles = loadSavedSelfRegisterProfiles();
        selfRegisterSavedProfileNote.textContent = hasSavedProfile
          ? `This device is remembering the current driver details. Saved profiles available: ${savedProfiles.length}.`
          : `This device can remember driver details for faster check-in next time. Saved profiles: ${savedProfiles.length}.`;
      }
      syncSavedSelfRegisterProfilesUi(selfRegisterSavedProfileSelect?.value || "");
    }

    function syncSelfRegisterQrPanel() {
      const selfRegisterUrl = buildSelfRegisterUrl();
      const qrUrl = buildSelfRegisterQrUrl();
      const closeReason = getSelfRegistrationCloseReason();
      if (selfRegisterPublicLink) {
        selfRegisterPublicLink.href = selfRegisterUrl || "#";
        selfRegisterPublicLink.textContent = selfRegisterUrl || "Public registration link unavailable.";
      }
      if (selfRegisterQrImage) {
        if (qrUrl) {
          selfRegisterQrImage.src = qrUrl;
          selfRegisterQrImage.hidden = false;
        } else {
          selfRegisterQrImage.removeAttribute("src");
          selfRegisterQrImage.hidden = true;
        }
      }
      if (selfRegisterQrLabel) {
        selfRegisterQrLabel.textContent = selfRegisterUrl
          ? `Scan to open registration for ${activeEventMeta?.name || "the current event"}.`
          : "Public registration QR will appear here.";
      }
      if (selfRegisterDisplayQrImage) {
        if (qrUrl) {
          selfRegisterDisplayQrImage.src = qrUrl;
          selfRegisterDisplayQrImage.hidden = false;
        } else {
          selfRegisterDisplayQrImage.removeAttribute("src");
          selfRegisterDisplayQrImage.hidden = true;
        }
      }
      if (selfRegisterDisplayTitle) {
        selfRegisterDisplayTitle.textContent = activeEventMeta?.name
          ? `${activeEventMeta.name} Check-In`
          : "Scan To Register";
      }
      if (selfRegisterDisplayCopy) {
        selfRegisterDisplayCopy.textContent = closeReason
          ? closeReason === "scheduled-close"
            ? "Self-registration is closed because the scheduled close time has passed."
            : "Self-registration is now closed because qualifying is in progress."
          : activeEventMeta?.date
            ? `Scan with your phone camera to register for ${activeEventMeta.name} on ${formatEventDate(activeEventMeta.date)}.`
            : "Use your phone camera to open the registration page for this event.";
      }
      if (selfRegisterDisplayLink) {
        selfRegisterDisplayLink.href = selfRegisterUrl || "#";
        selfRegisterDisplayLink.textContent = selfRegisterUrl || "Public registration link unavailable.";
      }
    }

    function syncRegistrationAdminAlerts() {
      if (!registrationAdminAlerts) return;
      const pendingEntries = getPendingRegistrations();
      const unpaidCount = pendingEntries.filter((entry) => !entry.paidAt).length;
      const paidAwaitingCount = pendingEntries.filter((entry) => Boolean(entry.paidAt)).length;
      const queueCount = getQualifyingDriverQueue().length;
      const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);
      const alerts = [
        {
          tone: unpaidCount ? "is-warning" : "is-muted",
          label: "Pending Payment",
          value: unpaidCount,
        },
        {
          tone: paidAwaitingCount ? "is-warning" : "is-muted",
          label: "Paid Awaiting Approval",
          value: paidAwaitingCount,
        },
        {
          tone: qualifyingPhase === "waiting" && queueCount > 0 ? "is-success" : "is-muted",
          label: "Qualifying Ready",
          value: qualifyingPhase === "waiting" && queueCount > 0 ? "Yes" : "No",
        },
        {
          tone: isSelfRegistrationClosedByQualifying() ? "is-warning" : hasValidVenueConfig() ? "is-success" : "is-muted",
          label: "Self-Register",
          value: isSelfRegistrationClosedByQualifying() ? "Closed" : hasValidVenueConfig() ? "Open" : "Off",
        },
      ];
      const closeAt = getVenueConfig().closeAt;
      if (closeAt && !isSelfRegistrationClosedByQualifying()) {
        alerts.push({
          tone: "is-muted",
          label: "Closes",
          value: new Date(closeAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
      }
      registrationAdminAlerts.innerHTML = alerts.map((alert) => `
        <div class="admin-alert-pill ${alert.tone}">
          <span>${escapeHtml(alert.label)}</span>
          <strong>${escapeHtml(String(alert.value))}</strong>
        </div>
      `).join("");
    }

    function syncApprovalToast() {
      if (!approvalToast || !approvalToastTitle || !approvalToastCopy) return;
      const latestToast = activeEventMeta?.latestApprovalToast || null;
      const shouldShow = Boolean(
        latestToast
        && latestToast.id
        && latestToast.id !== lastShownApprovalToastId
        && (currentRole === "spectator" || currentRole === "admin")
      );
      if (!shouldShow) return;
      lastShownApprovalToastId = latestToast.id;
      approvalToastTitle.textContent = `${latestToast.name} Approved`;
      approvalToastCopy.textContent = latestToast.reg
        ? `Driver added to the live roster as #${latestToast.reg}.`
        : "Driver added to the live roster.";
      approvalToast.classList.remove("hidden");
      if (approvalToastDismissTimer) clearTimeout(approvalToastDismissTimer);
      approvalToastDismissTimer = setTimeout(() => {
        approvalToast.classList.add("hidden");
      }, 9000);
    }

    function buildBroadcastTickerItems() {
      const items = [];
      const eventName = activeEventMeta?.name || "Main Event";
      items.push(`Event <strong>${escapeHtml(eventName)}</strong>`);

      const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);
      const currentDriver = getCurrentQualifyingDriver();
      if (qualifyingPhase === "live" && currentDriver) {
        items.push(`Now Qualifying <strong>${escapeHtml(currentDriver.name || "Unnamed Driver")}</strong>`);
        items.push(`Best Live Score <strong>${escapeHtml(formatScore(getBestScore(getLiveRunAverage(currentDriver, 1), getLiveRunAverage(currentDriver, 2))))}</strong>`);
      } else if (qualifyingPhase === "waiting") {
        items.push(`Qualifying <strong>Ready To Start</strong>`);
      } else if (qualifyingPhase === "complete") {
        items.push(`Qualifying <strong>Complete</strong>`);
      }

      const rankedDrivers = rankDrivers(appDrivers);
      if (rankedDrivers[0]?.name) {
        items.push(`Top Seed <strong>#${rankedDrivers[0].seed} ${escapeHtml(rankedDrivers[0].name)}</strong>`);
      }

      const pendingCount = getPendingRegistrations().length;
      if (pendingCount) {
        items.push(`Pending Check-Ins <strong>${pendingCount}</strong>`);
      }

      if (tournamentState?.mainBracket?.rounds?.length) {
        const bracketEntries = getMainBattleFlowEntries(
          tournamentState.mainBracket.rounds,
          tournamentState.mainBracket.thirdPlaceMatch,
        );
        const nextBattle = bracketEntries[0];
        if (nextBattle?.match?.left?.name && nextBattle?.match?.right?.name) {
          items.push(`Now Battling <strong>${escapeHtml(nextBattle.match.left.name)} vs ${escapeHtml(nextBattle.match.right.name)}</strong>`);
        } else {
          items.push(`Competition <strong>Bracket Live</strong>`);
        }
      }

      const results = activeEventMeta?.results || {};
      if (results.championName) {
        items.push(`Champion <strong>#${results.championSeed || "-"} ${escapeHtml(results.championName)}</strong>`);
      }

      return items.filter(Boolean);
    }

    function renderSimulationView() {
      if (!spectatorSimulationGrid || !spectatorSimulationSummary) return;

      const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);
      const rankedDrivers = rankDrivers(appDrivers);
      const currentDriver = getCurrentQualifyingDriver();
      const venueConfig = getVenueConfig();
      const pendingCount = getPendingRegistrations().length;
      const liveRosterCount = getRegisteredDrivers(appDrivers).length;
      const closeReason = getSelfRegistrationCloseReason(activeEventMeta, qualifyingFlow, appDrivers);
      const results = activeEventMeta?.results || {};
      const bracketEntries = tournamentState?.mainBracket?.rounds?.length
        ? getMainBattleFlowEntries(
            tournamentState.mainBracket.rounds,
            tournamentState.mainBracket.thirdPlaceMatch,
          )
        : [];
      const nextBattle = bracketEntries[0]?.match || null;

      const sampleNames = ["Chuck Taylor", "Taylor Mills", "Alex Rivera"];
      const eventName = activeEventMeta?.name || "Prodigy Showcase";
      const eventDate = formatEventDate(activeEventMeta?.date);
      const currentDriverName = currentDriver?.name || sampleNames[0];
      const topSeedName = rankedDrivers[0]?.name || sampleNames[1];
      const topSeedScore = rankedDrivers[0] ? formatScore(rankedDrivers[0].bestScore) : "98.7";
      const championName = results.championName || rankedDrivers[0]?.name || sampleNames[2];
      const qualifierStatusLabel = qualifyingPhase === "live"
        ? "Live"
        : qualifyingPhase === "complete"
          ? "Complete"
          : "Ready";
      const qualifierStatusClass = qualifyingPhase === "live"
        ? "live"
        : qualifyingPhase === "complete"
          ? "waiting"
          : "ready";
      const registrationStatusLabel = closeReason ? "Closed" : (venueConfig.enabled ? "Open" : "Setup");
      const registrationStatusClass = closeReason ? "waiting" : (venueConfig.enabled ? "live" : "ready");
      const competitionStatusLabel = nextBattle ? "Live" : (tournamentState?.mainBracket?.rounds?.length ? "Ready" : "Preview");
      const competitionStatusClass = nextBattle ? "live" : (tournamentState?.mainBracket?.rounds?.length ? "ready" : "waiting");
      const resultsStatusLabel = results.championName ? "Final" : "Preview";
      const registrationCopy = closeReason
        ? "Self-registration is closed, which is exactly what spectators will see once qualifying begins or the scheduled cutoff passes."
        : "This is the event-day check-in experience with QR registration, pending payment, and the live roster building in real time.";
      const competitionHeadline = nextBattle?.left?.name && nextBattle?.right?.name
        ? `${nextBattle.left.name} vs ${nextBattle.right.name}`
        : `${sampleNames[1]} vs ${sampleNames[2]}`;

      spectatorSimulationGrid.innerHTML = `
        <article class="simulation-stage-card">
          <div class="simulation-stage-top">
            <h3>Check-In</h3>
            <span class="simulation-status-pill ${registrationStatusClass}">${registrationStatusLabel}</span>
          </div>
          <p class="simulation-stage-copy">${escapeHtml(registrationCopy)}</p>
          <div class="simulation-stage-value">${liveRosterCount || 24} Drivers</div>
          <div class="simulation-stage-meta">
            <span class="simulation-chip">Pending Payment ${pendingCount || 3}</span>
            <span class="simulation-chip">${escapeHtml(venueConfig.label || "Venue Geofence Active")}</span>
          </div>
        </article>
        <article class="simulation-stage-card">
          <div class="simulation-stage-top">
            <h3>Qualifying</h3>
            <span class="simulation-status-pill ${qualifierStatusClass}">${qualifierStatusLabel}</span>
          </div>
          <p class="simulation-stage-copy">The live current-driver panel, judge syncing, and standings board all feed this broadcast view.</p>
          <div class="simulation-stage-value">${escapeHtml(currentDriverName)}</div>
          <div class="simulation-stage-meta">
            <span class="simulation-chip">Top Seed #1 ${escapeHtml(topSeedName)}</span>
            <span class="simulation-chip">Best Score ${escapeHtml(topSeedScore)}</span>
          </div>
        </article>
        <article class="simulation-stage-card">
          <div class="simulation-stage-top">
            <h3>Competition</h3>
            <span class="simulation-status-pill ${competitionStatusClass}">${competitionStatusLabel}</span>
          </div>
          <p class="simulation-stage-copy">Battle flow cards, bracket progression, and fullscreen finals all feed from the same live event state.</p>
          <div class="simulation-stage-value">${escapeHtml(competitionHeadline)}</div>
          <div class="simulation-stage-meta">
            <span class="simulation-chip">${tournamentState?.lowerBracket?.rounds?.length ? "Lower Bracket Active" : "Main Bracket Focus"}</span>
            <span class="simulation-chip">${tournamentState?.mainBracket?.rounds?.length ? "Bracket Published" : "Bracket Preview Ready"}</span>
          </div>
        </article>
        <article class="simulation-stage-card">
          <div class="simulation-stage-top">
            <h3>Results</h3>
            <span class="simulation-status-pill ${resultsStatusLabel === "Final" ? "live" : "ready"}">${resultsStatusLabel}</span>
          </div>
          <p class="simulation-stage-copy">When the event ends, spectators can flip straight into the saved results and podium archive.</p>
          <div class="simulation-stage-value">${escapeHtml(championName)}</div>
          <div class="simulation-stage-meta">
            <span class="simulation-chip">Champion View</span>
            <span class="simulation-chip">Archive Ready</span>
          </div>
        </article>
      `;

      spectatorSimulationEventTitle.textContent = `${eventName} Preview`;
      spectatorSimulationSummary.innerHTML = `
        <article class="simulation-summary-card">
          <div class="simulation-summary-top">
            <h3>${escapeHtml(eventName)}</h3>
            <span class="simulation-status-pill ready">${escapeHtml(eventDate)}</span>
          </div>
          <p class="simulation-summary-copy">This tab gives spectators a clean “what this event feels like live” preview without needing the event to be fully underway.</p>
          <div class="simulation-summary-meta">
            <span class="simulation-chip">Live Roster ${liveRosterCount || 24}</span>
            <span class="simulation-chip">Pending ${pendingCount || 3}</span>
            <span class="simulation-chip">Theme Broadcast Mode</span>
          </div>
        </article>
        <article class="simulation-summary-card">
          <div class="simulation-summary-top">
            <h3>Example Live Ticker</h3>
            <span class="simulation-status-pill live">On Air</span>
          </div>
          <div class="simulation-scoreboard">
            <div class="simulation-score-row">
              <div><strong>Now Qualifying</strong><span>${escapeHtml(currentDriverName)}</span></div>
              <div class="simulation-score-value">${escapeHtml(topSeedScore)}</div>
            </div>
            <div class="simulation-score-row">
              <div><strong>Next Battle</strong><span>${escapeHtml(competitionHeadline)}</span></div>
              <div class="simulation-score-value">${tournamentState?.mainBracket?.rounds?.length ? "LIVE" : "SOON"}</div>
            </div>
            <div class="simulation-score-row">
              <div><strong>Champion Slot</strong><span>${escapeHtml(championName)}</span></div>
              <div class="simulation-score-value">${results.championName ? "SET" : "OPEN"}</div>
            </div>
          </div>
        </article>
        <article class="simulation-summary-card">
          <div class="simulation-summary-top">
            <h3>Good Uses</h3>
            <span class="simulation-status-pill ready">Venue Friendly</span>
          </div>
          <ul class="simulation-note-list">
            <li>Show new spectators what the live event screens look like before battles begin.</li>
            <li>Leave it open on a lobby monitor when qualifying has not started yet.</li>
            <li>Use it as a polished demo when sponsors or drivers ask what the system does.</li>
          </ul>
        </article>
      `;
    }

    function syncBroadcastTicker() {
      if (!broadcastTicker || !broadcastTickerTrack) return;
      const shouldShow = currentRole === "spectator";
      if (!shouldShow) {
        broadcastTicker.classList.add("hidden");
        broadcastTickerTrack.innerHTML = "";
        return;
      }
      const items = buildBroadcastTickerItems();
      if (!items.length) {
        broadcastTicker.classList.add("hidden");
        broadcastTickerTrack.innerHTML = "";
        return;
      }
      const markup = items.map((item, index) => `
        <span class="broadcast-ticker-item">
          ${item}
          ${index < items.length - 1 ? `<span class="broadcast-ticker-divider">/</span>` : ""}
        </span>
      `).join("");
      broadcastTickerTrack.innerHTML = `${markup}${markup}`;
      broadcastTicker.classList.remove("hidden");
    }

    function renderRegistrationForms() {
      if (!registrationForms) return;
      const orderedDrivers = [...getRegisteredDrivers(appDrivers)].sort((left, right) => (left.signUpPosition || 0) - (right.signUpPosition || 0));
      const canEditRegistration = registrationCanEdit();
      const pendingCount = getPendingRegistrations().length;

      if (registrationHeroEventName) registrationHeroEventName.textContent = activeEventMeta?.name || "Main Event";
      if (registrationHeroEventDate) registrationHeroEventDate.textContent = formatEventDate(activeEventMeta?.date);
      if (registrationDriverCount) {
        const count = getRegisteredDrivers(appDrivers).length;
        registrationDriverCount.textContent = `${count} Driver${count === 1 ? "" : "s"}`;
      }
      if (pendingRegistrationCount) {
        pendingRegistrationCount.textContent = `${pendingCount} Pending`;
      }
      syncRegistrationDraftForm();

      if (!orderedDrivers.length) {
        registrationForms.innerHTML = `<div class="empty-state">No drivers submitted yet. Use the form on the left to add the first driver.</div>`;
      } else {
        registrationForms.innerHTML = orderedDrivers.map((driver) => {
          const displayName = driver.name?.trim() ? escapeHtml(driver.name) : "New Driver";
          const teamValue = escapeHtml(driver.teamName || "");
          const chassisValue = escapeHtml(driver.chassis || "");
          const removeDisabled = orderedDrivers.length <= 1 ? "disabled" : "";
          return `
            <article class="registration-card" data-id="${driver.id}">
              <div class="registration-card-header">
                <div class="registration-card-title">
                  <strong>${displayName}</strong>
                  <small>Registration #${driver.signUpPosition}</small>
                </div>
                ${canEditRegistration
                  ? `<div class="role-admin-actions">
                       <button class="micro-button" type="button" data-action="edit-registration-driver">Edit</button>
                       <button class="micro-button" type="button" data-action="remove-registration-driver" ${removeDisabled}>Remove</button>
                     </div>`
                  : ""
                }
              </div>
              <div class="registration-form-grid">
                <div class="modal-field">
                  <span>Driver Name</span>
                  <strong>${displayName}</strong>
                </div>
                <div class="modal-field">
                  <span>Team</span>
                  <strong>${teamValue || "Not provided"}</strong>
                </div>
                <div class="modal-field">
                  <span>Chassis</span>
                  <strong>${chassisValue || "Not provided"}</strong>
                </div>
              </div>
              ${driver.approvedToRosterAt
                ? `<div class="registration-form-note">Approved to roster ${new Date(driver.approvedToRosterAt).toLocaleString()}${driver.selfRegisteredAt ? ` | Self-registered ${new Date(driver.selfRegisteredAt).toLocaleString()}` : ""}</div>`
                : ""
              }
            </article>
          `;
        }).join("");
      }
      renderPendingRegistrationForms();
    }

    function renderPendingRegistrationForms() {
      if (!pendingRegistrationForms) return;
      const canEditRegistration = registrationCanEdit();
      const pendingEntries = getPendingRegistrations();
      if (!pendingEntries.length) {
        pendingRegistrationForms.innerHTML = `<div class="empty-state">No pending self-registrations yet.</div>`;
        return;
      }

      pendingRegistrationForms.innerHTML = pendingEntries.map((entry) => {
        const displayName = entry.name?.trim() ? escapeHtml(entry.name) : "New Driver";
        const teamValue = escapeHtml(entry.teamName || "");
        const chassisValue = escapeHtml(entry.chassis || "");
        const paymentStatus = entry.paidAt ? "Paid" : "Waiting For Payment";
        const submittedMeta = entry.selfRegisteredAt
          ? `Submitted ${new Date(entry.selfRegisteredAt).toLocaleString()}`
          : "Submitted from self-registration";
        const paidMeta = entry.paidAt
          ? ` | Paid ${new Date(entry.paidAt).toLocaleString()}`
          : "";
        const distanceMeta = Number.isFinite(entry.selfRegisteredDistanceMeters)
          ? ` | ${escapeHtml(formatDistanceMeters(entry.selfRegisteredDistanceMeters))} from venue center`
          : "";
        return `
          <article class="registration-card" data-pending-id="${entry.id}">
            <div class="registration-card-header">
              <div class="registration-card-title">
                <strong>${displayName}</strong>
                <small>${paymentStatus}</small>
              </div>
              ${canEditRegistration
                ? `<div class="role-admin-actions">
                     <button class="micro-button" type="button" data-action="toggle-pending-paid">${entry.paidAt ? "Paid" : "Mark Paid & Approve"}</button>
                     <button class="micro-button button-accent" type="button" data-action="approve-pending-registration">Approve To Roster</button>
                     <button class="micro-button" type="button" data-action="remove-pending-registration">Remove</button>
                   </div>`
                : ""
              }
            </div>
            <div class="registration-form-grid">
              <div class="modal-field">
                <span>Driver Name</span>
                <strong>${displayName}</strong>
              </div>
              <div class="modal-field">
                <span>Team</span>
                <strong>${teamValue || "Not provided"}</strong>
              </div>
              <div class="modal-field">
                <span>Chassis</span>
                <strong>${chassisValue || "Not provided"}</strong>
              </div>
            </div>
            <div class="registration-form-note">${submittedMeta}${paidMeta}${distanceMeta}</div>
          </article>
        `;
      }).join("");
    }

    function resetRegistrationDraft() {
      registrationDraft = { name: "", teamName: "", chassis: "" };
      syncRegistrationDraftForm();
      if (registrationDraftName) registrationDraftName.focus();
    }

    function submitRegistrationDraft() {
      if (!registrationCanEdit()) return false;
      const name = registrationDraft.name?.trim() || "";
      if (!name) {
        if (registrationDraftName) registrationDraftName.focus();
        return false;
      }
      const duplicate = findDuplicateDriverEntry(name);
      if (duplicate) {
        window.alert(`${name} already exists in the ${duplicate.type === "roster" ? "live roster" : "pending list"}.`);
        if (registrationDraftName) registrationDraftName.focus();
        return false;
      }
      const nextPosition = getNextSignUpPosition(appDrivers);
      const nextDriver = createEmptyDriver(nextPosition);
      nextDriver.name = name;
      nextDriver.teamName = (registrationDraft.teamName || "").trim();
      nextDriver.chassis = (registrationDraft.chassis || "").trim();
      nextDriver.reg = nextPosition;
      nextDriver.signUpPosition = nextPosition;
      appDrivers = resequenceDrivers([...getRegisteredDrivers(appDrivers), nextDriver], true);
      publishState();
      renderDriversTable();
      resetRegistrationDraft();
      return true;
    }

    function saveVenueConfigDraft() {
      if (!adminCanEdit() || !activeEventMeta) return false;
      const enabled = venueEnabledSelect?.value === "true";
      const latitude = venueLatitudeInput?.value === "" ? null : Number.parseFloat(venueLatitudeInput.value);
      const longitude = venueLongitudeInput?.value === "" ? null : Number.parseFloat(venueLongitudeInput.value);
      const radiusMeters = venueRadiusInput?.value === "" ? 150 : Number.parseFloat(venueRadiusInput.value);
      const closeAt = venueCloseAtInput?.value ? new Date(venueCloseAtInput.value).toISOString() : null;
      const nextConfig = createDefaultVenueConfig({
        enabled,
        label: (venueLabelInput?.value || "").trim(),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? Math.round(radiusMeters) : 150,
        closeAt: closeAt && !Number.isNaN(new Date(closeAt).getTime()) ? closeAt : null,
      });
      activeEventMeta = {
        ...activeEventMeta,
        venueConfig: nextConfig,
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      updateSelfRegistrationState(
        hasValidVenueConfig() ? "locked" : "error",
        hasValidVenueConfig()
          ? "Allow location access and verify you are at the venue to unlock the registration form."
          : "Self-registration is disabled until a valid venue location and radius are saved.",
        false,
      );
      publishState();
      updateEventChrome();
      return true;
    }

    async function checkSelfRegistrationLocation() {
      const venueConfig = getVenueConfig();
      if (!hasValidVenueConfig()) {
        updateSelfRegistrationState("error", "Self-registration is not configured for this event yet.", false);
        syncSelfRegisterForm();
        return;
      }
      if (!navigator.geolocation) {
        updateSelfRegistrationState("error", "This device does not support browser location checks.", false);
        syncSelfRegisterForm();
        return;
      }

      updateSelfRegistrationState("locked", "Checking your location against the venue geofence...", false);
      syncSelfRegisterForm();

      navigator.geolocation.getCurrentPosition((position) => {
        const distanceMeters = calculateDistanceMeters(
          position.coords.latitude,
          position.coords.longitude,
          Number(venueConfig.latitude),
          Number(venueConfig.longitude),
        );
        const withinRadius = distanceMeters <= Number(venueConfig.radiusMeters);
        updateSelfRegistrationState(
          withinRadius ? "ready" : "error",
          withinRadius
            ? `Location confirmed for ${venueConfig.label || activeEventMeta?.name || "this event"}. You are ${formatDistanceMeters(distanceMeters)} from the venue center and can register now.`
            : `You are ${formatDistanceMeters(distanceMeters)} away. Move inside the ${Math.round(Number(venueConfig.radiusMeters) || 0)} meter event zone and try again.`,
          withinRadius,
          distanceMeters,
        );
        syncSelfRegisterForm();
      }, (error) => {
        const errorMap = {
          1: "Location access was denied. Allow location access to self-register.",
          2: "Your location could not be determined. Try again outside or with stronger GPS signal.",
          3: "The location request timed out. Try again in a moment.",
        };
        updateSelfRegistrationState("error", errorMap[error?.code] || "Location check failed. Please try again.", false);
        syncSelfRegisterForm();
      }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    }

    async function submitSelfRegistration() {
      if (!selfRegistrationState.unlocked || !hasValidVenueConfig() || !activeEventMeta) return false;
      const name = (selfRegistrationDraft.name || "").trim();
      if (!name) {
        if (selfRegisterName) selfRegisterName.focus();
        return false;
      }
      const duplicate = findDuplicateDriverEntry(name);
      if (duplicate) {
        updateSelfRegistrationState(
          "error",
          duplicate.type === "roster"
            ? `${name} is already in the live roster. Please check with event staff before registering again.`
            : `${name} is already waiting in the pending check-in list. Please see event staff instead of submitting again.`,
          false,
        );
        syncSelfRegisterForm();
        return false;
      }
      const closeReason = getSelfRegistrationCloseReason();
      if (closeReason) {
        updateSelfRegistrationState(
          "error",
          closeReason === "scheduled-close"
            ? "Registration is closed because the scheduled close time has passed."
            : "Registration is closed because qualifying has already started.",
          false,
        );
        syncSelfRegisterForm();
        return false;
      }
      const nextPendingEntry = {
        id: generateId(),
        name,
        teamName: (selfRegistrationDraft.teamName || "").trim(),
        chassis: (selfRegistrationDraft.chassis || "").trim(),
        selfRegisteredAt: new Date().toISOString(),
        paidAt: null,
        selfRegisteredDistanceMeters: selfRegistrationState.lastDistanceMeters,
      };
      activeEventMeta = {
        ...activeEventMeta,
        pendingRegistrations: [...getPendingRegistrations(), nextPendingEntry],
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      saveCurrentSelfRegisterProfile();
      selfRegistrationDraft = { name: "", teamName: "", chassis: "" };
      updateSelfRegistrationState("locked", `${nextPendingEntry.name} was submitted. Event admin can add this driver to the live roster after payment.`, false);
      await publishStateImmediately();
      renderDriversTable();
      syncSelfRegisterForm();
      return true;
    }

    async function approvePendingRegistration(entryId) {
      if (!registrationCanEdit() || !activeEventMeta) return false;
      const pendingEntries = getPendingRegistrations();
      const nextEntry = pendingEntries.find((entry) => entry.id === entryId);
      if (!nextEntry) return false;
      const duplicate = findDuplicateDriverEntry(nextEntry.name, { excludePendingId: entryId });
      if (duplicate) {
        window.alert(`${nextEntry.name} already exists in the ${duplicate.type === "roster" ? "live roster" : "pending list"}. Remove or rename the duplicate before approving this driver.`);
        return false;
      }

      const nextPosition = getNextSignUpPosition(appDrivers);
      const nextDriver = createEmptyDriver(nextPosition);
      nextDriver.name = nextEntry.name;
      nextDriver.teamName = nextEntry.teamName || "";
      nextDriver.chassis = nextEntry.chassis || "";
      nextDriver.reg = nextPosition;
      nextDriver.signUpPosition = nextPosition;
      nextDriver.selfRegisteredAt = nextEntry.selfRegisteredAt;
      nextDriver.selfRegisteredDistanceMeters = nextEntry.selfRegisteredDistanceMeters;
      nextDriver.paidAt = nextEntry.paidAt || null;
      nextDriver.approvedToRosterAt = new Date().toISOString();

      appDrivers = resequenceDrivers([...getRegisteredDrivers(appDrivers), nextDriver], true);
      activeEventMeta = {
        ...activeEventMeta,
        pendingRegistrations: pendingEntries.filter((entry) => entry.id !== entryId),
        latestApprovalToast: {
          id: `${nextDriver.id}:${nextDriver.approvedToRosterAt}`,
          name: nextDriver.name,
          reg: nextDriver.reg,
          approvedAt: nextDriver.approvedToRosterAt,
        },
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      await publishStateImmediately();
      renderDriversTable();
      return true;
    }

    async function togglePendingRegistrationPaid(entryId) {
      if (!registrationCanEdit() || !activeEventMeta) return false;
      const pendingEntries = getPendingRegistrations();
      const nextEntry = pendingEntries.find((entry) => entry.id === entryId);
      if (!nextEntry) return false;
      if (nextEntry.paidAt) return true;
      const duplicate = findDuplicateDriverEntry(nextEntry.name, { excludePendingId: entryId });
      if (duplicate) {
        window.alert(`${nextEntry.name} already exists in the ${duplicate.type === "roster" ? "live roster" : "pending list"}. Remove or rename the duplicate before approving this driver.`);
        return false;
      }

      const paidAt = new Date().toISOString();
      const nextPosition = getNextSignUpPosition(appDrivers);
      const nextDriver = createEmptyDriver(nextPosition);
      nextDriver.name = nextEntry.name;
      nextDriver.teamName = nextEntry.teamName || "";
      nextDriver.chassis = nextEntry.chassis || "";
      nextDriver.reg = nextPosition;
      nextDriver.signUpPosition = nextPosition;
      nextDriver.selfRegisteredAt = nextEntry.selfRegisteredAt;
      nextDriver.selfRegisteredDistanceMeters = nextEntry.selfRegisteredDistanceMeters;
      nextDriver.paidAt = paidAt;
      nextDriver.approvedToRosterAt = paidAt;

      appDrivers = resequenceDrivers([...getRegisteredDrivers(appDrivers), nextDriver], true);
      activeEventMeta = {
        ...activeEventMeta,
        pendingRegistrations: pendingEntries.filter((entry) => entry.id !== entryId),
        latestApprovalToast: {
          id: `${nextDriver.id}:${paidAt}`,
          name: nextDriver.name,
          reg: nextDriver.reg,
          approvedAt: paidAt,
        },
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      await publishStateImmediately();
      renderDriversTable();
      return true;
    }

    async function removePendingRegistration(entryId) {
      if (!registrationCanEdit() || !activeEventMeta) return false;
      const pendingEntries = getPendingRegistrations();
      if (!pendingEntries.some((entry) => entry.id === entryId)) return false;
      activeEventMeta = {
        ...activeEventMeta,
        pendingRegistrations: pendingEntries.filter((entry) => entry.id !== entryId),
      };
      eventDirectory[activeEventId] = cloneEventMeta(activeEventMeta);
      await publishStateImmediately();
      renderDriversTable();
      return true;
    }

    function buildEventArchiveMarkup(eventMeta, includeAdminControls = false) {
      const results = eventMeta.results || buildEmptyEventResults();
      const championText = results.championName ? `#${results.championSeed} ${escapeHtml(results.championName)}` : "Waiting for winner";
      const thirdPlaceText = results.thirdPlaceName ? `#${results.thirdPlaceSeed} ${escapeHtml(results.thirdPlaceName)}` : "Waiting for battle";
      const completionMeta = results.completedAt ? `Completed ${formatEventDate(results.completedAt.slice(0, 10))}` : "In progress";
      const statusTone = eventMeta.status === "archived" ? "archived" : results.completedAt ? "active" : "active";
      const statusLabel = eventMeta.status === "archived" ? "Archived" : results.completedAt ? "Completed" : "Active";
      const openLabel = eventMeta.id === activeEventId ? "Current" : "Open";
      const isCurrent = eventMeta.id === activeEventId;

      return `
        <article class="event-card ${isCurrent ? "is-active" : ""}">
          <div class="event-card-head">
            <div>
              <strong>${escapeHtml(eventMeta.name)}</strong>
              <div class="event-card-meta">${formatEventDate(eventMeta.date)} | ${escapeHtml(results.planDescription || "Waiting for qualifying scores.")}</div>
              <div class="event-card-meta">${escapeHtml(completionMeta)}</div>
            </div>
            <span class="status-pill ${statusTone}">${statusLabel}</span>
          </div>
          <div class="event-card-grid">
            <div class="event-stat">
              <span>Champion</span>
              <strong>${championText}</strong>
            </div>
            <div class="event-stat">
              <span>3rd Place</span>
              <strong>${thirdPlaceText}</strong>
            </div>
            <div class="event-stat">
              <span>Entries</span>
              <strong>${results.totalDrivers || 0}</strong>
            </div>
          </div>
          <div class="event-card-actions">
            <button class="micro-button ${isCurrent ? "" : "button-accent"}" type="button" data-action="open-event" data-event-id="${eventMeta.id}" ${isCurrent ? "disabled" : ""}>${openLabel}</button>
            ${includeAdminControls
              ? `<button class="micro-button" type="button" data-action="open-event-view" data-event-id="${eventMeta.id}" data-view="qualifying">View Qualifying</button>
                 <button class="micro-button" type="button" data-action="open-event-view" data-event-id="${eventMeta.id}" data-view="bracket">View Bracket</button>`
              : ""
            }
            ${includeAdminControls && isCurrent && currentRole === "admin"
              ? `<button class="micro-button" type="button" data-action="toggle-archive">${eventMeta.status === "archived" ? "Archived" : "Archive Event"}</button>`
              : ""
            }
            ${includeAdminControls && isWebsiteAdmin && Object.keys(eventDirectory).length > 1
              ? `<button class="micro-button" type="button" data-action="delete-event" data-event-id="${eventMeta.id}">Delete Event</button>`
              : ""
            }
          </div>
        </article>
      `;
    }

    function buildResultsArchiveMarkup(eventMeta) {
      const results = eventMeta.results || buildEmptyEventResults();
      const championText = results.championName ? `#${results.championSeed} ${escapeHtml(results.championName)}` : "Waiting for winner";
      const thirdPlaceText = results.thirdPlaceName ? `#${results.thirdPlaceSeed} ${escapeHtml(results.thirdPlaceName)}` : "Waiting for battle";
      const completionMeta = results.completedAt ? `Completed ${formatEventDate(results.completedAt.slice(0, 10))}` : "In progress";
      const isCurrent = eventMeta.id === activeEventId;

      return `
        <article class="event-card ${isCurrent ? "is-active" : ""}">
          <div class="event-card-head">
            <div>
              <strong>${escapeHtml(eventMeta.name)}</strong>
              <div class="event-card-meta">${formatEventDate(eventMeta.date)} | ${escapeHtml(results.planDescription || "Waiting for qualifying scores.")}</div>
              <div class="event-card-meta">${escapeHtml(completionMeta)}</div>
            </div>
            <span class="status-pill ${results.completedAt ? "active" : "archived"}">${results.completedAt ? "Completed" : "In Progress"}</span>
          </div>
          <div class="event-card-grid">
            <div class="event-stat">
              <span>1st Place</span>
              <strong>${championText}</strong>
            </div>
            <div class="event-stat">
              <span>3rd Place</span>
              <strong>${thirdPlaceText}</strong>
            </div>
            <div class="event-stat">
              <span>Entries</span>
              <strong>${results.totalDrivers || 0}</strong>
            </div>
          </div>
        </article>
      `;
    }

    function renderEventDirectory() {
      const events = sortEventsForDisplay();

      eventSelect.innerHTML = events.map((eventMeta) => `
        <option value="${eventMeta.id}" ${eventMeta.id === activeEventId ? "selected" : ""}>
          ${escapeHtml(eventMeta.name)}${eventMeta.status === "archived" ? " (Archived)" : ""}
        </option>
      `).join("");

      updateEventChrome();

      if (!events.length) {
        if (eventArchiveList) {
          eventArchiveList.textContent = "Create a new event to start building your competition archive.";
          eventArchiveList.classList.add("empty-state");
        }
        if (websiteAdminEventList) {
          websiteAdminEventList.textContent = isWebsiteAdmin
            ? "Create a new event to start building your event directory."
            : "Unlock website admin access to manage events.";
          websiteAdminEventList.classList.add("empty-state");
        }
        return;
      }

      if (eventArchiveList) {
        eventArchiveList.classList.remove("empty-state");
        eventArchiveList.innerHTML = events.map((eventMeta) => buildEventArchiveMarkup(eventMeta, false)).join("");
      }

      if (websiteAdminEventList) {
        websiteAdminEventList.classList.toggle("empty-state", !isWebsiteAdmin);
        websiteAdminEventList.innerHTML = isWebsiteAdmin
          ? events.map((eventMeta) => buildEventArchiveMarkup(eventMeta, true)).join("")
          : `<div class="admin-lock-note">Unlock website admin access to create, open, archive, or delete events.</div>`;
      }

      if (resultsEventList) {
        const resultEvents = [...events].filter((eventMeta) => {
          const results = eventMeta.results || {};
          return Boolean(results.completedAt || results.championName || eventMeta.status === "archived");
        });
        if (!resultEvents.length) {
          resultsEventList.textContent = "Completed events and saved results will appear here.";
          resultsEventList.classList.add("empty-state");
        } else {
          resultsEventList.classList.remove("empty-state");
          resultsEventList.innerHTML = resultEvents.map((eventMeta) => buildResultsArchiveMarkup(eventMeta)).join("");
        }
      }
    }

    function renderRoleAdminPanel() {
      if (!activeEventMeta) {
        roleAdminPanel.textContent = "Create an event to manage role access.";
        roleAdminPanel.classList.add("empty-state");
        return;
      }

      if (!isWebsiteAdmin) {
        roleAdminPanel.textContent = "Sign in as the website admin to manage role passwords.";
        roleAdminPanel.classList.add("empty-state");
        return;
      }

      roleAdminPanel.classList.remove("empty-state");
      const cards = ROLE_ORDER.filter((role) => isRoleAvailableForEvent(role, activeEventMeta)).map((role) => {
        const access = getRoleAccess(role) || {};
        const hasPassword = Boolean(access.passwordHash);
        const claimedText = hasPassword ? `Password set | ${formatClaimedAt(access.claimedAt)}` : "Password not set yet";
        const routeUrl = buildRoleRouteUrl(role);
        return `
          <article class="role-admin-card">
            <div class="role-admin-head">
              <div class="role-admin-title">
                <strong>${escapeHtml(getRoleDisplayName(role))}</strong>
                <small>${claimedText}</small>
              </div>
              <span class="status-pill ${hasPassword ? "active" : "archived"}">${hasPassword ? "Ready" : "Locked"}</span>
            </div>
            <div>
              <div class="invite-code-label">Role access</div>
              <div class="invite-code-box">
                <div class="invite-code-value">${hasPassword ? "Password set in admin panel" : "Website admin must set a password"}</div>
                <button class="micro-button button-accent" type="button" data-action="set-role-password" data-role="${role}" ${isEventReadOnly() ? "disabled" : ""}>${hasPassword ? "Change Password" : "Set Password"}</button>
              </div>
            </div>
            <div>
              <div class="invite-code-label">Direct route</div>
              <div class="invite-code-box">
                <a class="invite-code-value route-link-value" href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(routeUrl)}</a>
                <button class="micro-button" type="button" data-action="copy-role-route" data-role="${role}">Copy Link</button>
              </div>
            </div>
            <div class="role-admin-actions">
              ${(role === "admin" || role.startsWith("j")) ? `<button class="micro-button" type="button" data-action="rename-role" data-role="${role}" ${isEventReadOnly() ? "disabled" : ""}>Edit Name</button>` : ""}
              <button class="micro-button" type="button" data-action="reset-role-access" data-role="${role}" ${isEventReadOnly() ? "disabled" : ""}>Clear Password</button>
            </div>
          </article>
        `;
      }).join("");

      roleAdminPanel.innerHTML = `
        <div class="role-admin-toolbar">
          <div class="helper-text">Each event keeps its own judge count, judge names, role passwords, and direct role routes. Share the judge or event admin link and they will land on the correct access page for the live event.</div>
          <button class="micro-button button-accent" type="button" data-action="reset-all-judges" ${isEventReadOnly() ? "disabled" : ""}>Clear All Judge Passwords</button>
        </div>
        ${cards}
      `;
    }

    function showPasswordModal(role) {
      if (!activeEventMeta) {
        globalRoleSelect.value = currentRole;
        return;
      }

      pendingRole = role;
      const access = getRoleAccess(role);
      const hasPassword = Boolean(access?.passwordHash);
      pendingAuthMode = "login";
      const roleDisplayName = getRoleDisplayName(role);

      document.getElementById("passwordModalTitle").textContent = `${roleDisplayName} Login`;
      passwordModalCopy.textContent = `Enter the ${roleDisplayName.toLowerCase()} password for ${activeEventMeta.name}.`;
      authInviteGroup.classList.add("hidden");
      authConfirmInput.classList.add("hidden");
      passwordHelperText.classList.remove("hidden");
      passwordHelperText.textContent = hasPassword
        ? "The website admin password also works as a master override for this role."
        : `No ${roleDisplayName.toLowerCase()} password has been set for this event yet. Use the website admin password as the master override.`;
      passwordSubmitBtn.textContent = "Unlock";
      passwordInput.placeholder = "Enter password...";
      passwordInput.value = "";
      authInviteInput.value = "";
      authConfirmInput.value = "";
      passwordError.style.display = "none";
      openModal(passwordModal, passwordInput);
    }

    function hidePasswordModal() {
      closeModal(passwordModal);
      globalRoleSelect.value = currentRole;
      passwordInput.value = "";
      authInviteInput.value = "";
      authConfirmInput.value = "";
      passwordError.style.display = "none";
      passwordSubmitInFlight = false;
      passwordSubmitBtn.disabled = false;
      pendingRole = null;
      pendingRouteView = null;
      syncRouteWithState();
    }

    function requestRoleAccess(role) {
      if (!isRoleAllowedForHost(role)) {
        globalRoleSelect.value = currentRole;
        return;
      }
      if (role === "spectator") {
        applyRoleChange("spectator");
        return;
      }
      if (!isRoleAvailableForEvent(role)) {
        globalRoleSelect.value = currentRole;
        return;
      }
      if (role?.startsWith("j") && isJudgeAccessLocked()) {
        globalRoleSelect.value = currentRole;
        return;
      }
      if (isRoleUnlockedForEvent(activeEventId, role)) {
        applyRoleChange(role);
        return;
      }
      showPasswordModal(role);
    }

    function syncCreateEventJudgeFields() {
      const judgeCount = normalizeJudgeCount(judgeCountInput.value);
      createEventInviteFields.forEach((field) => {
        field.style.display = "none";
      });
      document.querySelectorAll(".judge-config-field").forEach((field) => {
        const role = field.dataset.judgeField;
        const roleIndex = JUDGE_ROLE_ORDER.indexOf(role);
        const shouldShow = roleIndex > -1 && roleIndex < judgeCount;
        if (field.querySelector(".invite-code-input")) {
          field.style.display = "none";
        } else {
          field.style.display = shouldShow ? "" : "none";
        }
      });
    }

    function primeCreateEventModal() {
      eventNameInput.value = "";
      eventDateInput.value = new Date().toISOString().slice(0, 10);
      judgeCountInput.value = "3";
      adminInviteInput.value = "";
      adminInviteInput.disabled = true;
      judge1NameInput.value = "Judge 1";
      judge1InviteInput.value = "";
      judge1InviteInput.disabled = true;
      judge2NameInput.value = "Judge 2";
      judge2InviteInput.value = "";
      judge2InviteInput.disabled = true;
      judge3NameInput.value = "Judge 3";
      judge3InviteInput.value = "";
      judge3InviteInput.disabled = true;
      createEventError.style.display = "none";
      syncCreateEventJudgeFields();
    }

    function showCreateEventModal() {
      primeCreateEventModal();
      openModal(createEventModal, eventNameInput);
    }

    function hideCreateEventModal() {
      closeModal(createEventModal);
      createEventError.style.display = "none";
    }

    async function setRolePassword(role) {
      if (!activeEventMeta || !activeEventMeta.roleAccess?.[role]) return;
      const roleDisplayName = getRoleDisplayName(role);
      const firstEntry = window.prompt(`Set a password for ${roleDisplayName}.`, "");
      if (firstEntry === null) return;
      const nextPassword = firstEntry.trim();
      if (nextPassword.length < 6) {
        window.alert("Use a password with at least 6 characters.");
        return;
      }
      const confirmEntry = window.prompt(`Confirm the password for ${roleDisplayName}.`, "");
      if (confirmEntry === null) return;
      if (nextPassword !== confirmEntry.trim()) {
        window.alert("The passwords did not match.");
        return;
      }

      activeEventMeta.roleAccess[role] = {
        ...(activeEventMeta.roleAccess[role] || {}),
        inviteCode: null,
        inviteHash: null,
        passwordHash: await hashSecret(nextPassword),
        claimedAt: new Date().toISOString(),
      };

      publishState();
      renderEventDirectory();
      renderRoleAdminPanel();
    }

    async function resetRoleAccess(role) {
      if (!activeEventMeta || !activeEventMeta.roleAccess?.[role]) return;
      activeEventMeta.roleAccess[role] = {
        ...(activeEventMeta.roleAccess[role] || {}),
        inviteCode: null,
        inviteHash: null,
        passwordHash: null,
        claimedAt: null,
      };
      setRoleUnlockedForEvent(activeEventId, role, false);

      if (currentRole === role) {
        applyRoleChange("spectator");
      }

      publishState();
      renderEventDirectory();
      renderRoleAdminPanel();
    }

    async function resetAllJudgeAccess() {
      if (!activeEventMeta) return;
      for (const role of getActiveJudgeRoles(activeEventMeta)) {
        activeEventMeta.roleAccess[role] = {
          ...(activeEventMeta.roleAccess[role] || {}),
          inviteCode: null,
          inviteHash: null,
          passwordHash: null,
          claimedAt: null,
        };
        setRoleUnlockedForEvent(activeEventId, role, false);
        if (currentRole === role) {
          applyRoleChange("spectator");
        }
      }
      publishState();
      renderEventDirectory();
      renderRoleAdminPanel();
    }

    async function renameManagedRole(role) {
      if (!isWebsiteAdmin || isEventReadOnly() || !activeEventMeta) return;
      if (role !== "admin" && !role?.startsWith("j")) return;
      const currentName = activeEventMeta.roleNames?.[role] || ROLE_LABELS[role] || role;
      const nextNameInput = window.prompt(`Enter the display name for ${currentName}.`, currentName);
      if (nextNameInput === null) return;
      const nextName = nextNameInput.trim();
      if (!nextName) {
        window.alert("Role name cannot be blank.");
        return;
      }
      activeEventMeta.roleNames = buildDefaultRoleNames({
        ...(activeEventMeta.roleNames || {}),
        [role]: nextName,
      });
      publishState();
      renderEventDirectory();
      renderRoleAdminPanel();
      renderDriversTable();
    }

    async function editRegistrationDriver(driverId) {
      if (!registrationCanEdit()) return;
      const driver = appDrivers.find((entry) => entry.id === driverId);
      if (!driver) return;
      const nextNameInput = window.prompt("Edit driver name.", driver.name || "");
      if (nextNameInput === null) return;
      const nextName = nextNameInput.trim();
      if (!nextName) {
        window.alert("Driver name cannot be blank.");
        return;
      }
      const duplicate = findDuplicateDriverEntry(nextName, { excludeDriverId: driver.id });
      if (duplicate) {
        window.alert(`${nextName} already exists in the ${duplicate.type === "roster" ? "live roster" : "pending list"}.`);
        return;
      }
      const nextTeamInput = window.prompt(`Edit team for ${nextName}.`, driver.teamName || "");
      if (nextTeamInput === null) return;
      const nextChassisInput = window.prompt(`Edit chassis for ${nextName}.`, driver.chassis || "");
      if (nextChassisInput === null) return;

      driver.name = nextName;
      driver.teamName = nextTeamInput.trim();
      driver.chassis = nextChassisInput.trim();
      publishState();
      renderDriversTable();
    }

    async function deleteEventById(eventId) {
      if (!isWebsiteAdmin || !eventDirectory[eventId]) return;
      const eventIds = Object.keys(eventDirectory);
      if (eventIds.length <= 1) {
        window.alert("Create another event before deleting the last remaining event.");
        return;
      }

      const eventName = eventDirectory[eventId].name || "this event";
      const confirmed = window.confirm(`Delete "${eventName}" permanently? This removes its saved results and bracket data.`);
      if (!confirmed) return;

      if (activeEventId === eventId && eventDocUnsubscribe) {
        eventDocUnsubscribe();
        eventDocUnsubscribe = null;
      }

      delete eventDirectory[eventId];
      localStorage.removeItem(getEventStateStorageKey(eventId));

      if (eventId === DEFAULT_EVENT_ID) {
        localStorage.removeItem("rc-drift-drivers-v7");
        localStorage.removeItem("rc-drift-drivers-v6");
        localStorage.removeItem("rc-drift-bracket-state-v7");
        localStorage.removeItem("rc-drift-bracket-state-v6");
      }

      const roleSessionMap = readRoleSessionMap();
      if (roleSessionMap[eventId]) {
        delete roleSessionMap[eventId];
        writeRoleSessionMap(roleSessionMap);
      }

      const roleUnlockMap = readRoleUnlockMap();
      if (roleUnlockMap[eventId]) {
        delete roleUnlockMap[eventId];
        writeRoleUnlockMap(roleUnlockMap);
      }

      if (activeEventId === eventId) {
        activeEventId = sortEventsForDisplay()[0]?.id || Object.keys(eventDirectory)[0] || null;
        activeEventMeta = activeEventId ? cloneEventMeta(eventDirectory[activeEventId]) : null;
        loadActiveEventStateFromCache();
        applyRoleChange("spectator");
      }

      saveDirectoryCache();
      renderEventDirectory();
      renderRoleAdminPanel();
      renderDriversTable();
      if (document.getElementById('view-bracket').classList.contains('is-active')) {
        renderBracket();
      }

      if (!db) return;

      lastLocalPush = Date.now();
      try {
        await Promise.all([
          deleteDoc(getEventDocRef(eventId)),
          setDoc(getActiveEventSelectionDocRef(), {
            activeEventId,
            eventMeta: activeEventId ? cloneEventMeta(eventDirectory[activeEventId] || activeEventMeta) : null,
            syncStamp: lastLocalPush,
          }, { merge: true }),
          setDoc(getDirectoryDocRef(), {
            events: eventDirectory,
            activeEventId,
            syncStamp: lastLocalPush,
          }),
        ]);
      } catch (error) {
        console.error("Event delete sync failed:", error);
      }

      if (activeEventId) {
        subscribeToActiveEvent();
      }
    }

    function applyRoleChange(newRole) {
      const pendingView = pendingRouteView;
      pendingRouteView = null;
      const forcedRole = getForcedRoleForHost();
      if (forcedRole && newRole !== forcedRole && newRole !== "spectator") {
        newRole = forcedRole;
      }
      if (!isRoleAvailableForEvent(newRole, activeEventMeta)) {
        newRole = "spectator";
      }
      if (!canApplyRoleForEvent(activeEventId, newRole, activeEventMeta)) {
        newRole = "spectator";
      }
      if ((newRole?.startsWith("j") && isJudgeAccessLocked()) && newRole !== "spectator") {
        newRole = "spectator";
      }
      const requestedView = pendingView ? normalizeRouteViewForRole(newRole, pendingView) : null;
      currentRole = newRole;
      saveRoleForEvent(activeEventId, currentRole);
      globalRoleSelect.value = currentRole;
      document.body.dataset.role = currentRole;
      syncThemeState();
      
      if (currentRole.startsWith("j")) {
         judgeLaneIndex = 0;
         document.getElementById("judgeHeroTitle").textContent = `${getRoleDisplayName(currentRole)} Input`;
         document.getElementById("thRun1").textContent = getAverageColumnLabel(1, currentRole, activeEventMeta);
         document.getElementById("thRun2").textContent = getAverageColumnLabel(2, currentRole, activeEventMeta);
         switchView("qualifying");
      } else {
          document.getElementById("thRun1").textContent = getAverageColumnLabel(1, currentRole, activeEventMeta);
          document.getElementById("thRun2").textContent = getAverageColumnLabel(2, currentRole, activeEventMeta);
          if (currentRole !== "admin" && document.getElementById("view-registration").classList.contains("is-active")) {
            switchView("qualifying");
          }
       }
      syncWebsiteAdminButtonVisibility();
      updateEventChrome();
      renderRoleAdminPanel();
      renderDriversTable();
      if (requestedView && getActiveViewName() !== requestedView) {
        switchView(requestedView);
        return;
      }
      syncRouteWithState();
    }

    passwordSubmitBtn.addEventListener("click", async () => {
      if (!pendingRole || !activeEventMeta || passwordSubmitInFlight) return;

      passwordSubmitInFlight = true;
      passwordSubmitBtn.disabled = true;

      const selectedRole = pendingRole;
      const access = getRoleAccess(pendingRole);
      const passwordValue = passwordInput.value.trim();
      const passwordHash = await hashSecret(passwordValue);

      if (isMasterPasswordHash(passwordHash)) {
        hidePasswordModal();
        setRoleUnlockedForEvent(activeEventId, selectedRole, true);
        applyRoleChange(selectedRole);
        renderEventDirectory();
        renderRoleAdminPanel();
        return;
      }

      if (!access?.passwordHash || passwordHash !== access.passwordHash) {
        passwordError.textContent = "Incorrect password.";
        passwordError.style.display = "block";
        passwordSubmitInFlight = false;
        passwordSubmitBtn.disabled = false;
        return;
      }

      hidePasswordModal();
      setRoleUnlockedForEvent(activeEventId, selectedRole, true);
      applyRoleChange(selectedRole);
    });

    passwordCancelBtn.addEventListener("click", hidePasswordModal);

    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") passwordSubmitBtn.click();
      if (e.key === "Escape") hidePasswordModal();
    });
    authInviteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") passwordSubmitBtn.click();
      if (e.key === "Escape") hidePasswordModal();
    });
    authConfirmInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") passwordSubmitBtn.click();
      if (e.key === "Escape") hidePasswordModal();
    });

    createEventSubmitBtn.addEventListener("click", async () => {
      if (!isWebsiteAdmin) return;
      const name = eventNameInput.value.trim();
      const date = eventDateInput.value;
      const judgeCount = normalizeJudgeCount(judgeCountInput.value);
      const invites = { admin: "", j1: "", j2: "", j3: "" };
      const roleNames = {
        j1: judge1NameInput.value.trim(),
        j2: judge2NameInput.value.trim(),
        j3: judge3NameInput.value.trim(),
      };

      if (!name || !date) {
        createEventError.textContent = "Complete the event name and date before creating the competition.";
        createEventError.style.display = "block";
        return;
      }

      const eventMeta = await createEventRecord({ name, date, invites, roleNames, judgeCount });
      eventDirectory[eventMeta.id] = eventMeta;
      activeEventId = eventMeta.id;
      activeEventMeta = cloneEventMeta(eventMeta);
      appDrivers = createDriverSet();
      tournamentState = null;
      qualifyingFlow = createEmptyQualifyingFlow();
      syncQualifyingFlowState();
      bracketModeSelect.value = FORMAT_CLASSIC;
      lowerCountInput.value = "0";
      lowerCountContainer.style.display = "none";
      saveDirectoryCache();
      saveEventStateCache();
      publishState();
      renderEventDirectory();
      hideCreateEventModal();
      switchView("registration");
      applyRoleChange("spectator");
      renderDriversTable();
      publishActiveEventSelection();
      globalRoleSelect.value = "admin";
      showPasswordModal("admin");
    });

    createEventCancelBtn.addEventListener("click", hideCreateEventModal);
    judgeCountInput.addEventListener("change", syncCreateEventJudgeFields);
    newEventBtn.addEventListener("click", showCreateEventModal);
    websiteAdminBtn.addEventListener("click", openWebsiteAdminAccess);
    themeToggleBtn?.addEventListener("click", () => {
      applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
    });
    websiteAdminNewEventBtn.addEventListener("click", () => {
      if (!isWebsiteAdmin) return;
      showCreateEventModal();
    });
    websiteAdminBackBtn.addEventListener("click", () => switchView("registration"));
    websiteAdminSignOutBtn.addEventListener("click", () => setWebsiteAdminAccess(false));
    websiteAdminSubmitBtn.addEventListener("click", async () => {
      const enteredHash = await hashSecret(websiteAdminPasswordInput.value.trim());
      if (enteredHash !== WEBSITE_ADMIN_PASSWORD_HASH) {
        websiteAdminError.style.display = "block";
        return;
      }
      hideWebsiteAdminModal();
      setWebsiteAdminAccess(true);
      switchView("website-admin");
    });
    websiteAdminCancelBtn.addEventListener("click", hideWebsiteAdminModal);
    websiteAdminPasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") websiteAdminSubmitBtn.click();
      if (e.key === "Escape") hideWebsiteAdminModal();
    });
    buildLabel?.addEventListener("click", registerWebsiteAdminHiddenTap);
    buildLabel?.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openWebsiteAdminAccess();
    });
    document.getElementById("syncStatus")?.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openWebsiteAdminAccess();
    });
    document.querySelectorAll(".hero-logo").forEach((logoEl) => {
      logoEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        openWebsiteAdminAccess();
      });
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === "a") {
        e.preventDefault();
        openWebsiteAdminAccess();
      }
    });
    pdfPreviewCloseBtn?.addEventListener("click", hidePdfPreview);
    pdfPreviewModal?.addEventListener("click", (e) => {
      if (e.target === pdfPreviewModal) hidePdfPreview();
    });
    
    // Role Switching Listener
    const handleRoleSelection = (value) => {
      const selectedRole = value || "spectator";
      if (selectedRole === currentRole && selectedRole !== "spectator") {
        requestRoleAccess(selectedRole);
        return;
      }
      requestRoleAccess(selectedRole);
    };

    globalRoleSelect.addEventListener("change", (e) => {
      handleRoleSelection(e.target.value);
    });
    window.addEventListener("pageshow", () => {
      syncForcedHostContext();
      globalRoleSelect.value = currentRole;
    });
    window.addEventListener("hashchange", () => {
      applyRouteFromLocation();
    });

    function openEventById(nextId, nextView = null, publishSelection = true) {
      if (!nextId || nextId === activeEventId || !eventDirectory[nextId]) {
        if (nextView) switchView(nextView);
        return;
      }
      localEventPreviewMode = !publishSelection;
      activeEventId = nextId;
      loadActiveEventStateFromCache();
      applyRoleChange(resolveRoleForActiveEventSwitch(activeEventId, currentRole));
      saveDirectoryCache();
      renderEventDirectory();
      renderRoleAdminPanel();
      renderDriversTable();
      if (document.getElementById('view-bracket').classList.contains('is-active')) {
        renderBracket();
      }
      subscribeToActiveEvent();
      if (publishSelection) {
        publishActiveEventSelection();
      }
      if (nextView) {
        switchView(nextView);
      }
    }

    eventSelect.addEventListener("change", () => {
      openEventById(eventSelect.value);
    });

    const handleEventArchiveClick = (e) => {
      const openButton = e.target.closest("[data-action='open-event']");
      const openViewButton = e.target.closest("[data-action='open-event-view']");
      const archiveButton = e.target.closest("[data-action='toggle-archive']");
      const deleteButton = e.target.closest("[data-action='delete-event']");

      if (openButton) {
        eventSelect.value = openButton.dataset.eventId;
        openEventById(openButton.dataset.eventId);
        return;
      }

      if (openViewButton) {
        const eventId = openViewButton.dataset.eventId;
        const viewName = openViewButton.dataset.view === "bracket" ? "bracket" : "qualifying";
        eventSelect.value = eventId;
        openEventById(eventId, viewName, false);
        return;
      }

      if (deleteButton) {
        deleteEventById(deleteButton.dataset.eventId);
        return;
      }

      if (archiveButton && currentRole === "admin" && activeEventMeta) {
        activeEventMeta.status = activeEventMeta.status === "archived" ? "active" : "archived";
        if (activeEventMeta.status === "archived") {
          applyRoleChange("spectator");
        }
        publishState();
        renderEventDirectory();
        renderRoleAdminPanel();
        renderDriversTable();
        if (document.getElementById('view-bracket').classList.contains('is-active')) {
          renderBracket();
        }
      }
    };

    if (eventArchiveList) {
      eventArchiveList.addEventListener("click", handleEventArchiveClick);
    }
    if (websiteAdminEventList) {
      websiteAdminEventList.addEventListener("click", handleEventArchiveClick);
    }

    roleAdminPanel.addEventListener("click", async (e) => {
      const setPasswordButton = e.target.closest("[data-action='set-role-password']");
      const resetButton = e.target.closest("[data-action='reset-role-access']");
      const resetAllButton = e.target.closest("[data-action='reset-all-judges']");
      const renameRoleButton = e.target.closest("[data-action='rename-role']");
      const copyRouteButton = e.target.closest("[data-action='copy-role-route']");

      if (setPasswordButton && isWebsiteAdmin && !isEventReadOnly()) {
        await setRolePassword(setPasswordButton.dataset.role);
        return;
      }

      if (resetAllButton && isWebsiteAdmin && !isEventReadOnly()) {
        await resetAllJudgeAccess();
        return;
      }

      if (renameRoleButton && isWebsiteAdmin && !isEventReadOnly()) {
        await renameManagedRole(renameRoleButton.dataset.role);
        return;
      }

      if (copyRouteButton && isWebsiteAdmin) {
        await copyRoleRoute(copyRouteButton.dataset.role);
        return;
      }

      if (resetButton && isWebsiteAdmin && !isEventReadOnly()) {
        await resetRoleAccess(resetButton.dataset.role);
      }
    });

    document.querySelectorAll('.mode-tab[data-target]').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (currentRole.startsWith('j')) return; 
        if (e.target.dataset.target === "simulation") {
          const demoWindow = openStandaloneDemoWindow();
          if (!demoWindow) {
            switchView("simulation");
          }
          return;
        }
        switchView(e.target.dataset.target);
      });
    });

    openStandaloneDemoWindowBtn?.addEventListener("click", () => {
      const demoWindow = openStandaloneDemoWindow();
      if (!demoWindow) {
        window.alert("The demo window was blocked by your browser. Allow pop-ups for this site and try again.");
      }
    });

    document.querySelectorAll('[data-simulation-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        switchView(button.dataset.simulationJump);
      });
    });

    document.querySelectorAll('[data-bracket-page]').forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!tournamentState?.mainBracket) return;
        if (tab.dataset.bracketPage === "lower" && !tournamentState?.lowerBracket) return;
        activeCompetitionBracketPage = tab.dataset.bracketPage;
        updateCompetitionBracketPage();
      });
    });

    document.getElementById("backToQualifyingBtn").addEventListener("click", () => switchView("qualifying"));
    document.getElementById("mobileBackToQualifyingBtn")?.addEventListener("click", () => switchView("qualifying"));

    async function toggleBracketFullscreen() {
      if (window.innerWidth <= 720) return;
      const bracketView = document.getElementById("view-bracket");
      if (!bracketView) return;

      try {
        if (document.fullscreenElement === bracketView) {
          await document.exitFullscreen();
        } else {
          await bracketView.requestFullscreen();
        }
      } catch (error) {
        console.warn("Fullscreen toggle failed", error);
      }
    }

    function syncBracketFullscreenState() {
      const bracketView = document.getElementById("view-bracket");
      const isFullscreen = document.fullscreenElement === bracketView;
      document.body.classList.toggle("bracket-fullscreen", isFullscreen);
      if (fullscreenBracketBtn) {
        fullscreenBracketBtn.innerHTML = `${isFullscreen ? "?" : "?"}<span class="icon-label">Fullscreen</span>`;
        fullscreenBracketBtn.setAttribute("title", isFullscreen ? "Exit fullscreen" : "Toggle fullscreen");
        fullscreenBracketBtn.setAttribute("aria-label", isFullscreen ? "Exit fullscreen bracket" : "Toggle fullscreen bracket");
      }
      requestAnimationFrame(fitAllBracketBoards);
    }

    fullscreenBracketBtn?.addEventListener("click", toggleBracketFullscreen);
    document.addEventListener("fullscreenchange", syncBracketFullscreenState);
    resultsExportPdfBtn?.addEventListener("click", exportResultsPdf);

    async function toggleQualifyingFullscreen() {
      if (window.innerWidth <= 720) return;
      const qualifyingView = document.getElementById("view-qualifying");
      if (!qualifyingView) return;

      try {
        if (document.fullscreenElement === qualifyingView) {
          await document.exitFullscreen();
        } else {
          await qualifyingView.requestFullscreen();
        }
      } catch (error) {
        console.warn("Qualifying fullscreen toggle failed", error);
      }
    }

    function syncQualifyingFullscreenState() {
      const qualifyingView = document.getElementById("view-qualifying");
      const isFullscreen = document.fullscreenElement === qualifyingView;
      document.body.classList.toggle("qualifying-fullscreen", isFullscreen);
      if (fullscreenQualifyingBtn) {
        fullscreenQualifyingBtn.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen Qualifying";
      }
      updateQualifyingDensity();
      syncQualifyingCurrentDriverIntoView();
    }

    fullscreenQualifyingBtn?.addEventListener("click", toggleQualifyingFullscreen);
    document.addEventListener("fullscreenchange", syncQualifyingFullscreenState);

    async function toggleSelfRegisterDisplayFullscreen() {
      if (window.innerWidth <= 720) return;
      const displayView = document.getElementById("view-self-register-display");
      if (!displayView) return;
      try {
        if (document.fullscreenElement === displayView) {
          await document.exitFullscreen();
        } else {
          await displayView.requestFullscreen();
        }
      } catch (error) {
        console.warn("Self-register display fullscreen toggle failed", error);
      }
    }

    function syncSelfRegisterDisplayFullscreenState() {
      const displayView = document.getElementById("view-self-register-display");
      const isFullscreen = document.fullscreenElement === displayView;
      document.body.classList.toggle("self-register-display-fullscreen", isFullscreen);
      if (toggleSelfRegisterDisplayFullscreenBtn) {
        toggleSelfRegisterDisplayFullscreenBtn.textContent = isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen";
      }
    }

    toggleSelfRegisterDisplayFullscreenBtn?.addEventListener("click", toggleSelfRegisterDisplayFullscreen);
    document.addEventListener("fullscreenchange", syncSelfRegisterDisplayFullscreenState);

    startQualifyingBtn?.addEventListener("click", async () => {
      if (!adminCanEdit()) return;
      if (!startQualifyingFlow()) {
        window.alert("Add drivers before starting qualifying.");
        return;
      }
      await publishStateImmediately();
      renderDriversTable();
    });

    function switchView(viewName) {
      if (forcedHostContext?.kind === "website-admin") {
        viewName = "website-admin";
      } else if (forcedHostContext?.kind === "role") {
        viewName = normalizeRouteViewForRole(forcedHostContext.role, viewName);
      }
      if (viewName === "registration" && currentRole !== "admin") {
        viewName = "qualifying";
      }
      if (viewName === "self-register" && currentRole !== "spectator") {
        viewName = currentRole === "admin" ? "registration" : "qualifying";
      }
      if (viewName === "simulation" && currentRole !== "spectator") {
        viewName = currentRole === "admin" ? "registration" : "qualifying";
      }
      if (viewName === "self-register-display" && currentRole !== "admin") {
        viewName = currentRole === "spectator" ? "self-register" : "qualifying";
      }
      document.getElementById('view-registration').classList.toggle('is-active', viewName === 'registration');
      document.getElementById('view-self-register').classList.toggle('is-active', viewName === 'self-register');
      document.getElementById('view-self-register-display').classList.toggle('is-active', viewName === 'self-register-display');
      document.getElementById('view-simulation').classList.toggle('is-active', viewName === 'simulation');
      document.getElementById('view-qualifying').classList.toggle('is-active', viewName === 'qualifying');
      document.getElementById('view-results').classList.toggle('is-active', viewName === 'results');
      document.getElementById('view-website-admin').classList.toggle('is-active', viewName === 'website-admin');
      document.getElementById('view-bracket').classList.toggle('is-active', viewName === 'bracket');
      document.body.classList.toggle('competition-page', viewName === 'bracket');
      if (viewName !== 'bracket' && viewName !== 'qualifying' && viewName !== 'self-register-display' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if (viewName !== 'bracket') {
        document.body.classList.remove('bracket-fullscreen');
      }
      if (viewName !== 'qualifying') {
        document.body.classList.remove('qualifying-fullscreen');
      }
      if (viewName !== 'self-register-display') {
        document.body.classList.remove('self-register-display-fullscreen');
      }
      
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('is-active'));
      const activeTab = document.querySelector(`.mode-tab[data-target="${viewName}"]`);
      if (activeTab) activeTab.classList.add('is-active');

      if (viewName === 'bracket') renderBracket();
      if (viewName === 'simulation') renderSimulationView();
      if (viewName === 'qualifying') updateQualifyingDensity();
      syncRouteWithState();
    }

    function clampJudgeLaneIndex() {
      if (!appDrivers.length) {
        judgeLaneIndex = 0;
        return;
      }
      judgeLaneIndex = Math.max(0, Math.min(judgeLaneIndex, appDrivers.length - 1));
    }

    function syncQualifyingCurrentDriverIntoView() {
      if (!document.body.classList.contains("qualifying-fullscreen")) return;
      if (!document.getElementById("view-qualifying")?.classList.contains("is-active")) return;
      if (shouldUseJudgeLane()) return;

      const currentRow = driversTableBody.querySelector("tr.is-current-driver");
      if (currentRow && driversTableWrap) {
        requestAnimationFrame(() => {
          const rowTop = currentRow.offsetTop;
          const rowCenter = rowTop - (driversTableWrap.clientHeight / 2) + (currentRow.offsetHeight / 2);
          driversTableWrap.scrollTo({
            top: Math.max(0, rowCenter),
            behavior: "smooth",
          });
        });
      }

      const currentCard = mobileDriversList.querySelector(".mobile-driver-card.is-current-driver");
      if (currentCard) {
        requestAnimationFrame(() => {
          const cardTop = currentCard.offsetTop;
          const cardCenter = cardTop - (mobileDriversList.clientHeight / 2) + (currentCard.offsetHeight / 2);
          mobileDriversList.scrollTo({
            top: Math.max(0, cardCenter),
            behavior: "smooth",
          });
        });
      }
    }

    function shouldUseJudgeLane() {
      return currentRole.startsWith("j") && window.innerWidth <= 960;
    }

    function renderJudgeLaneCard(driver, index, total, r1Avg, r2Avg, runoffEligibleIds) {
      const myR1 = getJudgeDraftScoreValue(driver, currentRole, "run1");
      const myR2 = getJudgeDraftScoreValue(driver, currentRole, "run2");
      const myRunoff = driver.scores[currentRole].runoff;
      const run1SubmittedByMe = hasSubmittedJudgeRun(driver, currentRole, "run1");
      const run2SubmittedByMe = hasSubmittedJudgeRun(driver, currentRole, "run2");
      const run1Pending = hasPendingJudgeRunChanges(driver, currentRole, "run1");
      const run2Pending = hasPendingJudgeRunChanges(driver, currentRole, "run2");
      const run1SubmitCount = getActiveJudgeRoles(activeEventMeta).filter((role) => hasSubmittedJudgeRun(driver, role, "run1")).length;
      const run2SubmitCount = getActiveJudgeRoles(activeEventMeta).filter((role) => hasSubmittedJudgeRun(driver, role, "run2")).length;
      const totalJudgeCount = getActiveJudgeRoles(activeEventMeta).length || 0;
      const run1AllSubmitted = totalJudgeCount > 0 && run1SubmitCount === totalJudgeCount;
      const run2AllSubmitted = totalJudgeCount > 0 && run2SubmitCount === totalJudgeCount;
      const showRun2 = run1SubmittedByMe;
      const showRun1Card = !run1SubmittedByMe || run1Pending;
      const run1Flag = driver.runFlags.run1;
      const run2Flag = driver.runFlags.run2;
      const queue = getQualifyingDriverQueue();
      const nextDriver = queue[index + 1] || null;
      const nextDriverLabel = nextDriver
        ? `${escapeHtml(nextDriver.name || "Unnamed Driver")} - Reg #${escapeHtml(nextDriver.reg || nextDriver.signUpPosition || index + 2)}`
        : "Final driver in qualifying queue";
      const activeRunKey = (!run1SubmittedByMe || run1Pending) ? "run1" : "run2";
      const activeRunLabel = activeRunKey === "run1" ? "Run 1" : "Run 2";
      const activeRunPending = activeRunKey === "run1" ? run1Pending : run2Pending;
      const activeRunSubmitted = activeRunKey === "run1" ? run1SubmittedByMe : run2SubmittedByMe;
      const activeRunValue = activeRunKey === "run1" ? myR1 : myR2;
      const activeRunButtonLabel = activeRunPending || !activeRunSubmitted ? `Submit ${activeRunLabel}` : `Waiting For ${activeRunLabel} Scores`;
      const activeRunDisabled = activeRunValue === null || (activeRunSubmitted && !activeRunPending);
      const run1JustSubmitted = isJudgeSubmissionFeedbackActive(driver.id, currentRole, "run1");
      const run2JustSubmitted = isJudgeSubmissionFeedbackActive(driver.id, currentRole, "run2");
      let submissionState = "Submit Run 1 to unlock Run 2.";
      if (run1SubmittedByMe && !run1AllSubmitted) {
        submissionState = `Run 1 submitted. Waiting on ${Math.max(0, totalJudgeCount - run1SubmitCount)} other judge${Math.max(0, totalJudgeCount - run1SubmitCount) === 1 ? "" : "s"}.`;
      } else if (showRun2 && !run2SubmittedByMe) {
        submissionState = "Run 2 is ready. Submit after the second pass.";
      } else if (run2SubmittedByMe && !run2AllSubmitted) {
        submissionState = `Run 2 submitted. Waiting on ${Math.max(0, totalJudgeCount - run2SubmitCount)} other judge${Math.max(0, totalJudgeCount - run2SubmitCount) === 1 ? "" : "s"}.`;
      } else if (run2AllSubmitted) {
        submissionState = "All Run 2 scores received. Advancing now.";
      }

      return `
        <section class="judge-lane-shell">
          <div class="judge-lane-toolbar">
            <div class="judge-lane-meta">
              <div>
                <div class="judge-lane-progress">Driver ${index + 1} of ${total}</div>
                <strong>${escapeHtml(driver.name) || "Unnamed Driver"}</strong>
              </div>
              <div class="mobile-driver-reg">Reg / Sign-up #${driver.reg || driver.signUpPosition || index + 1}</div>
            </div>
            <div class="judge-lane-status-row">
              <span class="judge-lane-status-pill ${run1SubmittedByMe ? "is-live" : "is-pending"}">Run 1 ${run1SubmitCount}/${totalJudgeCount}</span>
              <span class="judge-lane-status-pill ${run2SubmittedByMe ? "is-live" : "is-pending"}">Run 2 ${run2SubmitCount}/${totalJudgeCount}</span>
            </div>
            <div class="judge-lane-note">This phone view is run-by-run. Submit Run 1 first, then Run 2. The live board only advances after all active judges submit Run 2 for this driver.</div>
          </div>
          <article class="mobile-driver-card" data-id="${driver.id}">
            ${!showRun1Card ? `
              <div class="judge-lane-note" style="margin-bottom: 12px;">
                Run 1 submitted: ${formatScore(driver.scores[currentRole].submitted.run1)}${run1Flag ? ` | Auto zero: ${run1Flag}` : ""}
              </div>
            ` : ""}
            <div class="judge-run-grid">
              ${showRun1Card ? `
                <label class="judge-score-card">
                  <div class="judge-score-head">
                    <strong>Run 1 Score</strong>
                    <span class="judge-score-live">Live Avg ${formatScore(r1Avg)}</span>
                  </div>
                  <div class="judge-score-input-wrap">
                      <input class="score-input r1 driver-row-input" data-col="r1" type="text" value="${myR1}" placeholder="100.0" inputmode="decimal" enterkeyhint="send" autocomplete="off" spellcheck="false" />
                      <div class="judge-score-caption">Each run starts at 100. Tap the deductions below or type over the value.</div>
                    </div>
                    ${renderScoreDeductionButtons("r1")}
                  <div class="judge-deduction-history" data-col="r1">${renderDeductionHistory(driver, currentRole, "run1")}</div>
                  <div class="judge-score-help">Your submitted score: ${formatScore(driver.scores[currentRole].submitted.run1)}</div>
                  ${activeRunKey === "run1" ? `<button class="button button-accent judge-run-submit ${run1JustSubmitted ? "just-submitted" : ""}" type="button" data-action="submit-judge-run" data-run="run1" ${activeRunDisabled ? "disabled" : ""}>${activeRunButtonLabel}</button>` : ""}
                  <button class="micro-button" type="button" data-action="clear-score" data-col="r1">Clear</button>
                </label>
              ` : ""}
              ${showRun2 ? `
                <label class="judge-score-card">
                  <div class="judge-score-head">
                    <strong>Run 2 Score</strong>
                    <span class="judge-score-live">Live Avg ${formatScore(r2Avg)}</span>
                  </div>
                  <div class="judge-score-input-wrap">
                    <input class="score-input r2 driver-row-input" data-col="r2" type="text" value="${myR2}" placeholder="100.0" inputmode="decimal" enterkeyhint="send" autocomplete="off" spellcheck="false" />
                    <div class="judge-score-caption">Run 2 starts at 100 right after your Run 1 submit.</div>
                  </div>
                  ${renderScoreDeductionButtons("r2")}
                  <div class="judge-deduction-history" data-col="r2">${renderDeductionHistory(driver, currentRole, "run2")}</div>
                  <div class="judge-score-help">Your submitted score: ${formatScore(driver.scores[currentRole].submitted.run2)}</div>
                  ${activeRunKey === "run2" ? `<button class="button button-accent judge-run-submit ${run2JustSubmitted ? "just-submitted" : ""}" type="button" data-action="submit-judge-run" data-run="run2" ${activeRunDisabled ? "disabled" : ""}>${activeRunButtonLabel}</button>` : ""}
                  <button class="micro-button" type="button" data-action="clear-score" data-col="r2">Clear</button>
                </label>
              ` : `
                <div class="judge-score-card runoff-card">
                  <div class="judge-score-head">
                    <strong>Run 2 Locked</strong>
                    <span class="judge-score-live">Waiting</span>
                  </div>
                  <div class="judge-score-help">Run 2 appears here immediately after you submit Run 1.</div>
                </div>
              `}
            </div>
            <div class="judge-lane-submitbar">
              <div class="judge-lane-submitmeta">
                <div class="helper-text">${submissionState}</div>
                <div class="judge-next-driver">Next up: ${nextDriverLabel}</div>
              </div>
            </div>
          </article>
        </section>
      `;
    }

    // Driver Table Rendering
    function renderDriversTable() {
      // Retain focus for seamless typing during cloud sync
      const activeId = document.activeElement?.closest('tr')?.dataset?.id;
      const activeCol = document.activeElement?.dataset?.col;

      driversTableBody.innerHTML = "";
      mobileDriversList.innerHTML = "";
      driversTableWrap.classList.toggle("mobile-hidden", window.innerWidth <= 720 || shouldUseJudgeLane());
      const rankedDrivers = rankDrivers(appDrivers);
      const topTieInfo = getTopQualifierTieInfo(rankedDrivers);
      const runoffEligibleIds = new Set(topTieInfo?.tiedDrivers?.map((driver) => driver.id) || []);
      const currentQualifyingDriverId = getCurrentQualifyingDriver()?.id || null;
      const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);

      if (currentRole.startsWith("j") && qualifyingPhase !== "live") {
        driversTableWrap.classList.add("mobile-hidden");
        mobileDriversList.innerHTML = renderJudgeLaneStateCard(qualifyingPhase, appDrivers.length);
        applySearchFilter();
        updateQualifying();
        renderRegistrationForms();
        return;
      }

      if (shouldUseJudgeLane()) {
        clampJudgeLaneIndex();
        const laneDriver = appDrivers[judgeLaneIndex];
        if (laneDriver) {
          const r1Avg = getLiveRunAverage(laneDriver, 1);
          const r2Avg = getLiveRunAverage(laneDriver, 2);
          mobileDriversList.innerHTML = renderJudgeLaneCard(laneDriver, judgeLaneIndex, appDrivers.length, r1Avg, r2Avg, runoffEligibleIds);
        } else {
          mobileDriversList.innerHTML = `<div class="empty-state">Add drivers first, then judges can score them here one at a time.</div>`;
        }
        applySearchFilter();
        updateQualifying();
        renderRegistrationForms();
        return;
      }
      
      appDrivers.forEach((driver, index) => {
        const tr = document.createElement("tr");
        tr.dataset.id = driver.id;
        tr.classList.toggle("is-current-driver", driver.id === currentQualifyingDriverId);

        const r1Avg = getRunAverage(driver, 1);
        const r2Avg = getRunAverage(driver, 2);
        const best = getBestScore(r1Avg, r2Avg);
        const liveR1Avg = getLiveRunAverage(driver, 1);
        const liveR2Avg = getLiveRunAverage(driver, 2);
        const liveBest = getBestScore(liveR1Avg, liveR2Avg);

        if (currentRole === "admin" || currentRole === "spectator") {
          const isReadOnly = currentRole === "spectator" || currentRole === "admin" || isEventReadOnly();
          const regHTML = `<span class="read-only-text">${driver.reg || '-'}</span>`;
          const teamMeta = driver.teamName?.trim() ? `<div class="mobile-driver-subline">${escapeHtml(driver.teamName.trim())}</div>` : "";
          const nameHTML = isReadOnly ? `<div class="driver-meta"><strong>${escapeHtml(driver.name) || "-"}</strong>${teamMeta}</div>` : `<div class="driver-meta"><input class="driver-name driver-row-input driver-name-input" data-col="name" type="text" value="${escapeHtml(driver.name)}" placeholder="Driver name" />${teamMeta}</div>`;

          tr.innerHTML = `
            <td class="row-index">${index + 1}</td>
            <td class="td-reg">${regHTML}</td>
            <td>${nameHTML}</td>
            <td class="td-score"><span class="read-only-score r1-avg">${formatScore(liveR1Avg)}</span></td>
            <td class="td-score"><span class="read-only-score r2-avg">${formatScore(liveR2Avg)}</span></td>
            <td class="best-score admin-only">${formatScore(liveBest)}</td>
            <td class="td-actions role-action-col">${currentRole === "admin" ? `<button class="micro-button" type="button" data-action="edit-judge-scores">Edit Scores</button>` : ""}</td>
          `;
        } else {
          const myR1 = getJudgeDraftScoreValue(driver, currentRole, "run1");
          const myR2 = getJudgeDraftScoreValue(driver, currentRole, "run2");
          const submitFeedbackClass = isJudgeSubmissionFeedbackActive(driver.id, currentRole, "all") ? "just-submitted" : "";
          const submissionState = hasPendingJudgeChanges(driver, currentRole) ? "Changes not submitted" : "Submitted";
          tr.innerHTML = `
            <td class="row-index">${index + 1}</td>
            <td class="td-reg"><span class="read-only-text">${driver.reg || '-'}</span></td>
            <td><div class="driver-meta"><strong>${escapeHtml(driver.name) || '-'}</strong>${driver.teamName?.trim() ? `<small>Team ${escapeHtml(driver.teamName.trim())}</small>` : ""}</div></td>
            <td class="td-score"><input class="score-input r1 driver-row-input" data-col="r1" type="number" min="0" max="100" step="0.1" value="${myR1}" placeholder="100.0" />${renderScoreDeductionButtons("r1")}</td>
            <td class="td-score"><input class="score-input r2 driver-row-input" data-col="r2" type="number" min="0" max="100" step="0.1" value="${myR2}" placeholder="100.0" />${renderScoreDeductionButtons("r2")}</td>
            <td class="best-score admin-only">${formatScore(best)}</td>
            <td class="td-actions"><button class="micro-button button-accent ${submitFeedbackClass}" type="button" data-action="submit-judge-scores" ${isJudgeSubmitWaiting(driver, currentRole) ? "disabled" : ""}>${getJudgeSubmitButtonLabel(driver, currentRole)}</button></td>
          `;
        }
        driversTableBody.appendChild(tr);

        const mobileCard = document.createElement("article");
        mobileCard.className = "mobile-driver-card";
        mobileCard.dataset.id = driver.id;
        mobileCard.classList.toggle("is-current-driver", driver.id === currentQualifyingDriverId);

        if (currentRole === "admin" || currentRole === "spectator") {
          const isReadOnly = currentRole === "spectator" || currentRole === "admin" || isEventReadOnly();
          const regField = `<div class="mobile-driver-reg">Reg #${driver.reg || "-"}</div>`;
          const nameField = isReadOnly
            ? `<div class="mobile-driver-name">${escapeHtml(driver.name) || "Unnamed Driver"}</div>${driver.teamName?.trim() ? `<div class="mobile-driver-subline">${escapeHtml(driver.teamName.trim())}</div>` : ""}`
            : `<label class="modal-field"><span>Driver</span><input class="driver-name driver-row-input driver-name-input" data-col="name" type="text" value="${escapeHtml(driver.name)}" placeholder="Driver name" /></label>`;

          mobileCard.innerHTML = `
            <div class="mobile-driver-head">
              <div class="mobile-seed-index">${index + 1}</div>
              <div class="mobile-driver-meta">
                ${nameField}
                ${regField}
              </div>
            </div>
            <div class="mobile-score-grid">
              <div class="mobile-score-card">
                <span>Run 1 Average</span>
                <strong>${formatScore(liveR1Avg)}</strong>
              </div>
              <div class="mobile-score-card">
                <span>Run 2 Average</span>
                <strong>${formatScore(liveR2Avg)}</strong>
              </div>
              <div class="mobile-score-card">
                <span>Best Score</span>
                <strong>${formatScore(liveBest)}</strong>
              </div>
            </div>
            ${currentRole === "admin" ? `<div class="mobile-card-actions admin-only"><button class="button button-secondary" type="button" data-action="edit-judge-scores">Edit Judge Score</button></div>` : ""}
          `;
        } else {
          const myR1 = getJudgeDraftScoreValue(driver, currentRole, "run1");
          const myR2 = getJudgeDraftScoreValue(driver, currentRole, "run2");
          const myRunoff = driver.scores[currentRole].runoff;
          const submitFeedbackClass = isJudgeSubmissionFeedbackActive(driver.id, currentRole, "all") ? "just-submitted" : "";
          const submissionState = hasPendingJudgeChanges(driver, currentRole) ? "Submit scores" : "Re-submit to update";
          const run1Flag = driver.runFlags.run1;
          const run2Flag = driver.runFlags.run2;
          const runoffFlag = driver.runFlags.runoff;
          const showRunoff = runoffEligibleIds.has(driver.id);
          mobileCard.innerHTML = `
            <div class="mobile-driver-head">
              <div class="mobile-seed-index">${index + 1}</div>
              <div class="mobile-driver-meta">
                <div class="mobile-driver-name">${escapeHtml(driver.name) || "Unnamed Driver"}</div>
                ${driver.teamName?.trim() ? `<div class="mobile-driver-subline">${escapeHtml(driver.teamName.trim())}</div>` : ""}
                <div class="mobile-driver-reg">Reg #${driver.reg || "-"}</div>
              </div>
            </div>
            <div class="mobile-score-grid">
              <label class="judge-score-card">
                <div class="judge-score-head">
                  <strong>Run 1 Score</strong>
                  <button class="micro-button" type="button" data-action="clear-score" data-col="r1">Clear</button>
                </div>
                <input class="score-input r1 driver-row-input" data-col="r1" type="number" min="0" max="100" step="0.1" value="${myR1}" placeholder="100.0" inputmode="decimal" />
                ${renderScoreDeductionButtons("r1")}
                <div class="judge-deduction-history" data-col="r1">${renderDeductionHistory(driver, currentRole, "run1")}</div>
                <div class="judge-score-help">You can update this score at any time. Current average: ${formatScore(r1Avg)}</div>
                <button class="micro-button" type="button" data-action="clear-score" data-col="r1">Clear</button>
              </label>
              <label class="judge-score-card">
                <div class="judge-score-head">
                  <strong>Run 2 Score</strong>
                  <button class="micro-button" type="button" data-action="clear-score" data-col="r2">Clear</button>
                </div>
                <input class="score-input r2 driver-row-input" data-col="r2" type="number" min="0" max="100" step="0.1" value="${myR2}" placeholder="100.0" inputmode="decimal" />
                ${renderScoreDeductionButtons("r2")}
                <div class="judge-deduction-history" data-col="r2">${renderDeductionHistory(driver, currentRole, "run2")}</div>
                <div class="judge-score-help">You can update this score at any time. Current average: ${formatScore(r2Avg)}</div>
                <button class="micro-button" type="button" data-action="clear-score" data-col="r2">Clear</button>
              </label>
              ${showRunoff ? `
                <label class="judge-score-card">
                  <div class="judge-score-head">
                    <strong>Top Runoff Score</strong>
                    <button class="micro-button" type="button" data-action="clear-score" data-col="runoff">Clear</button>
                  </div>
                  <input class="score-input runoff driver-row-input" data-col="runoff" type="number" min="0" max="100" step="0.1" value="${myRunoff !== null ? myRunoff : ''}" placeholder="0.0" inputmode="decimal" />
                  <div class="judge-score-help">Required only to resolve the top qualifier tie.${runoffFlag ? ` Auto zero: ${runoffFlag}` : ""}</div>
                  <button class="micro-button" type="button" data-action="clear-score" data-col="runoff">Clear</button>
                </label>
              ` : ""}
            </div>
            <div class="mobile-card-actions"><button class="button button-accent ${submitFeedbackClass}" type="button" data-action="submit-judge-scores" ${isJudgeSubmitWaiting(driver, currentRole) ? "disabled" : ""}>${getJudgeSubmitButtonLabel(driver, currentRole)}</button></div>
          `;
        }
        mobileDriversList.appendChild(mobileCard);
      });
      
      if (activeId && activeCol) {
         const inputToFocus = document.querySelector(`tr[data-id="${activeId}"] input[data-col="${activeCol}"], article[data-id="${activeId}"] input[data-col="${activeCol}"]`);
         if (inputToFocus) {
             inputToFocus.focus();
             const val = inputToFocus.value;
             inputToFocus.value = '';
            inputToFocus.value = val;
         }
      }

      syncQualifyingCurrentDriverIntoView();

      applySearchFilter();
      updateQualifying();
      renderRegistrationForms();
      syncSelfRegisterForm();
    }

    driversTableBody.addEventListener("input", (e) => {
      if (!userCanEdit()) return;
      const tr = e.target.closest("tr");
      const id = tr.dataset.id;
      const driver = appDrivers.find(d => d.id === id);
      if (!driver) return;
      const readinessCleared = id === qualifyingFlow.currentDriverId && clearQualifyingReady(currentRole);

      if (e.target.classList.contains("driver-name")) {
        driver.name = e.target.value;
      } else if (e.target.classList.contains("score-input")) {
          const parsedValue = toNumber(e.target.value);
          const val = parsedValue === null ? null : clampJudgeScoreValue(parsedValue);
          if (val !== null) e.target.value = String(val);
          if (e.target.classList.contains("r1")) driver.scores[currentRole].run1 = val;
          if (e.target.classList.contains("r2")) driver.scores[currentRole].run2 = val;
          if (e.target.classList.contains("runoff")) driver.scores[currentRole].runoff = val;
          if (e.target.classList.contains("r1")) {
            if (driver.runFlags.run1) driver.runFlags.run1 = null;
            clearJudgeDeductionHistory(driver, currentRole, "run1");
          }
          if (e.target.classList.contains("r2")) {
            if (driver.runFlags.run2) driver.runFlags.run2 = null;
            clearJudgeDeductionHistory(driver, currentRole, "run2");
          }
          if (e.target.classList.contains("runoff")) {
            if (driver.runFlags.runoff) driver.runFlags.runoff = null;
            clearJudgeDeductionHistory(driver, currentRole, "runoff");
          }
      }
      
      if (currentRole === "admin") {
         const r1Avg = getRunAverage(driver, 1);
         const r2Avg = getRunAverage(driver, 2);
         tr.querySelector(".r1-avg").textContent = formatScore(r1Avg);
         tr.querySelector(".r2-avg").textContent = formatScore(r2Avg);
         tr.querySelector(".best-score").textContent = formatScore(getBestScore(r1Avg, r2Avg));
         publishState();
         updateQualifying();
         return;
      }
      if (readinessCleared) {
        publishState();
      }
      const submitButton = tr.querySelector("[data-action='submit-judge-scores']");
      if (submitButton) {
        submitButton.textContent = getJudgeSubmitButtonLabel(driver, currentRole);
      }
    });

    driversTableBody.addEventListener("click", async (e) => {
      const editJudgeScoresButton = e.target.closest("[data-action='edit-judge-scores']");
      if (editJudgeScoresButton) {
        if (!adminCanEdit()) return;
        const tr = e.target.closest("tr");
        if (!tr) return;
        await editJudgeScoreByAdmin(tr.dataset.id);
        return;
      }

      const deductionButton = e.target.closest("[data-action='apply-deduction']");
      if (deductionButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        const tr = e.target.closest("tr");
        if (!tr) return;
        const id = tr.dataset.id;
        const readinessCleared = id === qualifyingFlow.currentDriverId && clearQualifyingReady(currentRole);
        const deduction = deductionButton.dataset.deduction === "crash"
          ? "crash"
          : Number.parseInt(deductionButton.dataset.deduction, 10);
        if (deduction !== "crash" && !Number.isFinite(deduction)) return;
        if (!applyJudgeScoreDeduction(id, deductionButton.dataset.col, deduction, currentRole)) return;
        if (readinessCleared) {
          publishState();
        }
        const driver = appDrivers.find((entry) => entry.id === id);
        refreshJudgeDraftUi(tr, driver, currentRole);
        return;
      }

      const submitButton = e.target.closest("[data-action='submit-judge-scores']");
      if (submitButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        if (document.activeElement?.classList?.contains("score-input") && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
        const id = e.target.closest("tr").dataset.id;
        if (!confirmJudgeScoreSubmission(id, currentRole)) return;
        submitJudgeScores(id, currentRole);
        maybeAdvanceQualifyingAfterSubmit(id);
        await syncJudgeSubmission(id, currentRole);
        renderDriversTable();
        return;
      }
      if (!adminCanEdit()) return;
      if (e.target.classList.contains("remove-driver")) {
        const id = e.target.closest("tr").dataset.id;
        appDrivers = resequenceDrivers(appDrivers.filter(d => d.id !== id), true);
        publishState();
        renderDriversTable();
      }
    });

    mobileDriversList.addEventListener("input", (e) => {
      if (!userCanEdit()) return;
      const card = e.target.closest("[data-id]");
      if (!card) return;
      const driver = appDrivers.find(d => d.id === card.dataset.id);
      if (!driver) return;
      const readinessCleared = card.dataset.id === qualifyingFlow.currentDriverId && clearQualifyingReady(currentRole);

      if (e.target.classList.contains("driver-name")) {
        driver.name = e.target.value;
      } else if (e.target.classList.contains("score-input")) {
        const parsedValue = toNumber(e.target.value);
        const val = parsedValue === null ? null : clampJudgeScoreValue(parsedValue);
        if (val !== null) e.target.value = String(val);
        if (e.target.classList.contains("r1")) driver.scores[currentRole].run1 = val;
        if (e.target.classList.contains("r2")) driver.scores[currentRole].run2 = val;
        if (e.target.classList.contains("runoff")) driver.scores[currentRole].runoff = val;
        if (e.target.classList.contains("r1")) {
          if (driver.runFlags.run1) driver.runFlags.run1 = null;
          clearJudgeDeductionHistory(driver, currentRole, "run1");
        }
        if (e.target.classList.contains("r2")) {
          if (driver.runFlags.run2) driver.runFlags.run2 = null;
          clearJudgeDeductionHistory(driver, currentRole, "run2");
        }
        if (e.target.classList.contains("runoff")) {
          if (driver.runFlags.runoff) driver.runFlags.runoff = null;
          clearJudgeDeductionHistory(driver, currentRole, "runoff");
        }
      }

      if (currentRole === "admin") {
        publishState();
        updateQualifying();
        return;
      }
      if (readinessCleared) {
        publishState();
      }
      const submitButton = card.querySelector("[data-action='submit-judge-scores']");
      if (submitButton) {
        submitButton.textContent = getJudgeSubmitButtonLabel(driver, currentRole);
      }
        const runSubmitButton = card.querySelector("[data-action='submit-judge-run']");
      if (runSubmitButton) {
        const runKey = runSubmitButton.dataset.run;
        const runValue = getJudgeDraftScoreValue(driver, currentRole, runKey);
        const isPending = hasPendingJudgeRunChanges(driver, currentRole, runKey);
        const isSubmitted = hasSubmittedJudgeRun(driver, currentRole, runKey);
        runSubmitButton.disabled = runValue === null || (isSubmitted && !isPending);
        runSubmitButton.textContent = isPending || !isSubmitted
          ? `Submit ${runKey === "run1" ? "Run 1" : "Run 2"}`
          : `Waiting For ${runKey === "run1" ? "Run 1" : "Run 2"} Scores`;
      }
    });

    mobileDriversList.addEventListener("focusin", (e) => {
      if (!e.target.classList.contains("score-input")) return;
      if (!currentRole.startsWith("j")) return;
      requestAnimationFrame(() => {
        if (document.activeElement === e.target && typeof e.target.select === "function") {
          e.target.select();
        }
      });
    });

    mobileDriversList.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (!e.target.classList.contains("score-input")) return;
      if (!currentRole.startsWith("j")) return;
      e.preventDefault();
      const card = e.target.closest("[data-id]");
      const submitButton = card?.querySelector("[data-action='submit-judge-run'], [data-action='submit-judge-scores']");
      if (submitButton && !submitButton.disabled) {
        submitButton.click();
      }
    });

    mobileDriversList.addEventListener("focusout", (e) => {
      if (!e.target.classList.contains("score-input")) return;
      if (!currentRole.startsWith("j")) return;
      requestAnimationFrame(() => {
        if (!isJudgeEditingScoreInput() && deferredInteractiveRenderPending) {
          deferredInteractiveRenderPending = false;
          renderDriversTable();
          if (document.getElementById('view-bracket').classList.contains('is-active')) {
            renderBracket();
          }
        }
      });
    });

    mobileDriversList.addEventListener("click", async (e) => {
      const card = e.target.closest("[data-id]");
      if (!card) return;
      const readinessCleared = card.dataset.id === qualifyingFlow.currentDriverId && clearQualifyingReady(currentRole);

      const editJudgeScoresButton = e.target.closest("[data-action='edit-judge-scores']");
      if (editJudgeScoresButton) {
        if (!adminCanEdit()) return;
        await editJudgeScoreByAdmin(card.dataset.id);
        return;
      }

      const deductionButton = e.target.closest("[data-action='apply-deduction']");
      if (deductionButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        const deduction = deductionButton.dataset.deduction === "crash"
          ? "crash"
          : Number.parseInt(deductionButton.dataset.deduction, 10);
        if (deduction !== "crash" && !Number.isFinite(deduction)) return;
        if (!applyJudgeScoreDeduction(card.dataset.id, deductionButton.dataset.col, deduction, currentRole)) return;
        if (readinessCleared) publishState();
        const driver = appDrivers.find((entry) => entry.id === card.dataset.id);
        refreshJudgeDraftUi(card, driver, currentRole);
        return;
      }

      if (e.target.classList.contains("remove-driver")) {
        if (!adminCanEdit()) return;
        const id = card.dataset.id;
        appDrivers = resequenceDrivers(appDrivers.filter(d => d.id !== id), true);
        publishState();
        renderDriversTable();
        return;
      }

      const clearButton = e.target.closest("[data-action='clear-score']");
      if (clearButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        const driver = appDrivers.find(d => d.id === card.dataset.id);
        if (!driver) return;
        const col = clearButton.dataset.col;
        const runKey = col === "r1" ? "run1" : col === "r2" ? "run2" : "runoff";
        driver.scores[currentRole][runKey] = null;
        driver.runFlags[runKey] = null;
        clearJudgeDeductionHistory(driver, currentRole, runKey);
        if (readinessCleared) publishState();
        renderDriversTable();
        return;
      }

      const submitButton = e.target.closest("[data-action='submit-judge-scores']");
      if (submitButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        if (document.activeElement?.classList?.contains("score-input") && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
        if (!confirmJudgeScoreSubmission(card.dataset.id, currentRole)) return;
        submitJudgeScores(card.dataset.id, currentRole);
        maybeAdvanceQualifyingAfterSubmit(card.dataset.id);
        await syncJudgeSubmission(card.dataset.id, currentRole);
        renderDriversTable();
        return;
      }

      const submitRunButton = e.target.closest("[data-action='submit-judge-run']");
      if (submitRunButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        if (document.activeElement?.classList?.contains("score-input") && typeof document.activeElement.blur === "function") {
          document.activeElement.blur();
        }
        const runKey = submitRunButton.dataset.run;
        if (!confirmJudgeScoreSubmission(card.dataset.id, currentRole, runKey)) return;
        submitJudgeRun(card.dataset.id, runKey, currentRole);
        maybeAdvanceQualifyingAfterRunSubmit(card.dataset.id, runKey);
        await syncJudgeSubmission(card.dataset.id, currentRole, runKey);
        renderDriversTable();
        return;
      }

      const runFlagButton = e.target.closest("[data-action='set-run-flag']");
      if (runFlagButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        if (readinessCleared) publishState();
        setRunFlag(card.dataset.id, runFlagButton.dataset.run, runFlagButton.dataset.reason);
        return;
      }

      const clearRunFlagButton = e.target.closest("[data-action='clear-run-flag']");
      if (clearRunFlagButton) {
        if (!userCanEdit() || currentRole === "admin" || currentRole === "spectator") return;
        const driver = appDrivers.find(d => d.id === card.dataset.id);
        if (!driver) return;
        const runKey = clearRunFlagButton.dataset.run;
        driver.scores[currentRole][runKey] = null;
        if (readinessCleared) publishState();
        renderDriversTable();
      }
    });

    function renderQualifyingOrder(rankedDrivers, plan) {
      const qResults = document.getElementById("qualifyingResults");
      const tieInfo = getTopQualifierTieInfo(rankedDrivers);
      const standingsSignature = rankedDrivers.map((driver, index) => `${index + 1}:${driver.id}:${formatScore(driver.bestScore)}`).join("|");
      const shouldAnimateStandings = lastStandingsSignature !== null && standingsSignature !== lastStandingsSignature;
      lastStandingsSignature = standingsSignature;
      qResults.innerHTML = "";
      qResults.classList.remove("empty-state");

      if (!rankedDrivers.length) {
        lastStandingsSignature = null;
        topQualifierTiePanel.classList.add("hidden");
        topQualifierTiePanel.textContent = "";
        qResults.textContent = "Add driver names in registration, then enter scores to build the standings.";
        qResults.classList.add("empty-state");
        return;
      }

      if (tieInfo) {
        const names = tieInfo.tiedDrivers.map((driver) => driver.name || "Unnamed Driver").join(", ");
        topQualifierTiePanel.classList.remove("hidden");
        topQualifierTiePanel.textContent = tieInfo.requiresRunoff
          ? `Top qualifier tie: ${names}. Runoff scores are required before launching the bracket.`
          : `Top qualifier runoff completed for: ${names}. Top seed is now resolved.`;
      } else {
        topQualifierTiePanel.classList.add("hidden");
        topQualifierTiePanel.textContent = "";
      }

      const cutoffCount = plan ? plan.qualifiedCount : rankedDrivers.length;
      const list = document.createElement("ol");
      list.className = `qualifying-results-simple ${shouldAnimateStandings ? "is-animating" : ""}`;

      rankedDrivers.forEach((driver, index) => {
        const isQualified = index < cutoffCount;
        const item = document.createElement("li");
        if (!isQualified) item.classList.add("is-dimmed");
        if (shouldAnimateStandings) item.style.setProperty("--standings-delay", `${Math.min(index * 38, 300)}ms`);
        item.textContent = `${index + 1}. ${driver.name} - Best score: ${formatScore(driver.bestScore)}`;
        list.appendChild(item);
      });

      qResults.appendChild(list);
    }

    function updateQualifyingDensity() {
      const rankedDrivers = rankDrivers(appDrivers);
      let density = "standard";
      if (rankedDrivers.length >= 26) {
        density = "ultra";
      } else if (rankedDrivers.length >= 16) {
        density = "compact";
      }
      document.body.dataset.qualifyingDensity = density;
    }

    function renderQualifyingLivePanel() {
      if (!qualifyingLivePanel) return;
      syncQualifyingFlowState();
      const queue = getQualifyingDriverQueue();
      const currentDriver = getCurrentQualifyingDriver();
      const qualifyingPhase = getQualifyingFlowPhase(qualifyingFlow, appDrivers);
      if (qualifyingPhase === "empty") {
        lastQualifyingDriverId = null;
        qualifyingLivePanel.innerHTML = `
          <div class="qualifying-live-card">
            <p class="qualifying-live-kicker">Now Qualifying</p>
            <div class="qualifying-live-driver">Waiting For Drivers</div>
            <div class="qualifying-live-note">Add driver names in registration to start the live qualifying queue.</div>
          </div>
        `;
        return;
      }

      if (qualifyingPhase === "waiting") {
        lastQualifyingDriverId = null;
        qualifyingLivePanel.innerHTML = `
          <div class="qualifying-live-card">
            <p class="qualifying-live-kicker">Qualifying Status</p>
            <div class="qualifying-live-driver">Waiting To Start</div>
            <div class="qualifying-live-note">Event admin can start qualifying once the driver list is ready.</div>
          </div>
        `;
        return;
      }

      if (qualifyingPhase === "complete" || !currentDriver) {
        lastQualifyingDriverId = null;
        qualifyingLivePanel.innerHTML = `
          <div class="qualifying-live-card">
            <p class="qualifying-live-kicker">Qualifying Status</p>
            <div class="qualifying-live-driver">Qualifying Complete</div>
            <div class="qualifying-live-note">All registered drivers have finished their qualifying runs.</div>
          </div>
        `;
        return;
      }

      const currentIndex = Math.max(0, queue.findIndex((driver) => driver.id === currentDriver.id));
      const run1Avg = getLiveRunAverage(currentDriver, 1);
      const run2Avg = getLiveRunAverage(currentDriver, 2);
      const bestScore = getBestScore(run1Avg, run2Avg);
      const activeJudgeRoles = getActiveJudgeRoles(activeEventMeta);
      const shouldAnimateCurrentDriver = lastQualifyingDriverId !== null && currentDriver.id !== lastQualifyingDriverId;
      lastQualifyingDriverId = currentDriver.id;
      const readyMarkup = activeJudgeRoles.map((role) => {
        const isReady = hasSubmittedRequiredRuns(currentDriver, role);
        const justSubmitted = isReady && isJudgeSubmissionFeedbackActive(currentDriver.id, role);
        return `<span class="qualifying-ready-pill ${isReady ? "is-ready" : ""} ${justSubmitted ? "just-submitted" : ""}">${escapeHtml(getRoleDisplayName(role))} ${isReady ? "Submitted" : "Waiting"}</span>`;
      }).join("");

      qualifyingLivePanel.innerHTML = `
        <div class="qualifying-live-card ${shouldAnimateCurrentDriver ? "is-advancing" : ""}">
          <div class="qualifying-live-head">
            <div>
              <p class="qualifying-live-kicker">Now Qualifying</p>
              <div class="qualifying-live-driver">${escapeHtml(currentDriver.name || "Unnamed Driver")}</div>
              <div class="qualifying-live-meta">Reg #${escapeHtml(currentDriver.reg || currentDriver.signUpPosition || currentIndex + 1)} | Driver ${currentIndex + 1} of ${queue.length}</div>
              ${currentRole === "spectator" ? `<div class="qualifying-live-note">Spotlight driver for ${escapeHtml(activeEventMeta?.name || "the current event")}</div>` : ""}
            </div>
            <div class="qualifying-live-progress">${currentIndex + 1}/${queue.length}</div>
          </div>
          <div class="qualifying-live-stats">
            <div class="qualifying-live-stat">
              <span>Run 1 Live Avg</span>
              <strong>${formatScore(run1Avg)}</strong>
            </div>
            <div class="qualifying-live-stat">
              <span>Run 2 Live Avg</span>
              <strong>${formatScore(run2Avg)}</strong>
            </div>
            <div class="qualifying-live-stat">
              <span>Best Score</span>
              <strong>${formatScore(bestScore)}</strong>
            </div>
          </div>
          <div class="qualifying-live-footer">
            <div class="qualifying-ready-list">${readyMarkup}</div>
            <div class="qualifying-live-actions">
              <div class="qualifying-live-note">Advances automatically when all active judges submit scores for this driver.</div>
            </div>
          </div>
        </div>
      `;
    }

    function updateQualifying() {
      const rankedDrivers = rankDrivers(appDrivers);
      const enteredDriverCount = getEnteredDriverCount(appDrivers);
      const customLowerCount = getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0;
      const plan = getCompetitionPlan(rankedDrivers.length, bracketModeSelect.value, customLowerCount);
      const ready = rankedDrivers.length >= 2;
      
      let modeLabel = "Classic bracket";
      if (isSdcFormat(bracketModeSelect.value)) {
        modeLabel = `SDC bracket Top ${getRequestedSdcMainBracketSize(bracketModeSelect.value)}`;
      }

      let planDescription = plan.description;
      if (isSdcFormat(bracketModeSelect.value)) {
        const selectedSize = getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0;
        const scoredValidSizes = getValidSdcMainBracketSizes(rankedDrivers.length);
        if (selectedSize && !scoredValidSizes.includes(selectedSize)) {
          planDescription = `SDC Top ${selectedSize} selected. ${rankedDrivers.length} scored driver${rankedDrivers.length === 1 ? "" : "s"} ready now out of ${enteredDriverCount} entered. This bracket can launch once at least ${selectedSize} drivers have qualifying scores.`;
        }
      }

      renderQualifyingOrder(rankedDrivers, plan);
      renderQualifyingLivePanel();
      updateQualifyingDensity();
      if (ready) launchWarning.style.display = 'none';
    }

    function applySearchFilter() {
      const query = searchInput?.value?.trim().toLowerCase() || "";
      [...driversTableBody.querySelectorAll("tr")].forEach((row) => {
        const id = row.dataset.id;
        const driver = appDrivers.find(d => d.id === id);
        if (!driver) return;
        const nameMatch = driver.name.toLowerCase().includes(query);
        const regMatch = driver.reg ? String(driver.reg).includes(query) : false;
        row.classList.toggle("hidden", !(!query || nameMatch || regMatch));
      });
      [...mobileDriversList.querySelectorAll("[data-id]")].forEach((card) => {
        const id = card.dataset.id;
        const driver = appDrivers.find(d => d.id === id);
        if (!driver) return;
        const nameMatch = driver.name.toLowerCase().includes(query);
        const regMatch = driver.reg ? String(driver.reg).includes(query) : false;
        card.classList.toggle("hidden", !(!query || nameMatch || regMatch));
      });
    }

    registrationEntryForm?.addEventListener("input", (e) => {
      if (!registrationCanEdit()) return;
      if (e.target === registrationDraftName) {
        registrationDraft.name = e.target.value;
      } else if (e.target === registrationDraftTeam) {
        registrationDraft.teamName = e.target.value;
      } else if (e.target === registrationDraftChassis) {
        registrationDraft.chassis = e.target.value;
      }
    });

    registrationEntryForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitRegistrationDraft();
    });

    saveVenueConfigBtn?.addEventListener("click", () => {
      saveVenueConfigDraft();
    });

    selfRegisterForm?.addEventListener("input", (e) => {
      if (e.target === selfRegisterName) {
        selfRegistrationDraft.name = e.target.value;
      } else if (e.target === selfRegisterTeam) {
        selfRegistrationDraft.teamName = e.target.value;
      } else if (e.target === selfRegisterChassis) {
        selfRegistrationDraft.chassis = e.target.value;
      }
      persistSelfRegisterProfile();
      syncSelfRegisterForm();
    });

    selfRegisterLocateBtn?.addEventListener("click", () => {
      checkSelfRegistrationLocation();
    });

    useSavedSelfRegisterProfileBtn?.addEventListener("click", () => {
      const selectedId = selfRegisterSavedProfileSelect?.value || "";
      if (selectedId && applySavedSelfRegisterProfile(selectedId)) return;
      selfRegistrationDraft = loadSavedSelfRegisterProfile();
      syncSelfRegisterForm();
    });

    saveCurrentSelfRegisterProfileBtn?.addEventListener("click", () => {
      if (saveCurrentSelfRegisterProfile()) {
        window.alert("Driver profile saved on this device.");
      }
      syncSelfRegisterForm();
    });

    clearSavedSelfRegisterProfileBtn?.addEventListener("click", () => {
      clearSavedSelfRegisterProfile();
      selfRegistrationDraft = { name: "", teamName: "", chassis: "" };
      syncSelfRegisterForm();
    });

    deleteSavedSelfRegisterProfileBtn?.addEventListener("click", () => {
      const selectedId = selfRegisterSavedProfileSelect?.value || "";
      if (!selectedId) return;
      deleteSavedSelfRegisterProfile(selectedId);
      syncSelfRegisterForm();
    });

    selfRegisterSavedProfileSelect?.addEventListener("change", () => {
      const selectedId = selfRegisterSavedProfileSelect.value || "";
      if (!selectedId) return;
      applySavedSelfRegisterProfile(selectedId);
    });

    copySelfRegisterLinkBtn?.addEventListener("click", async () => {
      const selfRegisterUrl = buildSelfRegisterUrl();
      const copied = await copyTextToClipboard(selfRegisterUrl);
      if (!copied) {
        window.prompt("Copy this public registration link:", selfRegisterUrl);
        return;
      }
      window.alert("Public registration link copied.");
    });

    openSelfRegisterDisplayBtn?.addEventListener("click", () => {
      switchView("self-register-display");
    });

    closeSelfRegisterDisplayBtn?.addEventListener("click", () => {
      switchView("registration");
    });

    selfRegisterForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      persistSelfRegisterProfile();
      await submitSelfRegistration();
    });

    registrationForms.addEventListener("click", (e) => {
      if (!registrationCanEdit()) return;
      const card = e.target.closest("[data-id]");
      if (!card) return;
      const editButton = e.target.closest("[data-action='edit-registration-driver']");
      if (editButton) {
        editRegistrationDriver(card.dataset.id);
        return;
      }
      const removeButton = e.target.closest("[data-action='remove-registration-driver']");
      if (!removeButton) return;
      if (appDrivers.length <= 1) return;
      appDrivers = resequenceDrivers(appDrivers.filter((entry) => entry.id !== card.dataset.id), true);
      publishState();
      renderDriversTable();
    });

    pendingRegistrationForms?.addEventListener("click", async (e) => {
      if (!registrationCanEdit()) return;
      const card = e.target.closest("[data-pending-id]");
      if (!card) return;
      const paidButton = e.target.closest("[data-action='toggle-pending-paid']");
      if (paidButton) {
        await togglePendingRegistrationPaid(card.dataset.pendingId);
        return;
      }
      const approveButton = e.target.closest("[data-action='approve-pending-registration']");
      if (approveButton) {
        await approvePendingRegistration(card.dataset.pendingId);
        return;
      }
      const removeButton = e.target.closest("[data-action='remove-pending-registration']");
      if (removeButton) {
        await removePendingRegistration(card.dataset.pendingId);
      }
    });

    function openCompetitionBracket() {
      if (!adminCanEdit()) return;
      const rankedDrivers = rankDrivers(appDrivers);
      const tieInfo = getTopQualifierTieInfo(rankedDrivers);
      if (rankedDrivers.length < 2) {
        launchWarning.style.display = 'block';
        launchWarning.textContent = 'You need at least 2 scored drivers to launch.';
        return;
      }
      if (tieInfo?.requiresRunoff) {
        launchWarning.style.display = 'block';
        launchWarning.textContent = 'Top qualifier runoff scores are required before launching the bracket.';
        return;
      }
      if (isSdcFormat(bracketModeSelect.value)) {
        const selectedMainBracketSize = getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0;
        const validSizes = getValidSdcMainBracketSizes(rankedDrivers.length);
        if (selectedMainBracketSize && !validSizes.includes(selectedMainBracketSize)) {
          launchWarning.style.display = 'block';
          launchWarning.textContent = `Top ${selectedMainBracketSize} requires ${selectedMainBracketSize} scored drivers. You currently have ${rankedDrivers.length} scored driver${rankedDrivers.length === 1 ? "" : "s"}.`;
          return;
        }
      }
      launchWarning.style.display = 'none';
      launchWarning.textContent = 'You need at least 2 scored drivers to launch.';
      const customFormatCount = getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0;
      tournamentState = createTournamentState(rankedDrivers, normalizePreferredFormat(bracketModeSelect.value || FORMAT_CLASSIC), customFormatCount);
      activeCompetitionBracketPage = tournamentState.lowerBracket ? "lower" : "main";
      publishState();
      switchView("bracket");
    }

    bracketModeSelect.addEventListener("change", () => {
      if (!adminCanEdit()) return;
      lowerCountContainer.style.display = "none";
      publishState();
      updateQualifying();
    });
    registrationToQualifyingBtn.addEventListener("click", () => {
      if (currentRole.startsWith("j")) return;
      switchView("qualifying");
    });
    
    loadSampleBtn.addEventListener("click", async () => {
      if (!adminCanEdit()) return;
      const samples = [
        ["Takumi Sato", "Project D", "Yokomo MD 2.0"],
        ["Mika Torres", "Slide Theory", "MST RMX 2.5"],
        ["Jordan Lee", "White Smoke", "Reve D RDX"],
        ["Chris Vega", "Night Shift", "Overdose Galm"],
        ["Noah Kim", "Apex Line", "Yokomo SD 3.0"],
        ["Aiden Brooks", "Countersteer Crew", "MST RMX EX GT"],
        ["Luis Ramirez", "Static Works", "Reve D RDX"],
        ["Kai Foster", "Blackout Drift", "Yokomo MD 1.0"],
        ["Mason Hill", "Side Bite", "MST RMX 2.5"],
        ["Eli Carter", "Ghost Angle", "Overdose Galm"],
        ["Asher Bell", "Prime Slide", "Reve D RDX"],
        ["Roman Ward", "Late Apex", "Yokomo SD 2.0"],
        ["Caleb Reed", "Steel Smoke", "MST RMX 2.0"],
        ["Hunter Miles", "Street Limit", "Yokomo MD 2.0"],
        ["Tristan Holt", "Clean Line", "Reve D RDX"],
        ["Blake Griffin", "North Side", "MST RMX EX GT"],
        ["Levi Cruz", "Shadow Team", "Overdose Galm"],
        ["Carter Quinn", "Rogue Angle", "Yokomo SD 3.0"],
        ["Griffin Shaw", "Voltage RC", "MST RMX 2.5"],
        ["Ethan Perry", "Track Ritual", "Reve D RDX"],
        ["Roman Diaz", "Finish First", "Yokomo MD 2.0"],
        ["Cole Bennett", "Zero Counter", "MST RMX 2.0"],
        ["Nico Alvarez", "Broken Traction", "Overdose Galm"]
      ];
      appDrivers = samples.map(([name, teamName, chassis], index) => {
        const driver = createEmptyDriver(index + 1);
        driver.name = name;
        driver.teamName = teamName;
        driver.chassis = chassis;
        driver.runFlags = { run1: null, run2: null, runoff: null };
        for (const role of JUDGE_ROLE_ORDER) {
          driver.scores[role] = {
            run1: null,
            run2: null,
            runoff: null,
            submitted: { run1: null, run2: null, runoff: null },
          };
        }
        return driver;
      });
      qualifyingFlow = createEmptyQualifyingFlow();
      syncQualifyingFlowState();
      tournamentState = null;
      activeCompetitionBracketPage = "main";
      saveBracketPagePreference(activeEventId, activeCompetitionBracketPage);
      await publishStateImmediately();
      renderDriversTable();
    });

    openBracketBtn.addEventListener("click", openCompetitionBracket);
    searchInput?.addEventListener("input", applySearchFilter);
    window.addEventListener("resize", () => {
      clearTimeout(window.__driverLayoutResizeTimer);
      window.__driverLayoutResizeTimer = setTimeout(() => {
        renderDriversTable();
        updateQualifyingDensity();
        fitAllBracketBoards();
      }, 120);
    });

    // ==========================================
    // BRACKET RENDERER
    // ==========================================
    function normalizeBracketState() {
      if (!tournamentState?.mainBracket) return;

      let pendingFeed = null;
      if (tournamentState.lowerBracket) {
        tournamentState.lowerBracket.rounds = normalizeBracketRounds(tournamentState.lowerBracket.rounds, null);
        const lowerWinner = getBracketWinner(tournamentState.lowerBracket.rounds);
        const feed = tournamentState.lowerBracket.feedsInto;
        if (lowerWinner) {
            tournamentState.mainBracket.rounds[0].matches[feed.matchIndex][feed.side] = cloneDriver({
              ...lowerWinner,
              seed: tournamentState.plan?.resolvedFormat === FORMAT_SDC
                ? getSdcPlayInSeed(tournamentState.plan.mainBracketSize)
                : lowerWinner.seed,
            });
        } else {
            tournamentState.mainBracket.rounds[0].matches[feed.matchIndex][feed.side] = null;
            pendingFeed = feed;
        }
      }
      
      tournamentState.mainBracket.rounds = normalizeBracketRounds(tournamentState.mainBracket.rounds, pendingFeed);
      tournamentState.mainBracket.thirdPlaceMatch = normalizeThirdPlaceMatch(
        tournamentState.mainBracket.rounds,
        tournamentState.mainBracket.thirdPlaceMatch,
      );
    }

    function getMatchLoser(match) {
      if (!match?.winner || !match.left || !match.right) return null;
      if (participantKey(match.winner) === participantKey(match.left)) return cloneDriver(match.right);
      if (participantKey(match.winner) === participantKey(match.right)) return cloneDriver(match.left);
      return null;
    }

    function normalizeThirdPlaceMatch(rounds, existingMatch = null) {
      if (!Array.isArray(rounds) || rounds.length < 2) return null;
      const semifinalRound = rounds[rounds.length - 2];
      if (!semifinalRound?.matches || semifinalRound.matches.length < 2) return null;

      const previousMatch = existingMatch ? cloneMatch(existingMatch) : createEmptyMatch();
      const left = getMatchLoser(semifinalRound.matches[0]);
      const right = getMatchLoser(semifinalRound.matches[1]);

      if (left && right && previousMatch.winnerMode === "manual") {
        const previousWinnerKey = participantKey(previousMatch.winner);
        if (previousWinnerKey === participantKey(left) || previousWinnerKey === participantKey(right)) {
          return { ...previousMatch, left, right, winner: cloneDriver(previousMatch.winner), winnerMode: "manual" };
        }
      }

      return {
        ...previousMatch,
        left,
        right,
        winner: null,
        winnerMode: null,
      };
    }

    function getCompletedMatchCount(rounds) {
      return rounds.reduce((count, round) => count + round.matches.filter((match) => match.left && match.right && match.winner).length, 0);
    }

    function pushPendingFlowEntry(entries, bracketKey, roundIndex, matchIndex, match, title, meta) {
      if (!match || !match.left || !match.right || match.winner) return;
      entries.push({ bracketKey, roundIndex, matchIndex, title, meta, match });
    }

    function pushSideRoundFlowEntries(entries, bracketKey, rounds, leftMetaPrefix, rightMetaPrefix) {
      rounds.forEach((round, roundIndex) => {
        const half = Math.floor(round.matches.length / 2);
        round.matches.slice(0, half).forEach((match, matchOffset) => {
          pushPendingFlowEntry(
            entries,
            bracketKey,
            roundIndex,
            matchOffset,
            match,
            `${round.name} Battle ${matchOffset + 1}`,
            `${leftMetaPrefix} | ${round.name}`,
          );
        });

        round.matches.slice(half).forEach((match, matchOffset) => {
          pushPendingFlowEntry(
            entries,
            bracketKey,
            roundIndex,
            half + matchOffset,
            match,
            `${round.name} Battle ${matchOffset + 1}`,
            `${rightMetaPrefix} | ${round.name}`,
          );
        });
      });
    }

    function getMainBattleFlowEntries(rounds, thirdPlaceMatch = null) {
      if (!Array.isArray(rounds) || !rounds.length) return [];

      const entries = [];
      if (rounds.length === 1) {
        pushPendingFlowEntry(entries, "main", 0, 0, rounds[0].matches[0], "Final Battle", "Center Stage");
        return entries;
      }

      const sideRounds = rounds.slice(0, -1);
      pushSideRoundFlowEntries(entries, "main", sideRounds, "Left Column", "Right Column");

      const finalRoundIndex = rounds.length - 1;
      if (thirdPlaceMatch?.left && thirdPlaceMatch?.right && !thirdPlaceMatch?.winner) {
        pushPendingFlowEntry(entries, "third", 0, 0, thirdPlaceMatch, "3rd Place Battle", "Center Stage");
      }
      pushPendingFlowEntry(entries, "main", finalRoundIndex, 0, rounds[finalRoundIndex].matches[0], "Final Battle", "Center Stage");
      return entries;
    }

    function getLowerBattleFlowEntries(rounds) {
      if (!Array.isArray(rounds) || !rounds.length) return [];

      const entries = [];
      if (rounds.length === 1) {
        pushPendingFlowEntry(entries, "lower", 0, 0, rounds[0].matches[0], "Lower Bracket Final", "Lower Bracket");
        return entries;
      }

      const sideRounds = rounds.slice(0, -1);
      pushSideRoundFlowEntries(entries, "lower", sideRounds, "Lower Left", "Lower Right");

      pushPendingFlowEntry(entries, "lower", rounds.length - 1, 0, rounds[rounds.length - 1].matches[0], "Lower Bracket Final", "Center Stage");
      return entries;
    }

    function shouldShowLowerBracketRuleAlert() {
      const lowerRounds = tournamentState?.lowerBracket?.rounds || [];
      if (!lowerRounds.length) return false;
      const lowerEntries = getLowerBattleFlowEntries(lowerRounds);
      if (!lowerEntries.length) return false;
      const currentEntry = lowerEntries[0];
      const isLowerFinal = currentEntry.roundIndex === lowerRounds.length - 1 && currentEntry.matchIndex === 0;
      return !isLowerFinal;
    }

    function renderBattleFlowCard(entry, label, isCurrent = false, slotClass = "") {
      if (!entry) {
        return `
          <article class="battle-flow-card ${slotClass}">
            <p class="battle-flow-label">${label}</p>
            <div class="battle-flow-empty">No battle queued yet.</div>
          </article>
        `;
      }

      const leftDriver = entry.match.left;
      const rightDriver = entry.match.right;
      const leadSide = (leftDriver?.seed ?? Number.MAX_SAFE_INTEGER) <= (rightDriver?.seed ?? Number.MAX_SAFE_INTEGER) ? "left" : "right";
      const chaseSide = leadSide === "left" ? "right" : "left";
      const leadDriver = leadSide === "left" ? leftDriver : rightDriver;
      const chaseDriver = chaseSide === "left" ? leftDriver : rightDriver;
      const actionClass = isCurrent ? "current" : "preview";
      const canAdvance = isCurrent && adminCanEdit();
      const actionAttrs = isCurrent ? `data-flow-bracket="${entry.bracketKey}" data-flow-round="${entry.roundIndex}" data-flow-match="${entry.matchIndex}"` : "";
      const selectedSignature = winnerAnimationState?.selected?.signature || "";
      const leadSelected = selectedSignature && selectedSignature === buildSlotSignature(entry.bracketKey, entry.roundIndex, entry.matchIndex, leadSide, leadDriver);
      const chaseSelected = selectedSignature && selectedSignature === buildSlotSignature(entry.bracketKey, entry.roundIndex, entry.matchIndex, chaseSide, chaseDriver);

      return `
        <article class="battle-flow-card ${isCurrent ? "current" : ""} ${slotClass}">
          <p class="battle-flow-label">${label}</p>
          <h4 class="battle-flow-title">${entry.title}</h4>
          <div class="battle-flow-meta">${entry.meta}</div>
          <div class="battle-flow-vs">
            <button class="battle-flow-option ${actionClass} ${leadSelected ? "just-advanced" : ""}" type="button" ${actionAttrs} data-flow-side="${leadSide}" ${canAdvance ? "" : "disabled"}>
              <span>Lead | #${leadDriver.seed} ${escapeHtml(leadDriver.name)}</span>
              <small>Qual ${formatScore(leadDriver.bestScore)}</small>
            </button>
            <button class="battle-flow-option ${actionClass} ${chaseSelected ? "just-advanced" : ""}" type="button" ${actionAttrs} data-flow-side="${chaseSide}" ${canAdvance ? "" : "disabled"}>
              <span>Chase | #${chaseDriver.seed} ${escapeHtml(chaseDriver.name)}</span>
              <small>Qual ${formatScore(chaseDriver.bestScore)}</small>
            </button>
          </div>
        </article>
      `;
    }

    function renderJudgeLaneStateCard(phase, totalDrivers) {
      const title = phase === "complete" ? "Qualifying Complete" : phase === "empty" ? "Waiting For Drivers" : "Waiting For Qualifying To Start";
      const note = phase === "complete"
        ? "This event has finished qualifying. Judge inputs are locked until a new qualifying session begins."
        : phase === "empty"
          ? "No registered drivers are available yet. Add drivers first to begin qualifying."
          : `Waiting for the event admin to start qualifying.${totalDrivers ? ` ${totalDrivers} driver${totalDrivers === 1 ? "" : "s"} ready.` : ""}`;
      return `
        <section class="judge-lane-shell judge-lane-state-shell">
          <div class="judge-lane-toolbar">
            <div class="judge-lane-meta">
              <div>
                <div class="judge-lane-progress">Judges Panel</div>
                <strong>${title}</strong>
              </div>
              <div class="mobile-driver-reg">${totalDrivers || 0} Driver${totalDrivers === 1 ? "" : "s"}</div>
            </div>
          </div>
          <article class="mobile-driver-card">
            <div class="empty-state">${note}</div>
          </article>
        </section>
      `;
    }

    function renderBattleFlowPair(currentSlot, nextSlot, entries, shouldAnimate = false) {
      if (currentSlot) {
        currentSlot.innerHTML = renderBattleFlowCard(entries[0] || null, "Current Battle", true, "flow-slot-current");
        currentSlot.classList.toggle("is-animating", shouldAnimate);
      }
      if (nextSlot) {
        nextSlot.innerHTML = renderBattleFlowCard(entries[1] || null, "Next Battle", false, "flow-slot-next");
        nextSlot.classList.toggle("is-animating", shouldAnimate);
      }
      if (shouldAnimate) {
        setTimeout(() => {
          currentSlot?.classList.remove("is-animating");
          nextSlot?.classList.remove("is-animating");
        }, 420);
      }
    }

    function renderBattleFlow() {
      const panel = document.getElementById("battleFlowPanel");
      const content = document.getElementById("battleFlowContent");
      const status = document.getElementById("battleFlowStatus");
      const lowerCurrent = document.getElementById("lowerBracketCurrentBattle");
      const lowerNext = document.getElementById("lowerBracketNextBattle");
      const mainCurrent = document.getElementById("mainBracketCurrentBattle");
      const mainNext = document.getElementById("mainBracketNextBattle");
      if (!tournamentState?.mainBracket?.rounds?.length) {
        panel.classList.add("hidden");
        content.innerHTML = "";
        status.textContent = "No Bracket";
        [lowerCurrent, lowerNext, mainCurrent, mainNext].forEach((slot) => {
          if (slot) slot.innerHTML = "";
        });
        lastBattleFlowSignature = null;
        return;
      }

      const lowerEntries = getLowerBattleFlowEntries(tournamentState.lowerBracket?.rounds || []);
      const mainEntries = getMainBattleFlowEntries(
        tournamentState.mainBracket.rounds,
        tournamentState.mainBracket.thirdPlaceMatch,
      );
      const visibleEntries = activeCompetitionBracketPage === "lower" && lowerEntries.length ? lowerEntries : mainEntries;
      const currentEntry = visibleEntries[0] || null;
      const currentSignature = currentEntry ? `${currentEntry.bracketKey}:${currentEntry.roundIndex}:${currentEntry.matchIndex}` : "none";
      const shouldAnimate = lastBattleFlowSignature !== null && currentSignature !== lastBattleFlowSignature;
      lastBattleFlowSignature = currentSignature;
      status.textContent = currentEntry?.bracketKey === "lower"
        ? "Lower Bracket"
        : currentEntry?.bracketKey === "third"
          ? "3rd Place"
          : "Main Bracket";
      panel.classList.remove("hidden");
      content.innerHTML = "";
      if (lowerEntries.length) {
        renderBattleFlowPair(lowerCurrent, lowerNext, lowerEntries, shouldAnimate && activeCompetitionBracketPage === "lower");
      } else {
        if (lowerCurrent) lowerCurrent.innerHTML = "";
        if (lowerNext) lowerNext.innerHTML = "";
      }
      renderBattleFlowPair(mainCurrent, mainNext, mainEntries, shouldAnimate && (activeCompetitionBracketPage !== "lower" || !lowerEntries.length));
    }

    function renderSummary() {
      document.getElementById("mainBracketTitle").textContent = activeEventMeta?.name || "Main Competition";
      const summaryStrip = document.getElementById("summaryStrip");
      summaryStrip.innerHTML = "";
      summaryStrip.style.display = "none";
    }

    function renderPodiumCard(placeLabel, driver, fallbackText, revealDelay = 0, shouldReveal = false) {
      if (!driver) {
        return `
          <article class="podium-card ${shouldReveal ? "podium-reveal" : ""}" style="${shouldReveal ? `--podium-delay:${revealDelay}ms;` : ""}">
            <span>${placeLabel}</span>
            <strong>${fallbackText}</strong>
            <small>Waiting for result</small>
          </article>
        `;
      }

      return `
        <article class="podium-card ${shouldReveal ? "podium-reveal" : ""}" style="${shouldReveal ? `--podium-delay:${revealDelay}ms;` : ""}">
          <span>${placeLabel}</span>
          <strong>#${driver.seed} ${escapeHtml(driver.name)}</strong>
          <small>${driver.teamName?.trim() ? `Team ${escapeHtml(driver.teamName.trim())}` : `Qual ${formatScore(driver.bestScore)}`}</small>
        </article>
      `;
    }

    function renderChampion() {
      const champion = getBracketWinner(tournamentState.mainBracket.rounds);
      const banner = document.getElementById("championBanner");
      if (!champion) {
        banner.classList.add("hidden");
        banner.classList.remove("is-revealing");
        banner.innerHTML = "";
        lastPodiumSignature = null;
        return;
      }
      const finalMatch = tournamentState.mainBracket.rounds[tournamentState.mainBracket.rounds.length - 1]?.matches?.[0] || null;
      const runnerUp = getMatchLoser(finalMatch);
      const thirdPlace = tournamentState.mainBracket.thirdPlaceMatch?.winner
        ? cloneDriver(tournamentState.mainBracket.thirdPlaceMatch.winner)
        : null;
      const podiumSignature = [
        participantKey(champion) || "none",
        participantKey(runnerUp) || "none",
        participantKey(thirdPlace) || "none",
      ].join("|");
      const shouldReveal = lastPodiumSignature !== null && podiumSignature !== lastPodiumSignature;
      lastPodiumSignature = podiumSignature;
      banner.classList.remove("hidden");
      banner.classList.toggle("is-revealing", shouldReveal);
      banner.innerHTML = `
        <span>Final Results</span>
        <strong>#${champion.seed} ${escapeHtml(champion.name)}</strong>
        <div class="podium-grid">
          ${renderPodiumCard("1st Place", champion, "Waiting for winner", 60, shouldReveal)}
          ${renderPodiumCard("2nd Place", runnerUp, "Waiting for finalist", 150, shouldReveal)}
          ${renderPodiumCard("3rd Place", thirdPlace, "Waiting for 3rd place battle", 240, shouldReveal)}
        </div>
      `;
    }

    function getEmptySlotText(bracketKey, roundIndex, matchIndex, side) {
      if (bracketKey === "third") return "Waiting for semifinal losers";
      if (roundIndex > 0) return "Waiting for winner";
      if (bracketKey === "main" && tournamentState?.lowerBracket) {
        const feed = tournamentState.lowerBracket.feedsInto;
        if (feed && feed.matchIndex === matchIndex && feed.side === side) return "Play-In Winner";
      }
      return "BYE";
    }

    function renderLowerDriverButton(bracketKey, roundIndex, matchIndex, side, driver, winner, canChoose) {
      if (!driver) {
        return `<button class="driver-button empty" type="button" disabled><span>${getEmptySlotText(bracketKey, roundIndex, matchIndex, side)}</span></button>`;
      }
      const selected = participantKey(driver) === participantKey(winner);
      const loser = Boolean(winner) && !selected;
      const disabledHTML = (!adminCanEdit() || !canChoose) ? "disabled" : "";
      const slotSignature = buildSlotSignature(bracketKey, roundIndex, matchIndex, side, driver);
      const isWinnerBurst = winnerAnimationState?.selected?.signature === slotSignature && selected;
      const isIncomingWinner = winnerAnimationState?.target?.signature === slotSignature;
      return `
        <button class="driver-button ${selected ? "selected" : ""} ${loser ? "loser" : ""} ${isWinnerBurst ? "winner-just-selected" : ""} ${isIncomingWinner ? "incoming-winner" : ""}" type="button" data-bracket="${bracketKey}" data-round="${roundIndex}" data-match="${matchIndex}" data-side="${side}" ${disabledHTML}>
          <strong>#${driver.seed} ${escapeHtml(driver.name)}</strong>
          <small>Qual ${formatScore(driver.bestScore)}</small>
        </button>
      `;
    }

    function getRoundMetrics(sideRoundCount) {
      const isCompactLandscape = window.innerWidth <= 960 && window.matchMedia?.("(orientation: landscape)")?.matches;
      const baseSlotHeight = isCompactLandscape ? 58 : window.innerWidth <= 720 ? 66 : 86;
      const metrics = [];
      let gap = isCompactLandscape ? 8 : window.innerWidth <= 720 ? 10 : 10;
      let pitch = baseSlotHeight + gap;
      let offset = 0;
      for (let stageIndex = 0; stageIndex < sideRoundCount; stageIndex += 1) {
        if (stageIndex === 0) { metrics.push({ gap, offset }); continue; }
        offset += pitch / 2;
        pitch *= 2;
        gap = pitch - baseSlotHeight;
        metrics.push({ gap, offset });
      }
      return metrics;
    }

    function renderMainSlot(bracketKey, roundIndex, matchIndex, side, driver, winner, canChoose, align) {
      if (!driver) return `<div class="main-battle-slot"><button class="slot-button empty" type="button" disabled>${getEmptySlotText(bracketKey, roundIndex, matchIndex, side)}</button></div>`;
      
      const selected = participantKey(driver) === participantKey(winner);
      const loser = Boolean(winner) && !selected;
      const disabledHTML = (!adminCanEdit() || !canChoose) ? "disabled" : "";
      const teamMarkup = driver.teamName?.trim() ? `<span class="slot-team">${escapeHtml(driver.teamName.trim())}</span>` : "";
      const slotSignature = buildSlotSignature(bracketKey, roundIndex, matchIndex, side, driver);
      const isWinnerBurst = winnerAnimationState?.selected?.signature === slotSignature && selected;
      const isIncomingWinner = winnerAnimationState?.target?.signature === slotSignature;
      const button = `<button class="slot-button ${selected ? "selected" : ""} ${loser ? "loser" : ""} ${isWinnerBurst ? "winner-just-selected" : ""}" type="button" data-bracket="${bracketKey}" data-round="${roundIndex}" data-match="${matchIndex}" data-side="${side}" ${disabledHTML}><span class="slot-name">${escapeHtml(driver.name)}</span>${teamMarkup}</button>`;
      const seedChip = `<span class="seed-chip">${driver.seed}</span>`;

      return align === "right"
        ? `<div class="main-battle-slot ${isIncomingWinner ? "incoming-winner" : ""}">${button}${seedChip}</div>`
        : `<div class="main-battle-slot ${isIncomingWinner ? "incoming-winner" : ""}">${seedChip}${button}</div>`;
    }

    function renderMainBattle(bracketKey, roundIndex, matchIndex, match, align) {
      const canChoose = Boolean(match.left && match.right);
      return `<article class="main-battle ${align}"><div class="main-battle-stack">${renderMainSlot(bracketKey, roundIndex, matchIndex, "left", match.left, match.winner, canChoose, align)}${renderMainSlot(bracketKey, roundIndex, matchIndex, "right", match.right, match.winner, canChoose, align)}</div></article>`;
    }

    function renderFinalBattle(bracketKey, roundIndex, match, title = "Final Battle") {
      const canChoose = Boolean(match.left && match.right);
      return `<article class="main-battle center final-center"><div class="final-battle-card"><div class="final-battle-head">${title}</div><div class="final-battle-body">${renderMainSlot(bracketKey, roundIndex, 0, "left", match.left, match.winner, canChoose, "center")}<div class="final-vs">VS</div>${renderMainSlot(bracketKey, roundIndex, 0, "right", match.right, match.winner, canChoose, "center")}</div></div></article>`;
    }

    function renderPlacementBattle(bracketKey, match, title) {
      const canChoose = Boolean(match?.left && match?.right);
      return `<article class="main-battle center placement-center"><div class="final-battle-card third-place-card"><div class="final-battle-head">${title}</div><div class="final-battle-body">${renderMainSlot(bracketKey, 0, 0, "left", match?.left, match?.winner, canChoose, "center")}<div class="final-vs">VS</div>${renderMainSlot(bracketKey, 0, 0, "right", match?.right, match?.winner, canChoose, "center")}</div></div></article>`;
    }

    function renderBracketBoard(bracketKey, rounds, options = {}) {
      const thirdPlaceMatch = options.thirdPlaceMatch || null;
      const finalTitle = options.finalTitle || "Final Battle";
      const centerLabel = thirdPlaceMatch ? "Podium" : "Final";
      const isCompactLandscape = window.innerWidth <= 960 && window.matchMedia?.("(orientation: landscape)")?.matches;
      const isCompactMobile = window.innerWidth <= 720;
      const roundWidth = isCompactLandscape ? 118 : isCompactMobile ? 132 : 184;
      const centerWidth = isCompactLandscape ? 156 : isCompactMobile ? 176 : 270;
      const boardGap = isCompactLandscape ? 8 : isCompactMobile ? 10 : 18;
      if (!rounds.length) return "";
      if (rounds.length === 1) {
        return `<div class="main-board-canvas" style="min-width: 320px;"><div class="main-board-grid" style="grid-template-columns: 1fr;"><div class="center-stage-stack">${renderFinalBattle(bracketKey, 0, rounds[0].matches[0], finalTitle)}</div></div></div>`;
      }

      const sideRounds = rounds.slice(0, -1);
      const finalRound = rounds[rounds.length - 1];
      const metrics = getRoundMetrics(sideRounds.length);
      const leftRounds = sideRounds.map(r => r.matches.slice(0, Math.floor(r.matches.length / 2)));
      const rightRounds = sideRounds.map(r => r.matches.slice(Math.floor(r.matches.length / 2)));
      const rightRoundsReversed = [...rightRounds].reverse();
      const labelColumns = [...sideRounds.map(r => r.name), centerLabel, ...[...sideRounds].reverse().map(r => r.name)];
      const gridTemplate = `${Array(sideRounds.length).fill(`${roundWidth}px`).join(" ")} ${centerWidth}px ${Array(sideRounds.length).fill(`${roundWidth}px`).join(" ")}`;
      const columnCount = sideRounds.length * 2 + 1;
      const boardWidth = sideRounds.length * roundWidth * 2 + centerWidth + Math.max(columnCount - 1, 0) * boardGap;

      const leftMarkup = leftRounds.map((matches, stageIndex) => `<section class="main-board-round" style="--round-gap: ${metrics[stageIndex].gap}px; --round-offset: ${metrics[stageIndex].offset}px;"><div class="main-board-round-matches">${matches.map((match, matchIndex) => renderMainBattle(bracketKey, stageIndex, matchIndex, match, "left")).join("")}</div></section>`).join("");
      const rightMarkup = rightRoundsReversed.map((matches, reverseIndex) => {
        const stageIndex = sideRounds.length - 1 - reverseIndex;
        const originalMatches = rightRounds[stageIndex];
        return `<section class="main-board-round" style="--round-gap: ${metrics[stageIndex].gap}px; --round-offset: ${metrics[stageIndex].offset}px;"><div class="main-board-round-matches">${matches.map(match => renderMainBattle(bracketKey, stageIndex, Math.floor(sideRounds[stageIndex].matches.length / 2) + originalMatches.indexOf(match), match, "right")).join("")}</div></section>`;
      }).join("");

      return `
        <div class="main-board-canvas" style="min-width: ${boardWidth}px;">
          <div class="main-board-round-labels" style="grid-template-columns: ${gridTemplate};">${labelColumns.map(label => `<div class="main-board-label">${label}</div>`).join("")}</div>
          <div class="main-board-grid" style="grid-template-columns: ${gridTemplate};">
            <div class="main-board-side left" style="grid-column: 1 / span ${sideRounds.length}; grid-template-columns: repeat(${sideRounds.length}, ${roundWidth}px);">${leftMarkup}</div>
            <div style="grid-column: ${sideRounds.length + 1} / span 1;"><div class="center-stage-stack">${renderFinalBattle(bracketKey, rounds.length - 1, finalRound.matches[0], finalTitle)}${thirdPlaceMatch ? renderPlacementBattle("third", thirdPlaceMatch, "3rd Place Battle") : ""}</div></div>
            <div class="main-board-side right" style="grid-column: ${sideRounds.length + 2} / span ${sideRounds.length}; grid-template-columns: repeat(${sideRounds.length}, ${roundWidth}px);">${rightMarkup}</div>
          </div>
        </div>
      `;
    }

    function fitBracketBoard(boardId) {
      const board = document.getElementById(boardId);
      if (!board) return;
      const canvas = board.querySelector(".main-board-canvas");
      if (!canvas) {
        board.style.removeProperty("--board-scale");
        board.style.removeProperty("minHeight");
        board.classList.remove("is-fitted");
        return;
      }

      board.classList.add("is-fitted");
      canvas.style.transform = "scale(1)";
      const boardRect = board.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || board.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || board.clientHeight || 0;
      const horizontalPadding = 24;
      const verticalPadding = 24;
      const availableWidth = Math.max(Math.min(board.clientWidth, viewportWidth - boardRect.left - horizontalPadding), 0);
      const availableHeight = Math.max(viewportHeight - boardRect.top - verticalPadding, 0);
      const naturalWidth = canvas.scrollWidth;
      const naturalHeight = canvas.scrollHeight;
      const widthScale = naturalWidth > 0 && availableWidth > 0 ? availableWidth / naturalWidth : 1;
      const heightScale = naturalHeight > 0 && availableHeight > 0 ? availableHeight / naturalHeight : 1;
      const scale = Math.min(1, widthScale, heightScale);
      board.style.setProperty("--board-scale", String(scale));
      board.style.minHeight = `${Math.ceil(naturalHeight * scale)}px`;
    }

    function fitAllBracketBoards() {
      fitBracketBoard("lowerBracketBoard");
      fitBracketBoard("bracketBoard");
    }

    function renderBracket() {
      if (!tournamentState?.mainBracket) {
        const summaryStrip = document.getElementById("summaryStrip");
        summaryStrip.innerHTML = "";
        summaryStrip.style.display = "none";
        document.getElementById("battleFlowPanel").classList.add("hidden");
        document.getElementById("battleFlowContent").innerHTML = "";
        document.getElementById("competitionBracketTabs").classList.add("hidden");
        document.getElementById("lowerBracketRuleAlert")?.classList.add("hidden");
        document.getElementById("lowerBracketPage").classList.remove("is-active");
        document.getElementById("mainBracketPage").classList.add("is-active");
        document.getElementById("lowerBracketBoard").innerHTML = "";
        document.getElementById("bracketBoard").innerHTML = "";
        document.getElementById("championBanner").classList.add("hidden");
        document.getElementById("emptyBracketState").classList.remove("hidden");
        return;
      }

      normalizeBracketState();

      document.getElementById("emptyBracketState").classList.add("hidden");
      renderSummary();
      renderBattleFlow();
      renderChampion();
      document.getElementById("lowerBracketRuleAlert")?.classList.toggle("hidden", !shouldShowLowerBracketRuleAlert());

      if (tournamentState.lowerBracket) {
        document.getElementById("competitionBracketTabs").classList.remove("hidden");
        document.querySelector('[data-bracket-page="lower"]').classList.remove("hidden");
        if (activeCompetitionBracketPage !== "lower" && activeCompetitionBracketPage !== "main") {
          activeCompetitionBracketPage = "lower";
        }
        document.getElementById("lowerBracketBoard").innerHTML = renderBracketBoard("lower", tournamentState.lowerBracket.rounds, {
          finalTitle: "Lower Bracket Final",
        });
      } else {
        document.getElementById("competitionBracketTabs").classList.add("hidden");
        document.querySelector('[data-bracket-page="lower"]').classList.add("hidden");
        activeCompetitionBracketPage = "main";
      }
      document.getElementById("bracketBoard").innerHTML = renderBracketBoard("main", tournamentState.mainBracket.rounds, {
        thirdPlaceMatch: tournamentState.mainBracket.thirdPlaceMatch,
        finalTitle: "Final Battle",
      });
      updateCompetitionBracketPage();
      requestAnimationFrame(fitAllBracketBoards);
    }

    function updateCompetitionBracketPage() {
      const hasLowerBracket = Boolean(tournamentState?.lowerBracket?.rounds?.length);
      const lowerHasPendingBattles = hasLowerBracket && getLowerBattleFlowEntries(tournamentState.lowerBracket.rounds).length > 0;
      if (hasLowerBracket && !lowerHasPendingBattles && activeCompetitionBracketPage === "lower" && !adminCanEdit()) {
        activeCompetitionBracketPage = "main";
      }
      const resolvedPage = hasLowerBracket ? activeCompetitionBracketPage : "main";
      document.getElementById("lowerBracketPage").classList.toggle("is-active", resolvedPage === "lower" && hasLowerBracket);
      document.getElementById("mainBracketPage").classList.toggle("is-active", resolvedPage === "main" || !hasLowerBracket);
      document.querySelectorAll("[data-bracket-page]").forEach((tab) => {
        const page = tab.dataset.bracketPage;
        const hidden = page === "lower" && !hasLowerBracket;
        tab.classList.toggle("hidden", hidden);
        tab.classList.toggle("is-active", !hidden && page === resolvedPage);
      });
    }

    function chooseWinner(bracketKey, roundIndex, matchIndex, side) {
      if (!adminCanEdit()) return;
      let match = null;
      if (bracketKey === "lower") {
        if (!tournamentState.lowerBracket) return;
        match = tournamentState.lowerBracket.rounds[roundIndex].matches[matchIndex];
      } else if (bracketKey === "third") {
        match = tournamentState.mainBracket?.thirdPlaceMatch;
      } else {
        if (!tournamentState.mainBracket) return;
        match = tournamentState.mainBracket.rounds[roundIndex].matches[matchIndex];
      }
      if (!match) return;
      const selectedDriver = match[side];

      if (!selectedDriver || !match.left || !match.right) return;

      if (participantKey(match.winner) === participantKey(selectedDriver)) {
        // If clicking the driver who is ALREADY the winner, undo it
        match.winner = null;
        match.winnerMode = null;
        clearWinnerAnimationState();
      } else {
        // Otherwise, set them as the new winner
        match.winner = cloneDriver(selectedDriver);
        match.winnerMode = "manual";
        triggerWinnerAnimation(buildWinnerAnimationState(bracketKey, roundIndex, matchIndex, side, selectedDriver));
      }

      publishState();
      renderBracket();
    }

    document.getElementById("lowerBracketBoard").addEventListener("click", (e) => {
      const btn = e.target.closest(".slot-button[data-bracket='lower'], .driver-button[data-bracket='lower']");
      if (btn) chooseWinner("lower", parseInt(btn.dataset.round, 10), parseInt(btn.dataset.match, 10), btn.dataset.side);
    });

    document.getElementById("bracketBoard").addEventListener("click", (e) => {
      const btn = e.target.closest(".slot-button[data-bracket='main'], .slot-button[data-bracket='third']");
      if (btn) chooseWinner(btn.dataset.bracket, parseInt(btn.dataset.round || "0", 10), parseInt(btn.dataset.match || "0", 10), btn.dataset.side);
    });

    document.getElementById("view-bracket").addEventListener("click", (e) => {
      const btn = e.target.closest(".battle-flow-option.current[data-flow-bracket]");
      if (!btn) return;
      chooseWinner(btn.dataset.flowBracket, parseInt(btn.dataset.flowRound || "0", 10), parseInt(btn.dataset.flowMatch || "0", 10), btn.dataset.flowSide);
    });

    document.getElementById("resetBracketBtn").addEventListener("click", () => {
      if (!adminCanEdit() || !tournamentState?.qualifiedDrivers?.length) return;
      const lowerCount = getRequestedSdcMainBracketSize(bracketModeSelect.value) || 0;
      tournamentState = createTournamentState(tournamentState.qualifiedDrivers, normalizePreferredFormat(tournamentState.preferredFormat || FORMAT_CLASSIC), lowerCount);
      publishState();
      renderBracket();
    });

    async function bootstrapApp() {
      syncForcedHostContext();
      initializeTheme();
      await initLocalState();
      if (STANDALONE_DEMO_MODE) {
        activateStandaloneDemoWindow();
      }
      renderEventDirectory();
      setWebsiteAdminAccess(isWebsiteAdmin);
      applyRoleChange(forcedHostContext?.kind === "website-admin" ? "spectator" : currentRole);
      applyRouteFromLocation();
      if (db && auth?.currentUser) {
        setupCloudSync(auth.currentUser);
      }
    }

    // Final Init Call
    bootstrapApp();

