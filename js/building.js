/* =========================================================
   BUILDING VIEW: one flat picture of the Wiwe block, seen from the road
   Each floor is a band. The windows are replaced by room-number tiles:
   - front row (lower): Room 1 left and Room 2 right of the arched
     balcony bay (the entrance on the ground floor)
   - back row (raised behind them): Rooms 3, 4 and 5, left to right
   Rooms map to positions 1–5 by their order within the floor
   (Admin settings → Rooms → Floor and Position).
   ========================================================= */
var BP = { focus: null, scrolled: null };
var BP_COLORS = {
  ready: ['#E3F4EC', '#17643F', '#2FA36B', '#FFFFFF'], reserved: ['#EFE8FB', '#5B3BA0', '#8B6BD6', '#FFFFFF'], occupied: ['#E4ECFA', '#1F4E9C', '#3A73D9', '#FFFFFF'],
  dirty: ['#FDEBD9', '#9A4A06', '#E07B2A', '#FFFFFF'], cleaning: ['#FFF4CC', '#6E5200', '#E2B023', '#161616'], inspect: ['#FFF4CC', '#6E5200', '#E2B023', '#161616'], ooo: ['#ECEBEA', '#45474B', '#8A8A8A', '#FFFFFF']
};
var BP_WHERE = ['front left, beside the entrance', 'front right, beside the entrance', 'back row, left', 'back row, middle', 'back row, right'];
var BP_INK = '#161616', BP_WALL = '#F3E2A9', BP_FOCUS = '#E5007E';

function bpFloorCount() { var m = 2; roomsSorted().forEach(function (r) { m = Math.max(m, roomFloor(r)); }); return m + 1; }
function bpByFloor() { var by = {}; roomsSorted().forEach(function (r) { var f = roomFloor(r); (by[f] = by[f] || []).push(r); }); return by; }
function bpPlace(room) { var f = roomFloor(room), same = bpByFloor()[f] || []; return { floor: f, pos: same.indexOf(room) }; }
function roomWhere(room) { var p = bpPlace(room); return floorName(p.floor) + (BP_WHERE[p.pos] ? ', ' + BP_WHERE[p.pos] : ''); }
function bpCol(r) { return BP_COLORS[displayStatus(r)] || BP_COLORS.ready; }
function bpTxt(x, y, s, size, fill, weight, anchor, extra) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" font-weight="' + (weight || 600) + '" text-anchor="' + (anchor || 'middle') + '" font-family="Space Grotesk, Inter, sans-serif"' + (extra || '') + '>' + esc(s) + '</text>'; }

