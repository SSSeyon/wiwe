/* =========================================================
   FRONT DESK: room board, check-in, reservations, stays,
   extensions, check-out, caution refunds, payments
   ========================================================= */

/* ---------- Room board ---------- */
VIEWS.board = {
  title: 'Room board',
  actions: function () {
    return has('manager', 'frontdesk') ? '<button class="btn" type="button" onclick="openReservation()">New reservation</button><button class="btn primary" type="button" onclick="openCheckIn()">+ Check in guest</button>' : '';
  },
  render: function () {
    var rooms = roomsSorted(), t = todayStr();
    if (!rooms.length) return emptyState('building', 'No rooms yet', 'Rooms are added in Admin settings → Rooms and rates.', isAdmin() ? 'Add rooms' : '', "go('admin',{tab:'rooms'})");
    var counts = {}; rooms.forEach(function (r) { var st = displayStatus(r); counts[st] = (counts[st] || 0) + 1; });
    var occ = counts.occupied || 0;
    var arrivals = S.data.stays.filter(function (s) { return s.status === 'reserved' && s.checkInDate <= t; });
    var departures = S.data.stays.filter(dueOutToday);
    var ready = counts.ready || 0;
    var owe = debtors();
    var al = alerts();
    var html = '<section class="grid-stats board-stats" aria-label="Today at a glance">' +
      stat('Occupied', occ + ' / ' + rooms.length, ready + ' ready · ' + ((counts.dirty || 0) + (counts.cleaning || 0) + (counts.inspect || 0)) + ' to clean') +
      stat('Today', arrivals.length + ' in · ' + departures.length + ' out', (arrivals.length ? 'Arriving ' + arrivals.map(function (s) { return s.roomNo; }).join(', ') : 'No arrivals') + (departures.length ? ' · Leaving ' + departures.map(function (s) { return s.roomNo; }).join(', ') : '')) +
      stat('Guests owing', money(sum(owe, function (s) { return s.balance; })), owe.length ? owe.length + ' stay' + (owe.length > 1 ? 's' : '') + ' with a balance' : 'Everyone is paid up', owe.length ? 'warn' : '') +
      '</section>';
    html += '<div class="split board-split"><section class="wide board-main" aria-label="Rooms">' +
      building3dHtml() + '</section>' +
      '<aside class="narrow board-side"><div class="card"><h2>Needs attention</h2><div class="stack">' + alertList(al, 8) + '</div></div>' +
      '<div class="card"><h2>Arrivals and departures</h2>' + movesList(arrivals, departures) + '</div></aside></div>';
    return html;
  }
};
function stat(label, value, sub, cls) { return '<div class="stat ' + (cls || '') + '"><span class="label">' + esc(label) + '</span><span class="value">' + esc(value) + '</span><span class="sub">' + esc(sub || '') + '</span></div>'; }
function movesList(arr, dep) {
  var rows = dep.map(function (s) { return { n: s.guestName, r: s.roomNo, t: 'by ' + S.settings.checkOutTime, k: 'Departing', c: 'st-dirty', id: s.id }; })
    .concat(arr.map(function (s) { return { n: s.guestName, r: s.roomNo, t: s.arrivalTime || '', k: 'Arriving', c: 'st-reserved', id: s.id }; }))
    .concat(S.data.stays.filter(isOverstay).map(function (s) { return { n: s.guestName, r: s.roomNo, t: 'overdue', k: 'Overstay', c: 'st-bad', id: s.id }; }));
  if (!rows.length) return emptyState('calendar', 'No arrivals or departures today', '', '', '', true);
  return rows.map(function (m) { return '<div class="list-row clickable" onclick="openStay(\'' + m.id + '\')"><span class="main-t"><strong>' + esc(m.n) + '</strong><span>Room ' + esc(m.r) + ' · ' + esc(m.t) + '</span></span>' + pill(m.k, m.c) + '</div>'; }).join('');
}

