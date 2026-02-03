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
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"]
};

const ADMIN_EMAILS = [
  "eclipse@freedom-leisure.co.uk",
  "eclipse.gymnastics@yahoo.co.uk"
];

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
const lockAdminBtn = document.querySelector("#lock-admin");
const authGate = document.querySelector("#auth-gate");
const pinForm = document.querySelector("#pin-form");
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

const settingsRef = doc(db, "settings", "current");
const publicSettingsRef = doc(db, "settingsPublic", "current");
const competitionsCol = collection(db, "competitions");

let settings = { ...DEFAULT_SETTINGS };
let athletes = [];
let scores = [];
const DEFAULT_STREAM_STATE = { mode: "welcome", performerId: null, mixSeconds: 20 };
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
    groupTypes: nextSettings.groupTypes,
    activeCompetitionId
  };
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

  activeUnsubscribers.push(onSnapshot(activeSettingsRef, (snap) => {
    if (!snap.exists()) {
      settings = { ...DEFAULT_SETTINGS };
      fillSelect(categorySelect, settings.categories);
      renderTagOptions(categoryTagsContainer, settings.categories);
      renderTagOptions(gradeTagsContainer, settings.grades);
      syncPublicSettings(settings);
      return;
    }
    settings = { ...DEFAULT_SETTINGS, ...snap.data() };
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
    renderRecent();
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
  if (editingAthlete) {
    scoredIds.delete(editingAthlete);
  }

  const eligible = athletes.filter(
    (athlete) => athlete.categoryTags.includes(category) && !scoredIds.has(athlete.id)
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

  athletes.forEach((athlete) => {
    const option = document.createElement("option");
    option.value = athlete.id;
    option.textContent = `${athlete.name} (${athlete.groupType}, ${athlete.club})`;
    streamPerformer.appendChild(option);
  });

  if (streamState.performerId) {
    streamPerformer.value = streamState.performerId;
  }
}

function renderAthleteList() {
  athleteList.innerHTML = "";
  athletes.forEach((athlete) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const categoryLabel = athlete.categoryTags.join(", ") || "None";
    const gradeLabel = athlete.gradeTags ? athlete.gradeTags.join(", ") : "None";
    text.textContent = `${athlete.name} - ${athlete.groupType} - ${athlete.club} | ${categoryLabel} | ${gradeLabel}`;
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
        await setDoc(activeStreamRef, { performerId: null, mode: "idle", updatedAt: serverTimestamp() }, { merge: true });
      }
    });
    actions.append(editBtn, removeBtn);
    item.append(text, actions);
    athleteList.appendChild(item);
  });
}

function updateTotal() {
  const e = parseFloat(execInput.value) || 0;
  const d = parseFloat(diffInput.value) || 0;
  totalInput.value = (e + d).toFixed(3);
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
    const athlete = athletes.find((entry) => entry.id === score.athleteId);
    const item = document.createElement("li");
    const text = document.createElement("span");
    const athleteName = athlete ? athlete.name : "Unknown";
    text.textContent = `${athleteName} - ${score.category} - ${score.total.toFixed(3)}`;
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
  athleteSubmitBtn.textContent = isEditing ? "Update Athlete/Group" : "Add Athlete/Group";
  athleteCancelBtn.classList.toggle("hidden", !isEditing);
  athleteEditingLabel.classList.toggle("hidden", !isEditing);
}

function startAthleteEdit(athlete) {
  editingAthleteId = athlete.id;
  athleteNameInput.value = athlete.name || "";
  athleteClubInput.value = athlete.club || "";
  athleteGroupSelect.value = athlete.groupType || "Individual";
  categoryTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = athlete.categoryTags?.includes(input.value) || false;
  });
  gradeTagsContainer.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = athlete.gradeTags?.includes(input.value) || false;
  });
  setAthleteFormMode(true);
  athleteEditingLabel.textContent = `Editing athlete/group: ${athlete.name}`;
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
  execInput.value = score.execution?.toFixed ? score.execution.toFixed(3) : score.execution;
  diffInput.value = score.difficulty?.toFixed ? score.difficulty.toFixed(3) : score.difficulty;
  updateTotal();
  setScoreFormMode(true);
  const athlete = athletes.find((entry) => entry.id === score.athleteId);
  const athleteName = athlete ? athlete.name : "Unknown";
  scoreEditingLabel.textContent = `Editing score: ${athleteName}`;
}

