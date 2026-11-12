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
    if (!rooms.length) return '<div class="card empty">No rooms yet. Add them in Admin settings.</div>';
    var counts = {}; rooms.forEach(function (r) { var st = displayStatus(r); counts[st] = (counts[st] || 0) + 1; });
    var occ = counts.occupied || 0;
    var arrivals = S.data.stays.filter(function (s) { return s.status === 'reserved' && s.checkInDate <= t; });
    var departures = S.data.stays.filter(dueOutToday);
    var ready = counts.ready || 0;
    var up = unconfirmedPayments();
    var al = alerts();
    var html = '<section class="grid-stats" aria-label="Today at a glance">' +
      stat('Occupancy', occ + ' / ' + rooms.length, Math.round(occ / rooms.length * 100) + '% of rooms') +
      stat('Arrivals today', arrivals.length, arrivals.map(function (s) { return s.roomNo; }).join(', ') || 'None expected') +
      stat('Departures today', departures.length, departures.map(function (s) { return s.roomNo; }).join(', ') || 'None due') +
      stat('Rooms ready', ready, (counts.dirty || 0) + ' dirty · ' + ((counts.cleaning || 0) + (counts.inspect || 0)) + ' being cleaned') +
      stat('Unconfirmed payments', up.length, up.length ? 'Waiting for owner' : 'All matched', up.length ? 'warn' : '') +
      '</section>';
    var layout = boardLayout();
    html += '<div class="split"><section class="wide" aria-label="Rooms">' +
      '<div class="row between"><div class="legend"><strong style="font-family:var(--font-display);font-size:18px;margin-right:6px">' + rooms.length + ' rooms</strong>' +
      Object.keys(ROOM_STATUS).map(function (k) { return pill(ROOM_STATUS[k].label + ' · ' + (counts[k] || 0), ROOM_STATUS[k].cls); }).join('') + '</div>' +
      '<div class="seg" role="group" aria-label="Board layout">' + [['3d', 'Building'], ['grid', 'Cards']].map(function (o) { return '<button type="button" class="' + (layout === o[0] ? 'on' : '') + '" aria-pressed="' + (layout === o[0]) + '" onclick="setBoardLayout(\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div></div>' +
      (layout === '3d' ? building3dHtml() : '<div class="rooms">' + rooms.map(roomCard).join('') + '</div>') + '</section>' +
      '<aside class="narrow"><div class="card"><h2>Needs attention</h2><div class="stack">' + alertList(al, 8) + '</div></div>' +
      '<div class="card"><h2>Arrivals and departures</h2>' + movesList(arrivals, departures) + '</div></aside></div>';
    return html;
  }
};
function boardLayout() { var v; try { v = localStorage.getItem('wiwe_board'); } catch (e) {} return v === 'grid' ? 'grid' : '3d'; }
function setBoardLayout(v) { try { localStorage.setItem('wiwe_board', v); } catch (e) {} render(); }
// The building drawn floor by floor, top floor first, rooms left to right
function buildingMap(rooms) {
  var floors = {};
  rooms.forEach(function (r) { var f = roomFloor(r); (floors[f] = floors[f] || []).push(r); });
  var keys = Object.keys(floors).map(Number).sort(function (a, b) { return b - a; });
  return '<div class="building" aria-label="Building map">' +
    '<div class="roof" aria-hidden="true"></div>' +
    keys.map(function (f) {
      return '<div class="floor"><div class="floor-name">' + esc(floorName(f)) + '</div><div class="floor-rooms">' + floors[f].map(roomTile).join('') + '</div></div>';
    }).join('') +
    '<div class="ground-line" aria-hidden="true"></div></div>';
}
function roomTile(r) {
  var st = displayStatus(r), s = stayOf(r), line = '', flag = false;
  if (st === 'occupied' && s) { line = s.guestName.split(' ')[0]; flag = isOverstay(s) || dueOutToday(s) || (s.balance || 0) > 0; }
  else if (st === 'reserved') { var rv = reservationToday(r); line = rv ? rv.guestName.split(' ')[0] : ''; }
  else if (st === 'ooo') line = 'Repair';
  return '<button type="button" class="tile ' + ROOM_STATUS[st].cls + '" onclick="openRoom(\'' + r.id + '\')" aria-label="Room ' + esc(r.number) + ', ' + ROOM_STATUS[st].label + (line ? ', ' + esc(line) : '') + '">' +
    (flag ? '<span class="tile-flag" aria-hidden="true">!</span>' : '') +
    '<span class="tile-no">' + esc(r.number) + '</span><span class="tile-st">' + ROOM_STATUS[st].label + '</span>' + (line ? '<span class="tile-line">' + esc(line) + '</span>' : '') +
    '<span class="tile-type">' + esc(roomType(r).name) + '</span></button>';
}
function stat(label, value, sub, cls) { return '<div class="stat ' + (cls || '') + '"><span class="label">' + esc(label) + '</span><span class="value">' + esc(value) + '</span><span class="sub">' + esc(sub || '') + '</span></div>'; }
function roomCard(r) {
  var st = displayStatus(r), type = roomType(r), s = stayOf(r), l1 = '', l2 = '', flag = '';
  if (st === 'occupied' && s) {
    l1 = s.guestName; l2 = (dueOutToday(s) ? 'Out today ' : 'Out ' + fmtDate(s.checkOutDate) + ' ') + S.settings.checkOutTime;
    if (isOverstay(s)) flag = 'Overstay · no extension';
    else if (dueOutToday(s)) flag = 'Due out';
    else if (S.data.payments.some(function (p) { return p.stayId === s.id && p.status === 'unconfirmed'; })) flag = 'Payment unconfirmed';
    if ((s.balance || 0) > 0) flag = 'Balance ' + money(s.balance);
  } else if (st === 'reserved') { var rv = reservationToday(r); l1 = rv ? rv.guestName : ''; l2 = rv ? 'Arriving ' + (rv.arrivalTime || '') : ''; }
  else if (st === 'dirty') { l1 = 'Needs cleaning'; l2 = 'Task created'; }
  else if (st === 'cleaning') { var tk = S.data.tasks.find(function (t) { return t.roomId === r.id && t.status === 'in_progress'; }); l1 = tk && tk.assigneeName ? tk.assigneeName + ' cleaning' : 'Being cleaned'; l2 = tk && tk.startedAt ? 'Started ' + fmtTime(tk.startedAt) : ''; }
  else if (st === 'inspect') { l1 = 'Ready for inspection'; l2 = 'Check before letting'; }
  else if (st === 'ooo') { l1 = r.oooReason || 'Out of order'; l2 = ''; }
  else { l1 = 'Available'; l2 = r.readyAt ? 'Inspected ' + fmtDT(r.readyAt) : ''; }
  return '<button type="button" class="room" onclick="openRoom(\'' + r.id + '\')" aria-label="Room ' + esc(r.number) + ', ' + ROOM_STATUS[st].label + '">' +
    '<span class="top"><span class="no">' + esc(r.number) + '</span>' + pill(ROOM_STATUS[st].label, ROOM_STATUS[st].cls) + '</span>' +
    '<span class="type">' + esc(type.name) + '</span><span class="l1">' + esc(l1) + '</span><span class="l2">' + esc(l2) + '</span>' +
    (flag ? '<span class="flag">' + esc(flag) + '</span>' : '') + '</button>';
}
function movesList(arr, dep) {
  var rows = dep.map(function (s) { return { n: s.guestName, r: s.roomNo, t: 'by ' + S.settings.checkOutTime, k: 'Departing', c: 'st-dirty', id: s.id }; })
    .concat(arr.map(function (s) { return { n: s.guestName, r: s.roomNo, t: s.arrivalTime || '', k: 'Arriving', c: 'st-reserved', id: s.id }; }))
    .concat(S.data.stays.filter(isOverstay).map(function (s) { return { n: s.guestName, r: s.roomNo, t: 'overdue', k: 'Overstay', c: 'st-bad', id: s.id }; }));
  if (!rows.length) return '<div class="muted">No movements today.</div>';
  return rows.map(function (m) { return '<div class="list-row clickable" onclick="openStay(\'' + m.id + '\')"><span class="main-t"><strong>' + esc(m.n) + '</strong><span>Room ' + esc(m.r) + ' · ' + esc(m.t) + '</span></span>' + pill(m.k, m.c) + '</div>'; }).join('');
}

