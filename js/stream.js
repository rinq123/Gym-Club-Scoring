import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  competitionName: "Eclipse Invitational 2026",
  categories: [
    "Women's Pair",
    "Mixed Pair",
    "Men's Pair",
    "Women's Group",
    "Men's Group"
  ],
  grades: [
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Aspire",
    "IDP 1",
    "IDP 2"
  ]
};
const DEFAULT_DISPLAY_SETTINGS = {
  rowsMode: "auto",
  manualRows: 5,
  fontScale: 1,
  pageDurationSeconds: 7
};
const DEFAULT_SCOREBOARD_SETTINGS = {
  category: "All",
  grade: "All",
  rankingMode: "overall"
};
const DEFAULT_STREAM_STATE = {
  mode: "welcome",
  performerId: null,
  performerName: null,
  performerClub: null,
  performerNumber: null,
  performerCategory: null,
  performerGrade: null,
  mixSeconds: 20,
  displaySettings: { ...DEFAULT_DISPLAY_SETTINGS },
  scoreboardSettings: { ...DEFAULT_SCOREBOARD_SETTINGS }
};

const settingsRef = doc(db, "settingsPublic", "current");

const streamRoot = document.querySelector(".display.stream");
const title = document.querySelector("#stream-title");
const updated = document.querySelector("#stream-updated");
const idlePanel = document.querySelector("#stream-idle");
const welcomePanel = document.querySelector("#stream-welcome");
const announcementPanel = document.querySelector("#stream-announcement");
const spotlightPanel = document.querySelector("#stream-spotlight");
const scoreboardPanel = document.querySelector("#stream-scoreboard");
const streamEyebrow = document.querySelector("#stream-eyebrow");
const streamIdleTitle = document.querySelector("#stream-idle-title");
const streamWelcomeTitle = document.querySelector("#stream-welcome-title");
const performerName = document.querySelector("#stream-performer-name");
const performerClub = document.querySelector("#stream-performer-club");
const performerScore = document.querySelector("#stream-performer-score");
const performerScoreLabel = spotlightPanel ? spotlightPanel.querySelector(".stream-score-label") : null;
const performerScoreBlock = spotlightPanel ? spotlightPanel.querySelector(".stream-score") : null;
const spotlightSectionLabel = spotlightPanel ? spotlightPanel.querySelector(".stream-section-label") : null;
const scoreRows = document.querySelector("#stream-score-rows");
const scoreboardContextBadge = document.querySelector("#stream-scoreboard-context");
const scoreboardWrap = scoreboardPanel ? scoreboardPanel.querySelector(".table-wrap") : null;

let settings = { ...DEFAULT_SETTINGS };
let scores = [];
let streamState = normalizeStreamState();
let mixTimer = null;
let mixPhase = "idle";
let lastMixSeconds = null;
let scoreCache = new Map();
let activeCompetitionId = null;
let unsubScores = null;
let unsubStream = null;
let pageIndex = 0;
let pageTimer = null;
let lastPageCount = 1;
let paginationEnabled = true;
let spotlightFitRaf = null;
let lastPageDurationMs = null;

const SPOTLIGHT_FIT_BOUNDS = {
  name: { max: 148, min: 48 },
  meta: { max: 46, min: 20 },
  score: { max: 190, min: 70 },
  scoreLabel: { max: 34, min: 16 },
  sectionLabel: { max: 20, min: 11 },
  scoreGap: { max: 30, min: 10 },
  nameMarginBottom: { max: 18, min: 8 },
  metaMarginBottom: { max: 36, min: 10 }
};

function scaleValue(bounds, scale) {
  return Math.max(bounds.min, Math.round(bounds.max * scale));
}

