import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  competitionName: "Eclipse Invitational",
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"]
};

const settingsRef = doc(db, "settings", "current");
const streamRef = doc(db, "streamState", "current");
const athletesCol = collection(db, "athletes");
const scoresCol = collection(db, "scores");

const title = document.querySelector("#stream-title");
const updated = document.querySelector("#stream-updated");
const idlePanel = document.querySelector("#stream-idle");
const spotlightPanel = document.querySelector("#stream-spotlight");
const scoreboardPanel = document.querySelector("#stream-scoreboard");
const performerName = document.querySelector("#stream-performer-name");
const performerClub = document.querySelector("#stream-performer-club");
const performerScore = document.querySelector("#stream-performer-score");
const scoreRows = document.querySelector("#stream-score-rows");

let settings = { ...DEFAULT_SETTINGS };
let athletes = [];
let scores = [];
let streamState = { mode: "idle", performerId: null, mixSeconds: 20 };
let mixTimer = null;
let mixPhase = "idle";
let lastMixSeconds = null;

function setPanel(panel) {
  [idlePanel, spotlightPanel, scoreboardPanel].forEach((section) => {
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
    return;
  }

  rows.forEach((score, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${score.athleteName}</td>
      <td>${score.total.toFixed(3)}</td>
    `;
    scoreRows.appendChild(row);
  });
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
  } else if (mode === "scoreboard") {
    setPanel(scoreboardPanel);
  } else if (mode === "spotlight") {
    setPanel(spotlightPanel);
  } else {
    setPanel(idlePanel);
  }

  if (mode === "spotlight") {
    const details = [categoryTag, gradeTag].filter(Boolean).join(" • ");
    title.textContent = details ? `Current Performer — ${details}` : "Current Performer";
  } else if (mode === "scoreboard") {
    title.textContent = "Scoreboard";
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

onSnapshot(settingsRef, (snap) => {
  settings = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS };
  renderStream();
});

onSnapshot(query(athletesCol, orderBy("name")), (snap) => {
  athletes = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderStream();
});

onSnapshot(query(scoresCol, orderBy("timestamp", "desc")), (snap) => {
  scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderStream();
});

onSnapshot(streamRef, (snap) => {
  streamState = snap.exists() ? { mode: "idle", performerId: null, mixSeconds: 20, ...snap.data() } : { mode: "idle", performerId: null, mixSeconds: 20 };
  renderStream();
});

renderStream();