/* ---------- Room sheet ---------- */
function openRoom(id) {
  var r = byId(S.data.rooms, id); if (!r) return;
  var st = displayStatus(r), s = stayOf(r), type = roomType(r), b = '';
  b += '<div class="row">' + pill(ROOM_STATUS[st].label, ROOM_STATUS[st].cls) + '<span class="muted">' + esc(type.name) + ' · ' + money(type.rate) + ' per night</span></div>' +
    '<div class="row between"><span class="muted">Where: <strong style="color:var(--text)">' + esc(typeof roomWhere === 'function' ? roomWhere(r) : floorName(roomFloor(r))) + '</strong></span><button class="btn small" type="button" onclick="closeModal();go(\'building\');setTimeout(function(){b3dFocus(\'' + r.id + '\')},50)">Show on building</button></div>';
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
  b += '<div class="row">' + acts.join('') + '</div>';
  var hist = S.data.stays.filter(function (x) { return x.roomId === r.id && x.status === 'checked_out'; }).slice(0, 5);
  if (hist.length) b += '<div><h3 style="font-size:15px;margin-bottom:6px">Recent stays</h3>' + hist.map(function (x) { return '<div class="list-row clickable" onclick="openStay(\'' + x.id + '\')"><span class="main-t"><strong>' + esc(x.guestName) + '</strong><span>' + fmtDate(x.checkInDate) + ' → ' + fmtDate(x.checkOutDate) + '</span></span><span class="money">' + money(x.total) + '</span></div>'; }).join('') + '</div>';
  var jobs = S.data.jobs.filter(function (j) { return j.roomId === r.id; }).slice(0, 5);
  if (jobs.length) b += '<div><h3 style="font-size:15px;margin-bottom:6px">Maintenance</h3>' + jobs.map(function (j) { return '<div class="list-row clickable" onclick="openJob(\'' + j.id + '\')"><span class="main-t"><strong>' + esc(j.title) + '</strong><span>' + fmtDate(j.createdAt) + '</span></span>' + jobPill(j) + '</div>'; }).join('') + '</div>';
  openModal('Room ' + r.number, b);
}
function backInService(id) {
  if (!confirm('Put this room back in service? It will go to "Dirty" so it gets cleaned and inspected first.')) return;
  var r = byId(S.data.rooms, id);
  db.collection('rooms').doc(id).update({ status: 'dirty', oooReason: '' }).then(function () { createTurnoverTask(r, null, 'Back in service after repair'); audit('room_back_in_service', 'room', id, r.number); closeModal(); toast('Room ' + r.number + ' back in service'); }).catch(fail);
}

