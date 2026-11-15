/* =========================================================
   Receipts as a picture (PNG) or PDF, sent through the phone's share sheet
   (WhatsApp, etc). The look is set by the owner in Admin settings → Receipt.
   The figures come from rcptSums() / rcptEnd() in front.js.
   ========================================================= */
var RCPT_DEFAULT = { format: 'image', layout: 'classic', accent: '#161616', font: 'sans', logo: 'default', logoData: '', logoTint: false, name: '', address: 'Sowhe, Badagry', phone: '', footer: 'Thank you for staying with us.', showStaff: true, showRefs: true };
var RCPT_LAYOUTS = { classic: 'Classic', band: 'Colour header', minimal: 'Minimal' };
var RCPT_FONTS = { sans: 'Modern', serif: 'Classic serif', mono: 'Typewriter' };
var RCPT_SWATCHES = ['#161616', '#8A6A2E', '#1D7A5C', '#2A6CB8', '#A32D2D', '#6A5FC8', '#C2567E'];
var RCPT_W = 420, RCPT_SCALE = 3, RCPT_INK = '#161616', RCPT_GRAY = '#6b6b6b';

function rcptStyle(over) { var st = Object.assign({}, RCPT_DEFAULT, S.settings.receipt || {}, over || {}); if (!st.name) st.name = S.settings.businessName || 'Wiwe Apartments'; return st; }

/* ---------- What goes on the receipt ---------- */
function rcptModel(s, st) {
  var ss = receiptStays(s), m = rcptSums(ss);
  var first = ss.reduce(function (a, x) { return x.checkInDate < a ? x.checkInDate : a; }, ss[0].checkInDate);
  var nights = function (x) { return x.nights + ' night' + (x.nights > 1 ? 's' : ''); };
  var lines = ss.map(function (x) {
    return { l: 'Room ' + x.roomNo + (x.roomTypeName ? ' · ' + x.roomTypeName : ''), d: nights(x) + (stayRate(x) ? ' × ' + money(stayRate(x)) : '') + (m.multi ? ' · ' + fmtDate(x.checkInDate) + ' to ' + fmtDate(x.checkOutDate) : ''), a: money(stayRate(x) * (x.nights || 0)) };
  });
  if (m.disc) lines.push({ l: 'Discount', a: '−' + money(m.disc) });
  if (m.extras) lines.push({ l: 'Items added to the bill', a: money(m.extras) });
  var pays = m.pays.map(function (p) {
    return { l: fmtDate(p.at) + ' · ' + (PAY_KIND[p.kind] || p.kind) + (m.multi ? ' · Room ' + p.roomNo : ''), d: [PAY_LABEL[p.method] || p.method, st.showRefs && p.ref ? 'ref ' + p.ref : ''].filter(Boolean).join(' · '), a: money(p.amount) };
  });
  var notes = [];
  if (m.caution) notes.push('Refundable caution fee held: ' + money(m.caution));
  if (m.open) notes.push('Check-out is by ' + S.settings.checkOutTime + ' on ' + fmtDate(m.last) + '.');
  return {
    title: m.res ? 'Booking confirmation' : 'Receipt', no: 'No. ' + s.id.slice(-6).toUpperCase(), issued: fmtDT(Date.now()),
    meta: [['Guest', s.guestName], [m.multi ? 'Rooms' : 'Room', m.multi ? ss.map(function (x) { return x.roomNo; }).join(', ') : s.roomNo + (s.roomTypeName ? ' · ' + s.roomTypeName : '')], ['Arrival', fmtDate(first)], ['Departure', fmtDate(m.last) + ', by ' + S.settings.checkOutTime]],
    lines: lines, total: { l: m.res ? 'Stay cost' : 'Total', a: money(m.bill) },
    pays: pays, paid: pays.length ? money(sum(m.pays, function (p) { return p.amount; })) : '',
    end: rcptEnd(m), owe: !m.res && m.owe > 0, notes: notes, by: meName()
  };
}
// Made-up guest for the preview in Admin settings
function rcptSample(st) {
  var d = new Date(), day = function (n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return dateStr(x); };
  return {
    title: 'Receipt', no: 'No. A1B2C3', issued: fmtDT(Date.now()),
    meta: [['Guest', 'Adaeze Okafor'], ['Room', '104 · Standard'], ['Arrival', fmtDate(day(0))], ['Departure', fmtDate(day(2)) + ', by ' + S.settings.checkOutTime]],
    lines: [{ l: 'Room 104 · Standard', d: '2 nights × ₦30,000', a: '₦60,000' }, { l: 'Items added to the bill', a: '₦2,500' }],
    total: { l: 'Total', a: '₦62,500' },
    pays: [{ l: fmtDate(day(0)) + ' · Room payment', d: 'POS' + (st.showRefs ? ' · ref 004512' : ''), a: '₦62,500' }], paid: '₦62,500',
    end: 'Paid in full. Thank you.', owe: false, notes: ['Check-out is by ' + S.settings.checkOutTime + ' on ' + fmtDate(day(2)) + '.'], by: meName() || 'Front desk'
  };
}

