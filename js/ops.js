/* =========================================================
   OPERATIONS: housekeeping, maintenance + assets,
   inventory (store), expenses
   ========================================================= */

/* ---------- Housekeeping tasks ---------- */
var TASK_TYPE = { turnover: ['Turnover', 'st-dirty'], daily: ['Daily service', 'st-occupied'], request: ['Request', 'st-reserved'] };
var TASK_STATUS = { todo: ['To do', 'st-dirty'], in_progress: ['In progress', 'st-cleaning'], inspection: ['Inspection', 'st-inspect'], done: ['Done', 'st-ready'] };

function createTurnoverTask(room, stay, note) {
  if (!room) return;
  var steps = (S.settings.turnoverSteps || []).filter(function (s) { return roomType(room).hasKitchen || !/kitchen/i.test(s); });
  db.collection('tasks').add({
    roomId: room.id, roomNo: room.number, type: 'turnover', status: 'todo',
    steps: steps.map(function (l) { return { label: l, done: false }; }), restock: [], photos: [],
    stayId: stay ? stay.id : '', note: note || (stay ? 'Guest ' + stay.guestName + ' checked out ' + fmtTime(Date.now()) : ''),
    createdAt: Date.now(), by: S.user.uid, byName: meName()
  }).catch(fail);
}
// Daily service for guests staying more than one night: one task per stay per day (fixed id, so it is never doubled)
async function ensureDailyTasks() {
  if (S.settings.dailyCleaning === false) return;
  if (!has('manager', 'frontdesk')) return;
  var t = todayStr();
  S.data.stays.filter(function (s) { return s.status === 'checked_in' && s.checkInDate < t && s.checkOutDate > t; }).forEach(function (s) {
    var ref = db.collection('tasks').doc('daily_' + s.id + '_' + t);
    db.runTransaction(function (tx) {
      return tx.get(ref).then(function (d) {
        if (d.exists) return;
        tx.set(ref, { roomId: s.roomId, roomNo: s.roomNo, type: 'daily', status: 'todo', steps: (S.settings.dailySteps || []).map(function (l) { return { label: l, done: false }; }), restock: [], photos: [], stayId: s.id, note: 'Guest in: ' + s.guestName, createdAt: Date.now(), by: S.user.uid, byName: meName() });
      });
    }).catch(function () {});
  });
}
function taskProgress(t) { var n = (t.steps || []).length, d = (t.steps || []).filter(function (s) { return s.done; }).length; return { n: n, d: d, pct: n ? Math.round(d / n * 100) : 0 }; }
function taskCard(t) {
  var tt = TASK_TYPE[t.type] || ['', ''], ts = TASK_STATUS[t.status] || ['', ''], p = taskProgress(t), mine = t.assignee === S.user.uid;
  return '<button type="button" class="task-card' + (mine && t.status === 'in_progress' ? ' mine' : '') + '" onclick="go(\'task\',{id:\'' + t.id + '\'})">' +
    '<span class="row between"><span class="no">Room ' + esc(t.roomNo) + '</span>' + pill(t.status === 'todo' ? tt[0] : ts[0], t.status === 'todo' ? tt[1] : ts[1]) + '</span>' +
    '<span class="strong">' + esc(tt[0]) + (t.type === 'request' && t.title ? ': ' + esc(t.title) : '') + '</span>' +
    '<span class="muted">' + esc(t.note || '') + '</span>' +
    (t.assigneeName ? '<span class="muted">' + esc(t.assigneeName) + (t.startedAt ? ' · started ' + fmtTime(t.startedAt) : '') + '</span>' : '') +
    (p.n && t.status !== 'todo' ? '<span class="muted">' + p.d + ' of ' + p.n + ' steps</span><span class="progress"><span style="width:' + p.pct + '%"></span></span>' : '') +
    '</button>';
}
VIEWS.housekeeping = {
  title: 'Housekeeping',
  actions: function () { return curTab('housekeeping', 'tasks') === 'laundry' ? '<button class="btn primary" type="button" onclick="openLaundrySend()">+ Send laundry</button>' : '<button class="btn" type="button" onclick="openRequest()">+ Guest request</button>'; },
  render: function () {
    var hkTabs = tabs('housekeeping', [['tasks', 'Cleaning tasks'], ['laundry', 'Laundry (' + S.data.laundry.filter(function (l) { return l.status === 'out'; }).length + ' out)']]);
    if (curTab('housekeeping', 'tasks') === 'laundry') return hkTabs + laundryView();
    var open = S.data.tasks.filter(function (t) { return t.status !== 'done'; });
    var boss = has('manager', 'frontdesk');
    var inspect = open.filter(function (t) { return t.status === 'inspection'; });
    var mine = open.filter(function (t) { return t.assignee === S.user.uid && t.status === 'in_progress'; });
    var todo = open.filter(function (t) { return t.status === 'todo'; });
    var others = open.filter(function (t) { return t.status === 'in_progress' && t.assignee !== S.user.uid; });
    var doneToday = S.data.tasks.filter(function (t) { return t.status === 'done' && t.doneAt && dateStr(new Date(t.doneAt)) === todayStr(); });
    var order = { turnover: 0, request: 1, daily: 2 };
    todo = sortBy(todo, function (t) { return order[t.type] * 1e13 + t.createdAt; });
    var html = hkTabs + '<section class="grid-stats">' + stat('To do', todo.length, '') + stat('In progress', mine.length + others.length, '') + stat('Waiting inspection', inspect.length, '', inspect.length && boss ? 'warn' : '') + stat('Done today', doneToday.length, '') + '</section>';
    if (boss && inspect.length) html += '<div class="card"><h2>Waiting for inspection</h2><div class="task-grid">' + inspect.map(taskCard).join('') + '</div></div>';
    if (mine.length) html += '<div class="card"><h2>My tasks in progress</h2><div class="task-grid">' + mine.map(taskCard).join('') + '</div></div>';
    html += '<div class="card"><h2>To do</h2>' + (todo.length ? '<div class="task-grid">' + todo.map(taskCard).join('') + '</div>' : '<div class="muted">Nothing waiting.</div>') + '</div>';
    if (others.length) html += '<div class="card"><h2>Others in progress</h2><div class="task-grid">' + others.map(taskCard).join('') + '</div></div>';
    if (!boss && inspect.length) html += '<div class="card"><h2>Sent for inspection</h2><div class="task-grid">' + inspect.map(taskCard).join('') + '</div></div>';
    html += '<div class="card"><h2>Done today</h2>' + (doneToday.length ? doneToday.map(function (t) { return '<div class="list-row clickable" onclick="go(\'task\',{id:\'' + t.id + '\'})"><span class="main-t"><strong>Room ' + esc(t.roomNo) + ' · ' + esc((TASK_TYPE[t.type] || [''])[0]) + '</strong><span>' + esc(t.assigneeName || '') + ' · ' + fmtTime(t.doneAt) + '</span></span>' + pill('Done', 'st-ready') + '</div>'; }).join('') : '<div class="muted">Nothing yet.</div>') + '</div>';
    return html;
  }
};
function openRequest() {
  var rooms = roomsSorted();
  var b = '<form class="form" onsubmit="event.preventDefault();saveRequest()"><div class="fields">' +
    field('Room', '<select id="rq-room">' + rooms.map(function (r) { return '<option value="' + r.id + '">' + esc(r.number) + '</option>'; }).join('') + '</select>') +
    field('What is needed?', input('rq-title', '', 'required placeholder="e.g. extra towels, room cleaning"')) +
    field('Assign to', '<select id="rq-who"><option value="">Anyone</option>' + staffList('housekeeping').map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('') + '</select>') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Create task</button></div></form>';
  openModal('Guest request', b);
}
function saveRequest() {
  var r = byId(S.data.rooms, val('rq-room')), who = val('rq-who');
  db.collection('tasks').add({ roomId: r.id, roomNo: r.number, type: 'request', title: val('rq-title'), status: 'todo', steps: [{ label: val('rq-title'), done: false }], restock: [], photos: [], assignee: who || '', assigneeName: who ? userName(who) : '', note: '', createdAt: Date.now(), by: S.user.uid, byName: meName() }).catch(fail);
  closeModal(); toast('Task created');
}