/* ---------- Room sheet ---------- */
function openRoom(id) {
  var r = byId(S.data.rooms, id); if (!r) return;
  var st = displayStatus(r), s = stayOf(r), type = roomType(r), b = '';
  b += '<div class="row">' + pill(ROOM_STATUS[st].label, ROOM_STATUS[st].cls) + '<span class="muted">' + esc(type.name) + ' · ' + money(type.rate) + ' per night</span></div>' +
    '<div class="row between"><span class="muted">Where: <strong class="ink">' + esc(typeof roomWhere === 'function' ? roomWhere(r) : floorName(roomFloor(r))) + '</strong></span>' + (canSee('board') && S.view !== 'board' ? '<button class="btn small" type="button" onclick="closeModal();b3dFocus(\'' + r.id + '\')">Show on room board</button>' : '') + '</div>';
  if (s) b += '<div class="card"><div class="row between"><div class="main-t"><strong>' + esc(s.guestName) + '</strong><div class="muted">' + fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate) + ' · ' + s.nights + ' night' + (s.nights > 1 ? 's' : '') + '</div></div><button class="btn small" type="button" onclick="openStay(\'' + s.id + '\')">Open stay</button></div></div>';
  var acts = [];
  if (has('manager', 'frontdesk')) {
    if (st === 'ready' || st === 'reserved') { var rv = reservationToday(r); acts.push('<button class="btn primary" type="button" onclick="openCheckIn(\'' + r.id + '\'' + (rv ? ',\'' + rv.id + '\'' : '') + ')">Check in' + (rv ? ' ' + esc(rv.guestName) : ' guest') + '</button>'); }
    if (st === 'ready') acts.push('<button class="btn" type="button" onclick="openReservation(\'' + r.id + '\')">Reserve</button>');
    if (s) { acts.push('<button class="btn" type="button" onclick="openExtend(\'' + s.id + '\')">Extend stay</button>'); acts.push('<button class="btn primary" type="button" onclick="openCheckOut(\'' + s.id + '\')">Check out</button>'); }
    if (st === 'inspect') acts.push('<button class="btn primary" type="button" onclick="go(\'housekeeping\')">Inspect in Housekeeping</button>');
  }
  if (st !== 'ooo' && st !== 'occupied') acts.push('<button class="btn" type="button" onclick="openReport(\'' + r.id + '\', true)">Report fault / out of order</button>');
  else if (st !== 'ooo') acts.push('<button class="btn" type="button" onclick="openReport(\'' + r.id + '\')">Report fault</button>');
  if (st === 'ooo' && has('manager', 'maintenance')) acts.push('<button class="btn primary" type="button" onclick="backInService(\'' + r.id + '\')">Back in service (needs cleaning)</button>');
  if (st === 'ready' && has('housekeeping', 'manager')) acts.push('<button class="btn danger" type="button" onclick="openUnexpectedUse(\'' + r.id + '\')">Found used with no guest</button>');
  if (has('manager') && !s) acts.push('<button class="btn" type="button" onclick="openSetStatus(\'' + r.id + '\')">Set status…</button>');
  // The one thing to do next goes first, as a big button; the rest stay below as smaller ones
  var nx = roomNextStep(r);
  if (nx) {
    acts = acts.filter(function (a) { return a.indexOf(nx.fn) < 0; }).map(function (a) { return a.replace('class="btn primary"', 'class="btn"'); });
    b = '<button type="button" class="next-step" onclick="' + nx.fn.replace(/"/g, '&quot;') + '"><span class="ns-t">' + esc(nx.label) + '</span>' + (nx.hint ? '<span class="ns-h">' + esc(nx.hint) + '</span>' : '') + '</button>' + b;
  }
  b += '<div class="row">' + acts.join('') + '</div>';
  var hist = S.data.stays.filter(function (x) { return x.roomId === r.id && x.status === 'checked_out'; }).slice(0, 5);
  if (hist.length) b += '<div><h3 class="sub-h">Recent stays</h3>' + hist.map(function (x) { return '<div class="list-row clickable" onclick="openStay(\'' + x.id + '\')"><span class="main-t"><strong>' + esc(x.guestName) + '</strong><span>' + fmtDate(x.checkInDate) + ' → ' + fmtDate(x.checkOutDate) + '</span></span><span class="money">' + money(x.total) + '</span></div>'; }).join('') + '</div>';
  var jobs = S.data.jobs.filter(function (j) { return j.roomId === r.id; }).slice(0, 5);
  if (jobs.length) b += '<div><h3 class="sub-h">Maintenance</h3>' + jobs.map(function (j) { return '<div class="list-row clickable" onclick="openJob(\'' + j.id + '\')"><span class="main-t"><strong>' + esc(j.title) + '</strong><span>' + fmtDate(j.createdAt) + '</span></span>' + jobPill(j) + '</div>'; }).join('') + '</div>';
  openModal('Room ' + r.number, b);
}
/* What this person should do next with this room, or null. fn is the onclick code. */
function roomNextStep(r) {
  var st = displayStatus(r), s = stayOf(r), desk = has('manager', 'frontdesk');
  var task = S.data.tasks.filter(function (t) { return t.roomId === r.id && t.type === 'turnover' && t.status !== 'done'; })[0];
  if (desk && (st === 'ready' || st === 'reserved')) {
    var rv = reservationToday(r);
    return { label: rv ? 'Check in ' + rv.guestName : 'Check in a guest', hint: rv ? 'Reserved for today' : 'Room is clean and ready', fn: "openCheckIn('" + r.id + "'" + (rv ? ",'" + rv.id + "'" : '') + ')' };
  }
  if (desk && s) {
    if (isOverstay(s)) return { label: 'Check out ' + s.guestName, hint: 'Overstayed: was due out ' + fmtDate(s.checkOutDate), fn: "openCheckOut('" + s.id + "')" };
    if (dueOutToday(s)) return { label: 'Check out ' + s.guestName, hint: 'Due out today by ' + S.settings.checkOutTime, fn: "openCheckOut('" + s.id + "')" };
    if ((s.balance || 0) > 0) return { label: 'Take balance payment', hint: s.guestName + ' owes ' + money(s.balance), fn: "openExtend('" + s.id + "',true)" };
    return { label: 'Open ' + s.guestName + "'s stay", hint: 'Leaves ' + fmtDate(s.checkOutDate), fn: "openStay('" + s.id + "')" };
  }
  if (task && task.status === 'inspection' && desk) return { label: 'Inspect the room', hint: 'Cleaning finished' + (task.assigneeName ? ' by ' + task.assigneeName : ''), fn: "go('task',{id:'" + task.id + "'})" };
  if (task && task.status === 'todo' && has('housekeeping', 'manager')) return { label: 'Start cleaning', hint: 'Turnover clean is waiting', fn: "startTask('" + task.id + "');go('task',{id:'" + task.id + "'})" };
  if (task && task.status === 'in_progress' && (task.assignee === S.user.uid || has('manager'))) return { label: 'Continue cleaning', hint: (task.assigneeName || '') + ' started ' + fmtTime(task.startedAt), fn: "go('task',{id:'" + task.id + "'})" };
  if (st === 'ooo' && has('manager', 'maintenance')) return { label: 'Back in service', hint: r.oooReason ? 'Out of order: ' + r.oooReason : 'Goes to cleaning first', fn: "backInService('" + r.id + "')" };
  return null;
}
/* Manager override: set a room's status by hand, with a reason. Logged in the activity log. */
var SET_STATUS_OPTIONS = [['ready', 'Ready (clean and inspected)'], ['dirty', 'Dirty (needs cleaning)'], ['cleaning', 'Cleaning'], ['inspect', 'Waiting inspection'], ['ooo', 'Out of order']];
function openSetStatus(id) {
  var r = byId(S.data.rooms, id); if (!r) return;
  if (!has('manager')) return toast('Only a manager or the owner can set a status by hand', true);
  if (stayOf(r)) return toast('A guest is checked in. Check them out or move them first.', true);
  var b = '<form class="form" onsubmit="event.preventDefault();saveSetStatus(\'' + id + '\')">' +
    '<div class="note">Normally the status changes by itself as staff check guests in and out, clean and inspect. Use this only to correct a mistake. It is recorded in the activity log with your name and reason.</div>' +
    '<div class="fields">' + field('New status', '<select id="ss-status">' + SET_STATUS_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === r.status ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>') +
    field('Reason', input('ss-reason', '', 'required minlength="4" placeholder="e.g. cleaned yesterday but not marked"'), 'full') + '</div>' +
    '<div class="row"><button class="btn primary" type="submit">Save status</button><button class="btn" type="button" onclick="openRoom(\'' + id + '\')">Back</button></div></form>';
  openModal('Set status · Room ' + r.number, b);
}
function saveSetStatus(id) {
  var r = byId(S.data.rooms, id), st = val('ss-status'), why = val('ss-reason').trim();
  if (!r || !ROOM_STATUS[st]) return;
  if (why.length < 4) return toast('Give a reason', true);
  if (st === r.status) return toast('The room is already ' + ROOM_STATUS[st].label, true);
  var upd = { status: st, oooReason: st === 'ooo' ? why : '' };
  if (st === 'ready') upd.readyAt = Date.now();
  db.collection('rooms').doc(id).update(upd).then(function () {
    var openTask = S.data.tasks.some(function (t) { return t.roomId === id && t.status !== 'done'; });
    if (st === 'dirty' && !openTask) createTurnoverTask(r, null, 'Set to dirty by ' + S.me.name + ': ' + why);
    audit('room_status_override', 'room', id, r.number + ': ' + ROOM_STATUS[displayStatus(r)].label + ' → ' + ROOM_STATUS[st].label + ' · ' + why);
    closeModal(); toast('Room ' + r.number + ' set to ' + ROOM_STATUS[st].label);
  }).catch(fail);
}
async function backInService(id, asked) {
  if (!asked && !(await ask({ title: 'Back in service?', text: 'The room goes to Dirty, so it is cleaned and inspected before anyone is let in.', ok: 'Back in service' }))) return;
  var r = byId(S.data.rooms, id);
  db.collection('rooms').doc(id).update({ status: 'dirty', oooReason: '' }).then(function () { createTurnoverTask(r, null, 'Back in service after repair'); audit('room_back_in_service', 'room', id, r.number); closeModal(); toast('Room ' + r.number + ' back in service'); }).catch(fail);
}

/* ---------- Check-in ---------- */
function sourceField(id, sel) { return field('How did they book?', '<select id="' + id + '">' + objOpts(SOURCES, sel || 'walkin') + '</select>'); }
function payNote() { return '<div class="note">Take the payment on the POS first, then type the reference printed on the slip. A reference can only be used once.' + (isAdmin() ? '' : ' The payment shows as "Unconfirmed" until the owner matches it to the POS settlement.') + '</div>'; }
function openCheckIn(roomId, reservationId) {
  if (!has('manager', 'frontdesk')) return toast('Only front desk can check guests in', true);
  var rv = reservationId ? findStay(reservationId) : null;
  var free = roomsSorted().filter(function (r) { return r.status === 'ready' || r.id === roomId; });
  if (!free.length) return toast('No rooms are Ready. Rooms must be cleaned and inspected first.', true);
  var room = byId(S.data.rooms, roomId) || byId(S.data.rooms, rv && rv.roomId) || free[0];
  S.form = { rvId: rv ? rv.id : '', rvPaid: rv ? (rv.paid || 0) : 0, idPhotos: (rv && rv.idPhotos) || [], payPhotos: [] };
  var st = S.settings, nights = rv ? rv.nights : 1, needId = !!st.requireId;
  var b = '<form class="form" onsubmit="event.preventDefault();saveCheckIn()">' +
    '<fieldset class="group"><legend>1 · Guest</legend><div class="fields">' +
    field('Full name', input('ci-name', rv ? rv.guestName : '', 'required autocomplete="off"')) +
    field('Phone number', input('ci-phone', rv ? rv.phone : '', 'required type="tel" onblur="guestLookup()"')) +
    field('Home address', input('ci-addr', rv ? rv.address : '', 'autocomplete="off" placeholder="Street, town, state"')) +
    field('Number of guests', input('ci-guests', (rv && rv.guests) || 1, 'type="number" min="1" max="20"')) +
    field('ID type', '<select id="ci-idtype">' + opts(ID_TYPES, rv && rv.idType) + '</select>') +
    field('ID number' + (needId ? '' : ' (optional)'), input('ci-idno', rv ? rv.idNumber : '', '')) +
    field('Vehicle plate (optional)', input('ci-car', rv ? rv.vehicle : '', 'autocapitalize="characters"')) +
    sourceField('ci-source', rv && rv.source) +
    photoField('idPhotos', 'Photo of ID' + (needId ? '' : ' (optional)')) +
    '<div class="full" id="ci-lookup" class="span-all"></div></div></fieldset>' +
    '<fieldset class="group"><legend>2 · Stay</legend><div class="fields">' +
    field('Room', '<select id="ci-room" onchange="ciCalc()">' + free.map(function (r) { return '<option value="' + r.id + '"' + (r.id === room.id ? ' selected' : '') + '>' + esc(r.number + ' · ' + roomType(r).name) + '</option>'; }).join('') + '</select>') +
    field('Nights', input('ci-nights', nights, 'type="number" min="1" required oninput="ciCalc()"')) +
    '<div class="field">Check-out<span class="static" id="ci-out"></span></div>' +
    '<div class="field">Rate per night<span class="static" id="ci-rate"></span></div>' +
    field('Discount (₦)', input('ci-disc', '', 'inputmode="numeric" oninput="ciCalc()"'), '', isAdmin() ? '' : 'Needs a reason. The owner will approve it.') +
    field('Discount reason', input('ci-discr', '', '')) +
    '</div></fieldset>' +
    '<fieldset class="group"><legend>3 · Payment</legend>' +
    payChoices('ci-method') + '</div>' +
    '<div class="fields">' +
    field('Amount received (₦)', input('ci-amount', '', 'inputmode="numeric" oninput="this.dataset.touched=1"'), '', 'Filled in with the amount due. Change it if the guest paid a different amount.') +
    field('Reference on the POS slip', input('ci-ref', '', 'autocomplete="off"'), '', 'For a bank transfer, the session ID on the receipt') +
    photoField('payPhotos', 'Photo of the slip (optional)') +
    '</div>' + payNote() + '</fieldset>' +
    '<fieldset class="group"><legend>4 · Caution fee and key card</legend><div class="fields">' +
    (st.cautionEnabled ? field('Caution fee (₦, refundable)', input('ci-caution', st.cautionAmount || '', 'inputmode="numeric" oninput="ciCalc()"')) + field("Guest's bank account for refund", input('ci-cacct', '', ''), '', 'Bank, account number and name') : '') +
    field('Key card number issued', input('ci-card', '', 'required')) +
    '</div><label class="check"><input type="checkbox" id="ci-agree" required>Guest has read the house rules and agrees that missing or damaged items are paid for' + (st.cautionEnabled ? ' from the caution fee' : '') + '.</label></fieldset>' +
    '<div class="card step-final" id="ci-sum"></div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="ci-save">Complete check-in</button></div></form>';
  openModal(rv ? 'Check in ' + rv.guestName : 'Check in guest', b, true);
  // On a phone: one part at a time, with the amount to collect always in view
  if (window.innerWidth <= 700) stepForm($('modalBody').querySelector('form'), { finish: 'Complete check-in', amountLabel: 'Collect now' });
  ciCalc();
}function guestLookup() {
  var ph = val('ci-phone').replace(/\D/g, ''); if (ph.length < 7) return;
  var prev = S.data.stays.filter(function (s) { return s.phone && s.phone.replace(/\D/g, '') === ph && s.status === 'checked_out'; });
  var box = $('ci-lookup'); if (!box) return;
  if (!prev.length && !guestLookup.asked) {
    // Older than the 90 days kept in memory: ask the database once
    guestLookup.asked = true; box.innerHTML = '';
    db.collection('stays').where('phone', '==', val('ci-phone')).limit(10).get().then(function (snap) {
      var old = docRows(snap).filter(function (s) { return s.status === 'checked_out' && !S.data.stays.some(function (x) { return x.id === s.id; }); });
      if (old.length) { S.data.stays = S.data.stays.concat(old); guestLookup(); }
      guestLookup.asked = false;
    }).catch(function () { guestLookup.asked = false; });
    return;
  }
  if (!prev.length) { box.innerHTML = ''; return; }
  var issues = prev.filter(function (s) { return (s.missing && s.missing.length) || s.damageNote || s.cautionDeductions > 0; });
  box.innerHTML = '<div class="note ' + (issues.length ? 'bad' : 'ok') + '">Returning guest: ' + prev.length + ' previous stay' + (prev.length > 1 ? 's' : '') + ' (last: Room ' + esc(prev[0].roomNo) + ', ' + fmtDate(prev[0].checkInDate) + '). ' + (issues.length ? issues.length + ' stay(s) had missing items or damage.' : 'No damage or issues recorded.') + '</div>';
  if (!val('ci-name')) $('ci-name').value = prev[0].guestName;
}
function ciCalc() {
  var r = byId(S.data.rooms, val('ci-room')); if (!r) return;
  var rate = Number(roomType(r).rate) || 0, n = Math.max(1, num(val('ci-nights'))), d = num(val('ci-disc')), t = todayStr();
  var out = addDays(t, n), total = Math.max(0, rate * n - d), caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0, prior = S.form.rvPaid || 0;
  var due = Math.max(0, total - prior) + caution, clash = overlaps(r.id, t, out, S.form.rvId);
  $('ci-out').textContent = fmtDate(out) + ', ' + S.settings.checkOutTime;
  $('ci-rate').textContent = money(rate) + (isAdmin() ? '' : ' (set by admin)');
  prefillAmount('ci-amount', due);
  var sb = $('sb-amt'); if (sb) sb.textContent = money(due);
  $('ci-sum').innerHTML = '<div class="row between"><span>Room ' + esc(r.number) + ' · ' + n + ' night' + (n > 1 ? 's' : '') + '</span><span class="money">' + money(rate * n) + '</span></div>' +
    (d ? '<div class="row between"><span>Discount</span><span class="money">-' + money(d) + '</span></div>' : '') +
    (prior ? '<div class="row between"><span>Deposit already paid</span><span class="money">-' + money(prior) + '</span></div>' : '') +
    (caution ? '<div class="row between"><span>Caution fee (refundable)</span><span class="money">' + money(caution) + '</span></div>' : '') +
    '<div class="row between strong total-row"><span>Collect now</span><span class="money">' + money(due) + '</span></div>' +
    (clash ? '<div class="note bad">Room ' + esc(r.number) + ' is booked for ' + esc(clash.guestName) + ' from ' + fmtDate(clash.checkInDate) + '. Pick another room or fewer nights.</div>' : '') +
    (rate === 0 ? '<div class="note warn">This room type has no rate yet. The owner sets rates in Admin settings → Rooms.</div>' : '');
}
async function saveCheckIn() {
  var r = byId(S.data.rooms, val('ci-room'));
  if (!r) return toast('Pick a room', true);
  if (r.status !== 'ready') return toast('Room ' + r.number + ' is not Ready', true);
  var type = roomType(r), rate = Number(type.rate) || 0, n = Math.max(1, num(val('ci-nights'))), t = todayStr();
  // A walk-in must never land on top of someone else's booking
  var clash = overlaps(r.id, t, addDays(t, n), S.form.rvId);
  if (clash) return toast('Room ' + r.number + ' is booked for ' + clash.guestName + ' from ' + fmtDate(clash.checkInDate) + '. Pick another room or fewer nights.', true);
  if (S.settings.requireId && !val('ci-idno') && !(S.form.idPhotos || []).length) return toast('Enter the ID number or add a photo of the ID', true);
  var method = radio('ci-method'), amount = num(val('ci-amount')), ref = val('ci-ref');
  if (amount > 0 && !ref) return toast('Enter the reference from the POS slip', true);
  var disc = num(val('ci-disc')), discR = val('ci-discr');
  if (disc > 0 && !discR) return toast('Give a reason for the discount', true);
  var total = Math.max(0, rate * n - disc), caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0, prior = S.form.rvPaid || 0;
  var owed = Math.max(0, total - prior), roomPaid = Math.min(amount, owed), cautionPaid = Math.min(caution, Math.max(0, amount - owed)), over = amount - roomPaid - cautionPaid;
  if (over > 0) return toast('That is ' + money(over) + ' more than the amount due. Check the amount.', true);
  // A wrong pre-filled amount must not slip through: anything short of the room price is confirmed as a part payment
  if (amount < owed) { if (!(await ask({ title: 'Part payment?', text: 'Received ' + money(amount) + ' but ' + money(owed) + ' is due for the room.\n' + money(owed - amount) + ' will be recorded as still owed' + (caution ? ', and no caution fee is held' : '') + '.', ok: 'Save as part payment', cancel: 'Fix the amount' }))) return; }
  else if (caution && cautionPaid < caution && !(await ask({ title: 'Caution fee short', text: 'The room is paid, but only ' + money(cautionPaid) + ' of the ' + money(caution) + ' caution fee was received.', ok: 'Check in anyway', cancel: 'Fix the amount' }))) return;
  if (amount > 0 && !(await refOk(ref, S.form.rvId))) return;
  rememberPayMethod(method);
  if ($('ci-save')) $('ci-save').disabled = true;
  if ($('sb-next')) $('sb-next').disabled = true;
  var now = Date.now(), b = db.batch();
  var sref = S.form.rvId ? db.collection('stays').doc(S.form.rvId) : db.collection('stays').doc();
  var stay = {
    roomId: r.id, roomNo: r.number, roomTypeName: type.name,
    guestName: val('ci-name'), phone: val('ci-phone'), address: val('ci-addr'), guests: Math.max(1, num(val('ci-guests'))), vehicle: val('ci-car'), source: val('ci-source') || 'walkin',
    idType: val('ci-idtype'), idNumber: val('ci-idno'), idPhotos: S.form.idPhotos,
    checkInDate: t, checkOutDate: addDays(t, n), nights: n, rate: rate,
    discount: disc, discountReason: discR, discountStatus: disc > 0 ? (isAdmin() ? 'approved' : 'pending') : 'none',
    total: total, paid: prior + roomPaid, balance: total - prior - roomPaid,
    caution: cautionPaid, cautionAccount: val('ci-cacct') || '', cautionStatus: cautionPaid ? 'held' : 'none',
    cardNo: val('ci-card'), cardReturned: false,
    status: 'checked_in', checkedInAt: now, checkedInBy: S.user.uid, checkedInByName: meName()
  };
  if (!S.form.rvId) Object.assign(stay, { createdAt: now, by: S.user.uid, byName: meName() });
  b.set(sref, stay, { merge: true });
  var pay = { stayId: sref.id, roomNo: r.number, guestName: stay.guestName, method: method, sender: '', ref: ref, photos: S.form.payPhotos, status: payStatus() };
  if (roomPaid > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: roomPaid, kind: 'room' }, pay, stamp()));
  if (cautionPaid > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: cautionPaid, kind: 'caution' }, pay, stamp()));
  b.update(db.collection('rooms').doc(r.id), { status: 'occupied', currentStayId: sref.id });
  audit('check_in', 'stay', sref.id, 'Room ' + r.number + ' · ' + stay.guestName + ' · ' + n + ' nights · paid ' + money(amount) + (prior ? ' · deposit ' + money(prior) : ''), b);
  b.commit().catch(fail);
  closeModal(); toast(stay.guestName + ' checked in to Room ' + r.number);
}
/* ---------- Reservation ---------- */
function openReservation(roomId, date) {
  if (!has('manager', 'frontdesk')) return;
  var rooms = roomsSorted().filter(function (r) { return r.status !== 'ooo'; });
  S.form = { payPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveReservation()"><div class="fields">' +
    field('Guest name', input('rv-name', '', 'required')) +
    field('Phone number', input('rv-phone', '', 'required type="tel"')) +
    field('Room', '<select id="rv-room" onchange="rvCalc()">' + rooms.map(function (r) { return '<option value="' + r.id + '"' + (r.id === roomId ? ' selected' : '') + '>' + esc(r.number + ' · ' + roomType(r).name) + '</option>'; }).join('') + '</select>') +
    field('Arrival date', input('rv-date', date || todayStr(), 'type="date" required')) +
    field('Nights', input('rv-nights', 1, 'type="number" min="1" required oninput="rvCalc()"')) +
    field('Expected arrival time', input('rv-time', S.settings.checkInTime, 'type="time"')) +
    sourceField('rv-source', 'phone') +
    '<div class="field">Stay cost<span class="static" id="rv-cost"></span></div>' +
    field('Note', '<textarea id="rv-note"></textarea>', 'full') +
    '</div><fieldset class="group"><legend>Deposit (optional)</legend>' + payChoices('rv-method') + '</div><div class="fields">' +
    field('Deposit received (₦)', input('rv-dep', '', 'inputmode="numeric"'), '', 'Leave empty if the guest will pay on arrival') +
    field('Reference', input('rv-ref', '', 'autocomplete="off"'), '', 'POS slip or transfer session ID') +
    photoField('payPhotos', 'Photo of the receipt (optional)') + '</div></fieldset>' +
    '<div class="note">The room is held for ' + (S.settings.holdHours || 3) + ' hours after the expected time, then it shows as a possible no-show. A deposit is taken off the amount due at check-in.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save reservation</button></div></form>';
  openModal('New reservation', b); rvCalc();
}
function rvCalc() {
  var r = byId(S.data.rooms, val('rv-room')), box = $('rv-cost'); if (!r || !box) return;
  var rate = Number(roomType(r).rate) || 0, n = Math.max(1, num(val('rv-nights')));
  box.textContent = money(rate * n) + ' (' + n + ' × ' + money(rate) + ')';
}function overlaps(roomId, from, to, ignoreId) {
  return S.data.stays.find(function (s) { return s.id !== ignoreId && s.roomId === roomId && (s.status === 'reserved' || s.status === 'checked_in') && s.checkInDate < to && from < s.checkOutDate; });
}
async function saveReservation() {
  var r = byId(S.data.rooms, val('rv-room')), from = val('rv-date'), n = Math.max(1, num(val('rv-nights'))), to = addDays(from, n);
  if (from < todayStr()) return toast('Arrival date is in the past', true);
  var clash = overlaps(r.id, from, to);
  if (clash) return toast('Room ' + r.number + ' is taken by ' + clash.guestName + ' (' + fmtDate(clash.checkInDate) + ' → ' + fmtDate(clash.checkOutDate) + ')', true);
  var dep = num(val('rv-dep')), pref = val('rv-ref'), method = radio('rv-method');
  if (dep > 0 && !pref) return toast('Enter the reference for the deposit', true);
  if (dep > 0 && !(await refOk(pref))) return;
  var ref = db.collection('stays').doc(), b = db.batch(), name = val('rv-name');
  b.set(ref, Object.assign({ roomId: r.id, roomNo: r.number, roomTypeName: roomType(r).name, guestName: name, phone: val('rv-phone'), source: val('rv-source') || 'phone', checkInDate: from, checkOutDate: to, nights: n, arrivalTime: val('rv-time'), notes: val('rv-note'), deposit: dep, paid: dep, status: 'reserved', createdAt: Date.now() }, stamp()));
  if (dep > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: ref.id, roomNo: r.number, guestName: name, amount: dep, kind: 'deposit', method: method, sender: '', ref: pref, photos: S.form.payPhotos || [], status: payStatus() }, stamp()));
  audit('reservation', 'stay', ref.id, 'Room ' + r.number + ' · ' + name + ' · ' + from + (dep ? ' · deposit ' + money(dep) : ''), b);
  b.commit().catch(fail);
  closeModal(); toast(dep ? 'Reservation saved with ' + money(dep) + ' deposit' : 'Reservation saved');
}
/* ---------- Stay detail ---------- */
var STAY_STATUS = { reserved: ['Reserved', 'st-reserved'], checked_in: ['In house', 'st-occupied'], checked_out: ['Checked out', 'st-ready'], cancelled: ['Cancelled', 'st-ooo'], no_show: ['No-show', 'st-ooo'] };
function openStay(id) {
  var s = findStay(id); if (!s) return toast('Stay not found', true);
  var ss = STAY_STATUS[s.status] || ['', ''], desk = has('manager', 'frontdesk');
  var pays = allPayments().filter(function (p) { return p.stayId === s.id; });
  var b = '<div class="row">' + pill(ss[0], ss[1]) + (isOverstay(s) ? pill('Overstay', 'st-bad') : '') + ((s.balance || 0) > 0 ? pill('Owes ' + money(s.balance), 'st-alert') : '') + '<span class="muted">Room ' + esc(s.roomNo) + ' · ' + esc(s.roomTypeName || '') + '</span></div>';
  b += '<div class="fields">' +
    info('Guest', s.guestName + (s.guests > 1 ? ' + ' + (s.guests - 1) + ' more' : '')) + info('Phone', s.phone) + info('ID', (s.idType || '') + ' ' + (s.idNumber || '')) +
    (s.address ? info('Address', s.address) : '') + (s.vehicle ? info('Vehicle', s.vehicle) : '') + (s.source ? info('Booked through', SOURCES[s.source] || s.source) : '') +
    info('Dates', fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate)) + info('Nights', s.nights) + (s.status === 'reserved' ? '' : info('Key card', (s.cardNo || '—') + (s.status === 'checked_out' ? (s.cardReturned ? ' · returned' : ' · NOT returned') : ''))) +
    (s.status === 'reserved' ? info('Deposit paid', money(s.paid || 0)) : '') +
    (s.extras ? info('Items on bill', money(s.extras)) : '') +
    (s.total != null ? info('Room total', money(s.total) + (s.discount ? ' (incl. ' + money(s.discount) + ' discount, ' + s.discountStatus + ')' : '')) : '') +
    (s.total != null ? info('Paid', money(s.paid || 0)) + info((s.balance || 0) < 0 ? 'In credit' : 'Balance owed', money(Math.abs(s.balance || 0))) : '') +
    (s.caution ? info('Caution fee', money(s.caution) + ' · ' + ({ held: 'held', refund_due: 'refund ' + money(s.cautionRefundDue) + ' due', refunded: 'refunded', kept: 'kept in full', none: '' }[s.cautionStatus] || '')) : '') +
    '</div>';
  if (s.idPhotos && s.idPhotos.length) b += '<div class="thumbs">' + thumbs(s.idPhotos) + '</div>';
  if (s.notes) b += '<div class="note">' + esc(s.notes) + '</div>';
  if (s.missing && s.missing.length) b += '<div class="note bad">Missing at check-out: ' + esc(s.missing.map(function (m) { return m.name + ' × ' + m.short; }).join(', ')) + (s.damageNote ? '. ' + esc(s.damageNote) : '') + '</div>';
  else if (s.damageNote) b += '<div class="note bad">' + esc(s.damageNote) + '</div>';
  if (pays.length) b += '<div><h3 class="sub-h">Payments</h3>' + pays.map(paymentRow).join('') + '</div>';
  var acts = [];
  if (s.status === 'reserved' && desk) {
    acts.push('<button class="btn primary" type="button" onclick="openCheckIn(\'' + s.roomId + '\',\'' + s.id + '\')">Check in</button>');
    acts.push('<button class="btn" type="button" onclick="endReservation(\'' + s.id + '\',\'no_show\')">Mark no-show</button>');
    acts.push('<button class="btn danger" type="button" onclick="endReservation(\'' + s.id + '\',\'cancelled\')">Cancel reservation</button>');
  }
  if (s.status === 'checked_in' && desk) {
    acts.push('<button class="btn" type="button" onclick="openExtend(\'' + s.id + '\')">Extend stay</button>');
    acts.push('<button class="btn primary" type="button" onclick="openCheckOut(\'' + s.id + '\')">Check out</button>');
    acts.push('<button class="btn" type="button" onclick="openMoveRoom(\'' + s.id + '\')">Move to another room</button>');
  }
  if ((s.status === 'checked_in' || s.status === 'checked_out') && (s.balance || 0) > 0 && desk) acts.unshift('<button class="btn primary" type="button" onclick="openExtend(\'' + s.id + '\', true)">Record balance payment</button>');
  if ((s.status === 'checked_in' || s.status === 'reserved') && desk) acts.push('<button class="btn" type="button" onclick="openEditStay(\'' + s.id + '\')">Edit details</button>');
  if (s.status === 'reserved' && desk) acts.push('<button class="btn" type="button" onclick="openMoveRoom(\'' + s.id + '\')">Change room</button>');
  if (s.discountStatus === 'pending' && isAdmin()) {
    acts.push('<button class="btn primary" type="button" onclick="decideDiscount(\'' + s.id + '\',true)">Approve discount</button>');
    acts.push('<button class="btn danger" type="button" onclick="decideDiscount(\'' + s.id + '\',false)">Reject discount</button>');
  }
  if (s.cautionStatus === 'refund_due' && has('manager')) acts.push('<button class="btn primary" type="button" onclick="openRefund(\'' + s.id + '\')">Record caution refund</button>');
  if (desk && (s.total != null || (s.paid || 0) > 0)) acts.push('<button class="btn" type="button" onclick="openReceipt(\'' + s.id + '\')">Receipt</button>');
  if (acts.length) b += '<div class="row">' + acts.join('') + '</div>';
  b += '<div class="muted small">Created by ' + esc(s.byName || '') + ' ' + fmtDT(s.createdAt) + (s.checkedInByName ? ' · checked in by ' + esc(s.checkedInByName) + ' ' + fmtDT(s.checkedInAt) : '') + (s.checkedOutByName ? ' · checked out by ' + esc(s.checkedOutByName) + ' ' + fmtDT(s.checkedOutAt) : '') + '</div>';
  openModal(s.guestName, b, true);
}
/* ---------- Receipt for the guest: WhatsApp, copy or print ---------- */
function receiptText(s) {
  var pays = sortBy(allPayments().filter(function (p) { return p.stayId === s.id && payCounts(p); }), function (p) { return p.at; });
  var L = ['*' + (S.settings.businessName || 'Wiwe Apartments') + '*', s.status === 'reserved' ? 'Booking confirmation' : 'Receipt', '',
    'Guest: ' + s.guestName, 'Room ' + s.roomNo + (s.roomTypeName ? ' (' + s.roomTypeName + ')' : ''),
    fmtDate(s.checkInDate) + ' to ' + fmtDate(s.checkOutDate) + ' · ' + s.nights + ' night' + (s.nights > 1 ? 's' : '') + (s.rate ? ' at ' + money(s.rate) : ''), ''];
  if (s.total != null) {
    if (s.discount && s.discountStatus !== 'rejected') L.push('Discount: -' + money(s.discount));
    L.push('Room total: ' + money(s.total));
    if (s.extras) L.push('Items: ' + money(s.extras));
  }
  if (pays.length) { L.push('', 'Payments'); pays.forEach(function (p) { L.push('• ' + money(p.amount) + ' ' + (PAY_KIND[p.kind] || p.kind).toLowerCase() + ' · ' + (PAY_LABEL[p.method] || p.method || '') + (p.ref ? ' ref ' + p.ref : '') + ' · ' + fmtDate(p.at)); }); }
  L.push('');
  if (s.total != null) L.push((s.balance || 0) > 0 ? 'Balance owed: ' + money(s.balance) : (s.balance || 0) < 0 ? 'In credit: ' + money(-s.balance) : 'Paid in full. Thank you.');
  else if (s.paid) L.push('Deposit received: ' + money(s.paid) + '. The rest is paid at check-in.');
  if (s.caution && s.cautionStatus === 'held') L.push('Refundable caution fee held: ' + money(s.caution));
  if (s.status !== 'checked_out') L.push('Check-out is by ' + S.settings.checkOutTime + ' on ' + fmtDate(s.checkOutDate) + '.');
  L.push('', 'Issued ' + fmtDT(Date.now()) + ' by ' + meName());
  return L.join('\n');
}
/* The receipt as a printable page with the logo; the WhatsApp / copy version is receiptText() */
function receiptHtml(s) {
  var pays = sortBy(allPayments().filter(function (p) { return p.stayId === s.id && payCounts(p); }), function (p) { return p.at; });
  var res = s.status === 'reserved', roomCost = (s.rate || 0) * (s.nights || 0);
  var disc = s.discount && s.discountStatus !== 'rejected' ? s.discount : 0, bill = (s.total != null ? s.total : roomCost - disc) + (s.extras || 0);
  var lines = '<tr><td>Room ' + esc(s.roomNo) + ' · ' + s.nights + ' night' + (s.nights > 1 ? 's' : '') + (s.rate ? ' × ' + money(s.rate) : '') + '</td><td class="r">' + money(roomCost) + '</td></tr>' +
    (disc ? '<tr class="sub"><td>Discount</td><td class="r">−' + money(disc) + '</td></tr>' : '') +
    (s.extras ? '<tr><td>Items added to the bill</td><td class="r">' + money(s.extras) + '</td></tr>' : '') +
    '<tr class="tot"><td>' + (res ? 'Stay cost' : 'Total') + '</td><td class="r">' + money(bill) + '</td></tr>';
  var paid = pays.length ? '<table><thead><tr><th>Payment</th><th class="r">Amount</th></tr></thead><tbody>' + pays.map(function (p) {
    return '<tr><td>' + esc(fmtDate(p.at) + ' · ' + (PAY_KIND[p.kind] || p.kind)) + '<br><span class="rcpt-no">' + esc(dots([PAY_LABEL[p.method] || p.method, p.ref ? 'ref ' + p.ref : ''])) + '</span></td><td class="r">' + money(p.amount) + '</td></tr>';
  }).join('') + '</tbody></table>' : '';
  var bal = s.balance || 0, end = res ? (s.paid ? 'Deposit received: ' + money(s.paid) + '. The rest is paid at check-in.' : 'Payment is due at check-in.') : bal > 0 ? 'Balance owed: ' + money(bal) : bal < 0 ? 'In credit: ' + money(-bal) : 'Paid in full. Thank you.';
  return '<div class="rcpt" id="rcpt"><div class="rcpt-head"><img src="img/logo.png" alt="' + esc(S.settings.businessName || 'Wiwe Apartments') + '"><span class="rcpt-title">' + (res ? 'Booking confirmation' : 'Receipt') + '</span><span class="rcpt-no">No. ' + esc(s.id.slice(-6).toUpperCase()) + ' · ' + esc(fmtDT(Date.now())) + '</span></div>' +
    '<dl class="rcpt-meta"><dt>Guest</dt><dd>' + esc(s.guestName) + '</dd><dt>Room</dt><dd>' + esc(s.roomNo + (s.roomTypeName ? ' · ' + s.roomTypeName : '')) + '</dd>' +
    '<dt>Arrival</dt><dd>' + esc(fmtDate(s.checkInDate)) + '</dd><dt>Departure</dt><dd>' + esc(fmtDate(s.checkOutDate) + ', by ' + S.settings.checkOutTime) + '</dd></dl>' +
    '<table><tbody>' + lines + '</tbody></table>' + paid +
    '<div class="rcpt-note"><strong>' + esc(end) + '</strong>' + (s.caution && s.cautionStatus === 'held' ? '<br>Refundable caution fee held: ' + money(s.caution) : '') + '</div>' +
    '<div class="rcpt-foot">' + esc(S.settings.businessName || 'Wiwe Apartments') + ' · Sowhe, Badagry<br>Issued by ' + esc(meName()) + '</div></div>';
}
function openReceipt(id) {
  var s = findStay(id); if (!s) return;
  var text = receiptText(s), phone = String(s.phone || '').replace(/\D/g, '').replace(/^0/, '234');
  S.receipt = text.replace(/\*/g, '');
  openModal('Receipt · ' + s.guestName, receiptHtml(s) +
    '<div class="row no-print"><a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/' + esc(phone) + '?text=' + encodeURIComponent(text) + '">Send on WhatsApp</a>' +
    '<button class="btn" type="button" onclick="printReceipt()">' + icon('printer', 16) + 'Print</button><button class="btn" type="button" onclick="copyReceipt()">Copy text</button>' +
    '<button class="btn" type="button" onclick="openStay(\'' + s.id + '\')">Back</button></div>');
}
// Prints only the receipt, not the page behind it
function printReceipt() {
  document.body.classList.add('print-modal');
  var done = function () { document.body.classList.remove('print-modal'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500);
}function copyReceipt() { (navigator.clipboard ? navigator.clipboard.writeText(S.receipt || '') : Promise.reject()).then(function () { toast('Copied'); }).catch(function () { toast('Could not copy', true); }); }function info(label, value) { return '<div class="field">' + esc(label) + '<span class="static">' + esc(value == null || value === '' ? '—' : value) + '</span></div>'; }
async function endReservation(id, status) {
  var s = findStay(id), dep = s.paid || 0, ns = status === 'no_show';
  if (!(await ask({ title: ns ? 'Mark as a no-show?' : 'Cancel the reservation?', text: s.guestName + ' · Room ' + s.roomNo + ' · ' + fmtDate(s.checkInDate) + '. The room becomes free for these dates.', ok: ns ? 'Mark no-show' : 'Cancel reservation', cancel: 'Keep it', danger: true }))) return;
  var refund = dep > 0 && await ask({ title: 'Refund the deposit?', text: 'A deposit of ' + money(dep) + ' was paid. A refund waits for the owner to approve it.', ok: 'Refund ' + money(dep), cancel: 'Keep the deposit' });
  var b = db.batch();
  b.update(db.collection('stays').doc(id), { status: status, endedAt: Date.now(), endedBy: S.user.uid, depositRefund: refund ? dep : 0 });
  if (refund) b.set(db.collection('payments').doc(), Object.assign({ stayId: id, roomNo: s.roomNo, guestName: s.guestName, amount: -dep, kind: 'refund_deposit', method: 'transfer', ref: '', note: 'Deposit refund: reservation ' + (status === 'no_show' ? 'no-show' : 'cancelled'), status: 'unconfirmed' }, stamp()));
  audit(status, 'stay', id, s.guestName + ' · Room ' + s.roomNo + (dep ? (refund ? ' · deposit refund requested ' : ' · deposit kept ') + money(dep) : ''), b);
  b.commit().catch(fail); closeModal(); toast(refund ? 'Reservation updated. Refund waits for the owner.' : 'Reservation updated');
}
function decideDiscount(id, ok) {
  var s = findStay(id), d = s.discount || 0, upd = { discountStatus: ok ? 'approved' : 'rejected', discountDecidedBy: S.user.uid, discountDecidedAt: Date.now() }, b = db.batch();
  if (!ok) { upd.total = FV.increment(d); upd.balance = FV.increment(d); }
  b.update(db.collection('stays').doc(id), upd);
  audit(ok ? 'discount_approved' : 'discount_rejected', 'stay', id, money(d) + ' · ' + s.guestName, b);
  b.commit().catch(fail);
  closeModal(); toast(ok ? 'Discount approved' : 'Discount rejected. The guest owes ' + money((s.balance || 0) + d));
}
/* ---------- Extend / balance ---------- */
function openExtend(id, balanceOnly) {
  var s = findStay(id); if (!s) return; S.form = { payPhotos: [], stayId: id, balanceOnly: !!balanceOnly };
  var b = '<form class="form" onsubmit="event.preventDefault();saveExtend()"><div class="fields">' +
    (balanceOnly ? info('Balance owed', money(s.balance)) : field('Extra nights', input('ex-n', 1, 'type="number" min="1" required oninput="exCalc()"')) + '<div class="field">New check-out<span class="static" id="ex-out"></span></div>') +
    '<div class="field">Amount due<span class="static" id="ex-due"></span></div></div>' +
    payChoices('ex-method') + '</div>' +
    '<div class="fields">' + field('Amount received (₦)', input('ex-amount', '', 'inputmode="numeric" oninput="this.dataset.touched=1"')) + field('Reference on the POS slip', input('ex-ref', '', 'autocomplete="off"')) + photoField('payPhotos', 'Photo of the slip (optional)') + '</div>' + payNote() +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(balanceOnly ? 'Balance payment · ' + s.guestName : 'Extend stay · ' + s.guestName, b);
  exCalc();
}
function exCalc() {
  var s = findStay(S.form.stayId); if (!s) return;
  var bal = Math.max(0, s.balance || 0);
  if (S.form.balanceOnly) { $('ex-due').textContent = money(bal); prefillAmount('ex-amount', bal); return; }
  var n = Math.max(1, num(val('ex-n')));
  $('ex-out').textContent = fmtDate(addDays(s.checkOutDate, n));
  prefillAmount('ex-amount', n * (s.rate || 0) + bal);
  $('ex-due').textContent = money(n * (s.rate || 0) + bal) + (bal > 0 ? ' (incl. ' + money(bal) + ' balance)' : '');
}
async function saveExtend() {
  var s = findStay(S.form.stayId), only = S.form.balanceOnly, method = radio('ex-method'), amount = num(val('ex-amount')), ref = val('ex-ref');
  if (amount > 0 && !ref) return toast('Enter the reference from the POS slip', true);
  if (only && amount <= 0) return toast('Enter the amount received', true);
  var upd = {}, extra = 0, n = 0, newOut = s.checkOutDate;
  if (!only) {
    n = Math.max(1, num(val('ex-n'))); extra = n * (s.rate || 0); newOut = addDays(s.checkOutDate, n);
    var clash = overlaps(s.roomId, s.checkOutDate, newOut, s.id);
    if (clash) return toast('Room ' + s.roomNo + ' is reserved for ' + clash.guestName + ' from ' + fmtDate(clash.checkInDate) + '. Move one of them first.', true);
    upd.checkOutDate = newOut; upd.nights = FV.increment(n); upd.total = FV.increment(extra);
  }
  var due = Math.max(0, s.balance || 0) + extra;
  if (amount > due) return toast('That is more than the ' + money(due) + ' due. Check the amount.', true);
  if (amount < due && !(await ask({ title: 'Part payment?', text: 'Received ' + money(amount) + ' but ' + money(due) + ' is due.\n' + money(due - amount) + ' will stay on the guest\'s balance.', ok: 'Save as part payment', cancel: 'Fix the amount' }))) return;
  if (amount > 0 && !(await refOk(ref, s.id))) return;
  rememberPayMethod(method);
  // increments, not totals worked out on this phone, so two devices can never overwrite each other
  upd.paid = FV.increment(amount); upd.balance = FV.increment(extra - amount);
  var b = db.batch();
  b.update(db.collection('stays').doc(s.id), upd);
  if (amount > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: s.id, roomNo: s.roomNo, guestName: s.guestName, amount: amount, kind: only ? 'balance' : 'extension', method: method, sender: '', ref: ref, photos: S.form.payPhotos, status: payStatus() }, stamp()));
  audit(only ? 'balance_payment' : 'extend', 'stay', s.id, (n ? '+' + n + ' nights · ' : '') + 'paid ' + money(amount), b);
  b.commit().catch(fail);
  closeModal(); toast(only ? 'Payment recorded' : 'Stay extended to ' + fmtDate(newOut));
}
/* ---------- Check-out ---------- */
function openCheckOut(id) {
  var s = findStay(id), r = byId(S.data.rooms, s.roomId), type = roomType(r), bal = Math.max(0, s.balance || 0);
  S.form = { stayId: id, damagePhotos: [] };
  var items = type.items || [];
  var b = '<form class="form" onsubmit="event.preventDefault();saveCheckOut()">' +
    (bal > 0 ? '<div class="note bad">Guest still owes ' + money(bal) + '. ' + (s.caution ? 'It can be taken from the caution fee below.' : 'Record the payment first (Cancel, then "Record balance payment").') + '</div>' : '') +
    (function () {
      var unused = daysBetween(todayStr(), s.checkOutDate); if (unused <= 0) return '';
      S.form.unused = unused;
      return '<fieldset class="group"><legend>Leaving early · ' + unused + ' unused night' + (unused > 1 ? 's' : '') + '</legend>' +
        '<div class="muted">Booked until ' + fmtDate(s.checkOutDate) + '. Unused nights at the booked rate come to ' + money(unused * (s.rate || 0)) + '.</div><div class="fields">' +
        field('Refund to guest (₦)', input('co-refund', 0, 'inputmode="numeric"'), '', 'Leave 0 if your policy is no refund. Refunds wait for owner approval.') +
        field('Refund to account / reference', input('co-refref', '', '')) + '</div></fieldset>';
    })() +
    '<fieldset class="group"><legend>Room items · count everything</legend>' +
    (items.length ? '<div class="count-row muted small"><span>Item</span><span>Expected</span><span>Found</span></div>' + items.map(function (it, i) { return '<div class="count-row"><span>' + esc(it.name) + '</span><span>' + it.qty + '</span><input id="co-i' + i + '" type="number" min="0" value="' + it.qty + '" aria-label="' + esc(it.name) + ' found"></div>'; }).join('') : '<div class="muted">No item list for this room type. Add one in Admin settings → Rooms.</div>') +
    '</fieldset>' +
    '<div class="fields">' + field('Damage or other notes', '<textarea id="co-note" placeholder="e.g. stain on bedsheet, broken glass"></textarea>', 'full') +
    photoField('damagePhotos', 'Photos of damage') +
    (s.caution ? field('Deduct from caution fee for damage (₦)', input('co-ded', '', 'inputmode="numeric"'), '', 'Caution held: ' + money(s.caution)) : field('Amount charged for damage (₦)', input('co-ded', '', 'inputmode="numeric"'), '', 'No caution fee held. Take it on the POS and enter the reference.') + field('Reference for the damage payment', input('co-dref', '', 'autocomplete="off"'))) +
    '</div>' +
    (s.caution && bal > 0 ? '<label class="check"><input type="checkbox" id="co-usecaution" checked>Take the ' + money(bal) + ' owed from the caution fee</label>' : '') +
    '<label class="check"><input type="checkbox" id="co-card" checked>Key card ' + esc(s.cardNo || '') + ' returned</label>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Complete check-out</button></div></form>';
  openModal('Check out · Room ' + s.roomNo + ' · ' + s.guestName, b, true);
}
async function saveCheckOut() {
  var s = findStay(S.form.stayId), r = byId(S.data.rooms, s.roomId), items = roomType(r).items || [];
  var missing = [];
  items.forEach(function (it, i) { var f = num(val('co-i' + i)); if (f < it.qty) missing.push({ name: it.name, expected: it.qty, found: f, short: it.qty - f }); });
  var note = val('co-note'), ded = num(val('co-ded')), card = val('co-card'), bal = Math.max(0, s.balance || 0), caution = s.caution || 0;
  if (!caution && ded > 0 && !val('co-dref')) return toast('Enter the reference for the damage payment', true);
  if (!caution && ded > 0 && !(await refOk(val('co-dref'), s.id))) return;
  if ((missing.length || note) && !ded && !(await ask({ title: 'Nothing charged?', text: 'Items are missing or damaged, but no charge was entered. An incident is still reported to the owner.', ok: 'Check out without charging', cancel: 'Enter a charge' }))) return;
  var kept = Math.min(ded, caution), applied = caution && val('co-usecaution') ? Math.min(bal, caution - kept) : 0, left = bal - applied;
  if (left > 0 && !(await ask({ title: s.guestName + ' still owes ' + money(left), text: 'If they leave now, the debt is listed under Stays → Owing until it is paid.', ok: 'Check out owing', cancel: 'Record the payment first', danger: true }))) return;
  var now = Date.now(), b = db.batch();
  var upd = { status: 'checked_out', checkedOutAt: now, checkedOutBy: S.user.uid, checkedOutByName: meName(), missing: missing, damageNote: note, damagePhotos: S.form.damagePhotos, cardReturned: !!card, cautionDeductions: kept, cautionApplied: applied };
  if (applied > 0) { upd.paid = FV.increment(applied); upd.balance = FV.increment(-applied); }
  if (caution) { var refund = Math.max(0, caution - kept - applied); upd.cautionRefundDue = refund; upd.cautionStatus = refund > 0 ? 'refund_due' : 'kept'; }
  if (S.form.unused > 0) {
    var early = num(val('co-refund'));
    upd.earlyCheckout = { bookedUntil: s.checkOutDate, unusedNights: S.form.unused, refund: early };
    upd.checkOutDate = todayStr(); upd.nights = Math.max(1, (s.nights || 0) - S.form.unused);
    if (early > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: s.id, roomNo: s.roomNo, guestName: s.guestName, amount: -early, kind: 'refund_early', method: 'transfer', ref: val('co-refref'), note: 'Early check-out: ' + S.form.unused + ' unused night(s)', status: 'unconfirmed' }, stamp()));
  }
  if (!caution && ded > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: s.id, roomNo: s.roomNo, guestName: s.guestName, amount: ded, kind: 'damage', method: lastPayMethod(), sender: '', ref: val('co-dref'), photos: [], status: payStatus() }, stamp()));
  b.update(db.collection('stays').doc(s.id), upd);
  b.update(db.collection('rooms').doc(r.id), { status: 'dirty', currentStayId: null });
  if (missing.length || note || !card) b.set(db.collection('incidents').doc(), Object.assign({ type: 'missing_item', title: 'Room ' + s.roomNo + ': ' + (missing.length ? missing.map(function (m) { return m.name + ' × ' + m.short; }).join(', ') : '') + (note ? ' ' + note : '') + (!card ? ' · key card not returned' : ''), roomNo: s.roomNo, stayId: s.id, photos: S.form.damagePhotos, charged: ded, resolved: false }, stamp()));
  audit('check_out', 'stay', s.id, 'Room ' + s.roomNo + ' · ' + s.guestName + (missing.length ? ' · missing ' + missing.length : '') + (ded ? ' · charged ' + money(ded) : '') + (applied ? ' · ' + money(applied) + ' owed taken from caution' : '') + (left > 0 ? ' · LEFT OWING ' + money(left) : ''), b);
  b.commit().catch(fail);
  createTurnoverTask(r, s);
  closeModal(); toast('Checked out. Cleaning task created for Room ' + s.roomNo);
}
/* ---------- Caution refund ---------- */
function openRefund(id) {
  var s = findStay(id);
  var b = '<form class="form" onsubmit="event.preventDefault();saveRefund(\'' + id + '\')"><div class="fields">' +
    info('Caution held', money(s.caution)) + info('Deducted', money(s.cautionDeductions || 0)) + info('Refund due', money(s.cautionRefundDue)) + info("Guest's account", s.cautionAccount) +
    field('Amount refunded (₦)', input('rf-amt', s.cautionRefundDue, 'inputmode="numeric" required')) + field('Transfer reference', input('rf-ref', '', 'required')) +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save refund</button></div></form>';
  openModal('Caution refund · ' + s.guestName, b);
}
function saveRefund(id) {
  var s = findStay(id), amt = num(val('rf-amt')), b = db.batch();
  b.update(db.collection('stays').doc(id), { cautionStatus: 'refunded', cautionRefund: { amount: amt, ref: val('rf-ref'), by: S.user.uid, byName: meName(), at: Date.now() } });
  b.set(db.collection('payments').doc(), Object.assign({ stayId: id, roomNo: s.roomNo, guestName: s.guestName, amount: -amt, kind: 'refund', method: 'transfer', ref: val('rf-ref'), status: 'confirmed' }, stamp()));
  b.commit().catch(fail); audit('caution_refund', 'stay', id, money(amt)); closeModal(); toast('Refund recorded');
}