/* ---------- Drawing ---------- */
function rcptRgb(hex) { var h = String(hex || '#161616').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rcptLum(hex) { var c = rcptRgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
function rcptTint(hex, a) { var c = rcptRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function rcptFontsOf(st) {
  if (st.font === 'serif') return { b: 'Georgia, "Times New Roman", serif', h: 'Georgia, "Times New Roman", serif' };
  if (st.font === 'mono') return { b: '"Courier New", Courier, monospace', h: '"Courier New", Courier, monospace' };
  return { b: 'Inter, system-ui, sans-serif', h: '"Space Grotesk", Inter, sans-serif' };
}
function rcptFontsReady(st) {
  if (st.font !== 'sans' || !document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all(['400 13px Inter', '600 13px Inter', '700 13px Inter', '700 15px "Space Grotesk"']
    .map(function (f) { return document.fonts.load(f).catch(function () {}); })).catch(function () {});
}
// The logo, optionally recoloured: dark parts take the colour, light parts become see-through (works for one-colour logos)
var rcptLogoCache = {};
function rcptLogo(st, color) {
  var src = st.logo === 'none' ? '' : st.logo === 'custom' && st.logoData ? st.logoData : 'img/logo.png';
  if (!src) return Promise.resolve(null);
  var key = src.length + ':' + src.slice(-40) + '|' + (color || '');
  if (rcptLogoCache[key]) return Promise.resolve(rcptLogoCache[key]);
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      if (!color) { rcptLogoCache[key] = img; return resolve(img); }
      try {
        var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0);
        var d = x.getImageData(0, 0, c.width, c.height), p = d.data, rgb = rcptRgb(color);
        for (var i = 0; i < p.length; i += 4) {
          var dark = 1 - (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
          p[i + 3] = Math.round(p[i + 3] * dark); p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2];
        }
        x.putImageData(d, 0, 0); rcptLogoCache[key] = c; resolve(c);
      } catch (e) { resolve(img); }
    };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}
// Paints the receipt on ctx (in 420-wide units) and returns its height
function rcptPaint(ctx, m, st, logo) {
  var F = rcptFontsOf(st), P = 26, X0 = P, X1 = RCPT_W - P, y = 0;
  var ac = st.accent, acText = rcptLum(ac) > 0.62 ? RCPT_INK : ac;
  var font = function (sz, w, head) { ctx.font = (w || 400) + ' ' + sz + 'px ' + (head ? F.h : F.b); };
  var text = function (t, x, yy, align, color) { ctx.textAlign = align || 'left'; ctx.fillStyle = color || RCPT_INK; ctx.fillText(t, x, yy); };
  var spaced = function (t, cx, yy, gap, color) { // centred, letter-spaced capitals
    t = t.toUpperCase(); var w = 0, i; for (i = 0; i < t.length; i++) w += ctx.measureText(t[i]).width + gap; w -= gap;
    var x = cx - w / 2; ctx.textAlign = 'left'; ctx.fillStyle = color; for (i = 0; i < t.length; i++) { ctx.fillText(t[i], x, yy); x += ctx.measureText(t[i]).width + gap; }
  };
  var wrap = function (t, maxW) {
    var words = String(t || '').split(' '), out = [], cur = '';
    words.forEach(function (w) { var test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxW && cur) { out.push(cur); cur = w; } else cur = test; });
    if (cur) out.push(cur); return out.length ? out : [''];
  };
  var rule = function (yy, color, wid, dash) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = wid; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(X0, yy); ctx.lineTo(X1, yy); ctx.stroke(); ctx.restore(); };
  var logoBox = function (img, maxW, maxH) { var r = Math.min(maxW / (img.width || img.naturalWidth), maxH / (img.height || img.naturalHeight)); return [(img.width || img.naturalWidth) * r, (img.height || img.naturalHeight) * r]; };

  /* header */
  if (st.layout === 'band') {
    var dark = rcptLum(ac) < 0.6, on = dark ? '#ffffff' : RCPT_INK, lb = logo ? logoBox(logo, 110, 92) : null;
    var bandH = 24 + (lb ? lb[1] + 14 : 30) + 16 + 18 + 18;
    ctx.fillStyle = ac; ctx.fillRect(0, 0, RCPT_W, bandH);
    y = 24;
    if (lb) { ctx.drawImage(logo, (RCPT_W - lb[0]) / 2, y, lb[0], lb[1]); y += lb[1] + 14; } else { font(22, 700, true); text(st.name, RCPT_W / 2, y + 22, 'center', on); y += 30; }
    font(12, 700, true); spaced(m.title, RCPT_W / 2, y + 12, 2.4, on); y += 16;
    font(11); text(m.no + ' · ' + m.issued, RCPT_W / 2, y + 14, 'center', dark ? 'rgba(255,255,255,.78)' : RCPT_GRAY);
    y = bandH + 8;
  } else if (st.layout === 'minimal') {
    y = 30; var top = y, left = y;
    if (logo) { var b = logoBox(logo, 84, 70); ctx.drawImage(logo, X0, y, b[0], b[1]); left = y + b[1]; } else { font(18, 700, true); text(st.name, X0, y + 18, 'left', RCPT_INK); left = y + 24; }
    font(18, 700, true); text(m.title, X1, top + 18, 'right', acText);
    font(11); text(m.no, X1, top + 36, 'right', RCPT_GRAY); text(m.issued, X1, top + 51, 'right', RCPT_GRAY);
    y = Math.max(left, top + 56) + 14; rule(y, '#dddddd', 1); y += 4;
  } else {
    y = 28;
    if (logo) { var c = logoBox(logo, 124, 104); ctx.drawImage(logo, (RCPT_W - c[0]) / 2, y, c[0], c[1]); y += c[1] + 14; } else { font(22, 700, true); text(st.name, RCPT_W / 2, y + 22, 'center', RCPT_INK); y += 32; }
    font(12, 700, true); spaced(m.title, RCPT_W / 2, y + 12, 2.4, acText); y += 18;
    font(11); text(m.no + ' · ' + m.issued, RCPT_W / 2, y + 13, 'center', RCPT_GRAY); y += 24;
    rule(y, ac, 2); y += 4;
  }

  /* guest, room, dates */
  y += 10;
  m.meta.forEach(function (r) {
    font(12); text(r[0], X0, y + 14, 'left', RCPT_GRAY);
    font(13, 600); var v = wrap(r[1], (X1 - X0) * 0.66);
    v.forEach(function (ln, i) { text(ln, X1, y + 14 + i * 17, 'right', RCPT_INK); });
    y += 6 + v.length * 17;
  });
  y += 8; rule(y, '#bbbbbb', 1, [4, 3]); y += 6;

  /* rows: label (+ small detail line) on the left, amount on the right */
  var row = function (r) {
    font(13, 600); var a = r.a, aw = ctx.measureText(a).width; text(a, X1, y + 17, 'right', RCPT_INK);
    font(13); var l = wrap(r.l, X1 - X0 - aw - 16); l.forEach(function (ln, i) { text(ln, X0, y + 17 + i * 17, 'left', RCPT_INK); });
    y += 6 + l.length * 17;
    if (r.d) { font(11); wrap(r.d, X1 - X0 - aw - 16).forEach(function (ln) { text(ln, X0, y + 12, 'left', RCPT_GRAY); y += 15; }); }
    y += 5;
  };
  m.lines.forEach(function (r, i) { if (i) rule(y, '#e6e6e6', 1, [3, 3]); row(r); });
  rule(y + 2, ac, 2); y += 6;
  font(15, 700, true); text(m.total.l, X0, y + 20, 'left', RCPT_INK); text(m.total.a, X1, y + 20, 'right', RCPT_INK); y += 32;

  if (m.pays.length) {
    y += 8; font(10, 700); text('PAYMENTS', X0, y + 10, 'left', RCPT_GRAY); y += 16;
    rule(y, '#dddddd', 1); y += 2;
    m.pays.forEach(function (r, i) { if (i) rule(y, '#e6e6e6', 1, [3, 3]); row(r); });
    if (m.pays.length > 1) { rule(y, '#dddddd', 1); font(13, 700); text('Paid', X0, y + 19, 'left', RCPT_INK); text(m.paid, X1, y + 19, 'right', RCPT_INK); y += 28; }
  }

  /* how it stands */
  y += 12;
  font(13, 700); var e = wrap(m.end, X1 - X0 - 28);
  font(12); var n = []; m.notes.forEach(function (t) { n = n.concat(wrap(t, X1 - X0 - 28)); });
  var boxH = 14 + e.length * 18 + n.length * 16 + 10;
  var fill = m.owe ? 'rgba(163,45,45,.09)' : rcptTint(rcptLum(ac) > 0.85 ? '#161616' : ac, 0.08);
  ctx.fillStyle = fill; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(X0, y, X1 - X0, boxH, 10); ctx.fill(); } else ctx.fillRect(X0, y, X1 - X0, boxH);
  var yy = y + 14;
  font(13, 700); e.forEach(function (ln) { text(ln, X0 + 14, yy + 12, 'left', m.owe ? '#A32D2D' : RCPT_INK); yy += 18; });
  font(12); n.forEach(function (ln) { text(ln, X0 + 14, yy + 11, 'left', '#3a3a3a'); yy += 16; });
  y += boxH;

  /* footer */
  y += 22;
  if (st.footer) { font(13, 600, true); wrap(st.footer, X1 - X0).forEach(function (ln) { text(ln, RCPT_W / 2, y + 12, 'center', acText); y += 18; }); y += 4; }
  font(11); wrap([st.name, st.address, st.phone].filter(Boolean).join(' · '), X1 - X0).forEach(function (ln) { text(ln, RCPT_W / 2, y + 11, 'center', RCPT_GRAY); y += 15; });
  if (st.showStaff && m.by) { text('Issued by ' + m.by, RCPT_W / 2, y + 11, 'center', RCPT_GRAY); y += 15; }
  y += 22;
  if (st.layout === 'band') { ctx.fillStyle = ac; ctx.fillRect(0, y - 6, RCPT_W, 6); }
  return y;
}
async function rcptCanvas(m, st) {
  await rcptFontsReady(st);
  var tint = st.layout === 'band' ? (rcptLum(st.accent) < 0.6 ? '#ffffff' : '') : (st.logoTint ? st.accent : '');
  var logo = await rcptLogo(st, tint);
  var probe = document.createElement('canvas'); probe.width = RCPT_W; probe.height = 10;
  var h = Math.ceil(rcptPaint(probe.getContext('2d'), m, st, logo));
  var c = document.createElement('canvas'); c.width = RCPT_W * RCPT_SCALE; c.height = h * RCPT_SCALE;
  var ctx = c.getContext('2d'); ctx.scale(RCPT_SCALE, RCPT_SCALE); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, RCPT_W, h);
  rcptPaint(ctx, m, st, logo);
  return c;
}