function applySpotlightScale(scale) {
  if (!spotlightPanel) {
    return;
  }
  performerName.style.fontSize = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.name, scale)}px`;
  performerClub.style.fontSize = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.meta, scale)}px`;
  performerScore.style.fontSize = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.score, scale)}px`;
  performerName.style.marginBottom = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.nameMarginBottom, scale)}px`;
  performerClub.style.marginBottom = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.metaMarginBottom, scale)}px`;

  if (performerScoreLabel) {
    performerScoreLabel.style.fontSize = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.scoreLabel, scale)}px`;
  }
  if (spotlightSectionLabel) {
    spotlightSectionLabel.style.fontSize = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.sectionLabel, scale)}px`;
  }
  if (performerScoreBlock) {
    performerScoreBlock.style.gap = `${scaleValue(SPOTLIGHT_FIT_BOUNDS.scoreGap, scale)}px`;
  }
}

function spotlightFitsViewport() {
  if (!spotlightPanel) {
    return true;
  }
  const panelRect = spotlightPanel.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const edgePadding = 8;

  const withinViewport = (
    panelRect.top >= edgePadding &&
    panelRect.left >= edgePadding &&
    panelRect.bottom <= viewportHeight - edgePadding &&
    panelRect.right <= viewportWidth - edgePadding
  );

  const noInternalOverflow = (
    spotlightPanel.scrollHeight <= spotlightPanel.clientHeight + 1 &&
    spotlightPanel.scrollWidth <= spotlightPanel.clientWidth + 1
  );

  const scoreVisible = performerScoreBlock?.style.display === "none"
    ? true
    : performerScore.getBoundingClientRect().bottom <= panelRect.bottom - 6;

  return (
    withinViewport &&
    noInternalOverflow &&
    scoreVisible
  );
}

function fitSpotlightContent() {
  if (!spotlightPanel || !spotlightPanel.classList.contains("is-active")) {
    return;
  }

  applySpotlightScale(1);
  if (spotlightFitsViewport()) {
    return;
  }

  let low = 0.28;
  let high = 1;
  let best = low;

  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    applySpotlightScale(mid);
    if (spotlightFitsViewport()) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  applySpotlightScale(best);
}

function scheduleSpotlightFit() {
  if (!spotlightPanel) {
    return;
  }
  if (spotlightFitRaf) {
    cancelAnimationFrame(spotlightFitRaf);
  }
  spotlightFitRaf = requestAnimationFrame(() => {
    spotlightFitRaf = requestAnimationFrame(() => {
      fitSpotlightContent();
      spotlightFitRaf = null;
    });
  });
}

function setPanel(panel) {
  [welcomePanel, idlePanel, announcementPanel, spotlightPanel, scoreboardPanel].forEach((section) => {
    section.classList.toggle("is-active", section === panel);
  });
}

function toDate(value) {
  if (!value) {
    return new Date(0);
  }
  if (value.toDate) {
    return value.toDate();
  }
  return new Date(value);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeDisplaySettings(raw = {}) {
  const rowsMode = raw?.rowsMode === "manual" ? "manual" : "auto";
  const manualRows = Math.round(clampNumber(raw?.manualRows, 4, 10, DEFAULT_DISPLAY_SETTINGS.manualRows));
  const fontScaleRaw = clampNumber(raw?.fontScale, 0.85, 1.2, DEFAULT_DISPLAY_SETTINGS.fontScale);
  const fontScale = Number(fontScaleRaw.toFixed(2));
  const pageDurationSeconds = Math.round(
    clampNumber(raw?.pageDurationSeconds, 4, 12, DEFAULT_DISPLAY_SETTINGS.pageDurationSeconds)
  );
  return {
    rowsMode,
    manualRows,
    fontScale,
    pageDurationSeconds
  };
}

function normalizeScoreboardSettings(raw = {}, sourceSettings = settings) {
  const availableCategories = Array.isArray(sourceSettings?.categories) && sourceSettings.categories.length
    ? sourceSettings.categories
    : DEFAULT_SETTINGS.categories;
  const availableGrades = Array.isArray(sourceSettings?.grades) && sourceSettings.grades.length
    ? sourceSettings.grades
    : DEFAULT_SETTINGS.grades;
  const category = raw?.category === "All" || availableCategories.includes(raw?.category)
    ? (raw?.category || "All")
    : "All";
  const grade = raw?.grade === "All" || availableGrades.includes(raw?.grade)
    ? (raw?.grade || "All")
    : "All";
  const rankingMode = raw?.rankingMode === "byGrade" ? "byGrade" : "overall";

  return {
    category,
    grade,
    rankingMode
  };
}

function normalizeStreamState(raw = {}) {
  return {
    ...DEFAULT_STREAM_STATE,
    ...raw,
    displaySettings: normalizeDisplaySettings(raw?.displaySettings || DEFAULT_DISPLAY_SETTINGS),
    scoreboardSettings: normalizeScoreboardSettings(raw?.scoreboardSettings || DEFAULT_SCOREBOARD_SETTINGS)
  };
}

function getRowsPerPage(displaySettings = DEFAULT_DISPLAY_SETTINGS) {
  if (displaySettings.rowsMode === "manual") {
    return displaySettings.manualRows;
  }
  const height = window.innerHeight || 1080;
  if (height >= 1900) {
    return 7;
  }
  if (height >= 1300) {
    return 6;
  }
  return 5;
}

function triggerPageFlip() {
  if (!scoreboardWrap) {
    return;
  }
  scoreboardWrap.classList.add("is-page-flip");
  clearTimeout(triggerPageFlip.timer);
  triggerPageFlip.timer = setTimeout(() => {
    scoreboardWrap.classList.remove("is-page-flip");
  }, 600);
}

function stopPagination() {
  if (pageTimer) {
    clearInterval(pageTimer);
    pageTimer = null;
  }
  lastPageDurationMs = null;
}

function setPaginationEnabled(enabled) {
  if (paginationEnabled === enabled) {
    return;
  }
  paginationEnabled = enabled;
  if (!enabled) {
    stopPagination();
  } else {
    pageIndex = 0;
  }
}

function schedulePagination(totalPages, pageDurationSeconds) {
  if (!paginationEnabled || totalPages <= 1) {
    stopPagination();
    lastPageCount = totalPages;
    return;
  }
  const durationMs = Math.round(clampNumber(pageDurationSeconds, 4, 12, DEFAULT_DISPLAY_SETTINGS.pageDurationSeconds) * 1000);
  if (pageTimer && lastPageCount === totalPages && lastPageDurationMs === durationMs) {
    return;
  }
  stopPagination();
  lastPageCount = totalPages;
  lastPageDurationMs = durationMs;
  pageTimer = setInterval(() => {
    pageIndex = (pageIndex + 1) % totalPages;
    renderScoreboard(true);
  }, durationMs);
}

function renderScoreboard(isPaging = false) {
  const displaySettings = normalizeDisplaySettings(streamState.displaySettings);
  const scoreboardSettings = normalizeScoreboardSettings(streamState.scoreboardSettings, settings);
  if (scoreboardPanel) {
    scoreboardPanel.style.setProperty("--stream-font-scale", String(displaySettings.fontScale));
  }

  scoreRows.innerHTML = "";
  const allRows = scores
    .map((score) => {
      const totalValue = Number(score.total);
      return {
        ...score,
        athleteName: score.athleteName || "Unknown",
        athleteClub: score.athleteClub || "Unknown",
        competitorNumber: score.competitorNumber || "--",
        category: score.category || "--",
        grade: score.grade || "--",
        artistry: score.artistry,
        execution: score.execution,
        difficulty: score.difficulty,
        penalties: score.penalties,
        totalValue: Number.isFinite(totalValue) ? totalValue : 0
      };
    });

  const formatScore = (value) => {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }
    return numeric.toFixed(3);
  };

  const gradeOrder = (settings.grades || DEFAULT_SETTINGS.grades).slice();
  const gradeOrderMap = new Map(gradeOrder.map((grade, index) => [grade, index]));
  const gradeIndex = (grade) => (gradeOrderMap.has(grade) ? gradeOrderMap.get(grade) : Number.MAX_SAFE_INTEGER);
  const categoryMatch = (row) => scoreboardSettings.category === "All" || row.category === scoreboardSettings.category;
  const gradeMatch = (row) => scoreboardSettings.grade === "All" || row.grade === scoreboardSettings.grade;
  const filteredRows = allRows
    .filter(categoryMatch)
    .filter(gradeMatch);

  if (scoreboardSettings.rankingMode === "byGrade") {
    filteredRows.sort((a, b) => {
      const byGrade = gradeIndex(a.grade) - gradeIndex(b.grade);
      if (byGrade !== 0) {
        return byGrade;
      }
      return b.totalValue - a.totalValue;
    });
  } else {
    filteredRows.sort((a, b) => b.totalValue - a.totalValue);
  }

  if (scoreboardContextBadge) {
    const categoryText = scoreboardSettings.category === "All" ? "All categories" : scoreboardSettings.category;
    const gradeText = scoreboardSettings.grade === "All" ? "All grades" : scoreboardSettings.grade;
    const rankText = scoreboardSettings.rankingMode === "byGrade" ? "By grade" : "Overall";
    scoreboardContextBadge.textContent = `${categoryText} • ${gradeText} • ${rankText}`;
  }

  const gradeRanks = new Map();
  filteredRows.forEach((row) => {
    const gradeKey = row.grade || "--";
    const nextRank = (gradeRanks.get(gradeKey) || 0) + 1;
    gradeRanks.set(gradeKey, nextRank);
    row.gradeRank = nextRank;
  });

  if (!filteredRows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7">No scores for this view.</td>`;
    scoreRows.appendChild(row);
    scoreCache = new Map();
    stopPagination();
    return;
  }

  const rowsPerPage = getRowsPerPage(displaySettings);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  if (!paginationEnabled) {
    pageIndex = 0;
  } else if (pageIndex >= totalPages) {
    pageIndex = 0;
  }
  const start = pageIndex * rowsPerPage;
  const pageRows = filteredRows.slice(start, start + rowsPerPage);

  const nextCache = new Map();
  let currentGradeLabel = null;
  pageRows.forEach((score, index) => {
    if (scoreboardSettings.rankingMode === "byGrade") {
      const gradeLabel = score.grade || "--";
      if (gradeLabel !== currentGradeLabel) {
        const headingRow = document.createElement("tr");
        headingRow.className = "stream-grade-heading";
        headingRow.innerHTML = `<td colspan="7">${gradeLabel}</td>`;
        scoreRows.appendChild(headingRow);
        currentGradeLabel = gradeLabel;
      }
    }

    const row = document.createElement("tr");
    const detailRow = document.createElement("tr");
    row.className = "stream-score-main";
    detailRow.className = "stream-score-detail";
    const cachedTotal = scoreCache.get(score.id);
    if (cachedTotal === undefined || cachedTotal !== score.total) {
      row.classList.add("is-updated");
      detailRow.classList.add("is-updated");
      setTimeout(() => {
        row.classList.remove("is-updated");
        detailRow.classList.remove("is-updated");
      }, 2000);
    }
    row.innerHTML = `
      <td>${scoreboardSettings.rankingMode === "byGrade" ? score.gradeRank : (start + index + 1)}</td>
      <td>${score.athleteName}</td>
      <td>${score.athleteClub}</td>
      <td>${score.category || "--"}</td>
      <td>${score.competitorNumber || "--"}</td>
      <td>${score.grade || "--"}</td>
      <td>${formatScore(score.total)}</td>
    `;
    detailRow.innerHTML = `
      <td colspan="7">
        <div class="stream-breakdown">
          <span>Art: <strong>${formatScore(score.artistry)}</strong></span>
          <span>Exe: <strong>${formatScore(score.execution)}</strong></span>
          <span>Dif: <strong>${formatScore(score.difficulty)}</strong></span>
          <span>Pen: <strong>${formatScore(score.penalties)}</strong></span>
        </div>
      </td>
    `;
    scoreRows.appendChild(row);
    scoreRows.appendChild(detailRow);
    nextCache.set(score.id, score.total);
  });
  scoreCache = nextCache;
  schedulePagination(totalPages, displaySettings.pageDurationSeconds);
  if (isPaging) {
    triggerPageFlip();
  }
}
function renderSpotlight() {
  if (!streamState.performerId || !streamState.performerName) {
    performerName.textContent = "No performer selected";
    performerClub.textContent = "Club: --";
    performerScore.textContent = "--";
    if (performerScoreBlock) {
      performerScoreBlock.style.display = "flex";
    }
    scheduleSpotlightFit();
    return;
  }

  performerName.textContent = streamState.performerName;
  const compNumber = streamState.performerNumber ? `Comp No. ${streamState.performerNumber}` : "Comp No. --";
  performerClub.textContent = `Club: ${streamState.performerClub || "--"} • ${compNumber}`;
  const latestScore = scores
    .filter((score) => score.athleteId === streamState.performerId)
    .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))[0];
  performerScore.textContent = latestScore ? latestScore.total.toFixed(3) : "--";
  if (performerScoreBlock) {
    performerScoreBlock.style.display = "none";
  }
  scheduleSpotlightFit();
}

