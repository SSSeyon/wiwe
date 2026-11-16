/* =========================================================
   People: admin changes that need two admins, the password-reset hold,
   the notification bell, profile photos and the manual
   ========================================================= */
var RESET_HOLD_MS = 2 * 3600000;   // a reset admin account cannot approve admin changes for 2 hours
var ADMIN_WAIT_MS = 3 * 86400000;  // with only two admins, a removal goes through after 3 days unless blocked
var REQ_TYPE = { grant: 'Make admin', remove: 'Remove admin', handover: 'Hand over admin account' };

function isActiveAdmin(u) { return !!u && u.active !== false && (u.roles || []).indexOf('admin') >= 0; }
function activeAdmins() { return S.data.users.filter(isActiveAdmin); }
function myRole(r) { return !!S.me && (S.me.roles || []).indexOf(r) >= 0; }
function userName(id) { var u = byId(S.data.users, id); return u ? u.name : 'someone'; }
// After one admin resets another admin's password, the new login is on hold for 2 hours
// (it cannot approve admin changes), unless a second admin confirms the reset.
function onHold(u) { u = u || S.me; return !!(u && u.resetAt && Date.now() - u.resetAt < RESET_HOLD_MS && !u.resetConfirmed); }
function holdEnds(u) { return (u.resetAt || 0) + RESET_HOLD_MS; }

/* ---------- Listening (admins only) ---------- */
function startAdminListeners() {
  S.unsub.push(db.collection('adminRequests').where('status', '==', 'pending').onSnapshot(function (s) { S.data.adminReqs = docRows(s); scheduleRender(); }, function (e) { console.warn('adminRequests', e.message); }));
  S.unsub.push(db.collection('meta').doc('admins').onSnapshot(function (d) { S.adminList = d.exists ? (d.data().uids || []) : null; if (!d.exists) setTimeout(ensureAdminList, 2000); }, function (e) { console.warn('meta/admins', e.message); }));
}
// The database keeps a list of who the admins are, so its rules can tell when there is only one.
// The first admin to open this version writes it.
var adminListBusy = false;
async function ensureAdminList() {
  if (!isAdmin() || S.adminList || adminListBusy || !S.data.users.length) return;
  adminListBusy = true;
  try {
    var d = await db.collection('meta').doc('admins').get();
    if (!d.exists) { var ids = activeAdmins().map(function (u) { return u.id; }); if (ids.indexOf(S.user.uid) < 0) ids.push(S.user.uid); await db.collection('meta').doc('admins').set({ uids: ids, added: '', removed: '', at: Date.now() }); S.adminList = ids; }
    else S.adminList = d.data().uids || [];
  } catch (e) { console.warn('admin list', e.message); }
  adminListBusy = false;
}
function adminListOr(fn) {
  if (S.adminList) return true;
  ensureAdminList(); toast('One moment: the list of admins is still loading. Try again in a few seconds.', true);
  return false;
}

