import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAuqMV4O9ov1MZlQBt0ie9cpsq4OLSlopU",
  authDomain: "eclipse-invitational.firebaseapp.com",
  projectId: "eclipse-invitational",
  storageBucket: "eclipse-invitational.firebasestorage.app",
  messagingSenderId: "595883069130",
  appId: "1:595883069130:web:6ca2bb2f2485776ca4ae33"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
