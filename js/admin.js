import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

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

const artistryInput = document.querySelector('[name="artistry"]');
const executionInput = document.querySelector('[name="execution"]');
const difficultyInput = document.querySelector('[name="difficulty"]');
const penaltiesInput = document.querySelector('[name="penalties"]');
const totalInput = document.querySelector('[name="total"]');
const categorySelect = document.querySelector("#category");
const athleteSelect = document.querySelector("#athlete");
const form = document.querySelector("#score-form");
const recentList = document.querySelector("#recent-list");
const athleteForm = document.querySelector("#athlete-form");
const athleteNameInput = document.querySelector("#athlete-name");
const athleteClubInput = document.querySelector("#athlete-club");
const athleteNumberInput = document.querySelector("#athlete-number");
const categoryTagsContainer = document.querySelector("#athlete-category-tags");
const gradeTagsContainer = document.querySelector("#athlete-grade-tags");
const athleteList = document.querySelector("#athlete-list");
const clubOptions = document.querySelector("#club-options");
const streamPerformer = document.querySelector("#stream-performer");
const streamStatus = document.querySelector("#stream-status");
const streamButtons = document.querySelectorAll("[data-stream]");
const resetDemoBtn = document.querySelector("#reset-demo");
const lockAdminBtn = document.querySelector("#lock-admin");
const authGate = document.querySelector("#auth-gate");
const pinForm = document.querySelector("#pin-form");
const emailInput = document.querySelector("#email-input");
const pinInput = document.querySelector("#pin-input");
const pinError = document.querySelector("#pin-error");
const scoreSubmitBtn = document.querySelector("#score-submit");
const scoreResetBtn = document.querySelector("#score-reset");
const athleteSubmitBtn = document.querySelector("#athlete-submit");
const athleteCancelBtn = document.querySelector("#athlete-cancel");
const scoreEditingLabel = document.querySelector("#score-editing");
const athleteEditingLabel = document.querySelector("#athlete-editing");
const competitionSelect = document.querySelector("#competition-select");
const competitionNameInput = document.querySelector("#competition-name");
const competitionActivateBtn = document.querySelector("#competition-activate");
const competitionRenameBtn = document.querySelector("#competition-rename");
const competitionCreateBtn = document.querySelector("#competition-create");
const competitionArchiveBtn = document.querySelector("#competition-archive");
const competitionDeleteBtn = document.querySelector("#competition-delete");
const competitionStatus = document.querySelector("#competition-status");
const adminTitle = document.querySelector("#admin-competition-title");
const helpToggle = document.querySelector("#help-toggle");
const helpPanel = document.querySelector("#help-panel");
const helpClose = document.querySelector("#help-close");

const settingsRef = doc(db, "settings", "current");
const publicSettingsRef = doc(db, "settingsPublic", "current");
const competitionsCol = collection(db, "competitions");

let settings = { ...DEFAULT_SETTINGS };
let athletes = [];
let scores = [];
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
let streamState = { ...DEFAULT_STREAM_STATE };
let editingAthleteId = null;
let editingScoreId = null;
let editingScore = null;
let lastPublicSettings = "";
let subscriptionsStarted = false;
let competitions = [];
let activeCompetitionId = null;
let activeCompetition = null;
let activeSettingsRef = null;
let activeStreamRef = null;
let activeAthletesCol = null;
let activeScoresCol = null;
let activeUnsubscribers = [];
let isSavingScore = false;
let isSavingAthlete = false;
const pendingScoreKeys = new Set();

const ADMIN_EMAIL_KEY = "eclipseAdminEmail";

function ensureActiveRefs() {
  if (!activeCompetitionId) {
    return false;
  }
  if (!activeSettingsRef || !activeStreamRef || !activeAthletesCol || !activeScoresCol) {
    setActiveRefs(activeCompetitionId);
  }
  return Boolean(activeStreamRef);
}

function buildPublicSettings(nextSettings) {
  return {
    competitionName: nextSettings.competitionName,
    categories: nextSettings.categories,
    grades: nextSettings.grades,
    activeCompetitionId
  };
}

function buildScoreKey(athleteId, category) {
  return `${athleteId}::${category}`;
}

function setFieldError(field, message) {
  if (!field) {
    return;
  }
  field.classList.add("is-invalid");
  field.dataset.error = message;
}

function clearFieldError(field) {
  if (!field) {
    return;
  }
  field.classList.remove("is-invalid");
  field.removeAttribute("data-error");
}

