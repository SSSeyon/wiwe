const APP_VERSION = '1.9.3';

/* =========================================================
   Constants
   ========================================================= */
const ROLES = { admin: 'Admin', manager: 'Manager', frontdesk: 'Front desk', housekeeping: 'Housekeeping', maintenance: 'Maintenance' };
const ROOM_STATUS = {
  ready: { label: 'Ready', cls: 'st-ready' },
  reserved: { label: 'Reserved', cls: 'st-reserved' },
  occupied: { label: 'Occupied', cls: 'st-occupied' },
  dirty: { label: 'Dirty', cls: 'st-dirty' },
  cleaning: { label: 'Cleaning', cls: 'st-cleaning' },
  inspect: { label: 'Inspection', cls: 'st-inspect' },
  ooo: { label: 'Out of order', cls: 'st-ooo' }
};
const PAY_METHODS = { transfer: 'Bank transfer', pos: 'POS', cash: 'Cash' };
const ID_TYPES = ['NIN slip', "Driver's licence", 'International passport', "Voter's card", 'Other'];
const EXPENSE_CATS = { diesel: 'Diesel / fuel', electricity: 'Electricity (prepaid)', repairs: 'Repairs', supplies: 'Supplies', salaries: 'Salaries', internet: 'Internet / TV', cleaning: 'Laundry / cleaning', security: 'Security', other: 'Other' };
const ITEM_CATS = { consumable: 'Guest consumables', cleaning: 'Cleaning supplies', linen: 'Linen & towels', kitchen: 'Kitchen', maintenance: 'Maintenance parts', drinks: 'Drinks', snacks: 'Snacks & food', toiletries: 'Toiletries & personal care', other: 'Other' };
const ASSET_CATS = ['Air conditioner', 'Generator', 'Inverter / solar', 'Fridge', 'Television', 'Cooker / microwave', 'Water heater', 'Water pump', 'Smart lock', 'Furniture', 'CCTV / security', 'Other'];

const DEFAULT_SETTINGS = {
  businessName: 'Wiwe Apartments',
  cautionEnabled: true,
  cautionAmount: 0,
  checkInTime: '14:00',
  checkOutTime: '12:00',
  approvalLimit: 50000,
  holdHours: 3,
  commonAreas: ['Reception', 'Generator house', 'Store', 'Compound', 'Water system', 'Laundry'],
  turnoverSteps: [
    'Strip bed, bag linen for laundry',
    'Empty bins, remove guest leftovers',
    'Bathroom: toilet, shower, sink, mirror',
    'Kitchen: wipe surfaces, clean fridge and cooker (kitchen rooms)',
    'Dust surfaces, wipe switches and handles',
    'Make bed with fresh linen',
    'Fresh towels laid out',
    'Sweep and mop floor',
    'Check AC, TV, lights, water and remotes work',
    'Restock water and toiletries',
    'Air room, lock windows, switch off AC'
  ],
  dailyCleaning: true,
  idPhotoMonths: 6,
  linenItems: ['Bedsheets', 'Pillowcases', 'Duvet covers', 'Bath towels', 'Hand towels'],
  dailySteps: ['Make bed', 'Empty bins', 'Tidy bathroom, replace towels if asked', 'Top up water and toiletries', 'Sweep floor']
};

/* =========================================================
   Firebase
   ========================================================= */
let db, auth, FV;
const CONFIGURED = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('YOUR_') !== 0;
if (CONFIGURED) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db = firebase.firestore();
  FV = firebase.firestore.FieldValue;
  db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
}

/* =========================================================
   State
   ========================================================= */
const S = {
  user: null, me: null, view: null, params: {}, tab: {},
  settings: Object.assign({}, DEFAULT_SETTINGS),
  data: { rooms: [], roomTypes: [], stays: [], payments: [], tasks: [], jobs: [], assets: [], vendors: [], items: [], moves: [], expenses: [], incidents: [], users: [], laundry: [], shifts: [] },
  unsub: [], meta: {}, pending: false, fromCache: true, online: navigator.onLine,
  adminUntil: 0, photoCache: {}, form: {}
};