/* ---------- Check-in ---------- */
function openCheckIn(roomId, reservationId) {
  if (!has('manager', 'frontdesk')) return toast('Only front desk can check guests in', true);
  var rv = reservationId ? byId(S.data.stays, reservationId) : null;
  var free = roomsSorted().filter(function (r) { return r.status === 'ready' || r.id === roomId; });
  if (!free.length) return toast('No rooms are Ready. Rooms must be cleaned and inspected first.', true);
  var room = byId(S.data.rooms, roomId) || byId(S.data.rooms, rv && rv.roomId) || free[0];
  S.form = { rvId: rv ? rv.id : '', idPhotos: (rv && rv.idPhotos) || [], payPhotos: [] };
  var st = S.settings, nights = rv ? rv.nights : 1;
  var b = '<form class="form" onsubmit="event.preventDefault();saveCheckIn()">' +
    '<fieldset class="group"><legend>1 · Guest</legend><div class="fields">' +
    field('Full name', input('ci-name', rv ? rv.guestName : '', 'required autocomplete="off"')) +
    field('Phone number', input('ci-phone', rv ? rv.phone : '', 'required type="tel" onblur="guestLookup()"')) +
    field('ID type', '<select id="ci-idtype">' + opts(ID_TYPES, rv && rv.idType) + '</select>') +
    field('ID number', input('ci-idno', rv ? rv.idNumber : '', '')) +
    photoField('idPhotos', 'Photo of ID') +
    '<div class="full" id="ci-lookup" style="grid-column:1/-1"></div></div></fieldset>' +
    '<fieldset class="group"><legend>2 · Stay</legend><div class="fields">' +
    field('Room', '<select id="ci-room" onchange="ciCalc()">' + free.map(function (r) { return '<option value="' + r.id + '"' + (r.id === room.id ? ' selected' : '') + '>' + esc(r.number + ' · ' + roomType(r).name) + '</option>'; }).join('') + '</select>') +
    field('Nights', input('ci-nights', nights, 'type="number" min="1" required oninput="ciCalc()"')) +
    '<div class="field">Check-out<span class="static" id="ci-out"></span></div>' +
    '<div class="field">Rate per night<span class="static" id="ci-rate"></span></div>' +
    field('Discount (₦)', input('ci-disc', '', 'inputmode="numeric" oninput="ciCalc()"'), '', isAdmin() ? '' : 'Needs a reason. The owner will approve it.') +
    field('Discount reason', input('ci-discr', '', '')) +
    '</div></fieldset>' +
    '<fieldset class="group"><legend>3 · Payment</legend>' +
    '<div class="choices" role="radiogroup" aria-label="Payment method">' + Object.keys(PAY_METHODS).map(function (k, i) { return '<label class="choice"><input type="radio" name="ci-method" value="' + k + '"' + (i === 0 ? ' checked' : '') + '>' + PAY_METHODS[k] + '</label>'; }).join('') + '</div>' +
    '<div class="fields">' +
    field('Amount received (₦)', input('ci-amount', '', 'required inputmode="numeric"')) +
    field("Sender's name on transfer", input('ci-sender', '', '')) +
    field('Transfer reference / session ID', input('ci-ref', '', ''), '', 'From the receipt. Needed for transfer and POS.') +
    photoField('payPhotos', 'Receipt screenshot') +
    '</div><div class="note warn">This payment stays "Unconfirmed" until the owner matches it to the bank alert. A screenshot alone is not proof.</div></fieldset>' +
    '<fieldset class="group"><legend>4 · Caution fee and key card</legend><div class="fields">' +
    (st.cautionEnabled ? field('Caution fee (₦, refundable)', input('ci-caution', st.cautionAmount || '', 'inputmode="numeric"')) + field("Guest's bank account for refund", input('ci-cacct', '', ''), '', 'Bank, account number and name') : '') +
    field('Key card number issued', input('ci-card', '', 'required')) +
    '</div><label class="check"><input type="checkbox" id="ci-agree" required>Guest has read the house rules and agrees that missing or damaged items are paid for' + (st.cautionEnabled ? ' from the caution fee' : '') + '.</label></fieldset>' +
    '<div class="card" id="ci-sum"></div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn gold" id="ci-save">Complete check-in</button></div></form>';
  openModal(rv ? 'Check in ' + rv.guestName : 'Check in guest', b, true);
  ciCalc();
}
function guestLookup() {
  var ph = val('ci-phone').replace(/\D/g, ''); if (ph.length < 7) return;
  var prev = S.data.stays.filter(function (s) { return s.phone && s.phone.replace(/\D/g, '') === ph && s.status === 'checked_out'; });
  var box = $('ci-lookup'); if (!box) return;
  if (!prev.length) { box.innerHTML = ''; return; }
  var issues = prev.filter(function (s) { return (s.missing && s.missing.length) || s.damageNote || s.cautionDeductions > 0; });
  box.innerHTML = '<div class="note ' + (issues.length ? 'bad' : 'ok') + '">Returning guest: ' + prev.length + ' previous stay' + (prev.length > 1 ? 's' : '') + ' (last: Room ' + esc(prev[0].roomNo) + ', ' + fmtDate(prev[0].checkInDate) + '). ' + (issues.length ? issues.length + ' stay(s) had missing items or damage.' : 'No damage or issues recorded.') + '</div>';
  if (!val('ci-name')) $('ci-name').value = prev[0].guestName;
}
function ciCalc() {
  var r = byId(S.data.rooms, val('ci-room')); if (!r) return;
  var rate = Number(roomType(r).rate) || 0, n = Math.max(1, num(val('ci-nights'))), d = num(val('ci-disc'));
  var out = addDays(todayStr(), n), total = Math.max(0, rate * n - d), caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0;
  $('ci-out').textContent = fmtDate(out) + ', ' + S.settings.checkOutTime;
  $('ci-rate').textContent = money(rate) + (isAdmin() ? '' : ' (set by admin)');
  $('ci-sum').innerHTML = '<div class="row between"><span>Room ' + esc(r.number) + ' · ' + n + ' night' + (n > 1 ? 's' : '') + '</span><span class="money">' + money(rate * n) + '</span></div>' +
    (d ? '<div class="row between"><span>Discount</span><span class="money">-' + money(d) + '</span></div>' : '') +
    (caution ? '<div class="row between"><span>Caution fee (refundable)</span><span class="money">' + money(caution) + '</span></div>' : '') +
    '<div class="row between strong" style="font-size:17px;padding-top:6px"><span>Collect now</span><span class="money">' + money(total + caution) + '</span></div>' +
    (rate === 0 ? '<div class="note warn">This room type has no rate yet. The owner sets rates in Admin settings → Rooms.</div>' : '');
}
async function saveCheckIn() {
  var r = byId(S.data.rooms, val('ci-room'));
  if (!r) return toast('Pick a room', true);
  if (r.status !== 'ready') return toast('Room ' + r.number + ' is not Ready', true);
  var method = radio('ci-method'), amount = num(val('ci-amount')), ref = val('ci-ref');
  if (!S.form.idPhotos.length && !val('ci-idno')) return toast('Add the ID number or a photo of the ID', true);
  if (method !== 'cash' && !ref) return toast('Enter the transfer or POS reference', true);
  var disc = num(val('ci-disc')), discR = val('ci-discr');
  if (disc > 0 && !discR) return toast('Give a reason for the discount', true);
  var type = roomType(r), rate = Number(type.rate) || 0, n = Math.max(1, num(val('ci-nights')));
  var total = Math.max(0, rate * n - disc), caution = S.settings.cautionEnabled ? num(val('ci-caution')) : 0;
  var roomPaid = Math.min(amount, total), cautionPaid = Math.max(0, amount - total);
  if (caution && cautionPaid < caution && !confirm('The amount received does not cover the room and the caution fee. Continue anyway?')) return;
  $('ci-save').disabled = true;
  var now = Date.now(), t = todayStr(), b = db.batch();
  var sref = S.form.rvId ? db.collection('stays').doc(S.form.rvId) : db.collection('stays').doc();
  var stay = {
    roomId: r.id, roomNo: r.number, roomTypeName: type.name,
    guestName: val('ci-name'), phone: val('ci-phone'), idType: val('ci-idtype'), idNumber: val('ci-idno'), idPhotos: S.form.idPhotos,
    checkInDate: t, checkOutDate: addDays(t, n), nights: n, rate: rate,
    discount: disc, discountReason: discR, discountStatus: disc > 0 ? (isAdmin() ? 'approved' : 'pending') : 'none',
    total: total, paid: roomPaid, balance: total - roomPaid,
    caution: Math.min(caution, cautionPaid), cautionAccount: val('ci-cacct') || '', cautionStatus: caution && cautionPaid ? 'held' : 'none',
    cardNo: val('ci-card'), cardReturned: false,
    status: 'checked_in', checkedInAt: now, checkedInBy: S.user.uid, checkedInByName: meName()
  };
  if (!S.form.rvId) Object.assign(stay, { createdAt: now, by: S.user.uid, byName: meName() });
  b.set(sref, stay, { merge: true });
  var pay = { stayId: sref.id, roomNo: r.number, guestName: stay.guestName, method: method, sender: val('ci-sender'), ref: ref, photos: S.form.payPhotos, status: 'unconfirmed' };
  if (roomPaid > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: roomPaid, kind: 'room' }, pay, stamp()));
  if (cautionPaid > 0) b.set(db.collection('payments').doc(), Object.assign({ amount: cautionPaid, kind: 'caution' }, pay, stamp()));
  b.update(db.collection('rooms').doc(r.id), { status: 'occupied', currentStayId: sref.id });
  b.commit().catch(fail);
  audit('check_in', 'stay', sref.id, 'Room ' + r.number + ' · ' + stay.guestName + ' · ' + n + ' nights · paid ' + money(amount));
  closeModal(); toast(stay.guestName + ' checked in to Room ' + r.number);
}

