/* =========================================================
   SHIFT HANDOVER (front desk)
   Start a shift → everything you record is counted → end the shift with the
   POS terminal's total and notes → the next person accepts the handover (or
   reports what doesn't match). A POS total that differs from what was
   recorded, or a disputed handover, creates an incident for the owner.
   No cash is handled: guests pay by POS or bank transfer.
   ========================================================= */
function myOpenShift() { return S.data.shifts.find(function (s) { return s.status === 'open' && s.openedBy === S.user.uid; }); }
function handoverWaiting() { return S.data.shifts.find(function (s) { return s.status === 'closed' && !s.acceptedAt && s.openedBy !== S.user.uid; }); }
// Everything one person recorded between two times
function shiftSummary(uid, from, to) {
  to = to || Date.now();
  function inWin(t) { return t >= from && t <= to; }
  var pays = allPayments().filter(function (p) { return p.by === uid && inWin(p.at) && payCounts(p); });
  var byMethod = { pos: 0, transfer: 0 };
  pays.forEach(function (p) { if (p.amount > 0 && byMethod[p.method] != null) byMethod[p.method] += p.amount; });
  return {
    checkins: S.data.stays.filter(function (s) { return s.checkedInBy === uid && inWin(s.checkedInAt); }).length,
    checkouts: S.data.stays.filter(function (s) { return s.checkedOutBy === uid && inWin(s.checkedOutAt); }).length,
    reservations: S.data.stays.filter(function (s) { return s.by === uid && inWin(s.createdAt) && s.status !== 'checked_in'; }).length,
    payments: byMethod,
    slips: pays.filter(function (p) { return p.amount > 0 && p.method === 'pos'; }).length,
    received: byMethod.transfer + byMethod.pos,
    refunds: -sum(allPayments().filter(function (p) { return p.by === uid && inWin(p.at) && p.amount < 0 && p.status !== 'void' && p.status !== 'rejected'; }), function (p) { return p.amount; }),
    sales: sum(S.data.moves.filter(function (m) { return m.type === 'sale' && m.by === uid && inWin(m.at); }), function (m) { return m.total; }),
    expenses: sum(S.data.expenses.filter(function (e) { return e.by === uid && inWin(e.at) && e.status !== 'void'; }), function (e) { return e.amount; })
  };
}
function summaryHtml(sm) {
  var p = sm.payments || {};
  return '<div class="fields">' + info('Check-ins', sm.checkins) + info('Check-outs', sm.checkouts) + info('New reservations', sm.reservations) +
    info('POS recorded', money(p.pos) + (sm.slips != null ? ' · ' + sm.slips + ' slip' + (sm.slips === 1 ? '' : 's') : '')) + info('Bank transfers recorded', money(p.transfer)) + (p.cash ? info('Cash received', money(p.cash)) : '') +
    info('Item sales', money(sm.sales)) + info('Refunds asked for', money(sm.refunds)) + info('Expenses recorded', money(sm.expenses)) + '</div>';
}
// How the POS terminal's own total compared with what was recorded (old shifts compared cash instead)
function shiftCheck(s) {
  if (s.posCounted != null) return '<div class="fields">' + info('POS total on the terminal', money(s.posCounted)) + info('POS recorded in the app', money(s.posExpected)) + info('Difference', s.variance ? (s.variance > 0 ? '+' : '−') + money(Math.abs(s.variance)) : 'None') + '</div>';
  if (s.cashCounted != null) return '<div class="fields">' + info('Cash counted', money(s.cashCounted)) + info('Cash expected', money(s.cashExpected)) + info('Difference', money(s.variance || 0)) + '</div>';
  return '<div class="muted">The POS total was not entered for this shift.</div>';
}
VIEWS.shift = {
  title: 'Shift',
  render: function () {
    var mine = myOpenShift(), wait = handoverWaiting(), html = '';
    if (wait && !mine) {
      html += '<div class="card"><div class="card-head"><h2>Handover from ' + esc(wait.openedByName) + '</h2>' + pill('Waiting for you', 'st-alert') + '</div>' +
        '<div class="muted" style="margin-bottom:10px">' + fmtDT(wait.openedAt) + ' → ' + fmtDT(wait.closedAt) + '</div>' + summaryHtml(wait.summary || {}) +
        '<div style="margin-top:10px">' + shiftCheck(wait) + '</div>' +
        (wait.notes ? '<div class="note" style="margin-top:10px"><strong>Notes:</strong> ' + esc(wait.notes) + '</div>' : '') +
        '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" onclick="acceptHandover(\'' + wait.id + '\', true)">Everything matches: accept and start my shift</button><button class="btn danger" type="button" onclick="acceptHandover(\'' + wait.id + '\', false)">Something doesn\'t match</button></div></div>';
    }
    if (mine) {
      var sm = shiftSummary(S.user.uid, mine.openedAt);
      html += '<div class="card"><div class="card-head"><h2>Your shift</h2>' + pill('Open since ' + fmtTime(mine.openedAt), 'st-ready') + '</div>' + summaryHtml(sm) +
        '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" onclick="openCloseShift()">End shift and hand over</button></div></div>';
    } else if (!wait) {
      html += '<div class="card"><h2>No shift open</h2><p class="muted">Start your shift when you take over the front desk. Everything you record is counted for the handover.</p><button class="btn primary" type="button" onclick="startShift()">Start my shift</button></div>';
    }
    var list = S.data.shifts.filter(function (s) { return s.status !== 'open' || s.openedBy !== S.user.uid; });
    if (!has('manager')) list = list.filter(function (s) { return s.openedBy === S.user.uid || s.acceptedBy === S.user.uid; });
    html += '<div class="card"><h2>Recent shifts</h2>' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Who</th><th>From</th><th>To</th><th class="right">Received</th><th class="right">POS diff.</th><th>Handover</th></tr></thead><tbody>' + list.slice(0, 30).map(function (s) {
      var v = s.variance || 0;
      return '<tr class="clickable" onclick="openShift(\'' + s.id + '\')"><td>' + esc(s.openedByName) + '</td><td>' + fmtDT(s.openedAt) + '</td><td>' + (s.closedAt ? fmtDT(s.closedAt) : pill('Open', 'st-ready')) + '</td><td class="right money">' + money(s.summary ? s.summary.received : 0) + '</td><td class="right money">' + (s.status === 'open' || (s.posCounted == null && s.cashCounted == null) ? '—' : v === 0 ? '0' : (v > 0 ? '+' : '−') + money(Math.abs(v))) + '</td><td>' + (s.acceptedAt ? (s.disputed ? pill('Disputed', 'st-bad') : pill('Accepted by ' + (s.acceptedByName || ''), 'st-ready')) : s.status === 'closed' ? pill('Waiting', 'st-alert') : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="muted">No shifts yet.</div>') + '</div>';
    return html;
  }
};
function startShift() {
  if (myOpenShift()) return toast('Your shift is already open', true);
  var ref = db.collection('shifts').doc();
  ref.set({ openedBy: S.user.uid, openedByName: meName(), openedAt: Date.now(), status: 'open', by: S.user.uid }).catch(fail);
  audit('shift_started', 'shift', ref.id, ''); toast('Shift started');
}
function openCloseShift() {
  var mine = myOpenShift(), sm = shiftSummary(S.user.uid, mine.openedAt);
  var b = '<form class="form" onsubmit="event.preventDefault();closeShift()">' + summaryHtml(sm) +
    '<div class="fields">' + info('POS you recorded', money(sm.payments.pos) + ' · ' + sm.slips + ' slip' + (sm.slips === 1 ? '' : 's')) +
    field('POS total on the terminal for your shift (₦)', input('sh-pos', '', 'inputmode="numeric"'), '', 'From the terminal\'s summary or end-of-day report. Leave empty if you cannot print it.') +
    field('Notes for the next person', '<textarea id="sh-notes" placeholder="Guests to watch, keys, issues, anything pending"></textarea>', 'full') + '</div>' +
    '<div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">End shift</button></div></form>';
  openModal('End shift', b);
}
function closeShift() {
  var mine = myOpenShift(), now = Date.now(), sm = shiftSummary(S.user.uid, mine.openedAt, now), raw = val('sh-pos');
  var counted = raw === '' ? null : num(raw), variance = counted == null ? 0 : counted - sm.payments.pos;
  if (variance && !confirm('The terminal shows ' + money(counted) + ' but ' + money(sm.payments.pos) + ' was recorded in the app.\n\nOK = end the shift and report the ' + money(Math.abs(variance)) + ' difference to the owner.\nCancel = go back and check.')) return;
  var b = db.batch();
  b.update(db.collection('shifts').doc(mine.id), { status: 'closed', closedAt: now, summary: sm, posCounted: counted, posExpected: sm.payments.pos, variance: variance, notes: val('sh-notes') });
  if (variance) b.set(db.collection('incidents').doc(), Object.assign({ type: 'pos_mismatch', title: 'POS total ' + (variance > 0 ? 'higher' : 'lower') + ' than recorded by ' + money(Math.abs(variance)) + ' at end of ' + meName() + '\'s shift', resolved: false }, stamp()));
  audit('shift_closed', 'shift', mine.id, counted == null ? 'POS total not entered' : 'POS ' + money(counted) + ' (recorded ' + money(sm.payments.pos) + ')', b);
  b.commit().catch(fail);
  closeModal(); toast('Shift ended. Waiting for the next person to accept.');
}
function acceptHandover(id, ok) {
  var s = byId(S.data.shifts, id), note = '';
  if (!ok) { note = prompt('What doesn\'t match? (POS total, keys, guests, anything)'); if (!note) return; }
  var b = db.batch(), now = Date.now();
  b.update(db.collection('shifts').doc(id), { acceptedBy: S.user.uid, acceptedByName: meName(), acceptedAt: now, disputed: !ok, acceptNote: note });
  if (!ok) b.set(db.collection('incidents').doc(), Object.assign({ type: 'handover_dispute', title: meName() + ' disputed the handover from ' + s.openedByName + ': ' + note, resolved: false }, stamp()));
  if (!myOpenShift()) b.set(db.collection('shifts').doc(), { openedBy: S.user.uid, openedByName: meName(), openedAt: now, status: 'open', by: S.user.uid, takenOverFrom: id });
  audit(ok ? 'handover_accepted' : 'handover_disputed', 'shift', id, note, b);
  b.commit().catch(fail);
  toast(ok ? 'Handover accepted. Your shift has started.' : 'Reported to the owner. Your shift has started.');
}
function openShift(id) {
  var s = byId(S.data.shifts, id); if (!s) return;
  var sm = s.summary || shiftSummary(s.openedBy, s.openedAt);
  var b = '<div class="muted">' + esc(s.openedByName) + ' · ' + fmtDT(s.openedAt) + ' → ' + (s.closedAt ? fmtDT(s.closedAt) : 'still open') + '</div>' + summaryHtml(sm) +
    (s.status !== 'open' ? shiftCheck(s) : '') +
    (s.notes ? '<div class="note"><strong>Notes:</strong> ' + esc(s.notes) + '</div>' : '') +
    (s.acceptedAt ? '<div class="note ' + (s.disputed ? 'bad' : 'ok') + '">' + (s.disputed ? 'Disputed' : 'Accepted') + ' by ' + esc(s.acceptedByName) + ', ' + fmtDT(s.acceptedAt) + (s.acceptNote ? ': ' + esc(s.acceptNote) : '') + '</div>' : '');
  openModal('Shift', b, true);
}