/* ---------- Requests ---------- */
function reqReady(r) { return r.status === 'pending' && ((r.approvals || []).length >= 2 || (r.waitUntil > 0 && Date.now() >= r.waitUntil)); }
function reqTitle(r) {
  var who = r.targetName || userName(r.target);
  if (r.type === 'remove') return (r.payload && r.payload.deactivate ? 'Deactivate ' : 'Take admin role from ') + who;
  if (r.type === 'grant') return 'Make ' + who + ' an admin';
  return 'Hand over ' + who + "'s admin account to " + ((r.payload && r.payload.name) || 'a new person');
}
function reqSub(r) {
  var ok = (r.approvals || []).map(userName).join(' and ');
  return 'Asked by ' + (r.byName || userName(r.by)) + ' · ' + fmtDT(r.at) + ' · approved by ' + ok +
    (r.waitUntil > 0 ? ' · goes through ' + fmtDT(r.waitUntil) + ' unless blocked' : ' · needs one more admin') + (r.note ? ' · "' + r.note + '"' : '');
}
// Requests this admin should act on: approve, block, or carry out
function adminReqsForMe() {
  if (!isAdmin()) return [];
  var me = S.user.uid;
  return (S.data.adminReqs || []).filter(function (r) {
    if (r.status !== 'pending') return false;
    if (reqReady(r)) return true;
    if (r.by === me) return false;
    return (r.approvals || []).indexOf(me) < 0;
  });
}
async function raiseAdminReq(type, u, payload) {
  var note = await askText({ title: REQ_TYPE[type] + ': ' + u.name, text: 'Another admin has to approve this before it happens.', label: 'Reason (shown to the other admins)', ok: 'Ask for approval' });
  if (note === null || note === undefined) return false;
  var others = activeAdmins().filter(function (a) { return a.id !== S.user.uid && a.id !== u.id; });
  var now = Date.now(), wait = others.length ? 0 : now + ADMIN_WAIT_MS;
  try {
    await db.collection('adminRequests').add(Object.assign({ type: type, target: u.id, targetName: u.name, targetUser: u.username || '', payload: payload || {}, status: 'pending', approvals: [S.user.uid], waitUntil: wait, note: String(note || '').trim() }, stamp()));
    audit('admin_change_asked', 'user', u.id, REQ_TYPE[type] + ' · ' + u.name + (note ? ' · ' + note : ''));
    toast(wait ? 'Asked. With only two admins it goes through on ' + fmtDT(wait) + ' unless ' + (type === 'grant' ? 'someone' : u.name) + ' blocks it.' : 'Asked. It happens once another admin approves it.');
    return true;
  } catch (e) { fail(e); return false; }
}
async function approveReq(id) {
  var r = byId(S.data.adminReqs, id); if (!r) return;
  if (onHold()) return toast('Your password was reset, so you can approve admin changes from ' + fmtTime(holdEnds(S.me)) + ', or once another admin confirms the reset.', true);
  if (!(await ask({ title: 'Approve: ' + reqTitle(r) + '?', text: (r.note ? 'Reason given: ' + r.note + '\n\n' : '') + 'It happens as soon as you approve.', ok: 'Approve' }))) return;
  try {
    await db.collection('adminRequests').doc(id).update({ approvals: FV.arrayUnion(S.user.uid), approvedAt: Date.now() });
    audit('admin_change_approved', 'user', r.target, reqTitle(r));
    r = Object.assign({}, r, { approvals: (r.approvals || []).concat([S.user.uid]) });
    await carryOutReq(r);
  } catch (e) { fail(e); }
}
async function closeReq(id, status) {
  var r = byId(S.data.adminReqs, id); if (!r) return;
  var block = status === 'blocked';
  if (!(await ask({ title: (block ? 'Block: ' : 'Withdraw: ') + reqTitle(r) + '?', text: block ? 'It will not happen. Whoever asked can ask again.' : 'Nothing changes.', ok: block ? 'Block it' : 'Withdraw', danger: block }))) return;
  try {
    await db.collection('adminRequests').doc(id).update({ status: status, closedBy: S.user.uid, closedAt: Date.now() });
    audit(block ? 'admin_change_blocked' : 'admin_change_withdrawn', 'user', r.target, reqTitle(r)); toast(block ? 'Blocked' : 'Withdrawn');
  } catch (e) { fail(e); }
}
// Makes the change a ready request asked for, and closes the request in the same write
async function carryOutReq(r) {
  if (typeof r === 'string') r = byId(S.data.adminReqs, r);
  if (!r || !reqReady(r)) return;
  if (!adminListOr()) return;
  var u = byId(S.data.users, r.target); if (!u) return toast('That account is no longer there', true);
  var now = Date.now(), done = { status: 'done', closedBy: S.user.uid, closedAt: now }, p = r.payload || {}, list = S.adminList.slice();
  try {
    if (r.type === 'handover') {
      var newUid = await swapLogin(u, 'handover', p.name || u.name, p.phone || '', r.id);
      toast('Done. Send ' + (p.name || 'them') + ' their onboarding link.');
      setTimeout(function () { openOnboard(newUid); }, 300);
      return;
    }
    var b = db.batch(), d = { adminReq: r.id };
    if (r.type === 'grant') {
      d.roles = uniq((p.roles || u.roles || []).concat(['admin']));
      b.set(db.collection('meta').doc('admins'), { uids: uniq(list.concat([u.id])), added: u.id, removed: '', at: now });
    } else {
      if (p.deactivate) { d.active = false; d.endedReason = 'disabled'; d.endedAt = now; }
      else d.roles = (p.roles || u.roles || []).filter(function (x) { return x !== 'admin'; });
      b.set(db.collection('meta').doc('admins'), { uids: list.filter(function (x) { return x !== u.id; }), added: '', removed: u.id, at: now });
    }
    b.update(db.collection('users').doc(u.id), d);
    b.update(db.collection('adminRequests').doc(r.id), done);
    await b.commit();
    audit('admin_change_done', 'user', u.id, reqTitle(r));
    toast('Done: ' + reqTitle(r));
  } catch (e) { fail(e); }
}
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