/* ---------- Reservation ---------- */
function openReservation(roomId) {
  if (!has('manager', 'frontdesk')) return;
  var rooms = roomsSorted().filter(function (r) { return r.status !== 'ooo'; });
  var b = '<form class="form" onsubmit="event.preventDefault();saveReservation()"><div class="fields">' +
    field('Guest name', input('rv-name', '', 'required')) +
    field('Phone number', input('rv-phone', '', 'required type="tel"')) +
    field('Room', '<select id="rv-room">' + rooms.map(function (r) { return '<option value="' + r.id + '"' + (r.id === roomId ? ' selected' : '') + '>' + esc(r.number + ' · ' + roomType(r).name) + '</option>'; }).join('') + '</select>') +
    field('Arrival date', input('rv-date', todayStr(), 'type="date" required')) +
    field('Nights', input('rv-nights', 1, 'type="number" min="1" required')) +
    field('Expected arrival time', input('rv-time', S.settings.checkInTime, 'type="time"')) +
    field('Note', '<textarea id="rv-note"></textarea>', 'full') +
    '</div><div class="note">Pay on arrival. The room is held for ' + (S.settings.holdHours || 3) + ' hours after the expected time, then it shows as a possible no-show.</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save reservation</button></div></form>';
  openModal('New reservation', b);
}
function overlaps(roomId, from, to, ignoreId) {
  return S.data.stays.find(function (s) { return s.id !== ignoreId && s.roomId === roomId && (s.status === 'reserved' || s.status === 'checked_in') && s.checkInDate < to && from < s.checkOutDate; });
}
function saveReservation() {
  var r = byId(S.data.rooms, val('rv-room')), from = val('rv-date'), n = Math.max(1, num(val('rv-nights'))), to = addDays(from, n);
  if (from < todayStr()) return toast('Arrival date is in the past', true);
  var clash = overlaps(r.id, from, to);
  if (clash) return toast('Room ' + r.number + ' is taken by ' + clash.guestName + ' (' + fmtDate(clash.checkInDate) + ' → ' + fmtDate(clash.checkOutDate) + ')', true);
  var ref = db.collection('stays').doc();
  ref.set(Object.assign({ roomId: r.id, roomNo: r.number, roomTypeName: roomType(r).name, guestName: val('rv-name'), phone: val('rv-phone'), checkInDate: from, checkOutDate: to, nights: n, arrivalTime: val('rv-time'), notes: val('rv-note'), status: 'reserved', createdAt: Date.now() }, stamp())).catch(fail);
  audit('reservation', 'stay', ref.id, 'Room ' + r.number + ' · ' + val('rv-name') + ' · ' + from);
  closeModal(); toast('Reservation saved');
}