/* ---------- PDF: one page holding the picture (no library needed) ---------- */
function rcptPdf(jpegDataUrl, w, h) {
  var bin = atob(jpegDataUrl.split(',')[1]), img = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
  var pw = 297.64, ph = Math.round(pw * h / w * 100) / 100; // 105 mm wide, as tall as the receipt
  var parts = [], len = 0, offs = [];
  var add = function (x) { if (typeof x === 'string') { var u = new Uint8Array(x.length); for (var j = 0; j < x.length; j++) u[j] = x.charCodeAt(j) & 255; x = u; } parts.push(x); len += x.length; };
  var obj = function (n, body) { offs[n] = len; add(n + ' 0 obj\n' + body + '\nendobj\n'); };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offs[4] = len; add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n'); add(img); add('\nendstream\nendobj\n');
  var draw = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
  obj(5, '<< /Length ' + draw.length + ' >>\nstream\n' + draw + '\nendstream');
  var xref = len, t = 'xref\n0 6\n0000000000 65535 f \n';
  for (var k = 1; k <= 5; k++) t += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
  add(t + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
function rcptBlob(c, type, q) { return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('Could not make the picture')); }, type, q); }); }
async function rcptFiles(m, st, base) {
  var c = await rcptCanvas(m, st);
  var png = await rcptBlob(c, 'image/png');
  var pdf = rcptPdf(c.toDataURL('image/jpeg', 0.92), c.width, c.height);
  return { canvas: c, image: new File([png], base + '.png', { type: 'image/png' }), pdf: new File([pdf], base + '.pdf', { type: 'application/pdf' }) };
}

