import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
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

const settingsRef = doc(db, "settingsPublic", "current");

const filterCategory = document.querySelector("#filter-category");
const filterGrade = document.querySelector("#filter-grade");
const filterClub = document.querySelector("#filter-club");
const filterSearch = document.querySelector("#filter-search");
const tbody = document.querySelector("#score-rows");
const contextLabel = document.querySelector("#current-context");
const lastUpdated = document.querySelector("#last-updated");
const scoreboardCard = document.querySelector("#scoreboard");
const publicTitle = document.querySelector("#public-title");
const scoreboardWrap = scoreboardCard ? scoreboardCard.querySelector(".table-wrap") : null;
const refreshButton = document.querySelector("#refresh-scores");

let settings = { ...DEFAULT_SETTINGS };
let scores = [];
let scoreCache = new Map();
let activeCompetitionId = null;
let isRefreshing = false;
const SETTINGS_CACHE_KEY = "publicSettingsCache";
const SCORES_CACHE_KEY = "publicScoresCache";

function fillSelect(select, options, selectedValue) {
  if (!select) {
    return;
  }
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
  const selectedCategory = filterCategory ? filterCategory.value : "All";
  const selectedGrade = filterGrade ? filterGrade.value : "All";
  const selectedClub = filterClub ? filterClub.value : "All";

  fillSelect(filterCategory, ["All", ...settings.categories], selectedCategory || "All");
  fillSelect(filterGrade, ["All", ...settings.grades], selectedGrade || "All");
  const clubs = [...new Set(scores.map((score) => score.athleteClub).filter(Boolean))];
  fillSelect(filterClub, ["All", ...clubs], selectedClub || "All");

  if (publicTitle) {
    const baseName = settings.competitionName || DEFAULT_SETTINGS.competitionName;
    publicTitle.textContent = `${baseName} Scoreboard`;
  }
}

function buildContextLabel() {
  const categoryLabel = filterCategory.value === "All" ? "All Categories" : filterCategory.value;
  const gradeLabel = filterGrade.value === "All" ? "All Grades" : filterGrade.value;
  contextLabel.textContent = `${categoryLabel} • ${gradeLabel}`;
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

function renderScores() {
  tbody.innerHTML = "";
  const searchTerm = (filterSearch?.value || "").trim().toLowerCase();

  const filteredScores = scores
    .map((score) => {
      const totalValue = Number(score.total);
      return {
        ...score,
        athleteName: score.athleteName || "Unknown",
        club: score.athleteClub || "Unknown",
        competitorNumber: score.competitorNumber || "--",
        artistry: score.artistry,
        execution: score.execution,
        difficulty: score.difficulty,
        penalties: score.penalties,
        totalValue: Number.isFinite(totalValue) ? totalValue : 0
      };
    })
    .filter((score) => (filterCategory.value === "All" ? true : score.category === filterCategory.value))
    .filter((score) => (filterGrade.value === "All" ? true : score.grade === filterGrade.value))
    .filter((score) => (filterClub.value === "All" ? true : score.club === filterClub.value))
    .filter((score) => {
      if (!searchTerm) {
        return true;
      }
      const searchable = [
        score.athleteName,
        score.competitorNumber,
        score.club,
        score.category,
        score.grade
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(searchTerm);
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

  if (!filteredScores.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="11">No scores yet for this view.</td>`;
    tbody.appendChild(row);
    scoreCache = new Map();
    return;
  }

  const nextCache = new Map();
  filteredScores.forEach((score, index) => {
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
      <td>${score.competitorNumber || "--"}</td>
      <td>${score.club}</td>
      <td>${score.category || "--"}</td>
      <td>${score.grade || "--"}</td>
      <td>${formatScore(score.artistry)}</td>
      <td>${formatScore(score.execution)}</td>
      <td>${formatScore(score.difficulty)}</td>
      <td>${formatScore(score.penalties)}</td>
      <td>${formatScore(score.total)}</td>
    `;
    tbody.appendChild(row);
    nextCache.set(score.id, score.total);
  });
  scoreCache = nextCache;

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

function updateLastUpdated() {
  if (!scores.length) {
    lastUpdated.textContent = "Last updated: --";
    return;
  }
  const latest = scores.reduce((max, score) => {
    const date = toDate(score.timestamp);
    return date > max ? date : max;
  }, new Date(0));
  lastUpdated.textContent = `Last updated: ${latest.toLocaleString()}`;
}

function renderAll() {
  buildContextLabel();
  renderScores();
  updateLastUpdated();
}

filterCategory.addEventListener("change", renderAll);
filterGrade.addEventListener("change", renderAll);
filterClub.addEventListener("change", renderAll);
filterSearch.addEventListener("input", renderScores);

async function loadSettings() {
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    settings = { ...DEFAULT_SETTINGS };
    activeCompetitionId = null;
    return;
  }
  const data = snap.data();
  settings = { ...DEFAULT_SETTINGS, ...data };
  activeCompetitionId = data.activeCompetitionId || null;
}

async function loadScores(competitionId) {
  if (!competitionId) {
    scores = [];
    return;
  }
  const scoresCol = collection(db, "competitions", competitionId, "scores");
  const snap = await getDocs(query(scoresCol, orderBy("timestamp", "desc")));
  scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

function setRefreshing(state) {
  isRefreshing = state;
  if (refreshButton) {
    refreshButton.disabled = state;
    refreshButton.textContent = state ? "Refreshing..." : "Refresh";
  }
  if (state) {
    triggerUpdating();
  }
}

async function refreshAll() {
  if (isRefreshing) {
    return;
  }
  try {
    setRefreshing(true);
    await loadSettings();
    await loadScores(activeCompetitionId);
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
      localStorage.setItem(SCORES_CACHE_KEY, JSON.stringify(scores));
    } catch (storageError) {
      console.warn("Unable to cache public scores", storageError);
    }
  } catch (error) {
    console.error("Failed to refresh scores", error);
  } finally {
    populateFilters();
    renderAll();
    setRefreshing(false);
  }
}

function loadCachedData() {
  try {
    const cachedSettings = localStorage.getItem(SETTINGS_CACHE_KEY);
    const cachedScores = localStorage.getItem(SCORES_CACHE_KEY);
    if (cachedSettings) {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(cachedSettings) };
      activeCompetitionId = settings.activeCompetitionId || null;
    }
    if (cachedScores) {
      scores = JSON.parse(cachedScores);
    }
  } catch (error) {
    console.warn("Unable to read cached scores", error);
  }
}

if (refreshButton) {
  refreshButton.addEventListener("click", refreshAll);
}

loadCachedData();
populateFilters();
renderAll();