/* =========================================================
   Helpers
   ========================================================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n) { n = Number(n) || 0; return (n < 0 ? '-₦' : '₦') + Math.abs(Math.round(n)).toLocaleString('en-NG'); }
function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function atTime(ds, hhmm) { var d = parseDate(ds); var t = String(hhmm || '12:00').split(':'); d.setHours(+t[0] || 0, +t[1] || 0, 0, 0); return d.getTime(); }
var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) { if (!s) return ''; var d = typeof s === 'number' ? new Date(s) : parseDate(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
function fmtTime(ms) { if (!ms) return ''; var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtDT(ms) { if (!ms) return ''; return fmtDate(ms) + ', ' + fmtTime(ms); }
function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }
function initials(name) { return String(name || '?').split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase(); }
function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function has() { if (!S.me) return false; var r = S.me.roles || []; if (r.indexOf('admin') >= 0) return true; for (var i = 0; i < arguments.length; i++) if (r.indexOf(arguments[i]) >= 0) return true; return false; }
function isAdmin() { return S.me && (S.me.roles || []).indexOf('admin') >= 0; }
function meName() { return S.me ? S.me.name : ''; }
function stamp() { return { by: S.user.uid, byName: meName(), at: Date.now() }; }
function val(id) { var el = $(id); if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value.trim(); }
function radio(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
function opts(list, sel) { return list.map(function (o) { var v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o; return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
function objOpts(obj, sel) { return opts(Object.keys(obj).map(function (k) { return { v: k, l: obj[k] }; }), sel); }
function pill(text, cls) { return '<span class="pill ' + (cls || '') + '">' + esc(text) + '</span>'; }
function sum(list, f) { return list.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); }
function sortBy(list, f, desc) { return list.slice().sort(function (a, b) { var x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1); }); }
function field(label, inner, cls, hint) { return '<label class="field ' + (cls || '') + '">' + esc(label) + inner + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>'; }
function input(id, value, attrs) { return '<input id="' + id + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '>'; }
async function sha256(text) { var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
function newId(col) { return db.collection(col).doc().id; }

var ICONS = {
  today: '<path d="M3 11l9-8 9 8v10H3z"/>',
  shift: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  building: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-4h6v4M8 10h2M14 10h2M8 14h2M14 14h2"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  stays: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  housekeeping: '<path d="M12 3v9M7 12h10l2 9H5z"/>',
  maintenance: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  inventory: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  expenses: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  admin: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M19 4l2 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
};
function icon(name, size) { return '<svg aria-hidden="true" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'; }

/* =========================================================
   UI primitives: toast, modal, menu, dark mode
   ========================================================= */
var toastTimer;
function toast(msg, bad) { var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200); }
function fail(e) { console.error(e); var m = (e && e.message) || String(e); if (m.indexOf('permission') >= 0 || m.indexOf('PERMISSION') >= 0) { if (typeof isAdmin === 'function' && isAdmin()) { if (typeof checkRules === 'function') checkRules().then(function () { if (S.rulesOutdated) openRulesHelp(); }); m = 'Refused by the database security rules. Checking whether they need updating…'; } else m = 'You do not have permission to do that.'; } toast(m, true); }
function openModal(title, body, wide) { $('modalTitle').textContent = title; $('modalBody').innerHTML = body; $('modalCard').className = 'modal-card' + (wide ? ' wide' : ''); $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; hydratePhotos($('modalBody')); var f = $('modalBody').querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea'); if (f && window.innerWidth > 700) setTimeout(function () { f.focus(); }, 50); }
function closeModal() { $('modal').classList.add('hidden'); document.body.style.overflow = ''; S.form = {}; }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal(); });
function toggleMenu(open) { $('sidebar').classList.toggle('open', open); $('overlay').classList.toggle('show', open); }
function toggleDark() { var on = !document.body.classList.contains('dark-mode'); document.body.classList.toggle('dark-mode', on); try { localStorage.setItem('wiwe_dark', on ? '1' : '0'); } catch (e) {} paintDarkIcon(); }
function paintDarkIcon() { var el = $('darkIcon'); if (el) el.innerHTML = icon(document.body.classList.contains('dark-mode') ? 'sun' : 'moon'); }
try { if (localStorage.getItem('wiwe_dark') === '1') document.body.classList.add('dark-mode'); } catch (e) {}

/* =========================================================
   Photos: compressed JPEG stored in the "photos" collection
   ========================================================= */
function compressImage(file, maxSide, quality) {
  return new Promise(function (resolve, reject) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var w = img.width, h = img.height, scale = Math.min(1, maxSide / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject; img.src = url;
  });
}
// Opens the camera / file picker; uploads; then adds the photo id to S.form[key] and redraws the thumbs in #thumbs-key
function takePhoto(key) {
  var inp = $('photoInput'); inp.value = '';
  inp.onchange = async function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    try {
      toast('Saving photo…');
      var data = await compressImage(f, 1000, 0.6);
      if (data.length > 900000) data = await compressImage(f, 700, 0.5);
      var ref = db.collection('photos').doc();
      ref.set(Object.assign({ data: data }, stamp())).catch(fail);
      S.photoCache[ref.id] = data;
      S.form[key] = (S.form[key] || []).concat(ref.id);
      var box = $('thumbs-' + key); if (box) box.innerHTML = thumbs(S.form[key]);
      toast('Photo added');
    } catch (e) { fail(e); }
  };
  inp.click();
}
function photoField(key, label) { return '<div class="field">' + esc(label) + '<div class="row"><button type="button" class="photo-btn" onclick="takePhoto(\'' + key + '\')">+ Add photo</button><div class="thumbs" id="thumbs-' + key + '">' + thumbs(S.form[key] || []) + '</div></div></div>'; }
function thumbs(ids) { return (ids || []).map(function (id) { return '<img class="thumb" alt="Photo" data-photo="' + esc(id) + '" onclick="viewPhoto(\'' + esc(id) + '\')"' + (S.photoCache[id] ? ' src="' + S.photoCache[id] + '"' : '') + '>'; }).join(''); }
function hydratePhotos(root) {
  (root || document).querySelectorAll('img[data-photo]:not([src])').forEach(function (img) {
    var id = img.getAttribute('data-photo');
    getPhoto(id).then(function (d) { if (d) img.src = d; });
  });
}
async function getPhoto(id) {
  if (S.photoCache[id]) return S.photoCache[id];
  try { var s = await db.collection('photos').doc(id).get(); if (s.exists) { S.photoCache[id] = s.data().data; return S.photoCache[id]; } } catch (e) {}
  return null;
}
async function viewPhoto(id) {
  var d = await getPhoto(id); if (!d) return toast('Photo not available offline', true);
  var w = window.open(); if (w) { w.document.write('<title>Photo</title><body style="margin:0;background:#111;display:flex;justify-content:center"><img src="' + d + '" style="max-width:100%;max-height:100vh"></body>'); }
}