/* ---------- Stay detail ---------- */
var STAY_STATUS = { reserved: ['Reserved', 'st-reserved'], checked_in: ['In house', 'st-occupied'], checked_out: ['Checked out', 'st-ready'], cancelled: ['Cancelled', 'st-ooo'], no_show: ['No-show', 'st-ooo'] };
function openStay(id) {
  var s = byId(S.data.stays, id); if (!s) return toast('Stay not found', true);
  var ss = STAY_STATUS[s.status] || ['', ''];
  var pays = S.data.payments.filter(function (p) { return p.stayId === s.id; });
  var b = '<div class="row">' + pill(ss[0], ss[1]) + (isOverstay(s) ? pill('Overstay', 'st-bad') : '') + '<span class="muted">Room ' + esc(s.roomNo) + ' · ' + esc(s.roomTypeName || '') + '</span></div>';
  b += '<div class="fields">' +
    info('Guest', s.guestName) + info('Phone', s.phone) + info('ID', (s.idType || '') + ' ' + (s.idNumber || '')) +
    info('Dates', fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate)) + info('Nights', s.nights) + info('Key card', (s.cardNo || '—') + (s.status === 'checked_out' ? (s.cardReturned ? ' · returned' : ' · NOT returned') : '')) +
    (s.total != null ? info('Room total', money(s.total) + (s.discount ? ' (incl. ' + money(s.discount) + ' discount, ' + s.discountStatus + ')' : '')) : '') +
    (s.total != null ? info('Balance', money(s.balance || 0)) : '') +
    (s.caution ? info('Caution fee', money(s.caution) + ' · ' + ({ held: 'held', refund_due: 'refund ' + money(s.cautionRefundDue) + ' due', refunded: 'refunded', none: '' }[s.cautionStatus] || '')) : '') +
    '</div>';
  if (s.idPhotos && s.idPhotos.length) b += '<div class="thumbs">' + thumbs(s.idPhotos) + '</div>';
  if (s.notes) b += '<div class="note">' + esc(s.notes) + '</div>';
  if (s.missing && s.missing.length) b += '<div class="note bad">Missing at check-out: ' + esc(s.missing.map(function (m) { return m.name + ' × ' + m.short; }).join(', ')) + (s.damageNote ? '. ' + esc(s.damageNote) : '') + '</div>';
  else if (s.damageNote) b += '<div class="note bad">' + esc(s.damageNote) + '</div>';
  if (pays.length) b += '<div><h3 style="font-size:15px;margin-bottom:6px">Payments</h3>' + pays.map(paymentRow).join('') + '</div>';
  var acts = [];
  if (s.status === 'reserved' && has('manager', 'frontdesk')) {
    acts.push('<button class="btn primary" type="button" onclick="openCheckIn(\'' + s.roomId + '\',\'' + s.id + '\')">Check in</button>');
    acts.push('<button class="btn" type="button" onclick="endReservation(\'' + s.id + '\',\'no_show\')">Mark no-show</button>');
    acts.push('<button class="btn danger" type="button" onclick="endReservation(\'' + s.id + '\',\'cancelled\')">Cancel reservation</button>');
  }
  if (s.status === 'checked_in' && has('manager', 'frontdesk')) {
    acts.push('<button class="btn" type="button" onclick="openExtend(\'' + s.id + '\')">Extend stay</button>');
    if ((s.balance || 0) > 0) acts.push('<button class="btn" type="button" onclick="openExtend(\'' + s.id + '\', true)">Record balance payment</button>');
    acts.push('<button class="btn primary" type="button" onclick="openCheckOut(\'' + s.id + '\')">Check out</button>');
  }
  if (s.discountStatus === 'pending' && isAdmin()) {
    acts.push('<button class="btn primary" type="button" onclick="decideDiscount(\'' + s.id + '\',true)">Approve discount</button>');
    acts.push('<button class="btn danger" type="button" onclick="decideDiscount(\'' + s.id + '\',false)">Reject discount</button>');
  }
  if (s.cautionStatus === 'refund_due' && has('manager')) acts.push('<button class="btn primary" type="button" onclick="openRefund(\'' + s.id + '\')">Record caution refund</button>');
  if (acts.length) b += '<div class="row">' + acts.join('') + '</div>';
  b += '<div class="muted small">Created by ' + esc(s.byName || '') + ' ' + fmtDT(s.createdAt) + (s.checkedInByName ? ' · checked in by ' + esc(s.checkedInByName) + ' ' + fmtDT(s.checkedInAt) : '') + (s.checkedOutByName ? ' · checked out by ' + esc(s.checkedOutByName) + ' ' + fmtDT(s.checkedOutAt) : '') + '</div>';
  openModal(s.guestName, b, true);
}
function info(label, value) { return '<div class="field">' + esc(label) + '<span class="static">' + esc(value == null || value === '' ? '—' : value) + '</span></div>'; }
function endReservation(id, status) {
  var s = byId(S.data.stays, id);
  if (!confirm((status === 'no_show' ? 'Mark ' : 'Cancel ') + s.guestName + "'s reservation" + (status === 'no_show' ? ' as a no-show?' : '?'))) return;
  db.collection('stays').doc(id).update({ status: status, endedAt: Date.now(), endedBy: S.user.uid }).catch(fail);
  audit(status, 'stay', id, s.guestName + ' · Room ' + s.roomNo); closeModal(); toast('Reservation updated');
}
function decideDiscount(id, ok) {
  var s = byId(S.data.stays, id), upd = { discountStatus: ok ? 'approved' : 'rejected', discountDecidedBy: S.user.uid, discountDecidedAt: Date.now() };
  if (!ok) { upd.total = (s.total || 0) + (s.discount || 0); upd.balance = (s.balance || 0) + (s.discount || 0); }
  db.collection('stays').doc(id).update(upd).catch(fail);
  audit(ok ? 'discount_approved' : 'discount_rejected', 'stay', id, money(s.discount) + ' · ' + s.guestName);
  closeModal(); toast(ok ? 'Discount approved' : 'Discount rejected. The guest owes ' + money(upd.balance));
}