function clearFormErrors(container) {
  if (!container) {
    return;
  }
  container.querySelectorAll(".is-invalid").forEach((field) => {
    clearFieldError(field);
  });
}

function markScorePending(athleteId, category) {
  if (!athleteId || !category) {
    return;
  }
  pendingScoreKeys.add(buildScoreKey(athleteId, category));
}

function clearPendingWithScores() {
  if (!pendingScoreKeys.size) {
    return;
  }
  const existing = new Set(scores.map((score) => buildScoreKey(score.athleteId, score.category)));
  pendingScoreKeys.forEach((key) => {
    if (existing.has(key)) {
      pendingScoreKeys.delete(key);
    }
  });
}

async function syncPublicSettings(nextSettings) {
  const payload = buildPublicSettings(nextSettings);
  const serialized = JSON.stringify(payload);
  if (serialized === lastPublicSettings) {
    return;
  }
  lastPublicSettings = serialized;
  await setDoc(publicSettingsRef, payload, { merge: true });
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCompetitionRefs(id) {
  return {
    competitionRef: doc(db, "competitions", id),
    settingsRef: doc(db, "competitions", id, "settings", "current"),
    streamRef: doc(db, "competitions", id, "streamState", "current"),
    athletesCol: collection(db, "competitions", id, "athletes"),
    scoresCol: collection(db, "competitions", id, "scores")
  };
}

function setActiveRefs(id) {
  const refs = getCompetitionRefs(id);
  activeSettingsRef = refs.settingsRef;
  activeStreamRef = refs.streamRef;
  activeAthletesCol = refs.athletesCol;
  activeScoresCol = refs.scoresCol;
}

function clearActiveSubscriptions() {
  activeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  activeUnsubscribers = [];
}

function renderCompetitionSelect() {
  competitionSelect.innerHTML = "";
  competitions.forEach((competition) => {
    const option = document.createElement("option");
    option.value = competition.id;
    option.textContent = competition.archived ? `${competition.name} (Archived)` : competition.name;
    competitionSelect.appendChild(option);
  });
  if (activeCompetitionId) {
    competitionSelect.value = activeCompetitionId;
  }
  const selected = competitions.find((entry) => entry.id === competitionSelect.value);
  const active = competitions.find((entry) => entry.id === activeCompetitionId);
  competitionNameInput.value = selected ? selected.name : DEFAULT_SETTINGS.competitionName;
  competitionStatus.textContent = active ? `Active: ${active.name}` : "Active: --";
  adminTitle.textContent = active ? active.name : DEFAULT_SETTINGS.competitionName;
  activeCompetition = active || null;
}

async function setActiveCompetition(id) {
  if (!id || id === activeCompetitionId) {
    return;
  }
  activeCompetitionId = id;
  bindActiveCompetition(id);
  renderCompetitionSelect();
  if (activeSettingsRef) {
    const snap = await getDoc(activeSettingsRef);
    if (snap.exists()) {
      settings = { ...DEFAULT_SETTINGS, ...snap.data() };
      await syncPublicSettings(settings);
    }
  }
  await setDoc(settingsRef, { activeCompetitionId: id }, { merge: true });
}

async function createCompetition(name, { setActive = true } = {}) {
  const trimmedName = name?.trim() || DEFAULT_SETTINGS.competitionName;
  const base = slugify(trimmedName) || "competition";
  let id = base;
  let counter = 1;
  while (true) {
    const existing = competitions.find((entry) => entry.id === id);
    if (!existing) {
      const checkSnap = await getDoc(doc(db, "competitions", id));
      if (!checkSnap.exists()) {
        break;
      }
    }
    id = `${base}-${counter}`;
    counter += 1;
  }
  const refs = getCompetitionRefs(id);
  await setDoc(refs.competitionRef, {
    name: trimmedName,
    archived: false,
    createdAt: serverTimestamp()
  });
  await setDoc(refs.settingsRef, {
    ...DEFAULT_SETTINGS,
    competitionName: trimmedName
  }, { merge: true });
  await setDoc(refs.streamRef, {
    ...DEFAULT_STREAM_STATE,
    updatedAt: serverTimestamp()
  }, { merge: true });

  if (setActive) {
    await setActiveCompetition(id);
  }

  return id;
}

async function deleteCollectionDocs(colRef) {
  const snapshot = await getDocs(colRef);
  if (snapshot.empty) {
    return;
  }
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    count += 1;
    if (count >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

async function deleteCompetition(id) {
  const refs = getCompetitionRefs(id);
  await deleteCollectionDocs(refs.athletesCol);
  await deleteCollectionDocs(refs.scoresCol);
  await deleteDoc(refs.settingsRef);
  await deleteDoc(refs.streamRef);
  await deleteDoc(refs.competitionRef);
}

async function updateScoresForAthlete(athleteId, updates) {
  if (!activeScoresCol || !athleteId) {
    return;
  }
  const snapshot = await getDocs(activeScoresCol);
  if (snapshot.empty) {
    return;
  }
  let batch = writeBatch(db);
  let count = 0;
  for (const docSnap of snapshot.docs) {
    if (docSnap.data().athleteId !== athleteId) {
      continue;
    }
    batch.set(docSnap.ref, updates, { merge: true });
    count += 1;
    if (count >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

async function migrateRootData(targetId) {
  const refs = getCompetitionRefs(targetId);
  const rootSettingsSnap = await getDoc(settingsRef);
  const rootSettings = rootSettingsSnap.exists() ? rootSettingsSnap.data() : {};
  const { pinCodes, activeCompetitionId: ignoredActive, ...restSettings } = rootSettings;
  const competitionName = DEFAULT_SETTINGS.competitionName;

  await setDoc(refs.settingsRef, {
    ...DEFAULT_SETTINGS,
    ...restSettings,
    competitionName
  }, { merge: true });

  const rootAthletesSnap = await getDocs(collection(db, "athletes"));
  const rootScoresSnap = await getDocs(collection(db, "scores"));
  const rootStreamSnap = await getDoc(doc(db, "streamState", "current"));

  for (const docSnap of rootAthletesSnap.docs) {
    await setDoc(doc(refs.athletesCol, docSnap.id), docSnap.data(), { merge: true });
  }
  for (const docSnap of rootScoresSnap.docs) {
    await setDoc(doc(refs.scoresCol, docSnap.id), docSnap.data(), { merge: true });
  }
  if (rootStreamSnap.exists()) {
    await setDoc(refs.streamRef, rootStreamSnap.data(), { merge: true });
  }
}

async function ensureCompetitionSetup() {
  const settingsSnap = await getDoc(settingsRef);
  const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
  activeCompetitionId = settingsData.activeCompetitionId || null;

  const competitionsSnap = await getDocs(competitionsCol);
  if (competitionsSnap.empty) {
    const id = await createCompetition(settingsData.competitionName || DEFAULT_SETTINGS.competitionName, { setActive: true });
    await migrateRootData(id);
    return;
  }

  if (!activeCompetitionId) {
    const first = competitionsSnap.docs[0];
    await setActiveCompetition(first.id);
  }
}

function bindActiveCompetition(id) {
  if (!id) {
    return;
  }
  setActiveRefs(id);
  clearActiveSubscriptions();

  activeUnsubscribers.push(onSnapshot(activeSettingsRef, async (snap) => {
    if (!snap.exists()) {
      settings = { ...DEFAULT_SETTINGS };
      fillSelect(categorySelect, settings.categories);
      renderTagOptions(categoryTagsContainer, settings.categories);
      renderTagOptions(gradeTagsContainer, settings.grades);
      syncPublicSettings(settings);
      return;
    }
    const { next, changed } = normalizeSettings(snap.data());
    settings = next;
    if (changed) {
      await setDoc(activeSettingsRef, { categories: settings.categories, grades: settings.grades }, { merge: true });
    }
    fillSelect(categorySelect, settings.categories);
    renderTagOptions(categoryTagsContainer, settings.categories);
    renderTagOptions(gradeTagsContainer, settings.grades);
    renderAthleteOptions();
    syncPublicSettings(settings);
    adminTitle.textContent = settings.competitionName || DEFAULT_SETTINGS.competitionName;
    competitionNameInput.value = settings.competitionName || DEFAULT_SETTINGS.competitionName;
  }));

  activeUnsubscribers.push(onSnapshot(query(activeAthletesCol, orderBy("name")), (snap) => {
    athletes = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderClubOptions();
    renderAthleteOptions();
    renderAthleteList();
    renderStreamPerformerOptions();
  }));

  activeUnsubscribers.push(onSnapshot(query(activeScoresCol, orderBy("timestamp", "desc")), (snap) => {
    scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    clearPendingWithScores();
    renderRecent();
    renderAthleteOptions();
  }));

  activeUnsubscribers.push(onSnapshot(activeStreamRef, (snap) => {
    if (!snap.exists()) {
      streamState = { ...DEFAULT_STREAM_STATE };
      updateStreamStatus();
      return;
    }
    streamState = { ...DEFAULT_STREAM_STATE, ...snap.data() };
    updateStreamStatus();
    renderStreamPerformerOptions();
  }));
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

function renderTagOptions(container, options) {
  container.innerHTML = "";
  options.forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = option;
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
  const clubs = [...new Set(athletes.map((athlete) => athlete.club))];
  clubs.forEach((club) => {
    const option = document.createElement("option");
    option.value = club;
    clubOptions.appendChild(option);
  });
}

function normalizeSettings(raw) {
  const storedCats = Array.isArray(raw?.categories) ? raw.categories : [];
  const storedGrades = Array.isArray(raw?.grades) ? raw.grades : [];
  const catsMatch = storedCats.length === DEFAULT_SETTINGS.categories.length
    && storedCats.every((cat, index) => cat === DEFAULT_SETTINGS.categories[index]);
  const gradesMatch = storedGrades.length === DEFAULT_SETTINGS.grades.length
    && storedGrades.every((grade, index) => grade === DEFAULT_SETTINGS.grades[index]);
  const changed = !catsMatch || !gradesMatch;
  return {
    next: {
      ...DEFAULT_SETTINGS,
      ...raw,
      categories: DEFAULT_SETTINGS.categories,
      grades: DEFAULT_SETTINGS.grades
    },
    changed
  };
}

function lockUI() {
  document.body.classList.add("is-locked");
  authGate.classList.remove("hidden");
}

function unlockUI() {
  document.body.classList.remove("is-locked");
  authGate.classList.add("hidden");
}

function renderAthleteOptions() {
  const category = categorySelect.value;
  athleteSelect.innerHTML = "";
  const editingAthlete = editingScore?.athleteId;
  const scoredIds = new Set(
    scores.filter((score) => score.category === category).map((score) => score.athleteId)
  );
  const pendingIds = new Set();
  pendingScoreKeys.forEach((key) => {
    const [athleteId, pendingCategory] = key.split("::");
    if (pendingCategory === category) {
      pendingIds.add(athleteId);
    }
  });
  if (editingAthlete) {
    scoredIds.delete(editingAthlete);
  }
  pendingIds.forEach((id) => scoredIds.add(id));

  const eligible = athletes.filter(
    (athlete) => athlete.categoryTags.includes(category) && !scoredIds.has(athlete.id)
  );

  if (!eligible.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No eligible gymnast(s)";
    option.disabled = true;
    option.selected = true;
    athleteSelect.appendChild(option);
    return;
  }

  eligible.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athlete.id;
    const compNumber = athlete.competitorNumber ? `Comp No. ${athlete.competitorNumber}` : "Comp No. --";
    option.textContent = `${athlete.name} (${compNumber}, ${athlete.club})`;
    athleteSelect.appendChild(option);
  });
}

function renderStreamPerformerOptions() {
  streamPerformer.innerHTML = "";
  const optionNone = document.createElement("option");
  optionNone.value = "";
  optionNone.textContent = "No performer selected";
  streamPerformer.appendChild(optionNone);

  athletes.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athlete.id;
    const compNumber = athlete.competitorNumber ? `Comp No. ${athlete.competitorNumber}` : "Comp No. --";
    option.textContent = `${athlete.name} (${compNumber}, ${athlete.club})`;
    streamPerformer.appendChild(option);
  });

  if (streamState.performerId) {
    streamPerformer.value = streamState.performerId;
  }
}

function buildPerformerPayload(performerId) {
  if (!performerId) {
    return {
      performerId: null,
      performerName: null,
      performerClub: null,
      performerNumber: null,
      performerCategory: null,
      performerGrade: null
    };
  }
  const athlete = athletes.find((entry) => entry.id === performerId);
  return {
    performerId,
    performerName: athlete?.name || null,
    performerClub: athlete?.club || null,
    performerNumber: athlete?.competitorNumber || null,
    performerCategory: athlete?.categoryTags?.[0] || null,
    performerGrade: athlete?.gradeTags?.[0] || null
  };
}

function renderAthleteList() {
  athleteList.innerHTML = "";
  athletes.forEach((athlete) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const categoryLabel = athlete.categoryTags.join(", ") || "None";
    const gradeLabel = athlete.gradeTags ? athlete.gradeTags.join(", ") : "None";
    const compNumber = athlete.competitorNumber ? `Comp No. ${athlete.competitorNumber}` : "Comp No. --";
    text.textContent = `${athlete.name} - ${compNumber} - ${athlete.club} | ${categoryLabel} | ${gradeLabel}`;
    const actions = document.createElement("div");
    actions.className = "list-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn ghost btn-small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      startAthleteEdit(athlete);
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", async () => {
      await deleteDoc(doc(activeAthletesCol, athlete.id));
      const scoreQuery = query(activeScoresCol);
      const snapshot = await getDocs(scoreQuery);
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        if (docSnap.data().athleteId === athlete.id) {
          batch.delete(docSnap.ref);
        }
      });
      await batch.commit();
      if (streamState.performerId === athlete.id) {
        await setDoc(activeStreamRef, { ...buildPerformerPayload(null), mode: "idle", updatedAt: serverTimestamp() }, { merge: true });
      }
    });
    actions.append(editBtn, removeBtn);
    item.append(text, actions);
    athleteList.appendChild(item);
  });
}