/* ---------- The receipt window ---------- */
function guestWa(s) { return String(s.phone || '').replace(/\D/g, '').replace(/^0/, '234'); }
function openReceipt(id) {
  var s = findStay(id); if (!s) return;
  var st = rcptStyle(), m = rcptModel(s, st), other = st.format === 'pdf' ? 'image' : 'pdf';
  var base = (st.name + ' ' + (m.title === 'Receipt' ? 'receipt' : 'booking') + ' ' + s.guestName + ' ' + m.no.slice(4)).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  S.rcpt = { id: id, files: null, text: receiptText(s), phone: guestWa(s), name: s.guestName };
  openModal('Receipt · ' + s.guestName, '<div class="rcpt-img" id="rcpt-img">' + skeleton(8) + '</div>' +
    '<div class="row no-print rcpt-acts">' +
    '<button class="btn primary" type="button" data-rc disabled onclick="sendReceipt(\'' + st.format + '\')">' + icon('share', 16) + 'Send ' + (st.format === 'pdf' ? 'PDF' : 'picture') + '</button>' +
    '<button class="btn" type="button" data-rc disabled onclick="sendReceipt(\'' + other + '\')">Send as ' + (other === 'pdf' ? 'PDF' : 'picture') + '</button>' +
    '<button class="btn" type="button" data-rc disabled onclick="saveReceipt()">' + icon('download', 16) + 'Save</button>' +
    '<button class="btn" type="button" onclick="printReceipt()">' + icon('printer', 16) + 'Print</button>' +
    '<button class="btn" type="button" onclick="sendReceiptText()">Send as text</button>' +
    '<button class="btn" type="button" onclick="openStay(\'' + s.id + '\')">Back</button></div>' +
    '<p class="muted small no-print">Send opens your phone\'s share menu: pick WhatsApp, then the guest. On the laptop, use Save and attach the file in WhatsApp.</p>');
  rcptFiles(m, st, base).then(function (f) {
    if (!S.rcpt || S.rcpt.id !== id || !$('rcpt-img')) return;
    S.rcpt.files = f;
    $('rcpt-img').innerHTML = '<img alt="Receipt for ' + esc(s.guestName) + '" src="' + URL.createObjectURL(f.image) + '">';
    document.querySelectorAll('[data-rc]').forEach(function (b) { b.disabled = false; });
  }).catch(function (e) {
    console.error(e);
    if ($('rcpt-img')) $('rcpt-img').innerHTML = '<div class="note warn">Could not draw the receipt on this device. Use Send as text.</div>';
  });
}
// Must run straight from the tap: the share menu only opens from a user's tap, so the files are made beforehand
function sendReceipt(fmt) {
  var r = S.rcpt; if (!r || !r.files) return;
  var f = r.files[fmt], data = { files: [f], title: f.name };
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    navigator.share(data).then(function () { audit('receipt_sent', 'stays', r.id, fmt); }).catch(function (e) { if (e && e.name !== 'AbortError') { toast('Could not open the share menu. Saving the file instead.', true); saveReceipt(); } });
    return;
  }
  saveReceipt();
  ask({ title: 'Receipt saved', text: 'This device can\'t send files straight to WhatsApp. The ' + (fmt === 'pdf' ? 'PDF' : 'picture') + ' is in your downloads: open the guest\'s chat and attach it.', ok: 'Open WhatsApp chat', cancel: 'Close' }).then(function (go) {
    if (go) window.open('https://wa.me/' + r.phone + '?text=' + encodeURIComponent('Hello ' + r.name + ', here is your receipt from ' + rcptStyle().name + '.'), '_blank', 'noopener');
  });
}
function saveReceipt() {
  var r = S.rcpt; if (!r || !r.files) return;
  var f = r.files[rcptStyle().format] || r.files.image, a = document.createElement('a');
  a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
function sendReceiptText() { var r = S.rcpt; if (r) window.open('https://wa.me/' + r.phone + '?text=' + encodeURIComponent(r.text), '_blank', 'noopener'); }
// Prints only the receipt, not the page behind it
function printReceipt() {
  document.body.classList.add('print-modal');
  var done = function () { document.body.classList.remove('print-modal'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500);
}

/* ---------- Admin settings → Receipt ---------- */
function adminReceipt() {
  var st = rcptStyle(); S.rdLogo = st.logoData || '';
  var opt = function (o, cur) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
  var radios = function (name, o, cur) { return '<div class="seg rd-seg" role="radiogroup">' + Object.keys(o).map(function (k) { return '<label class="seg-opt"><input type="radio" name="' + name + '" value="' + k + '"' + (k === cur ? ' checked' : '') + '><span>' + esc(o[k]) + '</span></label>'; }).join('') + '</div>'; };
  return '<div class="rd-wrap"><form class="form rd-form" oninput="rdChanged()" onchange="rdChanged()" onsubmit="event.preventDefault();saveReceiptStyle()">' +
    '<div class="card"><h2>Sending</h2><div class="fields">' +
    field('Send receipts as', '<select id="rd-format">' + opt({ image: 'Picture (PNG)', pdf: 'PDF' }, st.format) + '</select>', '', 'Staff can still pick the other one each time') + '</div></div>' +
    '<div class="card"><h2>Look</h2><div class="fields">' +
    '<div class="field span-all">Layout' + radios('rd-layout', RCPT_LAYOUTS, st.layout) + '</div>' +
    '<div class="field span-all">Colour<div class="row rd-swatches">' + RCPT_SWATCHES.map(function (c) { return '<button type="button" class="rd-sw" style="background:' + c + '" aria-label="Use colour ' + c + '" onclick="$(\'rd-accent\').value=\'' + c + '\';rdChanged()"></button>'; }).join('') +
    '<input type="color" id="rd-accent" value="' + esc(st.accent) + '" aria-label="Pick any colour"></div></div>' +
    '<div class="field span-all">Lettering' + radios('rd-font', RCPT_FONTS, st.font) + '</div>' +
    '<div class="field span-all">Logo' + radios('rd-logo', { default: 'Wiwe logo', custom: 'My own picture', none: 'No logo' }, st.logo) +
    '<div class="row"><button class="btn small" type="button" onclick="rdPickLogo()">' + icon('camera', 15) + 'Choose a logo picture</button><span class="muted small" id="rd-logo-note">' + (st.logoData ? 'Your picture is saved' : 'PNG with a clear background looks best') + '</span></div>' +
    '<label class="check"><input type="checkbox" id="rd-tint"' + (st.logoTint ? ' checked' : '') + '>Colour the logo with the colour above</label></div>' +
    '</div></div>' +
    '<div class="card"><h2>Words</h2><div class="fields">' +
    field('Business name', input('rd-name', st.name)) + field('Address', input('rd-address', st.address)) +
    field('Phone', input('rd-phone', st.phone, 'inputmode="tel"')) + field('Thank-you line', input('rd-footer', st.footer), '', 'Shown under the totals. Leave empty for none.') +
    '<label class="check span-all"><input type="checkbox" id="rd-staff"' + (st.showStaff ? ' checked' : '') + '>Show who issued the receipt</label>' +
    '<label class="check span-all"><input type="checkbox" id="rd-refs"' + (st.showRefs ? ' checked' : '') + '>Show POS / transfer reference numbers</label>' +
    '</div></div>' +
    '<div class="form-actions"><button class="btn" type="button" onclick="rdReset()">Back to the default look</button><button class="btn primary" type="submit">Save receipt design</button></div></form>' +
    '<div class="card rd-prev-card"><h2>Preview</h2><div class="rcpt-img" id="rd-prev">' + skeleton(8) + '</div><span class="muted small">A made-up guest, to show the look.</span></div></div>';
}
function rdRead() {
  var radio = function (n) { var el = document.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ''; };
  return { format: val('rd-format'), layout: radio('rd-layout'), accent: val('rd-accent') || '#161616', font: radio('rd-font'), logo: radio('rd-logo'), logoData: S.rdLogo || '', logoTint: val('rd-tint'), name: val('rd-name'), address: val('rd-address'), phone: val('rd-phone'), footer: val('rd-footer'), showStaff: val('rd-staff'), showRefs: val('rd-refs') };
}
var rdTimer = null;
function rdChanged() { clearTimeout(rdTimer); rdTimer = setTimeout(rdPreview, 200); }
function rdPreview() {
  if (!$('rd-prev')) return;
  var st = Object.assign({}, RCPT_DEFAULT, rdRead()); if (!st.name) st.name = S.settings.businessName || 'Wiwe Apartments';
  if (st.logo === 'custom' && !st.logoData) st.logo = 'default';
  rcptCanvas(rcptSample(st), st).then(function (c) { if ($('rd-prev')) $('rd-prev').innerHTML = '<img alt="Receipt preview" src="' + c.toDataURL('image/png') + '">'; });
}
// A logo picture, shrunk and kept in the settings (max ~200 KB)
function rdPickLogo() {
  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = function () {
    var file = inp.files && inp.files[0]; if (!file) return;
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var r = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      var d = c.toDataURL('image/png');
      if (d.length > 270000) { var x = document.createElement('canvas'); x.width = c.width; x.height = c.height; var g = x.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, x.width, x.height); g.drawImage(c, 0, 0); d = x.toDataURL('image/jpeg', 0.85); }
      S.rdLogo = d; viewDirty = true;
      var radio = document.querySelector('input[name="rd-logo"][value="custom"]'); if (radio) radio.checked = true;
      $('rd-logo-note').textContent = 'New picture chosen. Save to keep it.'; rdPreview();
    };
    img.onerror = function () { toast('That file is not a picture', true); };
    img.src = url;
  };
  inp.click();
}
async function rdReset() {
  if (!(await ask({ title: 'Back to the default look?', text: 'Layout, colour, lettering and logo go back to the default. Your business name, address and phone stay.', ok: 'Reset look' }))) return;
  var keep = rdRead(); S.settings.receipt = Object.assign({}, RCPT_DEFAULT, { name: keep.name, address: keep.address, phone: keep.phone, footer: keep.footer, format: keep.format });
  render(); setTimeout(rdPreview, 0); viewDirty = true;
}
function saveReceiptStyle() {
  var d = rdRead(); if (d.logo === 'custom' && !d.logoData) d.logo = 'default';
  viewDirty = false;
  db.collection('settings').doc('general').set({ receipt: d }, { merge: true }).catch(fail);
  audit('settings_saved', 'settings', 'general', 'receipt design'); toast('Receipt design saved');
}
