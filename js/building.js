/* =========================================================
   BUILDING VIEW: flat drawings of the Wiwe block
   - "From the road": the balcony/entrance face that looks onto the road.
     Each floor: Room 1 on the left (tall louvred windows), the arched
     balcony bay in the middle (entrance on the ground floor), Room 2 on
     the right (smaller window).
   - Floor plans, road at the bottom: Rooms 1 and 2 either side of the
     entrance and stairs, Rooms 3 and 4 behind them either side of the
     corridor, Room 5 across the far back. Same on every floor.
   Rooms are matched to positions 1–5 by their order within the floor
   (Admin settings → Rooms → Floor and Position).
   ========================================================= */
var BP = { floor: 'all', focus: null, scrolled: null };
var BP_COLORS = {
  ready: ['#E3F4EC', '#17643F', '#2FA36B'], reserved: ['#EFE8FB', '#5B3BA0', '#8B6BD6'], occupied: ['#E4ECFA', '#1F4E9C', '#3A73D9'],
  dirty: ['#FDEBD9', '#9A4A06', '#E07B2A'], cleaning: ['#FFF4CC', '#6E5200', '#D9A514'], inspect: ['#FFF4CC', '#6E5200', '#D9A514'], ooo: ['#ECEBEA', '#45474B', '#8E8E8E']
};
// Plan is 300 wide (12 m) × 500 deep (20 m); y = 0 at the back, 500 at the road
var BP_SLOTS = [
  { x: 0, y: 230, w: 110, h: 270, where: 'front left, beside the entrance' },
  { x: 190, y: 230, w: 110, h: 270, where: 'front right, beside the entrance' },
  { x: 0, y: 0, w: 100, h: 200, where: 'back row, left' },
  { x: 100, y: 0, w: 100, h: 200, where: 'back row, middle' },
  { x: 200, y: 0, w: 100, h: 200, where: 'back row, right' }
];
var BP_INK = '#161616', BP_WALL = '#F3E2A9', BP_FOCUS = '#E5007E';