/* =========================================================
   Audit log (write-only for staff)
   ========================================================= */
function audit(action, entity, entityId, details) {
  if (!db || !S.user) return;
  db.collection('audit').add(Object.assign({ action: action, entity: entity, entityId: entityId || '', details: details || '' }, stamp())).catch(function () {});
}

/* =========================================================
   Auth: login, first-time setup
   ========================================================= */
/* Staff only ever see a username and password. Behind the scenes Firebase needs an
   email-shaped login, so each account gets a random hidden one, and usernames/{username}
   points to it. Handing an account over to a new person re-points the username to a
   fresh login, so the old person's password stops working and their history is kept. */
function cleanUsername(u) { return String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, ''); }
function newLoginEmail() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '@' + LOGIN_DOMAIN; }
function validPassword(p) { return String(p || '').length >= 6; }

function showLogin(mode, msg) {
  $('boot').classList.add('hidden'); $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  var head = '<img class="login-photo" src="img/building.jpg" alt="Wiwe Apartments building, Sowhe, Badagry"><img class="login-logo logo-img" src="img/logo.png" alt="Wiwe Apartments"><div class="muted" style="text-align:center;margin-top:-8px">Operations</div>';
  if (mode === 'config') {
    $('login').innerHTML = '<div class="login-card">' + head + '<h2>Almost there</h2><p class="muted">Add your Firebase project settings to <strong>config.js</strong>, then reload. See HANDOVER.md for the steps.</p></div>';
    return;
  }
  if (mode === 'setup') {
    $('login').innerHTML = '<div class="login-card">' + head +
      '<h2>First-time setup</h2><p class="muted">This creates the owner (admin) account and 15 starter rooms. You can rename rooms and set rates afterwards.</p>' +
      '<form class="form" onsubmit="event.preventDefault();doSetup()">' +
      field('Your name', input('su-name', '', 'required autocomplete="name"')) +
      field('Username', input('su-user', '', 'required autocapitalize="none" autocomplete="username"'), '', 'Letters and numbers only, e.g. owner') +
      field('Password', input('su-pin', '', 'required minlength="6" type="password" autocomplete="new-password"'), '', 'At least 6 characters') +
      field('Admin code (6 digits)', input('su-code', '', 'required inputmode="numeric" pattern="[0-9]{6}" type="password"'), '', 'A separate code that unlocks admin settings. Keep it different from your password.') +
      '<button class="btn primary block" type="submit" id="su-btn">Create owner account</button>' +
      '<button class="btn block" type="button" onclick="showLogin(\'login\')">I already have an account</button>' +
      (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') + '</form></div>';
    return;
  }
  $('login').innerHTML = '<div class="login-card">' + head +
    '<h2>Sign in</h2>' +
    '<form class="form" onsubmit="event.preventDefault();doLogin()">' +
    field('Username', input('li-user', '', 'required autocapitalize="none" autocomplete="username"')) +
    field('Password', input('li-pin', '', 'required type="password" autocomplete="current-password"')) +
    '<button class="btn primary block" type="submit" id="li-btn">Sign in</button>' +
    (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') +
    '<button class="btn block" type="button" onclick="checkSetup()">First time? Set up</button>' +
    '</form></div>';
}

async function doLogin() {
  var btn = $('li-btn'); btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    var u = await db.collection('usernames').doc(cleanUsername(val('li-user'))).get();
    if (!u.exists) throw new Error('no user');
    await auth.signInWithEmailAndPassword(u.data().email, val('li-pin'));
  } catch (e) { showLogin('login', 'Wrong username or password.'); }
}

async function checkSetup() {
  try {
    var s = await db.collection('meta').doc('setup').get();
    if (s.exists) showLogin('login', 'Setup is already done. Ask the owner for a login.');
    else showLogin('setup');
  } catch (e) { showLogin('setup'); }
}

async function doSetup() {
  var name = val('su-name'), user = cleanUsername(val('su-user')), pin = val('su-pin'), code = val('su-code');
  if (!user) return showLogin('setup', 'Choose a username (letters and numbers).');
  if (!validPassword(pin)) return showLogin('setup', 'Password must be at least 6 characters.');
  if (!/^[0-9]{6}$/.test(code)) return showLogin('setup', 'Admin code must be 6 digits.');
  $('su-btn').disabled = true; $('su-btn').textContent = 'Setting up…';
  try {
    var email = newLoginEmail();
    var cred = await auth.createUserWithEmailAndPassword(email, pin);
    var uid = cred.user.uid, now = Date.now(), b = db.batch();
    b.set(db.collection('users').doc(uid), { name: name, username: user, roles: ['admin'], active: true, createdAt: now });
    b.set(db.collection('usernames').doc(user), { uid: uid, email: email, at: now });
    b.set(db.collection('meta').doc('setup'), { done: true, by: uid, at: now });
    await b.commit();
    var b2 = db.batch();
    b2.set(db.collection('settings').doc('general'), DEFAULT_SETTINGS);
    b2.set(db.collection('settings').doc('security'), { codeHash: await sha256(code + '|wiwe-admin') });
    var tStd = db.collection('roomTypes').doc(), tKit = db.collection('roomTypes').doc();
    var baseItems = [{ name: 'Bath towels', qty: 2 }, { name: 'Hand towels', qty: 2 }, { name: 'Bedsheets + pillowcases', qty: 4 }, { name: 'TV remote', qty: 1 }, { name: 'AC remote', qty: 1 }, { name: 'Key card', qty: 1 }];
    var kitItems = baseItems.concat([{ name: 'Plates', qty: 4 }, { name: 'Cups / glasses', qty: 4 }, { name: 'Cutlery set', qty: 4 }, { name: 'Pot', qty: 2 }, { name: 'Frying pan', qty: 1 }, { name: 'Kettle', qty: 1 }]);
    b2.set(tStd, { name: 'Standard', rate: 0, hasKitchen: false, items: baseItems, createdAt: now });
    b2.set(tKit, { name: 'With kitchen', rate: 0, hasKitchen: true, items: kitItems, createdAt: now });
    for (var i = 1; i <= 15; i++) {
      b2.set(db.collection('rooms').doc(), { number: String(100 + i), typeId: i <= 8 ? tStd.id : tKit.id, status: 'ready', order: i, createdAt: now });
    }
    var starter = [['Bottled water', 'consumable', 'bottles', 30], ['Toiletry kit', 'consumable', 'kits', 10], ['Toilet roll', 'consumable', 'rolls', 20], ['Bathing soap', 'consumable', 'pcs', 15], ['Detergent', 'cleaning', 'kg', 3], ['Disinfectant', 'cleaning', 'litres', 2], ['Bin bags', 'cleaning', 'pcs', 30], ['Air freshener', 'cleaning', 'cans', 3]];
    starter.forEach(function (s) { b2.set(db.collection('items').doc(), { name: s[0], category: s[1], unit: s[2], qty: 0, reorderLevel: s[3], unitCost: 0, createdAt: now }); });
    await b2.commit();
    toast('Setup complete. Welcome!');
  } catch (e) { showLogin('setup', e.message || String(e)); }
}

async function signOut() { if (!confirm('Sign out of Wiwe?')) return; stopListeners(); S.adminUntil = 0; await auth.signOut(); }

/* =========================================================
   Live data
   ========================================================= */
function stopListeners() { S.unsub.forEach(function (u) { try { u(); } catch (e) {} }); S.unsub = []; S.meta = {}; }
function listen(key, query) {
  var u = query.onSnapshot({ includeMetadataChanges: true }, function (snap) {
    S.data[key] = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    // Track each list separately; the badge shows the combined state (one list's old
    // "pending" flag must not stick after another list reports it is up to date)
    S.meta[key] = { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache };
    var ks = Object.keys(S.meta);
    S.pending = ks.some(function (k) { return S.meta[k].pending; });
    S.fromCache = ks.some(function (k) { return S.meta[k].cache; });
    paintSync(); scheduleRender();
  }, function (e) { console.warn(key, e.message); delete S.meta[key]; paintSync(); });
  S.unsub.push(u);
}
function startListeners() {
  stopListeners();
  var c = function (n) { return db.collection(n); };
  listen('rooms', c('rooms'));
  listen('roomTypes', c('roomTypes'));
  listen('users', c('users'));
  listen('items', c('items'));
  listen('assets', c('assets'));
  listen('vendors', c('vendors'));
  listen('stays', c('stays').orderBy('createdAt', 'desc').limit(600));
  listen('payments', c('payments').orderBy('at', 'desc').limit(600));
  listen('tasks', c('tasks').orderBy('createdAt', 'desc').limit(300));
  listen('jobs', c('jobs').orderBy('createdAt', 'desc').limit(300));
  listen('moves', c('moves').orderBy('at', 'desc').limit(500));
  listen('expenses', c('expenses').orderBy('at', 'desc').limit(500));
  listen('incidents', c('incidents').orderBy('at', 'desc').limit(200));
  listen('laundry', c('laundry').orderBy('sentAt', 'desc').limit(100));
  if (has('manager', 'frontdesk')) listen('shifts', c('shifts').orderBy('openedAt', 'desc').limit(60));
  S.unsub.push(c('settings').doc('general').onSnapshot(function (d) { if (d.exists) S.settings = Object.assign({}, DEFAULT_SETTINGS, d.data()); scheduleRender(); }));
}
function paintSync() {
  var b = $('syncBadge'), t = $('syncText'); if (!b) return;
  if (!navigator.onLine) { b.className = 'sync off'; t.textContent = 'Offline · saved on device'; }
  else if (S.pending) { b.className = 'sync'; t.textContent = 'Syncing…'; }
  else if (S.fromCache) { b.className = 'sync'; t.textContent = 'Connecting…'; }
  else { b.className = 'sync ok'; t.textContent = 'Synced'; }
}
function forceSync() { if (!db) return; db.enableNetwork().then(function () { toast(navigator.onLine ? 'Sync requested' : 'You are offline. Changes are saved and will sync later.'); }); }
window.addEventListener('online', paintSync); window.addEventListener('offline', paintSync);

/* =========================================================
   Derived data used by several screens
   ========================================================= */
function roomType(room) { return byId(S.data.roomTypes, room && room.typeId) || { name: '—', rate: 0, items: [] }; }
function roomsSorted() { return sortBy(S.data.rooms.filter(function (r) { return !r.archived; }), function (r) { return r.order != null ? r.order : +r.number || 0; }); }
var FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];
function floorName(i) { return FLOOR_NAMES[i] || ('Floor ' + i); }
// Floor saved on the room, or worked out from its position: 5 rooms per floor (101–105 ground, 106–110 first…)
function roomFloor(r) { if (r.floor != null && r.floor !== '') return +r.floor; var i = roomsSorted().indexOf(r); return Math.floor(Math.max(0, i) / 5); }
function roomByNo(no) { return S.data.rooms.find(function (r) { return r.number === no; }); }
function stayOf(room) { return room && room.currentStayId ? byId(S.data.stays, room.currentStayId) : null; }
function staysByStatus(st) { return S.data.stays.filter(function (s) { return s.status === st; }); }
function reservationToday(room) { var t = todayStr(); return S.data.stays.find(function (s) { return s.status === 'reserved' && s.roomId === room.id && s.checkInDate <= t; }); }
function displayStatus(room) { if (room.status === 'ready' && reservationToday(room)) return 'reserved'; return room.status || 'ready'; }
function isOverstay(s) { return s.status === 'checked_in' && Date.now() > atTime(s.checkOutDate, S.settings.checkOutTime) + 30 * 60000; }
function dueOutToday(s) { return s.status === 'checked_in' && s.checkOutDate === todayStr(); }
function staffList(role) { return S.data.users.filter(function (u) { return u.active !== false && (!role || (u.roles || []).indexOf(role) >= 0 || (u.roles || []).indexOf('admin') >= 0); }); }
function userName(uid) { var u = byId(S.data.users, uid); return u ? u.name : ''; }
function lowStock() { return S.data.items.filter(function (i) { return !i.archived && Number(i.qty) <= Number(i.reorderLevel || 0); }); }
function nextService(a) { if (!a.serviceDays) return null; var base = a.lastServiced || a.purchaseDate; if (!base) return todayStr(); return addDays(base, +a.serviceDays); }
function serviceDue(withinDays) { var lim = addDays(todayStr(), withinDays || 0); return S.data.assets.filter(function (a) { var n = nextService(a); return a.status !== 'retired' && n && n <= lim; }); }
function openJobs() { return S.data.jobs.filter(function (j) { return ['open', 'assigned', 'in_progress'].indexOf(j.status) >= 0; }); }
function pendingExpenses() { return S.data.expenses.filter(function (e) { return e.status === 'pending'; }); }
function unconfirmedPayments() { return S.data.payments.filter(function (p) { return p.status === 'unconfirmed' && p.amount > 0; }); }
function refundsDue() { return S.data.stays.filter(function (s) { return s.cautionStatus === 'refund_due'; }); }
function pendingDiscounts() { return S.data.stays.filter(function (s) { return s.discountStatus === 'pending' && s.status !== 'cancelled'; }); }
function openIncidents() { return S.data.incidents.filter(function (i) { return !i.resolved; }); }
function needsApproval(amount) { return Number(amount) > Number(S.settings.approvalLimit || 0); }