/* ---------- Staff accounts: saving, resets and handovers with the two-admin rule ---------- */
async function saveStaff(id) {
  var roles = checkedRoles();
  if (id === S.user.uid && roles.indexOf('admin') < 0) roles.push('admin');
  if (!roles.length) return toast('Pick at least one role', true);
  var user = cleanUsername(val('sf-user'));
  if (!user) return toast('Choose a username (letters and numbers)', true);
  var wantAdmin = roles.indexOf('admin') >= 0, sole = isAdmin() && activeAdmins().length === 1;
  if (wantAdmin && sole && !adminListOr()) return;
  $('sf-save').disabled = true;
  try {
    if (id) {
      var u = byId(S.data.users, id), was = isActiveAdmin(u), off = !!$('sf-active') && !val('sf-active');
      var b = db.batch(), d = { name: val('sf-name'), phone: val('sf-phone') }, req = null;
      if (was && (off || !wantAdmin)) { d.roles = u.roles; req = ['remove', { deactivate: off, roles: roles }]; }
      else if (!was && wantAdmin && !off && u.active !== false) {
        if (sole) { d.roles = roles; b.set(db.collection('meta').doc('admins'), { uids: uniq(S.adminList.concat([id])), added: id, removed: '', at: Date.now() }); }
        else { d.roles = roles.filter(function (r) { return r !== 'admin'; }); if (!d.roles.length) d.roles = u.roles || []; req = ['grant', { roles: roles }]; }
      } else { d.roles = roles; if (off) { d.active = false; d.endedReason = 'disabled'; d.endedAt = Date.now(); } }
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
      audit('staff_updated', 'user', id, d.name + ' · ' + (d.roles || []).join(',') + (d.username ? ' · username @' + u.username + ' → @' + user : '') + (d.active === false ? ' · disabled' : ''));
      closeModal();
      if (req) await raiseAdminReq(req[0], Object.assign({}, u, { name: d.name }), req[1]);
      else toast(d.username ? 'Saved. New username: @' + user : 'Saved');
    } else {
      if ((await db.collection('usernames').doc(user).get()).exists) throw new Error('That username is already taken');
      var direct = wantAdmin && sole, stored = wantAdmin && !sole ? roles.filter(function (r) { return r !== 'admin'; }) : roles;
      var temp = randomCode(24), login = await createLogin(temp), now = Date.now(), b2 = db.batch();
      var code = inviteBatch(b2, login.uid, login.email, temp, user, val('sf-name'));
      b2.set(db.collection('users').doc(login.uid), { name: val('sf-name'), username: user, phone: val('sf-phone'), roles: stored, active: true, onboarded: false, inviteCode: code, createdAt: now, createdBy: S.user.uid });
      b2.set(db.collection('usernames').doc(user), { uid: login.uid, email: login.email, at: now });
      if (direct) b2.set(db.collection('meta').doc('admins'), { uids: uniq(S.adminList.concat([login.uid])), added: login.uid, removed: '', at: now });
      await b2.commit();
      audit('staff_added', 'user', login.uid, '@' + user + ' · ' + val('sf-name') + ' · ' + stored.join(','));
      closeModal();
      if (wantAdmin && !sole) await raiseAdminReq('grant', { id: login.uid, name: val('sf-name'), username: user }, { roles: roles });
      setTimeout(function () { openOnboard(login.uid); }, 300);
    }
  } catch (e) { if ($('sf-save')) $('sf-save').disabled = false; fail(e); }
}
async function saveHandover(id) {
  var old = byId(S.data.users, id), kind = radio('ho-kind'), name = kind === 'handover' ? val('ho-name') : old.name;
  if (!name) return toast("Enter the new holder's name", true);
  var phone = kind === 'handover' ? val('ho-phone') : (old.phone || '');
  if (isActiveAdmin(old) && kind === 'handover') { closeModal(); return raiseAdminReq('handover', old, { name: name, phone: phone }); }
  if (isActiveAdmin(old) && !adminListOr()) return;
  $('ho-save').disabled = true;
  try {
    var newUid = await swapLogin(old, kind, name, phone, '');
    closeModal();
    if (isActiveAdmin(old) && kind === 'password_reset') toast('Reset. The other admins are told, and this account cannot approve admin changes for 2 hours unless another admin confirms the reset.');
    setTimeout(function () { openOnboard(newUid); }, 300);
  } catch (e) { if ($('ho-save')) $('ho-save').disabled = false; fail(e); }
}
// A new login takes over the account (same username and roles); the old one stops working
async function swapLogin(old, kind, name, phone, reqId) {
  var wasAdmin = isActiveAdmin(old);
  var temp = randomCode(24), login = await createLogin(temp), now = Date.now(), b = db.batch();
  var code = inviteBatch(b, login.uid, login.email, temp, old.username, name);
  var nd = { name: name, username: old.username, phone: phone, roles: old.roles || [], active: true, onboarded: false, inviteCode: code, createdAt: now, createdBy: S.user.uid, previousUid: old.id, handoverAt: kind === 'handover' ? now : (old.handoverAt || old.createdAt || now) };
  if (wasAdmin) { nd.replaces = old.id; if (kind === 'password_reset') { nd.resetAt = now; nd.resetBy = S.user.uid; } }
  if (old.photo && kind === 'password_reset') nd.photo = old.photo;
  b.set(db.collection('users').doc(login.uid), nd);
  var od = { active: false, endedReason: kind, endedAt: now, handedOverTo: login.uid }; if (reqId) od.adminReq = reqId;
  b.update(db.collection('users').doc(old.id), od);
  b.set(db.collection('usernames').doc(old.username), { uid: login.uid, email: login.email, at: now });
  if (old.inviteCode) b.delete(db.collection('invites').doc(old.inviteCode));
  if (wasAdmin) b.set(db.collection('meta').doc('admins'), { uids: S.adminList.filter(function (x) { return x !== old.id; }).concat([login.uid]), added: login.uid, removed: old.id, at: now });
  if (reqId) b.update(db.collection('adminRequests').doc(reqId), { status: 'done', closedBy: S.user.uid, closedAt: now });
  await b.commit();
  audit(kind === 'handover' ? 'account_handover' : 'password_reset', 'user', login.uid, '@' + old.username + (kind === 'handover' ? ' from ' + old.name + ' to ' + name : ' · ' + old.name) + (wasAdmin ? ' · admin account' : ''));
  return login.uid;
}
async function confirmReset(id) {
  var u = byId(S.data.users, id); if (!u) return;
  if (!(await ask({ title: 'Confirm ' + u.name + "'s password reset?", text: 'Only confirm if you know this reset was genuine (for example you spoke to ' + u.name.split(' ')[0] + '). Their account can then approve admin changes straight away.', ok: 'Confirm reset' }))) return;
  try { await db.collection('users').doc(id).update({ resetConfirmed: true, resetConfirmedBy: S.user.uid, resetConfirmedAt: Date.now() }); audit('password_reset_confirmed', 'user', id, u.name); toast('Reset confirmed'); }
  catch (e) { fail(e); }
}
// The "Admin changes" card at the top of Admin settings → Staff
function adminChangesCard() {
  var me = S.user.uid, reqs = sortBy((S.data.adminReqs || []).filter(function (r) { return r.status === 'pending'; }), function (r) { return -r.at; });
  var held = activeAdmins().filter(function (u) { return onHold(u); });
  var h = '<div class="card"><h2>Admin changes</h2><p class="muted small">Making someone an admin, removing an admin and handing over an admin account each need two admins. With only two admins, a removal goes through after 3 days unless the other admin blocks it. While there is only one admin, they can make another admin on their own.</p>';
  if (onHold()) h += '<div class="note warn">Your password was reset. You can approve admin changes from ' + fmtTime(holdEnds(S.me)) + ', or as soon as another admin confirms the reset.</div>';
  held.forEach(function (u) {
    h += '<div class="list-row staff-row"><span class="main-t"><strong>' + esc(u.name) + ': password reset by ' + esc(userName(u.resetBy)) + '</strong><span>' + fmtDT(u.resetAt) + ' · cannot approve admin changes until ' + fmtTime(holdEnds(u)) + '</span></span>' +
      (u.id !== me && u.resetBy !== me ? '<button class="btn small primary" type="button" onclick="confirmReset(\'' + u.id + '\')">Confirm reset</button>' : '') + '</div>';
  });
  if (!reqs.length && !held.length) h += '<div class="muted">Nothing waiting.</div>';
  reqs.forEach(function (r) {
    var ready = reqReady(r), mine = r.by === me, approved = (r.approvals || []).indexOf(me) >= 0, aboutMe = r.target === me;
    var acts = '';
    if (ready) acts += '<button class="btn small primary" type="button" onclick="carryOutReq(\'' + r.id + '\')">Carry it out</button>';
    else if (!approved && !aboutMe) acts += '<button class="btn small primary" type="button" onclick="approveReq(\'' + r.id + '\')"' + (onHold() ? ' disabled title="Your password was just reset"' : '') + '>Approve</button>';
    if (!mine) acts += '<button class="btn small danger" type="button" onclick="closeReq(\'' + r.id + '\',\'blocked\')">Block</button>';
    else acts += '<button class="btn small" type="button" onclick="closeReq(\'' + r.id + '\',\'cancelled\')">Withdraw</button>';
    h += '<div class="list-row staff-row"><span class="main-t"><strong>' + esc(reqTitle(r)) + '</strong><span>' + esc(reqSub(r)) + '</span></span><span class="row">' + (ready ? pill('Ready', 'st-ready') : pill('Waiting', 'st-alert')) + acts + '</span></div>';
  });
  return h + '</div>';
}