/* ---------- One task (works well on a phone) ---------- */
VIEWS.task = {
  title: function () { var t = byId(S.data.tasks, S.params.id); return t ? 'Room ' + t.roomNo : 'Task'; },
  eyebrow: function () { var t = byId(S.data.tasks, S.params.id); return t ? (TASK_TYPE[t.type] || [''])[0] : ''; },
  actions: function () { return '<button class="btn" type="button" onclick="go(\'housekeeping\')">← All tasks</button>'; },
  render: function () {
    var t = byId(S.data.tasks, S.params.id); if (!t) return '<div class="card empty">Task not found.</div>';
    var ts = TASK_STATUS[t.status], p = taskProgress(t), editable = t.status === 'in_progress' && (t.assignee === S.user.uid || has('manager'));
    var html = '<div class="card"><div class="row between"><div class="row">' + pill(ts[0], ts[1]) + (t.assigneeName ? '<span class="muted">' + esc(t.assigneeName) + '</span>' : '') + '</div><strong style="font-family:var(--font-display);font-size:18px;color:var(--brand)">' + p.d + ' / ' + p.n + '</strong></div>' +
      '<div class="progress" style="margin-top:10px"><span style="width:' + p.pct + '%"></span></div>' + (t.note ? '<div class="muted" style="margin-top:10px">' + esc(t.note) + '</div>' : '') + (t.sentBack ? '<div class="note bad" style="margin-top:10px">Sent back: ' + esc(t.sentBack) + '</div>' : '') + '</div>';
    if (t.status === 'todo') html += '<button class="btn primary block" type="button" onclick="startTask(\'' + t.id + '\')">Start ' + (t.type === 'turnover' ? 'cleaning' : 'task') + '</button>';
    html += '<div class="card"><h2>Checklist</h2>' + (t.steps || []).map(function (s, i) { return '<label class="step' + (s.done ? ' done' : '') + '"><input type="checkbox"' + (s.done ? ' checked' : '') + (editable ? '' : ' disabled') + ' onchange="toggleStep(\'' + t.id + '\',' + i + ',this.checked)"><span>' + esc(s.label) + '</span></label>'; }).join('') + '</div>';
    html += '<div class="card"><div class="card-head"><h2>Restocked from store</h2>' + (editable ? '<button class="btn small" type="button" onclick="openRestock(\'' + t.id + '\')">+ Add</button>' : '') + '</div>' +
      ((t.restock || []).length ? '<div class="chips">' + t.restock.map(function (r) { return '<span class="chip">' + esc(r.name) + ' × ' + r.qty + '</span>'; }).join('') + '</div><div class="muted small" style="margin-top:8px">Taken out of store stock and logged to Room ' + esc(t.roomNo) + '.</div>' : '<div class="muted">Nothing yet. Log every item you put in the room.</div>') + '</div>';
    html += '<div class="card"><div class="card-head"><h2>Photos</h2>' + (editable ? '<button class="btn small" type="button" onclick="addTaskPhoto(\'' + t.id + '\')">+ Photo</button>' : '') + '</div>' + ((t.photos || []).length ? '<div class="thumbs">' + thumbs(t.photos) + '</div>' : '<div class="muted">A photo of the finished room helps inspection.</div>') + '</div>';
    if (editable) {
      html += '<div class="row">' + (t.type === 'turnover' ? '<button class="btn primary" type="button" onclick="finishTask(\'' + t.id + '\')">Send for inspection</button>' : '<button class="btn primary" type="button" onclick="finishTask(\'' + t.id + '\')">Mark done</button>') +
        '<button class="btn" type="button" onclick="openReport(\'' + t.roomId + '\')">Report a fault</button></div>';
    }
    if (t.status === 'inspection' && has('manager', 'frontdesk')) {
      html += '<div class="card"><h2>Inspection</h2><div class="muted" style="margin-bottom:10px">Walk into the room. Check the bed, bathroom, floor, smell, and that everything works.</div><div class="row"><button class="btn primary" type="button" onclick="passInspection(\'' + t.id + '\')">Passed · room is Ready</button><button class="btn danger" type="button" onclick="failInspection(\'' + t.id + '\')">Send back</button></div></div>';
    }
    if (t.status === 'done') html += '<div class="note ok">Done ' + fmtDT(t.doneAt) + (t.inspectedByName ? ' · inspected by ' + esc(t.inspectedByName) : '') + '</div>';
    return html;
  }
};
function startTask(id) {
  var t = byId(S.data.tasks, id), b = db.batch();
  b.update(db.collection('tasks').doc(id), { status: 'in_progress', assignee: S.user.uid, assigneeName: meName(), startedAt: Date.now() });
  if (t.type === 'turnover') b.update(db.collection('rooms').doc(t.roomId), { status: 'cleaning' });
  b.commit().catch(fail);
}
function toggleStep(id, i, done) {
  // Change the local copy first so quick taps on several steps don't overwrite each other
  var t = byId(S.data.tasks, id); t.steps[i].done = done;
  var steps = t.steps.map(function (s) { return { label: s.label, done: !!s.done }; });
  db.collection('tasks').doc(id).update({ steps: steps }).catch(fail); scheduleRender();
}
function addTaskPhoto(id) {
  S.form = { tp: [] };
  var inp = $('photoInput'); inp.value = '';
  inp.onchange = async function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    var data = await compressImage(f, 1000, 0.6), ref = db.collection('photos').doc();
    ref.set(Object.assign({ data: data }, stamp())).catch(fail); S.photoCache[ref.id] = data;
    db.collection('tasks').doc(id).update({ photos: FV.arrayUnion(ref.id) }).catch(fail); toast('Photo added');
  };
  inp.click();
}
function finishTask(id) {
  var t = byId(S.data.tasks, id), p = taskProgress(t);
  if (p.d < p.n && !confirm((p.n - p.d) + ' step(s) are not ticked. Continue anyway?')) return;
  var b = db.batch();
  if (t.type === 'turnover') { b.update(db.collection('tasks').doc(id), { status: 'inspection', finishedAt: Date.now() }); b.update(db.collection('rooms').doc(t.roomId), { status: 'inspect' }); }
  else b.update(db.collection('tasks').doc(id), { status: 'done', doneAt: Date.now() });
  b.commit().catch(fail); toast(t.type === 'turnover' ? 'Sent for inspection' : 'Done'); go('housekeeping');
}
function passInspection(id) {
  var t = byId(S.data.tasks, id), b = db.batch(), now = Date.now();
  b.update(db.collection('tasks').doc(id), { status: 'done', doneAt: now, inspectedBy: S.user.uid, inspectedByName: meName() });
  var r = byId(S.data.rooms, t.roomId);
  if (r && r.status !== 'occupied' && r.status !== 'ooo') b.update(db.collection('rooms').doc(t.roomId), { status: 'ready', readyAt: now });
  b.commit().catch(fail); audit('inspection_passed', 'task', id, 'Room ' + t.roomNo); toast('Room ' + t.roomNo + ' is Ready'); go('housekeeping');
}
function failInspection(id) {
  var why = prompt('What needs fixing?'); if (!why) return;
  var t = byId(S.data.tasks, id), b = db.batch();
  b.update(db.collection('tasks').doc(id), { status: 'in_progress', sentBack: why });
  b.update(db.collection('rooms').doc(t.roomId), { status: 'cleaning' });
  b.commit().catch(fail); audit('inspection_failed', 'task', id, why); toast('Sent back to ' + (t.assigneeName || 'cleaner'));
}
function openRestock(taskId) {
  var items = sortBy(S.data.items.filter(function (i) { return !i.archived; }), function (i) { return i.name; });
  var b = '<form class="form" onsubmit="event.preventDefault();saveRestock(\'' + taskId + '\')"><div class="fields">' +
    field('Item', '<select id="rs-item">' + items.filter(function (i) { return !isSaleItem(i); }).map(function (i) { return '<option value="' + i.id + '">' + esc(i.name) + ' (' + i.qty + ' ' + esc(i.unit || '') + ' in store)</option>'; }).join('') + '</select>') +
    field('Quantity', input('rs-qty', 1, 'type="number" min="1" required')) +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Add</button></div></form>';
  openModal('Restock item', b);
}
function saveRestock(taskId) {
  var t = byId(S.data.tasks, taskId), it = byId(S.data.items, val('rs-item')), q = Math.max(1, num(val('rs-qty')));
  if (q > it.qty && !confirm('The store only shows ' + it.qty + ' ' + (it.unit || '') + '. Continue? (This will be flagged in the stock count.)')) return;
  var b = db.batch();
  b.update(db.collection('tasks').doc(taskId), { restock: FV.arrayUnion({ itemId: it.id, name: it.name, qty: q, at: Date.now() }) });
  b.update(db.collection('items').doc(it.id), { qty: FV.increment(-q) });
  b.set(db.collection('moves').doc(), Object.assign({ itemId: it.id, itemName: it.name, type: 'issue', qty: -q, roomNo: t.roomNo, taskId: taskId, stayId: t.stayId || '', note: 'Restock ' + (TASK_TYPE[t.type] || [''])[0] }, stamp()));
  b.commit().catch(fail); closeModal(); toast(it.name + ' × ' + q + ' logged');
}

/* =========================================================
   MAINTENANCE: jobs, assets, preventive schedule, vendors
   ========================================================= */
var JOB_STATUS = { open: ['Open', 'st-dirty'], assigned: ['Assigned', 'st-reserved'], in_progress: ['In progress', 'st-cleaning'], done: ['Fixed · verify', 'st-inspect'], verified: ['Closed', 'st-ready'], cancelled: ['Cancelled', 'st-ooo'] };
var PRIORITY = { urgent: 'Urgent (guest affected)', high: 'High', normal: 'Normal', low: 'Low' };
function jobPill(j) { var s = JOB_STATUS[j.status] || ['', '']; return pill(s[0], s[1]); }
function locations() { return roomsSorted().map(function (r) { return { v: 'room:' + r.id, l: 'Room ' + r.number }; }).concat((S.settings.commonAreas || []).map(function (a) { return { v: 'area:' + a, l: a }; })); }
function locLabel(v) { if (!v) return ''; if (v.indexOf('room:') === 0) { var r = byId(S.data.rooms, v.slice(5)); return r ? 'Room ' + r.number : ''; } return v.replace(/^area:/, ''); }