// Small cooking-pot icon; crossed out when the room has no kitchen
function bpKitchen(x, y, s, col, has) {
  var g = '<g aria-hidden="true"><text x="' + (x + s / 2) + '" y="' + (y + s * 0.88) + '" font-size="' + s + '" text-anchor="middle"' + (has ? '' : ' opacity=".75"') + '>🍳</text>';
  if (!has) g += '<path d="M' + (x - 0.5) + ' ' + (y - 0.5) + 'L' + (x + s + 0.5) + ' ' + (y + s + 0.5) + 'M' + (x + s + 0.5) + ' ' + (y - 0.5) + 'L' + (x - 0.5) + ' ' + (y + s + 0.5) + '" stroke="#C62828" stroke-width="' + (s > 9 ? 1.8 : 1.5) + '" stroke-linecap="round"/>';
  return g + '</g>';
}
// One room tile. front = bigger, with a shadow and its status written under the number
function bpTile(r, x, y, w, h, front) {
  if (!r) return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="#E9DDB4" stroke="#CDBB84" stroke-width="1.5" stroke-dasharray="4 3"/>';
  var c = bpCol(r), st = displayStatus(r), stay = stayOf(r), focus = BP.focus === r.id;
  var attn = stay && st === 'occupied' && (isOverstay(stay) || dueOutToday(stay) || (stay.balance || 0) > 0);
  var s = '<g id="bp-' + r.id + '" role="button" tabindex="0" class="bp-room" aria-label="Room ' + esc(r.number) + ', ' + esc(ROOM_STATUS[st].label) + ', ' + esc(roomWhere(r)) + '"' +
    ' onclick="openRoom(\'' + r.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRoom(\'' + r.id + '\')}">' +
    '<title>Room ' + esc(r.number) + ' · ' + esc(ROOM_STATUS[st].label) + (stay && st === 'occupied' ? ' · ' + esc(stay.guestName) : '') + '</title>';
  if (front) s += '<rect x="' + (x + 1) + '" y="' + (y + 1.2) + '" width="' + w + '" height="' + h + '" rx="5" fill="rgba(22,22,22,.22)"/>';
  s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (front ? 5 : 4) + '" fill="' + c[2] + '" stroke="' + (front ? 'rgba(255,255,255,.9)' : 'rgba(22,22,22,.35)') + '" stroke-width="' + (front ? 0.8 : 0.5) + '"/>';
  var kit = !!roomType(r).hasKitchen, isz = front ? 13 : 10;
  if (kit) s += bpKitchen(x + (front ? 6 : 5), y + (h - isz) / 2, isz, c[3], true);
  s += bpTxt(x + w / 2 + (kit ? isz / 2 + 1 : 0), y + h / 2 + (front ? 5 : 4), r.number, front ? 14 : 11, c[3], 700);
  if (attn) s += '<circle cx="' + (x + w - 5) + '" cy="' + (y + 5) + '" r="5" fill="#A12626" stroke="#FFFFFF" stroke-width="1.2"/>' + bpTxt(x + w - 5, y + 8, '!', 8, '#FFFFFF', 700);
  if (focus) s += '<rect class="bp-focus" x="' + (x - 3) + '" y="' + (y - 3) + '" width="' + (w + 6) + '" height="' + (h + 6) + '" rx="7" fill="none" stroke="' + BP_FOCUS + '" stroke-width="3"/>';
  return s + '</g>';
}

function bpBuilding(by, nf) {
  var FH = 52, top = 42, H = top + nf * FH;
  var s = '<svg class="bp-svg" viewBox="-14 -2 328 ' + (H + 20) + '" role="group" aria-label="The Wiwe building seen from the road. Each floor shows its front rooms low and its back rooms raised behind them.">';
  s += '<polygon points="18,37 282,37 238,8 62,8" fill="#5B3527"/>';
  s += '<rect x="12" y="34" width="276" height="' + (top - 34 + 2) + '" fill="' + BP_WALL + '"/><rect x="8" y="31" width="284" height="5" fill="#3A3A3A"/>';
  s += '<rect x="12" y="' + top + '" width="276" height="' + (nf * FH) + '" fill="' + BP_WALL + '"/>';
  [12, 282].forEach(function (x) { s += '<rect x="' + x + '" y="' + top + '" width="5" height="' + (nf * FH) + '" fill="#FFFFFF" opacity=".9"/>'; });
  for (var f = nf - 1; f >= 0; f--) {
    var y = top + (nf - 1 - f) * FH, rs = by[f] || [];
    // back row: raised, smaller
    s += '<rect x="30" y="' + (y + 3) + '" width="240" height="22" rx="3" fill="rgba(22,22,22,.06)"/>';
    // left edge lines up with front room 1, right edge with front room 2, equal gaps between
    s += bpTile(rs[2], 36, y + 5, 68, 18, false) + bpTile(rs[3], 116, y + 5, 68, 18, false) + bpTile(rs[4], 196, y + 5, 68, 18, false);
    // arched balcony bay (entrance on the ground floor)
    s += '<rect x="119" y="' + (y + 25) + '" width="62" height="' + (FH - 28) + '" fill="#E9D79B"/>';
    s += '<path d="M126 ' + (y + FH - 4) + ' L126 ' + (y + 36) + ' Q150 ' + (y + 22) + ' 174 ' + (y + 36) + ' L174 ' + (y + FH - 4) + ' Z" fill="#6E5C3A"/>';
    if (f === 0) s += '<rect x="136" y="' + (y + 35) + '" width="11" height="' + (FH - 39) + '" fill="#2B211B"/><rect x="154" y="' + (y + 37) + '" width="10" height="8" fill="#3F8F7F" stroke="#FFF" stroke-width="1.2"/>';
    else { s += '<rect x="126" y="' + (y + FH - 13) + '" width="48" height="2" fill="' + BP_INK + '"/>'; for (var b = 0; b < 8; b++) s += '<rect x="' + (128.5 + b * 6) + '" y="' + (y + FH - 12) + '" width="1.3" height="8" fill="' + BP_INK + '"/>'; }
    // front row: lower, bigger
    s += bpTile(rs[0], 36, y + 22, 72, FH - 27, true) + bpTile(rs[1], 192, y + 22, 72, FH - 27, true);
    // floor line and label
    s += '<rect x="12" y="' + (y + FH - 3) + '" width="276" height="3" fill="#D9BF72"/>';
    s += bpTxt(2, y + FH / 2 + 4, f === 0 ? 'G' : String(f), 11, '#7D7663', 700, 'end');
  }
  s += '<rect x="6" y="' + H + '" width="288" height="6" fill="#D9BF72"/>';
  s += '<rect x="114" y="' + (H + 3) + '" width="72" height="11" rx="3" fill="' + BP_INK + '"/>' + bpTxt(150, H + 11.5, 'ENTRANCE', 8, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  return s + '</svg>';
}

/* ---------- page ---------- */
function buildingHtml() {
  var nf = bpFloorCount(), by = bpByFloor(), over = [];
  for (var i = 0; i < nf; i++) if ((by[i] || []).length > 5) over.push(floorName(i));
  var legend = [['ready', 'Ready'], ['occupied', 'Occupied'], ['reserved', 'Reserved today'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning / inspection'], ['ooo', 'Out of order']];
  var fr = BP.focus && byId(S.data.rooms, BP.focus);
  return '<div class="bp-wrap">' +
    '<div class="row between"><div class="b3d-legend" aria-label="Colour key">' + legend.map(function (l) { return '<span><i style="background:' + BP_COLORS[l[0]][2] + '"></i>' + l[1] + '</span>'; }).join('') + '<span><i style="background:#A12626;border-radius:999px"></i>Needs attention</span><span><svg width="14" height="14" viewBox="-1 -1 12 12" aria-hidden="true">' + bpKitchen(0, 0, 10, '#161616', true) + '</svg>Kitchen</span></div>' +
    '<label class="sr-only" for="bp-find">Find a room</label><select id="bp-find" class="search bp-find" onchange="bpFocus(this.value)"><option value="">Find a room…</option>' +
    roomsSorted().map(function (r) { return '<option value="' + r.id + '"' + (BP.focus === r.id ? ' selected' : '') + '>Room ' + esc(r.number) + ' · ' + esc(floorName(roomFloor(r))) + '</option>'; }).join('') + '</select></div>' +
    (fr ? '<div class="note"><strong>Room ' + esc(fr.number) + '</strong>: ' + esc(roomWhere(fr)) + '. ' + pill(ROOM_STATUS[displayStatus(fr)].label, ROOM_STATUS[displayStatus(fr)].cls) + ' <button class="btn small" type="button" onclick="openRoom(\'' + fr.id + '\')">Open room</button> <button class="btn small" type="button" onclick="bpFocus(\'\')">Clear</button></div>' : '') +
    '<div class="card bp-card">' + bpBuilding(by, nf) + '</div>' +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '</div>';
}
function bpFocus(id) { BP.focus = id || null; BP.scrolled = null; try { localStorage.setItem('wiwe_board', '3d'); } catch (e) {} if (S.view !== 'board') go('board'); else render(); }
// Called by core render() after every redraw
function afterRender() {
  if (BP.focus && BP.scrolled !== BP.focus) {
    var el = document.getElementById('bp-' + BP.focus);
    if (el) { BP.scrolled = BP.focus; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}
// Names used by the rest of the app
var building3dHtml = buildingHtml, b3dFocus = bpFocus;
