// Firebase project settings. Paste the values from
// Firebase console > Project settings > Your apps > Web app.
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Staff log in with a username; behind the scenes it becomes username@<this domain>.
// It never receives email, it only has to look like an address. Don't change it after setup.
const LOGIN_DOMAIN = "wiwe.staff";