VIEWS.maintenance = {
  title: 'Maintenance',
  actions: function () { return '<button class="btn primary" type="button" onclick="openReport()">+ Report issue</button>'; },
  render: function () {
    var tab = curTab('maintenance', 'jobs'), mgr = has('manager', 'maintenance');
    var html = '<section class="grid-stats">' + stat('Open jobs', openJobs().length, openJobs().filter(function (j) { return j.priority === 'urgent'; }).length + ' urgent', openJobs().some(function (j) { return j.priority === 'urgent'; }) ? 'warn' : '') +
      stat('Rooms out of order', S.data.rooms.filter(function (r) { return r.status === 'ooo'; }).length, '') +
      stat('Service due (7 days)', serviceDue(7).length, serviceDue(0).length + ' overdue', serviceDue(0).length ? 'warn' : '') +
      stat('Repair spend this month', money(sum(S.data.jobs.filter(function (j) { return j.cost && dateStr(new Date(j.doneAt || j.createdAt)).slice(0, 7) === todayStr().slice(0, 7); }), function (j) { return j.cost; })), '') + '</section>';
    if (tab !== 'jobs') html = ''; // figures describe jobs, so show them on the Jobs tab only
    html += tabs('maintenance', [['jobs', 'Jobs'], ['assets', 'Assets (' + S.data.assets.filter(function (a) { return a.status !== 'retired'; }).length + ')'], ['schedule', 'Service schedule'], ['vendors', 'Vendors']]);
    if (tab === 'jobs') {
      var open = sortBy(openJobs(), function (j) { return ({ urgent: 0, high: 1, normal: 2, low: 3 }[j.priority] || 2) * 1e13 + j.createdAt; });
      var verify = S.data.jobs.filter(function (j) { return j.status === 'done'; });
      var closed = S.data.jobs.filter(function (j) { return j.status === 'verified' || j.status === 'cancelled'; }).slice(0, 30);
      html += (verify.length && mgr ? '<div class="card"><h2>Fixed · waiting for you to check</h2>' + verify.map(jobRow).join('') + '</div>' : '') +
        '<div class="card"><h2>Open</h2>' + (open.length ? open.map(jobRow).join('') : '<div class="muted">No open jobs.</div>') + '</div>' +
        '<div class="card"><h2>Recently closed</h2>' + (closed.length ? closed.map(jobRow).join('') : '<div class="muted">Nothing yet.</div>') + '</div>';
    }
    if (tab === 'assets') {
      var q = (S.params.aq || '').toLowerCase();
      var list = S.data.assets.filter(function (a) { return (S.params.retired || a.status !== 'retired') && (!q || (a.name + ' ' + a.category + ' ' + locLabel(a.location) + ' ' + (a.serial || '')).toLowerCase().indexOf(q) >= 0); });
      list = sortBy(list, function (a) { return locLabel(a.location) + a.name; });
      html += '<div class="row between"><input class="search" id="asset-q" type="search" placeholder="Search assets" value="' + esc(S.params.aq || '') + '" oninput="S.params.aq=this.value;render()">' + (mgr ? '<button class="btn primary" type="button" onclick="openAsset()">+ Add asset</button>' : '') + '</div>';
      html += list.length ? '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Location</th><th>Status</th><th>Next service</th><th>Warranty</th><th class="right">Repairs</th></tr></thead><tbody>' + list.map(function (a) {
        var ns = nextService(a), rep = sum(S.data.jobs.filter(function (j) { return j.assetId === a.id; }), function (j) { return j.cost; });
        return '<tr class="clickable" onclick="openAssetDetail(\'' + a.id + '\')"><td><strong>' + esc(a.name) + '</strong><div class="muted small">' + esc(a.category || '') + (a.brand ? ' · ' + esc(a.brand) : '') + '</div></td><td>' + esc(locLabel(a.location)) + '</td><td>' + pill(a.status === 'faulty' ? 'Faulty' : a.status === 'retired' ? 'Retired' : 'Working', a.status === 'faulty' ? 'st-bad' : a.status === 'retired' ? 'st-ooo' : 'st-ready') + '</td><td>' + (ns ? (ns < todayStr() ? pill('Overdue ' + fmtDate(ns), 'st-bad') : fmtDate(ns)) : '—') + '</td><td>' + (a.warrantyUntil ? (a.warrantyUntil < todayStr() ? '<span class="muted">Expired</span>' : fmtDate(a.warrantyUntil)) : '—') + '</td><td class="right money">' + money(rep) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">No assets yet. Add ACs, generator, fridges, TVs, inverters… so you can track servicing and repair costs.</div>';
    }
    if (tab === 'schedule') {
      var sched = sortBy(S.data.assets.filter(function (a) { return a.serviceDays && a.status !== 'retired'; }), function (a) { return nextService(a); });
      html += '<div class="note">Assets with a service interval show here. Set the interval when adding an asset, e.g. AC every 90 days, generator every 30 days, fumigation every 90 days (add it as an asset under Compound).</div>';
      html += sched.length ? '<div class="card">' + sched.map(function (a) {
        var ns = nextService(a), late = ns < todayStr(), soon = ns <= addDays(todayStr(), 7);
        return '<div class="list-row"><span class="main-t"><strong>' + esc(a.name) + ' · ' + esc(locLabel(a.location)) + '</strong><span>Every ' + a.serviceDays + ' days · last ' + (a.lastServiced ? fmtDate(a.lastServiced) : 'never') + '</span></span><span class="row">' + pill((late ? 'Overdue · ' : 'Due ') + fmtDate(ns), late ? 'st-bad' : soon ? 'st-alert' : 'st-ready') + (mgr ? '<button class="btn small" type="button" onclick="openService(\'' + a.id + '\')">Log service</button>' : '') + '</span></div>';
      }).join('') + '</div>' : '<div class="card empty">No service intervals set yet.</div>';
    }
    if (tab === 'vendors') {
      html += (mgr ? '<div class="row"><button class="btn primary" type="button" onclick="openVendor()">+ Add vendor</button></div>' : '') +
        (S.data.vendors.length ? '<div class="card">' + sortBy(S.data.vendors, function (v) { return v.name; }).map(function (v) {
          var spent = sum(S.data.jobs.filter(function (j) { return j.vendorId === v.id; }), function (j) { return j.cost; });
          return '<div class="list-row' + (mgr ? ' clickable" onclick="openVendor(\'' + v.id + '\')' : '') + '"><span class="main-t"><strong>' + esc(v.name) + '</strong><span>' + esc(v.trade || '') + ' · <a href="tel:' + esc(v.phone || '') + '" onclick="event.stopPropagation()">' + esc(v.phone || '') + '</a></span></span><span class="money">' + money(spent) + '</span></div>';
        }).join('') + '</div>' : '<div class="card empty">No vendors yet. Add your electrician, plumber, AC technician, generator mechanic…</div>');
    }
    return html;
  }
};
function jobRow(j) {
  var p = j.priority === 'urgent' ? pill('Urgent', 'st-bad') : j.priority === 'high' ? pill('High', 'st-alert') : '';
  return '<div class="list-row clickable" onclick="openJob(\'' + j.id + '\')"><span class="main-t"><strong>' + esc(j.title) + '</strong><span>' + esc(j.locationLabel || '') + (j.assigneeName ? ' · ' + esc(j.assigneeName) : '') + ' · ' + ago(j.createdAt) + (j.cost ? ' · ' + money(j.cost) : '') + '</span></span><span class="row">' + p + jobPill(j) + '</span></div>';
}
function openReport(roomId, ooo) {
  S.form = { jobPhotos: [] };
  var loc = roomId ? 'room:' + roomId : '';
  var b = '<form class="form" onsubmit="event.preventDefault();saveReport()"><div class="fields">' +
    field('What is wrong?', input('jb-title', '', 'required placeholder="e.g. AC not cooling"'), 'full') +
    field('Where?', '<select id="jb-loc" onchange="jbAssets()">' + opts(locations(), loc) + '</select>') +
    field('Which asset? (optional)', '<select id="jb-asset"></select>') +
    field('Priority', '<select id="jb-pri">' + objOpts(PRIORITY, 'normal') + '</select>') +
    field('Details', '<textarea id="jb-desc"></textarea>', 'full') + photoField('jobPhotos', 'Photo of the problem') + '</div>' +
    '<label class="check"><input type="checkbox" id="jb-ooo"' + (ooo ? ' checked' : '') + '>Take the room out of order (cannot be let until fixed)</label>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Report</button></div></form>';
  openModal('Report an issue', b); jbAssets();
}
function jbAssets() { var loc = val('jb-loc'); $('jb-asset').innerHTML = '<option value="">—</option>' + S.data.assets.filter(function (a) { return a.location === loc && a.status !== 'retired'; }).map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join(''); }
function saveReport() {
  var loc = val('jb-loc'), roomId = loc.indexOf('room:') === 0 ? loc.slice(5) : '', ooo = val('jb-ooo') && roomId, b = db.batch(), ref = db.collection('jobs').doc();
  var r = byId(S.data.rooms, roomId);
  if (ooo && r && r.status === 'occupied' && !confirm('A guest is in this room. Take it out of order anyway?')) return;
  b.set(ref, { title: val('jb-title'), description: val('jb-desc'), location: loc, locationLabel: locLabel(loc), roomId: roomId, assetId: val('jb-asset'), priority: val('jb-pri'), status: 'open', photos: S.form.jobPhotos, afterPhotos: [], tookRoomOut: !!ooo, createdAt: Date.now(), by: S.user.uid, byName: meName() });
  if (ooo) b.update(db.collection('rooms').doc(roomId), { status: 'ooo', oooReason: val('jb-title') });
  if (val('jb-asset')) b.update(db.collection('assets').doc(val('jb-asset')), { status: 'faulty' });
  b.commit().catch(fail); audit('job_reported', 'job', ref.id, val('jb-title') + ' · ' + locLabel(loc)); closeModal(); toast('Issue reported');
}
function openJob(id) {
  var j = byId(S.data.jobs, id); if (!j) return;
  S.form = { afterPhotos: [], receiptPhotos: [], jobId: id };
  var mgr = has('manager', 'maintenance'), a = byId(S.data.assets, j.assetId);
  var b = '<div class="row">' + jobPill(j) + pill(PRIORITY[j.priority] || j.priority, j.priority === 'urgent' ? 'st-bad' : '') + '<span class="muted">' + esc(j.locationLabel) + (a ? ' · ' + esc(a.name) : '') + '</span></div>' +
    (j.description ? '<div>' + esc(j.description) + '</div>' : '') + (j.photos && j.photos.length ? '<div><div class="muted small">Before</div><div class="thumbs">' + thumbs(j.photos) + '</div></div>' : '') +
    (j.afterPhotos && j.afterPhotos.length ? '<div><div class="muted small">After</div><div class="thumbs">' + thumbs(j.afterPhotos) + '</div></div>' : '') +
    '<div class="fields">' + info('Reported', (j.byName || '') + ', ' + fmtDT(j.createdAt)) + info('Assigned to', j.assigneeName || '—') + info('Cost', j.cost ? money(j.cost) : '—') + (j.fixNote ? info('Work done', j.fixNote) : '') + '</div>' +
    (j.receiptPhotos && j.receiptPhotos.length ? '<div><div class="muted small">Receipt</div><div class="thumbs">' + thumbs(j.receiptPhotos) + '</div></div>' : '');
  if (mgr && ['open', 'assigned', 'in_progress'].indexOf(j.status) >= 0) {
    b += '<fieldset class="group"><legend>Assign</legend><div class="fields">' +
      field('Staff or vendor', '<select id="jb-who"><option value="">—</option><optgroup label="Staff">' + staffList('maintenance').map(function (u) { return '<option value="u:' + u.id + '"' + (j.assignee === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</optgroup><optgroup label="Vendors">' + S.data.vendors.map(function (v) { return '<option value="v:' + v.id + '"' + (j.vendorId === v.id ? ' selected' : '') + '>' + esc(v.name + ' · ' + (v.trade || '')) + '</option>'; }).join('') + '</optgroup></select>') +
      '</div><div class="row"><button class="btn" type="button" onclick="assignJob(\'' + id + '\')">Save assignment</button></div></fieldset>' +
      '<fieldset class="group"><legend>Mark fixed</legend><div class="fields">' + field('What was done?', '<textarea id="jb-fix"></textarea>', 'full') + field('Total cost (₦)', input('jb-cost', '', 'inputmode="numeric"'), '', 'Parts + labour. Becomes an expense.') +
      photoField('afterPhotos', 'Photo after fixing') + photoField('receiptPhotos', 'Receipt') + '</div><div class="row"><button class="btn primary" type="button" onclick="fixJob(\'' + id + '\')">Mark fixed</button><button class="btn danger" type="button" onclick="cancelJob(\'' + id + '\')">Cancel job</button></div></fieldset>';
  }
  if (j.status === 'done' && has('manager')) b += '<div class="card"><h2>Check the repair</h2><div class="muted" style="margin-bottom:10px">Confirm it really works and the cost is fair before closing.</div><div class="row"><button class="btn primary" type="button" onclick="verifyJob(\'' + id + '\',true)">Works · close job</button><button class="btn danger" type="button" onclick="verifyJob(\'' + id + '\',false)">Not fixed · reopen</button></div></div>';
  openModal(j.title, b, true);
}
function assignJob(id) {
  var w = val('jb-who'), upd = { assignee: '', vendorId: '', assigneeName: '', status: 'open' };
  if (w.indexOf('u:') === 0) { upd.assignee = w.slice(2); upd.assigneeName = userName(upd.assignee); upd.status = 'assigned'; }
  if (w.indexOf('v:') === 0) { upd.vendorId = w.slice(2); var v = byId(S.data.vendors, upd.vendorId); upd.assigneeName = v ? v.name : ''; upd.status = 'assigned'; }
  db.collection('jobs').doc(id).update(upd).catch(fail); toast('Assigned'); closeModal();
}
function fixJob(id) {
  var j = byId(S.data.jobs, id), cost = num(val('jb-cost')), note = val('jb-fix');
  if (!note) return toast('Describe what was done', true);
  if (!S.form.afterPhotos.length && !confirm('No "after" photo. Continue anyway?')) return;
  if (cost > 0 && !S.form.receiptPhotos.length && !confirm('There is a cost but no receipt photo. Continue anyway?')) return;
  var b = db.batch(), now = Date.now();
  b.update(db.collection('jobs').doc(id), { status: 'done', fixNote: note, cost: cost, afterPhotos: S.form.afterPhotos, receiptPhotos: S.form.receiptPhotos, doneAt: now, fixedBy: S.user.uid, fixedByName: meName() });
  if (cost > 0) b.set(db.collection('expenses').doc(), Object.assign({ category: 'repairs', amount: cost, description: j.title + ' · ' + j.locationLabel, location: j.location, jobId: id, photos: S.form.receiptPhotos, status: needsApproval(cost) ? 'pending' : 'approved' }, stamp()));
  b.commit().catch(fail); audit('job_fixed', 'job', id, note + (cost ? ' · ' + money(cost) : '')); closeModal(); toast('Marked fixed. A manager will check it.');
}
function verifyJob(id, ok) {
  var j = byId(S.data.jobs, id), b = db.batch();
  if (!ok) { var why = prompt('What is still wrong?'); if (!why) return; b.update(db.collection('jobs').doc(id), { status: 'in_progress', reopenNote: why }); }
  else {
    b.update(db.collection('jobs').doc(id), { status: 'verified', verifiedBy: S.user.uid, verifiedByName: meName(), verifiedAt: Date.now() });
    if (j.assetId) b.update(db.collection('assets').doc(j.assetId), { status: 'working' });
  }
  b.commit().catch(fail); audit(ok ? 'job_verified' : 'job_reopened', 'job', id, j.title);
  closeModal();
  var r = byId(S.data.rooms, j.roomId);
  if (ok && r && r.status === 'ooo' && confirm('Put Room ' + r.number + ' back in service? It will be cleaned and inspected first.')) backInService(r.id);
  else toast(ok ? 'Job closed' : 'Job reopened');
}
function cancelJob(id) { var why = prompt('Why cancel this job?'); if (!why) return; db.collection('jobs').doc(id).update({ status: 'cancelled', cancelNote: why }).catch(fail); audit('job_cancelled', 'job', id, why); closeModal(); }

function openAsset(id) {
  var a = byId(S.data.assets, id) || {};
  var b = '<form class="form" onsubmit="event.preventDefault();saveAsset(\'' + (id || '') + '\')"><div class="fields">' +
    field('Name', input('as-name', a.name, 'required placeholder="e.g. Bedroom AC"')) +
    field('Category', '<select id="as-cat">' + opts(ASSET_CATS, a.category) + '</select>') +
    field('Location', '<select id="as-loc">' + opts(locations(), a.location) + '</select>') +
    field('Brand / model', input('as-brand', a.brand, '')) +
    field('Serial number', input('as-serial', a.serial, '')) +
    field('Purchase date', input('as-pdate', a.purchaseDate, 'type="date"')) +
    field('Purchase cost (₦)', input('as-cost', a.cost, 'inputmode="numeric"')) +
    field('Warranty until', input('as-warr', a.warrantyUntil, 'type="date"')) +
    field('Service every (days)', input('as-svc', a.serviceDays, 'type="number" min="0"'), '', 'Leave empty if it needs no regular service') +
    field('Last serviced', input('as-last', a.lastServiced, 'type="date"')) +
    field('Status', '<select id="as-status">' + opts([{ v: 'working', l: 'Working' }, { v: 'faulty', l: 'Faulty' }, { v: 'retired', l: 'Retired / disposed' }], a.status || 'working') + '</select>') +
    field('Notes', '<textarea id="as-notes">' + esc(a.notes || '') + '</textarea>', 'full') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save asset</button></div></form>';
  openModal(id ? 'Edit asset' : 'Add asset', b, true);
}
function saveAsset(id) {
  var d = { name: val('as-name'), category: val('as-cat'), location: val('as-loc'), brand: val('as-brand'), serial: val('as-serial'), purchaseDate: val('as-pdate'), cost: num(val('as-cost')), warrantyUntil: val('as-warr'), serviceDays: num(val('as-svc')) || 0, lastServiced: val('as-last'), status: val('as-status'), notes: val('as-notes'), updatedAt: Date.now() };
  var ref = id ? db.collection('assets').doc(id) : db.collection('assets').doc();
  if (!id) Object.assign(d, { createdAt: Date.now(), by: S.user.uid });
  ref.set(d, { merge: true }).catch(fail); audit(id ? 'asset_edit' : 'asset_add', 'asset', ref.id, d.name); closeModal(); toast('Asset saved');
}
function openAssetDetail(id) {
  var a = byId(S.data.assets, id), jobs = S.data.jobs.filter(function (j) { return j.assetId === id; }), mgr = has('manager', 'maintenance');
  var b = '<div class="fields">' + info('Category', a.category) + info('Location', locLabel(a.location)) + info('Brand / model', a.brand) + info('Serial', a.serial) + info('Bought', a.purchaseDate ? fmtDate(a.purchaseDate) + (a.cost ? ' · ' + money(a.cost) : '') : '') + info('Warranty until', a.warrantyUntil ? fmtDate(a.warrantyUntil) : '') + info('Service', a.serviceDays ? 'Every ' + a.serviceDays + ' days · next ' + fmtDate(nextService(a)) : 'Not scheduled') + info('Total repairs', money(sum(jobs, function (j) { return j.cost; }))) + '</div>' +
    (a.notes ? '<div class="note">' + esc(a.notes) + '</div>' : '') +
    '<div><h3 style="font-size:15px;margin-bottom:6px">History</h3>' + (jobs.length ? jobs.map(jobRow).join('') : '<div class="muted">No jobs yet.</div>') + '</div>' +
    '<div class="row">' + (mgr ? '<button class="btn" type="button" onclick="openAsset(\'' + id + '\')">Edit</button>' + (a.serviceDays ? '<button class="btn" type="button" onclick="openService(\'' + id + '\')">Log service</button>' : '') : '') + '<button class="btn primary" type="button" onclick="closeModal();openReportForAsset(\'' + id + '\')">Report fault</button></div>';
  openModal(a.name, b, true);
}
function openReportForAsset(id) { var a = byId(S.data.assets, id), roomId = a.location && a.location.indexOf('room:') === 0 ? a.location.slice(5) : ''; openReport(roomId); if (!roomId) $('jb-loc').value = a.location; jbAssets(); $('jb-asset').value = id; $('jb-title').value = a.name + ': '; }
function openService(id) {
  var a = byId(S.data.assets, id); S.form = { receiptPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveService(\'' + id + '\')"><div class="fields">' +
    field('Date', input('sv-date', todayStr(), 'type="date" required')) +
    field('Done by', '<select id="sv-who"><option value="">Staff</option>' + S.data.vendors.map(function (v) { return '<option value="' + v.id + '">' + esc(v.name) + '</option>'; }).join('') + '</select>') +
    field('Cost (₦)', input('sv-cost', '', 'inputmode="numeric"')) + field('Notes', '<textarea id="sv-note"></textarea>', 'full') + photoField('receiptPhotos', 'Receipt') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal('Service · ' + a.name, b);
}
function saveService(id) {
  var a = byId(S.data.assets, id), cost = num(val('sv-cost')), vId = val('sv-who'), v = byId(S.data.vendors, vId), now = Date.now(), b = db.batch(), jref = db.collection('jobs').doc();
  b.set(jref, { title: 'Scheduled service: ' + a.name, description: val('sv-note'), location: a.location, locationLabel: locLabel(a.location), roomId: (a.location || '').indexOf('room:') === 0 ? a.location.slice(5) : '', assetId: id, priority: 'normal', status: 'verified', preventive: true, vendorId: vId, assigneeName: v ? v.name : meName(), cost: cost, fixNote: val('sv-note') || 'Routine service', photos: [], afterPhotos: [], receiptPhotos: S.form.receiptPhotos, createdAt: now, doneAt: now, verifiedAt: now, by: S.user.uid, byName: meName() });
  b.update(db.collection('assets').doc(id), { lastServiced: val('sv-date') });
  if (cost > 0) b.set(db.collection('expenses').doc(), Object.assign({ category: 'repairs', amount: cost, description: 'Service: ' + a.name, location: a.location, jobId: jref.id, photos: S.form.receiptPhotos, status: needsApproval(cost) ? 'pending' : 'approved' }, stamp()));
  b.commit().catch(fail); audit('asset_serviced', 'asset', id, a.name); closeModal(); toast('Service logged');
}
function openVendor(id) {
  var v = byId(S.data.vendors, id) || {};
  var b = '<form class="form" onsubmit="event.preventDefault();saveVendor(\'' + (id || '') + '\')"><div class="fields">' +
    field('Name', input('vd-name', v.name, 'required')) + field('Trade', input('vd-trade', v.trade, 'placeholder="e.g. Electrician, AC technician"')) + field('Phone', input('vd-phone', v.phone, 'type="tel"')) + field('Bank details', input('vd-bank', v.bank, '')) + field('Notes', '<textarea id="vd-notes">' + esc(v.notes || '') + '</textarea>', 'full') +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(id ? 'Edit vendor' : 'Add vendor', b);
}
function saveVendor(id) {
  var ref = id ? db.collection('vendors').doc(id) : db.collection('vendors').doc();
  ref.set({ name: val('vd-name'), trade: val('vd-trade'), phone: val('vd-phone'), bank: val('vd-bank'), notes: val('vd-notes'), updatedAt: Date.now() }, { merge: true }).catch(fail); closeModal(); toast('Vendor saved');
}

/* =========================================================
   INVENTORY: store stock, receiving, issuing, stock counts
   ========================================================= */
var MOVE_TYPE = { purchase: ['Received', 'st-ready'], issue: ['Issued', 'st-occupied'], sale: ['Sold', 'st-reserved'], count: ['Count adjustment', 'st-alert'], adjust: ['Adjustment', 'st-ooo'] };
// Two kinds of stock: supplies are used up running the place; "sale" items are sold to guests
function isSaleItem(i) { return i.kind === 'sale'; }
function invItems(kind) { return sortBy(S.data.items.filter(function (i) { return !i.archived && (kind === 'sale' ? isSaleItem(i) : kind === 'supply' ? !isSaleItem(i) : true); }), function (i) { return (i.category || '') + i.name; }); }
VIEWS.inventory = {
  title: 'Inventory',
  actions: function () {
    var sell = '<button class="btn primary" type="button" onclick="openSell()">Sell item</button>';
    if (!has('manager')) return sell;
    return actionMenu('Store', [['+ Receive stock', 'openReceive()'], ['Issue supplies', 'openIssue()'], ['Stock count', 'openStockCount()']]) + sell;
  },
  render: function () {
    var mgr = has('manager'), list = mgr ? [['supplies', 'Supplies'], ['sale', 'For sale'], ['sales', 'Sales'], ['more', 'More']] : [['sale', 'For sale'], ['sales', 'Sales']];
    var tab = curTab('inventory', mgr ? 'supplies' : 'sale');
    if (['usage', 'moves', 'rooms'].indexOf(tab) >= 0) { S.tab.invMore = tab; tab = S.tab.inventory = 'more'; }
    if (!list.some(function (t) { return t[0] === tab; })) tab = list[0][0];
    var more = tab === 'more' ? (S.tab.invMore || 'usage') : '';
    var sup = invItems('supply'), forSale = invItems('sale'), since = Date.now() - 30 * 86400000, month = todayStr().slice(0, 7);
    var issued = S.data.moves.filter(function (m) { return m.type === 'issue' && m.at > since; });
    var sales = S.data.moves.filter(function (m) { return m.type === 'sale'; });
    var salesMonth = sales.filter(function (m) { return dateStr(new Date(m.at)).slice(0, 7) === month; });
    var nights = sum(S.data.stays.filter(function (s) { return (s.status === 'checked_out' && s.checkedOutAt > since) || s.status === 'checked_in'; }), function (s) { return s.nights; });
    var lowSup = sup.filter(function (i) { return Number(i.qty) <= Number(i.reorderLevel || 0); }), lowSale = forSale.filter(function (i) { return Number(i.qty) <= Number(i.reorderLevel || 0); });
    var low = (mgr ? lowSup.length : 0) + lowSale.length;
    var html = '<section class="grid-stats">' +
      stat('To reorder', low, (mgr ? lowSup.length + ' supplies · ' : '') + lowSale.length + ' for sale', low ? 'warn' : '') +
      stat('Sales this month', money(sum(salesMonth, function (m) { return m.total; })), salesMonth.length + ' sales' + (mgr ? ' · ' + money(sum(salesMonth, function (m) { return m.total - (m.unitCost || 0) * -m.qty; })) + ' profit' : '')) +
      '</section>';
    html += tabs('inventory', list);
    if (more) { html += subTabs('invMore', [['usage', 'Usage per night'], ['moves', 'Movements'], ['rooms', 'Room item lists']]); tab = more; }
    if (tab === 'supplies' || tab === 'sale') {
      var items = tab === 'sale' ? forSale : sup, sale = tab === 'sale';
      html += mgr ? '<div class="row"><button class="btn small" type="button" onclick="openItem(\'\',\'' + (sale ? 'sale' : 'supply') + '\')">+ New ' + (sale ? 'item for sale' : 'supply') + '</button></div>' : '';
      html += items.length ? '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th class="right">In store</th><th class="right">Reorder at</th>' + (mgr ? '<th class="right">Unit cost</th>' : '') + (sale ? '<th class="right">Selling price</th>' : '') + '<th></th></tr></thead><tbody>' + items.map(function (i) {
        var low = Number(i.qty) <= Number(i.reorderLevel || 0);
        return '<tr' + (mgr ? ' class="clickable" onclick="openItem(\'' + i.id + '\')"' : '') + '><td><strong>' + esc(i.name) + '</strong></td><td>' + esc(ITEM_CATS[i.category] || '') + '</td><td class="right strong">' + i.qty + ' ' + esc(i.unit || '') + '</td><td class="right">' + (i.reorderLevel || 0) + '</td>' + (mgr ? '<td class="right money">' + money(i.unitCost) + '</td>' : '') + (sale ? '<td class="right money">' + money(i.sellPrice) + '</td>' : '') + '<td>' + (low ? pill('Reorder', 'st-bad') : pill('OK', 'st-ready')) + (sale && Number(i.qty) > 0 ? ' <button class="btn small" type="button" onclick="event.stopPropagation();openSell(\'' + i.id + '\')">Sell</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">' + (sale ? 'Nothing for sale yet. Add drinks, snacks, toiletries… with a selling price.' : 'No supplies yet.') + '</div>';
    }
    if (tab === 'sales') {
      html += sales.length ? '<div class="table-wrap"><table><thead><tr><th>When</th><th>Item</th><th class="right">Qty</th><th class="right">Total</th><th>Buyer</th><th>Paid</th><th>By</th></tr></thead><tbody>' + sales.slice(0, 200).map(function (m) {
        return '<tr><td>' + fmtDT(m.at) + '</td><td>' + esc(m.itemName) + '</td><td class="right">' + (-m.qty) + '</td><td class="right money">' + money(m.total) + '</td><td>' + esc(m.roomNo ? 'Room ' + m.roomNo + (m.guestName ? ' · ' + m.guestName : '') : (m.to || 'Walk-in')) + '</td><td>' + (m.onBill ? pill('On room bill', 'st-alert') : pill(PAY_METHODS[m.method] || 'Paid', 'st-ready')) + '</td><td>' + esc(m.byName || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">No sales yet.</div>';
    }
    if (tab === 'usage') {
      html += '<div class="note">How much of each supply leaves the store per guest night over the last 30 days. If a number jumps without more guests, ask why.</div>';
      var rows = sup.map(function (i) { var q = -sum(issued.filter(function (m) { return m.itemId === i.id; }), function (m) { return m.qty; }); return { i: i, q: q, per: nights ? q / nights : 0 }; }).filter(function (r) { return r.q > 0; });
      var max = Math.max.apply(null, rows.map(function (r) { return r.per; }).concat([0.0001]));
      html += rows.length ? '<div class="card"><div class="bars">' + sortBy(rows, function (r) { return r.per; }, true).map(function (r) { return '<div class="bar-row"><span>' + esc(r.i.name) + '</span><span class="bar-track"><span style="width:' + Math.round(r.per / max * 100) + '%"></span></span><span class="right">' + r.per.toFixed(2) + ' / night</span></div>'; }).join('') + '</div><div class="muted small" style="margin-top:10px">' + nights + ' guest nights in the period.</div></div>' : '<div class="card empty">No supplies issued in the last 30 days.</div>';
    }
    if (tab === 'moves') {
      html += S.data.moves.length ? '<div class="table-wrap"><table><thead><tr><th>When</th><th>Item</th><th>Type</th><th class="right">Qty</th><th>Room / to</th><th>By</th></tr></thead><tbody>' + S.data.moves.slice(0, 200).map(function (m) {
        var t = MOVE_TYPE[m.type] || ['', ''];
        return '<tr><td>' + fmtDT(m.at) + '</td><td>' + esc(m.itemName) + '</td><td>' + pill(t[0], t[1]) + '</td><td class="right strong">' + (m.qty > 0 ? '+' : '') + m.qty + '</td><td>' + esc(m.roomNo ? 'Room ' + m.roomNo : (m.to || m.supplier || m.note || '')) + '</td><td>' + esc(m.byName || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">No movements yet.</div>';
    }
    if (tab === 'rooms') {
      html += '<div class="note">These are the fixed items that must be in each room. Front desk counts them at every check-out. ' + (isAdmin() ? 'Edit them in Admin settings → Rooms.' : 'The owner edits them in Admin settings.') + '</div>';
      html += S.data.roomTypes.map(function (t) { return '<div class="card"><h2>' + esc(t.name) + '</h2><div class="chips">' + (t.items || []).map(function (i) { return '<span class="chip">' + esc(i.name) + ' × ' + i.qty + '</span>'; }).join('') + '</div></div>'; }).join('');
    }
    return html;
  }
};
function itemOptions(kind) {
  function o(i) { return '<option value="' + i.id + '">' + esc(i.name) + ' (' + i.qty + ' ' + esc(i.unit || '') + ')</option>'; }
  if (kind) return invItems(kind).map(o).join('');
  return '<optgroup label="Supplies (for use)">' + invItems('supply').map(o).join('') + '</optgroup><optgroup label="For sale">' + invItems('sale').map(o).join('') + '</optgroup>';
}
function openItem(id, kind) {
  var i = byId(S.data.items, id) || { kind: kind === 'sale' ? 'sale' : 'supply' }, sale = isSaleItem(i);
  var b = '<form class="form" onsubmit="event.preventDefault();saveItem(\'' + (id || '') + '\')"><div class="fields">' +
    field('Name', input('it-name', i.name, 'required')) +
    field('Type', '<select id="it-kind" onchange="$(\'it-sell-wrap\').classList.toggle(\'hidden\',this.value!==\'sale\')">' + opts([{ v: 'supply', l: 'Supply (for use)' }, { v: 'sale', l: 'For sale to guests' }], sale ? 'sale' : 'supply') + '</select>') +
    field('Category', '<select id="it-cat">' + objOpts(ITEM_CATS, i.category || (sale ? 'drinks' : 'consumable')) + '</select>') + field('Unit', input('it-unit', i.unit, 'placeholder="bottles, pcs, kg"')) +
    field('Reorder when at or below', input('it-re', i.reorderLevel, 'type="number" min="0"')) + field('Unit cost (₦)', input('it-cost', i.unitCost, 'inputmode="numeric"'), '', 'What you pay for one') +
    '<div id="it-sell-wrap" class="' + (sale ? '' : 'hidden') + '">' + field('Selling price (₦)', input('it-sell', i.sellPrice, 'inputmode="numeric"'), '', 'What a guest pays for one') + '</div>' +
    (id ? info('In store now', i.qty + ' ' + (i.unit || '')) : field('Opening quantity', input('it-qty', 0, 'type="number" min="0"'))) +
    '</div>' + (id ? '<div class="muted small">Quantity only changes through Receive, Issue, Sell or Stock count, so every change is recorded.</div>' : '') +
    '<div class="form-actions">' + (id && has('manager') ? '<button type="button" class="btn danger" onclick="archiveItem(\'' + id + '\')">Archive</button>' : '') + '<button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(id ? i.name : (sale ? 'New item for sale' : 'New supply'), b);
}
function saveItem(id) {
  var kind = val('it-kind');
  var d = { name: val('it-name'), kind: kind, category: val('it-cat'), unit: val('it-unit'), reorderLevel: num(val('it-re')), unitCost: num(val('it-cost')), sellPrice: kind === 'sale' ? num(val('it-sell')) : 0, updatedAt: Date.now() };
  if (kind === 'sale' && !d.sellPrice) return toast('Enter a selling price', true);
  if (id) db.collection('items').doc(id).update(d).catch(fail);
  else {
    var ref = db.collection('items').doc(), q = num(val('it-qty')), b = db.batch();
    b.set(ref, Object.assign(d, { qty: q, createdAt: Date.now() }));
    if (q) b.set(db.collection('moves').doc(), Object.assign({ itemId: ref.id, itemName: d.name, type: 'adjust', qty: q, note: 'Opening stock' }, stamp()));
    b.commit().catch(fail);
  }
  audit('item_saved', 'item', id || '', d.name + (kind === 'sale' ? ' · sells at ' + money(d.sellPrice) : ''));
  closeModal(); toast('Saved');
}
/* ---------- selling to guests ---------- */
function openSell(itemId) {
  var items = invItems('sale').filter(function (i) { return Number(i.qty) > 0; });
  if (!items.length) return toast('Nothing for sale is in stock', true);
  var guests = sortBy(staysByStatus('checked_in'), function (s) { return s.roomNo; });
  var b = '<form class="form" onsubmit="event.preventDefault();saveSell()"><div class="fields">' +
    field('Item', '<select id="sl-item" onchange="slCalc(true)">' + items.map(function (i) { return '<option value="' + i.id + '"' + (i.id === itemId ? ' selected' : '') + '>' + esc(i.name) + ' · ' + money(i.sellPrice) + ' (' + i.qty + ' left)</option>'; }).join('') + '</select>') +
    field('Quantity', input('sl-qty', 1, 'type="number" min="1" required oninput="slCalc()"')) +
    field('Price each (₦)', input('sl-price', '', 'inputmode="numeric" oninput="slCalc()"' + (has('manager') ? '' : ' readonly')), '', has('manager') ? '' : 'Set by the manager') +
    '<div class="field">Total<span class="static strong" id="sl-total"></span></div>' +
    field('Buyer', '<select id="sl-buyer" onchange="slCalc()"><option value="">Walk-in / not a guest</option>' + guests.map(function (s) { return '<option value="' + s.id + '">Room ' + esc(s.roomNo) + ' · ' + esc(s.guestName) + '</option>'; }).join('') + '</select>', 'full') +
    '</div><fieldset class="group"><legend>Payment</legend><div class="choices" role="radiogroup" aria-label="Payment">' +
    Object.keys(PAY_METHODS).map(function (k, n) { return '<label class="choice"><input type="radio" name="sl-pay" value="' + k + '"' + (n === 0 ? ' checked' : '') + ' onchange="slCalc()">' + PAY_METHODS[k] + '</label>'; }).join('') +
    '<label class="choice" id="sl-bill-opt"><input type="radio" name="sl-pay" value="bill" onchange="slCalc()">Add to room bill</label></div>' +
    '<div class="fields" id="sl-ref-wrap">' + field('Reference', input('sl-ref', '', ''), '', 'Needed for transfer and POS') + '</div></fieldset>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Record sale</button></div></form>';
  openModal('Sell item', b); slCalc(true);
}
function slCalc(itemChanged) {
  var it = byId(S.data.items, val('sl-item')); if (!it) return;
  if (itemChanged || !val('sl-price')) $('sl-price').value = it.sellPrice || 0;
  $('sl-total').textContent = money(num(val('sl-qty')) * num(val('sl-price')));
  var guest = val('sl-buyer'); $('sl-bill-opt').classList.toggle('hidden', !guest);
  if (!guest && radio('sl-pay') === 'bill') document.querySelector('input[name="sl-pay"][value="transfer"]').checked = true;
  $('sl-ref-wrap').classList.toggle('hidden', ['transfer', 'pos'].indexOf(radio('sl-pay')) < 0);
}
function saveSell() {
  var it = byId(S.data.items, val('sl-item')), q = Math.max(1, num(val('sl-qty'))), price = num(val('sl-price')), total = q * price, pay = radio('sl-pay'), stay = byId(S.data.stays, val('sl-buyer'));
  if (q > it.qty) return toast('Only ' + it.qty + ' in stock', true);
  if ((pay === 'transfer' || pay === 'pos') && !val('sl-ref')) return toast('Enter the transfer or POS reference', true);
  var b = db.batch(), mv = { itemId: it.id, itemName: it.name, type: 'sale', qty: -q, price: price, total: total, unitCost: it.unitCost || 0, roomNo: stay ? stay.roomNo : '', stayId: stay ? stay.id : '', guestName: stay ? stay.guestName : '', onBill: pay === 'bill', method: pay === 'bill' ? '' : pay };
  b.update(db.collection('items').doc(it.id), { qty: FV.increment(-q) });
  b.set(db.collection('moves').doc(), Object.assign(mv, stamp()));
  if (pay === 'bill') b.update(db.collection('stays').doc(stay.id), { extras: (stay.extras || 0) + total, balance: (stay.balance || 0) + total });
  else b.set(db.collection('payments').doc(), Object.assign({ stayId: stay ? stay.id : '', roomNo: stay ? stay.roomNo : '', guestName: stay ? stay.guestName : 'Walk-in', amount: total, kind: 'sale', method: pay, sender: '', ref: val('sl-ref'), photos: [], status: 'unconfirmed', note: it.name + ' × ' + q }, stamp()));
  b.commit().catch(fail);
  audit('item_sold', 'item', it.id, it.name + ' × ' + q + ' · ' + money(total) + (stay ? ' · Room ' + stay.roomNo : '') + (pay === 'bill' ? ' · on room bill' : ''));
  closeModal(); toast('Sold: ' + it.name + ' × ' + q + (pay === 'bill' ? ' (added to the room bill)' : ''));
}
function archiveItem(id) { if (!confirm('Archive this item? It will be hidden from lists.')) return; db.collection('items').doc(id).update({ archived: true }).catch(fail); closeModal(); }
function openReceive() {
  S.form = { recPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveReceive()"><div class="fields">' +
    field('Item', '<select id="rc-item" onchange="rcCalc()">' + itemOptions() + '</select>') + field('Quantity received', input('rc-qty', '', 'type="number" min="1" required oninput="rcCalc()"')) +
    field('Unit cost (₦)', input('rc-cost', '', 'inputmode="numeric" oninput="rcCalc()"')) + field('Supplier', input('rc-sup', '', '')) +
    '<div class="field">Total<span class="static" id="rc-total"></span></div>' + photoField('recPhotos', 'Receipt / invoice') +
    '</div><label class="check"><input type="checkbox" id="rc-exp" checked>Also record as an expense</label>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Receive</button></div></form>';
  openModal('Receive stock', b); rcCalc();
}
function rcCalc() { var it = byId(S.data.items, val('rc-item')); if (it && !val('rc-cost') && document.activeElement !== $('rc-cost')) $('rc-cost').value = it.unitCost || ''; var t = num(val('rc-qty')) * num(val('rc-cost')); $('rc-total').textContent = money(t) + (needsApproval(t) ? ' · needs owner approval' : ''); }
function saveReceive() {
  var it = byId(S.data.items, val('rc-item')), q = num(val('rc-qty')), c = num(val('rc-cost')), total = q * c, b = db.batch();
  if (total > 0 && !S.form.recPhotos.length && !confirm('No receipt photo. Continue anyway?')) return;
  b.update(db.collection('items').doc(it.id), { qty: FV.increment(q), unitCost: c || it.unitCost || 0 });
  b.set(db.collection('moves').doc(), Object.assign({ itemId: it.id, itemName: it.name, type: 'purchase', qty: q, unitCost: c, supplier: val('rc-sup'), photos: S.form.recPhotos }, stamp()));
  if (val('rc-exp') && total > 0) b.set(db.collection('expenses').doc(), Object.assign({ category: 'supplies', amount: total, description: it.name + ' × ' + q + (val('rc-sup') ? ' from ' + val('rc-sup') : ''), photos: S.form.recPhotos, status: needsApproval(total) ? 'pending' : 'approved' }, stamp()));
  b.commit().catch(fail); audit('stock_received', 'item', it.id, it.name + ' +' + q + ' · ' + money(total)); closeModal(); toast(it.name + ' +' + q);
}
function openIssue() {
  var b = '<form class="form" onsubmit="event.preventDefault();saveIssue()"><div class="fields">' +
    field('Item', '<select id="is-item">' + itemOptions('supply') + '</select>') + field('Quantity', input('is-qty', 1, 'type="number" min="1" required')) +
    field('For room', '<select id="is-room"><option value="">— Not for a room —</option>' + roomsSorted().map(function (r) { return '<option value="' + r.number + '">Room ' + esc(r.number) + '</option>'; }).join('') + '</select>') +
    field('Given to / purpose', input('is-to', '', 'placeholder="e.g. Blessing, reception, laundry"')) +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Issue</button></div></form>';
  openModal('Issue from store', b);
}
function saveIssue() {
  var it = byId(S.data.items, val('is-item')), q = num(val('is-qty')), b = db.batch();
  if (!val('is-room') && !val('is-to')) return toast('Say which room or who it is for', true);
  b.update(db.collection('items').doc(it.id), { qty: FV.increment(-q) });
  b.set(db.collection('moves').doc(), Object.assign({ itemId: it.id, itemName: it.name, type: 'issue', qty: -q, roomNo: val('is-room'), to: val('is-to') }, stamp()));
  b.commit().catch(fail); closeModal(); toast(it.name + ' × ' + q + ' issued');
}
function openStockCount() {
  var items = sortBy(S.data.items.filter(function (i) { return !i.archived; }), function (i) { return i.name; });
  var b = '<form class="form" onsubmit="event.preventDefault();saveStockCount()"><div class="note">Count what is physically on the shelf. Differences are recorded and big shortfalls are flagged to the owner.</div>' +
    '<div class="count-row muted small"><span>Item</span><span>System</span><span>Counted</span></div>' +
    items.map(function (i) { return '<div class="count-row"><span>' + esc(i.name) + '</span><span>' + i.qty + ' ' + esc(i.unit || '') + '</span><input id="sc-' + i.id + '" type="number" min="0" placeholder="' + i.qty + '" aria-label="' + esc(i.name) + ' counted"></div>'; }).join('') +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save count</button></div></form>';
  openModal('Stock count', b, true);
}
function saveStockCount() {
  var b = db.batch(), short = [], n = 0;
  S.data.items.filter(function (i) { return !i.archived; }).forEach(function (i) {
    var raw = val('sc-' + i.id); if (raw === '') return;
    var c = num(raw), diff = c - (i.qty || 0); if (!diff) return; n++;
    b.update(db.collection('items').doc(i.id), { qty: c, lastCounted: Date.now() });
    b.set(db.collection('moves').doc(), Object.assign({ itemId: i.id, itemName: i.name, type: 'count', qty: diff, note: 'Stock count: system ' + i.qty + ', counted ' + c }, stamp()));
    if (diff < 0) short.push(i.name + ' ' + diff + ' (' + money(-diff * (i.unitCost || 0)) + ')');
  });
  if (short.length) b.set(db.collection('incidents').doc(), Object.assign({ type: 'stock_variance', title: 'Stock count short: ' + short.join(', '), resolved: false }, stamp()));
  b.commit().catch(fail); audit('stock_count', 'items', '', n + ' differences'); closeModal(); toast(n ? n + ' difference(s) recorded' : 'Count matches the system');
}

/* =========================================================
   EXPENSES
   ========================================================= */
VIEWS.expenses = {
  title: 'Expenses',
  actions: function () { return '<button class="btn primary" type="button" onclick="openExpenseForm()">+ Add expense</button>'; },
  render: function () {
    var month = S.params.month || todayStr().slice(0, 7);
    var list = S.data.expenses.filter(function (e) { return dateStr(new Date(e.at)).slice(0, 7) === month && e.status !== 'void'; });
    var ok = list.filter(function (e) { return e.status !== 'rejected'; });
    var cats = {}; ok.forEach(function (e) { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    var max = Math.max.apply(null, Object.keys(cats).map(function (k) { return cats[k]; }).concat([1]));
    var diesel = ok.filter(function (e) { return e.category === 'diesel'; });
    var html = '<div class="row"><label class="field" style="flex-direction:row;align-items:center">Month <input type="month" value="' + month + '" onchange="S.params.month=this.value;render()" style="width:auto"></label></div>' +
      '<section class="grid-stats">' + stat('Total spent', money(sum(ok, function (e) { return e.amount; })), list.length + ' records') + stat('Waiting approval', pendingExpenses().length, 'Above ' + money(S.settings.approvalLimit), pendingExpenses().length ? 'warn' : '') + stat('Diesel', money(sum(diesel, function (e) { return e.amount; })), sum(diesel, function (e) { return e.litres; }) + ' litres') + '</section>';
    if (Object.keys(cats).length) html += '<div class="card"><h2>By category</h2><div class="bars">' + Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) { return '<div class="bar-row"><span>' + esc(EXPENSE_CATS[k] || k) + '</span><span class="bar-track"><span style="width:' + Math.round(cats[k] / max * 100) + '%"></span></span><span class="right money">' + money(cats[k]) + '</span></div>'; }).join('') + '</div></div>';
    html += list.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="right">Amount</th><th>Status</th><th>By</th></tr></thead><tbody>' + list.map(function (e) {
      return '<tr class="clickable" onclick="openExpense(\'' + e.id + '\')"><td>' + fmtDate(e.at) + '</td><td>' + esc(EXPENSE_CATS[e.category] || e.category) + '</td><td>' + esc(e.description || '') + (e.litres ? ' · ' + e.litres + ' L' : '') + '</td><td class="right money">' + money(e.amount) + '</td><td>' + expPill(e) + '</td><td>' + esc(e.byName || '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="card empty">No expenses this month.</div>';
    return html;
  }
};
function expPill(e) { return e.status === 'pending' ? pill('Needs approval', 'st-alert') : e.status === 'rejected' ? pill('Rejected', 'st-bad') : e.status === 'void' ? pill('Void', 'st-ooo') : pill('Approved', 'st-ready'); }
function openExpenseForm() {
  S.form = { expPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveExpense()"><div class="fields">' +
    field('Category', '<select id="ex-cat" onchange="$(\'ex-diesel\').classList.toggle(\'hidden\',this.value!==\'diesel\')">' + objOpts(EXPENSE_CATS, 'diesel') + '</select>') +
    field('Amount (₦)', input('ex-amt', '', 'inputmode="numeric" required')) + field('Description', input('ex-desc', '', 'required'), 'full') +
    field('Paid to', input('ex-to', '', '')) + field('Location / room', '<select id="ex-loc"><option value="">General</option>' + opts(locations(), '') + '</select>') +
    '<div class="fields full" id="ex-diesel" style="grid-column:1/-1">' + field('Litres', input('ex-l', '', 'type="number" min="0"')) + field('Generator hour meter', input('ex-h', '', 'type="number" min="0"'), '', 'Reading on the generator when fuel was added') + '</div>' +
    photoField('expPhotos', 'Receipt') + '</div>' +
    '<div class="note">Expenses above ' + money(S.settings.approvalLimit) + ' wait for owner approval.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save expense</button></div></form>';
  openModal('Add expense', b);
}
function saveExpense() {
  var amt = num(val('ex-amt')), cat = val('ex-cat');
  if (!S.form.expPhotos.length && !confirm('No receipt photo. Save anyway?')) return;
  var d = Object.assign({ category: cat, amount: amt, description: val('ex-desc'), paidTo: val('ex-to'), location: val('ex-loc'), photos: S.form.expPhotos, status: needsApproval(amt) && !isAdmin() ? 'pending' : 'approved' }, stamp());
  if (cat === 'diesel') { d.litres = num(val('ex-l')); d.genHours = num(val('ex-h')); }
  var ref = db.collection('expenses').doc(); ref.set(d).catch(fail);
  audit('expense', 'expense', ref.id, (EXPENSE_CATS[cat] || cat) + ' ' + money(amt)); closeModal(); toast(d.status === 'pending' ? 'Saved. Waiting for owner approval.' : 'Expense saved');
}
function openExpense(id) {
  var e = byId(S.data.expenses, id); if (!e) return;
  var prevDiesel = e.category === 'diesel' && e.genHours ? S.data.expenses.filter(function (x) { return x.category === 'diesel' && x.genHours && x.at < e.at; })[0] : null;
  var b = '<div class="row">' + expPill(e) + '<span class="muted">' + esc(EXPENSE_CATS[e.category] || e.category) + '</span></div><div class="fields">' +
    info('Amount', money(e.amount)) + info('Description', e.description) + info('Paid to', e.paidTo) + info('Location', locLabel(e.location)) + info('Recorded by', (e.byName || '') + ', ' + fmtDT(e.at)) +
    (e.litres ? info('Litres', e.litres + ' L · ' + money(e.amount / e.litres) + ' per litre') : '') + (e.genHours ? info('Generator hours', e.genHours) : '') +
    (prevDiesel ? info('Since last fuel', (e.genHours - prevDiesel.genHours) + ' hours run on ' + prevDiesel.litres + ' L → ' + (prevDiesel.litres / Math.max(1, e.genHours - prevDiesel.genHours)).toFixed(1) + ' L/hour') : '') + '</div>' +
    (e.photos && e.photos.length ? '<div class="thumbs">' + thumbs(e.photos) + '</div>' : '<div class="note warn">No receipt attached.</div>');
  if (isAdmin()) b += '<div class="row">' + (e.status === 'pending' ? '<button class="btn primary" type="button" onclick="decideExpense(\'' + id + '\',\'approved\')">Approve</button><button class="btn danger" type="button" onclick="decideExpense(\'' + id + '\',\'rejected\')">Reject</button>' : '') + (e.status !== 'void' ? '<button class="btn" type="button" onclick="decideExpense(\'' + id + '\',\'void\')">Void record</button>' : '') + '</div>';
  openModal('Expense', b);
}
function decideExpense(id, status) {
  var note = status === 'approved' ? '' : prompt(status === 'void' ? 'Reason for voiding?' : 'Reason for rejecting?'); if (status !== 'approved' && !note) return;
  db.collection('expenses').doc(id).update({ status: status, decisionNote: note || '', decidedBy: S.user.uid, decidedAt: Date.now() }).catch(fail);
  audit('expense_' + status, 'expense', id, note || ''); closeModal(); toast('Expense ' + status);
}

/* =========================================================
   LAUNDRY: linen and towels sent out and counted back in
   ========================================================= */
function linenTypes() { return (S.settings.linenItems && S.settings.linenItems.length) ? S.settings.linenItems : DEFAULT_SETTINGS.linenItems; }
function laundryView() {
  var out = S.data.laundry.filter(function (l) { return l.status === 'out'; }), done = S.data.laundry.filter(function (l) { return l.status === 'returned'; });
  var outTotals = {}; out.forEach(function (l) { (l.items || []).forEach(function (it) { outTotals[it.name] = (outTotals[it.name] || 0) + it.qty; }); });
  var month = todayStr().slice(0, 7), short = done.filter(function (l) { return dateStr(new Date(l.returnedAt)).slice(0, 7) === month; });
  var shortQty = sum(short, function (l) { return sum(l.short || [], function (x) { return x.qty; }); });
  var html = '<section class="grid-stats">' + stat('Batches out', out.length, out.length ? 'Oldest sent ' + ago(out[out.length - 1].sentAt) : 'Nothing at the laundry') +
    stat('Pieces out', sum(Object.keys(outTotals), function (k) { return outTotals[k]; }), Object.keys(outTotals).map(function (k) { return outTotals[k] + ' ' + k.toLowerCase(); }).join(', ')) +
    stat('Missing this month', shortQty, 'Pieces not returned', shortQty ? 'warn' : '') + '</section>';
  html += '<div class="card"><h2>At the laundry</h2>' + (out.length ? out.map(function (l) {
    return '<div class="list-row"><span class="main-t"><strong>' + esc(l.vendor || 'Laundry') + ' · sent ' + fmtDT(l.sentAt) + '</strong><span>' + esc((l.items || []).map(function (it) { return it.qty + ' ' + it.name; }).join(', ')) + ' · by ' + esc(l.sentByName || '') + '</span></span><button class="btn small primary" type="button" onclick="openLaundryReturn(\'' + l.id + '\')">Count it back in</button></div>';
  }).join('') : '<div class="muted">Nothing out right now.</div>') + '</div>';
  html += '<div class="card"><h2>Returned</h2>' + (done.length ? done.slice(0, 30).map(function (l) {
    var sh = l.short || [];
    return '<div class="list-row"><span class="main-t"><strong>' + esc(l.vendor || 'Laundry') + ' · back ' + fmtDT(l.returnedAt) + '</strong><span>' + esc((l.items || []).map(function (it) { return it.qty + ' ' + it.name; }).join(', ')) + (l.cost ? ' · ' + money(l.cost) : '') + '</span></span>' + (sh.length ? pill(sh.map(function (x) { return x.qty + ' ' + x.name; }).join(', ') + ' missing', 'st-bad') : pill('All back', 'st-ready')) + '</div>';
  }).join('') : '<div class="muted">No returns yet.</div>') + '</div>';
  return html;
}
function openLaundrySend() {
  var vendors = S.data.vendors.filter(function (v) { return /laund|wash|dry/i.test((v.trade || '') + ' ' + v.name); });
  var b = '<form class="form" onsubmit="event.preventDefault();saveLaundrySend()"><div class="fields">' +
    field('Laundry / person', input('ln-vendor', vendors[0] ? vendors[0].name : '', 'list="ln-vendors" placeholder="e.g. Mama Tunde Laundry"') + '<datalist id="ln-vendors">' + S.data.vendors.map(function (v) { return '<option value="' + esc(v.name) + '">'; }).join('') + '</datalist>', 'full') +
    '</div><fieldset class="group"><legend>Count what is going out</legend>' +
    linenTypes().map(function (n, i) { return '<div class="count-row" style="grid-template-columns:1fr 110px"><span>' + esc(n) + '</span><input id="ln-s' + i + '" type="number" min="0" value="0" aria-label="' + esc(n) + ' sent"></div>'; }).join('') +
    '</fieldset><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Send</button></div></form>';
  openModal('Send laundry', b);
}
function saveLaundrySend() {
  var items = linenTypes().map(function (n, i) { return { name: n, qty: num(val('ln-s' + i)) }; }).filter(function (x) { return x.qty > 0; });
  if (!items.length) return toast('Enter at least one count', true);
  var ref = db.collection('laundry').doc();
  ref.set({ vendor: val('ln-vendor'), items: items, status: 'out', sentAt: Date.now(), sentBy: S.user.uid, sentByName: meName(), by: S.user.uid }).catch(fail);
  audit('laundry_sent', 'laundry', ref.id, items.map(function (x) { return x.qty + ' ' + x.name; }).join(', '));
  closeModal(); toast('Laundry sent');
}
function openLaundryReturn(id) {
  var l = byId(S.data.laundry, id); S.form = { lnPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveLaundryReturn(\'' + id + '\')"><div class="note">Count every piece before the laundry person leaves.</div><fieldset class="group"><legend>Count what came back</legend>' +
    '<div class="count-row muted small"><span>Item</span><span>Sent</span><span>Back</span></div>' +
    (l.items || []).map(function (it, i) { return '<div class="count-row"><span>' + esc(it.name) + '</span><span>' + it.qty + '</span><input id="ln-r' + i + '" type="number" min="0" value="' + it.qty + '" aria-label="' + esc(it.name) + ' returned"></div>'; }).join('') +
    '</fieldset><div class="fields">' + field('Laundry bill (₦)', input('ln-cost', '', 'inputmode="numeric"'), '', 'Recorded as an expense') + photoField('lnPhotos', 'Receipt') + '</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal('Laundry back from ' + (l.vendor || 'laundry'), b);
}
function saveLaundryReturn(id) {
  var l = byId(S.data.laundry, id), returned = [], short = [], cost = num(val('ln-cost')), now = Date.now();
  (l.items || []).forEach(function (it, i) { var q = num(val('ln-r' + i)); returned.push({ name: it.name, qty: q }); if (q < it.qty) short.push({ name: it.name, qty: it.qty - q }); });
  if (short.length && !confirm(short.map(function (x) { return x.qty + ' ' + x.name; }).join(', ') + ' missing. This will be reported to the owner. Continue?')) return;
  var b = db.batch();
  b.update(db.collection('laundry').doc(id), { status: 'returned', returned: returned, short: short, cost: cost, returnedAt: now, receivedBy: S.user.uid, receivedByName: meName() });
  if (short.length) b.set(db.collection('incidents').doc(), Object.assign({ type: 'laundry_short', title: 'Laundry short: ' + short.map(function (x) { return x.qty + ' ' + x.name; }).join(', ') + ' (' + (l.vendor || 'laundry') + ')', resolved: false }, stamp()));
  if (cost > 0) b.set(db.collection('expenses').doc(), Object.assign({ category: 'cleaning', amount: cost, description: 'Laundry · ' + (l.vendor || ''), paidTo: l.vendor || '', photos: S.form.lnPhotos, status: needsApproval(cost) && !isAdmin() ? 'pending' : 'approved' }, stamp()));
  b.commit().catch(fail);
  audit('laundry_returned', 'laundry', id, short.length ? 'short: ' + short.map(function (x) { return x.qty + ' ' + x.name; }).join(', ') : 'all back');
  closeModal(); toast(short.length ? 'Saved. Shortage reported.' : 'All back');
}
