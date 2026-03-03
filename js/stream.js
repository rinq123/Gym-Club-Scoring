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
const DEFAULT_STREAM_STATE = {
  mode: "welcome",
  performerId: null,
  performerName: null,
  performerClub: null,
  performerNumber: null,
  performerCategory: null,
  performerGrade: null,
  mixSeconds: 20
};

const settingsRef = doc(db, "settingsPublic", "current");

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
const scoreRows = document.querySelector("#stream-score-rows");
const scoreboardWrap = scoreboardPanel ? scoreboardPanel.querySelector(".table-wrap") : null;

let settings = { ...DEFAULT_SETTINGS };
let scores = [];
let streamState = { ...DEFAULT_STREAM_STATE };
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

function getRowsPerPage() {
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

function schedulePagination(totalPages) {
  if (!paginationEnabled || totalPages <= 1) {
    stopPagination();
    lastPageCount = totalPages;
    return;
  }
  if (pageTimer && lastPageCount === totalPages) {
    return;
  }
  stopPagination();
  lastPageCount = totalPages;
  pageTimer = setInterval(() => {
    pageIndex = (pageIndex + 1) % totalPages;
    renderScoreboard(true);
  }, 7000);
}

function renderScoreboard(isPaging = false) {
  scoreRows.innerHTML = "";
  const rows = scores
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
    })
    .sort((a, b) => b.totalValue - a.totalValue);

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

  if (!rows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7">No scores yet.</td>`;
    scoreRows.appendChild(row);
    scoreCache = new Map();
    stopPagination();
    return;
  }

  const rowsPerPage = getRowsPerPage();
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  if (!paginationEnabled) {
    pageIndex = 0;
  } else if (pageIndex >= totalPages) {
    pageIndex = 0;
  }
  const start = pageIndex * rowsPerPage;
  const pageRows = rows.slice(start, start + rowsPerPage);

  const nextCache = new Map();
  pageRows.forEach((score, index) => {
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
      <td>${start + index + 1}</td>
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
  schedulePagination(totalPages);
  if (isPaging) {
    triggerPageFlip();
  }
}
function renderSpotlight() {
  if (!streamState.performerId || !streamState.performerName) {
    performerName.textContent = "No performer selected";
    performerClub.textContent = "Club: --";
    performerScore.textContent = "--";
    return;
  }

  performerName.textContent = streamState.performerName;
  const compNumber = streamState.performerNumber ? `Comp No. ${streamState.performerNumber}` : "Comp No. --";
  performerClub.textContent = `Club: ${streamState.performerClub || "--"} • ${compNumber}`;
  const latestScore = scores
    .filter((score) => score.athleteId === streamState.performerId)
    .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))[0];
  performerScore.textContent = latestScore ? latestScore.total.toFixed(3) : "--";
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
    streamState = { ...DEFAULT_STREAM_STATE };
    pageIndex = 0;
    renderStream();
    return;
  }
  scores = [];
  streamState = { ...DEFAULT_STREAM_STATE };
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
      ? { ...DEFAULT_STREAM_STATE, ...snap.data() }
      : { ...DEFAULT_STREAM_STATE };
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