/* ---------- Stays list ---------- */
VIEWS.stays = {
  title: 'Stays',
  actions: VIEWS.board.actions,
  render: function () {
    var tab = curTab('stays', 'inhouse'), q = (S.params.q || '').toLowerCase();
    if (tab === 'calendar') return staysTabs() + stayCalendar();
    var list = tab === 'owing' ? sortBy(debtors(), function (s) { return s.balance; }, true) : S.data.stays.filter(function (s) { return tab === 'inhouse' ? s.status === 'checked_in' : tab === 'upcoming' ? s.status === 'reserved' : tab === 'past' ? s.status === 'checked_out' : ['cancelled', 'no_show'].indexOf(s.status) >= 0; });
    if (q) list = list.filter(function (s) { return (s.guestName + ' ' + s.phone + ' ' + s.roomNo).toLowerCase().indexOf(q) >= 0; });
    if (tab === 'upcoming') list = sortBy(list, function (s) { return s.checkInDate; });
    if (tab === 'inhouse') list = sortBy(list, function (s) { return s.checkOutDate; });
    var html = staysTabs() +
      '<div class="row"><input class="search" id="stay-q" type="search" placeholder="Search name, phone or room" value="' + esc(S.params.q || '') + '" oninput="S.params.q=this.value;render()"></div>';
    if (!list.length) return html + staysEmpty(tab, S.params.q);
    return html + '<div class="table-wrap"><table><thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Nights</th><th class="right">Total</th><th>Status</th></tr></thead><tbody>' +
      list.slice(0, 200).map(function (s) {
        var ss = STAY_STATUS[s.status] || ['', ''];
        return '<tr class="clickable" onclick="openStay(\'' + s.id + '\')"><td><strong>' + esc(s.guestName) + '</strong><div class="muted small">' + esc(s.phone || '') + '</div></td><td>' + esc(s.roomNo) + '</td><td>' + fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate) + '</td><td>' + (s.nights || '') + '</td><td class="right money">' + (s.total != null ? money(s.total) : '—') + '</td><td>' + pill(ss[0], ss[1]) + (isOverstay(s) ? ' ' + pill('Overstay', 'st-bad') : '') + ((s.balance || 0) > 0 ? ' ' + pill('Owes ' + money(s.balance), 'st-alert') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
};

/* ---------- Payments ---------- */
// Staff payments wait as "unconfirmed" until the owner matches them to the POS settlement or bank.
// The owner can also void a wrong record. Refunds wait for approval.
var PAY_KIND = { room: 'Room', extension: 'Extension', balance: 'Balance', deposit: 'Deposit', caution: 'Caution fee', damage: 'Damage', refund: 'Caution refund', refund_early: 'Early check-out refund', refund_deposit: 'Deposit refund', sale: 'Item sale' };
var PAY_ON_STAY = ['room', 'extension', 'balance', 'deposit']; // kinds that count towards what the guest has paid for the room
function payPill(p) {
  if (p.status === 'void') return pill('Void', 'st-ooo');
  if (p.status === 'rejected') return pill(p.amount < 0 ? 'Refund refused' : 'Not received', 'st-bad');
  if (p.status === 'unconfirmed' && p.amount < 0) return pill('Waiting for approval', 'st-alert');
  if (p.status === 'unconfirmed') return pill('Unconfirmed', 'st-alert');
  return p.amount < 0 ? pill('Refunded', 'st-ready') : pill('Confirmed', 'st-ready');
}
function normRef(r) { return String(r || '').replace(/\s+/g, '').toLowerCase(); }
// The same slip used for two payments is the classic trick. Two parts of one payment (room + caution) share a reference and are fine.
function sameSlip(a, b) { return a.stayId === b.stayId && Math.abs((a.at || 0) - (b.at || 0)) < 120000; }
function dupOf(p) { var r = normRef(p.ref); if (!r || p.status === 'void') return null; return allPayments().find(function (x) { return x.id !== p.id && x.status !== 'void' && normRef(x.ref) === r && !sameSlip(x, p); }) || null; }
async function refOk(ref, stayId) {
  var d = dupOf({ id: '', ref: ref, stayId: stayId || '', at: Date.now() });
  return !d || await ask({ title: 'Reference already used', text: 'Reference ' + ref + ' was used for ' + money(d.amount) + ', Room ' + d.roomNo + ' (' + d.guestName + '), ' + fmtDT(d.at) + ' by ' + (d.byName || 'staff') + '.\nOne slip cannot pay twice.', ok: 'Save anyway (flagged)', cancel: 'Check the slip', danger: true });
}
function staysEmpty(tab, q) {
  if (q) return emptyState('search', 'No stays match "' + q + '"', 'Search by guest name, phone number or room number.');
  var desk = has('manager', 'frontdesk'), m = {
    inhouse: ['stays', 'No guests in the house', 'Checked-in guests show here until they check out.', 'Check in guest', 'openCheckIn()'],
    upcoming: ['calendar', 'No reservations', 'Bookings for later dates show here, with any deposit paid.', 'New reservation', 'openReservation()'],
    owing: ['payments', 'Nobody owes money', 'Guests with an unpaid balance show here, whether they are still in the house or have left.'],
    past: ['stays', 'No check-outs in the last 90 days', 'Older stays are kept in Reports and the backup.'],
    other: ['stays', 'No cancellations or no-shows', '']
  }[tab] || ['list', 'Nothing here', ''];
  return emptyState(m[0], m[1], m[2], desk ? m[3] : '', m[4]);
}
function paymentRow(p) {
  var acts = '', dup = dupOf(p);
  if (isAdmin() && p.status === 'unconfirmed' && p.amount > 0) acts = '<button class="btn small primary" type="button" onclick="event.stopPropagation();confirmPayment(\'' + p.id + '\')">Seen in bank</button><button class="btn small danger" type="button" onclick="event.stopPropagation();rejectPayment(\'' + p.id + '\')">Not received</button>';
  else if (isAdmin() && p.status === 'unconfirmed' && p.amount < 0) acts = '<button class="btn small primary" type="button" onclick="event.stopPropagation();decidePayment(\'' + p.id + '\',\'confirmed\')">Approve refund</button><button class="btn small danger" type="button" onclick="event.stopPropagation();decidePayment(\'' + p.id + '\',\'rejected\')">Refuse</button>';
  else if (isAdmin() && p.status !== 'void' && p.status !== 'rejected') acts = '<button class="btn small" type="button" onclick="event.stopPropagation();voidPayment(\'' + p.id + '\')">Void</button>';
  var st = payPill(p) + (dup ? pill('Same ref as Room ' + (dup.roomNo || '?'), 'st-bad') : '');
  return recRow({
    l1: '<span class="amt' + (p.amount < 0 ? ' neg' : '') + '">' + money(p.amount) + '</span>' + (p.guestName ? '<span class="who">' + esc(p.guestName) + '</span>' : ''),
    l2: dots([PAY_KIND[p.kind] || p.kind, p.roomNo ? 'Room ' + p.roomNo : '', PAY_LABEL[p.method] || p.method, p.ref ? 'ref ' + p.ref : '']),
    l3: dots([p.byName, fmtDT(p.at), p.note, p.voidReason ? 'void: ' + p.voidReason : '']),
    extra: p.photos && p.photos.length ? '<span class="thumbs">' + thumbs(p.photos) + '</span>' : '',
    side: (st ? '<span class="row">' + st + '</span>' : '') + (acts ? '<span class="row">' + acts + '</span>' : '')
  });
}
async function decidePayment(id, status) {
  var p = findPayment(id); if (!p) return;
  if (status === 'rejected' && !(await ask({ title: 'Refuse this refund?', text: money(-p.amount) + ' for ' + p.guestName + ' (' + (p.note || 'Room ' + p.roomNo) + '). The guest gets nothing back.', ok: 'Refuse refund', danger: true }))) return;
  var b = db.batch();
  b.update(db.collection('payments').doc(id), { status: status, decidedBy: S.user.uid, decidedAt: Date.now() });
  audit(status === 'confirmed' ? 'refund_approved' : 'refund_refused', 'payment', id, money(-p.amount) + ' · Room ' + p.roomNo + ' · ' + p.guestName, b);
  b.commit().catch(fail);
  toast(status === 'confirmed' ? 'Refund approved' : 'Refund refused');
}
// Money in: the owner has seen it in the POS settlement or bank
function confirmPayment(id) {
  var p = findPayment(id); if (!p) return;
  var b = db.batch();
  b.update(db.collection('payments').doc(id), { status: 'confirmed', decidedBy: S.user.uid, decidedByName: meName(), decidedAt: Date.now() });
  audit('payment_confirmed', 'payment', id, money(p.amount) + ' · Room ' + p.roomNo + ' · ' + p.guestName, b);
  b.commit().catch(fail);
  toast('Payment confirmed');
}
async function confirmAllPayments() {
  var list = unconfirmedPayments(); if (!list.length) return;
  var tot = sum(list, function (p) { return p.amount; }), pos = sum(list.filter(function (p) { return p.method === 'pos'; }), function (p) { return p.amount; });
  if (!(await ask({ title: 'Confirm all ' + list.length + ' payments?', text: 'Total ' + money(tot) + ' (' + money(pos) + ' by POS, ' + money(tot - pos) + ' by transfer).\nOnly do this when the POS settlement and bank statement show every one of them.', ok: 'Confirm all ' + list.length, cancel: 'Check one by one' }))) return;
  for (var i = 0; i < list.length; i += 200) {
    var b = db.batch(), now = Date.now();
    list.slice(i, i + 200).forEach(function (p) { b.update(db.collection('payments').doc(p.id), { status: 'confirmed', decidedBy: S.user.uid, decidedByName: meName(), decidedAt: now }); });
    if (i === 0) audit('payments_confirmed', 'payment', '', list.length + ' payments · ' + money(tot), b);
    b.commit().catch(fail);
  }
  toast(list.length + ' payments confirmed');
}
// Money in that never arrived: take it off the guest's account (like a void) and open an incident
async function rejectPayment(id) {
  var p = findPayment(id); if (!p) return;
  var onStay = p.stayId && PAY_ON_STAY.indexOf(p.kind) >= 0;
  if (!(await ask({ title: 'Not in the bank?', text: money(p.amount) + ' · ' + (PAY_KIND[p.kind] || p.kind) + ' · ' + (p.guestName || '') + ' · ref ' + (p.ref || '—') + ', recorded by ' + (p.byName || 'staff') + '.' + (onStay ? '\nThe amount goes back on the guest\'s balance.' : '') + '\nAn incident is opened so it is followed up.', ok: 'Mark not received', danger: true }))) return;
  var b = db.batch(), s = p.stayId ? findStay(p.stayId) : null, a = p.amount;
  b.update(db.collection('payments').doc(id), { status: 'rejected', decidedBy: S.user.uid, decidedByName: meName(), decidedAt: Date.now() });
  if (onStay) b.update(db.collection('stays').doc(p.stayId), s && s.status === 'reserved' ? { paid: FV.increment(-a), deposit: FV.increment(-a) } : { paid: FV.increment(-a), balance: FV.increment(a) });
  if (p.stayId && p.kind === 'caution') b.update(db.collection('stays').doc(p.stayId), { caution: FV.increment(-a) });
  b.set(db.collection('incidents').doc(), Object.assign({ type: 'payment_rejected', title: money(a) + ' for Room ' + p.roomNo + ' (' + p.guestName + ') not in bank, ref ' + (p.ref || '—') + ', recorded by ' + (p.byName || 'staff'), stayId: p.stayId || '', paymentId: id, resolved: false }, stamp()));
  audit('payment_rejected', 'payment', id, money(a) + ' · Room ' + p.roomNo + ' · ' + p.guestName, b);
  b.commit().catch(fail);
  toast('Marked as not received' + (onStay ? '. The guest now owes ' + money(a) + ' more.' : ''));
}
// Voiding a payment gives the money back to the guest's balance, so the stay shows what is really owed
async function voidPayment(id) {
  var p = findPayment(id); if (!p) return;
  var reason = await askText({ title: 'Void ' + money(p.amount) + '?', text: (PAY_KIND[p.kind] || p.kind) + ' · ' + (p.guestName || '') + ' · ref ' + (p.ref || '—') + (p.stayId && p.amount > 0 && PAY_ON_STAY.indexOf(p.kind) >= 0 ? '\nThe amount goes back on the guest\'s balance.' : ''), label: 'Reason', ok: 'Void payment', danger: true }); if (!reason) return;
  var b = db.batch(), s = p.stayId ? findStay(p.stayId) : null, a = p.amount;
  b.update(db.collection('payments').doc(id), { status: 'void', voidReason: reason, decidedBy: S.user.uid, decidedAt: Date.now() });
  if (p.stayId && a > 0 && PAY_ON_STAY.indexOf(p.kind) >= 0) b.update(db.collection('stays').doc(p.stayId), s && s.status === 'reserved' ? { paid: FV.increment(-a), deposit: FV.increment(-a) } : { paid: FV.increment(-a), balance: FV.increment(a) });
  if (p.stayId && a > 0 && p.kind === 'caution') b.update(db.collection('stays').doc(p.stayId), { caution: FV.increment(-a) });
  audit('payment_void', 'payment', id, money(a) + ' · Room ' + p.roomNo + ' · ' + reason, b);
  b.commit().catch(fail);
  toast('Payment voided' + (p.stayId && a > 0 && PAY_ON_STAY.indexOf(p.kind) >= 0 ? '. The guest now owes ' + money(a) + ' more.' : ''));
}
VIEWS.payments = {
  title: 'Payments',
  render: function () {
    var up = unconfirmedPayments(), tab = curTab('payments', up.length ? 'confirm' : 'all'), q = normRef(S.params.pq), all = allPayments(), wait = refundsWaiting();
    var t = todayStr(), todays = all.filter(function (p) { return dateStr(new Date(p.at)) === t && payCounts(p) && p.amount > 0; });
    var by = function (m) { return sum(todays.filter(function (p) { return p.method === m; }), function (p) { return p.amount; }); };
    var dups = all.filter(function (p) { return dupOf(p); });
    var list = tab === 'confirm' ? sortBy(up, function (p) { return p.at; }) : tab === 'refunds' ? all.filter(function (p) { return p.amount < 0; }) : tab === 'void' ? all.filter(function (p) { return p.status === 'void' || p.status === 'rejected'; }) : tab === 'dups' ? dups : all.filter(function (p) { return p.status !== 'void'; });
    if (q) list = list.filter(function (p) { return normRef(p.ref + ' ' + p.guestName + ' ' + p.roomNo).indexOf(q) >= 0; });
    var html = '<section class="grid-stats">' +
      stat('Recorded today', money(sum(todays, function (p) { return p.amount; })), todays.length + ' payment' + (todays.length === 1 ? '' : 's')) +
      stat('By POS today', money(by('pos')), money(by('transfer')) + ' by bank transfer') +
      stat('Waiting for owner', up.length, up.length ? money(sum(up, function (p) { return p.amount; })) + ' to confirm' : 'All confirmed', up.length ? 'warn' : '') +
      stat('Refunds to approve', wait.length, wait.length ? money(-sum(wait, function (p) { return p.amount; })) : 'None waiting', wait.length ? 'warn' : '') +
      '</section>' +
      tabs('payments', [['confirm', 'To confirm' + (up.length ? ' (' + up.length + ')' : '')], ['all', 'All'], ['refunds', 'Refunds' + (wait.length ? ' (' + wait.length + ' to approve)' : '')], ['dups', 'Same reference (' + dups.length + ')'], ['void', 'Void']]) +
      '<div class="row"><input class="search" id="pay-q" type="search" placeholder="Search reference, guest or room" value="' + esc(S.params.pq || '') + '" oninput="S.params.pq=this.value;render()"></div>' +
      (tab === 'confirm' && up.length ? (isAdmin() ? '<div class="note">Match each payment to the POS settlement or your bank app by amount and reference. Tap "Seen in bank" only when the money is really there.</div>' + (up.length > 1 ? '<div class="row mb-2"><button class="btn" type="button" onclick="confirmAllPayments()">Confirm all ' + up.length + ' (' + money(sum(up, function (p) { return p.amount; })) + ')</button></div>' : '') : '<div class="note">Only the owner can confirm payments. Keep every POS slip until it is confirmed.</div>') : '') +
      (tab === 'dups' ? '<div class="note">These payments share a reference with another payment. One slip should pay once: check each pair against the POS report.</div>' : '');
    if (!list.length) return html + (q ? emptyState('search', 'No payments match', 'Search by the reference on the slip, the guest\'s name or the room number.') : emptyState('payments', { confirm: 'Every payment is confirmed', refunds: 'No refunds', dups: 'No reference used twice', void: 'Nothing voided' }[tab] || 'No payments in the last 90 days', { confirm: 'Payments recorded by staff wait here until the owner matches them to the POS settlement or bank.', refunds: 'Early check-out and deposit refunds show here. The owner approves each one.', dups: 'Good: every payment has its own slip reference.', void: 'Payments the owner voids show here with the reason.' }[tab] || 'Payments are recorded at check-in, extension, balance payment and sales.'));
    return html + '<div class="card">' + list.slice(0, 200).map(paymentRow).join('') + '</div>';
  }
};
/* ---------- Incidents (leak watch items) ---------- */
function openIncident(id) {
  var i = byId(S.data.incidents, id); if (!i) return;
  var b = '<div class="note bad">' + esc(i.title) + '</div>' + (i.note ? '<div>' + esc(i.note) + '</div>' : '') + (i.photos && i.photos.length ? '<div class="thumbs">' + thumbs(i.photos) + '</div>' : '') +
    '<div class="muted">Reported by ' + esc(i.byName) + ', ' + fmtDT(i.at) + '</div>' +
    (i.stayId ? '<button class="btn" type="button" onclick="openStay(\'' + i.stayId + '\')">Open the stay</button>' : '') +
    (has('manager') ? '<div class="field">How was it resolved?<textarea id="inc-res"></textarea></div><div class="form-actions"><button class="btn primary" type="button" onclick="resolveIncident(\'' + id + '\')">Mark resolved</button></div>' : '');
  openModal('Incident', b);
}
function resolveIncident(id) {
  var note = val('inc-res'); if (!note) return toast('Write how it was resolved', true);
  db.collection('incidents').doc(id).update({ resolved: true, resolution: note, resolvedBy: S.user.uid, resolvedByName: meName(), resolvedAt: Date.now() }).catch(fail);
  audit('incident_resolved', 'incident', id, note); closeModal();
  toast('Resolved', false, { label: 'Undo', fn: function () { db.collection('incidents').doc(id).update({ resolved: false }).catch(fail); audit('incident_reopened', 'incident', id, ''); toast('Incident open again'); } });
}
function openUnexpectedUse(roomId) {
  var r = byId(S.data.rooms, roomId); S.form = { usePhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveUnexpectedUse(\'' + roomId + '\')"><div class="note">Use this if a room that should be empty shows signs of use: slept-in bed, used towels, rubbish, water used.</div>' +
    field('What did you find?', '<textarea id="uu-note" required></textarea>') + photoField('usePhotos', 'Photos') +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Report to owner</button></div></form>';
  openModal('Room ' + r.number + ' used with no guest', b);
}
function saveUnexpectedUse(roomId) {
  var r = byId(S.data.rooms, roomId), b = db.batch();
  b.set(db.collection('incidents').doc(), Object.assign({ type: 'unexpected_use', title: 'Room ' + r.number + ' used with no guest logged', note: val('uu-note'), roomNo: r.number, photos: S.form.usePhotos, resolved: false }, stamp()));
  b.update(db.collection('rooms').doc(roomId), { status: 'dirty' });
  b.commit().catch(fail); createTurnoverTask(r, null, 'Found used with no guest');
  audit('unexpected_use', 'room', roomId, val('uu-note')); closeModal(); toast('Reported. The owner will see it.');
}

/* ---------- Edit stay details ---------- */
function openEditStay(id) {
  var s = findStay(id); S.form = { stayId: id };
  var res = s.status === 'reserved';
  var b = '<form class="form" onsubmit="event.preventDefault();saveEditStay()"><div class="fields">' +
    field('Guest name', input('es-name', s.guestName, 'required')) + field('Phone', input('es-phone', s.phone, 'type="tel"')) +
    field('Home address', input('es-addr', s.address, '')) + field('Number of guests', input('es-guests', s.guests || 1, 'type="number" min="1" max="20"')) +
    field('ID type', '<select id="es-idtype">' + opts(ID_TYPES, s.idType) + '</select>') + field('ID number', input('es-idno', s.idNumber, '')) +
    field('Vehicle plate', input('es-car', s.vehicle, '')) + sourceField('es-source', s.source) +
    (res ? field('Arrival date', input('es-date', s.checkInDate, 'type="date"')) + field('Nights', input('es-nights', s.nights, 'type="number" min="1"')) + field('Expected arrival time', input('es-time', s.arrivalTime, 'type="time"')) : field('Key card number', input('es-card', s.cardNo, ''))) +
    field('Note', '<textarea id="es-note">' + esc(s.notes || '') + '</textarea>', 'full') +
    '</div>' + (res ? '' : '<div class="muted small">To add nights use Extend stay. To leave early use Check out, which works out unused nights.</div>') +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save changes</button></div></form>';
  openModal('Edit · ' + s.guestName, b);
}
function saveEditStay() {
  var s = findStay(S.form.stayId), d = { guestName: val('es-name'), phone: val('es-phone'), address: val('es-addr'), guests: Math.max(1, num(val('es-guests'))), vehicle: val('es-car'), source: val('es-source'), idType: val('es-idtype'), idNumber: val('es-idno'), notes: val('es-note') };
  if (s.status === 'reserved') {
    var from = val('es-date'), n = Math.max(1, num(val('es-nights'))), to = addDays(from, n), clash = overlaps(s.roomId, from, to, s.id);
    if (clash) return toast('Room ' + s.roomNo + ' is taken by ' + clash.guestName + ' then', true);
    Object.assign(d, { checkInDate: from, checkOutDate: to, nights: n, arrivalTime: val('es-time') });
  } else d.cardNo = val('es-card');
  var changed = Object.keys(d).filter(function (k) { return String(d[k] == null ? '' : d[k]) !== String(s[k] == null ? '' : s[k]); });
  if (!changed.length) return closeModal();
  var b = db.batch();
  b.update(db.collection('stays').doc(s.id), d);
  audit('stay_edited', 'stay', s.id, changed.map(function (k) { return k + ': ' + (s[k] || '—') + ' → ' + d[k]; }).join('; '), b);
  b.commit().catch(fail);
  closeModal(); toast('Saved');
}
/* ---------- Move a guest (or a reservation) to another room ---------- */
function openMoveRoom(id) {
  var s = findStay(id), inHouse = s.status === 'checked_in';
  var options = roomsSorted().filter(function (r) { return r.id !== s.roomId && r.status !== 'ooo' && (inHouse ? r.status === 'ready' && !overlaps(r.id, todayStr(), s.checkOutDate, s.id) : !overlaps(r.id, s.checkInDate, s.checkOutDate, s.id)); });
  if (!options.length) return toast(inHouse ? 'No other room is Ready and free until ' + fmtDate(s.checkOutDate) : 'No other room is free for those dates', true);
  var b = '<form class="form" onsubmit="event.preventDefault();saveMoveRoom(\'' + id + '\')"><div class="fields">' +
    info('From', 'Room ' + s.roomNo + ' · ' + (s.roomTypeName || '')) +
    field('To', '<select id="mv-room">' + options.map(function (r) { return '<option value="' + r.id + '">Room ' + esc(r.number) + ' · ' + esc(roomType(r).name) + ' · ' + money(roomType(r).rate) + '/night</option>'; }).join('') + '</select>') +
    field('Reason', input('mv-why', '', 'required placeholder="e.g. AC fault, guest request"'), 'full') +
    (inHouse ? field('New key card number', input('mv-card', s.cardNo, '')) : '') +
    '</div><div class="note">' + (inHouse ? 'The guest keeps their booked rate (' + money(s.rate) + '/night). Room ' + esc(s.roomNo) + ' goes to cleaning.' : 'Only the reservation changes.') + '</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Move</button></div></form>';
  openModal('Move ' + s.guestName, b);
}
function saveMoveRoom(id) {
  var s = findStay(id), to = byId(S.data.rooms, val('mv-room')), from = byId(S.data.rooms, s.roomId), why = val('mv-why');
  if (!why) return toast('Give a reason', true);
  var b = db.batch(), now = Date.now(), entry = { from: s.roomNo, to: to.number, reason: why, at: now, by: S.user.uid, byName: meName() };
  var upd = { roomId: to.id, roomNo: to.number, roomTypeName: roomType(to).name, roomMoves: FV.arrayUnion(entry) };
  if (s.status === 'checked_in') {
    if (to.status !== 'ready') return toast('Room ' + to.number + ' is no longer Ready', true);
    upd.cardNo = val('mv-card') || s.cardNo;
    b.update(db.collection('rooms').doc(from.id), { status: 'dirty', currentStayId: null });
    b.update(db.collection('rooms').doc(to.id), { status: 'occupied', currentStayId: s.id });
  }
  b.update(db.collection('stays').doc(id), upd);
  b.commit().catch(fail);
  if (s.status === 'checked_in') createTurnoverTask(from, s, 'Guest moved to Room ' + to.number + ': ' + why);
  audit('room_move', 'stay', id, s.guestName + ': Room ' + s.roomNo + ' → ' + to.number + ' · ' + why);
  closeModal(); toast(s.guestName + ' moved to Room ' + to.number);
}

/* ---------- Stays tabs + reservations calendar ---------- */
function staysTabs() {
  return tabs('stays', [['inhouse', 'In house (' + staysByStatus('checked_in').length + ')'], ['upcoming', 'Reservations (' + staysByStatus('reserved').length + ')'], ['calendar', 'Calendar'], ['owing', 'Owing (' + debtors().length + ')'], ['past', 'Checked out'], ['other', 'Cancelled / no-show']]);
}
// Rooms down the side, nights across the top. A stay fills the nights from check-in up to (not including) check-out.
function stayCalendar() {
  var start = S.params.calStart || todayStr(), days = window.innerWidth <= 640 ? 7 : 21, dates = [], today = todayStr();
  for (var i = 0; i < days; i++) dates.push(addDays(start, i));
  var end = addDays(start, days), stays = S.data.stays.filter(function (s) { return (s.status === 'reserved' || s.status === 'checked_in') && s.checkInDate < end && s.checkOutDate > start; });
  var html = '<div class="row between"><div class="row"><button class="btn small" type="button" onclick="S.params.calStart=addDays(\'' + start + '\',-7);render()">← Week</button><button class="btn small" type="button" onclick="S.params.calStart=null;render()">Today</button><button class="btn small" type="button" onclick="S.params.calStart=addDays(\'' + start + '\',7);render()">Week →</button></div>' +
    '<div class="cal-key"><span><i class="k-in"></i>In house</span><span><i class="k-res"></i>Reserved</span><span>Tap an empty night to reserve</span></div></div>';
  html += '<div class="table-wrap cal-wrap"><table class="cal' + (days === 7 ? ' cal-7' : '') + '"><thead><tr><th class="cal-room">Room</th>' + dates.map(function (d) { var dt = parseDate(d), we = dt.getDay() === 0 || dt.getDay() === 6; return '<th class="' + (d === todayStr() ? 'cal-today' : we ? 'cal-we' : '') + '">' + DOW[dt.getDay()].slice(0, 2) + '<br>' + dt.getDate() + '</th>'; }).join('') + '</tr></thead><tbody>';
  roomsSorted().forEach(function (r) {
    html += '<tr><th class="cal-room">' + esc(r.number) + '</th>';
    for (var i = 0; i < days; i++) {
      var d = dates[i], s = stays.find(function (x) { return x.roomId === r.id && x.checkInDate <= d && x.checkOutDate > d; });
      if (s) {
        var span = 1; while (i + span < days && dates[i + span] < s.checkOutDate) span++;
        var cls = s.status === 'checked_in' ? 'cal-in' : 'cal-res';
        html += '<td colspan="' + span + '" class="cal-stay ' + cls + '"><button type="button" onclick="openStay(\'' + s.id + '\')" title="' + esc(s.guestName + ' · ' + fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate)) + '">' + esc(s.guestName.split(' ')[0]) + '</button></td>';
        i += span - 1;
      } else if (r.status === 'ooo' && d === today) html += '<td class="cal-ooo cal-tcol" title="Out of order">×</td>';
      else html += '<td class="cal-free' + (d === today ? ' cal-tcol' : '') + '"><button type="button" aria-label="Reserve room ' + esc(r.number) + ' from ' + fmtDate(d) + '" onclick="openReservation(\'' + r.id + '\',\'' + d + '\')"></button></td>';
    }
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}
