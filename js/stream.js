const STORAGE_KEY = "gym-score-data";
const RESET_ONCE_KEY = "gym-demo-reset-once";

const DEFAULT_DATA = {
  competitionName: "Eclipse Invitational",
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"],
  clubs: [],
  athletes: [],
  scores: [],
  streamState: { mode: "idle", performerId: null, mixSeconds: 20 },
  lastUpdated: null
};

function resetDemoDataOnce() {
  if (!localStorage.getItem(RESET_ONCE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DATA));
    localStorage.setItem(RESET_ONCE_KEY, "1");
  }
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DATA));
    return { ...DEFAULT_DATA };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.athletes || !parsed.scores) {
      throw new Error("Invalid data");
    }
    return parsed;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DATA));
    return { ...DEFAULT_DATA };
  }
}

function normalizeData(data) {
  let updated = false;
  if (!Array.isArray(data.categories) || data.categories.length === 0 || data.categories.some((c) => c.toLowerCase().includes("women"))) {
    updated = true;
    data.categories = [...DEFAULT_DATA.categories];
  }
  if (!Array.isArray(data.grades) || data.grades.length === 0) {
    updated = true;
    data.grades = [...DEFAULT_DATA.grades];
  }
  if (updated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

const title = document.querySelector("#stream-title");
const updated = document.querySelector("#stream-updated");
const idlePanel = document.querySelector("#stream-idle");
const spotlightPanel = document.querySelector("#stream-spotlight");
const scoreboardPanel = document.querySelector("#stream-scoreboard");
const performerName = document.querySelector("#stream-performer-name");
const performerClub = document.querySelector("#stream-performer-club");
const performerScore = document.querySelector("#stream-performer-score");
const scoreRows = document.querySelector("#stream-score-rows");

let mixTimer = null;
let mixPhase = "idle";
let lastMixSeconds = null;

function setPanel(panel) {
  [idlePanel, spotlightPanel, scoreboardPanel].forEach((section) => {
    section.classList.toggle("is-active", section === panel);
  });
}

function renderScoreboard(data) {
  scoreRows.innerHTML = "";
  const rows = data.scores
    .map((score) => {
      const athlete = data.athletes.find((entry) => entry.id === score.athleteId);
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

function renderSpotlight(data) {
  const performerId = data.streamState?.performerId;
  const athlete = data.athletes.find((entry) => entry.id === performerId);
  if (!athlete) {
    performerName.textContent = "No performer selected";
    performerClub.textContent = "Club: --";
    performerScore.textContent = "--";
    return;
  }

  performerName.textContent = athlete.name;
  performerClub.textContent = `Club: ${athlete.club}`;
  const latestScore = data.scores
    .filter((score) => score.athleteId === athlete.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  performerScore.textContent = latestScore ? latestScore.total.toFixed(3) : "--";
}

function renderStream() {
  const data = loadData();
  normalizeData(data);
  const mode = data.streamState?.mode || "idle";
  const mixSeconds = data.streamState?.mixSeconds || 20;
  const performerId = data.streamState?.performerId;
  const performer = data.athletes.find((entry) => entry.id === performerId);
  const categoryTag = performer?.categoryTags?.[0];
  const gradeTag = performer?.gradeTags?.[0];

  if (data.lastUpdated) {
    updated.textContent = `Updated ${new Date(data.lastUpdated).toLocaleTimeString()}`;
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

  renderSpotlight(data);
  renderScoreboard(data);

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

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    renderStream();
  }
});

resetDemoDataOnce();
renderStream();
