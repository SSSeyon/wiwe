const APP_VERSION = '3.1.0';

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
// Guests pay by POS (or bank transfer for deposits paid from far away). Cash is not accepted.
const PAY_METHODS = { pos: 'POS', transfer: 'Bank transfer' };
const PAY_LABEL = { pos: 'POS', transfer: 'Bank transfer', cash: 'Cash' }; // "cash" only on old records
const SOURCES = { walkin: 'Walk-in', phone: 'Phone / WhatsApp', returning: 'Returning guest', referral: 'Agent / referral', airbnb: 'Airbnb', booking: 'Booking.com', other: 'Other' };
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
  requireId: false,
  idPhotoMonths: 6,
  linenItems: ['Bedsheets', 'Pillowcases', 'Duvet covers', 'Bath towels', 'Hand towels'],
  dailySteps: ['Make bed', 'Empty bins', 'Tidy bathroom, replace towels if asked', 'Top up water and toiletries', 'Sweep floor']
};

/* =========================================================
   Firebase
   ========================================================= */
let db, auth, FV;
const CONFIGURED = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('YOUR_') !== 0;
const SDK_OK = typeof firebase !== 'undefined'; // false when the Firebase files could not be loaded (no network, nothing cached)
if (CONFIGURED && SDK_OK) {
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
  data: { rooms: [], roomTypes: [], stays: [], payments: [], tasks: [], jobs: [], assets: [], vendors: [], items: [], moves: [], expenses: [], incidents: [], users: [], laundry: [], shifts: [], oldUnconfirmed: [], oldPending: [], debtors: [] },
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  shirt: '<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  home: '<path d="M3 11l9-8 9 8M5 9v12h14V9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
function icon(name, size) { return '<svg aria-hidden="true" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'; }

/* =========================================================
   UI primitives: toast, modal, menu, dark mode
   ========================================================= */
/* Toast: a short message. Pass an action ({ label, fn }) for an Undo button; it then stays up longer. */
var toastTimer, toastAct = null;
function toast(msg, bad, action) {
  var t = $('toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-act" onclick="toastAction()">' + esc(action.label || 'Undo') + '</button>' : '');
  toastAct = action || null; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; toastAct = null; }, action ? 7000 : 3200);
}
function toastAction() { var a = toastAct; toastAct = null; $('toast').className = 'toast'; if (a && a.fn) a.fn(); }function fail(e) { console.error(e); var m = (e && e.message) || String(e); if (m.indexOf('permission') >= 0 || m.indexOf('PERMISSION') >= 0) { if (typeof isAdmin === 'function' && isAdmin()) { if (typeof checkRules === 'function') checkRules().then(function () { if (S.rulesOutdated) openRulesHelp(); }); m = 'Refused by the database security rules. Checking whether they need updating…'; } else m = 'You do not have permission to do that.'; } toast(m, true); }
/* Pop-up. On phones it is a bottom sheet. Focus stays inside while it is open and goes back to
   the button that opened it when it closes. */
var modalReturn = null;
function openModal(title, body, wide) {
  if ($('modal').classList.contains('hidden')) modalReturn = document.activeElement;
  $('modalTitle').textContent = title; $('modalBody').innerHTML = body; $('modalBody').scrollTop = 0;
  $('modalCard').className = 'modal-card' + (wide ? ' wide' : '');
  $('modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; document.body.classList.add('modal-open');
  hydratePhotos($('modalBody')); labelTables($('modalBody')); moneyFields($('modalBody')); onePrimary([$('modalBody')]);
  if (typeof restoreDraft === 'function') setTimeout(restoreDraft, 0);
  var f = $('modalBody').querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea');
  setTimeout(function () { if (f && window.innerWidth > 700) f.focus(); else $('modalCard').querySelector('.modal-head .icon-btn').focus({ preventScroll: true }); }, 50);
}
function closeModal() {
  if (window.draftOnClose) draftOnClose();
  var wasOpen = !$('modal').classList.contains('hidden');
  $('modal').classList.add('hidden'); document.body.style.overflow = ''; document.body.classList.remove('modal-open'); S.form = {};
  if (wasOpen && modalReturn && document.contains(modalReturn) && modalReturn.focus) modalReturn.focus({ preventScroll: true });
  modalReturn = null;
}
// Keep Tab inside an open dialog or pop-up
function focusables(box) { return Array.prototype.filter.call(box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'), function (el) { return el.offsetParent !== null && !el.closest('.invis'); }); }
function trapTab(e, box) {
  var f = focusables(box); if (!f.length) return;
  var first = f[0], last = f[f.length - 1], a = document.activeElement;
  if (e.shiftKey && (a === first || !box.contains(a))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', function (e) {
  if (dialogOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(false); }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); closeDialog(true); }
    else if (e.key === 'Tab') trapTab(e, $('dialog'));
    return;
  }
  if ($('modal').classList.contains('hidden')) return;
  if (e.key === 'Escape') closeModal();
  else if (e.key === 'Tab') trapTab(e, $('modalCard'));
});

/* In-app dialog in place of the browser's confirm() and prompt(). Both return a promise.
   ask({ title, text, ok, cancel, danger })            → true / false
   askText({ title, text, label, ok, value, danger })  → the text typed, or null if cancelled */
