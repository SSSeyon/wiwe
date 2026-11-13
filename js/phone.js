/* =========================================================
   PHONE HELPERS
   - Swipe left/right inside a section to move between its tabs
   - Pull down at the top of a page to refresh
   - Form drafts: what is typed into a pop-up form is kept on this
     device until the form is saved, so closing it by accident (or the
     phone locking) loses nothing. Photos and passwords are not kept.
   ========================================================= */

/* ---------- gestures ---------- */
(function () {
  var sx = 0, sy = 0, st = 0, swipeOk = false, pull = false, ptr = null;
  function phone() { return window.innerWidth <= 860 && $('modal').classList.contains('hidden') && S.me; }
  // Don't steal swipes from things that scroll sideways themselves (calendar, wide tables) or from form fields
  function scrollsSideways(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
      if (el.scrollWidth > el.clientWidth + 2) { var o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  }
  function ptrEl() {
    if (!ptr) { ptr = document.createElement('div'); ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true'); ptr.innerHTML = '<span class="ptr-ring">' + icon('download', 18) + '</span>'; document.body.appendChild(ptr); }
    return ptr;
  }
  document.addEventListener('touchstart', function (e) {
    if (!phone() || e.touches.length !== 1) { pull = swipeOk = false; return; }
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
    var tg = e.target.closest ? e.target : document.body;
    swipeOk = !!tg.closest('#view') && !scrollsSideways(tg);
    pull = window.scrollY <= 0 && !tg.closest('.quick-sheet,.bottom-bar,#corner,.theme-menu');
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!pull) return;
    var t = e.touches[0], dy = t.clientY - sy;
    if (dy <= 0 || Math.abs(t.clientX - sx) > dy || window.scrollY > 0) { if (ptr) { ptr.style.transform = ''; ptr.classList.remove('ready', 'show'); } return; }
    var d = Math.min(90, dy * 0.5), p = ptrEl();
    p.classList.add('show');
    p.style.transform = 'translate(-50%,' + d + 'px) rotate(' + Math.round(d * 3) + 'deg)';
    p.classList.toggle('ready', d >= 60);
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (pull && ptr) {
      if (ptr.classList.contains('ready')) {
        ptr.classList.remove('ready'); ptr.classList.add('spin');
        pullRefresh(function () { ptr.classList.remove('spin', 'show'); ptr.style.transform = ''; });
      } else { ptr.classList.remove('show'); ptr.style.transform = ''; }
    }
    pull = false;
    if (!swipeOk || !phone() || Date.now() - st > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    swipeTab(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
function swipeTab(dir) {
  var bar = document.querySelector('#view .tabs') || document.querySelector('#view .subtabs'); if (!bar) return;
  var list = Array.prototype.slice.call(bar.querySelectorAll('[role=tab]'));
  var cur = list.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
  var next = list[cur + dir]; if (!next) return;
  next.click();
  var v = $('view'); v.classList.remove('swipe-l', 'swipe-r'); void v.offsetWidth; v.classList.add(dir > 0 ? 'swipe-l' : 'swipe-r');
  setTimeout(function () { v.classList.remove('swipe-l', 'swipe-r'); }, 300);
}
function pullRefresh(done) {
  var p = [];
  if (window.db) p.push(db.enableNetwork().catch(function () {}));
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) p.push(navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }).catch(function () {}));
  Promise.all(p).then(function () {
    setTimeout(function () { render(); done(); toast(navigator.onLine ? 'Up to date' : 'You are offline. Showing the last saved data.'); }, 500);
  });
}

/* ---------- form drafts ---------- */
var DRAFT_TTL = 12 * 3600 * 1000;
function draftKey() { return 'wiwe_draft_' + (($('modalTitle') && $('modalTitle').textContent) || '').trim(); }
function draftFields(form) {
  return Array.prototype.filter.call(form.querySelectorAll('input,select,textarea'), function (el) {
    if (/^(password|file|hidden|submit|button)$/.test(el.type)) return false;
    return el.type === 'radio' ? !!el.name : !!el.id;
  });
}
function saveDraft() {
  var form = $('modalBody').querySelector('form'); if (!form || $('modal').classList.contains('hidden')) return;
  var d = {}, any = false;
  draftFields(form).forEach(function (el) {
    var auto = (el.getAttribute('oninput') || '').indexOf('dataset.touched') >= 0;
    if (auto && el.dataset.touched !== '1') return; // a pre-filled amount nobody has changed
    if (el.type === 'radio') { if (el.checked) d['r:' + el.name] = el.value; return; }
    if (el.type === 'checkbox') { d[el.id] = el.checked; if (el.checked !== el.defaultChecked) any = true; return; }
    d[el.id] = el.value;
    if (el.tagName === 'SELECT' ? el.selectedIndex > -1 && !el.options[el.selectedIndex].defaultSelected : el.value !== el.defaultValue) any = true;
  });
  try { if (any) localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), v: d })); } catch (e) {}
}
function clearDraft(key) { try { localStorage.removeItem(key || draftKey()); } catch (e) {} }
function restoreDraft() {
  var form = $('modalBody').querySelector('form'); if (!form) return;
  var key = draftKey(), raw = null;
  try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
  if (!raw || !raw.v) return;
  if (Date.now() - raw.at > DRAFT_TTL) return clearDraft(key);
  var fire = function (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  var changed = 0;
  draftFields(form).forEach(function (el) {
    if (el.type === 'radio') { if (raw.v['r:' + el.name] === el.value && !el.checked) { el.checked = true; fire(el); changed++; } return; }
    if (!(el.id in raw.v)) return;
    if (el.type === 'checkbox') { if (el.checked !== raw.v[el.id]) { el.checked = raw.v[el.id]; fire(el); changed++; } return; }
    if (el.value === raw.v[el.id]) return;
    var prev = el.value; el.value = raw.v[el.id];
    if (el.value !== raw.v[el.id]) { el.value = prev; return; } // a select option that no longer exists (e.g. the room is taken): keep what the form offered
    // fire the field's own handler (it may recalculate totals) but keep pre-filled amounts recalculating
    var auto = (el.getAttribute('oninput') || '').indexOf('dataset.touched') >= 0;
    fire(el); if (auto) el.dataset.touched = '1';
    changed++;
  });
  if (!changed) return;
  var n = document.createElement('div'); n.className = 'note draft-note';
  n.innerHTML = 'Brought back what was typed at ' + fmtTime(raw.at) + '. Photos need adding again. <button type="button" class="linkish" onclick="discardDraft(this)">Start empty</button>';
  form.insertBefore(n, form.firstChild);
}
function discardDraft(btn) {
  clearDraft();
  var form = btn.closest('form'); btn.closest('.draft-note').remove();
  if (form) { form.reset(); draftFields(form).forEach(function (el) { delete el.dataset.touched; el.dispatchEvent(new Event('input', { bubbles: true })); }); }
  toast('Form cleared');
}
(function () {
  var t = null, submitted = '';
  function later(e) { if (!e.isTrusted || !e.target.closest || !e.target.closest('#modalBody form')) return; submitted = ''; clearTimeout(t); t = setTimeout(saveDraft, 300); }
  document.addEventListener('input', later, true);
  document.addEventListener('change', later, true);
  document.addEventListener('submit', function (e) { if (e.target.closest && e.target.closest('#modalBody')) { clearTimeout(t); saveDraft(); submitted = draftKey(); } }, true);
  // Called by closeModal(): a save that worked closes the pop-up right after submitting, so its draft is dropped.
  // Any other close (Cancel, ×, tapping away, a mistake) keeps it for next time.
  window.draftOnClose = function () { clearTimeout(t); if (submitted && submitted === draftKey()) clearDraft(submitted); else saveDraft(); submitted = ''; };
})();
