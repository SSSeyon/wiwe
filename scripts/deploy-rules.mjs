// Wiwe Apartments: publish firestore.rules to the live database.
// Run by .github/workflows/deploy-rules.yml whenever firestore.rules changes on main,
// so the rules no longer have to be pasted into the Firebase console by hand.
// Uses the FIREBASE_SERVICE_ACCOUNT secret (the same one as the daily summary).
// If the service account is not allowed to publish rules this fails with a permission
// error: either paste the rules by hand, or give the account the "Firebase Rules Admin" role.
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log('FIREBASE_SERVICE_ACCOUNT is not set. Paste firestore.rules into the Firebase console by hand.');
  process.exit(0);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const source = readFileSync('firestore.rules', 'utf8');
const ruleset = await admin.securityRules().releaseFirestoreRulesetFromSource(source);
console.log('Published Firestore rules:', ruleset.name);