/* ---------- Profile photos ---------- */
function avatar(u, big) {
  u = u || {};
  return '<span class="avatar' + (big ? ' big' : '') + (u.photo ? ' has-photo' : '') + '">' + (u.photo ? '<img src="' + esc(u.photo) + '" alt="">' : esc(initials(u.name))) + '</span>';
}
function pickMyPhoto() { var f = $('me-photo-file'); if (f) f.click(); }
function shrinkImage(file, size) {
  return new Promise(function (resolve, reject) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var c = document.createElement('canvas'), s = Math.min(img.width, img.height); c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a picture')); };
    img.src = url;
  });
}
async function setMyPhoto(input) {
  var file = input.files && input.files[0]; input.value = ''; if (!file) return;
  try {
    var data = await shrinkImage(file, 240);
    await db.collection('users').doc(S.user.uid).update({ photo: data, photoAt: Date.now() });
    toast('Photo saved');
  } catch (e) { fail(e); }
}
async function removeMyPhoto() {
  if (!(await ask({ title: 'Remove your photo?', text: 'Your initials show instead.', ok: 'Remove' }))) return;
  db.collection('users').doc(S.user.uid).update({ photo: '', photoAt: Date.now() }).catch(fail); toast('Photo removed');
}

/* ---------- The bell: what is waiting for this person ---------- */
function bellItems() {
  var out = [], me = S.user.uid, t = todayStr(), desk = has('manager', 'frontdesk');
  if (isAdmin()) {
    adminReqsForMe().forEach(function (r) { out.push({ lvl: 'bad', tag: 'ADMIN', t: reqTitle(r), s: reqReady(r) ? 'Ready to carry out' : reqSub(r), go: "go('admin',{tab:'staff'})" }); });
    activeAdmins().filter(function (u) { return onHold(u) && u.id !== me && u.resetBy !== me; }).forEach(function (u) { out.push({ lvl: 'amber', tag: 'RESET', t: 'Confirm ' + u.name + "'s password reset", s: 'Reset by ' + userName(u.resetBy) + ' · ' + fmtDT(u.resetAt), go: "go('admin',{tab:'staff'})" }); });
  }
  if (has('manager')) {
    var ownerOnly = ['PAYMENT', 'REFUND OK?', 'APPROVE', 'DISCOUNT', 'SETUP'];
    alerts().forEach(function (a) { if (isAdmin() || ownerOnly.indexOf(a.tag) < 0) out.push(a); });
  } else if (desk) {
    alerts().forEach(function (a) { if (['OVERSTAY', 'NO-SHOW?', 'OWES', 'REFUND'].indexOf(a.tag) >= 0) out.push(a); });
  }
  if (desk) {
    S.data.stays.filter(function (s) { return s.status === 'reserved' && s.checkInDate === t; }).forEach(function (s) { out.push({ lvl: 'grey', tag: 'ARRIVING', t: s.guestName + ' arrives today', s: 'Room ' + s.roomNo + (s.arrivalTime ? ' · around ' + s.arrivalTime : ''), go: "openStay('" + s.id + "')" }); });
    S.data.stays.filter(function (s) { return s.status === 'checked_in' && s.checkOutDate === t && !isOverstay(s); }).forEach(function (s) { out.push({ lvl: 'grey', tag: 'LEAVING', t: s.guestName + ' checks out today', s: 'Room ' + s.roomNo + ' · by ' + (S.settings.checkOutTime || ''), go: "openStay('" + s.id + "')" }); });
    S.data.tasks.filter(function (k) { return k.status === 'inspection'; }).forEach(function (k) { out.push({ lvl: 'amber', tag: 'INSPECT', t: 'Room ' + k.roomNo + ' waiting for inspection', s: (k.assigneeName || '') + ' finished cleaning', go: "go('task',{id:'" + k.id + "'})" }); });
    var hw = typeof handoverWaiting === 'function' && handoverWaiting();
    if (hw && !(typeof myOpenShift === 'function' && myOpenShift())) out.push({ lvl: 'amber', tag: 'SHIFT', t: 'Shift handover waiting', s: (hw.openedByName || '') + ' closed their shift', go: "go('shift')" });
  }
  S.data.tasks.filter(function (k) { return (k.status === 'todo' || k.status === 'in_progress') && (k.assignee === me || (!k.assignee && myRole('housekeeping'))); }).forEach(function (k) {
    out.push({ lvl: k.status === 'in_progress' ? 'amber' : 'grey', tag: 'CLEAN', t: 'Room ' + k.roomNo + ': ' + (k.title || (TASK_TYPE[k.type] ? TASK_TYPE[k.type][0] : 'Cleaning')), s: k.status === 'in_progress' ? 'Started ' + fmtTime(k.startedAt) : 'Not started' + (k.assignee ? ' · assigned to you' : ''), go: "go('task',{id:'" + k.id + "'})" });
  });
  openJobs().filter(function (j) { return j.assignee === me || (!j.assignee && myRole('maintenance')); }).forEach(function (j) {
    out.push({ lvl: 'grey', tag: 'REPAIR', t: j.title, s: (j.location || '') + ' · ' + (j.assignee === me ? 'assigned to you' : 'not assigned'), go: "openJob('" + j.id + "')" });
  });
  var seen = {};
  return out.filter(function (a) { var k = a.tag + '|' + a.t; if (seen[k]) return false; seen[k] = 1; a.key = k; return true; });
}
// Items the person has tapped leave the bell. Kept on this phone, per account. An item that goes away
// and later comes back (a new overstay, a new task for the same room) shows again.
function bellSeenKey() { return 'wiwe-bell-seen-' + (S.user ? S.user.uid : ''); }
function bellSeen() { try { return JSON.parse(localStorage.getItem(bellSeenKey()) || '{}') || {}; } catch (e) { return {}; } }
function bellSaveSeen(m) { try { localStorage.setItem(bellSeenKey(), JSON.stringify(m)); } catch (e) { } }
function bellMarkSeen(k) { var m = bellSeen(); m[k] = Date.now(); bellSaveSeen(m); paintBell(); }
function bellPending() {
  var all = bellItems(), m = bellSeen(), now = {}, changed = false;
  all.forEach(function (a) { now[a.key] = 1; });
  // forget what is no longer waiting, so it shows again if it comes back
  Object.keys(m).forEach(function (k) { if (!now[k]) { delete m[k]; changed = true; } });
  if (changed && all.length) bellSaveSeen(m);
  return { list: all.filter(function (a) { return !m[a.key]; }), cleared: all.filter(function (a) { return m[a.key]; }).length };
}
function bellShowAll() { bellSaveSeen({}); paintBell(); openBell(); }
function paintBell() {
  var b = $('bellBtn'); if (!b || !S.me) return;
  var n = bellPending().list.length;
  b.innerHTML = icon('bell', 20) + (n ? '<span class="bell-n">' + (n > 99 ? '99+' : n) + '</span>' : '');
  b.setAttribute('aria-label', n ? n + ' thing' + (n === 1 ? '' : 's') + ' waiting for you' : 'Nothing waiting for you');
  b.title = b.getAttribute('aria-label');
}
function openBell() {
  var p = bellPending(), list = p.list;
  openModal('Waiting for you', (list.length ? '<div class="muted mb-2">' + list.length + ' thing' + (list.length === 1 ? '' : 's') + ' for you to do or check. Tap one to open it; it then leaves this list.</div>' : '') +
    '<div class="bell-list">' + alertList(list) + '</div>' +
    (p.cleared ? '<div class="row between mt-2"><span class="muted small">' + p.cleared + ' opened item' + (p.cleared === 1 ? '' : 's') + ' hidden</span><button type="button" class="btn small" onclick="bellShowAll()">Show again</button></div>' : ''));
  // tag each row with its item so a tap knows which one to clear
  var rows = document.querySelectorAll('.bell-list .alert-item');
  list.forEach(function (a, i) { if (rows[i]) rows[i].dataset.k = a.key; });
  // Runs before the item's own action (capture), so the bell closes first and does not shut a window the item opens
  var box = document.querySelector('.bell-list');
  if (box) box.addEventListener('click', function (ev) {
    var el = ev.target.closest('.alert-item'); if (!el) return;
    if (el.dataset.k) bellMarkSeen(el.dataset.k);
    closeModal();
  }, true);
}