function bpFloorCount() { var m = 2; roomsSorted().forEach(function (r) { m = Math.max(m, roomFloor(r)); }); return m + 1; }
function bpByFloor() { var by = {}; roomsSorted().forEach(function (r) { var f = roomFloor(r); (by[f] = by[f] || []).push(r); }); return by; }
function bpPlace(room) { var f = roomFloor(room), same = bpByFloor()[f] || []; return { floor: f, pos: same.indexOf(room) }; }
function roomWhere(room) { var p = bpPlace(room); return floorName(p.floor) + (BP_SLOTS[p.pos] ? ', ' + BP_SLOTS[p.pos].where : ''); }
function bpCol(r) { return BP_COLORS[displayStatus(r)] || BP_COLORS.ready; }
function bpAttrs(r) {
  return ' role="button" tabindex="0" class="bp-room" aria-label="Room ' + esc(r.number) + ', ' + esc(ROOM_STATUS[displayStatus(r)].label) + ', ' + esc(roomWhere(r)) + '" onclick="openRoom(\'' + r.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRoom(\'' + r.id + '\')}"';
}
function bpTxt(x, y, s, size, fill, weight, anchor, extra) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" font-weight="' + (weight || 600) + '" text-anchor="' + (anchor || 'middle') + '" font-family="Space Grotesk, Inter, sans-serif"' + (extra || '') + '>' + esc(s) + '</text>'; }

/* ---------- one floor plan ---------- */
function bpPlan(f, rooms) {
  var s = '<svg class="bp-svg" viewBox="-14 -34 328 586" role="group" aria-label="' + esc(floorName(f)) + ' plan, road at the bottom">';
  s += '<rect x="0" y="0" width="300" height="500" fill="' + BP_WALL + '" stroke="' + BP_INK + '" stroke-width="4"/>';
  // corridor, stairs, entrance
  s += '<rect x="0" y="200" width="300" height="30" fill="#EDE4CC"/><rect x="110" y="230" width="80" height="270" fill="' + (f === 0 ? '#E3DAC0' : '#EDE4CC') + '"/>';
  s += bpTxt(150, 219, 'CORRIDOR', 10, '#6B6150', 700, 'middle', ' letter-spacing="2"');
  for (var k = 0; k < 6; k++) s += '<line x1="122" x2="178" y1="' + (318 + k * 9) + '" y2="' + (318 + k * 9) + '" stroke="#B9AE8E" stroke-width="2"/>';
  s += bpTxt(150, 386, 'STAIRS', 11, '#6B6150', 700, 'middle', ' letter-spacing="1.5"');
  if (f === 0) s += bpTxt(150, 428, 'RECEPTION', 11, BP_INK, 700, 'middle', ' letter-spacing="1"');
  // arched bay on the road wall
  s += '<path d="M118 500 L118 470 Q150 440 182 470 L182 500" fill="#FFFFFF" stroke="' + BP_INK + '" stroke-width="3"/>';
  s += bpTxt(150, 492, f === 0 ? 'ENTRANCE' : 'BALCONY', 10, BP_INK, 700);
  // rooms
  BP_SLOTS.forEach(function (sl, i) {
    var r = rooms[i];
    if (!r) { s += '<rect x="' + sl.x + '" y="' + sl.y + '" width="' + sl.w + '" height="' + sl.h + '" fill="#F7F2E4" stroke="' + BP_INK + '" stroke-width="3"/>' + bpTxt(sl.x + sl.w / 2, sl.y + sl.h / 2, '—', 22, '#9C9480'); return; }
    var c = bpCol(r), st = displayStatus(r), stay = stayOf(r), cx = sl.x + sl.w / 2, cy = sl.y + sl.h / 2, focus = BP.focus === r.id;
    s += '<g id="bp-' + r.id + '"' + bpAttrs(r) + '>';
    s += '<rect x="' + sl.x + '" y="' + sl.y + '" width="' + sl.w + '" height="' + sl.h + '" fill="' + c[0] + '" stroke="' + BP_INK + '" stroke-width="3"/>';
    s += '<rect x="' + (sl.x + 8) + '" y="' + (sl.y + 8) + '" width="' + (sl.w - 16) + '" height="9" rx="4.5" fill="' + c[2] + '"/>';
    s += bpTxt(cx, cy + 6, r.number, sl.h > 140 ? 40 : 34, BP_INK, 700);
    s += bpTxt(cx, cy + 28, ROOM_STATUS[st].label, 13, c[1], 700);
    if (stay && st === 'occupied') s += bpTxt(cx, cy + 46, stay.guestName.split(' ')[0], 12, '#5E5848', 500);
    if (stay && st === 'occupied' && (isOverstay(stay) || dueOutToday(stay) || (stay.balance || 0) > 0)) s += '<circle cx="' + (sl.x + sl.w - 18) + '" cy="' + (sl.y + 32) + '" r="10" fill="#A12626"/>' + bpTxt(sl.x + sl.w - 18, sl.y + 37, '!', 14, '#FFFFFF', 700);
    if (focus) s += '<rect class="bp-focus" x="' + (sl.x + 4) + '" y="' + (sl.y + 4) + '" width="' + (sl.w - 8) + '" height="' + (sl.h - 8) + '" fill="none" stroke="' + BP_FOCUS + '" stroke-width="7"/>';
    s += '</g>';
  });
  // windows on outside walls
  function win(x, y, w, h, col) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + col + '" stroke="#FFFFFF" stroke-width="1.5"/>'; }
  var cols = BP_SLOTS.map(function (sl, i) { return rooms[i] ? bpCol(rooms[i])[2] : '#3F8F7F'; });
  s += win(22, 495, 22, 10, cols[0]) + win(64, 495, 22, 10, cols[0]) + win(-5, 390, 10, 34, cols[0]);
  s += win(228, 495, 40, 10, cols[1]) + win(295, 390, 10, 34, cols[1]);
  s += win(-5, 80, 10, 34, cols[2]) + win(295, 80, 10, 34, cols[4]);
  s += win(30, -5, 40, 10, cols[2]) + win(130, -5, 40, 10, cols[3]) + win(230, -5, 40, 10, cols[4]);
  // orientation
  s += bpTxt(150, -14, 'BACK OF COMPOUND', 11, '#7D7663', 700, 'middle', ' letter-spacing="1.5"');
  s += '<rect x="40" y="516" width="220" height="26" rx="13" fill="' + BP_INK + '"/>' + bpTxt(150, 534, '▼  ROAD · GATE  ▼', 12, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  return s + '</svg>';
}

/* ---------- front view from the road ---------- */
function bpFront(by, nf) {
  var FH = 84, top = 64, H = top + nf * FH, W = 300;
  var s = '<svg class="bp-svg" viewBox="-10 -6 320 ' + (H + 70) + '" role="group" aria-label="The building seen from the road">';
  s += '<polygon points="18,58 282,58 236,10 64,10" fill="#5B3527"/>';
  s += '<rect x="12" y="50" width="276" height="' + (top - 50 + 2) + '" fill="' + BP_WALL + '"/><rect x="8" y="46" width="284" height="7" fill="#3A3A3A"/>';
  s += '<rect x="12" y="' + top + '" width="276" height="' + (nf * FH) + '" fill="' + BP_WALL + '" stroke="#D8C27E" stroke-width="1"/>';
  var by2 = by;
  for (var f = nf - 1; f >= 0; f--) {
    var y = top + (nf - 1 - f) * FH, rs = by2[f] || [], r1 = rs[0], r2 = rs[1];
    var c1 = r1 ? bpCol(r1) : null, c2 = r2 ? bpCol(r2) : null;
    s += '<rect x="12" y="' + (y + FH - 5) + '" width="276" height="5" fill="#E8D08A"/>';
    // left room: tall louvred pair
    s += '<g' + (r1 ? ' id="bpf-' + r1.id + '"' + bpAttrs(r1) : '') + '>';
    s += '<rect x="20" y="' + (y + 2) + '" width="90" height="' + (FH - 8) + '" fill="transparent"/>';
    [36, 70].forEach(function (x) {
      s += '<rect x="' + x + '" y="' + (y + 22) + '" width="22" height="48" fill="' + (c1 ? c1[2] : '#3F8F7F') + '" stroke="#FFFFFF" stroke-width="2.5"/>';
      for (var k = 0; k < 6; k++) s += '<line x1="' + (x + 2) + '" x2="' + (x + 20) + '" y1="' + (y + 28 + k * 7) + '" y2="' + (y + 28 + k * 7) + '" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>';
    });
    if (r1) s += bpBadge(64, y + 12, r1);
    if (r1 && BP.focus === r1.id) s += '<rect class="bp-focus" x="24" y="' + (y + 2) + '" width="82" height="' + (FH - 10) + '" fill="none" stroke="' + BP_FOCUS + '" stroke-width="5"/>';
    s += '</g>';
    // arched bay
    s += '<rect x="114" y="' + (y + 2) + '" width="72" height="' + (FH - 7) + '" fill="#E9D79B"/>';
    s += '<path d="M122 ' + (y + FH - 5) + ' L122 ' + (y + 34) + ' Q150 ' + (y + 6) + ' 178 ' + (y + 34) + ' L178 ' + (y + FH - 5) + ' Z" fill="#6E5C3A"/>';
    if (f === 0) {
      s += '<rect x="128" y="' + (y + 36) + '" width="20" height="' + (FH - 41) + '" fill="#2B211B"/><rect x="154" y="' + (y + 40) + '" width="18" height="20" fill="#3F8F7F" stroke="#FFF" stroke-width="1.5"/>';
      s += '<rect x="150" y="' + (y + FH - 26) + '" width="28" height="2.5" fill="' + BP_INK + '"/>';
    } else {
      s += '<rect x="130" y="' + (y + 36) + '" width="16" height="' + (FH - 41) + '" fill="#2B211B"/><rect x="154" y="' + (y + 38) + '" width="16" height="18" fill="#3F8F7F" stroke="#FFF" stroke-width="1.5"/>';
      s += '<rect x="122" y="' + (y + FH - 30) + '" width="56" height="3" fill="' + BP_INK + '"/>';
      for (var b = 0; b < 8; b++) s += '<rect x="' + (125 + b * 7) + '" y="' + (y + FH - 28) + '" width="1.8" height="23" fill="' + BP_INK + '"/>';
    }
    // right room: smaller window
    s += '<g' + (r2 ? ' id="bpf-' + r2.id + '"' + bpAttrs(r2) : '') + '>';
    s += '<rect x="190" y="' + (y + 2) + '" width="90" height="' + (FH - 8) + '" fill="transparent"/>';
    s += '<rect x="214" y="' + (y + 32) + '" width="42" height="30" fill="' + (c2 ? c2[2] : '#3F8F7F') + '" stroke="#FFFFFF" stroke-width="2.5"/><line x1="235" x2="235" y1="' + (y + 32) + '" y2="' + (y + 62) + '" stroke="#FFFFFF" stroke-width="2"/>';
    if (r2) s += bpBadge(235, y + 12, r2);
    if (r2 && BP.focus === r2.id) s += '<rect class="bp-focus" x="194" y="' + (y + 2) + '" width="82" height="' + (FH - 10) + '" fill="none" stroke="' + BP_FOCUS + '" stroke-width="5"/>';
    s += '</g>';
    s += bpTxt(4, y + FH / 2 + 4, f === 0 ? 'G' : String(f), 11, '#7D7663', 700, 'end');
  }
  // pilasters, plinth, signs
  [12, 110, 186, 282].forEach(function (x) { s += '<rect x="' + x + '" y="' + top + '" width="6" height="' + (nf * FH) + '" fill="#FFFFFF" opacity=".9"/>'; });
  s += '<rect x="6" y="' + H + '" width="288" height="8" fill="#E8D08A"/>';
  s += '<rect x="110" y="' + (H - FH + 2) + '" width="80" height="13" rx="3" fill="' + BP_INK + '"/>' + bpTxt(150, H - FH + 12, 'ENTRANCE', 9, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  s += '<rect x="40" y="' + (H + 22) + '" width="220" height="26" rx="13" fill="' + BP_INK + '"/>' + bpTxt(150, H + 40, '▲  ROAD · GATE  ▲', 12, '#F4E6B8', 700, 'middle', ' letter-spacing="1"');
  return s + '</svg>';
}
function bpBadge(cx, y, r) {
  var c = bpCol(r), w = Math.max(40, 12 + String(r.number).length * 10);
  return '<rect x="' + (cx - w / 2) + '" y="' + (y - 2) + '" width="' + w + '" height="18" rx="9" fill="#FFFFFF" stroke="' + c[2] + '" stroke-width="2.5"/>' + bpTxt(cx, y + 11.5, r.number, 12, BP_INK, 700);
}

/* ---------- page ---------- */
function buildingHtml() {
  var nf = bpFloorCount(), by = bpByFloor(), fl = [['all', 'All floors']], over = [];
  for (var i = 0; i < nf; i++) { fl.push([String(i), floorName(i)]); if ((by[i] || []).length > 5) over.push(floorName(i)); }
  var floors = BP.floor === 'all' ? Array.apply(null, Array(nf)).map(function (_, i) { return i; }) : [+BP.floor];
  var legend = [['ready', 'Ready'], ['occupied', 'Occupied'], ['reserved', 'Reserved today'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning / inspection'], ['ooo', 'Out of order']];
  var fr = BP.focus && byId(S.data.rooms, BP.focus);
  return '<div class="bp-wrap">' +
    '<div class="row between"><div class="seg" role="group" aria-label="Floor to show">' + fl.map(function (x) { var on = String(BP.floor) === x[0]; return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" onclick="bpFloor(\'' + x[0] + '\')">' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
    '<div class="row"><label class="sr-only" for="bp-find">Find a room</label><select id="bp-find" class="search bp-find" onchange="if(this.value)bpFocus(this.value)"><option value="">Find a room…</option>' +
    roomsSorted().map(function (r) { return '<option value="' + r.id + '"' + (BP.focus === r.id ? ' selected' : '') + '>Room ' + esc(r.number) + ' · ' + esc(floorName(roomFloor(r))) + '</option>'; }).join('') + '</select></div></div>' +
    (fr ? '<div class="note"><strong>Room ' + esc(fr.number) + '</strong>: ' + esc(roomWhere(fr)) + '. ' + pill(ROOM_STATUS[displayStatus(fr)].label, ROOM_STATUS[displayStatus(fr)].cls) + ' <button class="btn small" type="button" onclick="openRoom(\'' + fr.id + '\')">Open room</button> <button class="btn small" type="button" onclick="BP.focus=null;render()">Clear</button></div>' : '') +
    '<div class="bp-grid">' +
    '<section class="card bp-front"><h2>From the road</h2>' + bpFront(by, nf) + '<p class="muted small">The balconies and entrance face the road. Room 1 of each floor is on the left, Room 2 on the right; Rooms 3, 4 and 5 are in a row across the back.</p></section>' +
    '<section class="bp-plans">' + floors.slice().reverse().map(function (f) { return '<div class="card bp-plan"><h2>' + esc(floorName(f)) + '</h2>' + bpPlan(f, by[f] || []) + '</div>'; }).join('') + '</section>' +
    '</div>' +
    '<div class="b3d-legend" aria-label="Colour key">' + legend.map(function (l) { return '<span><i style="background:' + BP_COLORS[l[0]][2] + '"></i>' + l[1] + '</span>'; }).join('') + '<span><i style="background:#A12626;border-radius:999px"></i>Needs attention</span></div>' +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '<div class="muted small">Plans are drawn with the road at the bottom. Tap any room to open it.</div></div>';
}
function bpFloor(v) { BP.floor = v; render(); }
function bpFocus(id) { BP.focus = id; BP.floor = 'all'; BP.scrolled = null; if (S.view !== 'building' && S.view !== 'board') go('building'); else render(); }
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
