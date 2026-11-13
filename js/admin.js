/* =========================================================
   OWNER: Today, Reports, Admin settings (code-locked)
   ========================================================= */

/* ---------- Today ---------- */
VIEWS.today = {
  title: function () { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; },
  render: function () {
    var t = todayStr(), y = addDays(t, -1);
    function money4(day) {
      var p = allPayments().filter(function (x) { return dateStr(new Date(x.at)) === day && x.amount > 0 && payCounts(x); });
      var e = S.data.expenses.filter(function (x) { return dateStr(new Date(x.at)) === day && x.status !== 'rejected' && x.status !== 'void'; });
      var by = function (m) { return sum(p.filter(function (x) { return x.method === m; }), function (x) { return x.amount; }); };
      return { list: p, exp: sum(p, function (x) { return x.amount; }), pos: by('pos'), transfer: by('transfer'), spent: sum(e, function (x) { return x.amount; }) };
    }
    var td = money4(t), yd = money4(y), rooms = roomsSorted(), occ = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
    var al = alerts(), owe = debtors();
    var html = '<section class="grid-stats">' +
      '<div class="stat dark"><span class="label">Recorded today</span><span class="value">' + money(td.exp) + '</span><span class="sub">' + money(td.pos) + ' POS · ' + money(td.transfer) + ' transfer</span></div>' +
      stat('Yesterday', money(yd.exp), money(yd.pos) + ' POS · ' + money(yd.spent) + ' spent') +
      stat('Occupancy now', occ + ' / ' + rooms.length, Math.round(occ / Math.max(1, rooms.length) * 100) + '%') +
      stat('Guests owing', money(sum(owe, function (s) { return s.balance; })), owe.length + ' stay' + (owe.length === 1 ? '' : 's') + ' · ' + money(td.spent) + ' spent today', owe.length ? 'warn' : '') + '</section>';
    html += '<div class="split"><div class="wide"><div class="card"><h2>Leak watch and approvals</h2><div class="stack">' + alertList(al) + '</div></div>' +
      '<div class="card"><div class="card-head"><h2>Payments recorded today</h2><button class="btn small" type="button" onclick="go(\'payments\')">See all</button></div>' +
      (td.list.length ? '<div class="note" style="margin-bottom:8px">Compare the POS figure with the end-of-day total on the terminal: ' + money(td.pos) + ' from ' + td.list.filter(function (x) { return x.method === 'pos'; }).length + ' slip(s).</div>' + td.list.map(paymentRow).join('') : '<div class="muted">Nothing recorded yet today.</div>') + '</div></div>' +
      '<div class="narrow">' + dailySummaryCard() +
      '<div class="card"><div class="card-head"><h2>Recent activity</h2><button class="btn small" type="button" onclick="go(\'admin\',{tab:\'audit\'})">See all</button></div><div id="today-audit" class="muted">Loading…</div></div></div></div>';    setTimeout(loadRecentAudit, 0);
    return html;
  }
};
var auditCache = { at: 0, html: '' };
function loadRecentAudit() {
  var box = $('today-audit'); if (!box) return;
  if (Date.now() - auditCache.at < 60000 && auditCache.html) { box.innerHTML = auditCache.html; return; }
  db.collection('audit').orderBy('at', 'desc').limit(5).get().then(function (s) {
    auditCache = { at: Date.now(), html: s.docs.length ? s.docs.map(function (d) { var a = d.data(); return '<div class="list-row"><span class="main-t"><strong>' + esc(a.action.replace(/_/g, ' ')) + '</strong><span>' + esc(a.details || '') + ' · ' + esc(a.byName || '') + ', ' + fmtTime(a.at) + '</span></span></div>'; }).join('') : 'Nothing yet.' };
    var b = $('today-audit'); if (b) b.innerHTML = auditCache.html;
  }).catch(function () { var b = $('today-audit'); if (b) b.textContent = 'Not available.'; });
}