var dlg = { resolve: null, input: false, ret: null };
function dialogOpen() { return !!dlg.resolve; }
function ask(o) { return openDialog(typeof o === 'string' ? { text: o } : o, false); }
function askText(o) { return openDialog(typeof o === 'string' ? { title: o } : o, true); }
function openDialog(o, withInput) {
  return new Promise(function (resolve) {
    if (dlg.resolve) dlg.resolve(dlg.input ? null : false);
    dlg.resolve = resolve; dlg.input = withInput; if (!dlg.ret) dlg.ret = document.activeElement;
    var d = $('dialog');
    d.innerHTML = '<div class="dialog-card" role="alertdialog" aria-modal="true"' + (o.title ? ' aria-labelledby="dlg-t"' : '') + (o.text ? ' aria-describedby="dlg-x"' : '') + '>' +
      (o.title ? '<h2 id="dlg-t">' + esc(o.title) + '</h2>' : '') +
      (o.text ? '<p id="dlg-x" class="dlg-text">' + esc(o.text).replace(/\n/g, '<br>') + '</p>' : '') +
      (withInput ? '<label class="field">' + esc(o.label || 'Reason') + '<input id="dlg-in" value="' + esc(o.value || '') + '" autocomplete="off" oninput="this.classList.remove(\'invalid\')"></label>' : '') +
      '<div class="dlg-actions"><button type="button" class="btn" onclick="closeDialog(false)">' + esc(o.cancel || 'Cancel') + '</button>' +
      '<button type="button" class="btn ' + (o.danger ? 'danger-solid' : 'primary') + '" id="dlg-ok" onclick="closeDialog(true)">' + esc(o.ok || 'OK') + '</button></div></div>';
    d.classList.remove('hidden');
    d.onclick = function (e) { if (e.target === d) closeDialog(false); };
    setTimeout(function () { var f = $('dlg-in') || $('dlg-ok'); if (f) f.focus(); }, 30);
  });
}
function closeDialog(ok) {
  var r = dlg.resolve; if (!r) return;
  var v = null;
  if (dlg.input && ok) { v = val('dlg-in'); if (!v) { $('dlg-in').classList.add('invalid'); $('dlg-in').focus(); return; } }
  var input = dlg.input, ret = dlg.ret;
  dlg.resolve = null; dlg.ret = null; $('dialog').classList.add('hidden'); $('dialog').innerHTML = '';
  if (ret && document.contains(ret) && ret.focus) ret.focus({ preventScroll: true });
  r(input ? (ok ? v : null) : !!ok);
}

/* Money boxes: any field whose label says ₦ gets a ₦ in front and thousands separators as you type.
   num() ignores the commas, so the rest of the app reads them as before. */
function fmtThousands(v) { var s = String(v == null ? '' : v).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function setMoney(id, n) { var el = $(id); if (el) el.value = n ? fmtThousands(Math.round(Number(n) || 0)) : ''; }
function moneyFields(root) {
  if (!root) return;
  root.querySelectorAll('label.field').forEach(function (lab) {
    var inp = lab.querySelector('input'), tn = lab.firstChild;
    if (!inp || inp.classList.contains('money-in') || inp.type === 'number' || inp.type === 'date' || inp.readOnly && !inp.id) return;
    if (!tn || tn.nodeType !== 3 || tn.nodeValue.indexOf('₦') < 0) return;
    tn.nodeValue = tn.nodeValue.replace(/\s*\(₦\)/, '').replace('(₦, ', '(');
    inp.classList.add('money-in'); inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('autocomplete', 'off');
    var w = document.createElement('span'); w.className = 'money-wrap'; w.innerHTML = '<span class="cur" aria-hidden="true">₦</span>';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    if (inp.value) { inp.value = fmtThousands(inp.value); inp.defaultValue = inp.value; }
  });
}
document.addEventListener('input', function (e) {
  var el = e.target; if (!el.classList || !el.classList.contains('money-in')) return;
  var pos = el.selectionStart || 0, digitsBefore = el.value.slice(0, pos).replace(/[^0-9]/g, '').length, f = fmtThousands(el.value);
  if (f === el.value) return;
  el.value = f;
  var i = 0, n = 0; while (i < f.length && n < digitsBefore) { if (/\d/.test(f[i])) n++; i++; }
  try { el.setSelectionRange(i, i); } catch (x) {}
}, true);

/* One main (filled) button per screen: the first one wins, later ones become plain buttons.
   Buttons in a form's own Save row and small buttons in lists are left alone. */
function onePrimary(roots) {
  var seen = false;
  roots.forEach(function (root) {
    if (!root) return;
    root.querySelectorAll('.btn.primary:not(.small)').forEach(function (b) {
      if (b.closest('.form-actions, .step-bar, .dlg-actions')) return;
      if (seen) b.classList.remove('primary'); seen = true;
    });
  });
}

/* A form split into its fieldsets, one per screen, with Back / Next and a bar pinned at the bottom
   (used for check-in on phones). opts: { finish: label of the last button, amount: id of the total to show } */
function stepForm(form, opts) {
  var sets = Array.prototype.filter.call(form.children, function (c) { return c.matches('fieldset.group'); });
  if (sets.length < 2) return;
  form.classList.add('stepped'); $('modalCard').classList.add('full');
  var head = document.createElement('div'); head.className = 'steps-head'; form.insertBefore(head, form.firstChild);
  var bar = document.createElement('div'); bar.className = 'step-bar';
  bar.innerHTML = '<div class="collect"><span>' + esc(opts.amountLabel || 'Collect now') + '</span><strong id="sb-amt">—</strong></div>' +
    '<button type="button" class="btn" id="sb-back">Back</button><button type="button" class="btn primary" id="sb-next">Next</button>';
  form.appendChild(bar);
  var i = 0;
  function name(fs) { var l = fs.querySelector('legend'); return l ? l.textContent.replace(/^\s*\d+\s*·\s*/, '') : ''; }
  function show(n) {
    i = Math.max(0, Math.min(sets.length - 1, n));
    sets.forEach(function (f, k) { f.classList.toggle('cur', k === i); });
    form.classList.toggle('last', i === sets.length - 1);
    head.innerHTML = '<div class="steps-dots" aria-hidden="true">' + sets.map(function (f, k) { return '<span' + (k <= i ? ' class="on"' : '') + '></span>'; }).join('') + '</div>' +
      '<div class="steps-label" aria-live="polite">Step ' + (i + 1) + ' of ' + sets.length + ' · ' + esc(name(sets[i])) + '</div>';
    $('sb-back').classList.toggle('invis', i === 0);
    $('sb-next').textContent = i === sets.length - 1 ? (opts.finish || 'Save') : 'Next';
    $('modalBody').scrollTop = 0;
  }
  function stepValid() {
    var bad = Array.prototype.find.call(sets[i].querySelectorAll('input,select,textarea'), function (el) { return !el.checkValidity(); });
    if (bad) { bad.reportValidity(); return false; } return true;
  }
  $('sb-back').onclick = function () { show(i - 1); };
  $('sb-next').onclick = function () { if (!stepValid()) return; if (i < sets.length - 1) show(i + 1); else if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); };
  form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); $('sb-next').click(); } });
  show(0);
}