/* ---------- Extend / balance ---------- */
function openExtend(id, balanceOnly) {
  var s = byId(S.data.stays, id); S.form = { payPhotos: [], stayId: id, balanceOnly: !!balanceOnly };
  var b = '<form class="form" onsubmit="event.preventDefault();saveExtend()"><div class="fields">' +
    (balanceOnly ? info('Balance owed', money(s.balance)) : field('Extra nights', input('ex-n', 1, 'type="number" min="1" required oninput="exCalc()"')) + '<div class="field">New check-out<span class="static" id="ex-out"></span></div>') +
    '<div class="field">Amount due<span class="static" id="ex-due"></span></div></div>' +
    '<div class="choices" role="radiogroup" aria-label="Payment method">' + Object.keys(PAY_METHODS).map(function (k, i) { return '<label class="choice"><input type="radio" name="ex-method" value="' + k + '"' + (i === 0 ? ' checked' : '') + '>' + PAY_METHODS[k] + '</label>'; }).join('') + '</div>' +
    '<div class="fields">' + field('Amount received (₦)', input('ex-amount', '', 'required inputmode="numeric"')) + field("Sender's name", input('ex-sender', '', '')) + field('Reference', input('ex-ref', '', '')) + photoField('payPhotos', 'Receipt screenshot') + '</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>';
  openModal(balanceOnly ? 'Balance payment · ' + s.guestName : 'Extend stay · ' + s.guestName, b);
  exCalc();
}
function exCalc() {
  var s = byId(S.data.stays, S.form.stayId); if (!s) return;
  if (S.form.balanceOnly) { $('ex-due').textContent = money(s.balance); return; }
  var n = Math.max(1, num(val('ex-n')));
  $('ex-out').textContent = fmtDate(addDays(s.checkOutDate, n));
  $('ex-due').textContent = money(n * (s.rate || 0) + (s.balance || 0)) + ((s.balance || 0) > 0 ? ' (incl. ' + money(s.balance) + ' balance)' : '');
}
function saveExtend() {
  var s = byId(S.data.stays, S.form.stayId), method = radio('ex-method'), amount = num(val('ex-amount')), ref = val('ex-ref');
  if (method !== 'cash' && !ref) return toast('Enter the transfer or POS reference', true);
  var upd = {}, extra = 0, n = 0;
  if (!S.form.balanceOnly) {
    n = Math.max(1, num(val('ex-n'))); extra = n * (s.rate || 0);
    var newOut = addDays(s.checkOutDate, n), clash = overlaps(s.roomId, s.checkOutDate, newOut, s.id);
    if (clash) return toast('Room ' + s.roomNo + ' is reserved for ' + clash.guestName + ' from ' + fmtDate(clash.checkInDate) + '. Move one of them first.', true);
    upd.checkOutDate = newOut; upd.nights = (s.nights || 0) + n; upd.total = (s.total || 0) + extra;
  }
  upd.paid = (s.paid || 0) + amount; upd.balance = (s.balance || 0) + extra - amount;
  var b = db.batch();
  b.update(db.collection('stays').doc(s.id), upd);
  if (amount > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: s.id, roomNo: s.roomNo, guestName: s.guestName, amount: amount, kind: S.form.balanceOnly ? 'balance' : 'extension', method: method, sender: val('ex-sender'), ref: ref, photos: S.form.payPhotos, status: 'unconfirmed' }, stamp()));
  b.commit().catch(fail);
  audit(S.form.balanceOnly ? 'balance_payment' : 'extend', 'stay', s.id, (n ? '+' + n + ' nights · ' : '') + 'paid ' + money(amount));
  closeModal(); toast(S.form.balanceOnly ? 'Payment recorded' : 'Stay extended to ' + fmtDate(upd.checkOutDate));
}