function renderStream() {
  const mode = streamState.mode || "idle";
  const mixSeconds = streamState.mixSeconds || 20;
  const categoryTag = streamState.performerCategory;
  const gradeTag = streamState.performerGrade;

  if (scores.length) {
    const latest = scores.reduce((max, score) => {
      const date = toDate(score.timestamp);
      return date > max ? date : max;
    }, new Date(0));
    updated.textContent = `Updated ${latest.toLocaleTimeString()}`;
  } else {
    updated.textContent = "Awaiting scores";
  }

  if (streamRoot) {
    streamRoot.classList.toggle("is-mode-spotlight", mode === "spotlight");
  }

  if (mode === "mix") {
    setPanel(mixPhase === "idle" ? idlePanel : scoreboardPanel);
  } else if (mode === "welcome") {
    setPanel(welcomePanel);
  } else if (mode === "scoreboard") {
    setPanel(scoreboardPanel);
  } else if (mode === "announcement") {
    setPanel(announcementPanel);
  } else if (mode === "spotlight") {
    setPanel(spotlightPanel);
  } else {
    setPanel(idlePanel);
  }

  setPaginationEnabled(mode === "scoreboard" || mode === "mix");

  if (mode === "spotlight") {
    const details = [categoryTag, gradeTag].filter(Boolean).join(" • ");
    title.textContent = details ? `Current Performer — ${details}` : "Current Performer";
  } else if (mode === "welcome") {
    title.textContent = "Welcome";
  } else if (mode === "scoreboard") {
    title.textContent = "Scoreboard";
  } else if (mode === "announcement") {
    title.textContent = "Announcement";
  } else if (mode === "mix") {
    title.textContent = "Live Stream";
  } else {
    title.textContent = "Break";
  }

  renderSpotlight();
  renderScoreboard();

  if (mode === "mix") {
    if (!mixTimer || lastMixSeconds !== mixSeconds) {
      if (mixTimer) {
        clearInterval(mixTimer);
      }
      lastMixSeconds = mixSeconds;
      mixTimer = setInterval(() => {
        mixPhase = mixPhase === "idle" ? "scoreboard" : "idle";
        renderStream();
      }, mixSeconds * 1000);
    }
  } else if (mixTimer) {
    clearInterval(mixTimer);
    mixTimer = null;
    mixPhase = "idle";
  }
}

