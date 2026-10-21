// ==============================================================
// TỆP 3: src/lib/firebase.ts
// Kết nối đúng Realtime Database của dự án M.S.Tech
// ==============================================================
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBqrME9oNfnBVHwL8ypJTtiTIPwe-NDyOM",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://gen-lang-client-0249965989-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0249965989",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getDatabase(app);
