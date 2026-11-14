// Wiwe Apartments: morning summary email for the owner.
// Run by .github/workflows/daily-summary.yml every day at 06:30 Lagos time.
// On Mondays (or when BACKUP=1) it also attaches a full backup of the database, zipped.
// Needs these GitHub repository secrets (Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT  the JSON key of a Firebase service account (whole file contents)
//   GMAIL_USER                the Gmail address that sends the email
//   GMAIL_APP_PASSWORD        a Gmail "app password" for that address (not the normal password)
//   SUMMARY_TO                where to send it (can be the same address)
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { gzipSync } from 'node:zlib';

if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUMMARY_TO) {
  console.log('Daily summary email is not set up yet (secrets missing). See HANDOVER.md, "Daily summary email". Skipping.');
  process.exit(0);
}
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!sa.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT is not a valid service account JSON'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// "Yesterday" in Lagos (UTC+1, no daylight saving)
const LAGOS = 60 * 60 * 1000;
const nowLagos = new Date(Date.now() + LAGOS);
const todayStartUtc = Date.UTC(nowLagos.getUTCFullYear(), nowLagos.getUTCMonth(), nowLagos.getUTCDate()) - LAGOS;
const from = todayStartUtc - 86400000, to = todayStartUtc;
const dayLabel = new Date(from + LAGOS).toUTCString().slice(0, 16);
const todayLagos = nowLagos.toISOString().slice(0, 10);

