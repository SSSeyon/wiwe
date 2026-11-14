/* =========================================================
   ROOM BOARD: the Wiwe block seen from the road, or a plain list
   Each floor is a band. The windows are replaced by room tiles:
   - front row (lower): Room 1 left and Room 2 right of the arched
     balcony bay (the entrance on the ground floor)
   - back row (raised behind them): Rooms 3, 4 and 5, left to right
   Rooms map to positions 1–5 by their order within the floor
   (Admin settings → Rooms → Floor and Position).
   Each tile shows the room number, who is in it (or its status) and,
   for a guest, the day they leave, with a badge when they owe money,
   are due out today or have overstayed.
   Tapping a colour in the key shows only the rooms in that state.
   Colours come from the --t-* tokens in styles.css.
   ========================================================= */
var BP = { focus: null, scrolled: null, filter: null, view: null };
var BP_WHERE = ['front left, beside the entrance', 'front right, beside the entrance', 'back row, left', 'back row, middle', 'back row, right'];
var BP_INK = '#161616', BP_WALL = '#F3E2A9';
var BP_STATES = [['ready', 'Ready'], ['occupied', 'Occupied'], ['reserved', 'Reserved today'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning / inspection'], ['ooo', 'Out of order']];

function bpFloorCount() { var m = 2; roomsSorted().forEach(function (r) { m = Math.max(m, roomFloor(r)); }); return m + 1; }
function bpByFloor() { var by = {}; roomsSorted().forEach(function (r) { var f = roomFloor(r); (by[f] = by[f] || []).push(r); }); return by; }
function bpPlace(room) { var f = roomFloor(room), same = bpByFloor()[f] || []; return { floor: f, pos: same.indexOf(room) }; }
function roomWhere(room) { var p = bpPlace(room); return floorName(p.floor) + (BP_WHERE[p.pos] ? ', ' + BP_WHERE[p.pos] : ''); }
function bpTxt(x, y, s, size, cls, weight, anchor, extra) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" class="' + (cls || '') + '" font-weight="' + (weight || 600) + '" text-anchor="' + (anchor || 'start') + '"' + (extra || '') + '>' + esc(s) + '</text>'; }
function bpCut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function bpGroup(st) { return st === 'inspect' ? 'cleaning' : st; }

/* What a room needs flagged, most urgent first */
function roomFlags(r) {
  var s = stayOf(r), out = [];
  if (!s || displayStatus(r) !== 'occupied') return out;
  if (isOverstay(s)) out.push('Overstay'); else if (dueOutToday(s)) out.push('Due out');
  if ((s.balance || 0) > 0) out.push('Owes ' + money(s.balance));
  return out;
}
/* The short line under the room number */
function roomLine(r, short) {
  var st = displayStatus(r), s = stayOf(r);
  if (st === 'occupied' && s) return s.guestName.split(' ')[0] + (dueOutToday(s) ? ' · out today' : ' · to ' + (short ? DOW[parseDate(s.checkOutDate).getDay()] : fmtDate(s.checkOutDate)));
  if (st === 'reserved') { var rv = reservationToday(r); return rv ? rv.guestName.split(' ')[0] + (rv.arrivalTime ? ' · ' + rv.arrivalTime : '') : 'Reserved'; }
  if (st === 'ooo') return r.oooReason ? 'Repair: ' + r.oooReason : 'Out of order';
  if (st === 'cleaning') { var tk = S.data.tasks.find(function (t) { return t.roomId === r.id && t.status === 'in_progress'; }); return tk && tk.assigneeName ? 'Cleaning · ' + tk.assigneeName.split(' ')[0] : 'Cleaning'; }
  if (st === 'inspect') return 'Needs inspection';
  return ROOM_STATUS[st].label;
}
function bpMatch(r) {
  if (!BP.filter) return true;
  if (BP.filter === 'attn') return roomFlags(r).length > 0;
  return bpGroup(displayStatus(r)) === BP.filter;
}

// Small cooking pot: the room has a kitchen
function bpPot(x, y, s) {
  return '<g aria-hidden="true" class="tx" opacity=".9"><rect x="' + x + '" y="' + (y + s * 0.35) + '" width="' + s + '" height="' + s * 0.55 + '" rx="' + s * 0.12 + '"/>' +
    '<rect x="' + (x - s * 0.18) + '" y="' + (y + s * 0.42) + '" width="' + s * 1.36 + '" height="' + s * 0.1 + '" rx="' + s * 0.05 + '"/>' +
    '<rect x="' + (x + s * 0.38) + '" y="' + (y + s * 0.18) + '" width="' + s * 0.24 + '" height="' + s * 0.14 + '" rx="' + s * 0.05 + '"/></g>';
}
// One room tile. front = the bigger, lower row
function bpTile(r, x, y, w, h, front) {
  if (!r) return '<rect class="bp-empty" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" stroke-width="1.5" stroke-dasharray="4 3"/>';
  var st = displayStatus(r), stay = stayOf(r), flags = roomFlags(r), kit = !!roomType(r).hasKitchen, line = roomLine(r, true);
  var aria = 'Room ' + r.number + ', ' + ROOM_STATUS[st].label + (stay && st === 'occupied' ? ', ' + stay.guestName + ', leaves ' + fmtDate(stay.checkOutDate) : '') + (flags.length ? ', ' + flags.join(', ') : '') + ', ' + roomWhere(r);
  var s = '<g id="bp-' + r.id + '" data-st="' + st + '" role="button" tabindex="0" class="bp-room' + (bpMatch(r) ? '' : ' dim') + '" aria-label="' + esc(aria) + '"' +
    ' onclick="openRoom(\'' + r.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRoom(\'' + r.id + '\')}">' +
    '<title>' + esc(aria) + '</title>';
  s += '<rect class="tl" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (front ? 6 : 5) + '" stroke="rgba(22,22,22,.18)" stroke-width=".6"/>';
  var nSize = front ? 15 : 12, pad = front ? 6 : 5;
  s += bpTxt(x + pad, y + (front ? 15 : 12), r.number, nSize, 'tx', 700);
  if (kit) s += bpPot(x + pad + String(r.number).length * nSize * 0.6 + 3, y + (front ? 5 : 3), front ? 9 : 7.5);
  s += bpTxt(x + pad, y + h - (front ? 6 : 5), bpCut(line, front ? 17 : 14), front ? 8.5 : 7, 'tx', 600);
  if (flags.length) {
    var label = flags[0].indexOf('Owes') === 0 ? 'Owes' : flags[0], fs = front ? 6.5 : 6, bw = label.length * fs * 0.62 + 7, bh = fs + 4;
    s += '<rect class="bdg" x="' + (x + w - bw - 3) + '" y="' + (y + 3) + '" width="' + bw + '" height="' + bh + '" rx="' + bh / 2 + '"/>' +
      bpTxt(x + w - bw / 2 - 3, y + 3 + bh - 3, label, fs, 'bdg-t', 700, 'middle');
  }
  if (BP.focus === r.id) s += '<rect class="bp-focus" x="' + (x - 3) + '" y="' + (y - 3) + '" width="' + (w + 6) + '" height="' + (h + 6) + '" rx="8" fill="none" stroke-width="3"/>';
  return s + '</g>';
}

function bpBuilding(by, nf) {
  var FH = 76, top = 42, H = top + nf * FH;
  var s = '<svg class="bp-svg" viewBox="-14 -2 328 ' + (H + 20) + '" role="group" aria-label="The Wiwe building seen from the road. Each floor shows its front rooms low and its back rooms raised behind them.">';
  s += '<polygon points="18,37 282,37 238,8 62,8" fill="#5B3527"/>';
  s += '<rect x="12" y="34" width="276" height="' + (top - 34 + 2) + '" fill="' + BP_WALL + '"/><rect x="8" y="31" width="284" height="5" fill="#3A3A3A"/>';
  s += '<rect x="12" y="' + top + '" width="276" height="' + (nf * FH) + '" fill="' + BP_WALL + '"/>';
  [12, 282].forEach(function (x) { s += '<rect x="' + x + '" y="' + top + '" width="5" height="' + (nf * FH) + '" fill="#FFFFFF" opacity=".9"/>'; });
  for (var f = nf - 1; f >= 0; f--) {
    var y = top + (nf - 1 - f) * FH, rs = by[f] || [];
    // back row: raised, a little narrower, each one centred over the front tile below it; the middle one over the entrance bay
    s += bpTile(rs[2], 40, y + 4, 64, 30, false) + bpTile(rs[3], 118, y + 4, 64, 30, false) + bpTile(rs[4], 196, y + 4, 64, 30, false);
    // arched balcony bay (entrance on the ground floor)
    s += '<rect x="119" y="' + (y + 38) + '" width="62" height="' + (FH - 41) + '" fill="#E9D79B"/>';
    s += '<path d="M126 ' + (y + FH - 4) + ' L126 ' + (y + 50) + ' Q150 ' + (y + 37) + ' 174 ' + (y + 50) + ' L174 ' + (y + FH - 4) + ' Z" fill="#6E5C3A"/>';
    if (f === 0) s += '<rect x="136" y="' + (y + 49) + '" width="11" height="' + (FH - 53) + '" fill="#2B211B"/><rect x="154" y="' + (y + 51) + '" width="10" height="8" fill="#3F8F7F" stroke="#FFF" stroke-width="1.2"/>';
    else { s += '<rect x="126" y="' + (y + FH - 13) + '" width="48" height="2" fill="' + BP_INK + '"/>'; for (var b = 0; b < 8; b++) s += '<rect x="' + (128.5 + b * 6) + '" y="' + (y + FH - 12) + '" width="1.3" height="8" fill="' + BP_INK + '"/>'; }
    // front row: lower, bigger
    s += bpTile(rs[0], 33, y + 37, 78, FH - 41, true) + bpTile(rs[1], 189, y + 37, 78, FH - 41, true);
    // floor line and label
    s += '<rect x="12" y="' + (y + FH - 3) + '" width="276" height="3" fill="#D9BF72"/>';
    s += '<text x="2" y="' + (y + FH / 2 + 4) + '" font-size="11" fill="#7D7663" font-weight="700" text-anchor="end" font-family="Space Grotesk, Inter, sans-serif">' + (f === 0 ? 'G' : f) + '</text>';
  }
  s += '<rect x="6" y="' + H + '" width="288" height="6" fill="#D9BF72"/>';
  s += '<rect x="114" y="' + (H + 3) + '" width="72" height="11" rx="3" fill="' + BP_INK + '"/><text x="150" y="' + (H + 11.5) + '" font-size="8" fill="#F4E6B8" font-weight="700" text-anchor="middle" letter-spacing="1" font-family="Space Grotesk, Inter, sans-serif">ENTRANCE</text>';
  return s + '</svg>';
}

/* The same rooms as a plain list, floor by floor (easier on small phones and with a screen reader) */
function roomListHtml() {
  var rooms = roomsSorted().filter(bpMatch);
  if (!rooms.length) return emptyState('building', 'No rooms in this state', 'Tap the colour again to show every room.', 'Show all rooms', "bpFilter('')");
  rooms = sortBy(rooms, function (r) { var p = bpPlace(r); return p.floor * 10 + p.pos; });
  return '<div class="card room-list" role="list">' + rooms.map(function (r) {
    var st = displayStatus(r), flags = roomFlags(r), p = bpPlace(r);
    return '<button type="button" role="listitem" class="rl-row" data-st="' + st + '" onclick="openRoom(\'' + r.id + '\')">' +
      '<span class="rl-no">' + esc(r.number) + '<small>' + esc(p.floor === 0 ? 'Ground' : floorName(p.floor).replace(' floor', '')) + '</small></span>' +
      '<span class="rl-main"><strong>' + esc(roomLine(r)) + '</strong><span>' + esc(ROOM_STATUS[st].label + ' · ' + roomType(r).name) + '</span></span>' +
      '<span class="rl-side">' + flags.map(function (f) { return '<span class="tagb">' + esc(f) + '</span>'; }).join('') + '</span></button>';
  }).join('') + '</div>';
}

/* ---------- page ---------- */
function boardView() { if (!BP.view) { try { BP.view = localStorage.getItem('wiwe_board_view') || ''; } catch (e) {} if (!BP.view) BP.view = window.innerWidth < 360 ? 'list' : 'building'; } return BP.view; }
function setBoardView(v) { BP.view = v; try { localStorage.setItem('wiwe_board_view', v); } catch (e) {} render(); }
function bpFilter(k) { BP.filter = BP.filter === k || !k ? null : k; render(); }
function buildingHtml() {
  var nf = bpFloorCount(), by = bpByFloor(), over = [], view = boardView();
  for (var i = 0; i < nf; i++) if ((by[i] || []).length > 5) over.push(floorName(i));
  var cnt = { attn: 0 }; roomsSorted().forEach(function (r) { var g = bpGroup(displayStatus(r)); cnt[g] = (cnt[g] || 0) + 1; if (roomFlags(r).length) cnt.attn++; });
  var chip = function (k, label) { return '<button type="button" class="lg' + (cnt[k] ? '' : ' zero') + '" data-st="' + k + '" aria-pressed="' + (BP.filter === k) + '" onclick="bpFilter(\'' + k + '\')"><i></i>' + esc(label) + ' <b>' + (cnt[k] || 0) + '</b></button>'; };
  var fr = BP.focus && byId(S.data.rooms, BP.focus);
  return '<div class="bp-wrap">' +
    '<div class="board-tools"><div class="legend-f" role="group" aria-label="Show only rooms that are…">' + BP_STATES.map(function (l) { return chip(l[0], l[1]); }).join('') + chip('attn', 'Needs attention') +
    (view === 'building' ? '<span class="lg-key"><svg width="14" height="12" viewBox="-2 0 14 10" aria-hidden="true"><g style="fill:var(--dim)"><rect x="0" y="3.5" width="10" height="5.5" rx="1.2"/><rect x="-1.8" y="4.2" width="13.6" height="1" rx=".5"/><rect x="3.8" y="1.8" width="2.4" height="1.4" rx=".5"/></g></svg>Kitchen</span>' : '') + '</div>' +
    '<div class="right-tools"><div class="seg" role="group" aria-label="Show the rooms as"><button type="button" class="' + (view === 'building' ? 'on' : '') + '" aria-pressed="' + (view === 'building') + '" onclick="setBoardView(\'building\')">' + icon('building', 15) + ' Building</button><button type="button" class="' + (view === 'list' ? 'on' : '') + '" aria-pressed="' + (view === 'list') + '" onclick="setBoardView(\'list\')">' + icon('list', 15) + ' List</button></div>' +
    '<label class="sr-only" for="bp-find">Find a room</label><select id="bp-find" class="search bp-find" onchange="bpFocus(this.value)"><option value="">Find a room…</option>' +
    roomsSorted().map(function (r) { return '<option value="' + r.id + '"' + (BP.focus === r.id ? ' selected' : '') + '>Room ' + esc(r.number) + ' · ' + esc(floorName(roomFloor(r))) + '</option>'; }).join('') + '</select></div></div>' +
    (BP.filter ? '<div class="note row between"><span>Showing only: <strong>' + esc(BP.filter === 'attn' ? 'Needs attention' : (BP_STATES.find(function (l) { return l[0] === BP.filter; }) || ['', ''])[1]) + '</strong> (' + (cnt[BP.filter] || 0) + ')</span><button class="btn small" type="button" onclick="bpFilter(\'\')">Show all rooms</button></div>' : '') +
    (fr ? '<div class="note"><strong>Room ' + esc(fr.number) + '</strong>: ' + esc(roomWhere(fr)) + '. ' + pill(ROOM_STATUS[displayStatus(fr)].label, ROOM_STATUS[displayStatus(fr)].cls) + ' <button class="btn small" type="button" onclick="openRoom(\'' + fr.id + '\')">Open room</button> <button class="btn small" type="button" onclick="bpFocus(\'\')">Clear</button></div>' : '') +
    (view === 'list' ? roomListHtml() : '<div class="card bp-card">' + bpBuilding(by, nf) + '</div>') +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '</div>';
}
function bpFocus(id) { BP.focus = id || null; BP.scrolled = null; if (id) BP.filter = null; if (S.view !== 'board') go('board'); else render(); }
// Called by core render() after every redraw
function afterRender() {
  if (BP.focus && BP.scrolled !== BP.focus) {
    var el = document.getElementById('bp-' + BP.focus);
    if (el) { BP.scrolled = BP.focus; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}
// Names used by the rest of the app
var building3dHtml = buildingHtml, b3dFocus = bpFocus;