function renderRecent() {
  recentList.innerHTML = "";
  const recentScores = [...scores].slice(0, 8);

  if (!recentScores.length) {
    const item = document.createElement("li");
    item.textContent = "No scores yet.";
    recentList.appendChild(item);
    return;
  }

  recentScores.forEach((score) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const athleteName = score.athleteName || athletes.find((entry) => entry.id === score.athleteId)?.name || "Unknown";
    const compNumberValue = score.competitorNumber || athletes.find((entry) => entry.id === score.athleteId)?.competitorNumber;
    const compNumber = compNumberValue ? `Comp No. ${compNumberValue}` : "Comp No. --";
    const totalNumeric = Number(score.total);
    const totalLabel = Number.isFinite(totalNumeric) ? totalNumeric.toFixed(3) : "--";
    text.textContent = `${athleteName} ${compNumber} - ${score.category} - ${totalLabel}`;
    const actions = document.createElement("div");
    actions.className = "list-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn ghost btn-small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      startScoreEdit(score);
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", async () => {
      await deleteDoc(doc(activeScoresCol, score.id));
    });
    actions.append(editBtn, removeBtn);
    item.append(text, actions);
    recentList.appendChild(item);
  });
}

function setScoreFormMode(isEditing) {
  scoreSubmitBtn.textContent = isEditing ? "Update Score" : "Save Score";
  scoreResetBtn.textContent = isEditing ? "Cancel Edit" : "Clear";
  scoreEditingLabel.classList.toggle("hidden", !isEditing);
}