/* Friendly empty state: what belongs here, and a button to add it */
function emptyState(ic, title, text, btnLabel, btnJs, inline) {
  return '<div class="' + (inline ? 'empty-state inline' : 'card empty-state') + '"><span class="es-icon">' + icon(ic || 'list', 22) + '</span><strong>' + esc(title) + '</strong>' +
    (text ? '<p>' + esc(text) + '</p>' : '') + (btnLabel ? '<button type="button" class="btn primary" onclick="' + btnJs + '">' + esc(btnLabel) + '</button>' : '') + '</div>';
}
/* A record in a list: line 1 the main thing (amount, guest), line 2 the details, line 3 who and when.
   o: { l1, l2, l3 (HTML, already escaped), extra, side, click } */
function recRow(o) {
  return '<div class="rec' + (o.click ? ' clickable" onclick="' + o.click : '') + '"><span class="rec-main"><span class="rec-l1">' + o.l1 + '</span>' +
    (o.l2 ? '<span class="rec-l2">' + o.l2 + '</span>' : '') + (o.l3 ? '<span class="rec-l3">' + o.l3 + '</span>' : '') + (o.extra || '') + '</span>' +
    (o.side ? '<span class="rec-side">' + o.side + '</span>' : '') + '</div>';
}
function dots(parts) { return parts.filter(function (x) { return x != null && x !== ''; }).map(esc).join(' · '); }
/* Grey placeholders while something loads */
function skeleton(lines, stats) { var h = ''; if (stats) { h += '<div class="skel-stats" aria-hidden="true">'; for (var s = 0; s < stats; s++) h += '<i></i>'; h += '</div>'; } h += '<div class="skel" role="status" aria-label="Loading">'; for (var i = 0; i < (lines || 4); i++) h += '<i></i>'; return h + '</div>'; }document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal(); });
var THEMES = { colour: '#4F46E5', mono: '#FFFFFF', cream: '#F4E6B8' };
var THEME_NAMES = { colour: 'Colourful', mono: 'Black & white', cream: 'Black & cream' };
function curTheme() { return document.body.getAttribute('data-theme') || 'colour'; }
function toggleDark() { var on = !document.body.classList.contains('dark-mode'); document.body.classList.toggle('dark-mode', on); try { localStorage.setItem('wiwe_dark', on ? '1' : '0'); } catch (e) {} paintDarkIcon(); if (S.view === 'account') render(); }
function toggleThemeMenu(open) { var m = $('themeMenu'); if (!m) return; var show = open === undefined ? m.classList.contains('hidden') : open; m.classList.toggle('hidden', !show); $('themeCurrent').setAttribute('aria-expanded', String(show)); }
document.addEventListener('click', function (e) { var p = $('themePick'); if (p && !p.contains(e.target)) toggleThemeMenu(false); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleThemeMenu(false); });
function setTheme(t) { if (!THEMES[t]) t = 'colour'; document.body.setAttribute('data-theme', t); try { localStorage.setItem('wiwe_theme', t); } catch (e) {} toggleThemeMenu(false); paintDarkIcon(); if (S.view === 'account') render(); }
function setTextSize(z) { document.documentElement.setAttribute('data-size', z); try { localStorage.setItem('wiwe_size', z); } catch (e) {} if (S.view === 'account') render(); }
function paintDarkIcon() {
  var dark = document.body.classList.contains('dark-mode'), t = curTheme();
  var el = $('darkIcon'); if (el) el.textContent = dark ? '🌙' : '☀️'; // shows the CURRENT mode, like the Apowo app
  var sw = $('darkSwitch'); if (sw) { var lbl = dark ? 'Dark mode on. Switch to light mode' : 'Light mode on. Switch to dark mode'; sw.setAttribute('aria-label', lbl); sw.title = lbl; }
  var cur = $('themeCurrent'); if (cur) { cur.className = 'sw sw-current sw-' + t; cur.title = 'Colour scheme: ' + THEME_NAMES[t]; }
  document.querySelectorAll('.tm-opt').forEach(function (b) { var on = b.getAttribute('data-t') === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#121212' : THEMES[t]);
}
(function () { var t = 'colour', d = false, z = 'normal'; try { t = localStorage.getItem('wiwe_theme') || 'colour'; var sd = localStorage.getItem('wiwe_dark'); d = sd === null ? !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) : sd === '1'; z = localStorage.getItem('wiwe_size') || 'normal'; } catch (e) {} document.body.setAttribute('data-theme', THEMES[t] ? t : 'colour'); document.documentElement.setAttribute('data-size', z); if (d) document.body.classList.add('dark-mode'); document.addEventListener('DOMContentLoaded', paintDarkIcon); })();

/* A button that opens a short list of actions: keeps headers to one or two buttons. items: [[label, onclickJs], ...] */
function actionMenu(label, items, primary) {
  return '<details class="act-menu"><summary class="btn' + (primary ? ' primary' : '') + '">' + esc(label) + ' <span aria-hidden="true">▾</span></summary><div class="act-list" role="menu">' +
    items.map(function (i) { return '<button type="button" role="menuitem" class="act-item" onclick="this.closest(\'details\').open=false;' + i[1] + '">' + esc(i[0]) + '</button>'; }).join('') + '</div></details>';
}
document.addEventListener('click', function (e) { document.querySelectorAll('details.act-menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });
/* Payment method radios that start on the method this device used last */
function lastPayMethod() { try { var m = localStorage.getItem('wiwe_paymethod'); return PAY_METHODS[m] ? m : 'pos'; } catch (e) { return 'pos'; } }
function rememberPayMethod(m) { if (PAY_METHODS[m]) try { localStorage.setItem('wiwe_paymethod', m); } catch (e) {} }
function payChoices(name, extra) { var d = lastPayMethod(); return '<div class="choices" role="radiogroup" aria-label="Payment method">' + Object.keys(PAY_METHODS).map(function (k) { return '<label class="choice"><input type="radio" name="' + name + '" value="' + k + '"' + (k === d ? ' checked' : '') + (extra || '') + '>' + PAY_METHODS[k] + '</label>'; }).join(''); }
/* Fill an amount box with the amount due, unless the user has typed in it */
function prefillAmount(id, amount) { var a = $(id); if (a && !a.dataset.touched) a.value = amount > 0 ? (a.classList.contains('money-in') ? fmtThousands(Math.round(amount)) : amount) : ''; }
/* A card that folds open and shut; remembers its state while the app is open */
function foldOpen(key, def) { S.fold = S.fold || {}; return key in S.fold ? S.fold[key] : !!def; }
function fold(key, title, body, def, extra) { return '<details class="card fold" data-k="' + key + '"' + (foldOpen(key, def) ? ' open' : '') + ' ontoggle="S.fold=S.fold||{};S.fold[this.dataset.k]=this.open"><summary><h2>' + esc(title) + '</h2>' + (extra || '') + '</summary><div class="fold-body">' + body + '</div></details>'; }
/* Second row of small tabs inside a tab (e.g. Inventory → More) */
function subTabs(key, list) { var cur = S.tab[key] || list[0][0]; return '<div class="subtabs" role="tablist">' + list.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (cur === t[0]) + '" class="subtab' + (cur === t[0] ? ' on' : '') + '" onclick="setTab(\'' + key + '\',\'' + t[0] + '\')">' + esc(t[1]) + '</button>'; }).join('') + '</div>'; }

/* Little icons on the cards inside each section. Each heading has its icon set here (or with
   data-icon on the heading); headings that start with a name ("Handover from …") match by their start. */
var CARD_ICONS = {
  'Needs attention': 'alert', 'Leak watch and approvals': 'alert', 'Leak indicators': 'alert', 'Waiting approval': 'alert', 'Refunds to approve': 'alert',
  'Arrivals and departures': 'calendar', 'Today': 'calendar', 'Next 30 days': 'calendar',
  'Occupied': 'building', 'Occupancy': 'reports', 'Occupancy now': 'building', 'Rooms out of order': 'building', '2 · Rooms (shown on the Room board)': 'building', '1 · Room types (price categories)': 'tag',
  'Guests owing': 'stays', 'Guests owing now': 'stays', 'Where guests came from': 'stays',
  'Recorded today': 'payments', 'By POS today': 'payments', 'Payments recorded today': 'payments', 'Income': 'reports', 'Net': 'reports', 'Yesterday': 'reports', 'Last 6 months': 'reports', 'By room': 'building',
  'Expenses': 'expenses', 'Total spent': 'expenses', 'Diesel': 'expenses', 'Expenses by category': 'expenses', 'By category': 'expenses', 'Repair spend this month': 'expenses',
  'Yesterday in brief': 'clipboard', 'Recent activity': 'list', 'Last 300 actions': 'list',
  'Your shift': 'shift', 'No shift open': 'shift', 'Recent shifts': 'shift', 'Handover from': 'shift',
  'To do': 'housekeeping', 'In progress': 'housekeeping', 'Waiting inspection': 'housekeeping', 'Waiting for inspection': 'housekeeping', 'Done today': 'housekeeping', 'My tasks in progress': 'housekeeping', 'Others in progress': 'housekeeping', 'Sent for inspection': 'housekeeping', 'Checklist': 'housekeeping', 'Inspection': 'housekeeping', 'Turnover cleaning': 'housekeeping',
  'Photos': 'camera', 'Restocked from store': 'inventory',
  'Open jobs': 'maintenance', 'Open': 'maintenance', 'Recently closed': 'maintenance', 'Fixed · waiting for you to check': 'maintenance', 'Check the repair': 'maintenance', 'Service due (7 days)': 'maintenance',
  'To reorder': 'inventory', 'Sales this month': 'tag',
  'Batches out': 'shirt', 'Pieces out': 'shirt', 'Missing this month': 'shirt', 'At the laundry': 'shirt', 'Returned': 'shirt',
  'Staff accounts': 'users', 'Previous holders and disabled accounts': 'users', 'Change admin code': 'admin', 'My password': 'key', 'Backup': 'download',
  'Appearance (this device)': 'gear', 'Guests and money': 'payments', 'Places': 'building', 'Cleaning checklists': 'housekeeping', 'Laundry': 'shirt', 'Guest privacy': 'camera'
};
function cardIconFor(h) {
  if (h.dataset && h.dataset.icon) return h.dataset.icon;
  var t = (h.textContent || '').trim();
  if (CARD_ICONS[t]) return CARD_ICONS[t];
  for (var k in CARD_ICONS) if (t.indexOf(k + ' ') === 0) return CARD_ICONS[k];
  return ICONS[S.view] && S.view !== 'today' ? S.view : 'dot';
}/* On phones, tables turn into two-line rows; each cell needs its column name to show beside it */
/* Rows that open something when tapped can also be reached and opened with the keyboard */
function keyRows(root) { root.querySelectorAll('.clickable[onclick]:not([tabindex])').forEach(function (el) { el.setAttribute('tabindex', '0'); if (el.tagName !== 'TR') el.setAttribute('role', 'button'); }); }
document.addEventListener('keydown', function (e) { var t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('clickable') && t.hasAttribute('onclick')) { e.preventDefault(); t.click(); } });
function labelTables(root) {
  if (!root) return;
  keyRows(root);
  root.querySelectorAll('table:not(.cal)').forEach(function (t) {
    var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    if (!heads.length || t.closest('.rcpt')) return;
    t.classList.add('stackable');
    t.querySelectorAll('tbody tr').forEach(function (tr) { Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i]) td.setAttribute('data-label', heads[i]); }); });
  });
}
function decorateCards(root) {
  if (!root) return;
  labelTables(root);
  root.querySelectorAll('.card h2, .stat .label').forEach(function (h) {
    if (h.querySelector('.ci') || h.closest('.home-grid')) return;
    var name = cardIconFor(h);
    h.insertAdjacentHTML('afterbegin', '<span class="ci ci-' + name + '" aria-hidden="true">' + icon(name, h.tagName === 'H2' ? 15 : 13) + '</span>');
  });
}

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
function thumbs(ids) { return (ids || []).map(function (id) { return '<img class="thumb" alt="Photo" data-photo="' + esc(id) + '" onclick="viewPhoto(\'' + esc(id) + '\')"' + (S.photoCache[id] ? ' src="' + esc(S.photoCache[id]) + '"' : '') + '>'; }).join(''); }
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
  var w = window.open(); if (w) { w.document.write('<title>Photo</title><body style="margin:0;background:#111;display:flex;justify-content:center"><img src="' + esc(d) + '" style="max-width:100%;max-height:100vh"></body>'); }
}

