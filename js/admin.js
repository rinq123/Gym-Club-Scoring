import { db } from "./firebase.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const pingRef = doc(db, "settings", "current");
setDoc(pingRef, { lastPing: new Date().toISOString() }, { merge: true });

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

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const execInput = document.querySelector('[name="execution"]');
const diffInput = document.querySelector('[name="difficulty"]');
const totalInput = document.querySelector('[name="total"]');
const categorySelect = document.querySelector("#category");
const athleteSelect = document.querySelector("#athlete");
const form = document.querySelector("#score-form");
const recentList = document.querySelector("#recent-list");
const athleteForm = document.querySelector("#athlete-form");
const athleteNameInput = document.querySelector("#athlete-name");
const athleteClubInput = document.querySelector("#athlete-club");
const athleteGroupSelect = document.querySelector("#athlete-group");
const categoryTagsContainer = document.querySelector("#athlete-category-tags");
const gradeTagsContainer = document.querySelector("#athlete-grade-tags");
const athleteList = document.querySelector("#athlete-list");
const clubOptions = document.querySelector("#club-options");
const streamPerformer = document.querySelector("#stream-performer");
const streamStatus = document.querySelector("#stream-status");
const streamButtons = document.querySelectorAll("[data-stream]");
const resetDemoBtn = document.querySelector("#reset-demo");

resetDemoDataOnce();
const data = loadData();

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
  if (!data.streamState) {
    updated = true;
    data.streamState = { mode: "idle", performerId: null, mixSeconds: 20 };
  } else {
    if (!data.streamState.mode) {
      updated = true;
      data.streamState.mode = "idle";
    }
    if (typeof data.streamState.performerId === "undefined") {
      updated = true;
      data.streamState.performerId = null;
    }
    if (!data.streamState.mixSeconds) {
      updated = true;
      data.streamState.mixSeconds = 20;
    }
  }
  data.athletes = data.athletes.map((athlete) => {
    if (!Array.isArray(athlete.categoryTags)) {
      updated = true;
      return { ...athlete, categoryTags: [...data.categories] };
    }
    if (!Array.isArray(athlete.gradeTags)) {
      updated = true;
      return { ...athlete, gradeTags: [...data.grades] };
    }
    return athlete;
  });
  if (updated) {
    saveData();
  }
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option;
    el.textContent = option;
    select.appendChild(el);
  });
}

function fillSelectWithValue(select, options, value) {
  fillSelect(select, options);
  if (value && options.includes(value)) {
    select.value = value;
  }
}

function renderTagOptions(container, options, prefix) {
  container.innerHTML = "";
  options.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option;
    input.name = `${prefix}-${option}`;
    label.append(input, document.createTextNode(option));
    container.appendChild(label);
  });
}

function getSelectedTags(container) {
  return Array.from(container.querySelectorAll("input[type='checkbox']:checked")).map(
    (input) => input.value
  );
}

function renderClubOptions() {
  clubOptions.innerHTML = "";
  data.clubs.forEach((club) => {
    const option = document.createElement("option");
    option.value = club;
    clubOptions.appendChild(option);
  });
}

function renderAthleteOptions() {
  const category = categorySelect.value;
  athleteSelect.innerHTML = "";
  const scoredIds = new Set(
    data.scores
      .filter((score) => score.category === category)
      .map((score) => score.athleteId)
  );

  const eligible = data.athletes.filter(
    (athlete) =>
      athlete.categoryTags.includes(category) &&
      !scoredIds.has(athlete.id)
  );

  if (!eligible.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No eligible athletes/groups";
    option.disabled = true;
    option.selected = true;
    athleteSelect.appendChild(option);
    return;
  }

  eligible.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athlete.id;
    option.textContent = `${athlete.name} (${athlete.groupType}, ${athlete.club})`;
    athleteSelect.appendChild(option);
  });
}

function renderStreamPerformerOptions() {
  streamPerformer.innerHTML = "";
  const optionNone = document.createElement("option");
  optionNone.value = "";
  optionNone.textContent = "No performer selected";
  streamPerformer.appendChild(optionNone);

  data.athletes.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athlete.id;
    option.textContent = `${athlete.name} (${athlete.groupType}, ${athlete.club})`;
    streamPerformer.appendChild(option);
  });

  if (data.streamState.performerId) {
    streamPerformer.value = data.streamState.performerId;
  }
}