function triggerUpdating() {
  if (!scoreboardWrap) {
    return;
  }
  scoreboardWrap.classList.add("is-updating");
  clearTimeout(triggerUpdating.timer);
  triggerUpdating.timer = setTimeout(() => {
    scoreboardWrap.classList.remove("is-updating");
  }, 900);
}

function bindCompetition(competitionId) {
  if (!competitionId) {
    scores = [];
    streamState = normalizeStreamState();
    pageIndex = 0;
    renderStream();
    return;
  }
  scores = [];
  streamState = normalizeStreamState();
  pageIndex = 0;
  triggerUpdating();
  renderStream();
  if (unsubScores) {
    unsubScores();
  }
  if (unsubStream) {
    unsubStream();
  }
  const scoresCol = collection(db, "competitions", competitionId, "scores");
  const streamRef = doc(db, "competitions", competitionId, "streamState", "current");

  unsubScores = onSnapshot(query(scoresCol, orderBy("timestamp", "desc")), (snap) => {
    scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    pageIndex = 0;
    triggerUpdating();
    renderStream();
  });

  unsubStream = onSnapshot(streamRef, (snap) => {
    streamState = snap.exists()
      ? normalizeStreamState(snap.data())
      : normalizeStreamState();
    renderStream();
  });
}