/* =========================================================
   Audit log (write-only for staff)
   ========================================================= */
// Pass the batch of the action being logged so the log entry and the action are saved together or not at all
function audit(action, entity, entityId, details, batch) {
  if (!db || !S.user) return;
  var row = Object.assign({ action: action, entity: entity, entityId: entityId || '', details: details || '' }, stamp());
  if (batch) batch.set(db.collection('audit').doc(), row);
  else db.collection('audit').add(row).catch(function () {});
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
  var head = '<img class="login-photo" src="img/building.jpg" alt="Wiwe Apartments building, Sowhe, Badagry"><img class="login-logo logo-img" src="img/logo.png" alt="Wiwe Apartments"><div class="muted login-sub">Operations</div>';
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
  } catch (e) { showLogin('login', navigator.onLine === false || (e && (e.code === 'unavailable' || e.code === 'auth/network-request-failed')) ? 'No internet connection. Connect and try again.' : 'Wrong username or password.'); }
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

async function signOut() { if (!(await ask({ title: 'Sign out?', text: 'You will need your username and password to come back in.', ok: 'Sign out' }))) return; stopListeners(); S.adminUntil = 0; await auth.signOut(); }

/* =========================================================
   Live data
   ========================================================= */
/* Records are cleaned as they arrive, so a number field can never carry text into the page
   and a record id can never carry code into a button. */
