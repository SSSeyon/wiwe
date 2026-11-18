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
      stat('Occupied', occ + ' / ' + rooms.length, ready + ' ready · ' + ((counts.dirty || 0) + (counts.cleaning || 0) + (counts.inspect || 0)) + ' to clean', '', function () { return bdRoomsByStatus(rooms); }) +
      stat('Today', arrivals.length + ' in · ' + departures.length + ' out', (arrivals.length ? 'Arriving ' + arrivals.map(function (s) { return s.roomNo; }).join(', ') : 'No arrivals') + (departures.length ? ' · Leaving ' + departures.map(function (s) { return s.roomNo; }).join(', ') : ''), '', function () {
        return bdGroup('Arriving (' + arrivals.length + ')', arrivals, function (s) { return bdStay(s, s.arrivalTime ? 'Arriving about ' + s.arrivalTime : ''); }, 'No arrivals today.') +
          bdGroup('Leaving (' + departures.length + ')', departures, function (s) { return bdStay(s); }, 'Nobody is due out today.');
      }) +
      stat('Guests owing', money(sum(owe, function (s) { return s.balance; })), owe.length ? owe.length + ' stay' + (owe.length > 1 ? 's' : '') + ' with a balance' : 'Everyone is paid up', owe.length ? 'warn' : '', function () { return bdOwing(owe); }) +
      '</section>';
    html += '<div class="split board-split"><section class="wide board-main" aria-label="Rooms">' +
      building3dHtml() + '</section>' +
      '<aside class="narrow board-side"><div class="card"><h2>Needs attention</h2><div class="stack">' + alertList(al, 8) + '</div></div>' +
      '<div class="card"><h2>Arrivals and departures</h2>' + movesList(arrivals, departures) + '</div></aside></div>';
    return html;
  }
};
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
  // A group booking: the other rooms reserved with this one are ticked, if they are Ready
  var grpRv = {}, notReady = [];
  if (rv && rv.groupId) S.data.stays.forEach(function (x) {
    if (x.groupId !== rv.groupId || x.id === rv.id || x.status !== 'reserved') return;
    var xr = byId(S.data.rooms, x.roomId);
    if (xr && xr.status === 'ready') grpRv[x.roomId] = x; else notReady.push(x.roomNo);
  });
  S.form = { rvId: rv ? rv.id : '', rvPaid: rv ? (rv.paid || 0) : 0, idPhotos: (rv && rv.idPhotos) || [], payPhotos: [], groupId: (rv && rv.groupId) || '', groupRv: grpRv };
  var more = free.map(function (r) { return '<label class="check"><input type="checkbox" name="ci-x" value="' + r.id + '"' + (grpRv[r.id] ? ' checked' : '') + ' onchange="ciCalc()"><span><strong>' + esc(r.number) + '</strong> ' + esc(roomType(r).name) + '<span class="muted">' + money(Number(roomType(r).rate) || 0) + (grpRv[r.id] ? ' · in this booking' : '') + '</span></span></label>'; }).join('');
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
    '<details class="span-all more-rooms"' + (Object.keys(grpRv).length ? ' open' : '') + '><summary>More rooms for this guest</summary><div class="room-picks">' + (more || '<span class="muted">No other room is Ready.</span>') + '</div>' +
    (notReady.length ? '<div class="note warn">Room ' + esc(notReady.join(', ')) + ' in this booking ' + (notReady.length > 1 ? 'are' : 'is') + ' not Ready yet. Check ' + (notReady.length > 1 ? 'them' : 'it') + ' in from ' + (notReady.length > 1 ? 'their own reservations' : 'its own reservation') + ' when ready.</div>' : '') + '</details>' +
    field('Nights', input('ci-nights', nights, 'type="number" min="1" required oninput="ciCalc()"')) +
    '<div class="field">Check-out<span class="static" id="ci-out"></span></div>' +
    '<div class="fields span-all" id="ci-xnights"></div>' +
    '<div class="field">Rate per night<span class="static" id="ci-rate"></span></div>' +
    field('Discount (₦)', input('ci-disc', '', 'inputmode="numeric" oninput="ciCalc()"'), '', (isAdmin() ? '' : 'Needs a reason. The owner will approve it. ') + 'With several rooms, it comes off the whole booking.') +
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
    '</div><div class="fields" id="ci-xcards"></div><label class="check"><input type="checkbox" id="ci-agree" required>Guest has read the house rules and agrees that missing or damaged items are paid for' + (st.cautionEnabled ? ' from the caution fee' : '') + '.</label></fieldset>' +
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
// The extra rooms ticked under "More rooms for this guest" (never the main room)
function ciExtras() {
  var main = val('ci-room');
  return Array.prototype.slice.call(document.querySelectorAll('input[name="ci-x"]:checked')).map(function (i) { return i.value; })
    .filter(function (id) { return id !== main; }).map(function (id) { return byId(S.data.rooms, id); }).filter(Boolean);
}
// The reservation a room is being checked in from: the main one, or another room of the same group booking
function ciRvOf(r, i) { return i === 0 ? (S.form.rvId ? findStay(S.form.rvId) : null) : ((S.form.groupRv || {})[r.id] || null); }
// Nights for a room being checked in: the main Nights for the first room, each extra room its own box
function ciN(r, i) { var n = Math.max(1, num(val('ci-nights'))), b = i ? $('ci-xn-' + r.id) : null; return b ? Math.max(1, num(b.value) || n) : n; }
function ciCalc() {
  var r = byId(S.data.rooms, val('ci-room')); if (!r) return;
  document.querySelectorAll('input[name="ci-x"]').forEach(function (i) { var me = i.value === r.id; if (me) i.checked = false; i.closest('label').classList.toggle('hidden', me); });
  var rooms = [r].concat(ciExtras()), rate = Number(roomType(r).rate) || 0, n = Math.max(1, num(val('ci-nights'))), d = num(val('ci-disc')), t = todayStr();
  var out = addDays(t, n), caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0, cost = 0, prior = 0, lines = '', clashes = '', noRate = [];
  // one nights box and one key card box per extra room, keeping what was already typed.
  // A room from the reservation starts at its booked nights; any other follows the main Nights until changed.
  var xc = $('ci-xcards'), xn = $('ci-xnights'), sig = rooms.slice(1).map(function (x) { return x.id; }).join(',');
  if (xc && xn && xc.dataset.sig !== sig) {
    var keep = {}; xc.querySelectorAll('input').forEach(function (i) { keep[i.id] = i.value; });
    xn.querySelectorAll('input').forEach(function (i) { if (i.dataset.touched) keep[i.id] = i.value; });
    xc.innerHTML = rooms.slice(1).map(function (x) { var id = 'ci-xcard-' + x.id; return field('Key card for Room ' + x.number, input(id, keep[id] || '', 'required')); }).join('');
    xn.innerHTML = rooms.slice(1).map(function (x, k) {
      var nid = 'ci-xn-' + x.id, rv = ciRvOf(x, k + 1), set = keep[nid] || (rv && rv.nights);
      return '<label class="field">Nights in Room ' + esc(x.number) + input(nid, set || n, 'type="number" min="1" required oninput="this.dataset.touched=1;ciCalc()"' + (set ? ' data-touched="1"' : '')) + '<span class="hint" id="ci-xout-' + x.id + '"></span></label>';
    }).join('');
    xc.dataset.sig = sig;
  }
  rooms.forEach(function (x, i) {
    var nb = i ? $('ci-xn-' + x.id) : null; if (nb && !nb.dataset.touched) nb.value = n;
    var xn = ciN(x, i), xo = addDays(t, xn), xr = Number(roomType(x).rate) || 0, rv = ciRvOf(x, i), c = overlaps(x.id, t, xo, rv ? rv.id : '');
    var ob = $('ci-xout-' + x.id); if (ob) ob.textContent = 'Check-out ' + fmtDate(xo);
    cost += xr * xn; prior += rv ? (rv.paid || 0) : 0; if (!xr) noRate.push(x.number);
    lines += '<div class="row between"><span>Room ' + esc(x.number) + ' · ' + xn + ' night' + (xn > 1 ? 's' : '') + '</span><span class="money">' + money(xr * xn) + '</span></div>';
    if (c) clashes += '<div class="note bad">Room ' + esc(x.number) + ' is booked for ' + esc(c.guestName) + ' from ' + fmtDate(c.checkInDate) + '. Pick another room or fewer nights.</div>';
  });
  var total = Math.max(0, cost - d), due = Math.max(0, total - prior) + caution;
  $('ci-out').textContent = fmtDate(out) + ', ' + S.settings.checkOutTime;
  $('ci-rate').textContent = money(rate) + (rooms.length > 1 ? ' (Room ' + r.number + ')' : '') + (isAdmin() ? '' : ' (set by admin)');
  prefillAmount('ci-amount', due);
  var sb = $('sb-amt'); if (sb) sb.textContent = money(due);
  $('ci-sum').innerHTML = lines +
    (d ? '<div class="row between"><span>Discount</span><span class="money">-' + money(d) + '</span></div>' : '') +
    (prior ? '<div class="row between"><span>Deposit already paid</span><span class="money">-' + money(prior) + '</span></div>' : '') +
    (caution ? '<div class="row between"><span>Caution fee (refundable)</span><span class="money">' + money(caution) + '</span></div>' : '') +
    '<div class="row between strong total-row"><span>Collect now' + (rooms.length > 1 ? ' · ' + rooms.length + ' rooms' : '') + '</span><span class="money">' + money(due) + '</span></div>' +
    clashes +
    (noRate.length ? '<div class="note warn">Room ' + esc(noRate.join(', ')) + ': this room type has no rate yet. The owner sets rates in Admin settings → Rooms.</div>' : '');
}async function saveCheckIn() {
  var r = byId(S.data.rooms, val('ci-room'));
  if (!r) return toast('Pick a room', true);
  var rooms = [r].concat(ciExtras()), ns = rooms.map(ciN), t = todayStr();
  for (var k = 0; k < rooms.length; k++) {
    var x = rooms[k], xrv = ciRvOf(x, k);
    if (x.status !== 'ready') return toast('Room ' + x.number + ' is not Ready', true);
    // A walk-in must never land on top of someone else's booking
    var clash = overlaps(x.id, t, addDays(t, ns[k]), xrv ? xrv.id : '');
    if (clash) return toast('Room ' + x.number + ' is booked for ' + clash.guestName + ' from ' + fmtDate(clash.checkInDate) + '. Pick another room or fewer nights.', true);
    if (k > 0 && !val('ci-xcard-' + x.id)) return toast('Enter the key card for Room ' + x.number, true);
  }
  if (S.settings.requireId && !val('ci-idno') && !(S.form.idPhotos || []).length) return toast('Enter the ID number or add a photo of the ID', true);
  var method = radio('ci-method'), amount = num(val('ci-amount')), ref = val('ci-ref');
  if (amount > 0 && !ref) return toast('Enter the reference from the POS slip', true);
  var disc = num(val('ci-disc')), discR = val('ci-discr');
  if (disc > 0 && !discR) return toast('Give a reason for the discount', true);
  // The discount sits on the main room; each room keeps its own bill
  var items = rooms.map(function (x, i) {
    var type = roomType(x), rate = Number(type.rate) || 0, rv = ciRvOf(x, i), tot = Math.max(0, rate * ns[i] - (i === 0 ? disc : 0)), pr = rv ? (rv.paid || 0) : 0;
    return { r: x, type: type, rate: rate, rv: rv, total: tot, prior: pr, owed: Math.max(0, tot - pr) };
  });
  var caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0, prior = sum(items, function (i) { return i.prior; });
  var owed = sum(items, function (i) { return i.owed; }), roomPaid = Math.min(amount, owed), cautionPaid = Math.min(caution, Math.max(0, amount - owed)), over = amount - roomPaid - cautionPaid;
  if (over > 0) return toast('That is ' + money(over) + ' more than the amount due. Check the amount.', true);
  // A wrong pre-filled amount must not slip through: anything short of the room price is confirmed as a part payment
  if (amount < owed) { if (!(await ask({ title: 'Part payment?', text: 'Received ' + money(amount) + ' but ' + money(owed) + ' is due for the room' + (items.length > 1 ? 's' : '') + '.\n' + money(owed - amount) + ' will be recorded as still owed' + (caution ? ', and no caution fee is held' : '') + '.', ok: 'Save as part payment', cancel: 'Fix the amount' }))) return; }
  else if (caution && cautionPaid < caution && !(await ask({ title: 'Caution fee short', text: 'The room' + (items.length > 1 ? 's are' : ' is') + ' paid, but only ' + money(cautionPaid) + ' of the ' + money(caution) + ' caution fee was received.', ok: 'Check in anyway', cancel: 'Fix the amount' }))) return;
  if (amount > 0 && !(await refOk(ref, S.form.rvId))) return;
  rememberPayMethod(method);
  if ($('ci-save')) $('ci-save').disabled = true;
  if ($('sb-next')) $('sb-next').disabled = true;
  var now = Date.now(), b = db.batch(), name = val('ci-name'), left = roomPaid, firstId = '';
  var groupId = S.form.groupId || (items.length > 1 ? db.collection('stays').doc().id : '');
  items.forEach(function (it, i) {
    var paidNow = Math.min(it.owed, left); left -= paidNow;
    var sref = it.rv ? db.collection('stays').doc(it.rv.id) : db.collection('stays').doc(); if (!i) firstId = sref.id;
    var stay = {
      roomId: it.r.id, roomNo: it.r.number, roomTypeName: it.type.name,
      guestName: name, phone: val('ci-phone'), address: val('ci-addr'), guests: Math.max(1, num(val('ci-guests'))), vehicle: val('ci-car'), source: val('ci-source') || 'walkin',
      idType: val('ci-idtype'), idNumber: val('ci-idno'), idPhotos: S.form.idPhotos,
      checkInDate: t, checkOutDate: addDays(t, ns[i]), nights: ns[i], rate: it.rate,
      discount: i ? 0 : disc, discountReason: i ? '' : discR, discountStatus: !i && disc > 0 ? (isAdmin() ? 'approved' : 'pending') : 'none',
      total: it.total, paid: it.prior + paidNow, balance: it.total - it.prior - paidNow,
      caution: i ? 0 : cautionPaid, cautionAccount: i ? '' : (val('ci-cacct') || ''), cautionStatus: !i && cautionPaid ? 'held' : 'none',
      cardNo: i ? val('ci-xcard-' + it.r.id) : val('ci-card'), cardReturned: false,
      status: 'checked_in', checkedInAt: now, checkedInBy: S.user.uid, checkedInByName: meName()
    };
    if (groupId) Object.assign(stay, { groupId: groupId, groupName: name });
    if (!it.rv) Object.assign(stay, { createdAt: now, by: S.user.uid, byName: meName() });
    b.set(sref, stay, { merge: true });
    var pay = { stayId: sref.id, roomNo: it.r.number, guestName: name, method: method, sender: '', ref: ref, photos: S.form.payPhotos, status: payStatus(), groupId: groupId };
    if (paidNow > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: paidNow, kind: 'room' }, pay, stamp()));
    if (!i && cautionPaid > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: cautionPaid, kind: 'caution' }, pay, stamp()));
    b.update(db.collection('rooms').doc(it.r.id), { status: 'occupied', currentStayId: sref.id });
  });
  var nos = items.map(function (i) { return i.r.number; }).join(', ');
  audit('check_in', 'stay', firstId, 'Room' + (items.length > 1 ? 's ' : ' ') + nos + ' · ' + name + ' · ' + ns.join('/') + ' nights · paid ' + money(amount) + (prior ? ' · deposit ' + money(prior) : ''), b);
  b.commit().catch(fail);
  closeModal(); toast(name + ' checked in to Room' + (items.length > 1 ? 's ' : ' ') + nos);
}/* ---------- Reservation ---------- */
function openReservation(roomId, date) {
  if (!has('manager', 'frontdesk')) return;
  var rooms = roomsSorted().filter(function (r) { return r.status !== 'ooo'; });
  S.form = { payPhotos: [] };
  var b = '<form class="form" onsubmit="event.preventDefault();saveReservation()"><div class="fields">' +
    field('Guest name', input('rv-name', '', 'required')) +
    field('Phone number', input('rv-phone', '', 'required type="tel"')) +
    field('Arrival date', input('rv-date', date || todayStr(), 'type="date" required onchange="rvCalc()"')) +
    field('Nights', input('rv-nights', 1, 'type="number" min="1" required oninput="rvCalc()"'), '', 'With several rooms, each room can have its own number of nights below.') +
    field('Expected arrival time', input('rv-time', S.settings.checkInTime, 'type="time"')) +
    sourceField('rv-source', 'phone') +
    '<div class="field">Stay cost<span class="static" id="rv-cost"></span></div>' +
    '<div class="field span-all">Rooms<span class="hint">Tick every room this guest is booking. Rooms already taken for these dates cannot be ticked.</span><div class="room-picks">' +
    rooms.map(function (r) { return '<label class="check"><input type="checkbox" name="rv-room" value="' + r.id + '"' + (r.id === roomId || (!roomId && r === rooms[0]) ? ' checked' : '') + ' onchange="rvCalc()"><span><strong>' + esc(r.number) + '</strong> ' + esc(roomType(r).name) + '<span class="muted">' + money(Number(roomType(r).rate) || 0) + ' <span id="rvt-' + r.id + '"></span></span></span></label>'; }).join('') + '</div></div>' +
    '<div class="span-all" id="rv-per"></div>' +
    field('Note', '<textarea id="rv-note"></textarea>', 'full') +
    '</div><fieldset class="group"><legend>Deposit (optional)</legend>' + payChoices('rv-method') + '</div><div class="fields">' +
    field('Deposit received (₦)', input('rv-dep', '', 'inputmode="numeric"'), '', 'Leave empty if the guest will pay on arrival. With several rooms it is shared across them by price.') +
    field('Reference', input('rv-ref', '', 'autocomplete="off"'), '', 'POS slip or transfer session ID') +
    photoField('payPhotos', 'Photo of the receipt (optional)') + '</div></fieldset>' +
    '<div class="note">The room is held for ' + (S.settings.holdHours || 3) + ' hours after the expected time, then it shows as a possible no-show. A deposit is taken off the amount due at check-in.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save reservation</button></div></form>';
  openModal('New reservation', b); rvCalc();
}
function rvPicks() { return Array.prototype.slice.call(document.querySelectorAll('input[name="rv-room"]:checked')).map(function (i) { return byId(S.data.rooms, i.value); }).filter(Boolean); }
// Nights for one ticked room: its own box when several rooms are ticked, otherwise the main Nights
function rvNights(r) {
  var i = $('rv-n-' + r.id), n = Math.max(1, num(val('rv-nights')));
  return i && rvPicks().length > 1 ? Math.max(1, num(i.value) || n) : n;
}
function rvCalc() {
  var box = $('rv-cost'); if (!box) return;
  var from = val('rv-date'), n = Math.max(1, num(val('rv-nights'))), tot = 0, cnt = 0;
  // A room is closed only when it is taken on the first night; a room free for fewer nights can still be ticked
  document.querySelectorAll('input[name="rv-room"]').forEach(function (i) {
    var r = byId(S.data.rooms, i.value), c = from ? overlaps(r.id, from, addDays(from, 1)) : null, tag = $('rvt-' + r.id);
    var later = !c && from ? overlaps(r.id, from, addDays(from, n)) : null;
    i.disabled = !!c; if (c) i.checked = false;
    if (tag) tag.textContent = c ? '· taken by ' + c.guestName : later ? '· booked from ' + fmtDate(later.checkInDate) : '';
  });
  var picks = rvPicks(), per = $('rv-per'), sig = picks.map(function (r) { return r.id; }).join(',');
  // One nights box per ticked room, keeping what was typed; untouched boxes follow the main Nights
  if (per && per.dataset.sig !== sig) {
    var keep = {}; per.querySelectorAll('input').forEach(function (i) { if (i.dataset.touched) keep[i.id] = i.value; });
    per.innerHTML = picks.length > 1 ? '<fieldset class="group"><legend>Nights per room</legend><div class="fields">' + picks.map(function (r) {
      var id = 'rv-n-' + r.id;
      return '<label class="field">Room ' + esc(r.number) + input(id, keep[id] || n, 'type="number" min="1" required oninput="this.dataset.touched=1;rvCalc()"' + (keep[id] ? ' data-touched="1"' : '')) + '<span class="hint" id="rv-out-' + r.id + '"></span></label>';
    }).join('') + '</div></fieldset>' : '';
    per.dataset.sig = sig;
  }
  var nights = [], warn = '';
  picks.forEach(function (r) {
    var i = $('rv-n-' + r.id); if (i && !i.dataset.touched) i.value = n;
    var rn = rvNights(r), out = from ? addDays(from, rn) : '', c = from ? overlaps(r.id, from, out) : null, o = $('rv-out-' + r.id);
    if (o) o.textContent = out ? 'Leaves ' + fmtDate(out) : '';
    if (c) warn += '<div class="note bad">Room ' + esc(r.number) + ' is booked for ' + esc(c.guestName) + ' from ' + fmtDate(c.checkInDate) + '. It is free for ' + daysBetween(from, c.checkInDate) + ' night' + (daysBetween(from, c.checkInDate) > 1 ? 's' : '') + ' at most.</div>';
    tot += (Number(roomType(r).rate) || 0) * rn; cnt++; nights.push(rn);
  });
  var same = nights.every(function (x) { return x === nights[0]; });
  box.textContent = cnt ? money(tot) + ' · ' + cnt + ' room' + (cnt > 1 ? 's' : '') + (same ? ' × ' + nights[0] + ' night' + (nights[0] > 1 ? 's' : '') : ' · ' + nights.join(' + ') + ' nights') : 'Tick a room';
  var wb = $('rv-warn'); if (!wb && per) { wb = document.createElement('div'); wb.id = 'rv-warn'; per.after(wb); }
  if (wb) wb.innerHTML = warn;
}function overlaps(roomId, from, to, ignoreId) {
  return S.data.stays.find(function (s) { return s.id !== ignoreId && s.roomId === roomId && (s.status === 'reserved' || s.status === 'checked_in') && s.checkInDate < to && from < s.checkOutDate; });
}
async function saveReservation() {
  var picks = rvPicks(), from = val('rv-date');
  if (!picks.length) return toast('Tick at least one room', true);
  if (from < todayStr()) return toast('Arrival date is in the past', true);
  var ns = picks.map(rvNights);
  for (var k = 0; k < picks.length; k++) {
    var clash = overlaps(picks[k].id, from, addDays(from, ns[k]));
    if (clash) return toast('Room ' + picks[k].number + ' is taken by ' + clash.guestName + ' (' + fmtDate(clash.checkInDate) + ' → ' + fmtDate(clash.checkOutDate) + ')', true);
  }
  var dep = num(val('rv-dep')), pref = val('rv-ref'), method = radio('rv-method');
  if (dep > 0 && !pref) return toast('Enter the reference for the deposit', true);
  if (dep > 0 && !(await refOk(pref))) return;
  // Several rooms: one stay per room, linked by groupId. The deposit is shared across them by price.
  var b = db.batch(), name = val('rv-name'), now = Date.now(), groupId = picks.length > 1 ? db.collection('stays').doc().id : '';
  var costs = picks.map(function (r, i) { return (Number(roomType(r).rate) || 0) * ns[i]; }), tc = sum(costs, function (c) { return c; }), left = dep, firstId = '';
  picks.forEach(function (r, i) {
    var share = i === picks.length - 1 ? left : Math.round(tc ? dep * costs[i] / tc : dep / picks.length); left -= share;
    var ref = db.collection('stays').doc(); if (!i) firstId = ref.id;
    var stay = { roomId: r.id, roomNo: r.number, roomTypeName: roomType(r).name, guestName: name, phone: val('rv-phone'), source: val('rv-source') || 'phone', checkInDate: from, checkOutDate: addDays(from, ns[i]), nights: ns[i], arrivalTime: val('rv-time'), notes: val('rv-note'), deposit: share, paid: share, status: 'reserved', createdAt: now };
    if (groupId) Object.assign(stay, { groupId: groupId, groupName: name });
    b.set(ref, Object.assign(stay, stamp()));
    if (share > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: ref.id, roomNo: r.number, guestName: name, amount: share, kind: 'deposit', method: method, sender: '', ref: pref, photos: S.form.payPhotos || [], status: payStatus(), groupId: groupId }, stamp()));
  });
  var nos = picks.map(function (r) { return r.number; }).join(', ');
  audit('reservation', 'stay', firstId, 'Room' + (picks.length > 1 ? 's ' : ' ') + nos + ' · ' + name + ' · ' + from + ' · ' + ns.join('/') + ' nights' + (dep ? ' · deposit ' + money(dep) : ''), b);
  b.commit().catch(fail);
  closeModal(); toast((picks.length > 1 ? picks.length + ' rooms reserved' : 'Reservation saved') + (dep ? ' with ' + money(dep) + ' deposit' : ''));
}
// Every stay of the same group booking (just this one when it is not part of a group)
function groupStays(s) { return s && s.groupId ? sortBy(allStays().filter(function (x) { return x.groupId === s.groupId; }), function (x) { return String(x.roomNo); }) : (s ? [s] : []); }
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
    (s.status === 'reserved' ? info('Stay cost', money(rvCost(s))) + info('Deposit paid', money(s.paid || 0)) + info('Outstanding', rvOwe(s) ? money(rvOwe(s)) : 'Fully paid') : '') +
    (s.extras ? info('Items on bill', money(s.extras)) : '') +
    (s.total != null ? info('Room total', money(s.total) + (s.discount ? ' (incl. ' + money(s.discount) + ' discount, ' + s.discountStatus + ')' : '')) : '') +
    (s.total != null ? info('Paid', money(s.paid || 0)) + info((s.balance || 0) < 0 ? 'In credit' : 'Balance owed', money(Math.abs(s.balance || 0))) : '') +
    (s.caution ? info('Caution fee', money(s.caution) + ' · ' + ({ held: 'held', refund_due: 'refund ' + money(s.cautionRefundDue) + ' due', refunded: 'refunded', kept: 'kept in full', none: '' }[s.cautionStatus] || '')) : '') +
    '</div>';
  var grp = groupStays(s);
  if (grp.length > 1) {
    var live = grp.filter(function (x) { return x.status !== 'cancelled' && x.status !== 'no_show'; });
    var gOwe = sum(live, function (x) { return x.total != null ? Math.max(0, x.balance || 0) : Math.max(0, stayRate(x) * (x.nights || 0) - (x.paid || 0)); });
    b += '<div class="group-box"><div class="row between"><strong>Group booking · ' + live.length + ' room' + (live.length > 1 ? 's' : '') + '</strong>' + (gOwe ? '<span class="muted">' + money(gOwe) + ' still to pay for all rooms</span>' : '') + '</div><div class="row">' +
      grp.map(function (x) { var xs = STAY_STATUS[x.status] || ['', '']; return '<button class="btn small" type="button"' + (x.id === s.id ? ' aria-current="true"' : '') + ' onclick="openStay(\'' + x.id + '\')">Room ' + esc(x.roomNo) + ' · ' + esc(xs[0]) + (x.id === s.id ? ' (this one)' : '') + '</button>'; }).join('') +
      '</div><div class="muted small">Each room is checked in, extended and checked out on its own. Checking in one room offers to check in the others that are Ready.</div></div>';
  }
  if (s.idPhotos && s.idPhotos.length) b += '<div class="thumbs">' + thumbs(s.idPhotos) + '</div>';
  if (s.notes) b += '<div class="note">' + esc(s.notes) + '</div>';
  if (s.missing && s.missing.length) b += '<div class="note bad">Missing at check-out: ' + esc(s.missing.map(function (m) { return m.name + ' × ' + m.short; }).join(', ')) + (s.damageNote ? '. ' + esc(s.damageNote) : '') + '</div>';
  else if (s.damageNote) b += '<div class="note bad">' + esc(s.damageNote) + '</div>';
  if (pays.length) b += '<div><h3 class="sub-h">Payments</h3>' + pays.map(paymentRow).join('') + '</div>';
  var acts = [];
  if (s.status === 'reserved' && desk) {
    acts.push('<button class="btn primary" type="button" onclick="openCheckIn(\'' + s.roomId + '\',\'' + s.id + '\')">Check in</button>');
    if (sum(rvRooms(s), rvOwe) > 0) acts.push('<button class="btn" type="button" onclick="openAddDeposit(\'' + s.id + '\')">Add deposit</button>');
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
// The nightly rate of a stay; a reservation has none saved yet, so it uses the room type rate
function stayRate(x) { if (x.rate) return x.rate; var r = byId(S.data.rooms, x.roomId); return r ? (Number(roomType(r).rate) || 0) : 0; }
// A receipt covers the whole group booking (every room still booked or stayed in)
function receiptStays(s) { var g = groupStays(s).filter(function (x) { return x.status !== 'cancelled' && x.status !== 'no_show'; }); return g.length ? g : [s]; }
function rcptSums(ss) {
  var ids = ss.map(function (x) { return x.id; });
  var pays = sortBy(allPayments().filter(function (p) { return ids.indexOf(p.stayId) >= 0 && payCounts(p); }), function (p) { return p.at; });
  var res = ss.every(function (x) { return x.status === 'reserved'; });
  var disc = sum(ss, function (x) { return x.discount && x.discountStatus !== 'rejected' ? x.discount : 0; });
  var cost = sum(ss, function (x) { return stayRate(x) * (x.nights || 0); }), extras = sum(ss, function (x) { return x.extras || 0; });
  var owe = sum(ss, function (x) { return x.total != null ? (x.balance || 0) : stayRate(x) * (x.nights || 0) - (x.paid || 0); });
  var dep = sum(ss, function (x) { return x.status === 'reserved' ? (x.paid || 0) : 0; }), caution = sum(ss, function (x) { return x.caution && x.cautionStatus === 'held' ? x.caution : 0; });
  var last = ss.reduce(function (a, x) { return x.checkOutDate > a ? x.checkOutDate : a; }, ss[0].checkOutDate);
  return { pays: pays, res: res, disc: disc, cost: cost, extras: extras, bill: cost - disc + extras, owe: owe, dep: dep, caution: caution, last: last, multi: ss.length > 1, open: ss.some(function (x) { return x.status !== 'checked_out'; }) };
}
function rcptEnd(m) { return m.res ? (m.dep ? 'Deposit received: ' + money(m.dep) + '. The rest (' + money(Math.max(0, m.owe)) + ') is paid at check-in.' : 'Payment is due at check-in.') : m.owe > 0 ? 'Balance owed: ' + money(m.owe) : m.owe < 0 ? 'In credit: ' + money(-m.owe) : 'Paid in full. Thank you.'; }
function receiptText(s) {
  var ss = receiptStays(s), m = rcptSums(ss);
  var L = ['*' + (S.settings.businessName || 'Wiwe Apartments') + '*', m.res ? 'Booking confirmation' : 'Receipt', '', 'Guest: ' + s.guestName];
  ss.forEach(function (x) { L.push('Room ' + x.roomNo + (x.roomTypeName ? ' (' + x.roomTypeName + ')' : '') + ' · ' + fmtDate(x.checkInDate) + ' to ' + fmtDate(x.checkOutDate) + ' · ' + x.nights + ' night' + (x.nights > 1 ? 's' : '') + (stayRate(x) ? ' at ' + money(stayRate(x)) : '')); });
  L.push('');
  if (m.disc) L.push('Discount: -' + money(m.disc));
  L.push((m.multi ? 'Rooms total: ' : 'Room total: ') + money(m.cost - m.disc));
  if (m.extras) L.push('Items: ' + money(m.extras));
  if (m.pays.length) { L.push('', 'Payments'); m.pays.forEach(function (p) { L.push('• ' + money(p.amount) + ' ' + (PAY_KIND[p.kind] || p.kind).toLowerCase() + (m.multi ? ' · Room ' + p.roomNo : '') + ' · ' + (PAY_LABEL[p.method] || p.method || '') + (p.ref ? ' ref ' + p.ref : '') + ' · ' + fmtDate(p.at)); }); }
  L.push('', rcptEnd(m));
  if (m.caution) L.push('Refundable caution fee held: ' + money(m.caution));
  if (m.open) L.push('Check-out is by ' + S.settings.checkOutTime + ' on ' + fmtDate(m.last) + '.');
  L.push('', 'Issued ' + fmtDT(Date.now()) + ' by ' + meName());
  return L.join('\n');
}
function info(label, value) { return '<div class="field">' + esc(label) + '<span class="static">' + esc(value == null || value === '' ? '—' : value) + '</span></div>'; }
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
/* ---------- More deposit on a reservation (covers every reserved room of a group booking) ---------- */
function rvCost(x) { return stayRate(x) * (x.nights || 0); }
function rvOwe(x) { return Math.max(0, rvCost(x) - (x.paid || 0)); }
function rvRooms(s) { return groupStays(s).filter(function (x) { return x.status === 'reserved'; }); }
function openAddDeposit(id) {
  var s = findStay(id); if (!s || s.status !== 'reserved') return;
  var rs = rvRooms(s), cost = sum(rs, rvCost), paid = sum(rs, function (x) { return x.paid || 0; }), owe = sum(rs, rvOwe);
  S.form = { payPhotos: [], stayId: id };
  var rows = rs.length > 1 ? '<div class="card">' + rs.map(function (x) { return '<div class="row between"><span>Room ' + esc(x.roomNo) + ' · ' + x.nights + ' night' + (x.nights > 1 ? 's' : '') + '</span><span class="money">' + money(x.paid || 0) + ' of ' + money(rvCost(x)) + '</span></div>'; }).join('') + '</div>' : '';
  var b = '<form class="form" onsubmit="event.preventDefault();saveAddDeposit()"><div class="fields">' +
    info(rs.length > 1 ? 'Stay cost · ' + rs.length + ' rooms' : 'Stay cost', money(cost)) + info('Paid so far', money(paid)) +
    '<div class="field">Outstanding<span class="static strong" id="ad-owe">' + money(owe) + '</span></div>' +
    '<div class="field">Left after this payment<span class="static" id="ad-left">' + money(owe) + '</span></div></div>' + rows +
    payChoices('ad-method') + '</div>' +
    '<div class="fields">' + field('Amount received (₦)', input('ad-amount', '', 'inputmode="numeric" required oninput="adCalc()"'), '', rs.length > 1 ? 'Shared across the rooms by what each still owes.' : '') +
    field('Reference', input('ad-ref', '', 'autocomplete="off"'), '', 'POS slip or transfer session ID') + photoField('payPhotos', 'Photo of the receipt (optional)') + '</div>' + payNote() +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary" id="ad-save">Save deposit</button></div></form>';
  openModal('Add deposit · ' + s.guestName, b);
  if (!owe) $('ad-left').textContent = 'Fully paid already';
}
function adCalc() {
  var s = findStay(S.form.stayId); if (!s) return;
  var owe = sum(rvRooms(s), rvOwe), a = num(val('ad-amount'));
  $('ad-left').textContent = a > owe ? money(a - owe) + ' too much' : money(owe - a) + (a === owe && a ? ' · fully paid' : '');
}
async function saveAddDeposit() {
  var s = findStay(S.form.stayId); if (!s || s.status !== 'reserved') return toast('This reservation has changed. Open it again.', true);
  var rs = rvRooms(s), owe = sum(rs, rvOwe), amount = num(val('ad-amount')), ref = val('ad-ref'), method = radio('ad-method');
  if (amount <= 0) return toast('Enter the amount received', true);
  if (amount > owe) return toast('That is more than the ' + money(owe) + ' outstanding. Check the amount.', true);
  if (!ref) return toast('Enter the reference for the payment', true);
  if (!(await refOk(ref, s.id))) return;
  rememberPayMethod(method);
  if ($('ad-save')) $('ad-save').disabled = true;
  // shared by what each room still owes; the last room takes what is left so it adds up exactly
  var owing = rs.filter(function (x) { return rvOwe(x) > 0; }), left = amount, b = db.batch();
  owing.forEach(function (x, i) {
    var share = i === owing.length - 1 ? left : Math.min(rvOwe(x), Math.round(amount * rvOwe(x) / owe)); left -= share;
    if (share <= 0) return;
    // increments, so two phones recording at once never overwrite each other
    b.update(db.collection('stays').doc(x.id), { paid: FV.increment(share), deposit: FV.increment(share) });
    b.set(db.collection('payments').doc(), Object.assign({ stayId: x.id, roomNo: x.roomNo, guestName: x.guestName, amount: share, kind: 'deposit', method: method, sender: '', ref: ref, photos: S.form.payPhotos || [], status: payStatus(), groupId: x.groupId || '' }, stamp()));
  });
  audit('deposit', 'stay', s.id, s.guestName + ' · Room' + (rs.length > 1 ? 's ' : ' ') + rs.map(function (x) { return x.roomNo; }).join(', ') + ' · ' + money(amount) + ' · ' + money(owe - amount) + ' left', b);
  b.commit().catch(fail);
  closeModal(); toast('Deposit of ' + money(amount) + ' recorded. ' + (owe - amount ? money(owe - amount) + ' still to pay.' : 'Fully paid.'));
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
        return '<tr class="clickable" onclick="openStay(\'' + s.id + '\')"><td><strong>' + esc(s.guestName) + '</strong><div class="muted small">' + esc(s.phone || '') + '</div></td><td>' + esc(s.roomNo) + (s.groupId ? ' <span class="muted small">group</span>' : '') + '</td><td>' + fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate) + '</td><td>' + (s.nights || '') + '</td><td class="right money">' + (s.total != null ? money(s.total) : s.status === 'reserved' ? money(rvCost(s)) : '—') + '</td><td>' + pill(ss[0], ss[1]) + (isOverstay(s) ? ' ' + pill('Overstay', 'st-bad') : '') + ((s.balance || 0) > 0 ? ' ' + pill('Owes ' + money(s.balance), 'st-alert') : '') + (s.status === 'reserved' ? ' ' + (rvOwe(s) ? pill(money(rvOwe(s)) + ' to pay', 'st-alert') : pill('Paid', 'st-ready')) : '') + '</td></tr>';
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
function sameSlip(a, b) { return (a.stayId === b.stayId || (a.groupId && a.groupId === b.groupId)) && Math.abs((a.at || 0) - (b.at || 0)) < 120000; }
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
  var now = Date.now(), upd = { status: 'confirmed', decidedBy: S.user.uid, decidedByName: meName(), decidedAt: now };
  toast('Confirming ' + list.length + ' payments…');
  var res = await writeEach(list.map(function (p) { return function () { return db.collection('payments').doc(p.id).update(upd); }; }));
  audit('payments_confirmed', 'payment', '', res.ok + ' payments · ' + money(tot) + (res.bad.length ? ' · ' + res.bad.length + ' failed' : ''));
  if (res.bad.length) fail(res.bad[0]); else toast(list.length + ' payments confirmed');
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
      stat('Recorded today', money(sum(todays, function (p) { return p.amount; })), todays.length + ' payment' + (todays.length === 1 ? '' : 's'), '', function () { return bdPays(todays); }) +
      stat('By POS today', money(by('pos')), money(by('transfer')) + ' by bank transfer', '', function () {
        var pos = todays.filter(function (p) { return p.method === 'pos'; }), tr = todays.filter(function (p) { return p.method === 'transfer'; });
        return bdGroup('POS · ' + money(by('pos')), sortBy(pos, function (p) { return p.at; }, true), bdPay, 'No POS payments today.') + bdGroup('Bank transfer · ' + money(by('transfer')), sortBy(tr, function (p) { return p.at; }, true), bdPay, 'No transfers today.');
      }) +
      stat('Waiting for owner', up.length, up.length ? money(sum(up, function (p) { return p.amount; })) + ' to confirm' : 'All confirmed', up.length ? 'warn' : '', function () { return bdPays(up, up.length + ' payment' + (up.length === 1 ? '' : 's') + ' to match against the POS settlement or bank') + (up.length ? bdGo('Go to To confirm', "go('payments',{tab:'confirm'})") : ''); }) +
      stat('Refunds to approve', wait.length, wait.length ? money(-sum(wait, function (p) { return p.amount; })) : 'None waiting', wait.length ? 'warn' : '', function () { return bdPays(wait, wait.length + ' refund' + (wait.length === 1 ? '' : 's') + ' waiting for the owner') + (wait.length ? bdGo('Go to Refunds', "go('payments',{tab:'refunds'})") : ''); }) +
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