function renderAthleteList() {
  athleteList.innerHTML = "";
  data.athletes.forEach((athlete) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const categoryLabel = athlete.categoryTags.join(", ") || "None";
    const gradeLabel = athlete.gradeTags ? athlete.gradeTags.join(", ") : "None";
    text.textContent = `${athlete.name} - ${athlete.groupType} - ${athlete.club} | ${categoryLabel} | ${gradeLabel}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => {
      data.athletes = data.athletes.filter((entry) => entry.id !== athlete.id);
      data.scores = data.scores.filter((score) => score.athleteId !== athlete.id);
      data.lastUpdated = new Date().toISOString();
      saveData();
      renderAthleteList();
      renderAthleteOptions();
      renderStreamPerformerOptions();
      renderRecent();
    });
    item.append(text, removeBtn);
    athleteList.appendChild(item);
  });
}

function populateOptions() {
  fillSelect(categorySelect, data.categories);
  renderAthleteOptions();
  renderStreamPerformerOptions();
  renderTagOptions(categoryTagsContainer, data.categories, "category");
  renderTagOptions(gradeTagsContainer, data.grades, "grade");
  renderClubOptions();
}

function updateTotal() {
  const e = parseFloat(execInput.value) || 0;
  const d = parseFloat(diffInput.value) || 0;
  totalInput.value = (e + d).toFixed(3);
}

function renderRecent() {
  recentList.innerHTML = "";
  const recentScores = [...data.scores]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  if (!recentScores.length) {
    const item = document.createElement("li");
    item.textContent = "No scores yet.";
    recentList.appendChild(item);
    return;
  }

  recentScores.forEach((score) => {
    const athlete = data.athletes.find((entry) => entry.id === score.athleteId);
    const item = document.createElement("li");
    const text = document.createElement("span");
    const athleteName = athlete ? athlete.name : "Unknown";
    text.textContent = `${athleteName} - ${score.category} - ${score.total.toFixed(3)}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", () => {
      data.scores = data.scores.filter((entry) => entry.id !== score.id);
      data.lastUpdated = new Date().toISOString();
      saveData();
      renderRecent();
      renderAthleteOptions();
      renderStreamPerformerOptions();
    });
    item.append(text, removeBtn);
    recentList.appendChild(item);
  });
}

execInput.addEventListener("input", updateTotal);
diffInput.addEventListener("input", updateTotal);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const execution = parseFloat(execInput.value);
  const difficulty = parseFloat(diffInput.value);
  const category = categorySelect.value;
  const athleteId = athleteSelect.value;

  if (!athleteId || Number.isNaN(execution) || Number.isNaN(difficulty)) {
    return;
  }

  const total = parseFloat((execution + difficulty).toFixed(3));
  const timestamp = new Date().toISOString();
  data.scores.unshift({
    id: `s${Date.now()}`,
    athleteId,
    category,
    execution,
    difficulty,
    total,
    timestamp
  });
  data.lastUpdated = timestamp;
  saveData();
  renderRecent();
  renderAthleteOptions();
  form.reset();
  updateTotal();
});

form.addEventListener("reset", () => {
  setTimeout(updateTotal, 0);
});

function updateStreamStatus() {
  const modeLabel = data.streamState.mode === "mix" ? "Idle + Scoreboard Mix" :
    data.streamState.mode === "scoreboard" ? "Scoreboard Only" :
    data.streamState.mode === "spotlight" ? "Spotlight" : "Idle";
  streamStatus.textContent = `Mode: ${modeLabel}`;
  streamButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stream === data.streamState.mode);
  });
}

streamPerformer.addEventListener("change", () => {
  data.streamState.performerId = streamPerformer.value || null;
  if (data.streamState.performerId) {
    data.streamState.mode = "spotlight";
  }
  data.lastUpdated = new Date().toISOString();
  saveData();
  updateStreamStatus();
});

streamButtons.forEach((button) => {
  button.addEventListener("click", () => {
    data.streamState.mode = button.dataset.stream;
    if (data.streamState.mode !== "spotlight") {
      data.streamState.performerId = null;
      streamPerformer.value = "";
    }
    data.lastUpdated = new Date().toISOString();
    saveData();
    updateStreamStatus();
  });
});

resetDemoBtn.addEventListener("click", () => {
  if (!window.confirm("Reset all demo data? This clears scores and roster changes.")) {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DATA));
  localStorage.setItem(RESET_ONCE_KEY, "1");
  window.location.reload();
});

athleteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = athleteNameInput.value.trim();
  const club = athleteClubInput.value.trim();
  const groupType = athleteGroupSelect.value;
  const categoryTags = getSelectedTags(categoryTagsContainer);
  const gradeTags = getSelectedTags(gradeTagsContainer);

  if (!name || !club || !categoryTags.length || !gradeTags.length) {
    return;
  }

  if (!data.clubs.includes(club)) {
    data.clubs.push(club);
  }

  data.athletes.push({
    id: `a${Date.now()}`,
    name,
    club,
    groupType,
    categoryTags,
    gradeTags
  });
  data.lastUpdated = new Date().toISOString();
  saveData();
  renderAthleteList();
  renderAthleteOptions();
  renderStreamPerformerOptions();
  renderClubOptions();
  athleteForm.reset();
});

categorySelect.addEventListener("change", renderAthleteOptions);

normalizeData();
populateOptions();
renderAthleteList();
renderRecent();
updateTotal();
updateStreamStatus();