/* ---------- Manual: only the parts this account can use ---------- */
var MANUAL = [
  { id: 'start', t: 'Getting around', who: 'all', p: [
    'Home shows the parts of the app you can use. On a phone, the bar at the bottom has Home, your main page, the Do button for quick actions, and Me.',
    'The bell at the top shows what is waiting for you: tasks assigned to you and things that need your attention. Tap an item to open it; it then leaves the list on that phone. Show again at the bottom brings opened items back.',
    'Summary cards at the top of a page (the boxes with a number) open a list of what makes up that number.',
    'The app works without signal. Anything you record is saved on the phone and sent when the connection is back; the badge at the top says Synced when everything has gone through.'] },
  { id: 'me', t: 'Your account', who: 'all', p: [
    'Tap your name at the top (or Me on a phone) to open your account.',
    'Add a photo: tap your picture on the Me page and choose a photo. Others see it next to your name.',
    'Change password: Me → Change password. You need your current password.',
    'Forgot your password? Ask an admin. They make a new link for you, and you choose a new password.',
    'On the Me page you can also pick the colour scheme, dark mode, text size and which page the app opens on.'] },
  { id: 'board', t: 'Room board', who: ['manager', 'frontdesk'], p: [
    'Every room and its status: Ready, Occupied, Reserved, Cleaning, Inspection or Out of order. Use the filters or switch to the list view.',
    'Tap a room to see the guest, the next step for that room, and actions such as check in, check out or report a fault.'] },
  { id: 'checkin', t: 'Checking a guest in', who: ['manager', 'frontdesk'], p: [
    'Press + Check in guest (or Do → Check in guest). Pick the room or several rooms for a group, enter the guest details and dates.',
    'The nightly rate is set by the owner and cannot be changed at the desk. A discount needs a reason and waits for the owner to approve it.',
    'Take payment on the POS or by transfer first, then type the reference from the slip or transfer. A reference can only be used once.',
    'Take an ID number or a photo of the ID when the owner has made it required.'] },
  { id: 'reserve', t: 'Reservations', who: ['manager', 'frontdesk'], p: [
    'New reservation holds a room for future dates, with or without a deposit.',
    'Booking several rooms for one guest: tick each room. A Nights per room box appears, so one room can be booked for 3 nights and another for 1. The deposit is shared across the rooms by what each costs.',
    'If the guest has not arrived some hours after the expected time, the app flags a possible no-show: check them in or release the room.'] },
  { id: 'stay', t: 'During the stay and check-out', who: ['manager', 'frontdesk'], p: [
    'Open the stay from the room board or Stays to take more payments, extend, move to another room or send a receipt by WhatsApp.',
    'At check-out, count the room items on the checklist. Anything missing or damaged is recorded. Any balance owing stays on the guest\'s record.',
    'With a caution fee, check-out marks it for refund when nothing is missing, and a manager records the refund.'] },
  { id: 'pay', t: 'Payments', who: ['manager', 'frontdesk'], p: [
    'Payments you record show as Unconfirmed until the owner matches them to the POS settlement or the bank. That is normal.',
    'Refunds are recorded as money out and wait for the owner\'s approval.'] },
  { id: 'payadmin', t: 'Confirming payments (owner)', who: 'admin', p: [
    'Payments → To confirm lists staff payments not yet seen in the bank. Tap Seen in bank when the money is there, or Not received if it never arrived (that puts it back on the guest\'s balance and opens an incident).',
    'Confirm all is for when the POS settlement and bank statement show every one of them.',
    'Approve or reject refunds and discounts from the same place, or from the bell.'] },
  { id: 'shift', t: 'Shifts', who: ['manager', 'frontdesk'], p: [
    'Start a shift when you come on duty and close it when you leave. The next person accepts the handover so it is clear who was responsible for what.'] },
  { id: 'clean', t: 'Cleaning', who: ['manager', 'frontdesk', 'housekeeping'], p: [
    'Housekeeping lists the cleaning tasks. Tap Start cleaning on a room, tick each step on the checklist and add photos where asked.',
    'When you finish a turnover clean, the room goes to Inspection. Front desk or a manager checks it before it becomes Ready.',
    'If you find a Ready room that has been used with no guest booked, use Found used with no guest on that room.'] },
  { id: 'inspect', t: 'Inspecting a room', who: ['manager', 'frontdesk'], p: [
    'Open the task waiting for inspection. Walk into the room and check the bed, bathroom, floor, smell, and that everything works.',
    'Tap Passed to make the room Ready, or Send back with what needs fixing.'] },
  { id: 'laundry', t: 'Laundry', who: ['manager', 'frontdesk', 'housekeeping', 'maintenance'], p: [
    'Record each batch sent out with the number of each item. When it comes back, count it in; anything short is flagged as missing.'] },
  { id: 'fault', t: 'Reporting a fault', who: ['manager', 'frontdesk', 'housekeeping', 'maintenance'], p: [
    'Use Report an issue (on Home or under Do). Say where it is and what is wrong, and add a photo. If a room cannot be used, it goes Out of order.'] },
  { id: 'repairs', t: 'Repair jobs and equipment', who: ['manager', 'maintenance'], p: [
    'Maintenance lists open jobs. Assign a job, start it, and finish it with what was done and what it cost.',
    'A manager checks the repair before the job is closed.',
    'Equipment (generator, AC units, pumps) has a service schedule; the app reminds you when a service is due.',
    'When a room is fixed, use Back in service. It goes to cleaning first.'] },
  { id: 'sales', t: 'Selling items', who: ['manager', 'frontdesk'], p: [
    'Do → Record sale. Pick the item and quantity; the price is set by the manager. Stock goes down automatically.'] },
  { id: 'store', t: 'Store and stock', who: 'manager', p: [
    'Inventory lists supplies and items for sale. Add stock when deliveries arrive and set a reorder level for each item; low items are flagged.',
    'Managers set selling prices and can archive items no longer used.'] },
  { id: 'exp', t: 'Expenses', who: ['manager', 'frontdesk'], p: [
    'Record every expense with a photo of the receipt. Expenses above the owner\'s limit wait for approval.'] },
  { id: 'expadmin', t: 'Approving expenses (owner)', who: 'admin', p: [
    'Expenses waiting for approval show in the bell and on Expenses. Open one to approve or reject it.'] },
  { id: 'reports', t: 'Today and Reports', who: 'manager', p: [
    'Today shows the alerts and the day\'s money. Reports shows income, expenses, occupancy and who owes, by month. Tap any summary card to see what it is made of. Lists can be downloaded as a spreadsheet.'] },
  { id: 'incidents', t: 'Incidents', who: ['manager', 'frontdesk'], p: [
    'An incident records something that went wrong (money not received, damage, a complaint). A manager or the owner marks it resolved with what was done.'] },
  { id: 'adminset', t: 'Admin settings', who: 'admin', p: [
    'Only admins see Admin settings. General: caution fee, check-in and check-out times, the approval limit, cleaning checklists and laundry items.',
    'Rooms and rates: room types set the nightly rate and the items checked at check-out; rooms are the units on the board.',
    'Receipt: design the receipt guests receive. Activity log: who did what. Backup: download everything, and remove test records.'] },
  { id: 'staff', t: 'Staff accounts', who: 'admin', p: [
    'Staff → + Add account, then Onboard and send the person their link. They choose their own password.',
    'Forgot password or someone new takes over a job: Reset password / hand over makes a new link, and the old password stops working at once.',
    'Admin changes need two admins: making someone an admin, removing an admin (deactivating or taking the role away) and handing over an admin account. One admin asks, another approves, and it happens. The person it is about cannot approve it but can block it.',
    'With only two admins, a removal goes through after 3 days unless the other admin blocks it. While there is only one admin, they can make a second admin on their own.',
    'One admin can reset another admin\'s password. That account then cannot approve admin changes for 2 hours, unless a second admin confirms the reset (Staff → Confirm reset).'] }
];
function manualFor() {
  return MANUAL.filter(function (s) { return s.who === 'all' || (s.who === 'admin' ? isAdmin() : has.apply(null, typeof s.who === 'string' ? [s.who] : s.who)); });
}
VIEWS.manual = {
  title: 'How to use the app',
  eyebrow: function () { return 'Manual for ' + (S.me.roles || []).map(function (r) { return ROLES[r]; }).join(', '); },
  render: function () {
    var list = manualFor();
    return '<div class="manual"><div class="note">This shows only the parts of the app your account can use.</div>' +
      '<nav class="card manual-toc" aria-label="Contents"><h2>Contents</h2><ol>' + list.map(function (s) { return '<li><a href="#" onclick="event.preventDefault();var el=document.getElementById(\'man-' + s.id + '\');if(el){el.open=true;el.scrollIntoView({behavior:\'smooth\'})}">' + esc(s.t) + '</a></li>'; }).join('') + '</ol></nav>' +
      list.map(function (s, i) { return '<details class="card manual-sec" id="man-' + s.id + '"' + (i === 0 ? ' open' : '') + '><summary><h2>' + esc(s.t) + '</h2></summary><ul>' + s.p.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>'; }).join('') + '</div>';
  }
};
