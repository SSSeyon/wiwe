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
      return { list: p, exp: sum(p, function (x) { return x.amount; }), conf: sum(p.filter(function (x) { return x.status === 'confirmed'; }), function (x) { return x.amount; }), pos: by('pos'), transfer: by('transfer'), spent: sum(e, function (x) { return x.amount; }), exps: e };
    }
    function dayDetail(d) {
      return bdPays(d.list, d.list.length + ' payment' + (d.list.length === 1 ? '' : 's') + ' · ' + money(d.conf) + ' confirmed · ' + money(d.pos) + ' POS · ' + money(d.transfer) + ' transfer') +
        bdGroup('Spent (' + money(d.spent) + ')', sortBy(d.exps, function (x) { return x.at; }, true), bdExp, 'No expenses recorded.');
    }
    var td = money4(t), yd = money4(y), rooms = roomsSorted(), occ = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
    var al = alerts(), owe = debtors();
    var html = '<section class="grid-stats">' +
      stat('Recorded today', money(td.exp), money(td.conf) + ' confirmed · ' + money(td.pos) + ' POS', 'dark', function () { return dayDetail(td); }) +
      stat('Yesterday', money(yd.exp), money(yd.pos) + ' POS · ' + money(yd.spent) + ' spent', '', function () { return dayDetail(yd); }) +
      stat('Occupancy now', occ + ' / ' + rooms.length, Math.round(occ / Math.max(1, rooms.length) * 100) + '%', '', function () { return bdRoomsByStatus(rooms); }) +
      stat('Guests owing', money(sum(owe, function (s) { return s.balance; })), owe.length + ' stay' + (owe.length === 1 ? '' : 's') + ' · ' + money(td.spent) + ' spent today', owe.length ? 'warn' : '', function () { return bdOwing(owe); }) + '</section>';
    html += '<div class="split"><div class="wide"><div class="card"><h2>Leak watch and approvals</h2><div class="stack">' + alertList(al) + '</div></div>' +
      '<div class="card"><div class="card-head"><h2>Payments recorded today</h2><button class="btn small" type="button" onclick="go(\'payments\')">See all</button></div>' +
      (td.list.length ? '<div class="note mb-2">Compare the POS figure with the end-of-day total on the terminal: ' + money(td.pos) + ' from ' + td.list.filter(function (x) { return x.method === 'pos'; }).length + ' slip(s).</div>' + td.list.map(paymentRow).join('') : emptyState('payments', 'No payments yet today', 'Each payment shows here as it is recorded.', '', '', true)) + '</div></div>' +
      '<div class="narrow">' + dailySummaryCard() +
      '<div class="card"><div class="card-head"><h2>Recent activity</h2><button class="btn small" type="button" onclick="go(\'admin\',{tab:\'audit\'})">See all</button></div><div id="today-audit">' + skeleton(3) + '</div></div></div></div>';    setTimeout(loadRecentAudit, 0);
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
    return monthPicker(month) + skeleton(0, 4) + '<div class="card">' + skeleton(6) + '</div>';
  }
};
function monthPicker(m) { return '<div class="row between"><label class="field field-inline">Month <input type="month" value="' + m + '" onchange="S.params.month=this.value;S.report=null;render()" class="w-auto"></label><div class="row"><button class="btn small" type="button" onclick="S.report=null;render()">Refresh</button>' + actionMenu('Export', [['Payments (CSV)', "exportCsv('payments')"], ['Expenses (CSV)', "exportCsv('expenses')"], ['Print this report', 'printPage()']]) + '</div></div>'; }
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
    stat('Income', money(revenue), money(roomRev) + ' rooms · ' + money(salesRev) + ' item sales' + (cautionKept ? ' · ' + money(cautionKept) + ' caution kept' : ''), 'dark', function () {
      var keptStays = outs.filter(function (s) { return (s.cautionDeductions || 0) + (s.cautionApplied || 0) > 0; });
      return bdHead(money(revenue), 'Money in this month that counts as income') +
        bdLine('Rooms (less refunds)', money(roomRev)) + bdLine('Item sales', money(salesRev)) + (cautionKept ? bdLine('Caution fees kept', money(cautionKept)) : '') + bdLine('Total income', money(revenue), true) +
        bdGroup('Room payments (' + roomPays.length + ')', sortBy(roomPays, function (p) { return p.at; }, true), bdPay, 'None this month.') +
        bdGroup('Item sales', sortBy(pays.filter(function (p) { return p.kind === 'sale'; }), function (p) { return p.at; }, true), bdPay, 'None this month.') +
        (keptStays.length ? bdGroup('Caution kept', keptStays, function (s) { return bdStay(s, money((s.cautionDeductions || 0) + (s.cautionApplied || 0)) + ' kept from the caution fee'); }) : '');
    }) +
    stat('Expenses', money(spent), exps.length + ' records', '', function () {
      return bdHead(money(spent), exps.length + (exps.length === 1 ? ' record' : ' records') + ', biggest category first') + Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) {
        return bdGroup((EXPENSE_CATS[k] || k) + ' · ' + money(cats[k]), sortBy(exps.filter(function (e) { return e.category === k; }), function (e) { return e.at; }, true), bdExp);
      }).join('') + (exps.length ? '' : '<div class="muted">No expenses this month.</div>');
    }) +
    stat('Net', money(revenue - spent), revenue ? Math.round((revenue - spent) / revenue * 100) + '% margin' : '', revenue - spent < 0 ? 'warn' : '', function () {
      return bdLine('Rooms (less refunds)', money(roomRev)) + bdLine('Item sales', money(salesRev)) + (cautionKept ? bdLine('Caution fees kept', money(cautionKept)) : '') + bdLine('Income', money(revenue), true) +
        Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) { return bdLine('Less ' + (EXPENSE_CATS[k] || k).toLowerCase(), money(-cats[k])); }).join('') +
        bdLine('Expenses', money(-spent), true) + bdLine('Net', money(revenue - spent), true);
    }) +
    stat('Occupancy', Math.round(occ * 100) + '%', sold + ' of ' + avail + ' room-nights · ' + money(adr) + ' average room rate', '', function () {
      return bdHead(sold + ' of ' + avail + ' room-nights', rooms.length + ' rooms × ' + R.days + ' days · ' + money(adr) + ' average room rate (room income ÷ nights sold)') +
        '<div class="table-wrap"><table><thead><tr><th>Room</th><th class="right">Nights</th><th class="right">Occupancy</th></tr></thead><tbody>' + rooms.map(function (r) { var n = nightsByRoom[r.number] || 0; return '<tr><td>' + esc(r.number) + '</td><td class="right">' + n + '</td><td class="right">' + Math.round(n / R.days * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div>' +
        bdGroup('Stays counted (' + R.stays.length + ')', sortBy(R.stays, function (s) { return s.checkInDate; }), function (s) { return bdStay(s, nightsIn(s, R.first, next) + ' night(s) in this month'); });
    }) + '</section>' +
    '<section class="grid-stats">' +
    stat('Next 30 days', Math.round(ahead / Math.max(1, rooms.length * 30) * 100) + '% booked', ahead + ' of ' + rooms.length * 30 + ' room-nights already on the books', '', function () {
      var l = sortBy(S.data.stays.filter(function (s) { return (s.status === 'reserved' || s.status === 'checked_in') && nightsIn(s, t, t30) > 0; }), function (s) { return s.checkInDate; });
      return bdHead(ahead + ' room-nights', 'Guests in the house and reservations, ' + fmtDate(t) + ' to ' + fmtDate(t30)) + bdList(l, function (s) { return bdStay(s, nightsIn(s, t, t30) + ' night(s) in the next 30 days'); }, 'Nothing booked.');
    }) +
    stat('Guests owing now', money(sum(owe, function (s) { return s.balance; })), owe.length + ' stay' + (owe.length === 1 ? '' : 's'), owe.length ? 'warn' : '', function () { return bdOwing(owe); }) +
    stat('Turnover cleaning', cleans.length ? cleanMin + ' min' : '—', cleans.length ? 'Average over ' + cleans.length + ' room' + (cleans.length === 1 ? '' : 's') : 'No finished cleans this month', '', function () {
      return bdHead(cleans.length ? cleanMin + ' min average' : '—', 'From starting the clean to sending it for inspection') +
        bdList(sortBy(cleans, function (k) { return k.finishedAt; }, true), function (k) { return recRow({ l1: '<strong>Room ' + esc(k.roomNo) + '</strong>', l2: dots([k.assigneeName, fmtDT(k.startedAt)]), side: '<strong>' + Math.round((k.finishedAt - k.startedAt) / 60000) + ' min</strong>', click: "go('task',{id:'" + k.id + "'})" }); }, 'No finished cleans this month.');
    }) + '</section>';
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
  if (!S.trend) return '<div class="card"><div class="card-head"><h2>Last 6 months</h2><button class="btn small no-print" type="button"' + (S.trendLoading ? ' disabled' : '') + ' onclick="loadTrend()">' + (S.trendLoading ? 'Loading…' : 'Show') + '</button></div>' + (S.trendLoading ? skeleton(4) : '<div class="muted">Income, spending and occupancy month by month.</div>') + '</div>';
  return '<div class="card"><div class="card-head"><h2>Last 6 months</h2><button class="btn small no-print" type="button" onclick="S.trend=null;loadTrend()">Refresh</button></div>' +
    '<div class="chart-key" aria-hidden="true"><span><i class="k-in"></i>Income</span><span><i class="k-out"></i>Spent</span><span><i class="k-occ"></i>Occupancy</span></div>' + trendChart(S.trend) +
    '<details class="sum-fold mt-2"><summary class="muted">Show the figures</summary><div class="table-wrap mt-2"><table><thead><tr><th>Month</th><th class="right">Income</th><th class="right">Spent</th><th class="right">Net</th><th class="right">Occupancy</th></tr></thead><tbody>' +
    S.trend.map(function (m) { return '<tr><td><strong>' + esc(m.label) + '</strong></td><td class="right money">' + money(m.rev) + '</td><td class="right money">' + money(m.spent) + '</td><td class="right money">' + money(m.rev - m.spent) + '</td><td class="right">' + Math.round(m.occ * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div></details></div>';
}
function shortMoney(v) { v = Math.round(v); return v >= 1e6 ? '₦' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'm' : v >= 1e3 ? '₦' + Math.round(v / 1e3) + 'k' : '₦' + v; }
/* Bars for income and spending, a line for occupancy (right-hand scale) */
function trendChart(rows) {
  var W = 640, H = 240, L = 54, R = 42, T = 14, B = 30, cw = (W - L - R) / rows.length;
  var max = Math.max.apply(null, rows.map(function (m) { return Math.max(m.rev, m.spent); }).concat([1]));
  var step = Math.pow(10, Math.floor(Math.log(max) / Math.LN10)), top = Math.ceil(max / step) * step;
  var y = function (v) { return T + (H - T - B) * (1 - v / top); }, pts = [];
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Income, spending and occupancy for the last six months">';
  for (var g = 0; g <= 4; g++) { var v = top * g / 4, yy = y(v); s += '<line class="c-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + shortMoney(v) + '</text>'; }
  [0, 50, 100].forEach(function (p) { s += '<text x="' + (W - R + 6) + '" y="' + (y(top * p / 100) + 4) + '">' + p + '%</text>'; });
  rows.forEach(function (m, i) {
    var cx = L + i * cw + cw / 2, bw = Math.min(24, cw / 3.4);
    s += '<rect class="c-in" x="' + (cx - bw - 2) + '" y="' + y(m.rev) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(m.rev)) + '" rx="3"><title>' + esc(m.label) + ': income ' + money(m.rev) + '</title></rect>';
    s += '<rect class="c-out" x="' + (cx + 2) + '" y="' + y(m.spent) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(m.spent)) + '" rx="3"><title>' + esc(m.label) + ': spent ' + money(m.spent) + '</title></rect>';
    s += '<text x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(m.label.split(' ')[0]) + '</text>';
    pts.push([cx, y(top * Math.min(1, m.occ || 0)), m]);
  });
  s += '<polyline class="c-occ" points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
  pts.forEach(function (p) { s += '<circle class="c-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4"><title>' + esc(p[2].label) + ': ' + Math.round(p[2].occ * 100) + '% occupied</title></circle>'; });
  return s + '</svg>';
}
// Print the page as it is, with folded sections opened
function printPage() { document.querySelectorAll('#view details').forEach(function (d) { d.open = true; }); window.print(); }async function loadTrend() {
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
    ? [['Date', 'Room', 'Guest', 'Kind', 'Method', 'Sender', 'Reference', 'Amount', 'Status', 'Recorded by']].concat(R.payments.map(function (p) { return [fmtDT(p.at), p.roomNo, p.guestName, PAY_KIND[p.kind] || p.kind, PAY_LABEL[p.method] || p.method, p.sender, p.ref, p.amount, p.status === 'void' ? 'void' : p.status === 'rejected' ? 'refused' : p.status === 'unconfirmed' ? (p.amount < 0 ? 'refund waiting' : 'unconfirmed') : 'confirmed', p.byName]; }))
    : [['Date', 'Category', 'Description', 'Paid to', 'Amount', 'Litres', 'Status', 'Recorded by']].concat(R.expenses.map(function (e) { return [fmtDT(e.at), EXPENSE_CATS[e.category] || e.category, e.description, e.paidTo, e.amount, e.litres || '', e.status, e.byName]; }));
  var csv = rows.map(function (r) { return r.map(function (c) { var isNum = typeof c === 'number'; c = String(c == null ? '' : c); if (!isNum && /^[=+\-@]/.test(c)) c = "'" + c; /* a spreadsheet must not run a guest's name as a formula */ return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'wiwe-' + kind + '-' + R.month + '.csv'; a.click();
}

/* ---------- Admin settings (admin accounts only; the database rules enforce it) ---------- */
VIEWS.admin = {
  title: 'Admin settings',
  render: function () {
    if (!isAdmin()) return emptyState('admin', 'Only an admin can open admin settings', 'Ask an admin if something needs changing.');
    var tab = curTab('admin', 'general'), waiting = adminReqsForMe().length;
    var html = tabs('admin', [['general', 'General'], ['rooms', 'Rooms and rates'], ['staff', 'Staff' + (waiting ? ' (' + waiting + ')' : '')], ['receipt', 'Receipt'], ['audit', 'Activity log'], ['data', 'Backup']]);
    if (tab === 'general') html += adminGeneral();
    if (tab === 'rooms') html += adminRooms();
    if (tab === 'staff') html += adminStaff();
    if (tab === 'receipt') { html += adminReceipt(); setTimeout(rdPreview, 0); }
    if (tab === 'audit') { html += '<div class="card" id="audit-box">' + skeleton(8) + '</div>'; setTimeout(loadAudit, 0); }
    if (tab === 'data') html += '<div class="card"><h2>Backup</h2><p class="muted">Downloads everything (except photos) as one JSON file. Do this monthly and keep it safe.</p><button class="btn primary" type="button" onclick="backup()">Download backup</button></div>' + adminCleanup();
    return html;
  }
};

function adminGeneral() {
  var s = S.settings;
  return '<form class="form" onsubmit="event.preventDefault();saveGeneral()"><div class="note">Tap a section to open it. One Save button at the bottom saves all of them.</div>' +
    fold('g-money', 'Guests and money', '<div class="fields">' +
    '<label class="check span-all"><input type="checkbox" id="g-caution"' + (s.cautionEnabled ? ' checked' : '') + '>Collect a refundable caution fee at check-in</label>' +
    field('Caution fee (₦)', input('g-camt', s.cautionAmount, 'inputmode="numeric"')) +
    field('Check-in time', input('g-in', s.checkInTime, 'type="time"')) + field('Check-out time', input('g-out', s.checkOutTime, 'type="time"')) +
    field('Hold reservations for (hours)', input('g-hold', s.holdHours, 'type="number" min="0"'), '', 'After the expected arrival time') +
    field('Approval needed above (₦)', input('g-limit', s.approvalLimit, 'inputmode="numeric"'), '', 'Expenses and purchases above this wait for you') +
    '<label class="check span-all"><input type="checkbox" id="g-reqid"' + (s.requireId ? ' checked' : '') + '>Check-in needs an ID number or a photo of the ID</label>' +
    '</div>', true) +
    fold('g-places', 'Places', field('Common areas (one per line)', '<textarea id="g-areas">' + esc((s.commonAreas || []).join('\n')) + '</textarea>', '', 'Used for maintenance and assets, e.g. Generator house, Reception')) +
    fold('g-clean', 'Cleaning checklists', '<div class="fields">' + field('Turnover (after check-out)', '<textarea id="g-turn" rows="10">' + esc((s.turnoverSteps || []).join('\n')) + '</textarea>', '', 'One step per line. Steps with the word "kitchen" only show for kitchen rooms.') +
    field('Daily service (guest staying)', '<textarea id="g-daily" rows="10">' + esc((s.dailySteps || []).join('\n')) + '</textarea>') +
    '<label class="check span-all"><input type="checkbox" id="g-dailyon"' + (s.dailyCleaning !== false ? ' checked' : '') + '>Create a daily cleaning task for every guest staying more than one night</label></div>') +
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
    S.data.roomTypes.map(function (t) { var n = S.data.rooms.filter(function (r) { return r.typeId === t.id && !r.archived; }).length; return '<div class="list-row clickable" onclick="openRoomType(\'' + t.id + '\')"><span class="main-t"><strong>' + esc(t.name) + (t.hasKitchen ? ' · kitchen' : '') + '</strong><span>' + (t.items || []).length + ' items checked at check-out · ' + (n ? n + ' room' + (n > 1 ? 's' : '') : '<span class="bad-text">no rooms use this type yet</span>') + '</span></span><span class="row"><strong class="money">' + money(t.rate) + ' / night</strong>' + (n ? '' : '<button class="btn small danger" type="button" onclick="event.stopPropagation();deleteRoomType(\'' + t.id + '\')">Delete</button>') + '</span></div>'; }).join('') + '</div>';
  html += '<div class="card"><div class="card-head"><h2>2 · Rooms (shown on the Room board)</h2><button class="btn small" type="button" onclick="openRoomEdit()">+ Room</button></div><div class="table-wrap"><table><thead><tr><th>Floor</th><th>Room</th><th>Type</th><th class="right">Rate</th><th>Status</th></tr></thead><tbody>' +
    roomsSorted().map(function (r) { return '<tr class="clickable" onclick="openRoomEdit(\'' + r.id + '\')"><td>' + esc(floorName(roomFloor(r))) + '</td><td><strong>' + esc(r.number) + '</strong></td><td>' + esc(roomType(r).name) + '</td><td class="right money">' + money(roomType(r).rate) + '</td><td>' + pill(ROOM_STATUS[r.status || 'ready'].label, ROOM_STATUS[r.status || 'ready'].cls) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  return html;
}
function openRoomType(id) {
  var t = byId(S.data.roomTypes, id) || { items: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveRoomType(\'' + (id || '') + '\')"><div class="fields">' +
    field('Name', input('rt-name', t.name, 'required')) + field('Rate per night (₦)', input('rt-rate', t.rate, 'inputmode="numeric" required')) +
    '<label class="check span-all"><input type="checkbox" id="rt-kit"' + (t.hasKitchen ? ' checked' : '') + '>Has a kitchen</label>' +
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
async function deleteRoomType(id) {
  var t = byId(S.data.roomTypes, id);
  if (S.data.rooms.some(function (r) { return r.typeId === id && !r.archived; })) return toast('Rooms still use this type', true);
  if (!(await ask({ title: 'Delete room type "' + t.name + '"?', text: 'No rooms use it. You can undo this for a few seconds.', ok: 'Delete', danger: true }))) return;
  var copy = Object.assign({}, t); delete copy.id;
  db.collection('roomTypes').doc(id).delete().catch(fail); audit('room_type_deleted', 'roomType', id, t.name);
  toast('Room type deleted', false, { label: 'Undo', fn: function () { db.collection('roomTypes').doc(id).set(copy).catch(fail); audit('room_type_restored', 'roomType', id, t.name); toast('Room type restored'); } });
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
async function archiveRoom(id) {
  var r = byId(S.data.rooms, id); if (r.status === 'occupied') return toast('A guest is in this room', true);
  if (!(await ask({ title: 'Remove Room ' + r.number + '?', text: 'It disappears from the board. Its history is kept.', ok: 'Remove room', danger: true }))) return;
  db.collection('rooms').doc(id).update({ archived: true }).catch(fail); audit('room_removed', 'room', id, r.number); closeModal();
  toast('Room ' + r.number + ' removed', false, { label: 'Undo', fn: function () { db.collection('rooms').doc(id).update({ archived: false }).catch(fail); audit('room_restored', 'room', id, r.number); toast('Room ' + r.number + ' is back'); } });
}

function adminStaff() {
  var active = sortBy(S.data.users.filter(function (u) { return u.active !== false; }), function (u) { return u.name; });
  var past = sortBy(S.data.users.filter(function (u) { return u.active === false; }), function (u) { return -(u.endedAt || 0); });
  return adminChangesCard() + '<div class="card"><div class="card-head"><h2>Staff accounts</h2><button class="btn primary small" type="button" onclick="openStaff()">+ Add account</button></div>' +
    active.map(function (u) {
      var self = u.id === S.user.uid, waiting = u.onboarded === false;
      return '<div class="list-row staff-row">' + avatar(u) + '<span class="main-t"><strong>' + esc(u.name) + ' · @' + esc(u.username) + '</strong><span>' + esc((u.roles || []).map(function (r) { return ROLES[r]; }).join(', ') || 'No role yet') + (u.handoverAt ? ' · holder since ' + fmtDate(u.handoverAt) : '') + '</span></span>' +
        '<span class="row">' + (waiting ? pill('Not onboarded yet', 'st-alert') : '') + (onHold(u) ? pill('Reset · on hold', 'st-alert') : '') +
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
    (isActiveAdmin(u) ? '<div class="note warn">This is an admin account. A password reset happens now, but the account cannot approve admin changes for 2 hours unless another admin confirms the reset. Handing it to a new person needs a second admin to approve.</div>' : '') +
    '<div class="muted small">The current password stops working immediately. You get a new onboarding link for them to choose a password. Same username and roles.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="ho-save">Make new link</button></div></form>';
  openModal('Reset password / hand over · @' + u.username, b);
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
    'Still to confirm (all days): ' + unconfirmedPayments().length + ' · ' + money(sum(unconfirmedPayments(), function (p) { return p.amount; })),
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
// Rules older than v3.6 have no "meta/admins" section, so even an admin is refused this harmless read.
async function checkRules() {
  if (!isAdmin()) return;
  try { await db.collection('meta').doc('admins').get({ source: 'server' }); S.rulesOutdated = false; } // "meta/admins" is only readable under the v3.6 rules
  catch (e) { S.rulesOutdated = /permission/i.test((e && (e.code || e.message)) || ''); }
  scheduleRender();
}
function openRulesHelp() {
  var pid = FIREBASE_CONFIG.projectId;
  openModal('Update the security rules',
    '<div class="note warn">The app was updated but the database is still using older security rules, so some actions (removing test records, admin approvals, profile photos and others) are refused.</div>' +
    '<ol class="steps-list">' +
    '<li>Open the latest rules: <a href="https://github.com/SSSeyon/wiwe/blob/main/firestore.rules" target="_blank" rel="noopener">firestore.rules on GitHub</a>, then click the <strong>Copy raw file</strong> button (two squares icon).</li>' +
    '<li>Open <a href="https://console.firebase.google.com/project/' + esc(pid) + '/firestore/rules" target="_blank" rel="noopener">Firebase → Firestore → Rules</a>.</li>' +
    '<li>Select everything in the editor, paste, and click <strong>Publish</strong>.</li>' +
    '<li>Come back here and press <strong>Check again</strong>.</li></ol>' +
    '<div class="form-actions"><button class="btn primary" type="button" onclick="closeModal();checkRules().then(function(){toast(S.rulesOutdated ? \'Still the old rules. Publishing can take a minute.\' : \'Rules are up to date\', S.rulesOutdated)})">Check again</button></div>');
}

/* ---------- Remove test records ---------- */
// Trial check-ins, payments, sales and the like, made while learning the app. The owner picks a period,
// unticks anything real, and the rest is deleted for good. Rooms, stock levels and guest balances are put
// back as they were before; photos attached to the records go too. The activity log keeps a note of it.
var CLEAN_COLS = [
  ['stays', 'Stays and reservations', 'createdAt'],
  ['payments', 'Payments', 'at'],
  ['moves', 'Stock movements and item sales', 'at'],
  ['expenses', 'Expenses', 'at'],
  ['tasks', 'Housekeeping tasks', 'createdAt'],
  ['jobs', 'Maintenance jobs', 'createdAt'],
  ['incidents', 'Leak watch items', 'at'],
  ['laundry', 'Laundry batches', 'sentAt'],
  ['shifts', 'Front desk shifts', 'openedAt']
];
var CLEAN = { from: '', to: '', found: null, skip: {}, open: {}, busy: false };
function cleanWhen(col, r) { var f = CLEAN_COLS.filter(function (c) { return c[0] === col; })[0]; return r[f ? f[2] : 'at']; }
// [main line, details (already escaped)]
function cleanLabel(col, r) {
  if (col === 'stays') return [r.guestName || 'Guest', dots(['Room ' + r.roomNo, fmtDate(r.checkInDate) + ' → ' + fmtDate(r.checkOutDate), (STAY_STATUS[r.status] || [r.status])[0]])];
  if (col === 'payments') return [money(r.amount) + ' · ' + (PAY_KIND[r.kind] || r.kind), dots([r.guestName, r.roomNo ? 'Room ' + r.roomNo : '', r.ref ? 'ref ' + r.ref : '', r.status])];
  if (col === 'moves') return [({ sale: 'Sale', purchase: 'Bought', issue: 'Issued', count: 'Stock count' }[r.type] || 'Adjustment') + ' · ' + Math.abs(r.qty || 0) + ' × ' + (r.itemName || 'item'), dots([r.total ? money(r.total) : '', r.roomNo ? 'Room ' + r.roomNo : '', r.note])];
  if (col === 'expenses') return [money(r.amount) + ' · ' + (EXPENSE_CATS[r.category] || r.category), dots([r.description, r.status])];
  if (col === 'tasks') return ['Room ' + r.roomNo + ' · ' + (TASK_TYPE[r.type] || [r.type])[0], dots([r.title, (TASK_STATUS[r.status] || [r.status])[0]])];
  if (col === 'jobs') return [r.title || 'Job', dots([r.locationLabel, r.cost ? money(r.cost) : '', r.status])];
  if (col === 'incidents') return [r.title || 'Incident', r.resolved ? 'resolved' : 'open'];
  if (col === 'laundry') return [r.vendor || 'Laundry', esc((r.items || []).map(function (it) { return it.qty + ' ' + it.name; }).join(', '))];
  if (col === 'shifts') return ['Shift · ' + (r.openedByName || ''), r.closedAt ? 'closed ' + esc(fmtDT(r.closedAt)) : 'open'];
  return [r.id, ''];
}
// Opening stock is usually real, so it starts unticked
function cleanDefaultSkip(col, r) { return col === 'moves' && r.type === 'adjust'; }
function adminCleanup() {
  var from = CLEAN.from || addDays(todayStr(), -30), to = CLEAN.to || todayStr(), F = CLEAN.found;
  var h = '<div class="card" id="clean-card"><h2>Remove test records</h2>' +
    '<p class="muted">For check-ins, payments, sales and other records made while trying the app. Pick the days you were testing, untick anything real, then delete. Rooms, stock levels and guest balances go back to how they were. This cannot be undone, so download a backup first.</p>' +
    '<form class="form" onsubmit="event.preventDefault();findTestRecords()"><div class="fields">' +
    field('From', '<input type="date" id="cl-from" value="' + from + '" max="' + todayStr() + '" required>') + field('To', '<input type="date" id="cl-to" value="' + to + '" max="' + todayStr() + '" required>') +
    '</div><div class="form-actions"><button class="btn" type="button" onclick="backup()">Download backup</button><button class="btn primary" type="submit"' + (CLEAN.busy ? ' disabled' : '') + '>' + (CLEAN.busy === 'find' ? 'Looking…' : 'Find records') + '</button></div></form>';
  if (F) {
    var total = 0, picked = 0;
    var groups = CLEAN_COLS.map(function (c) {
      var rows = F[c[0]] || []; if (!rows.length) return '';
      total += rows.length;
      var on = rows.filter(function (r) { return !CLEAN.skip[c[0] + '/' + r.id]; }).length; picked += on;
      return '<details class="cl-group"' + ((c[0] in CLEAN.open ? CLEAN.open[c[0]] : rows.length <= 12) ? ' open' : '') + ' ontoggle="CLEAN.open[\'' + c[0] + '\']=this.open"><summary><label class="cl-all" onclick="event.stopPropagation()"><input type="checkbox"' + (on === rows.length ? ' checked' : '') + ' onchange="cleanTickAll(\'' + c[0] + '\',this.checked)"> ' + esc(c[1]) + '</label><span class="muted">' + on + ' of ' + rows.length + ' ticked</span></summary>' +
        rows.map(function (r) {
          var l = cleanLabel(c[0], r), k = c[0] + '/' + r.id;
          return '<label class="cl-row"><input type="checkbox"' + (CLEAN.skip[k] ? '' : ' checked') + ' onchange="cleanTick(\'' + k + '\',this.checked);render()"><span class="main-t"><strong>' + esc(l[0]) + '</strong><span>' + (l[1] ? l[1] + ' · ' : '') + dots([r.byName || r.openedByName || r.sentByName, fmtDT(cleanWhen(c[0], r))]) + '</span></span></label>';
        }).join('') + '</details>';
    }).join('');
    h += '<div class="cl-res">' + (total ? groups +
      '<div class="note">Anything linked to a ticked stay is removed with it, even from other days: its payments, cleaning tasks and sales on its bill.</div>' +
      '<div class="form-actions"><button class="btn danger" type="button"' + (picked && !CLEAN.busy ? '' : ' disabled') + ' onclick="deleteTestRecords()">' + (CLEAN.busy === 'del' ? 'Deleting…' : 'Delete ' + picked + ' record' + (picked === 1 ? '' : 's')) + '</button></div>'
      : '<div class="muted">Nothing was recorded between ' + fmtDate(CLEAN.from) + ' and ' + fmtDate(CLEAN.to) + '.</div>') + '</div>';
  }
  return h + '</div>';
}
function cleanTick(k, on) { if (on) delete CLEAN.skip[k]; else CLEAN.skip[k] = true; }
function cleanTickAll(col, on) { (CLEAN.found[col] || []).forEach(function (r) { cleanTick(col + '/' + r.id, on); }); render(); }
async function findTestRecords() {
  var from = val('cl-from'), to = val('cl-to');
  if (!from || !to || from > to) return toast('Pick a start day before the end day', true);
  CLEAN.from = from; CLEAN.to = to; CLEAN.busy = 'find'; viewDirty = false; render();
  var start = parseDate(from).getTime(), end = parseDate(addDays(to, 1)).getTime(), found = {}, skip = {};
  try {
    for (var i = 0; i < CLEAN_COLS.length; i++) {
      var c = CLEAN_COLS[i], snap = await db.collection(c[0]).where(c[2], '>=', start).where(c[2], '<', end).get();
      found[c[0]] = sortBy(docRows(snap), function (r) { return r[c[2]] || 0; });
      found[c[0]].forEach(function (r) { if (cleanDefaultSkip(c[0], r)) skip[c[0] + '/' + r.id] = true; });
    }
    CLEAN.found = found; CLEAN.skip = skip;
  } catch (e) { fail(e); }
  CLEAN.busy = false; render();
}
// Photo ids sit in fields such as photos, idPhotos, afterPhotos, receiptPhotos
function cleanPhotoIds(r) { var out = []; Object.keys(r).forEach(function (k) { if (/photos$/i.test(k) && Array.isArray(r[k])) r[k].forEach(function (p) { if (typeof p === 'string' && p) out.push(p); }); }); return out; }
async function deleteTestRecords() {
  var F = CLEAN.found; if (!F || CLEAN.busy) return;
  var sel = {}; CLEAN_COLS.forEach(function (c) { sel[c[0]] = (F[c[0]] || []).filter(function (r) { return !CLEAN.skip[c[0] + '/' + r.id]; }); });
  var stayIds = {}; sel.stays.forEach(function (s) { stayIds[s.id] = 1; });
  CLEAN.busy = 'del'; render();
  try {
    // Records hanging off a ticked stay, whatever day they were made
    var linked = 0, ids = Object.keys(stayIds), lk = ['payments', 'tasks', 'moves'];
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < lk.length; j++) {
        var snap = await db.collection(lk[j]).where('stayId', '==', ids[i]).get();
        docRows(snap).forEach(function (r) { if (!sel[lk[j]].some(function (x) { return x.id === r.id; })) { sel[lk[j]].push(r); linked++; } });
      }
    }
    var count = sum(Object.keys(sel), function (k) { return sel[k].length; });
    var parts = CLEAN_COLS.filter(function (c) { return sel[c[0]].length; }).map(function (c) { return sel[c[0]].length + ' ' + c[1].toLowerCase(); });
    var typed = await askText({ title: 'Delete ' + count + ' record' + (count === 1 ? '' : 's') + ' for good?', text: parts.join('\n') + (linked ? '\n(' + linked + ' of these are linked to the ticked stays.)' : '') + '\n\nThis cannot be undone. Type DELETE to go ahead.', label: 'Type DELETE', ok: 'Delete for good', danger: true });
    if (!typed || typed.trim().toUpperCase() !== 'DELETE') { CLEAN.busy = false; render(); if (typed) toast('Nothing deleted: the word did not match', true); return; }
    // A payment taken off a stay that is kept: the guest owes it again (as when a payment is voided)
    var stayFix = {}, stays = {};
    for (var p = 0; p < sel.payments.length; p++) {
      var x = sel.payments[p], a = x.amount;
      if (!x.stayId || stayIds[x.stayId] || !(a > 0) || x.status === 'void' || x.status === 'rejected') continue;
      if (PAY_ON_STAY.indexOf(x.kind) < 0 && x.kind !== 'caution') continue;
      var s = stays[x.stayId] || findStay(x.stayId);
      if (!s) { var d = await db.collection('stays').doc(x.stayId).get(); if (!d.exists) continue; s = Object.assign({ id: d.id }, d.data()); }
      stays[x.stayId] = s;
      stayFix[x.id] = x.kind === 'caution' ? { caution: FV.increment(-a) }
        : s.status === 'reserved' ? { paid: FV.increment(-a), deposit: FV.increment(-a) } : { paid: FV.increment(-a), balance: FV.increment(a) };
    }
    // Rooms that hold a ticked stay are freed once that stay is gone
    var rooms = {}; S.data.rooms.forEach(function (r) { if (r.currentStayId && stayIds[r.currentStayId]) rooms[r.currentStayId] = r; });
    // Each record is its own write (see writeEach). What it put back (stock, a balance, a room)
    // is undone only after the record itself is gone, so running the clean-up again never undoes twice.
    var gone = {}, jobs = [];
    Object.keys(sel).forEach(function (col) {
      sel[col].forEach(function (r) {
        jobs.push(async function () {
          await db.collection(col).doc(r.id).delete();
          gone[col + '/' + r.id] = 1;
          var pids = cleanPhotoIds(r);
          for (var i = 0; i < pids.length; i++) await db.collection('photos').doc(pids[i]).delete().catch(function () {});
          if (col === 'moves' && r.itemId && r.qty && byId(S.data.items, r.itemId)) await db.collection('items').doc(r.itemId).update({ qty: FV.increment(-r.qty) });
          if (col === 'payments' && stayFix[r.id]) await db.collection('stays').doc(r.stayId).update(stayFix[r.id]);
          if (col === 'stays' && rooms[r.id]) await db.collection('rooms').doc(rooms[r.id].id).update({ status: 'ready', currentStayId: null });
        });
      });
    });
    var res = await writeEach(jobs), done = Object.keys(gone).length;
    var freed = Object.keys(rooms).filter(function (id) { return gone['stays/' + id]; }).map(function (id) { return rooms[id]; });
    audit('test_records_deleted', 'all', '', parts.join(', ') + ' · recorded ' + CLEAN.from + ' to ' + CLEAN.to + (res.bad.length ? ' · ' + done + ' deleted, ' + res.bad.length + ' failed' : ''));
    CLEAN.found = null; CLEAN.skip = {};
    var roomsMsg = freed.length ? '. Room' + (freed.length === 1 ? ' ' : 's ') + freed.map(function (r) { return r.number; }).join(', ') + (freed.length === 1 ? ' is' : ' are') + ' Ready again' : '';
    if (res.bad.length) {
      var why = /permission/i.test((res.bad[0] && (res.bad[0].code || res.bad[0].message)) || '') ? 'refused by the security rules' : ((res.bad[0] && res.bad[0].message) || 'an error');
      toast(done + ' deleted' + roomsMsg + '. ' + res.bad.length + ' step' + (res.bad.length === 1 ? '' : 's') + ' failed (' + why + '). Tap Find records again to see what is left.', true);
    } else toast(count + ' test record' + (count === 1 ? '' : 's') + ' deleted' + roomsMsg + '.');
  } catch (e) { fail(e); }
  CLEAN.busy = false; render();
}