// One list of things that need attention, for the room board and the owner's Today screen
function alerts() {
  var out = [];
  if (S.rulesOutdated) out.push({ lvl: 'bad', tag: 'SETUP', t: 'Security rules need updating', s: 'Some actions are being refused. Tap for the 1-minute fix.', go: 'openRulesHelp()' });
  S.data.stays.filter(isOverstay).forEach(function (s) { out.push({ lvl: 'bad', tag: 'OVERSTAY', t: 'Room ' + s.roomNo + ' past check-out', s: s.guestName + ' was due out ' + fmtDate(s.checkOutDate) + '. Extend or check out.', go: "openStay('" + s.id + "')" }); });
  var up = unconfirmedPayments(); if (up.length) out.push({ lvl: 'alert', tag: 'PAYMENT', t: up.length + ' payment' + (up.length > 1 ? 's' : '') + ' not confirmed', s: money(sum(up, function (p) { return p.amount; })) + ' waiting to be matched to the bank', go: "go('payments')" });
  S.data.payments.filter(function (p) { return p.status === 'unconfirmed' && p.amount < 0; }).forEach(function (p) { out.push({ lvl: 'amber', tag: 'REFUND OK?', t: money(-p.amount) + ' refund for ' + p.guestName, s: (p.note || 'Room ' + p.roomNo) + ' · ' + (p.byName || ''), go: "go('payments')" }); });
  var t = todayStr();
  S.data.stays.filter(function (s) { return s.status === 'reserved' && (s.checkInDate < t || (s.checkInDate === t && Date.now() > atTime(t, s.arrivalTime || S.settings.checkInTime) + (S.settings.holdHours || 3) * 3600000)); }).forEach(function (s) { out.push({ lvl: 'amber', tag: 'NO-SHOW?', t: s.guestName + ' has not arrived', s: 'Room ' + s.roomNo + ' held since ' + fmtDate(s.checkInDate) + '. Check in or release it.', go: "openStay('" + s.id + "')" }); });
  openIncidents().forEach(function (i) { out.push({ lvl: 'bad', tag: (i.type || 'ISSUE').replace('_', ' ').toUpperCase(), t: i.title, s: (i.byName || '') + ' · ' + fmtDT(i.at), go: "openIncident('" + i.id + "')" }); });
  pendingExpenses().forEach(function (e) { out.push({ lvl: 'amber', tag: 'APPROVE', t: (EXPENSE_CATS[e.category] || 'Expense') + ' ' + money(e.amount), s: (e.description || '') + ' · ' + (e.byName || ''), go: "openExpense('" + e.id + "')" }); });
  pendingDiscounts().forEach(function (s) { out.push({ lvl: 'amber', tag: 'DISCOUNT', t: money(s.discount) + ' off for ' + s.guestName, s: 'Room ' + s.roomNo + ' · ' + (s.discountReason || ''), go: "openStay('" + s.id + "')" }); });
  refundsDue().forEach(function (s) { out.push({ lvl: 'alert', tag: 'REFUND', t: 'Caution refund ' + money(s.cautionRefundDue) + ' due', s: s.guestName + ' · Room ' + s.roomNo, go: "openStay('" + s.id + "')" }); });
  S.data.rooms.filter(function (r) { return r.status === 'ooo'; }).forEach(function (r) { out.push({ lvl: 'grey', tag: 'REPAIR', t: 'Room ' + r.number + ' out of order', s: r.oooReason || '', go: "go('maintenance')" }); });
  openJobs().filter(function (j) { return Date.now() - j.createdAt > 3 * 86400000; }).forEach(function (j) { out.push({ lvl: 'grey', tag: 'OLD JOB', t: j.title, s: 'Open ' + ago(j.createdAt) + ' · ' + (j.location || ''), go: "openJob('" + j.id + "')" }); });
  serviceDue(7).forEach(function (a) { out.push({ lvl: 'grey', tag: 'SERVICE', t: a.name + ' service due', s: (a.location || '') + ' · due ' + fmtDate(nextService(a)), go: "go('maintenance',{tab:'schedule'})" }); });
  var low = lowStock();
  if (low.length === 1) out.push({ lvl: 'amber', tag: 'STOCK', t: low[0].name + ' low', s: low[0].qty + ' ' + (low[0].unit || '') + ' left · reorder at ' + low[0].reorderLevel, go: "go('inventory')" });
  else if (low.length > 1) out.push({ lvl: 'amber', tag: 'STOCK', t: low.length + ' store items low', s: low.slice(0, 4).map(function (i) { return i.name; }).join(', ') + (low.length > 4 ? '…' : ''), go: "go('inventory')" });
  return out;
}
function alertList(list, limit) {
  if (!list.length) return '<div class="note ok">All clear. Nothing needs attention.</div>';
  return list.slice(0, limit || 99).map(function (a) { return '<button type="button" class="alert-item ' + a.lvl + '" onclick="' + a.go + '"><span class="tag">' + esc(a.tag) + '</span><span><span class="t">' + esc(a.t) + '</span><span class="s">' + esc(a.s) + '</span></span></button>'; }).join('') + (list.length > (limit || 99) ? '<div class="muted">+ ' + (list.length - limit) + ' more</div>' : '');
}