function setAthleteFormMode(isEditing) {
  athleteSubmitBtn.textContent = isEditing ? "Update Gymnast(s)" : "Add Gymnast(s)";
  athleteCancelBtn.classList.toggle("hidden", !isEditing);
  athleteEditingLabel.classList.toggle("hidden", !isEditing);
}

function enforceSingleCheck(container) {
  if (!container) {
    return;
  }
  container.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || target.type !== "checkbox") {
      return;
    }
    if (!target.checked) {
      return;
    }
    container.querySelectorAll("input[type='checkbox']").forEach((input) => {
      if (input !== target) {
        input.checked = false;
      }
    });
  });
}

function startAthleteEdit(athlete) {
  editingAthleteId = athlete.id;
  athleteNameInput.value = athlete.name || "";
  athleteClubInput.value = athlete.club || "";
  athleteNumberInput.value = athlete.competitorNumber || "";
  categoryTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = athlete.categoryTags?.includes(input.value) || false;
  });
  gradeTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = athlete.gradeTags?.includes(input.value) || false;
  });
  setAthleteFormMode(true);
  athleteEditingLabel.textContent = `Editing gymnast(s): ${athlete.name}`;
}

function clearAthleteEdit() {
  editingAthleteId = null;
  athleteForm.reset();
  setAthleteFormMode(false);
}

