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
const athletesCol = collection(db, "athletes");
const scoresCol = collection(db, "scores");

const filterCategory = document.querySelector("#filter-category");
const filterGroup = document.querySelector("#filter-group");
const filterClub = document.querySelector("#filter-club");
const tbody = document.querySelector("#score-rows");
const contextLabel = document.querySelector("#current-context");
const lastUpdated = document.querySelector("#last-updated");
const scoreboardCard = document.querySelector("#scoreboard");

let settings = { ...DEFAULT_SETTINGS };
let athletes = [];
let scores = [];

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
  fillSelect(filterCategory, ["All", ...settings.categories], "All");
  fillSelect(filterGroup, ["All", ...settings.groupTypes], "All");
  const clubs = [...new Set(athletes.map((athlete) => athlete.club))];
  fillSelect(filterClub, ["All", ...clubs], "All");
}

function buildContextLabel() {
  const categoryLabel = filterCategory.value === "All" ? "All Categories" : filterCategory.value;
  const groupLabel = filterGroup.value === "All" ? "" : ` - ${filterGroup.value}`;
  contextLabel.textContent = `${categoryLabel}${groupLabel}`;
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

  const filteredScores = scores
    .map((score) => {
      const athlete = athletes.find((entry) => entry.id === score.athleteId);
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
filterGroup.addEventListener("change", renderAll);
filterClub.addEventListener("change", renderAll);

onSnapshot(settingsRef, (snap) => {
  if (!snap.exists()) {
    settings = { ...DEFAULT_SETTINGS };
    populateFilters();
    renderAll();
    return;
  }
  settings = { ...DEFAULT_SETTINGS, ...snap.data() };
  populateFilters();
  renderAll();
});

onSnapshot(query(athletesCol, orderBy("name")), (snap) => {
  athletes = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  populateFilters();
  renderAll();
});

onSnapshot(query(scoresCol, orderBy("timestamp", "desc")), (snap) => {
  scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderAll();
});

populateFilters();
renderAll();
