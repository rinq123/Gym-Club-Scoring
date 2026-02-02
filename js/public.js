const STORAGE_KEY = "gym-score-data";
const RESET_ONCE_KEY = "gym-demo-reset-once";

const DEFAULT_DATA = {
  competitionName: "Eclipse Invitational",
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"],
  clubs: ["Northstar", "Riverdale", "Skyline", "Aurora", "Summit", "Cascade"],
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

const filterCategory = document.querySelector("#filter-category");
const filterGroup = document.querySelector("#filter-group");
const filterClub = document.querySelector("#filter-club");
const tbody = document.querySelector("#score-rows");
const contextLabel = document.querySelector("#current-context");
const lastUpdated = document.querySelector("#last-updated");
const scoreboardCard = document.querySelector("#scoreboard");

resetDemoDataOnce();
let data = loadData();

function normalizeData() {
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

normalizeData();

function fillSelect(select, options, selectedValue) {
  select.innerHTML = "";
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option;
    el.textContent = option;
    select.appendChild(el);
  });
  if (selectedValue && options.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function populateFilters() {
  fillSelect(filterCategory, ["All", ...data.categories], "All");
  fillSelect(filterGroup, ["All", ...data.groupTypes], "All");
  const clubs = [...new Set(data.athletes.map((athlete) => athlete.club))];
  fillSelect(filterClub, ["All", ...clubs], "All");
}

function buildContextLabel() {
  const categoryLabel = filterCategory.value === "All" ? "All Categories" : filterCategory.value;
  const groupLabel = filterGroup.value === "All" ? "" : ` - ${filterGroup.value}`;
  contextLabel.textContent = `${categoryLabel}${groupLabel}`;
}

function renderScores() {
  tbody.innerHTML = "";

  const filteredScores = data.scores
    .map((score) => {
      const athlete = data.athletes.find((entry) => entry.id === score.athleteId);
      return {
        ...score,
        athleteName: athlete ? athlete.name : "Unknown",
        club: athlete ? athlete.club : "Unknown",
        groupType: athlete ? athlete.groupType : "Unknown"
      };
    })
    .filter((score) => (filterCategory.value === "All" ? true : score.category === filterCategory.value))
    .filter((score) => (filterGroup.value === "All" ? true : score.groupType === filterGroup.value))
    .filter((score) => (filterClub.value === "All" ? true : score.club === filterClub.value))
    .sort((a, b) => b.total - a.total);

  if (!filteredScores.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5">No scores yet for this view.</td>`;
    tbody.appendChild(row);
    return;
  }

  filteredScores.forEach((score, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${score.athleteName}</td>
      <td>${score.groupType}</td>
      <td>${score.club}</td>
      <td>${score.total.toFixed(3)}</td>
    `;
    tbody.appendChild(row);
  });

  const rowCount = filteredScores.length;
  let scale = 1;
  if (rowCount > 20) {
    scale = 0.75;
  } else if (rowCount > 14) {
    scale = 0.85;
  } else if (rowCount > 10) {
    scale = 0.92;
  }
  scoreboardCard.style.setProperty("--table-scale", scale.toString());
}

function updateLastUpdated() {
  if (!data.lastUpdated) {
    lastUpdated.textContent = "Last updated: --";
    return;
  }
  const timestamp = new Date(data.lastUpdated);
  lastUpdated.textContent = `Last updated: ${timestamp.toLocaleString()}`;
}

function renderAll() {
  buildContextLabel();
  renderScores();
  updateLastUpdated();
}

filterCategory.addEventListener("change", renderAll);
filterGroup.addEventListener("change", renderAll);
filterClub.addEventListener("change", renderAll);

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    data = loadData();
    populateFilters();
    renderAll();
  }
});

populateFilters();
renderAll();