var NUM_KEYS = {}; 'qty nights amount total paid balance rate discount caution deposit reorderLevel unitCost sellPrice litres genHours serviceDays cost extras order cautionRefundDue cautionDeductions cautionApplied price short expected found guests at createdAt'.split(' ').forEach(function (k) { NUM_KEYS[k] = 1; });
function clean(v, k) {
  if (Array.isArray(v)) return v.map(function (x) { return clean(x); });
  if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (key) { o[key] = clean(v[key], key); }); return o; }
  if (k && NUM_KEYS[k] && typeof v !== 'number' && v != null && v !== '') return Number(v) || 0;
  return v;
}
function docRows(snap) { return snap.docs.filter(function (d) { return /^[\w-]+$/.test(d.id); }).map(function (d) { return clean(Object.assign({ id: d.id }, d.data())); }); }
function stopListeners() { S.unsub.forEach(function (u) { try { u(); } catch (e) {} }); S.unsub = []; S.meta = {}; }
function listen(key, query, sortKey) {
  var u = query.onSnapshot({ includeMetadataChanges: true }, function (snap) {
    var rows = docRows(snap);
    if (sortKey) rows.sort(function (a, b) { return (b[sortKey] || 0) > (a[sortKey] || 0) ? 1 : (b[sortKey] || 0) < (a[sortKey] || 0) ? -1 : 0; });
    S.data[key] = rows;
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
// How far back the app keeps stays, payments, stock moves and expenses in memory.
// Older records stay in the database: Reports reads any month, and Backup exports everything.
var RECENT_DAYS = 90;
function startListeners() {
  stopListeners();
  var c = function (n) { return db.collection(n); }, since = Date.now() - RECENT_DAYS * 86400000, sinceDay = addDays(todayStr(), -RECENT_DAYS);
  listen('rooms', c('rooms'));
  listen('roomTypes', c('roomTypes'));
  listen('users', c('users'));
  listen('items', c('items'));
  listen('assets', c('assets'));
  listen('vendors', c('vendors'));
  // every stay still in the house or booked ahead, plus the last 90 days of history
  listen('stays', c('stays').where('checkOutDate', '>=', sinceDay), 'createdAt');
  listen('payments', c('payments').where('at', '>=', since).orderBy('at', 'desc'));
  listen('tasks', c('tasks').orderBy('createdAt', 'desc').limit(300));
  listen('jobs', c('jobs').orderBy('createdAt', 'desc').limit(300));
  listen('moves', c('moves').where('at', '>=', since).orderBy('at', 'desc'));
  listen('expenses', c('expenses').where('at', '>=', since).orderBy('at', 'desc'));
  listen('incidents', c('incidents').orderBy('at', 'desc').limit(200));
  listen('laundry', c('laundry').orderBy('sentAt', 'desc').limit(100));
  if (has('manager', 'frontdesk')) {
    listen('shifts', c('shifts').orderBy('openedAt', 'desc').limit(60));
    // anything still waiting for the owner never drops out, however old
    listen('oldUnconfirmed', c('payments').where('status', '==', 'unconfirmed').limit(100));
    listen('debtors', c('stays').where('balance', '>', 0));
    listen('oldPending', c('expenses').where('status', '==', 'pending').limit(100));
  }
  S.unsub.push(c('settings').doc('general').onSnapshot(function (d) { if (d.exists) S.settings = Object.assign({}, DEFAULT_SETTINGS, clean(d.data())); scheduleRender(); }));
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
function mergeById(a, b) { var seen = {}; return a.concat(b).filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; }); }
function pendingExpenses() { return mergeById(S.data.expenses, S.data.oldPending || []).filter(function (e) { return e.status === 'pending'; }); }
// Payments are final as soon as they are recorded. Only refunds wait for the owner.
function allPayments() { return mergeById(S.data.payments, S.data.oldUnconfirmed || []); }
function refundsWaiting() { return allPayments().filter(function (p) { return p.status === 'unconfirmed' && p.amount < 0; }); }
function payCounts(p) { return p.status !== 'void' && p.status !== 'rejected' && !(p.status === 'unconfirmed' && p.amount < 0); }
function allStays() { return mergeById(S.data.stays, S.data.debtors || []); }
function findStay(id) { return byId(S.data.stays, id) || byId(S.data.debtors || [], id); }
function findPayment(id) { return byId(allPayments(), id); }
function debtors() { return allStays().filter(function (s) { return (s.balance || 0) > 0 && (s.status === 'checked_in' || s.status === 'checked_out'); }); }
function refundsDue() { return S.data.stays.filter(function (s) { return s.cautionStatus === 'refund_due'; }); }
function pendingDiscounts() { return S.data.stays.filter(function (s) { return s.discountStatus === 'pending' && s.status !== 'cancelled'; }); }
function openIncidents() { return S.data.incidents.filter(function (i) { return !i.resolved; }); }
function needsApproval(amount) { return Number(amount) > Number(S.settings.approvalLimit || 0); }

// One list of things that need attention, for the room board and the owner's Today screen
function alerts() {
  var out = [];
  if (S.rulesOutdated) out.push({ lvl: 'bad', tag: 'SETUP', t: 'Security rules need updating', s: 'Some actions are being refused. Tap for the 1-minute fix.', go: 'openRulesHelp()' });
  S.data.stays.filter(isOverstay).forEach(function (s) { out.push({ lvl: 'bad', tag: 'OVERSTAY', t: 'Room ' + s.roomNo + ' past check-out', s: s.guestName + ' was due out ' + fmtDate(s.checkOutDate) + '. Extend or check out.', go: "openStay('" + s.id + "')" }); });
  refundsWaiting().forEach(function (p) { out.push({ lvl: 'amber', tag: 'REFUND OK?', t: money(-p.amount) + ' refund for ' + p.guestName, s: (p.note || 'Room ' + p.roomNo) + ' · ' + (p.byName || ''), go: "go('payments',{tab:'refunds'})" }); });
  debtors().filter(function (s) { return s.status === 'checked_out'; }).forEach(function (s) { out.push({ lvl: 'alert', tag: 'OWES', t: s.guestName + ' left owing ' + money(s.balance), s: 'Room ' + s.roomNo + ' · checked out ' + fmtDate(s.checkOutDate), go: "openStay('" + s.id + "')" }); });  var t = todayStr();
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
  { id: 'today', label: 'Today', desc: 'Alerts and the daily summary', roles: ['admin', 'manager'] },
  { id: 'board', label: 'Room board', desc: 'Every room and its status', roles: ['manager', 'frontdesk'] },
  { id: 'shift', label: 'Shift', desc: 'Start, close and hand over', roles: ['manager', 'frontdesk'] },
  { id: 'stays', label: 'Stays', desc: 'Guests, reservations, calendar', roles: ['manager', 'frontdesk'] },
  { id: 'payments', label: 'Payments', desc: 'Every payment and refund', roles: ['manager', 'frontdesk'] },
  { id: 'housekeeping', label: 'Housekeeping', desc: 'Cleaning tasks and laundry', roles: ['manager', 'frontdesk', 'housekeeping', 'maintenance'] },
  { id: 'maintenance', label: 'Maintenance', desc: 'Faults, repairs and assets', roles: ['manager', 'frontdesk', 'housekeeping', 'maintenance'] },
  { id: 'inventory', label: 'Inventory', desc: 'Supplies and items for sale', roles: ['manager', 'frontdesk'] },
  { id: 'expenses', label: 'Expenses', desc: 'Spending and approvals', roles: ['manager', 'frontdesk'] },
  { id: 'reports', label: 'Reports', desc: 'Money and occupancy', roles: ['manager'] },
  { id: 'admin', label: 'Admin settings', desc: 'Rooms, staff, codes, backup', roles: [] }
];
var VIEWS = {}; // filled by front.js, ops.js, admin.js: { title, eyebrow?, render(), actions?() }

function canSee(id) { var n = NAV.find(function (x) { return x.id === id; }); if (!n) return true; return has.apply(null, n.roles); }
function defaultView() { return 'home'; }
function go(view, params) { if (!VIEWS[view] || !canSee(view)) view = defaultView(); S.view = view; S.params = params || {}; if (params && params.tab) S.tab[view] = params.tab; if (view === 'reports') S.report = null; viewDirty = false; closeModal(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + view); } catch (e) {} render(); }
function navCounts() { return { shift: (typeof handoverWaiting === 'function' && handoverWaiting() && !myOpenShift()) ? 1 : 0, payments: isAdmin() ? refundsWaiting().length : 0, today: alerts().length, housekeeping: S.data.tasks.filter(function (t) { return t.status !== 'done' && (!has('manager', 'frontdesk') ? (!t.assignee || t.assignee === S.user.uid) : true); }).length, maintenance: openJobs().length }; }
/* The jobs each role does most, one tap away (Home on big screens, the + button on phones) */
function quickActions() {
  var a = [], desk = has('manager', 'frontdesk');
  if (isAdmin() && refundsWaiting().length) a.push(['Approve refunds', 'payments', "go('payments',{tab:'refunds'})"]);
  if (desk) { a.push(['Check in guest', 'stays', 'openCheckIn()']); a.push(['New reservation', 'calendar', 'openReservation()']); a.push(['Record sale', 'tag', 'openSell()']); }
  if (!desk && has('housekeeping')) a.push(['My cleaning tasks', 'housekeeping', "go('housekeeping')"]);
  if (!desk && has('maintenance')) a.push(['Open jobs', 'maintenance', "go('maintenance')"]);
  a.push(['Report an issue', 'alert', 'openReport()']);
  if (desk) a.push(['Add expense', 'expenses', "go('expenses');openExpenseForm()"]);
  return a.slice(0, 5);
}
function quickRow() { return '<div class="quick-row">' + quickActions().map(function (q) { return '<button type="button" class="quick-btn" onclick="' + q[2] + '">' + icon(q[1], 18) + '<span>' + esc(q[0]) + '</span></button>'; }).join('') + '</div>'; }
/* Phone bottom bar: Home · my main section · + quick actions · Me */
function mainSection() { return has('manager', 'frontdesk') ? 'board' : has('housekeeping') ? 'housekeeping' : 'maintenance'; }
function paintBottomBar() {
  var bb = $('bottomBar'); if (!bb || !S.me) return;
  var ms = mainSection(), n = NAV.find(function (x) { return x.id === ms; }), v = S.view;
  var tab = function (id, ic, label) { return '<button type="button" class="bb-tab' + (v === id ? ' on' : '') + '" onclick="toggleQuick(false);go(\'' + id + '\')"' + (v === id ? ' aria-current="page"' : '') + '>' + icon(ic, 21) + '<span>' + label + '</span></button>'; };
  bb.innerHTML = tab('home', 'home', 'Home') + tab(ms, ms, n ? n.label.replace('Room board', 'Rooms') : '') +
    '<button type="button" class="bb-tab bb-plus" id="bbPlus" aria-expanded="false" aria-controls="quickSheet" onclick="toggleQuick()"><span class="bb-plus-ring">' + icon('plus', 22) + '</span><span>Do</span></button>' +
    tab('account', 'users', 'Me');
  $('quickSheet').innerHTML = quickActions().map(function (q) { return '<button type="button" class="qs-item" onclick="toggleQuick(false);' + q[2] + '">' + icon(q[1], 18) + '<span>' + esc(q[0]) + '</span></button>'; }).join('');
}
function toggleQuick(open) { var s = $('quickSheet'); if (!s) return; var show = open === undefined ? s.classList.contains('hidden') : open; s.classList.toggle('hidden', !show); var p = $('bbPlus'); if (p) p.setAttribute('aria-expanded', String(show)); }
document.addEventListener('click', function (e) { var s = $('quickSheet'); if (s && !s.classList.contains('hidden') && !s.contains(e.target) && !(e.target.closest && e.target.closest('#bbPlus'))) toggleQuick(false); });
var COUNT_WORD = { shift: 'handover waiting', payments: 'refund to approve', today: 'alert', housekeeping: 'open', maintenance: 'open' };
VIEWS.home = {
  title: function () { var h = new Date().getHours(); return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + ', ' + String((S.me && S.me.name) || '').split(' ')[0]; },
  render: function () {
    var c = navCounts();
    return quickRow() + '<div class="home-grid">' + NAV.filter(function (n) { return has.apply(null, n.roles); }).map(function (n) {
      var k = c[n.id], w = COUNT_WORD[n.id] || '';
      return '<button type="button" class="home-card hc-' + n.id + '" onclick="go(\'' + n.id + '\')">' +
        '<span class="hc-icon">' + icon(n.id, 22) + '</span>' +
        '<span class="hc-text"><strong>' + esc(n.label) + '</strong><span>' + esc(n.desc) + '</span></span>' +
        (k ? '<span class="hc-count" title="' + k + ' ' + w + '">' + k + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
};
/* Phones: Home cards share out the whole screen between the title and the bottom bar, so they are as big as possible with no scrolling */
function fitHome() {
  var g = document.querySelector('.home-grid'); if (!g) return;
  if (window.innerWidth > 860) { g.style.height = ''; g.removeAttribute('data-cols'); return; }
  var n = g.children.length, bb = $('bottomBar'), bottom = bb && bb.offsetHeight ? bb.getBoundingClientRect().top : window.innerHeight;
  g.setAttribute('data-cols', n <= 6 ? 2 : 3);
  g.style.height = Math.max(0, Math.floor(bottom - g.getBoundingClientRect().top - 12)) + 'px';
}
window.addEventListener('resize', function () { if (S.view === 'home') fitHome(); });
function setTab(view, tab) { S.tab[view] = tab; render(); }
function tabs(view, list) { var cur = S.tab[view] || list[0][0]; return '<div class="tabs" role="tablist">' + list.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (cur === t[0]) + '" class="tab' + (cur === t[0] ? ' active' : '') + '" onclick="setTab(\'' + view + '\',\'' + t[0] + '\')">' + esc(t[1]) + '</button>'; }).join('') + '</div>'; }
function curTab(view, def) { return S.tab[view] || def; }

// Half-typed settings on a page (not a pop-up) must not be wiped when fresh data arrives or the minute ticks over
var renderQueued = false, viewDirty = false;
document.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('#view form')) viewDirty = true; }, true);
function scheduleRender() { if (renderQueued || viewDirty) return; renderQueued = true; requestAnimationFrame(function () { renderQueued = false; render(); }); }
function render() {
  if (!S.me || !S.view) return;
  var v = VIEWS[S.view]; if (!v) return;
  viewDirty = false;
  document.body.setAttribute('data-view', S.view);
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
  decorateCards($('view'));
  moneyFields($('view'));
  onePrimary([$('topActions'), $('view')]);
  paintBottomBar();
  if (S.view === 'home') fitHome();
  if (typeof afterRender === 'function') afterRender();
  document.title = (typeof v.title === 'function' ? v.title() : v.title) + ' · Wiwe';
}
function paintMe() {
  $('meBox').innerHTML = '<button type="button" class="me-btn" onclick="go(\'account\')" title="My account and settings" aria-label="My account and settings, ' + esc(S.me.name) + '"><span class="avatar">' + esc(initials(S.me.name)) + '</span><span class="me-text"><strong>' + esc(S.me.name) + '</strong><span>' + esc((S.me.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + '</span></span></button>';
  paintDarkIcon();
}
/* ---------- My account: settings for the signed-in person ---------- */
function startPage() { try { return localStorage.getItem('wiwe_start') || 'home'; } catch (e) { return 'home'; } }
function setStartPage(v) { try { localStorage.setItem('wiwe_start', v); } catch (e) {} toast('Saved for this device'); }
function checkForUpdate() { toast('Checking for a new version…'); if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); setTimeout(function () { location.reload(); }, 1200); }); else location.reload(); }
VIEWS.account = {
  title: 'My account',
  eyebrow: function () { return '@' + (S.me.username || ''); },
  render: function () {
    var me = S.me, t = curTheme(), dark = document.body.classList.contains('dark-mode'), z = document.documentElement.getAttribute('data-size') || 'normal';
    var opt = function (on, click, label, extra) { return '<button type="button" class="acct-opt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="' + click + '">' + (extra || '') + esc(label) + '</button>'; };
    var mine = NAV.filter(function (n) { return has.apply(null, n.roles); });
    var h = '<div class="acct-col">';
    h += '<div class="card"><div class="acct-head"><span class="avatar big">' + esc(initials(me.name)) + '</span><div class="main-t"><strong>' + esc(me.name) + '</strong><span>@' + esc(me.username || '') + ' · ' + esc((me.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + (me.phone ? ' · ' + esc(me.phone) : '') + '</span></div></div>' +
      '<div class="acct-opts mt-3"><button class="btn" type="button" onclick="openMyPassword()">' + icon('key') + 'Change password</button>' +
      '<button class="btn danger" type="button" onclick="signOut()">' + icon('logout') + 'Sign out</button>' +
      (isAdmin() ? '<button class="btn" type="button" onclick="go(\'admin\')">' + icon('admin') + 'Admin settings</button>' : '') + '</div>' +
      '<div class="muted mt-2">' + (isAdmin() ? 'Change names, roles and usernames in Admin settings → Staff.' : 'To change your name, role or username, or if you forget your password, ask the owner.') + '</div></div>';
    h += '<div class="card"><h2>Appearance (this device)</h2>' +
      '<div class="field">Colour scheme<div class="acct-opts">' + ['colour', 'mono', 'cream'].map(function (k) { return opt(t === k, "setTheme('" + k + "')", THEME_NAMES[k], '<span class="sw sw-' + k + '"></span>'); }).join('') + '</div></div>' +
      '<div class="acct-two"><div class="field">Dark mode<div class="acct-opts">' + opt(!dark, dark ? 'toggleDark()' : '', 'Off', icon('sun', 16)) + opt(dark, dark ? '' : 'toggleDark()', 'On', icon('moon', 16)) + '</div></div>' +
      '<div class="field">Text size<div class="acct-opts">' + [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']].map(function (s) { return opt(z === s[0], "setTextSize('" + s[0] + "')", s[1]); }).join('') + '</div></div></div>' +
      '<label class="field">Open the app on<select onchange="setStartPage(this.value)"><option value="home">Home</option>' + mine.map(function (n) { return '<option value="' + n.id + '"' + (startPage() === n.id ? ' selected' : '') + '>' + esc(n.label) + '</option>'; }).join('') + '</select></label></div>';
    h += '<div class="acct-foot muted">Wiwe app version ' + esc(APP_VERSION) + ' · <button class="linkish" type="button" onclick="checkForUpdate()">Check for update</button></div>';
    return h + '</div>';
  }
};
function openMyPassword() {
  var b = '<form class="form" onsubmit="event.preventDefault();changeMyPassword()"><div class="note">Signed in as <strong>@' + esc(S.me.username) + '</strong></div><div class="fields">' +
    field('Current password', input('cp-old', '', 'type="password" required autocomplete="current-password"')) +
    field('New password', input('cp-new', '', 'type="password" required minlength="6" autocomplete="new-password"'), '', 'At least 6 characters') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" type="submit">Change password</button></div></form>';
  openModal('Change my password', b);
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
  if (!SDK_OK) { $('boot').innerHTML = '<img class="logo-img" src="img/logo.png" alt="Wiwe Apartments" width="120"><span>Could not load the app. Check the internet connection.</span><button class="btn primary" type="button" onclick="location.reload()">Try again</button>'; return; }
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
    var sp = startPage(); go(VIEWS[h] && canSee(h) ? h : (VIEWS[sp] && canSee(sp) ? sp : defaultView()));
    setTimeout(ensureDailyTasks, 4000);
    setTimeout(function () { if (typeof purgeOldIdPhotos === 'function') purgeOldIdPhotos(); }, 8000);
    setTimeout(function () { if (typeof checkRules === 'function') checkRules(); }, 2500);
  });
}
async function checkSetupOrLogin() {
  try { var s = await db.collection('meta').doc('setup').get(); showLogin(s.exists ? 'login' : 'setup'); }
  catch (e) { showLogin('login'); }
}
setInterval(function () { if (!S.me) return; if (S.dailyDay && S.dailyDay !== todayStr()) ensureDailyTasks(); scheduleRender(); }, 60000);
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () {});
document.addEventListener('DOMContentLoaded', boot);