/* ---------- Reports ---------- */
VIEWS.reports = {
  title: 'Reports',
  render: function () {
    var month = S.params.month || todayStr().slice(0, 7);
    if (S.report && S.report.month === month) return reportHtml(S.report);
    if (S.reportLoading !== month) loadReport(month);
    return monthPicker(month) + '<div class="card empty">Loading ' + esc(month) + '…</div>';
  }
};
function monthPicker(m) { return '<div class="row between"><label class="field" style="flex-direction:row;align-items:center">Month <input type="month" value="' + m + '" onchange="S.params.month=this.value;S.report=null;render()" style="width:auto"></label><div class="row"><button class="btn small" type="button" onclick="S.report=null;render()">Refresh</button>' + actionMenu('Export', [['Payments (CSV)', "exportCsv('payments')"], ['Expenses (CSV)', "exportCsv('expenses')"]]) + '</div></div>'; }
async function loadReport(month) {
  var start = parseDate(month + '-01').getTime(), endD = parseDate(month + '-01'); endD.setMonth(endD.getMonth() + 1); var end = endD.getTime();
  var first = month + '-01', last = dateStr(new Date(end - 86400000)), days = daysBetween(first, last) + 1;
  S.reportLoading = month;
  try {
    var r = await Promise.all([
      db.collection('payments').where('at', '>=', start).where('at', '<', end).get(),
      db.collection('expenses').where('at', '>=', start).where('at', '<', end).get(),
      db.collection('stays').where('checkOutDate', '>=', first).get(),
      db.collection('moves').where('at', '>=', start).where('at', '<', end).get(),
      db.collection('jobs').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);
    var docs = docRows;
    S.report = { month: month, start: start, end: end, first: first, last: last, days: days, payments: docs(r[0]), expenses: docs(r[1]), stays: docs(r[2]).filter(function (s) { return (s.status === 'checked_in' || s.status === 'checked_out') && s.checkInDate <= last; }), moves: docs(r[3]), jobs: docs(r[4]) };
    S.reportLoading = null;
    if (S.view === 'reports') render();
  } catch (e) { S.reportLoading = null; fail(e); }
}
var ROOM_KINDS = ['room', 'extension', 'balance', 'deposit', 'damage', 'refund_early', 'refund_deposit']; // money for rooms, less refunds of it
function nightsIn(s, first, next) { var a = s.checkInDate > first ? s.checkInDate : first, b = s.checkOutDate < next ? s.checkOutDate : next; return Math.max(0, daysBetween(a, b)); }
function reportHtml(R) {
  var rooms = roomsSorted(), pays = R.payments.filter(payCounts), next = addDays(R.last, 1);
  var roomPays = pays.filter(function (p) { return ROOM_KINDS.indexOf(p.kind) >= 0; });
  var roomRev = sum(roomPays, function (p) { return p.amount; }), salesRev = sum(pays.filter(function (p) { return p.kind === 'sale'; }), function (p) { return p.amount; });
  var outs = R.stays.filter(function (s) { return s.checkedOutAt >= R.start && s.checkedOutAt < R.end; });
  var cautionKept = sum(outs, function (s) { return (s.cautionDeductions || 0) + (s.cautionApplied || 0); });
  var revenue = roomRev + salesRev + cautionKept;
  var exps = R.expenses.filter(function (e) { return e.status !== 'rejected' && e.status !== 'void'; }), spent = sum(exps, function (e) { return e.amount; });
  var nightsByRoom = {}, sold = 0;
  R.stays.forEach(function (s) { var n = nightsIn(s, R.first, next); sold += n; nightsByRoom[s.roomNo] = (nightsByRoom[s.roomNo] || 0) + n; });
  var avail = rooms.length * R.days, occ = avail ? sold / avail : 0, adr = sold ? roomRev / sold : 0;
  var revByRoom = {}; roomPays.forEach(function (p) { revByRoom[p.roomNo] = (revByRoom[p.roomNo] || 0) + p.amount; });
  var repByRoom = {}; exps.filter(function (e) { return e.category === 'repairs' && e.location && e.location.indexOf('room:') === 0; }).forEach(function (e) { var l = locLabel(e.location).replace('Room ', ''); repByRoom[l] = (repByRoom[l] || 0) + e.amount; });
  var cats = {}; exps.forEach(function (e) { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  var maxC = Math.max.apply(null, Object.keys(cats).map(function (k) { return cats[k]; }).concat([1]));
  var issued = R.moves.filter(function (m) { return m.type === 'issue'; }), shortfall = R.moves.filter(function (m) { return m.type === 'count' && m.qty < 0; });
  var diesel = exps.filter(function (e) { return e.category === 'diesel'; });
  var voids = R.payments.filter(function (p) { return p.status === 'void'; }), refunds = pays.filter(function (p) { return p.amount < 0; });
  var dups = R.payments.filter(function (p) { return dupOf(p); }).length;
  // where guests came from: stays that started this month
  var src = {}; R.stays.filter(function (s) { return s.checkInDate >= R.first; }).forEach(function (s) { var k = s.source || 'unknown'; src[k] = src[k] || { n: 0, nights: 0 }; src[k].n++; src[k].nights += s.nights || 0; });
  var maxS = Math.max.apply(null, Object.keys(src).map(function (k) { return src[k].n; }).concat([1]));
  // the next 30 days already on the books
  var t = todayStr(), t30 = addDays(t, 30), ahead = sum(S.data.stays.filter(function (s) { return s.status === 'reserved' || s.status === 'checked_in'; }), function (s) { return nightsIn(s, t, t30); });
  var owe = debtors();
  var cleans = S.data.tasks.filter(function (k) { return k.type === 'turnover' && k.startedAt && k.finishedAt && k.finishedAt >= R.start && k.finishedAt < R.end && k.finishedAt > k.startedAt; });
  var cleanMin = cleans.length ? Math.round(sum(cleans, function (k) { return k.finishedAt - k.startedAt; }) / cleans.length / 60000) : 0;
  var row = function (label, value) { return '<div class="list-row"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'; };
  var html = monthPicker(R.month) + '<section class="grid-stats">' +
    '<div class="stat dark"><span class="label">Income</span><span class="value">' + money(revenue) + '</span><span class="sub">' + money(roomRev) + ' rooms · ' + money(salesRev) + ' item sales' + (cautionKept ? ' · ' + money(cautionKept) + ' caution kept' : '') + '</span></div>' +
    stat('Expenses', money(spent), exps.length + ' records') + stat('Net', money(revenue - spent), revenue ? Math.round((revenue - spent) / revenue * 100) + '% margin' : '', revenue - spent < 0 ? 'warn' : '') +
    stat('Occupancy', Math.round(occ * 100) + '%', sold + ' of ' + avail + ' room-nights · ' + money(adr) + ' average room rate') + '</section>' +
    '<section class="grid-stats">' +
    stat('Next 30 days', Math.round(ahead / Math.max(1, rooms.length * 30) * 100) + '% booked', ahead + ' of ' + rooms.length * 30 + ' room-nights already on the books') +
    stat('Guests owing now', money(sum(owe, function (s) { return s.balance; })), owe.length + ' stay' + (owe.length === 1 ? '' : 's'), owe.length ? 'warn' : '') +
    stat('Turnover cleaning', cleans.length ? cleanMin + ' min' : '—', cleans.length ? 'Average over ' + cleans.length + ' room' + (cleans.length === 1 ? '' : 's') : 'No finished cleans this month') + '</section>';
  html += '<div class="split"><div class="wide"><details class="card fold"><summary><h2>By room</h2><span class="muted">Income per room per night: <strong>' + money(avail ? roomRev / avail : 0) + '</strong></span></summary><div class="table-wrap"><table><thead><tr><th>Room</th><th class="right">Nights</th><th class="right">Occupancy</th><th class="right">Income</th><th class="right">Repairs</th></tr></thead><tbody>' +
    rooms.map(function (r) { var n = nightsByRoom[r.number] || 0; return '<tr><td><strong>' + esc(r.number) + '</strong> <span class="muted small">' + esc(roomType(r).name) + '</span></td><td class="right">' + n + '</td><td class="right">' + Math.round(n / R.days * 100) + '%</td><td class="right money">' + money(revByRoom[r.number] || 0) + '</td><td class="right money">' + money(repByRoom[r.number] || 0) + '</td></tr>'; }).join('') + '</tbody></table></div></details>' +
    '<div class="card"><h2>Where guests came from</h2>' + (Object.keys(src).length ? '<div class="bars">' + Object.keys(src).sort(function (a, b) { return src[b].n - src[a].n; }).map(function (k) { return '<div class="bar-row"><span>' + esc(SOURCES[k] || 'Not recorded') + '</span><span class="bar-track"><span style="width:' + Math.round(src[k].n / maxS * 100) + '%"></span></span><span class="right">' + src[k].n + ' stay' + (src[k].n === 1 ? '' : 's') + ' · ' + src[k].nights + ' nights</span></div>'; }).join('') + '</div>' : '<div class="muted">No stays started this month.</div>') + '</div>' +
    trendCard() + '</div>' +
    '<div class="narrow"><div class="card"><h2>Expenses by category</h2>' + (Object.keys(cats).length ? '<div class="bars">' + Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) { return '<div class="bar-row"><span>' + esc(EXPENSE_CATS[k] || k) + '</span><span class="bar-track"><span style="width:' + Math.round(cats[k] / maxC * 100) + '%"></span></span><span class="right money">' + money(cats[k]) + '</span></div>'; }).join('') + '</div>' : '<div class="muted">No expenses.</div>') + '</div>' +
    '<div class="card"><h2>Leak indicators</h2>' +
    row('Store items issued per night sold', sold ? (-sum(issued, function (m) { return m.qty; }) / sold).toFixed(1) : '—') +
    row('Stock count shortfalls', shortfall.length) +
    row('Payments voided', voids.length + ' · ' + money(sum(voids, function (p) { return p.amount; }))) +
    row('Payments sharing a reference', dups) +
    row('Refunds paid', refunds.length + ' · ' + money(-sum(refunds, function (p) { return p.amount; }))) +
    row('Checked out still owing', money(sum(outs, function (s) { return Math.max(0, s.balance || 0); }))) +
    row('Discounts given', money(sum(R.stays.filter(function (s) { return s.discountStatus === 'approved' && s.checkInDate >= R.first; }), function (s) { return s.discount; }))) +
    row('Diesel', sum(diesel, function (e) { return e.litres; }) + ' L · ' + money(sum(diesel, function (e) { return e.amount; }))) +
    row('Repair jobs opened', R.jobs.length) +
    '</div></div></div>';
  return html;
}
/* Six months side by side. Read on request only, because it costs extra database reads. */
function trendCard() {
  if (!S.trend) return '<div class="card"><div class="card-head"><h2>Last 6 months</h2><button class="btn small" type="button"' + (S.trendLoading ? ' disabled' : '') + ' onclick="loadTrend()">' + (S.trendLoading ? 'Loading…' : 'Show') + '</button></div><div class="muted">Income, spending and occupancy month by month.</div></div>';
  var max = Math.max.apply(null, S.trend.map(function (m) { return m.rev; }).concat([1]));
  return '<div class="card"><div class="card-head"><h2>Last 6 months</h2><button class="btn small" type="button" onclick="S.trend=null;loadTrend()">Refresh</button></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>Income</th><th class="right">Income</th><th class="right">Spent</th><th class="right">Net</th><th class="right">Occupancy</th></tr></thead><tbody>' +
    S.trend.map(function (m) { return '<tr><td><strong>' + esc(m.label) + '</strong></td><td style="min-width:90px"><span class="bar-track" style="display:block"><span style="display:block;width:' + Math.round(m.rev / max * 100) + '%"></span></span></td><td class="right money">' + money(m.rev) + '</td><td class="right money">' + money(m.spent) + '</td><td class="right money">' + money(m.rev - m.spent) + '</td><td class="right">' + Math.round(m.occ * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div></div>';
}
async function loadTrend() {
  if (S.trendLoading) return;
  S.trendLoading = true; render();
  var end = parseDate(todayStr().slice(0, 7) + '-01'); end.setMonth(end.getMonth() + 1);
  var start = new Date(end.getTime()); start.setMonth(start.getMonth() - 6);
  try {
    var r = await Promise.all([
      db.collection('payments').where('at', '>=', start.getTime()).where('at', '<', end.getTime()).get(),
      db.collection('expenses').where('at', '>=', start.getTime()).where('at', '<', end.getTime()).get(),
      db.collection('stays').where('checkOutDate', '>=', dateStr(start)).get()
    ]);
    var pays = docRows(r[0]).filter(function (p) { return payCounts(p) && (ROOM_KINDS.indexOf(p.kind) >= 0 || p.kind === 'sale'); });
    var exps = docRows(r[1]).filter(function (e) { return e.status !== 'rejected' && e.status !== 'void'; });
    var stays = docRows(r[2]).filter(function (s) { return s.status === 'checked_in' || s.status === 'checked_out'; });
    var nRooms = Math.max(1, roomsSorted().length), rows = [];
    for (var i = 0; i < 6; i++) {
      var a = new Date(start.getTime()); a.setMonth(a.getMonth() + i); var b = new Date(a.getTime()); b.setMonth(b.getMonth() + 1);
      var first = dateStr(a), next = dateStr(b), inM = function (x) { return x.at >= a.getTime() && x.at < b.getTime(); };
      var kept = sum(stays.filter(function (s) { return s.checkedOutAt >= a.getTime() && s.checkedOutAt < b.getTime(); }), function (s) { return (s.cautionDeductions || 0) + (s.cautionApplied || 0); });
      rows.push({ label: MON[a.getMonth()] + ' ' + a.getFullYear(), rev: sum(pays.filter(inM), function (p) { return p.amount; }) + kept, spent: sum(exps.filter(inM), function (e) { return e.amount; }), occ: sum(stays, function (s) { return nightsIn(s, first, next); }) / (nRooms * daysBetween(first, next)) });
    }
    S.trend = rows;
  } catch (e) { fail(e); }
  S.trendLoading = false;
  if (S.view === 'reports') render();
}function exportCsv(kind) {
  var R = S.report; if (!R) return toast('Load a month first', true);
  var rows = kind === 'payments'
    ? [['Date', 'Room', 'Guest', 'Kind', 'Method', 'Sender', 'Reference', 'Amount', 'Status', 'Recorded by']].concat(R.payments.map(function (p) { return [fmtDT(p.at), p.roomNo, p.guestName, PAY_KIND[p.kind] || p.kind, PAY_LABEL[p.method] || p.method, p.sender, p.ref, p.amount, p.status === 'void' ? 'void' : p.status === 'rejected' ? 'refused' : p.status === 'unconfirmed' && p.amount < 0 ? 'refund waiting' : 'recorded', p.byName]; }))
    : [['Date', 'Category', 'Description', 'Paid to', 'Amount', 'Litres', 'Status', 'Recorded by']].concat(R.expenses.map(function (e) { return [fmtDT(e.at), EXPENSE_CATS[e.category] || e.category, e.description, e.paidTo, e.amount, e.litres || '', e.status, e.byName]; }));
  var csv = rows.map(function (r) { return r.map(function (c) { var isNum = typeof c === 'number'; c = String(c == null ? '' : c); if (!isNum && /^[=+\-@]/.test(c)) c = "'" + c; /* a spreadsheet must not run a guest's name as a formula */ return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'wiwe-' + kind + '-' + R.month + '.csv'; a.click();
}

/* ---------- Admin settings (behind the admin code) ---------- */
var pinEntry = '';
function adminLocked() { return !isAdmin() || Date.now() > S.adminUntil; }
function lockout() { try { return JSON.parse(localStorage.getItem('wiwe_lock') || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } }
function setLockout(o) { try { localStorage.setItem('wiwe_lock', JSON.stringify(o)); } catch (e) {} }
VIEWS.admin = {
  title: 'Admin settings',
  actions: function () { return adminLocked() ? '' : '<button class="btn" type="button" onclick="S.adminUntil=0;render()">Lock</button>'; },
  render: function () {
    if (!isAdmin()) return '<div class="card empty">Only the owner can open admin settings.</div>';
    if (adminLocked()) return pinScreen();
    S.adminUntil = Date.now() + 10 * 60000;
    var tab = curTab('admin', 'general');
    var html = tabs('admin', [['general', 'General'], ['rooms', 'Rooms and rates'], ['staff', 'Staff'], ['security', 'Codes'], ['audit', 'Activity log'], ['data', 'Backup']]);
    if (tab === 'general') html += adminGeneral();
    if (tab === 'rooms') html += adminRooms();
    if (tab === 'staff') html += adminStaff();
    if (tab === 'security') html += adminSecurity();
    if (tab === 'audit') { html += '<div class="card" id="audit-box"><div class="muted">Loading…</div></div>'; setTimeout(loadAudit, 0); }
    if (tab === 'data') html += '<div class="card"><h2>Backup</h2><p class="muted">Downloads everything (except photos) as one JSON file. Do this monthly and keep it safe.</p><button class="btn primary" type="button" onclick="backup()">Download backup</button></div>';
    return html;
  }
};
function pinScreen() {
  var lo = lockout(), locked = lo.until > Date.now();
  var dots = ''; for (var i = 0; i < 6; i++) dots += '<span class="' + (i < pinEntry.length ? 'on' : '') + '"></span>';
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return '<div class="pin-screen"><div class="logo-mark">' + icon('admin', 20) + '</div><h2>Admin settings</h2><span style="color:var(--side-text);font-size:14px">' + (locked ? 'Too many wrong tries. Try again at ' + fmtTime(lo.until) + '.' : 'Enter your 6-digit admin code.') + '</span>' +
    '<div class="pin-dots" role="img" aria-label="' + pinEntry.length + ' of 6 digits entered">' + dots + '</div>' +
    '<div class="pad">' + keys.map(function (k) { return k === '' ? '<button type="button" class="blank" tabindex="-1" aria-hidden="true"></button>' : '<button type="button"' + (locked ? ' disabled' : '') + ' aria-label="' + (k === '⌫' ? 'Delete digit' : 'Digit ' + k) + '" onclick="pinKey(\'' + k + '\')">' + k + '</button>'; }).join('') + '</div>' +
    '<span style="color:var(--side-dim);font-size:12px">Locks again after 10 minutes. 5 wrong tries locks it for an hour.</span></div>';
}
async function pinKey(k) {
  if (k === '⌫') pinEntry = pinEntry.slice(0, -1); else if (pinEntry.length < 6) pinEntry += k;
  render();
  if (pinEntry.length < 6) return;
  var code = pinEntry; pinEntry = '';
  try {
    var s = await db.collection('settings').doc('security').get();
    var ok = s.exists && s.data().codeHash === await sha256(code + '|wiwe-admin');
    var lo = lockout();
    if (ok) { setLockout({ n: 0, until: 0 }); S.adminUntil = Date.now() + 10 * 60000; audit('admin_unlock', 'settings', '', ''); }
    else { lo.n = (lo.n || 0) + 1; if (lo.n >= 5) { lo.until = Date.now() + 3600000; lo.n = 0; } setLockout(lo); toast('Wrong code', true); }
  } catch (e) { fail(e); }
  render();
}
document.addEventListener('keydown', function (e) { if (S.view === 'admin' && adminLocked() && $('modal').classList.contains('hidden')) { if (/^[0-9]$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('⌫'); } });

function adminGeneral() {
  var s = S.settings;
  return '<form class="form" onsubmit="event.preventDefault();saveGeneral()"><div class="note">Tap a section to open it. One Save button at the bottom saves all of them.</div>' +
    fold('g-money', 'Guests and money', '<div class="fields">' +
    '<label class="check" style="grid-column:1/-1"><input type="checkbox" id="g-caution"' + (s.cautionEnabled ? ' checked' : '') + '>Collect a refundable caution fee at check-in</label>' +
    field('Caution fee (₦)', input('g-camt', s.cautionAmount, 'inputmode="numeric"')) +
    field('Check-in time', input('g-in', s.checkInTime, 'type="time"')) + field('Check-out time', input('g-out', s.checkOutTime, 'type="time"')) +
    field('Hold reservations for (hours)', input('g-hold', s.holdHours, 'type="number" min="0"'), '', 'After the expected arrival time') +
    field('Approval needed above (₦)', input('g-limit', s.approvalLimit, 'inputmode="numeric"'), '', 'Expenses and purchases above this wait for you') +
    '<label class="check" style="grid-column:1/-1"><input type="checkbox" id="g-reqid"' + (s.requireId ? ' checked' : '') + '>Check-in needs an ID number or a photo of the ID</label>' +
    '</div>', true) +
    fold('g-places', 'Places', field('Common areas (one per line)', '<textarea id="g-areas">' + esc((s.commonAreas || []).join('\n')) + '</textarea>', '', 'Used for maintenance and assets, e.g. Generator house, Reception')) +
    fold('g-clean', 'Cleaning checklists', '<div class="fields">' + field('Turnover (after check-out)', '<textarea id="g-turn" rows="10">' + esc((s.turnoverSteps || []).join('\n')) + '</textarea>', '', 'One step per line. Steps with the word "kitchen" only show for kitchen rooms.') +
    field('Daily service (guest staying)', '<textarea id="g-daily" rows="10">' + esc((s.dailySteps || []).join('\n')) + '</textarea>') +
    '<label class="check" style="grid-column:1/-1"><input type="checkbox" id="g-dailyon"' + (s.dailyCleaning !== false ? ' checked' : '') + '>Create a daily cleaning task for every guest staying more than one night</label></div>') +
    fold('g-laundry', 'Laundry', field('Linen and towel types (one per line)', '<textarea id="g-linen" rows="6">' + esc((s.linenItems || []).join('\n')) + '</textarea>', '', 'Counted when laundry is sent out and when it comes back')) +
    fold('g-privacy', 'Guest privacy', field('Delete guest ID photos after (months)', input('g-idm', s.idPhotoMonths == null ? 6 : s.idPhotoMonths, 'type="number" min="0"'), '', 'Counted from check-out. 0 = keep forever. Guest names and ID numbers stay; only the photos are removed.')) +
    '<div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div></form>';
}
function lines(id) { return val(id).split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
function saveGeneral() {
  var d = { cautionEnabled: val('g-caution'), cautionAmount: num(val('g-camt')), checkInTime: val('g-in'), checkOutTime: val('g-out'), holdHours: num(val('g-hold')), approvalLimit: num(val('g-limit')), commonAreas: lines('g-areas'), turnoverSteps: lines('g-turn'), dailySteps: lines('g-daily'), dailyCleaning: val('g-dailyon'), linenItems: lines('g-linen'), idPhotoMonths: num(val('g-idm')), requireId: val('g-reqid') };
  viewDirty = false;
  db.collection('settings').doc('general').set(d, { merge: true }).catch(fail); audit('settings_saved', 'settings', 'general', ''); toast('Settings saved');
}

function adminRooms() {
  var html = '<div class="note">Two steps: <strong>1. Room types</strong> are price categories (rate + item checklist). <strong>2. Rooms</strong> are the actual units that appear on the Room board. Each room uses one type, so to change a room\'s price, change its type.</div>';
  html += '<div class="card"><div class="card-head"><h2>1 · Room types (price categories)</h2><button class="btn small" type="button" onclick="openRoomType()">+ Room type</button></div>' +
    S.data.roomTypes.map(function (t) { var n = S.data.rooms.filter(function (r) { return r.typeId === t.id && !r.archived; }).length; return '<div class="list-row clickable" onclick="openRoomType(\'' + t.id + '\')"><span class="main-t"><strong>' + esc(t.name) + (t.hasKitchen ? ' · kitchen' : '') + '</strong><span>' + (t.items || []).length + ' items checked at check-out · ' + (n ? n + ' room' + (n > 1 ? 's' : '') : '<span style="color:var(--bad)">no rooms use this type yet</span>') + '</span></span><span class="row"><strong class="money">' + money(t.rate) + ' / night</strong>' + (n ? '' : '<button class="btn small danger" type="button" onclick="event.stopPropagation();deleteRoomType(\'' + t.id + '\')">Delete</button>') + '</span></div>'; }).join('') + '</div>';
  html += '<div class="card"><div class="card-head"><h2>2 · Rooms (shown on the Room board)</h2><button class="btn small" type="button" onclick="openRoomEdit()">+ Room</button></div><div class="table-wrap"><table><thead><tr><th>Floor</th><th>Room</th><th>Type</th><th class="right">Rate</th><th>Status</th></tr></thead><tbody>' +
    roomsSorted().map(function (r) { return '<tr class="clickable" onclick="openRoomEdit(\'' + r.id + '\')"><td>' + esc(floorName(roomFloor(r))) + '</td><td><strong>' + esc(r.number) + '</strong></td><td>' + esc(roomType(r).name) + '</td><td class="right money">' + money(roomType(r).rate) + '</td><td>' + pill(ROOM_STATUS[r.status || 'ready'].label, ROOM_STATUS[r.status || 'ready'].cls) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  return html;
}
function openRoomType(id) {
  var t = byId(S.data.roomTypes, id) || { items: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveRoomType(\'' + (id || '') + '\')"><div class="fields">' +
    field('Name', input('rt-name', t.name, 'required')) + field('Rate per night (₦)', input('rt-rate', t.rate, 'inputmode="numeric" required')) +
    '<label class="check" style="grid-column:1/-1"><input type="checkbox" id="rt-kit"' + (t.hasKitchen ? ' checked' : '') + '>Has a kitchen</label>' +
    field('Room items (one per line: name x quantity)', '<textarea id="rt-items" rows="12">' + esc((t.items || []).map(function (i) { return i.name + ' x ' + i.qty; }).join('\n')) + '</textarea>', 'full', 'Counted at every check-out, e.g. "Bath towels x 2"') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(id ? 'Edit ' + t.name : 'New room type', b);
}
function saveRoomType(id) {
  var items = lines('rt-items').map(function (l) { var m = l.match(/^(.*?)\s*[x×*]\s*(\d+)$/i); return m ? { name: m[1].trim(), qty: +m[2] } : { name: l, qty: 1 }; });
  var d = { name: val('rt-name'), rate: num(val('rt-rate')), hasKitchen: val('rt-kit'), items: items, updatedAt: Date.now() };
  var old = byId(S.data.roomTypes, id);
  (id ? db.collection('roomTypes').doc(id).set(d, { merge: true }) : db.collection('roomTypes').add(Object.assign(d, { createdAt: Date.now() }))).catch(fail);
  audit('room_type_saved', 'roomType', id || '', d.name + ' · ' + money(d.rate) + (old && old.rate !== d.rate ? ' (was ' + money(old.rate) + ')' : '')); closeModal(); toast(id ? 'Saved' : 'Type saved. Now pick which rooms use it under "2 · Rooms".');
}
function deleteRoomType(id) {
  var t = byId(S.data.roomTypes, id);
  if (S.data.rooms.some(function (r) { return r.typeId === id && !r.archived; })) return toast('Rooms still use this type', true);
  if (!confirm('Delete room type "' + t.name + '"?')) return;
  db.collection('roomTypes').doc(id).delete().catch(fail); audit('room_type_deleted', 'roomType', id, t.name); toast('Deleted');
}
function openRoomEdit(id) {
  var r = byId(S.data.rooms, id) || {};
  var b = '<form class="form" onsubmit="event.preventDefault();saveRoomEdit(\'' + (id || '') + '\')"><div class="fields">' +
    field('Room name / number', input('re-no', r.number, 'required')) + field('Type', '<select id="re-type">' + S.data.roomTypes.map(function (t) { return '<option value="' + t.id + '"' + (t.id === r.typeId ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select>') +
    field('Floor', '<select id="re-floor">' + opts(FLOOR_NAMES.map(function (n, i) { return { v: i, l: n }; }), id ? roomFloor(r) : Math.min(FLOOR_NAMES.length - 1, Math.floor(S.data.rooms.length / 5))) + '</select>') +
    field('Position on floor', input('re-order', r.order || S.data.rooms.length + 1, 'type="number"'), '', '1 = front left of the entrance, 2 = front right, then 3, 4, 5 = the back row from left to right (as seen from the road)') +
    '</div><div class="form-actions">' + (id ? '<button type="button" class="btn danger" onclick="archiveRoom(\'' + id + '\')">Remove room</button>' : '') + '<button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(id ? 'Room ' + r.number : 'New room', b);
}
function saveRoomEdit(id) {
  var d = { number: val('re-no'), typeId: val('re-type'), order: num(val('re-order')), floor: num(val('re-floor')) };
  if (S.data.rooms.some(function (r) { return r.number === d.number && r.id !== id && !r.archived; })) return toast('Another room already has that name', true);
  (id ? db.collection('rooms').doc(id).update(d) : db.collection('rooms').add(Object.assign(d, { status: 'ready', createdAt: Date.now() }))).catch(fail);
  audit('room_saved', 'room', id || '', d.number); closeModal(); toast('Saved');
}
function archiveRoom(id) { var r = byId(S.data.rooms, id); if (r.status === 'occupied') return toast('A guest is in this room', true); if (!confirm('Remove Room ' + r.number + ' from the board? History is kept.')) return; db.collection('rooms').doc(id).update({ archived: true }).catch(fail); audit('room_removed', 'room', id, r.number); closeModal(); }

function adminStaff() {
  var active = sortBy(S.data.users.filter(function (u) { return u.active !== false; }), function (u) { return u.name; });
  var past = sortBy(S.data.users.filter(function (u) { return u.active === false; }), function (u) { return -(u.endedAt || 0); });
  return '<div class="card"><div class="card-head"><h2>Staff accounts</h2><button class="btn primary small" type="button" onclick="openStaff()">+ Add account</button></div>' +
    active.map(function (u) {
      var self = u.id === S.user.uid, waiting = u.onboarded === false;
      return '<div class="list-row"><span class="main-t"><strong>' + esc(u.name) + ' · @' + esc(u.username) + '</strong><span>' + esc((u.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + (u.handoverAt ? ' · holder since ' + fmtDate(u.handoverAt) : '') + '</span></span>' +
        '<span class="row">' + (waiting ? pill('Not onboarded yet', 'st-alert') : '') +
        '<button class="btn small" type="button" onclick="openStaff(\'' + u.id + '\')">Edit</button>' +
        (waiting ? '<button class="btn small primary" type="button" onclick="openOnboard(\'' + u.id + '\')">Onboard</button>' : self ? '' : '<button class="btn small" type="button" onclick="openHandover(\'' + u.id + '\')">Reset password / hand over</button>') + '</span></div>';
    }).join('') + '</div>' +
    '<div class="note">Create the account, then press <strong>Onboard</strong> and send the person their link. They open it on their phone and choose their own password. If someone forgets their password, or leaves and is replaced, use <strong>Reset password / hand over</strong>: it makes a new link, and the old password stops working at once. Everything the previous person did stays recorded under their name.</div>' +
    (past.length ? '<div class="card"><h2>Previous holders and disabled accounts</h2>' + past.map(function (u) {
      var next = byId(S.data.users, u.handedOverTo);
      return '<div class="list-row"><span class="main-t"><strong>' + esc(u.name) + ' · @' + esc(u.username) + '</strong><span>' + (u.endedReason === 'handover' ? 'Handed over' + (next ? ' to ' + esc(next.name) : '') : u.endedReason === 'password_reset' ? 'Password reset' : 'Disabled') + (u.endedAt ? ' · ' + fmtDate(u.endedAt) : '') + '</span></span>' + pill('Inactive', 'st-ooo') + '</div>';
    }).join('') + '</div>' : '');
}
function roleChoices(roles, lockAdmin) {
  return '<fieldset class="group"><legend>Roles</legend><div class="choices">' + Object.keys(ROLES).map(function (r) { return '<label class="choice"><input type="checkbox" name="sf-role" value="' + r + '"' + ((roles || []).indexOf(r) >= 0 ? ' checked' : '') + (lockAdmin && r === 'admin' ? ' disabled' : '') + '>' + ROLES[r] + '</label>'; }).join('') + '</div>' +
    '<div class="muted small">Admin: everything · Manager: all operations, store, reports, verifies repairs · Front desk: check-in/out, stays, sales, expenses · Housekeeping: cleaning tasks and laundry · Maintenance: repairs and assets</div></fieldset>';
}
function checkedRoles() { return Array.prototype.slice.call(document.querySelectorAll('input[name="sf-role"]:checked')).map(function (i) { return i.value; }); }
function openStaff(id) {
  var u = byId(S.data.users, id) || { roles: [] }, self = id === S.user.uid;
  var b = '<form class="form" onsubmit="event.preventDefault();saveStaff(\'' + (id || '') + '\')"><div class="fields">' +
    field(id ? 'Name of current holder' : 'Full name', input('sf-name', u.name, 'required')) +
    field('Username', input('sf-user', u.username, 'required autocapitalize="none"'), '', id ? 'Fix a typo here. They sign in with the new username from now on.' : 'Tip: name it after the role, e.g. frontdesk1, cleaner1, so it can be handed over') +
    field('Phone', input('sf-phone', u.phone, 'type="tel"')) + '</div>' + roleChoices(u.roles, self) +
    (id && !self ? '<label class="check"><input type="checkbox" id="sf-active" checked>Account active (untick to block sign-in without handing over)</label>' : '') +
    (id ? '' : '<div class="note">No password needed. After saving you get an onboarding link to send them, and they choose their own password.</div>') +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="sf-save">' + (id ? 'Save' : 'Create account') + '</button></div></form>';
  openModal(id ? '@' + u.username : 'Add account', b);
}
// A second Firebase app creates logins without signing the owner out
async function createLogin(password) {
  var sec = firebase.apps.find(function (a) { return a.name === 'staffmaker'; }) || firebase.initializeApp(FIREBASE_CONFIG, 'staffmaker');
  var email = newLoginEmail(), cred = await sec.auth().createUserWithEmailAndPassword(email, password);
  var uid = cred.user.uid; await sec.auth().signOut();
  return { uid: uid, email: email };
}
function randomCode(n) { var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = '', r = crypto.getRandomValues(new Uint32Array(n)); for (var i = 0; i < n; i++) s += a[r[i] % a.length]; return s; }
var INVITE_DAYS = 3;
// New hidden login with a throw-away password, plus a one-time onboarding link for it
function inviteBatch(b, uid, email, temp, username, name) {
  var code = randomCode(12);
  b.set(db.collection('invites').doc(code), { uid: uid, email: email, temp: temp, username: username, name: name, expires: Date.now() + INVITE_DAYS * 86400000, createdBy: S.user.uid, createdAt: Date.now() });
  return code;
}
async function saveStaff(id) {
  var roles = checkedRoles();
  if (id === S.user.uid && roles.indexOf('admin') < 0) roles.push('admin');
  if (!roles.length) return toast('Pick at least one role', true);
  var user = cleanUsername(val('sf-user'));
  if (!user) return toast('Choose a username (letters and numbers)', true);
  $('sf-save').disabled = true;
  try {
    if (id) {
      var u = byId(S.data.users, id), b = db.batch(), d = { name: val('sf-name'), phone: val('sf-phone'), roles: roles };
      if ($('sf-active') && !val('sf-active')) { d.active = false; d.endedReason = 'disabled'; d.endedAt = Date.now(); }
      if (user !== u.username) {
        if ((await db.collection('usernames').doc(user).get()).exists) throw new Error('That username is already taken');
        var old = await db.collection('usernames').doc(u.username).get();
        b.set(db.collection('usernames').doc(user), Object.assign({}, old.exists ? old.data() : { uid: id }, { at: Date.now() }));
        if (old.exists && old.data().uid === id) b.delete(db.collection('usernames').doc(u.username));
        if (u.inviteCode) b.update(db.collection('invites').doc(u.inviteCode), { username: user });
        d.username = user;
      }
      b.update(db.collection('users').doc(id), d);
      await b.commit();
      audit('staff_updated', 'user', id, d.name + ' · ' + roles.join(',') + (d.username ? ' · username @' + u.username + ' → @' + user : '') + (d.active === false ? ' · disabled' : ''));
      closeModal(); toast(d.username ? 'Saved. New username: @' + user : 'Saved');
    } else {
      if ((await db.collection('usernames').doc(user).get()).exists) throw new Error('That username is already taken');
      var temp = randomCode(24), login = await createLogin(temp), now = Date.now(), b2 = db.batch();
      var code = inviteBatch(b2, login.uid, login.email, temp, user, val('sf-name'));
      b2.set(db.collection('users').doc(login.uid), { name: val('sf-name'), username: user, phone: val('sf-phone'), roles: roles, active: true, onboarded: false, inviteCode: code, createdAt: now, createdBy: S.user.uid });
      b2.set(db.collection('usernames').doc(user), { uid: login.uid, email: login.email, at: now });
      await b2.commit();
      audit('staff_added', 'user', login.uid, '@' + user + ' · ' + val('sf-name') + ' · ' + roles.join(','));
      closeModal(); setTimeout(function () { openOnboard(login.uid); }, 300);
    }
  } catch (e) { $('sf-save').disabled = false; fail(e); }
}
function onboardLink(code) { return location.origin + location.pathname + '#onboard=' + code; }
async function openOnboard(uid) {
  var u = byId(S.data.users, uid); if (!u) return;
  var inv = u.inviteCode ? await db.collection('invites').doc(u.inviteCode).get().catch(function () { return null; }) : null;
  if (!inv || !inv.exists) return openModal('Onboard ' + u.name, '<div class="note warn">This onboarding link has been used or removed. Use "Reset password / hand over" to make a new one.</div>');
  var d = inv.data();
  if (d.expires < Date.now()) {
    var b = db.batch(), code = inviteBatch(b, d.uid, d.email, d.temp, u.username, u.name);
    b.delete(inv.ref); b.update(db.collection('users').doc(uid), { inviteCode: code });
    await b.commit(); u = Object.assign({}, u, { inviteCode: code }); d.expires = Date.now() + INVITE_DAYS * 86400000;
  }
  var link = onboardLink(u.inviteCode), msg = 'Hello ' + u.name.split(' ')[0] + ', here is your Wiwe Apartments staff login. Your username is ' + u.username + '. Open this link to choose your password (it works once, within ' + INVITE_DAYS + ' days): ' + link;
  var body = '<div class="note">Send this link to <strong>' + esc(u.name) + '</strong>. They open it, choose a password, and they\'re in. It works once and expires ' + fmtDT(d.expires) + '.</div>' +
    '<div class="fields">' + info('Username', '@' + u.username) + '<div class="field full">Onboarding link<input readonly value="' + esc(link) + '" onclick="this.select()"></div></div>' +
    '<div class="row"><a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(u.phone || '').replace(/\D/g, '').replace(/^0/, '234')) + '?text=' + encodeURIComponent(msg) + '">Send on WhatsApp</a>' +
    '<button class="btn" type="button" onclick="navigator.clipboard.writeText(' + esc(JSON.stringify(link)).replace(/"/g, '&quot;') + ').then(function(){toast(\'Link copied\')})">Copy link</button></div>';
  openModal('Onboard ' + u.name, body);
}
function openHandover(id) {
  var u = byId(S.data.users, id);
  var b = '<form class="form" onsubmit="event.preventDefault();saveHandover(\'' + id + '\')">' +
    '<div class="note">Account <strong>@' + esc(u.username) + '</strong> · ' + esc((u.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + ' · held by ' + esc(u.name) + '</div>' +
    '<div class="choices" role="radiogroup" aria-label="What is happening?">' +
    '<label class="choice"><input type="radio" name="ho-kind" value="password_reset" checked onchange="$(\'ho-who\').classList.add(\'hidden\')">Same person forgot their password</label>' +
    '<label class="choice"><input type="radio" name="ho-kind" value="handover" onchange="$(\'ho-who\').classList.remove(\'hidden\')">A new person is taking over</label></div>' +
    '<div class="fields hidden" id="ho-who">' + field("New holder's name", input('ho-name', '', '')) + field('Phone', input('ho-phone', '', 'type="tel"')) + '</div>' +
    '<div class="muted small">The current password stops working immediately. You get a new onboarding link for them to choose a password. Same username and roles.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="ho-save">Make new link</button></div></form>';
  openModal('Reset password / hand over · @' + u.username, b);
}
async function saveHandover(id) {
  var old = byId(S.data.users, id), kind = radio('ho-kind'), name = kind === 'handover' ? val('ho-name') : old.name;
  if (!name) return toast("Enter the new holder's name", true);
  $('ho-save').disabled = true;
  try {
    var temp = randomCode(24), login = await createLogin(temp), now = Date.now(), b = db.batch();
    var code = inviteBatch(b, login.uid, login.email, temp, old.username, name);
    b.set(db.collection('users').doc(login.uid), { name: name, username: old.username, phone: kind === 'handover' ? val('ho-phone') : (old.phone || ''), roles: old.roles || [], active: true, onboarded: false, inviteCode: code, createdAt: now, createdBy: S.user.uid, previousUid: id, handoverAt: kind === 'handover' ? now : (old.handoverAt || old.createdAt || now) });
    b.update(db.collection('users').doc(id), { active: false, endedReason: kind, endedAt: now, handedOverTo: login.uid });
    b.set(db.collection('usernames').doc(old.username), { uid: login.uid, email: login.email, at: now });
    if (old.inviteCode) b.delete(db.collection('invites').doc(old.inviteCode));
    await b.commit();
    audit(kind === 'handover' ? 'account_handover' : 'password_reset', 'user', login.uid, '@' + old.username + (kind === 'handover' ? ' from ' + old.name + ' to ' + name : ' · ' + old.name));
    closeModal(); setTimeout(function () { openOnboard(login.uid); }, 300);
  } catch (e) { $('ho-save').disabled = false; fail(e); }
}

function adminSecurity() {
  return '<div class="card"><h2>Change admin code</h2><form class="form" onsubmit="event.preventDefault();changeCode()"><div class="fields">' +
    field('Current admin code', input('cc-old', '', 'type="password" inputmode="numeric" required')) + field('New admin code (6 digits)', input('cc-new', '', 'type="password" inputmode="numeric" pattern="[0-9]{6}" required')) +
    '</div><div class="form-actions"><button class="btn primary" type="submit">Change code</button></div></form></div>' +
    '<div class="card"><h2>My password</h2><p class="muted">Everyone can change their own password from the key button next to their name.</p><button class="btn" type="button" onclick="openMyPassword()">Change my password</button></div>';
}
async function changeCode() {
  try {
    var s = await db.collection('settings').doc('security').get();
    if (s.data().codeHash !== await sha256(val('cc-old') + '|wiwe-admin')) return toast('Current code is wrong', true);
    await db.collection('settings').doc('security').set({ codeHash: await sha256(val('cc-new') + '|wiwe-admin') });
    audit('admin_code_changed', 'settings', '', ''); toast('Admin code changed'); render();
  } catch (e) { fail(e); }
}
function loadAudit() {
  db.collection('audit').orderBy('at', 'desc').limit(300).get().then(function (s) {
    var box = $('audit-box'); if (!box) return;
    box.innerHTML = '<h2>Last 300 actions</h2><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>' + s.docs.map(function (d) { var a = d.data(); return '<tr><td>' + fmtDT(a.at) + '</td><td>' + esc(a.byName) + '</td><td>' + esc(a.action.replace(/_/g, ' ')) + '</td><td>' + esc(a.details) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }).catch(fail);
}
async function backup() {
  var cols = ['rooms', 'roomTypes', 'users', 'stays', 'payments', 'tasks', 'jobs', 'assets', 'vendors', 'items', 'moves', 'expenses', 'incidents', 'laundry', 'shifts', 'usernames', 'settings', 'audit'], out = { app: 'wiwe', version: APP_VERSION, at: new Date().toISOString() };
  toast('Preparing backup…');
  try {
    for (var i = 0; i < cols.length; i++) { var s = await db.collection(cols[i]).get(); out[cols[i]] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
    if (out.settings) out.settings = out.settings.filter(function (x) { return x.id !== 'security'; });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'wiwe-backup-' + todayStr() + '.json'; a.click();
    audit('backup', 'all', '', '');
  } catch (e) { fail(e); }
}

/* ---------- Data protection: delete old guest ID photos ---------- */
// Runs at most once a day when the owner opens the app. Removes ID photos of guests who
// checked out more than N months ago (Admin settings → General → Guest privacy). Names and ID numbers stay.
async function purgeOldIdPhotos() {
  if (!isAdmin()) return;
  var months = Number(S.settings.idPhotoMonths); if (!months) return;
  try { if (localStorage.getItem('wiwe_purge') === todayStr()) return; localStorage.setItem('wiwe_purge', todayStr()); } catch (e) {}
  var cutoff = Date.now() - months * 30.44 * 86400000, removed = 0;
  try {
    var snap = await db.collection('stays').where('checkedOutAt', '<', cutoff).get();
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i], ids = d.data().idPhotos || []; if (!ids.length) continue;
      var b = db.batch();
      ids.forEach(function (pid) { b.delete(db.collection('photos').doc(pid)); });
      b.update(d.ref, { idPhotos: [], idPhotosDeletedAt: Date.now() });
      await b.commit(); removed += ids.length;
    }
    if (removed) { audit('id_photos_deleted', 'stays', '', removed + ' photo(s) older than ' + months + ' months'); toast(removed + ' old guest ID photo(s) deleted (privacy setting)'); }
  } catch (e) { console.warn('ID photo clean-up', e.message); }
}

/* ---------- Owner daily summary (in the app; the email version is scripts/daily-summary.mjs) ---------- */
function dailySummaryText(day) {
  var from = parseDate(day).getTime(), to = from + 86400000;
  function inDay(t) { return t >= from && t < to; }
  var pays = allPayments().filter(function (p) { return inDay(p.at) && payCounts(p) && p.amount > 0; });
  var by = function (m) { return money(sum(pays.filter(function (p) { return p.method === m; }), function (p) { return p.amount; })); };
  var exps = S.data.expenses.filter(function (e) { return inDay(e.at) && e.status !== 'rejected' && e.status !== 'void'; });
  var ins = S.data.stays.filter(function (s) { return inDay(s.checkedInAt); }).length, outs = S.data.stays.filter(function (s) { return inDay(s.checkedOutAt); }).length;
  var rooms = roomsSorted(), occ = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
  var sales = S.data.moves.filter(function (m) { return m.type === 'sale' && inDay(m.at); });
  var owe = debtors(), wait = refundsWaiting();
  var lines = ['*Wiwe Apartments · ' + fmtDate(day) + '*', '',
    'Money recorded: ' + money(sum(pays, function (p) { return p.amount; })) + ' (' + pays.length + ' payments)',
    'POS: ' + by('pos') + ' · Bank transfer: ' + by('transfer'),
    'Item sales: ' + money(sum(sales, function (m) { return m.total; })),
    'Spent: ' + money(sum(exps, function (e) { return e.amount; })) + (pendingExpenses().length ? ' · ' + pendingExpenses().length + ' waiting for your approval' : ''),
    'Guests owing: ' + money(sum(owe, function (s) { return s.balance; })) + ' (' + owe.length + ')',
    '', 'Check-ins: ' + ins + ' · Check-outs: ' + outs, 'Occupied now: ' + occ + ' of ' + rooms.length];
  var flags = [];
  S.data.stays.filter(isOverstay).forEach(function (s) { flags.push('Overstay: Room ' + s.roomNo + ' (' + s.guestName + ')'); });
  if (wait.length) flags.push(wait.length + ' refund(s) waiting for your approval');
  openIncidents().slice(0, 6).forEach(function (i) { flags.push(i.title); });
  if (lowStock().length) flags.push(lowStock().length + ' store item(s) low');
  if (openJobs().length) flags.push(openJobs().length + ' open repair job(s)');
  if (flags.length) lines.push('', '*Needs attention*'); flags.forEach(function (f) { lines.push('• ' + f); });
  return lines.join('\n');
}function dailySummaryCard() {
  var day = addDays(todayStr(), -1), text = dailySummaryText(day);
  // Buttons stay visible; the full text folds away to save scrolling
  return '<div class="card"><div class="card-head"><h2>Yesterday in brief</h2><div class="row"><a class="btn small primary" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '">WhatsApp</a>' +
    '<button class="btn small" type="button" onclick="copySummary()">Copy</button></div></div>' +
    '<details class="sum-fold"' + (foldOpen('today-sum') ? ' open' : '') + ' ontoggle="S.fold=S.fold||{};S.fold[\'today-sum\']=this.open"><summary class="muted">Show the summary</summary><pre class="summary-pre">' + esc(text.replace(/\*/g, '')) + '</pre></details></div>';
}
function copySummary() {
  var t = dailySummaryText(addDays(todayStr(), -1)).replace(/\*/g, '');
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copied'); }).catch(function () { toast('Could not copy', true); });
}

/* ---------- Are the live security rules up to date? ---------- */
// Older rules have no "invites" section, so even the owner is refused this harmless read.
async function checkRules() {
  if (!isAdmin()) return;
  try { await db.collection('meta').doc('rules').get({ source: 'server' }); S.rulesOutdated = false; } // "meta/rules" is only readable under the v3 rules
  catch (e) { S.rulesOutdated = /permission/i.test((e && (e.code || e.message)) || ''); }
  scheduleRender();
}
function openRulesHelp() {
  var pid = FIREBASE_CONFIG.projectId;
  openModal('Update the security rules',
    '<div class="note warn">The app was updated but the database is still using older security rules, so some actions (recording payments, check-in, reservations with a deposit, sales) are refused.</div>' +
    '<ol style="margin:0;padding-left:20px;line-height:1.8">' +
    '<li>Open the latest rules: <a href="https://github.com/SSSeyon/wiwe/blob/main/firestore.rules" target="_blank" rel="noopener">firestore.rules on GitHub</a>, then click the <strong>Copy raw file</strong> button (two squares icon).</li>' +
    '<li>Open <a href="https://console.firebase.google.com/project/' + esc(pid) + '/firestore/rules" target="_blank" rel="noopener">Firebase → Firestore → Rules</a>.</li>' +
    '<li>Select everything in the editor, paste, and click <strong>Publish</strong>.</li>' +
    '<li>Come back here and press <strong>Check again</strong>.</li></ol>' +
    '<div class="form-actions"><button class="btn primary" type="button" onclick="closeModal();checkRules().then(function(){toast(S.rulesOutdated ? \'Still the old rules. Publishing can take a minute.\' : \'Rules are up to date\', S.rulesOutdated)})">Check again</button></div>');
}
