// Wiwe Apartments: email the owner when something cannot wait for the morning summary.
// Run by .github/workflows/urgent-alerts.yml about once an hour. It remembers when it last
// ran (in the database, at meta/alerts) and reports only what happened since then:
//   - new incidents (missing items, room used with no guest, stock or laundry short, POS mismatch, disputed handover)
//   - a guest who is more than an hour past check-out
//   - a guest who checked out still owing money
//   - a refund or an expense waiting for approval
// It sends nothing when there is nothing new. Uses the same secrets as the daily summary.
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';

if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUMMARY_TO) {
  console.log('Urgent alerts are not set up yet (secrets missing). Skipping.');
  process.exit(0);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const LAGOS = 60 * 60 * 1000, HOUR = 3600000, now = Date.now();
const metaRef = db.collection('meta').doc('alerts');
const meta = await metaRef.get();
// first run: look back one hour. After a long gap: at most six hours, so a restart never floods the inbox.
const since = Math.max(meta.exists && meta.data().lastRun ? meta.data().lastRun : now - HOUR, now - 6 * HOUR);

const naira = n => '₦' + Math.round(Math.abs(n || 0)).toLocaleString('en-NG');
const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
const fresh = x => x.at > since && x.at <= now;

const [incidents, waiting, pendingExp, inHouse, owing, settings] = await Promise.all([
  db.collection('incidents').where('at', '>', since).get().then(docs),
  db.collection('payments').where('status', '==', 'unconfirmed').get().then(docs),
  db.collection('expenses').where('status', '==', 'pending').get().then(docs),
  db.collection('stays').where('status', '==', 'checked_in').get().then(docs),
  db.collection('stays').where('balance', '>', 0).get().then(docs),
  db.collection('settings').doc('general').get()
]);
const checkOutTime = (settings.exists && settings.data().checkOutTime) || '12:00';
// the moment (UTC ms) a stay becomes an overstay worth an email: one hour after check-out time, Lagos
const overdueAt = s => {
  const [y, m, d] = String(s.checkOutDate).split('-').map(Number), [hh, mm] = checkOutTime.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0) - LAGOS + HOUR;
};

const items = [];
incidents.filter(i => !i.resolved).forEach(i => items.push(`Incident: ${i.title} (${i.byName || 'staff'})`));
inHouse.filter(s => { const t = overdueAt(s); return t > since && t <= now; }).forEach(s => items.push(`Overstay: Room ${s.roomNo}, ${s.guestName} was due out at ${checkOutTime} and is still checked in`));
owing.filter(s => s.status === 'checked_out' && s.checkedOutAt > since && s.checkedOutAt <= now).forEach(s => items.push(`${s.guestName} (Room ${s.roomNo}) checked out owing ${naira(s.balance)}`));
waiting.filter(p => p.amount < 0 && fresh(p)).forEach(p => items.push(`Refund to approve: ${naira(p.amount)} for ${p.guestName} (${p.note || 'Room ' + p.roomNo}), asked by ${p.byName || 'staff'}`));
pendingExp.filter(fresh).forEach(e => items.push(`Expense to approve: ${naira(e.amount)} ${e.description || e.category} (${e.byName || 'staff'})`));

await metaRef.set({ lastRun: now }, { merge: true });
if (!items.length) { console.log('Nothing new since', new Date(since).toISOString()); process.exit(0); }

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#161616"><h2 style="margin:0 0 10px">Wiwe Apartments: needs you now</h2><ul style="padding-left:18px;margin:0">${items.map(f => `<li style="margin:6px 0">${esc(f)}</li>`).join('')}</ul><p style="color:#5E5848;margin-top:16px">Open the app and look at Today.</p></div>`;
const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
await mail.sendMail({ from: `Wiwe Apartments <${process.env.GMAIL_USER}>`, to: process.env.SUMMARY_TO, subject: `Wiwe: ${items.length} thing${items.length > 1 ? 's' : ''} need${items.length > 1 ? '' : 's'} you now`, text: items.map(f => '- ' + f).join('\n'), html });
console.log('Alert sent:', items.length, 'item(s)');
