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
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"]
};
const DEFAULT_STREAM_STATE = { mode: "welcome", performerId: null, mixSeconds: 20 };

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
let athletes = [];
let scores = [];
let streamState = { ...DEFAULT_STREAM_STATE };
let mixTimer = null;
let mixPhase = "idle";
let lastMixSeconds = null;
let scoreCache = new Map();
let activeCompetitionId = null;
let unsubAthletes = null;
let unsubScores = null;
let unsubStream = null;

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

function renderScoreboard() {
  scoreRows.innerHTML = "";
  const rows = scores
    .map((score) => {
      const athlete = athletes.find((entry) => entry.id === score.athleteId);
      return {
        ...score,
        athleteName: athlete ? athlete.name : "Unknown"
      };
    })
    .sort((a, b) => b.total - a.total);

  if (!rows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="3">No scores yet.</td>`;
    scoreRows.appendChild(row);
    scoreCache = new Map();
    return;
  }

  const nextCache = new Map();
  rows.forEach((score, index) => {
    const row = document.createElement("tr");
    const cachedTotal = scoreCache.get(score.id);
    if (cachedTotal === undefined || cachedTotal !== score.total) {
      row.classList.add("is-updated");
      setTimeout(() => {
        row.classList.remove("is-updated");
      }, 2000);
    }
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${score.athleteName}</td>
      <td>${score.total.toFixed(3)}</td>
    `;
    scoreRows.appendChild(row);
    nextCache.set(score.id, score.total);
  });
  scoreCache = nextCache;
}
function renderSpotlight() {
  const performerId = streamState.performerId;
  const athlete = athletes.find((entry) => entry.id === performerId);
  if (!athlete) {
    performerName.textContent = "No performer selected";
    performerClub.textContent = "Club: --";
    performerScore.textContent = "--";
    return;
  }

  performerName.textContent = athlete.name;
  performerClub.textContent = `Club: ${athlete.club}`;
  const latestScore = scores
    .filter((score) => score.athleteId === athlete.id)
    .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))[0];
  performerScore.textContent = latestScore ? latestScore.total.toFixed(3) : "--";
}

function renderStream() {
  const mode = streamState.mode || "idle";
  const mixSeconds = streamState.mixSeconds || 20;
  const performer = athletes.find((entry) => entry.id === streamState.performerId);
  const categoryTag = performer?.categoryTags?.[0];
  const gradeTag = performer?.gradeTags?.[0];

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
    athletes = [];
    scores = [];
    streamState = { ...DEFAULT_STREAM_STATE };
    renderStream();
    return;
  }
  athletes = [];
  scores = [];
  streamState = { ...DEFAULT_STREAM_STATE };
  triggerUpdating();
  renderStream();
  if (unsubAthletes) {
    unsubAthletes();
  }
  if (unsubScores) {
    unsubScores();
  }
  if (unsubStream) {
    unsubStream();
  }
  const athletesCol = collection(db, "competitions", competitionId, "athletes");
  const scoresCol = collection(db, "competitions", competitionId, "scores");
  const streamRef = doc(db, "competitions", competitionId, "streamState", "current");

  unsubAthletes = onSnapshot(query(athletesCol, orderBy("name")), (snap) => {
    athletes = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderStream();
  });

  unsubScores = onSnapshot(query(scoresCol, orderBy("timestamp", "desc")), (snap) => {
    scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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