function startScoreEdit(score) {
  editingScoreId = score.id;
  editingScore = score;
  categorySelect.value = score.category;
  renderAthleteOptions();
  athleteSelect.value = score.athleteId;
  const formatField = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(3) : "";
  };
  artistryInput.value = formatField(score.artistry);
  executionInput.value = formatField(score.execution);
  difficultyInput.value = formatField(score.difficulty);
  penaltiesInput.value = formatField(score.penalties);
  totalInput.value = formatField(score.total);
  setScoreFormMode(true);
  const athlete = athletes.find((entry) => entry.id === score.athleteId);
  const athleteName = athlete ? athlete.name : "Unknown";
  scoreEditingLabel.textContent = `Editing score: ${athleteName}`;
}

function clearScoreEdit() {
  editingScoreId = null;
  editingScore = null;
  form.reset();
  setScoreFormMode(false);
  renderAthleteOptions();
}

function updateStreamStatus() {
  const modeLabel = streamState.mode === "mix" ? "Idle + Scoreboard Mix" :
    streamState.mode === "scoreboard" ? "Scoreboard Only" :
    streamState.mode === "spotlight" ? "Spotlight" :
    streamState.mode === "welcome" ? "Welcome Screen" :
    streamState.mode === "announcement" ? "Announcement" : "Idle";
  streamStatus.textContent = `Mode: ${modeLabel}`;
  streamButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stream === streamState.mode);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeScoresCol) {
    return;
  }
  if (isSavingScore) {
    return;
  }
  clearFormErrors(form);
  const artistryValue = parseFloat(artistryInput.value);
  const executionValue = parseFloat(executionInput.value);
  const difficultyValue = parseFloat(difficultyInput.value);
  const penaltiesValue = parseFloat(penaltiesInput.value);
  const totalValue = parseFloat(totalInput.value);
  const category = categorySelect.value;
  const athleteId = athleteSelect.value;
  const athlete = athletes.find((entry) => entry.id === athleteId);

  let hasErrors = false;
  if (!category) {
    setFieldError(categorySelect.closest(".field"), "Select a category.");
    hasErrors = true;
  }
  if (!athleteId) {
    setFieldError(athleteSelect.closest(".field"), "Select gymnast(s).");
    hasErrors = true;
  }
  if (Number.isNaN(artistryValue)) {
    setFieldError(artistryInput.closest(".field"), "Enter artistry.");
    hasErrors = true;
  }
  if (Number.isNaN(executionValue)) {
    setFieldError(executionInput.closest(".field"), "Enter execution.");
    hasErrors = true;
  }
  if (Number.isNaN(difficultyValue)) {
    setFieldError(difficultyInput.closest(".field"), "Enter difficulty.");
    hasErrors = true;
  }
  if (Number.isNaN(penaltiesValue)) {
    setFieldError(penaltiesInput.closest(".field"), "Enter penalties.");
    hasErrors = true;
  }
  if (Number.isNaN(totalValue)) {
    setFieldError(totalInput.closest(".field"), "Enter total score.");
    hasErrors = true;
  }

  if (hasErrors) {
    return;
  }

  const artistry = parseFloat(artistryValue.toFixed(3));
  const execution = parseFloat(executionValue.toFixed(3));
  const difficulty = parseFloat(difficultyValue.toFixed(3));
  const penalties = parseFloat(penaltiesValue.toFixed(3));
  const total = parseFloat(totalValue.toFixed(3));
  const grade = athlete?.gradeTags?.length === 1 ? athlete.gradeTags[0] : null;
  const athleteName = athlete?.name || "Unknown";
  const athleteClub = athlete?.club || "";
  const competitorNumber = athlete?.competitorNumber || "";

  isSavingScore = true;
  scoreSubmitBtn.disabled = true;
  try {
    if (editingScoreId) {
      await setDoc(doc(activeScoresCol, editingScoreId), {
        athleteId,
        category,
        grade,
        athleteName,
        athleteClub,
        competitorNumber,
        artistry,
        execution,
        difficulty,
        penalties,
        total,
        timestamp: serverTimestamp()
      }, { merge: true });
      markScorePending(athleteId, category);
      clearScoreEdit();
      return;
    }

    await addDoc(activeScoresCol, {
      athleteId,
      category,
      grade,
      athleteName,
      athleteClub,
      competitorNumber,
      artistry,
      execution,
      difficulty,
      penalties,
      total,
      timestamp: serverTimestamp()
    });

    markScorePending(athleteId, category);
    artistryInput.value = "";
    executionInput.value = "";
    difficultyInput.value = "";
    penaltiesInput.value = "";
    totalInput.value = "";
    renderAthleteOptions();
    const firstOption = athleteSelect.querySelector("option:not([disabled])");
    if (firstOption) {
      athleteSelect.value = firstOption.value;
    }
  } finally {
    isSavingScore = false;
    scoreSubmitBtn.disabled = false;
  }
});