onSnapshot(settingsRef, (snap) => {
  if (!snap.exists()) {
    settings = { ...DEFAULT_SETTINGS };
    renderStream();
    return;
  }
  const data = snap.data();
  settings = { ...DEFAULT_SETTINGS, ...data };
  const nextCompetitionId = data.activeCompetitionId || null;
  if (nextCompetitionId && nextCompetitionId !== activeCompetitionId) {
    activeCompetitionId = nextCompetitionId;
    bindCompetition(activeCompetitionId);
  }
  if (streamEyebrow) {
    streamEyebrow.textContent = settings.competitionName || DEFAULT_SETTINGS.competitionName;
  }
  if (streamIdleTitle) {
    streamIdleTitle.textContent = settings.competitionName || DEFAULT_SETTINGS.competitionName;
  }
  if (streamWelcomeTitle) {
    const baseName = settings.competitionName || DEFAULT_SETTINGS.competitionName;
    streamWelcomeTitle.textContent = `Welcome to ${baseName}`;
  }
  renderStream();
});

renderStream();
window.addEventListener("resize", () => {
  if (streamState.mode === "spotlight") {
    scheduleSpotlightFit();
  }
  if (streamState.mode === "scoreboard" || streamState.mode === "mix") {
    pageIndex = 0;
    renderScoreboard();
  }
});
window.addEventListener("load", scheduleSpotlightFit);