/* ---------- Check-out ---------- */
function openCheckOut(id) {
  var s = byId(S.data.stays, id), r = byId(S.data.rooms, s.roomId), type = roomType(r);
  S.form = { stayId: id, damagePhotos: [] };
  var items = type.items || [];
  var b = '<form class="form" onsubmit="event.preventDefault();saveCheckOut()">' +
    ((s.balance || 0) > 0 ? '<div class="note bad">Guest still owes ' + money(s.balance) + '. Record the payment before they leave.</div>' : '') +
    '<fieldset class="group"><legend>Room items · count everything</legend>' +
    (items.length ? '<div class="count-row muted small"><span>Item</span><span>Expected</span><span>Found</span></div>' + items.map(function (it, i) { return '<div class="count-row"><span>' + esc(it.name) + '</span><span>' + it.qty + '</span><input id="co-i' + i + '" type="number" min="0" value="' + it.qty + '" aria-label="' + esc(it.name) + ' found"></div>'; }).join('') : '<div class="muted">No item list for this room type. Add one in Admin settings → Rooms.</div>') +
    '</fieldset>' +
    '<div class="fields">' + field('Damage or other notes', '<textarea id="co-note" placeholder="e.g. stain on bedsheet, broken glass"></textarea>', 'full') +
    photoField('damagePhotos', 'Photos of damage') +
    (s.caution ? field('Deduct from caution fee (₦)', input('co-ded', '', 'inputmode="numeric"'), '', 'Caution held: ' + money(s.caution)) : field('Amount charged for damage (₦)', input('co-ded', '', 'inputmode="numeric"'), '', 'No caution fee held. Record what the guest paid.')) +
    '</div>' +
    '<label class="check"><input type="checkbox" id="co-card" checked>Key card ' + esc(s.cardNo || '') + ' returned</label>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Complete check-out</button></div></form>';
  openModal('Check out · Room ' + s.roomNo + ' · ' + s.guestName, b, true);
}
function saveCheckOut() {
  var s = byId(S.data.stays, S.form.stayId), r = byId(S.data.rooms, s.roomId), items = roomType(r).items || [];
  var missing = [];
  items.forEach(function (it, i) { var f = num(val('co-i' + i)); if (f < it.qty) missing.push({ name: it.name, expected: it.qty, found: f, short: it.qty - f }); });
  var note = val('co-note'), ded = num(val('co-ded')), card = val('co-card');
  if ((missing.length || note) && !ded && !confirm('Items are missing or damaged but nothing is charged. Continue?')) return;
  var now = Date.now(), b = db.batch();
  var upd = { status: 'checked_out', checkedOutAt: now, checkedOutBy: S.user.uid, checkedOutByName: meName(), missing: missing, damageNote: note, damagePhotos: S.form.damagePhotos, cardReturned: !!card, cautionDeductions: s.caution ? Math.min(ded, s.caution) : 0 };
  if (s.caution) { var refund = Math.max(0, s.caution - ded); upd.cautionRefundDue = refund; upd.cautionStatus = refund > 0 ? 'refund_due' : 'refunded'; }
  if (!s.caution && ded > 0) b.set(db.collection('payments').doc(), Object.assign({ stayId: s.id, roomNo: s.roomNo, guestName: s.guestName, amount: ded, kind: 'damage', method: 'transfer', ref: '', status: 'unconfirmed' }, stamp()));
  b.update(db.collection('stays').doc(s.id), upd);
  b.update(db.collection('rooms').doc(r.id), { status: 'dirty', currentStayId: null });
  if (missing.length || note || !card) b.set(db.collection('incidents').doc(), Object.assign({ type: 'missing_item', title: 'Room ' + s.roomNo + ': ' + (missing.length ? missing.map(function (m) { return m.name + ' × ' + m.short; }).join(', ') : '') + (note ? ' ' + note : '') + (!card ? ' · key card not returned' : ''), roomNo: s.roomNo, stayId: s.id, photos: S.form.damagePhotos, charged: ded, resolved: false }, stamp()));
  b.commit().catch(fail);
  createTurnoverTask(r, s);
  audit('check_out', 'stay', s.id, 'Room ' + s.roomNo + ' · ' + s.guestName + (missing.length ? ' · missing ' + missing.length : '') + (ded ? ' · charged ' + money(ded) : ''));
  closeModal(); toast('Checked out. Cleaning task created for Room ' + s.roomNo);
}