form.addEventListener("reset", (event) => {
  if (editingScoreId) {
    event.preventDefault();
    clearScoreEdit();
    return;
  }
  artistryInput.value = "";
  executionInput.value = "";
  difficultyInput.value = "";
  penaltiesInput.value = "";
  totalInput.value = "";
  clearFormErrors(form);
});

streamPerformer.addEventListener("change", async () => {
  if (!ensureActiveRefs()) {
    return;
  }
  const performerId = streamPerformer.value || null;
  const mode = performerId ? "spotlight" : "idle";
  const performerPayload = buildPerformerPayload(performerId);
  streamState = { ...streamState, ...performerPayload, mode };
  updateStreamStatus();
  await setDoc(activeStreamRef, { ...performerPayload, mode, updatedAt: serverTimestamp() }, { merge: true });
});

streamButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!ensureActiveRefs()) {
      return;
    }
    const mode = button.dataset.stream;
    const performerId = mode === "spotlight" ? streamState.performerId : null;
    const performerPayload = buildPerformerPayload(performerId);
    streamState = { ...streamState, ...performerPayload, mode };
    updateStreamStatus();
    await setDoc(activeStreamRef, { ...performerPayload, mode, updatedAt: serverTimestamp() }, { merge: true });
  });
});

resetDemoBtn.addEventListener("click", async () => {
  if (!window.confirm("Clear all competition data? This deletes gymnast(s) and scores for the active competition.")) {
    return;
  }
  if (!activeCompetitionId || !activeAthletesCol || !activeScoresCol || !activeStreamRef) {
    return;
  }
  await deleteCollectionDocs(activeAthletesCol);
  await deleteCollectionDocs(activeScoresCol);
  await setDoc(activeSettingsRef, { ...DEFAULT_SETTINGS, competitionName: settings.competitionName }, { merge: true });
  await syncPublicSettings({ ...DEFAULT_SETTINGS, competitionName: settings.competitionName });
  await setDoc(activeStreamRef, { ...DEFAULT_STREAM_STATE, updatedAt: serverTimestamp() });
  clearScoreEdit();
  clearAthleteEdit();
});