/* =========================================================
   Navigation and rendering
   ========================================================= */
var NAV = [
  { id: 'today', label: 'Today', roles: ['admin', 'manager'] },
  { id: 'board', label: 'Room board', roles: ['manager', 'frontdesk'] },
  { id: 'shift', label: 'Shift', roles: ['manager', 'frontdesk'] },
  { id: 'stays', label: 'Stays', roles: ['manager', 'frontdesk'] },
  { id: 'payments', label: 'Payments', roles: ['manager', 'frontdesk'] },
  { id: 'housekeeping', label: 'Housekeeping', roles: ['manager', 'frontdesk', 'housekeeping', 'maintenance'] },
  { id: 'maintenance', label: 'Maintenance', roles: ['manager', 'frontdesk', 'housekeeping', 'maintenance'] },
  { id: 'inventory', label: 'Inventory', roles: ['manager', 'frontdesk'] },
  { id: 'expenses', label: 'Expenses', roles: ['manager', 'frontdesk'] },
  { id: 'reports', label: 'Reports', roles: ['manager'] },
  { id: 'admin', label: 'Admin settings', roles: [] }
];
var VIEWS = {}; // filled by front.js, ops.js, admin.js: { title, eyebrow?, render(), actions?() }

function canSee(id) { var n = NAV.find(function (x) { return x.id === id; }); if (!n) return true; return has.apply(null, n.roles); }
function defaultView() { if (isAdmin()) return 'today'; if (has('manager', 'frontdesk')) return 'board'; if (has('housekeeping')) return 'housekeeping'; return 'maintenance'; }
function go(view, params) { if (!canSee(view)) view = defaultView(); S.view = view; S.params = params || {}; if (params && params.tab) S.tab[view] = params.tab; if (view === 'reports') S.report = null; closeModal(); toggleMenu(false); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + view); } catch (e) {} render(); }
function setTab(view, tab) { S.tab[view] = tab; render(); }
function tabs(view, list) { var cur = S.tab[view] || list[0][0]; return '<div class="tabs" role="tablist">' + list.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (cur === t[0]) + '" class="tab' + (cur === t[0] ? ' active' : '') + '" onclick="setTab(\'' + view + '\',\'' + t[0] + '\')">' + esc(t[1]) + '</button>'; }).join('') + '</div>'; }
function curTab(view, def) { return S.tab[view] || def; }

