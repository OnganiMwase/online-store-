import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js'

// Firebase configuration using real, provisioned values
const firebaseConfig = {
  apiKey: "AIzaSyDNjfq3n1JSFsf6QwU154iWnN_zicdN7cU",
  authDomain: "graphic-wallaby-q7854.firebaseapp.com",
  projectId: "graphic-wallaby-q7854",
  storageBucket: "graphic-wallaby-q7854.firebasestorage.app",
  messagingSenderId: "791671181439",
  appId: "1:791671181439:web:fca7df393dcb17cb166f4a"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app, "ai-studio-shopeasy-914153f6-6859-4f83-80af-97863d6408db")
export const auth = getAuth(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)
