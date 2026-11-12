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

// One room tile. front = bigger, with a shadow and its status written under the number
function bpTile(r, x, y, w, h, front) {
  if (!r) return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="#E9DDB4" stroke="#CDBB84" stroke-width="1.5" stroke-dasharray="4 3"/>';
  var c = bpCol(r), st = displayStatus(r), stay = stayOf(r), focus = BP.focus === r.id;
  var attn = stay && st === 'occupied' && (isOverstay(stay) || dueOutToday(stay) || (stay.balance || 0) > 0);
  var s = '<g id="bp-' + r.id + '" role="button" tabindex="0" class="bp-room" aria-label="Room ' + esc(r.number) + ', ' + esc(ROOM_STATUS[st].label) + ', ' + esc(roomWhere(r)) + '"' +
    ' onclick="openRoom(\'' + r.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRoom(\'' + r.id + '\')}">' +
    '<title>Room ' + esc(r.number) + ' · ' + esc(ROOM_STATUS[st].label) + (stay && st === 'occupied' ? ' · ' + esc(stay.guestName) : '') + '</title>';
  if (front) s += '<rect x="' + (x + 3) + '" y="' + (y + 3) + '" width="' + w + '" height="' + h + '" rx="7" fill="rgba(22,22,22,.22)"/>';
  s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (front ? 7 : 5) + '" fill="' + c[2] + '" stroke="' + (front ? '#FFFFFF' : 'rgba(22,22,22,.45)') + '" stroke-width="' + (front ? 3 : 1.5) + '"/>';
  if (front) {
    s += bpTxt(x + w / 2, y + h / 2 + 1, r.number, 18, c[3], 700);
    s += bpTxt(x + w / 2, y + h / 2 + 14, ROOM_STATUS[st].label, 9, c[3], 600);
  } else {
    s += bpTxt(x + w / 2, y + h / 2 + 5, r.number, 13, c[3], 700);
  }
  if (attn) s += '<circle cx="' + (x + w - 7) + '" cy="' + (y + 7) + '" r="6.5" fill="#A12626" stroke="#FFFFFF" stroke-width="1.5"/>' + bpTxt(x + w - 7, y + 11, '!', 9, '#FFFFFF', 700);
  if (focus) s += '<rect class="bp-focus" x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (w + 8) + '" height="' + (h + 8) + '" rx="9" fill="none" stroke="' + BP_FOCUS + '" stroke-width="4"/>';
  return s + '</g>';
}

function bpBuilding(by, nf) {
  var FH = 70, top = 50, H = top + nf * FH;
  var s = '<svg class="bp-svg" viewBox="-14 -4 328 ' + (H + 48) + '" role="group" aria-label="The Wiwe building seen from the road. Each floor shows its front rooms low and its back rooms raised behind them.">';
  s += '<polygon points="18,44 282,44 236,10 64,10" fill="#5B3527"/>';
  s += '<rect x="12" y="40" width="276" height="' + (top - 40 + 2) + '" fill="' + BP_WALL + '"/><rect x="8" y="36" width="284" height="6" fill="#3A3A3A"/>';
  s += '<rect x="12" y="' + top + '" width="276" height="' + (nf * FH) + '" fill="' + BP_WALL + '"/>';
  [12, 282].forEach(function (x) { s += '<rect x="' + x + '" y="' + top + '" width="6" height="' + (nf * FH) + '" fill="#FFFFFF" opacity=".9"/>'; });
  for (var f = nf - 1; f >= 0; f--) {
    var y = top + (nf - 1 - f) * FH, rs = by[f] || [];
    // back row: raised, smaller
    s += '<rect x="22" y="' + (y + 4) + '" width="256" height="28" rx="4" fill="rgba(22,22,22,.06)"/>';
    s += bpTile(rs[2], 26, y + 7, 70, 22, false) + bpTile(rs[3], 115, y + 7, 70, 22, false) + bpTile(rs[4], 204, y + 7, 70, 22, false);
    // arched balcony bay (entrance on the ground floor)
    s += '<rect x="117" y="' + (y + 32) + '" width="66" height="' + (FH - 36) + '" fill="#E9D79B"/>';
    s += '<path d="M124 ' + (y + FH - 5) + ' L124 ' + (y + 48) + ' Q150 ' + (y + 30) + ' 176 ' + (y + 48) + ' L176 ' + (y + FH - 5) + ' Z" fill="#6E5C3A"/>';
    if (f === 0) s += '<rect x="134" y="' + (y + 47) + '" width="14" height="' + (FH - 52) + '" fill="#2B211B"/><rect x="155" y="' + (y + 50) + '" width="12" height="11" fill="#3F8F7F" stroke="#FFF" stroke-width="1.5"/>';
    else { s += '<rect x="124" y="' + (y + FH - 18) + '" width="52" height="2.5" fill="' + BP_INK + '"/>'; for (var b = 0; b < 8; b++) s += '<rect x="' + (127 + b * 6.4) + '" y="' + (y + FH - 16) + '" width="1.5" height="11" fill="' + BP_INK + '"/>'; }
    // front row: lower, bigger
    s += bpTile(rs[0], 22, y + 26, 88, FH - 30, true) + bpTile(rs[1], 190, y + 26, 88, FH - 30, true);
    // floor line and label
    s += '<rect x="12" y="' + (y + FH - 4) + '" width="276" height="4" fill="#D9BF72"/>';
    s += bpTxt(2, y + FH / 2 + 4, f === 0 ? 'G' : String(f), 12, '#7D7663', 700, 'end');
  }
  s += '<rect x="6" y="' + H + '" width="288" height="8" fill="#D9BF72"/>';
  s += '<rect x="112" y="' + (H + 2) + '" width="76" height="11" rx="3" fill="' + BP_INK + '"/>' + bpTxt(150, H + 10.5, 'ENTRANCE', 8, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  s += '<rect x="50" y="' + (H + 18) + '" width="200" height="22" rx="11" fill="' + BP_INK + '"/>' + bpTxt(150, H + 33, '▲  ROAD · GATE  ▲', 11, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  return s + '</svg>';
}

/* ---------- page ---------- */
function buildingHtml() {
  var nf = bpFloorCount(), by = bpByFloor(), over = [];
  for (var i = 0; i < nf; i++) if ((by[i] || []).length > 5) over.push(floorName(i));
  var legend = [['ready', 'Ready'], ['occupied', 'Occupied'], ['reserved', 'Reserved today'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning / inspection'], ['ooo', 'Out of order']];
  var fr = BP.focus && byId(S.data.rooms, BP.focus);
  return '<div class="bp-wrap">' +
    '<div class="row between"><div class="b3d-legend" aria-label="Colour key">' + legend.map(function (l) { return '<span><i style="background:' + BP_COLORS[l[0]][2] + '"></i>' + l[1] + '</span>'; }).join('') + '<span><i style="background:#A12626;border-radius:999px"></i>Needs attention</span></div>' +
    '<label class="sr-only" for="bp-find">Find a room</label><select id="bp-find" class="search bp-find" onchange="bpFocus(this.value)"><option value="">Find a room…</option>' +
    roomsSorted().map(function (r) { return '<option value="' + r.id + '"' + (BP.focus === r.id ? ' selected' : '') + '>Room ' + esc(r.number) + ' · ' + esc(floorName(roomFloor(r))) + '</option>'; }).join('') + '</select></div>' +
    (fr ? '<div class="note"><strong>Room ' + esc(fr.number) + '</strong>: ' + esc(roomWhere(fr)) + '. ' + pill(ROOM_STATUS[displayStatus(fr)].label, ROOM_STATUS[displayStatus(fr)].cls) + ' <button class="btn small" type="button" onclick="openRoom(\'' + fr.id + '\')">Open room</button> <button class="btn small" type="button" onclick="bpFocus(\'\')">Clear</button></div>' : '') +
    '<div class="card bp-card">' + bpBuilding(by, nf) + '</div>' +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '<div class="muted small">Seen from the road. On each floor the two big tiles are the front rooms either side of the balcony; the raised row behind them is the back row. Tap any room to open it.</div></div>';
}
function bpFocus(id) { BP.focus = id || null; BP.scrolled = null; if (S.view !== 'building' && S.view !== 'board') go('building'); else render(); }
// Called by core render() after every redraw
function afterRender() {
  if (BP.focus && BP.scrolled !== BP.focus) {
    var el = document.getElementById('bp-' + BP.focus);
    if (el) { BP.scrolled = BP.focus; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}
// Names used by the rest of the app
var building3dHtml = buildingHtml, b3dFocus = bpFocus;
VIEWS.building = {
  title: 'Building',
  eyebrow: function () { return 'Wiwe Apartments · Onilude Street, Sowhe'; },
  render: function () { return buildingHtml(); }
};