var renderQueued = false;
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(function () { renderQueued = false; render(); }); }
function render() {
  if (!S.me || !S.view) return;
  var counts = { shift: (typeof handoverWaiting === 'function' && handoverWaiting() && !myOpenShift()) ? 1 : 0, payments: unconfirmedPayments().length, today: alerts().length, housekeeping: S.data.tasks.filter(function (t) { return t.status !== 'done' && (!has('manager', 'frontdesk') ? (!t.assignee || t.assignee === S.user.uid) : true); }).length, maintenance: openJobs().length };
  $('nav').innerHTML = NAV.filter(function (n) { return has.apply(null, n.roles); }).map(function (n) {
    var c = counts[n.id];
    return '<button type="button" class="nav-item' + (S.view === n.id ? ' active' : '') + '" onclick="go(\'' + n.id + '\')">' + icon(n.id) + '<span>' + n.label + '</span>' + (c ? '<span class="count">' + c + '</span>' : '') + '</button>';
  }).join('');
  var v = VIEWS[S.view]; if (!v) return;
  var now = new Date();
  $('pageEyebrow').textContent = (v.eyebrow ? v.eyebrow() : DOW[now.getDay()] + ', ' + now.getDate() + ' ' + MON[now.getMonth()]);
  $('pageTitle').textContent = typeof v.title === 'function' ? v.title() : v.title;
  $('topActions').innerHTML = v.actions ? v.actions() : '';
  var y = window.scrollY;
  var active = document.activeElement && document.activeElement.id;
  $('view').innerHTML = v.render();
  window.scrollTo(0, y);
  if (active && $(active) && $('view').contains($(active))) { var el = $(active); el.focus(); if (el.setSelectionRange && el.type === 'search') { var l = el.value.length; el.setSelectionRange(l, l); } }
  hydratePhotos($('view'));
  if (typeof afterRender === 'function') afterRender();
  document.title = (typeof v.title === 'function' ? v.title() : v.title) + ' · Wiwe';
}
function paintMe() {
  $('meBox').innerHTML = '<div class="avatar">' + esc(initials(S.me.name)) + '</div><div class="me-text"><strong>' + esc(S.me.name) + '</strong><span>' + esc((S.me.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + '</span></div>' +
    '<button class="icon-btn" type="button" aria-label="Change my password" title="Change my password" onclick="openMyPassword()">' + icon('key') + '</button>' +
    '<button class="icon-btn" type="button" aria-label="Sign out" title="Sign out" onclick="signOut()">' + icon('logout') + '</button>';
  paintDarkIcon();
}
function openMyPassword() {
  var b = '<form class="form" onsubmit="event.preventDefault();changeMyPassword()"><div class="note">Signed in as <strong>@' + esc(S.me.username) + '</strong></div><div class="fields">' +
    field('Current password', input('cp-old', '', 'type="password" required autocomplete="current-password"')) +
    field('New password', input('cp-new', '', 'type="password" required minlength="6" autocomplete="new-password"'), '', 'At least 6 characters') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" type="submit">Change password</button></div></form>';
  toggleMenu(false); openModal('Change my password', b);
}
async function changeMyPassword() {
  if (!validPassword(val('cp-new'))) return toast('Password must be at least 6 characters', true);
  try {
    var u = auth.currentUser;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, val('cp-old')));
    await u.updatePassword(val('cp-new')); audit('password_changed', 'user', S.user.uid, ''); closeModal(); toast('Password changed');
  } catch (e) { fail(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' ? new Error('Current password is wrong') : e); }
}

/* =========================================================
   Boot
   ========================================================= */
/* ---------- Onboarding: staff open their link and choose a password ---------- */
function onboardCodeFromUrl() { var m = (location.hash || '').match(/^#onboard=([a-z0-9]+)$/); return m ? m[1] : null; }
async function showOnboard(code) {
  $('boot').classList.add('hidden'); $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  var head = '<img class="login-photo" src="img/building.jpg" alt="Wiwe Apartments building"><img class="login-logo logo-img" src="img/logo.png" alt="Wiwe Apartments">';
  var inv = null;
  try { var d = await db.collection('invites').doc(code).get(); if (d.exists) inv = d.data(); } catch (e) {}
  if (!inv || inv.expires < Date.now()) {
    $('login').innerHTML = '<div class="login-card">' + head + '<h2>This link no longer works</h2><p class="muted">It has already been used or has expired. Ask the owner to send you a new one.</p><button class="btn block" type="button" onclick="leaveOnboard()">Go to sign in</button></div>';
    return;
  }
  S.invite = Object.assign({ code: code }, inv);
  $('login').innerHTML = '<div class="login-card">' + head +
    '<h2>Welcome, ' + esc(String(inv.name || '').split(' ')[0]) + '</h2>' +
    '<div class="note">Your username is <strong>' + esc(inv.username) + '</strong>. You\'ll use it to sign in.</div>' +
    '<form class="form" onsubmit="event.preventDefault();finishOnboard()">' +
    field('Choose a password', input('ob-pw', '', 'type="password" required minlength="6" autocomplete="new-password"'), '', 'At least 6 characters. Don\'t share it with anyone.') +
    field('Type it again', input('ob-pw2', '', 'type="password" required minlength="6" autocomplete="new-password"')) +
    '<button class="btn primary block" type="submit" id="ob-btn">Set password and sign in</button></form></div>';
}
async function finishOnboard() {
  var pw = val('ob-pw'), inv = S.invite;
  if (!validPassword(pw)) return toast('Password must be at least 6 characters', true);
  if (pw !== val('ob-pw2')) return toast('The two passwords don\'t match', true);
  $('ob-btn').disabled = true; $('ob-btn').textContent = 'Setting up…';
  S.onboarding = true;
  try {
    if (auth.currentUser) await auth.signOut();
    var cred = await auth.signInWithEmailAndPassword(inv.email, inv.temp);
    await cred.user.updatePassword(pw);
    await db.collection('users').doc(inv.uid).update({ onboarded: true, onboardedAt: Date.now(), inviteCode: FV.delete() });
    await db.collection('invites').doc(inv.code).delete();
    S.onboarding = false; S.invite = null;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    location.reload();
  } catch (e) {
    S.onboarding = false; $('ob-btn').disabled = false; $('ob-btn').textContent = 'Set password and sign in';
    toast('Could not finish setup. Ask the owner for a new link.', true); console.error(e);
  }
}
function leaveOnboard() { try { history.replaceState(null, '', location.pathname); } catch (e) {} location.reload(); }

function boot() {
  if (!CONFIGURED) return showLogin('config');
  var obCode = onboardCodeFromUrl();
  if (obCode) showOnboard(obCode);
  auth.onAuthStateChanged(async function (user) {
    if (S.onboarding || onboardCodeFromUrl()) return;
    S.user = user;
    if (!user) { S.me = null; stopListeners(); return checkSetupOrLogin(); }
    var tries = 0, snap;
    while (tries < 5) { try { snap = await db.collection('users').doc(user.uid).get(); if (snap.exists) break; } catch (e) {} tries++; await new Promise(function (r) { setTimeout(r, 600); }); }
    if (!snap || !snap.exists || snap.data().active === false) { await auth.signOut(); return showLogin('login', 'This login is no longer active (handed over, reset or disabled). Ask the owner.'); }
    S.me = Object.assign({ id: user.uid }, snap.data());
    S.unsub.push(db.collection('users').doc(user.uid).onSnapshot(function (d) { if (d.exists) { S.me = Object.assign({ id: user.uid }, d.data()); if (S.me.active === false) auth.signOut(); paintMe(); scheduleRender(); } }));
    $('boot').classList.add('hidden'); $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    paintMe(); startListeners();
    var h = (location.hash || '').replace('#', '');
    go(VIEWS[h] && canSee(h) ? h : defaultView());
    setTimeout(ensureDailyTasks, 4000);
    setTimeout(function () { if (typeof purgeOldIdPhotos === 'function') purgeOldIdPhotos(); }, 8000);
    setTimeout(function () { if (typeof checkRules === 'function') checkRules(); }, 2500);
  });
}
async function checkSetupOrLogin() {
  try { var s = await db.collection('meta').doc('setup').get(); showLogin(s.exists ? 'login' : 'setup'); }
  catch (e) { showLogin('login'); }
}
setInterval(function () { if (S.me) scheduleRender(); }, 60000);
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () {});
document.addEventListener('DOMContentLoaded', boot);
