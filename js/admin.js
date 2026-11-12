/* =========================================================
   OWNER: Today, Reports, Admin settings (code-locked)
   ========================================================= */

/* ---------- Today ---------- */
VIEWS.today = {
  title: function () { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; },
  render: function () {
    var t = todayStr(), y = addDays(t, -1);
    function money4(day) {
      var p = S.data.payments.filter(function (x) { return dateStr(new Date(x.at)) === day && x.amount > 0 && x.status !== 'void'; });
      var e = S.data.expenses.filter(function (x) { return dateStr(new Date(x.at)) === day && x.status !== 'rejected' && x.status !== 'void'; });
      return { exp: sum(p, function (x) { return x.amount; }), conf: sum(p.filter(function (x) { return x.status === 'confirmed'; }), function (x) { return x.amount; }), spent: sum(e, function (x) { return x.amount; }) };
    }
    var td = money4(t), yd = money4(y), rooms = roomsSorted(), occ = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
    var up = unconfirmedPayments(), al = alerts().filter(function (a) { return a.tag !== 'PAYMENT'; });
    var html = '<section class="grid-stats">' +
      '<div class="stat dark"><span class="label">Recorded today</span><span class="value">' + money(td.exp) + '</span><span class="sub">' + money(td.conf) + ' confirmed in bank</span></div>' +
      stat('Yesterday', money(yd.exp), money(yd.conf) + ' confirmed · ' + money(yd.spent) + ' spent') +
      stat('Occupancy now', occ + ' / ' + rooms.length, Math.round(occ / Math.max(1, rooms.length) * 100) + '%') +
      stat('Spent today', money(td.spent), pendingExpenses().length + ' waiting approval', pendingExpenses().length ? 'warn' : '') + '</section>';
    html += '<div class="split"><div class="wide"><div class="card"><div class="card-head"><h2>Confirm payments</h2>' + (up.length ? pill(up.length + ' waiting', 'st-alert') : pill('All matched', 'st-ready')) + '</div>' +
      (up.length ? '<div class="note" style="margin-bottom:8px">Open your bank app. Tap "Seen in bank" only when the money is there.</div>' + up.map(paymentRow).join('') : '<div class="muted">Nothing to confirm.</div>') + '</div>' +
      '<div class="card"><h2>Leak watch and approvals</h2><div class="stack">' + alertList(al) + '</div></div></div>' +
      '<div class="narrow"><div class="card"><h2>Rooms</h2><div class="legend">' + Object.keys(ROOM_STATUS).map(function (k) { var n = rooms.filter(function (r) { return displayStatus(r) === k; }).length; return n ? pill(ROOM_STATUS[k].label + ' · ' + n, ROOM_STATUS[k].cls) : ''; }).join('') + '</div><button class="btn block" style="margin-top:12px" type="button" onclick="go(\'board\')">Open room board</button></div>' +
      '<div class="card"><h2>Recent activity</h2><div id="today-audit" class="muted">Loading…</div></div></div></div>';
    setTimeout(loadRecentAudit, 0);
    return html;
  }
};
var auditCache = { at: 0, html: '' };
function loadRecentAudit() {
  var box = $('today-audit'); if (!box) return;
  if (Date.now() - auditCache.at < 60000 && auditCache.html) { box.innerHTML = auditCache.html; return; }
  db.collection('audit').orderBy('at', 'desc').limit(12).get().then(function (s) {
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
function monthPicker(m) { return '<div class="row between"><label class="field" style="flex-direction:row;align-items:center">Month <input type="month" value="' + m + '" onchange="S.params.month=this.value;S.report=null;render()" style="width:auto"></label><div class="row"><button class="btn small" type="button" onclick="S.report=null;render()">Refresh</button><button class="btn small" type="button" onclick="exportCsv(\'payments\')">Payments CSV</button><button class="btn small" type="button" onclick="exportCsv(\'expenses\')">Expenses CSV</button></div></div>'; }
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
    var docs = function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };
    S.report = { month: month, start: start, end: end, first: first, last: last, days: days, payments: docs(r[0]), expenses: docs(r[1]), stays: docs(r[2]).filter(function (s) { return (s.status === 'checked_in' || s.status === 'checked_out') && s.checkInDate <= last; }), moves: docs(r[3]), jobs: docs(r[4]) };
    S.reportLoading = null;
    if (S.view === 'reports') render();
  } catch (e) { S.reportLoading = null; fail(e); }
}
function reportHtml(R) {
  var rooms = roomsSorted(), pays = R.payments.filter(function (p) { return p.status !== 'void' && p.status !== 'rejected'; });
  var revKinds = ['room', 'extension', 'balance', 'damage'];
  var revenue = sum(pays.filter(function (p) { return revKinds.indexOf(p.kind) >= 0; }), function (p) { return p.amount; });
  var confirmed = sum(pays.filter(function (p) { return revKinds.indexOf(p.kind) >= 0 && p.status === 'confirmed'; }), function (p) { return p.amount; });
  var exps = R.expenses.filter(function (e) { return e.status !== 'rejected' && e.status !== 'void'; }), spent = sum(exps, function (e) { return e.amount; });
  var nightsByRoom = {}, sold = 0;
  R.stays.forEach(function (s) { var a = s.checkInDate > R.first ? s.checkInDate : R.first, bEnd = s.checkOutDate <= R.last ? s.checkOutDate : addDays(R.last, 1), n = Math.max(0, daysBetween(a, bEnd)); sold += n; nightsByRoom[s.roomNo] = (nightsByRoom[s.roomNo] || 0) + n; });
  var avail = rooms.length * R.days, occ = avail ? sold / avail : 0, adr = sold ? revenue / sold : 0;
  var revByRoom = {}; pays.filter(function (p) { return revKinds.indexOf(p.kind) >= 0; }).forEach(function (p) { revByRoom[p.roomNo] = (revByRoom[p.roomNo] || 0) + p.amount; });
  var repByRoom = {}; exps.filter(function (e) { return e.category === 'repairs' && e.location && e.location.indexOf('room:') === 0; }).forEach(function (e) { var l = locLabel(e.location).replace('Room ', ''); repByRoom[l] = (repByRoom[l] || 0) + e.amount; });
  var cats = {}; exps.forEach(function (e) { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  var maxC = Math.max.apply(null, Object.keys(cats).map(function (k) { return cats[k]; }).concat([1]));
  var issued = R.moves.filter(function (m) { return m.type === 'issue'; }), shortfall = R.moves.filter(function (m) { return m.type === 'count' && m.qty < 0; });
  var diesel = exps.filter(function (e) { return e.category === 'diesel'; });
  var html = monthPicker(R.month) + '<section class="grid-stats">' +
    '<div class="stat dark"><span class="label">Revenue</span><span class="value">' + money(revenue) + '</span><span class="sub">' + money(confirmed) + ' confirmed in bank</span></div>' +
    stat('Expenses', money(spent), exps.length + ' records') + stat('Net', money(revenue - spent), revenue ? Math.round((revenue - spent) / revenue * 100) + '% margin' : '', revenue - spent < 0 ? 'warn' : '') +
    stat('Occupancy', Math.round(occ * 100) + '%', sold + ' of ' + avail + ' room-nights') + stat('Average rate', money(adr), 'Revenue ÷ nights sold') + stat('RevPAR', money(avail ? revenue / avail : 0), 'Revenue ÷ available room-nights') + '</section>';
  html += '<div class="split"><div class="wide"><div class="card"><h2>By room</h2><div class="table-wrap"><table><thead><tr><th>Room</th><th class="right">Nights</th><th class="right">Occupancy</th><th class="right">Revenue</th><th class="right">Repairs</th></tr></thead><tbody>' +
    rooms.map(function (r) { var n = nightsByRoom[r.number] || 0; return '<tr><td><strong>' + esc(r.number) + '</strong> <span class="muted small">' + esc(roomType(r).name) + '</span></td><td class="right">' + n + '</td><td class="right">' + Math.round(n / R.days * 100) + '%</td><td class="right money">' + money(revByRoom[r.number] || 0) + '</td><td class="right money">' + money(repByRoom[r.number] || 0) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
    '<div class="narrow"><div class="card"><h2>Expenses by category</h2>' + (Object.keys(cats).length ? '<div class="bars">' + Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) { return '<div class="bar-row"><span>' + esc(EXPENSE_CATS[k] || k) + '</span><span class="bar-track"><span style="width:' + Math.round(cats[k] / maxC * 100) + '%"></span></span><span class="right money">' + money(cats[k]) + '</span></div>'; }).join('') + '</div>' : '<div class="muted">No expenses.</div>') + '</div>' +
    '<div class="card"><h2>Leak indicators</h2>' +
    '<div class="list-row"><span>Store items issued per night sold</span><strong>' + (sold ? (-sum(issued, function (m) { return m.qty; }) / sold).toFixed(1) : '—') + '</strong></div>' +
    '<div class="list-row"><span>Stock count shortfalls</span><strong>' + shortfall.length + '</strong></div>' +
    '<div class="list-row"><span>Payments not received</span><strong>' + R.payments.filter(function (p) { return p.status === 'rejected'; }).length + '</strong></div>' +
    '<div class="list-row"><span>Still unconfirmed</span><strong>' + money(sum(R.payments.filter(function (p) { return p.status === 'unconfirmed' && p.amount > 0; }), function (p) { return p.amount; })) + '</strong></div>' +
    '<div class="list-row"><span>Diesel</span><strong>' + sum(diesel, function (e) { return e.litres; }) + ' L · ' + money(sum(diesel, function (e) { return e.amount; })) + '</strong></div>' +
    '<div class="list-row"><span>Repair jobs opened</span><strong>' + R.jobs.length + '</strong></div>' +
    '<div class="list-row"><span>Discounts given</span><strong>' + money(sum(R.stays.filter(function (s) { return s.discountStatus === 'approved' && s.checkInDate >= R.first; }), function (s) { return s.discount; })) + '</strong></div>' +
    '</div></div></div>';
  return html;
}
function exportCsv(kind) {
  var R = S.report; if (!R) return toast('Load a month first', true);
  var rows = kind === 'payments'
    ? [['Date', 'Room', 'Guest', 'Kind', 'Method', 'Sender', 'Reference', 'Amount', 'Status', 'Recorded by']].concat(R.payments.map(function (p) { return [fmtDT(p.at), p.roomNo, p.guestName, p.kind, p.method, p.sender, p.ref, p.amount, p.status, p.byName]; }))
    : [['Date', 'Category', 'Description', 'Paid to', 'Amount', 'Litres', 'Status', 'Recorded by']].concat(R.expenses.map(function (e) { return [fmtDT(e.at), EXPENSE_CATS[e.category] || e.category, e.description, e.paidTo, e.amount, e.litres || '', e.status, e.byName]; }));
  var csv = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
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
  return '<form class="form" onsubmit="event.preventDefault();saveGeneral()"><div class="card"><h2>Guests and money</h2><div class="fields">' +
    '<label class="check" style="grid-column:1/-1"><input type="checkbox" id="g-caution"' + (s.cautionEnabled ? ' checked' : '') + '>Collect a refundable caution fee at check-in</label>' +
    field('Caution fee (₦)', input('g-camt', s.cautionAmount, 'inputmode="numeric"')) +
    field('Check-in time', input('g-in', s.checkInTime, 'type="time"')) + field('Check-out time', input('g-out', s.checkOutTime, 'type="time"')) +
    field('Hold reservations for (hours)', input('g-hold', s.holdHours, 'type="number" min="0"'), '', 'After the expected arrival time') +
    field('Approval needed above (₦)', input('g-limit', s.approvalLimit, 'inputmode="numeric"'), '', 'Expenses and purchases above this wait for you') +
    '</div></div><div class="card"><h2>Places</h2>' + field('Common areas (one per line)', '<textarea id="g-areas">' + esc((s.commonAreas || []).join('\n')) + '</textarea>', '', 'Used for maintenance and assets, e.g. Generator house, Reception') + '</div>' +
    '<div class="card"><h2>Cleaning checklists</h2><div class="fields">' + field('Turnover (after check-out)', '<textarea id="g-turn" rows="10">' + esc((s.turnoverSteps || []).join('\n')) + '</textarea>', '', 'One step per line. Steps with the word "kitchen" only show for kitchen rooms.') +
    field('Daily service (guest staying)', '<textarea id="g-daily" rows="10">' + esc((s.dailySteps || []).join('\n')) + '</textarea>') + '</div></div>' +
    '<div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div></form>';
}
function lines(id) { return val(id).split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
function saveGeneral() {
  var d = { cautionEnabled: val('g-caution'), cautionAmount: num(val('g-camt')), checkInTime: val('g-in'), checkOutTime: val('g-out'), holdHours: num(val('g-hold')), approvalLimit: num(val('g-limit')), commonAreas: lines('g-areas'), turnoverSteps: lines('g-turn'), dailySteps: lines('g-daily') };
  db.collection('settings').doc('general').set(d, { merge: true }).catch(fail); audit('settings_saved', 'settings', 'general', ''); toast('Settings saved');
}

function adminRooms() {
  var html = '<div class="card"><div class="card-head"><h2>Room types and rates</h2><button class="btn small" type="button" onclick="openRoomType()">+ Room type</button></div>' +
    S.data.roomTypes.map(function (t) { return '<div class="list-row clickable" onclick="openRoomType(\'' + t.id + '\')"><span class="main-t"><strong>' + esc(t.name) + (t.hasKitchen ? ' · kitchen' : '') + '</strong><span>' + (t.items || []).length + ' items checked at check-out · ' + S.data.rooms.filter(function (r) { return r.typeId === t.id && !r.archived; }).length + ' rooms</span></span><strong class="money">' + money(t.rate) + ' / night</strong></div>'; }).join('') + '</div>';
  html += '<div class="card"><div class="card-head"><h2>Rooms</h2><button class="btn small" type="button" onclick="openRoomEdit()">+ Room</button></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Room</th><th>Type</th><th>Status</th></tr></thead><tbody>' +
    roomsSorted().map(function (r) { return '<tr class="clickable" onclick="openRoomEdit(\'' + r.id + '\')"><td>' + (r.order || '') + '</td><td><strong>' + esc(r.number) + '</strong></td><td>' + esc(roomType(r).name) + '</td><td>' + pill(ROOM_STATUS[r.status || 'ready'].label, ROOM_STATUS[r.status || 'ready'].cls) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
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
  audit('room_type_saved', 'roomType', id || '', d.name + ' · ' + money(d.rate) + (old && old.rate !== d.rate ? ' (was ' + money(old.rate) + ')' : '')); closeModal(); toast('Saved');
}
function openRoomEdit(id) {
  var r = byId(S.data.rooms, id) || {};
  var b = '<form class="form" onsubmit="event.preventDefault();saveRoomEdit(\'' + (id || '') + '\')"><div class="fields">' +
    field('Room name / number', input('re-no', r.number, 'required')) + field('Type', '<select id="re-type">' + S.data.roomTypes.map(function (t) { return '<option value="' + t.id + '"' + (t.id === r.typeId ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select>') +
    field('Order on board', input('re-order', r.order || S.data.rooms.length + 1, 'type="number"')) +
    '</div><div class="form-actions">' + (id ? '<button type="button" class="btn danger" onclick="archiveRoom(\'' + id + '\')">Remove room</button>' : '') + '<button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(id ? 'Room ' + r.number : 'New room', b);
}
function saveRoomEdit(id) {
  var d = { number: val('re-no'), typeId: val('re-type'), order: num(val('re-order')) };
  if (S.data.rooms.some(function (r) { return r.number === d.number && r.id !== id && !r.archived; })) return toast('Another room already has that name', true);
  (id ? db.collection('rooms').doc(id).update(d) : db.collection('rooms').add(Object.assign(d, { status: 'ready', createdAt: Date.now() }))).catch(fail);
  audit('room_saved', 'room', id || '', d.number); closeModal(); toast('Saved');
}
function archiveRoom(id) { var r = byId(S.data.rooms, id); if (r.status === 'occupied') return toast('A guest is in this room', true); if (!confirm('Remove Room ' + r.number + ' from the board? History is kept.')) return; db.collection('rooms').doc(id).update({ archived: true }).catch(fail); audit('room_removed', 'room', id, r.number); closeModal(); }

function adminStaff() {
  return '<div class="card"><div class="card-head"><h2>Staff accounts</h2><button class="btn primary small" type="button" onclick="openStaff()">+ Add staff</button></div>' +
    sortBy(S.data.users, function (u) { return (u.active === false ? 'z' : 'a') + u.name; }).map(function (u) { return '<div class="list-row clickable" onclick="openStaff(\'' + u.id + '\')"><span class="main-t"><strong>' + esc(u.name) + '</strong><span>@' + esc(u.username) + ' · ' + esc((u.roles || []).map(function (r) { return ROLES[r]; }).join(', ')) + '</span></span>' + (u.active === false ? pill('Disabled', 'st-ooo') : pill('Active', 'st-ready')) + '</div>'; }).join('') +
    '</div><div class="note">Staff sign in with their username and 6-digit PIN. If someone forgets their PIN or leaves, disable the account. To reset a PIN, disable the old account and create a new one, or reset it in the Firebase console.</div>';
}
function openStaff(id) {
  var u = byId(S.data.users, id) || { roles: [] }, self = id === S.user.uid;
  var b = '<form class="form" onsubmit="event.preventDefault();saveStaff(\'' + (id || '') + '\')"><div class="fields">' +
    field('Full name', input('sf-name', u.name, 'required')) +
    (id ? info('Username', '@' + u.username) : field('Username', input('sf-user', '', 'required autocapitalize="none"'), '', 'Letters and numbers, e.g. blessing') + field('PIN (6 digits)', input('sf-pin', '', 'required inputmode="numeric" pattern="[0-9]{6}"'), '', 'Tell them in person. They can change it later.')) +
    field('Phone', input('sf-phone', u.phone, 'type="tel"')) + '</div>' +
    '<fieldset class="group"><legend>Roles</legend><div class="choices">' + Object.keys(ROLES).map(function (r) { return '<label class="choice"><input type="checkbox" name="sf-role" value="' + r + '"' + ((u.roles || []).indexOf(r) >= 0 ? ' checked' : '') + (self && r === 'admin' ? ' disabled' : '') + '>' + ROLES[r] + '</label>'; }).join('') + '</div>' +
    '<div class="muted small">Admin: everything · Manager: all operations, store, reports, verifies repairs · Front desk: check-in/out, stays, expenses · Housekeeping: cleaning tasks · Maintenance: repairs and assets</div></fieldset>' +
    (id && !self ? '<label class="check"><input type="checkbox" id="sf-active"' + (u.active !== false ? ' checked' : '') + '>Account active (untick to block sign-in)</label>' : '') +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="sf-save">Save</button></div></form>';
  openModal(id ? u.name : 'Add staff', b);
}
async function saveStaff(id) {
  var roles = Array.prototype.slice.call(document.querySelectorAll('input[name="sf-role"]:checked')).map(function (i) { return i.value; });
  if (id === S.user.uid && roles.indexOf('admin') < 0) roles.push('admin');
  if (!roles.length) return toast('Pick at least one role', true);
  $('sf-save').disabled = true;
  try {
    if (id) {
      var d = { name: val('sf-name'), phone: val('sf-phone'), roles: roles };
      if ($('sf-active')) d.active = val('sf-active');
      await db.collection('users').doc(id).update(d); audit('staff_updated', 'user', id, d.name + ' · ' + roles.join(','));
    } else {
      var user = val('sf-user').toLowerCase(), pin = val('sf-pin');
      if (!/^[0-9]{6}$/.test(pin)) { $('sf-save').disabled = false; return toast('PIN must be 6 digits', true); }
      // A second Firebase app creates the account without signing the owner out
      var sec = firebase.apps.find(function (a) { return a.name === 'staffmaker'; }) || firebase.initializeApp(FIREBASE_CONFIG, 'staffmaker');
      var cred = await sec.auth().createUserWithEmailAndPassword(emailFor(user), pin);
      var uid = cred.user.uid; await sec.auth().signOut();
      await db.collection('users').doc(uid).set({ name: val('sf-name'), username: user, phone: val('sf-phone'), roles: roles, active: true, createdAt: Date.now(), createdBy: S.user.uid });
      audit('staff_added', 'user', uid, val('sf-name') + ' · ' + roles.join(','));
    }
    closeModal(); toast('Saved');
  } catch (e) { $('sf-save').disabled = false; fail(e.code === 'auth/email-already-in-use' ? new Error('That username is taken') : e); }
}

function adminSecurity() {
  return '<div class="card"><h2>Change admin code</h2><form class="form" onsubmit="event.preventDefault();changeCode()"><div class="fields">' +
    field('Current admin code', input('cc-old', '', 'type="password" inputmode="numeric" required')) + field('New admin code (6 digits)', input('cc-new', '', 'type="password" inputmode="numeric" pattern="[0-9]{6}" required')) +
    '</div><div class="form-actions"><button class="btn primary" type="submit">Change code</button></div></form></div>' +
    '<div class="card"><h2>Change my login PIN</h2><form class="form" onsubmit="event.preventDefault();changePin()"><div class="fields">' +
    field('Current PIN', input('cp-old', '', 'type="password" inputmode="numeric" required')) + field('New PIN (6 digits)', input('cp-new', '', 'type="password" inputmode="numeric" pattern="[0-9]{6}" required')) +
    '</div><div class="form-actions"><button class="btn primary" type="submit">Change PIN</button></div></form></div>';
}
async function changeCode() {
  try {
    var s = await db.collection('settings').doc('security').get();
    if (s.data().codeHash !== await sha256(val('cc-old') + '|wiwe-admin')) return toast('Current code is wrong', true);
    await db.collection('settings').doc('security').set({ codeHash: await sha256(val('cc-new') + '|wiwe-admin') });
    audit('admin_code_changed', 'settings', '', ''); toast('Admin code changed'); render();
  } catch (e) { fail(e); }
}
async function changePin() {
  try {
    var u = auth.currentUser;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, val('cp-old')));
    await u.updatePassword(val('cp-new')); toast('PIN changed'); render();
  } catch (e) { fail(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' ? new Error('Current PIN is wrong') : e); }
}
function loadAudit() {
  db.collection('audit').orderBy('at', 'desc').limit(300).get().then(function (s) {
    var box = $('audit-box'); if (!box) return;
    box.innerHTML = '<h2>Last 300 actions</h2><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>' + s.docs.map(function (d) { var a = d.data(); return '<tr><td>' + fmtDT(a.at) + '</td><td>' + esc(a.byName) + '</td><td>' + esc(a.action.replace(/_/g, ' ')) + '</td><td>' + esc(a.details) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }).catch(fail);
}
async function backup() {
  var cols = ['rooms', 'roomTypes', 'users', 'stays', 'payments', 'tasks', 'jobs', 'assets', 'vendors', 'items', 'moves', 'expenses', 'incidents', 'settings', 'audit'], out = { app: 'wiwe', version: APP_VERSION, at: new Date().toISOString() };
  toast('Preparing backup…');
  try {
    for (var i = 0; i < cols.length; i++) { var s = await db.collection(cols[i]).get(); out[cols[i]] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
    if (out.settings) out.settings = out.settings.filter(function (x) { return x.id !== 'security'; });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'wiwe-backup-' + todayStr() + '.json'; a.click();
    audit('backup', 'all', '', '');
  } catch (e) { fail(e); }
}