const naira = n => (n < 0 ? '-₦' : '₦') + Math.round(Math.abs(n || 0)).toLocaleString('en-NG');
const sum = (list, f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
const range = (col, field) => db.collection(col).where(field, '>=', from).where(field, '<', to).get().then(docs);
// A payment counts once it is recorded (confirmed or still to confirm). Void and not-received records don't;
// a refund counts only after the owner approves it.
const counts = p => p.status !== 'void' && p.status !== 'rejected' && !(p.status === 'unconfirmed' && p.amount < 0);

const [pays, exps, ins, outs, rooms, incidents, items, jobs, sales, settings, waiting, pendingExp, inHouse, owing] = await Promise.all([
  range('payments', 'at'), range('expenses', 'at'), range('stays', 'checkedInAt'), range('stays', 'checkedOutAt'),
  db.collection('rooms').get().then(docs), db.collection('incidents').where('resolved', '==', false).get().then(docs),
  db.collection('items').get().then(docs), db.collection('jobs').where('status', 'in', ['open', 'assigned', 'in_progress']).get().then(docs),
  range('moves', 'at'), db.collection('settings').doc('general').get(),
  db.collection('payments').where('status', '==', 'unconfirmed').get().then(docs),
  db.collection('expenses').where('status', '==', 'pending').get().then(docs),
  db.collection('stays').where('status', '==', 'checked_in').get().then(docs),
  db.collection('stays').where('balance', '>', 0).get().then(docs)
]);
const checkOutTime = (settings.exists && settings.data().checkOutTime) || '12:00';

const paid = pays.filter(p => counts(p) && p.amount > 0);
const by = m => sum(paid.filter(p => p.method === m), p => p.amount);
const spent = exps.filter(e => e.status !== 'rejected' && e.status !== 'void');
const activeRooms = rooms.filter(r => !r.archived);
const occupied = activeRooms.filter(r => r.status === 'occupied').length;
const itemSales = sales.filter(m => m.type === 'sale');
const overstays = inHouse.filter(s => s.checkOutDate < todayLagos);
const low = items.filter(i => !i.archived && Number(i.qty) <= Number(i.reorderLevel || 0));
const refunds = waiting.filter(p => p.amount < 0);
const toConfirm = waiting.filter(p => p.amount > 0);
const debtors = owing.filter(s => s.status === 'checked_in' || s.status === 'checked_out');
const leftOwing = debtors.filter(s => s.status === 'checked_out');

const flags = [];
overstays.forEach(s => flags.push(`Overstay: Room ${s.roomNo} (${s.guestName}), was due out ${s.checkOutDate} ${checkOutTime}`));
leftOwing.forEach(s => flags.push(`${s.guestName} (Room ${s.roomNo}) checked out owing ${naira(s.balance)}`));
if (toConfirm.length) flags.push(`${toConfirm.length} payment(s) not yet confirmed: ${naira(sum(toConfirm, p => p.amount))}. Match them to the POS settlement.`);
if (refunds.length) flags.push(`${refunds.length} refund(s) waiting for your approval: ${naira(-sum(refunds, p => p.amount))}`);
incidents.slice(0, 8).forEach(i => flags.push(i.title));
if (pendingExp.length) flags.push(`${pendingExp.length} expense(s) waiting for your approval`);
if (low.length) flags.push(`${low.length} store item(s) low: ${low.slice(0, 5).map(i => i.name).join(', ')}`);
if (jobs.length) flags.push(`${jobs.length} open repair job(s)`);

const rows = [
  ['Money recorded', `${naira(sum(paid, p => p.amount))} (${paid.length} payments)`],
  ['By POS', naira(by('pos'))],
  ['By bank transfer', naira(by('transfer'))],
  ['Confirmed by you', naira(sum(paid.filter(p => p.status === 'confirmed'), p => p.amount))],
  ['Item sales', naira(sum(itemSales, m => m.total))],
  ['Spent', naira(sum(spent, e => e.amount))],
  ['Guests owing', `${naira(sum(debtors, s => s.balance))} (${debtors.length})`],
  ['Check-ins / check-outs', `${ins.length} / ${outs.length}`],
  ['Occupied now', `${occupied} of ${activeRooms.length}`]
];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Weekly backup: everything except photos, as one zipped JSON file attached to the email
const attachments = [];
let backupNote = '';
if (nowLagos.getUTCDay() === 1 || process.env.BACKUP === '1') {
  const cols = ['rooms', 'roomTypes', 'users', 'usernames', 'stays', 'payments', 'tasks', 'jobs', 'assets', 'vendors', 'items', 'moves', 'expenses', 'incidents', 'laundry', 'shifts', 'settings', 'audit'];
  const out = { app: 'wiwe', at: new Date().toISOString() };
  for (const c of cols) out[c] = await db.collection(c).get().then(docs);
  out.settings = out.settings.filter(x => x.id !== 'security');
  const zipped = gzipSync(Buffer.from(JSON.stringify(out)));
  if (zipped.length < 20 * 1024 * 1024) { attachments.push({ filename: `wiwe-backup-${todayLagos}.json.gz`, content: zipped }); backupNote = 'This week\'s backup is attached. Keep it somewhere safe.'; }
  else backupNote = 'The backup is now too big to email. Download it from Admin settings → Backup instead.';
}

const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#161616">
<h2 style="margin:0 0 4px">Wiwe Apartments</h2><div style="color:#5E5848;margin-bottom:16px">${esc(dayLabel)}</div>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#5E5848">${esc(k)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>
${flags.length ? `<h3 style="margin:20px 0 6px">Needs attention</h3><ul style="padding-left:18px;margin:0">${flags.map(f => `<li style="margin:4px 0">${esc(f)}</li>`).join('')}</ul>` : '<p style="margin-top:20px;color:#17643F">Nothing needs attention.</p>'}
${backupNote ? `<p style="margin-top:20px;color:#5E5848">${esc(backupNote)}</p>` : ''}
</div>`;
const text = `Wiwe Apartments · ${dayLabel}\n\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (flags.length ? '\n\nNeeds attention:\n' + flags.map(f => '- ' + f).join('\n') : '\n\nNothing needs attention.') + (backupNote ? '\n\n' + backupNote : '');

const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
await mail.sendMail({ from: `Wiwe Apartments <${process.env.GMAIL_USER}>`, to: process.env.SUMMARY_TO, subject: `Wiwe daily summary · ${dayLabel}`, text, html, attachments });
console.log('Summary sent for', dayLabel, attachments.length ? '(with backup)' : '');
