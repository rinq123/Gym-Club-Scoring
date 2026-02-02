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
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const DEFAULT_SETTINGS = {
  competitionName: "Eclipse Invitational",
  categories: ["Mixed Pair", "Mixed Trio"],
  grades: ["Grade 1", "Grade 2"],
  groupTypes: ["Individual", "Group"],
  pinCodes: ["1234"]
};

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
const authGate = document.querySelector("#auth-gate");
const pinForm = document.querySelector("#pin-form");
const pinInput = document.querySelector("#pin-input");
const pinError = document.querySelector("#pin-error");

const settingsRef = doc(db, "settings", "current");
const streamRef = doc(db, "streamState", "current");
const athletesCol = collection(db, "athletes");
const scoresCol = collection(db, "scores");

let settings = { ...DEFAULT_SETTINGS };
let athletes = [];
let scores = [];
let streamState = { mode: "idle", performerId: null, mixSeconds: 20 };
let isUnlocked = false;

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

function validatePin(pin) {
  return Array.isArray(settings.pinCodes) && settings.pinCodes.includes(pin);
}

function renderAthleteOptions() {
  const category = categorySelect.value;
  athleteSelect.innerHTML = "";
  const scoredIds = new Set(
    scores.filter((score) => score.category === category).map((score) => score.athleteId)
  );

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
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "athletes", athlete.id));
      const scoreQuery = query(scoresCol);
      const snapshot = await getDocs(scoreQuery);
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        if (docSnap.data().athleteId === athlete.id) {
          batch.delete(docSnap.ref);
        }
      });
      await batch.commit();
      if (streamState.performerId === athlete.id) {
        await setDoc(streamRef, { performerId: null, mode: "idle", updatedAt: serverTimestamp() }, { merge: true });
      }
    });
    item.append(text, removeBtn);
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
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn ghost btn-small";
    removeBtn.textContent = "Delete";
    removeBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "scores", score.id));
    });
    item.append(text, removeBtn);
    recentList.appendChild(item);
  });
}

function updateStreamStatus() {
  const modeLabel = streamState.mode === "mix" ? "Idle + Scoreboard Mix" :
    streamState.mode === "scoreboard" ? "Scoreboard Only" :
    streamState.mode === "spotlight" ? "Spotlight" : "Idle";
  streamStatus.textContent = `Mode: ${modeLabel}`;
  streamButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stream === streamState.mode);
  });
}

async function ensureSettings() {
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    await setDoc(settingsRef, DEFAULT_SETTINGS);
    return;
  }
  const data = snap.data();
  const needsUpdate = !Array.isArray(data.categories)
    || data.categories.length === 0
    || data.categories.some((c) => c.toLowerCase().includes("women"))
    || !Array.isArray(data.grades)
    || data.grades.length === 0
    || !Array.isArray(data.groupTypes)
    || data.groupTypes.length === 0
    || !Array.isArray(data.pinCodes)
    || data.pinCodes.length === 0;

  if (needsUpdate) {
    await setDoc(settingsRef, DEFAULT_SETTINGS, { merge: true });
  }
}

async function ensureStreamState() {
  const snap = await getDoc(streamRef);
  if (!snap.exists()) {
    await setDoc(streamRef, { mode: "idle", performerId: null, mixSeconds: 20, updatedAt: serverTimestamp() });
  }
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

function subscribe() {
  onSnapshot(settingsRef, (snap) => {
    if (!snap.exists()) {
      settings = { ...DEFAULT_SETTINGS };
      fillSelect(categorySelect, settings.categories);
      renderTagOptions(categoryTagsContainer, settings.categories);
      renderTagOptions(gradeTagsContainer, settings.grades);
      return;
    }
    settings = { ...DEFAULT_SETTINGS, ...snap.data() };
    fillSelect(categorySelect, settings.categories);
    renderTagOptions(categoryTagsContainer, settings.categories);
    renderTagOptions(gradeTagsContainer, settings.grades);
    renderAthleteOptions();
  });

  onSnapshot(query(athletesCol, orderBy("name")), (snap) => {
    athletes = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderClubOptions();
    renderAthleteOptions();
    renderAthleteList();
    renderStreamPerformerOptions();
  });

  onSnapshot(query(scoresCol, orderBy("timestamp", "desc")), (snap) => {
    scores = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderRecent();
  });

  onSnapshot(streamRef, (snap) => {
    if (!snap.exists()) {
      streamState = { mode: "idle", performerId: null, mixSeconds: 20 };
      updateStreamStatus();
      return;
    }
    streamState = { mode: "idle", performerId: null, mixSeconds: 20, ...snap.data() };
    updateStreamStatus();
    renderStreamPerformerOptions();
  });
}

execInput.addEventListener("input", updateTotal);
diffInput.addEventListener("input", updateTotal);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
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

  await addDoc(scoresCol, {
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

form.addEventListener("reset", () => {
  setTimeout(updateTotal, 0);
});

streamPerformer.addEventListener("change", async () => {
  const performerId = streamPerformer.value || null;
  const mode = performerId ? "spotlight" : "idle";
  await setDoc(streamRef, { performerId, mode, updatedAt: serverTimestamp() }, { merge: true });
});

streamButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.stream;
    const performerId = mode === "spotlight" ? streamState.performerId : null;
    await setDoc(streamRef, { mode, performerId, updatedAt: serverTimestamp() }, { merge: true });
  });
});

resetDemoBtn.addEventListener("click", async () => {
  if (!window.confirm("Reset all demo data? This clears scores and roster changes.")) {
    return;
  }
  const athleteSnap = await getDocs(athletesCol);
  const scoreSnap = await getDocs(scoresCol);
  const batch = writeBatch(db);
  athleteSnap.forEach((docSnap) => batch.delete(docSnap.ref));
  scoreSnap.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
  await setDoc(settingsRef, DEFAULT_SETTINGS, { merge: true });
  await setDoc(streamRef, { mode: "idle", performerId: null, mixSeconds: 20, updatedAt: serverTimestamp() });
});

athleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = athleteNameInput.value.trim();
  const club = athleteClubInput.value.trim();
  const groupType = athleteGroupSelect.value;
  const categoryTags = getSelectedTags(categoryTagsContainer);
  const gradeTags = getSelectedTags(gradeTagsContainer);

  if (!name || !club || !categoryTags.length || !gradeTags.length) {
    return;
  }

  await addDoc(athletesCol, {
    name,
    club,
    groupType,
    categoryTags,
    gradeTags,
    createdAt: serverTimestamp()
  });

  athleteForm.reset();
});

categorySelect.addEventListener("change", renderAthleteOptions);

pinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = pinInput.value.trim();
  if (validatePin(pin)) {
    sessionStorage.setItem("adminPinOk", "1");
    pinError.classList.add("hidden");
    isUnlocked = true;
    unlockUI();
  } else {
    pinError.classList.remove("hidden");
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(() => {});
  }
});

(async function init() {
  lockUI();
  await ensureSettings();
  await ensureStreamState();
  updateTotal();
  subscribe();
  if (sessionStorage.getItem("adminPinOk") === "1") {
    isUnlocked = true;
    unlockUI();
  }
})();