function clearScoreEdit() {
  editingScoreId = null;
  editingScore = null;
  form.reset();
  updateTotal();
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

execInput.addEventListener("input", updateTotal);
diffInput.addEventListener("input", updateTotal);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeScoresCol) {
    return;
  }
  const execution = parseFloat(execInput.value);
  const difficulty = parseFloat(diffInput.value);
  const category = categorySelect.value;
  const athleteId = athleteSelect.value;
  const athlete = athletes.find((entry) => entry.id === athleteId);

  if (!athleteId || Number.isNaN(execution) || Number.isNaN(difficulty)) {
    return;
  }

  const total = parseFloat((execution + difficulty).toFixed(3));
  const grade = athlete?.gradeTags?.length === 1 ? athlete.gradeTags[0] : null;

  if (editingScoreId) {
    await setDoc(doc(activeScoresCol, editingScoreId), {
      athleteId,
      category,
      grade,
      execution,
      difficulty,
      total,
      timestamp: serverTimestamp()
    }, { merge: true });
    clearScoreEdit();
    return;
  }

  await addDoc(activeScoresCol, {
    athleteId,
    category,
    grade,
    execution,
    difficulty,
    total,
    timestamp: serverTimestamp()
  });

  form.reset();
  updateTotal();
});

form.addEventListener("reset", (event) => {
  if (editingScoreId) {
    event.preventDefault();
    clearScoreEdit();
    return;
  }
  setTimeout(updateTotal, 0);
});

streamPerformer.addEventListener("change", async () => {
  if (!ensureActiveRefs()) {
    return;
  }
  const performerId = streamPerformer.value || null;
  const mode = performerId ? "spotlight" : "idle";
  streamState = { ...streamState, performerId, mode };
  updateStreamStatus();
  await setDoc(activeStreamRef, { performerId, mode, updatedAt: serverTimestamp() }, { merge: true });
});

streamButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!ensureActiveRefs()) {
      return;
    }
    const mode = button.dataset.stream;
    const performerId = mode === "spotlight" ? streamState.performerId : null;
    streamState = { ...streamState, mode, performerId };
    updateStreamStatus();
    await setDoc(activeStreamRef, { mode, performerId, updatedAt: serverTimestamp() }, { merge: true });
  });
});

resetDemoBtn.addEventListener("click", async () => {
  if (!window.confirm("Reset all demo data? This clears scores and roster changes.")) {
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

athleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeAthletesCol) {
    return;
  }
  const name = athleteNameInput.value.trim();
  const club = athleteClubInput.value.trim();
  const groupType = athleteGroupSelect.value;
  const categoryTags = getSelectedTags(categoryTagsContainer);
  const gradeTags = getSelectedTags(gradeTagsContainer);

  if (!name || !club || !categoryTags.length || !gradeTags.length) {
    return;
  }

  if (editingAthleteId) {
    await setDoc(doc(activeAthletesCol, editingAthleteId), {
      name,
      club,
      groupType,
      categoryTags,
      gradeTags,
      updatedAt: serverTimestamp()
    }, { merge: true });
    clearAthleteEdit();
    return;
  }

  await addDoc(activeAthletesCol, {
    name,
    club,
    groupType,
    categoryTags,
    gradeTags,
    createdAt: serverTimestamp()
  });

  athleteForm.reset();
});

athleteCancelBtn.addEventListener("click", () => {
  clearAthleteEdit();
});

categorySelect.addEventListener("change", renderAthleteOptions);

pinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = pinInput.value.trim();
  if (!pin) {
    return;
  }
  pinError.classList.add("hidden");
  (async () => {
    for (const email of ADMIN_EMAILS) {
      try {
        await signInWithEmailAndPassword(auth, email, pin);
        pinInput.value = "";
        return;
      } catch (error) {
        // Try the next email.
      }
    }
    pinError.textContent = "Incorrect PIN.";
    pinError.classList.remove("hidden");
  })();
});

async function startAdminSession() {
  if (subscriptionsStarted) {
    return;
  }
  subscriptionsStarted = true;
  updateTotal();
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

updateTotal();