competitionSelect.addEventListener("change", () => {
  const selected = competitions.find((entry) => entry.id === competitionSelect.value);
  competitionNameInput.value = selected ? selected.name : DEFAULT_SETTINGS.competitionName;
});

competitionActivateBtn.addEventListener("click", async () => {
  const selectedId = competitionSelect.value;
  if (!selectedId) {
    return;
  }
  await setActiveCompetition(selectedId);
  ensureActiveRefs();
});

competitionRenameBtn.addEventListener("click", async () => {
  const selectedId = competitionSelect.value;
  const newName = competitionNameInput.value.trim();
  if (!selectedId || !newName) {
    return;
  }
  await setDoc(doc(db, "competitions", selectedId), { name: newName }, { merge: true });
  await setDoc(doc(db, "competitions", selectedId, "settings", "current"), { competitionName: newName }, { merge: true });
  if (selectedId === activeCompetitionId) {
    settings = { ...settings, competitionName: newName };
    adminTitle.textContent = newName;
    await syncPublicSettings(settings);
  }
});

competitionCreateBtn.addEventListener("click", async () => {
  const name = competitionNameInput.value.trim() || DEFAULT_SETTINGS.competitionName;
  await createCompetition(name, { setActive: true });
  ensureActiveRefs();
});

competitionArchiveBtn.addEventListener("click", async () => {
  if (!activeCompetitionId) {
    return;
  }
  const name = competitionNameInput.value.trim() || DEFAULT_SETTINGS.competitionName;
  await setDoc(doc(db, "competitions", activeCompetitionId), { archived: true }, { merge: true });
  await createCompetition(name, { setActive: true });
  ensureActiveRefs();
});

competitionDeleteBtn.addEventListener("click", async () => {
  const selectedId = competitionSelect.value;
  const selected = competitions.find((entry) => entry.id === selectedId);
  if (!selectedId || !selected) {
    return;
  }
  if (selectedId === activeCompetitionId) {
    window.alert("Please switch to another competition before deleting the active one.");
    return;
  }
  if (!window.confirm(`Delete competition "${selected.name}"? This cannot be undone.`)) {
    return;
  }
  await deleteCompetition(selectedId);
});

lockAdminBtn.addEventListener("click", () => {
  pinInput.value = "";
  pinError.classList.add("hidden");
  signOut(auth).catch(() => {
    lockUI();
  });
});

function toggleHelp(show) {
  if (!helpPanel) {
    return;
  }
  helpPanel.classList.toggle("hidden", !show);
}

if (helpToggle) {
  helpToggle.addEventListener("click", () => toggleHelp(true));
}

if (helpClose) {
  helpClose.addEventListener("click", () => toggleHelp(false));
}

if (helpPanel) {
  helpPanel.addEventListener("click", (event) => {
    if (event.target === helpPanel) {
      toggleHelp(false);
    }
  });
}

athleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeAthletesCol) {
    return;
  }
  if (isSavingAthlete) {
    return;
  }
  clearFormErrors(athleteForm);
  const name = athleteNameInput.value.trim();
  const club = athleteClubInput.value.trim();
  const competitorNumber = athleteNumberInput.value.trim();
  const categoryTags = getSelectedTags(categoryTagsContainer);
  const gradeTags = getSelectedTags(gradeTagsContainer);

  let hasErrors = false;
  if (!name) {
    setFieldError(athleteNameInput.closest(".field"), "Enter gymnast(s) name.");
    hasErrors = true;
  }
  if (!club) {
    setFieldError(athleteClubInput.closest(".field"), "Enter club.");
    hasErrors = true;
  }
  if (!competitorNumber) {
    setFieldError(athleteNumberInput.closest(".field"), "Enter Comp No.");
    hasErrors = true;
  }
  if (categoryTags.length !== 1) {
    setFieldError(categoryTagsContainer.closest(".tag-group"), "Select exactly one category.");
    hasErrors = true;
  }
  if (gradeTags.length !== 1) {
    setFieldError(gradeTagsContainer.closest(".tag-group"), "Select exactly one grade.");
    hasErrors = true;
  }

  if (hasErrors) {
    return;
  }

  isSavingAthlete = true;
  athleteSubmitBtn.disabled = true;
  try {
  if (editingAthleteId) {
    await setDoc(doc(activeAthletesCol, editingAthleteId), {
      name,
      club,
      competitorNumber,
      categoryTags,
      gradeTags,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await updateScoresForAthlete(editingAthleteId, {
      athleteName: name,
      athleteClub: club,
      competitorNumber
    });
    if (streamState.performerId === editingAthleteId && activeStreamRef) {
      await setDoc(activeStreamRef, {
        performerId: editingAthleteId,
        performerName: name,
        performerClub: club,
        performerNumber: competitorNumber,
        performerCategory: categoryTags[0] || null,
        performerGrade: gradeTags[0] || null,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    clearAthleteEdit();
    return;
  }

  await addDoc(activeAthletesCol, {
    name,
    club,
    competitorNumber,
    categoryTags,
    gradeTags,
    createdAt: serverTimestamp()
  });

  athleteForm.reset();
  categoryTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });
  gradeTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = false;
  });
} finally {
    isSavingAthlete = false;
    athleteSubmitBtn.disabled = false;
  }
});

athleteCancelBtn.addEventListener("click", () => {
  clearAthleteEdit();
  clearFormErrors(athleteForm);
});

categorySelect.addEventListener("change", renderAthleteOptions);

enforceSingleCheck(categoryTagsContainer);
enforceSingleCheck(gradeTagsContainer);

form.addEventListener("input", (event) => {
  const field = event.target.closest(".field");
  if (field) {
    clearFieldError(field);
  }
});

athleteForm.addEventListener("input", (event) => {
  const field = event.target.closest(".field");
  if (field) {
    clearFieldError(field);
  }
});

athleteForm.addEventListener("change", (event) => {
  if (event.target.type !== "checkbox") {
    return;
  }
  const group = event.target.closest(".tag-group");
  if (group) {
    clearFieldError(group);
  }
});

pinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = pinInput.value.trim();
  const email = emailInput?.value.trim();
  if (!pin || !email) {
    return;
  }
  pinError.classList.add("hidden");
  (async () => {
    try {
      await signInWithEmailAndPassword(auth, email, pin);
      localStorage.setItem(ADMIN_EMAIL_KEY, email);
      pinInput.value = "";
    } catch (error) {
      pinError.textContent = "Incorrect email or PIN.";
      pinError.classList.remove("hidden");
    }
  })();
});

async function startAdminSession() {
  if (subscriptionsStarted) {
    return;
  }
  subscriptionsStarted = true;
  await ensureCompetitionSetup();
  if (activeCompetitionId) {
    bindActiveCompetition(activeCompetitionId);
  }

  onSnapshot(query(competitionsCol, orderBy("createdAt", "desc")), (snap) => {
    competitions = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderCompetitionSelect();
  });

  onSnapshot(settingsRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const nextActive = data.activeCompetitionId || activeCompetitionId;
    if (nextActive && nextActive !== activeCompetitionId) {
      activeCompetitionId = nextActive;
      bindActiveCompetition(activeCompetitionId);
      renderCompetitionSelect();
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    unlockUI();
    startAdminSession();
    return;
  }
  lockUI();
});

const cachedEmail = localStorage.getItem(ADMIN_EMAIL_KEY);
if (emailInput && cachedEmail) {
  emailInput.value = cachedEmail;
}