/* ---------- Caution refund ---------- */
function openRefund(id) {
  var s = byId(S.data.stays, id);
  var b = '<form class="form" onsubmit="event.preventDefault();saveRefund(\'' + id + '\')"><div class="fields">' +
    info('Caution held', money(s.caution)) + info('Deducted', money(s.cautionDeductions || 0)) + info('Refund due', money(s.cautionRefundDue)) + info("Guest's account", s.cautionAccount) +
    field('Amount refunded (₦)', input('rf-amt', s.cautionRefundDue, 'inputmode="numeric" required')) + field('Transfer reference', input('rf-ref', '', 'required')) +
    '</div><div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save refund</button></div></form>';
  openModal('Caution refund · ' + s.guestName, b);
}
function saveRefund(id) {
  var s = byId(S.data.stays, id), amt = num(val('rf-amt')), b = db.batch();
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
    var list = S.data.stays.filter(function (s) { return tab === 'inhouse' ? s.status === 'checked_in' : tab === 'upcoming' ? s.status === 'reserved' : tab === 'past' ? s.status === 'checked_out' : ['cancelled', 'no_show'].indexOf(s.status) >= 0; });
    if (q) list = list.filter(function (s) { return (s.guestName + ' ' + s.phone + ' ' + s.roomNo).toLowerCase().indexOf(q) >= 0; });
    if (tab === 'upcoming') list = sortBy(list, function (s) { return s.checkInDate; });
    if (tab === 'inhouse') list = sortBy(list, function (s) { return s.checkOutDate; });
    var html = tabs('stays', [['inhouse', 'In house (' + staysByStatus('checked_in').length + ')'], ['upcoming', 'Reservations (' + staysByStatus('reserved').length + ')'], ['past', 'Checked out'], ['other', 'Cancelled / no-show']]) +
      '<div class="row"><input class="search" id="stay-q" type="search" placeholder="Search name, phone or room" value="' + esc(S.params.q || '') + '" oninput="S.params.q=this.value;render()"></div>';
    if (!list.length) return html + '<div class="card empty">Nothing here.</div>';
    return html + '<div class="table-wrap"><table><thead><tr><th>Guest</th><th>Room</th><th>Dates</th><th>Nights</th><th class="right">Total</th><th>Status</th></tr></thead><tbody>' +
      list.slice(0, 200).map(function (s) {
        var ss = STAY_STATUS[s.status] || ['', ''];
        return '<tr class="clickable" onclick="openStay(\'' + s.id + '\')"><td><strong>' + esc(s.guestName) + '</strong><div class="muted small">' + esc(s.phone || '') + '</div></td><td>' + esc(s.roomNo) + '</td><td>' + fmtDate(s.checkInDate) + ' → ' + fmtDate(s.checkOutDate) + '</td><td>' + (s.nights || '') + '</td><td class="right money">' + (s.total != null ? money(s.total) : '—') + '</td><td>' + pill(ss[0], ss[1]) + (isOverstay(s) ? ' ' + pill('Overstay', 'st-bad') : '') + ((s.balance || 0) > 0 ? ' ' + pill('Owes ' + money(s.balance), 'st-alert') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
};

/* ---------- Payments ---------- */
var PAY_STATUS = { unconfirmed: ['Unconfirmed', 'st-alert'], confirmed: ['Confirmed', 'st-ready'], rejected: ['Not received', 'st-bad'], void: ['Void', 'st-ooo'] };
var PAY_KIND = { room: 'Room', extension: 'Extension', balance: 'Balance', caution: 'Caution fee', damage: 'Damage', refund: 'Caution refund' };
function paymentRow(p) {
  var ps = PAY_STATUS[p.status] || ['', ''];
  var acts = '';
  if (isAdmin() && p.status === 'unconfirmed') acts = '<button class="btn small primary" type="button" onclick="event.stopPropagation();decidePayment(\'' + p.id + '\',\'confirmed\')">Seen in bank</button><button class="btn small danger" type="button" onclick="event.stopPropagation();decidePayment(\'' + p.id + '\',\'rejected\')">Not received</button>';
  if (isAdmin() && p.status !== 'void' && p.status !== 'unconfirmed') acts = '<button class="btn small" type="button" onclick="event.stopPropagation();voidPayment(\'' + p.id + '\')">Void</button>';
  return '<div class="list-row"><span class="main-t"><strong>' + money(p.amount) + ' · ' + esc(PAY_KIND[p.kind] || p.kind) + ' · Room ' + esc(p.roomNo) + '</strong><span>' + esc(PAY_METHODS[p.method] || p.method || '') + (p.sender ? ' · ' + esc(p.sender) : '') + (p.ref ? ' · ref ' + esc(p.ref) : '') + ' · ' + esc(p.byName || '') + ', ' + fmtDT(p.at) + '</span>' + (p.photos && p.photos.length ? '<span class="thumbs" style="margin-top:6px">' + thumbs(p.photos) + '</span>' : '') + '</span><span class="row">' + pill(ps[0], ps[1]) + acts + '</span></div>';
}
function decidePayment(id, status) {
  var p = byId(S.data.payments, id);
  if (status === 'rejected' && !confirm('Mark ' + money(p.amount) + ' from ' + (p.sender || p.guestName) + ' as NOT received? This creates an incident.')) return;
  var b = db.batch();
  b.update(db.collection('payments').doc(id), { status: status, decidedBy: S.user.uid, decidedAt: Date.now() });
  if (status === 'rejected') b.set(db.collection('incidents').doc(), Object.assign({ type: 'payment_rejected', title: money(p.amount) + ' for Room ' + p.roomNo + ' (' + p.guestName + ') not in bank', stayId: p.stayId, paymentId: id, resolved: false }, stamp()));
  b.commit().catch(fail); audit('payment_' + status, 'payment', id, money(p.amount) + ' · Room ' + p.roomNo);
  toast(status === 'confirmed' ? 'Payment confirmed' : 'Marked as not received');
}
function voidPayment(id) {
  var reason = prompt('Reason for voiding this payment record?'); if (!reason) return;
  db.collection('payments').doc(id).update({ status: 'void', voidReason: reason, decidedBy: S.user.uid, decidedAt: Date.now() }).catch(fail);
  audit('payment_void', 'payment', id, reason);
}
VIEWS.payments = {
  title: 'Payments',
  render: function () {
    var tab = curTab('payments', 'unconfirmed');
    var list = S.data.payments.filter(function (p) { return tab === 'all' || p.status === tab; });
    var t = todayStr(), todays = S.data.payments.filter(function (p) { return dateStr(new Date(p.at)) === t && p.status !== 'void' && p.amount > 0; });
    var html = '<section class="grid-stats">' +
      stat('Recorded today', money(sum(todays, function (p) { return p.amount; })), todays.length + ' payments') +
      stat('Confirmed today', money(sum(todays.filter(function (p) { return p.status === 'confirmed'; }), function (p) { return p.amount; })), 'Matched to bank') +
      stat('Waiting for owner', unconfirmedPayments().length, money(sum(unconfirmedPayments(), function (p) { return p.amount; })), unconfirmedPayments().length ? 'warn' : '') +
      '</section>' +
      (isAdmin() ? '<div class="note">Open your bank app and match each payment by amount, sender name and reference. Only tap "Seen in bank" when the money is actually there.</div>' : '<div class="note">Only the owner can confirm payments.</div>') +
      tabs('payments', [['unconfirmed', 'Unconfirmed'], ['confirmed', 'Confirmed'], ['rejected', 'Not received'], ['all', 'All']]);
    if (!list.length) return html + '<div class="card empty">Nothing here.</div>';
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
  audit('incident_resolved', 'incident', id, note); closeModal(); toast('Resolved');
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
