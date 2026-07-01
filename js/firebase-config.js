// ==========================================
// PASTE YOUR FIREBASE CONFIGURATION HERE
// ==========================================
// Copy and paste the configuration from your Firebase Console (Project Settings -> General)
const firebaseConfig = {
  apiKey: "AIzaSyBzkgJK_JMP5AyT0cxL2QmPDW9DOuIgvM0",
  authDomain: "shopeasy-60d11.firebaseapp.com",
  projectId: "shopeasy-60d11",
  storageBucket: "shopeasy-60d11.firebasestorage.app",
  messagingSenderId: "977064930579",
  appId: "1:977064930579:web:22c51d4cc187ee5649fee6",
  measurementId: "G-R2KS0QQQLN",
  // Optional: If you created a custom Firestore database ID instead of the default "(default)", specify it here.
  firestoreDatabaseId: "(default)"
}

// Check if placeholder values are still active
const isPlaceholder = (val) => {
  return !val || val === "YOUR_API_KEY" || val === "YOUR_PROJECT_ID" || val.includes("YOUR_");
}

if (isPlaceholder(firebaseConfig.apiKey) || isPlaceholder(firebaseConfig.projectId)) {
  console.error(
    "⚠️ [ShopEasy] FIREBASE CONFIGURATION REQUIRING ATTENTION:\n" +
    "You are using default placeholder values in 'js/firebase-config.js'.\n" +
    "Please configure your manual Firebase project in the Firebase Console:\n" +
    "  1. Go to https://console.firebase.google.com\n" +
    "  2. Create a project and add a Web App.\n" +
    "  3. Replace the keys in the 'firebaseConfig' object in 'js/firebase-config.js' with your new keys."
  );
}

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js'

let app;
let db;
let auth;
let storage;
let functions;

try {
  app = initializeApp(firebaseConfig)
  
  // Use custom database ID if specified and valid (not default)
  const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") 
    ? firebaseConfig.firestoreDatabaseId 
    : undefined;
    
  db = dbId ? getFirestore(app, dbId) : getFirestore(app)
  auth = getAuth(app)
  storage = getStorage(app)
  functions = getFunctions(app)

  // Expose variables globally so separate non-module script files can easily access them
  if (typeof window !== 'undefined') {
    window.firebaseApp = app;
    window.db = db;
    window.auth = auth;
    window.storage = storage;
    window.functions = functions;

    // 🚀 CRITICAL FIX: Broadcast to all other page scripts that variables are alive!
    window.dispatchEvent(new CustomEvent('firebaseReady'));
  }
} catch (error) {
  console.error("🔴 [ShopEasy] Failed to initialize Firebase connection with the provided config:", error);
}

export { app, db, auth, storage, functions }

