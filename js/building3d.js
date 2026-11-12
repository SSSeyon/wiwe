/* =========================================================
   3D MODEL OF THE WIWE BUILDING (Room board → 3D)
   Modelled on the real block at Onilude Street, Sowhe:
   3 storeys, cream walls, white pilasters, green-framed windows,
   arched balconies on the west of the front, brown hipped roof
   with solar panels, compound wall with blue pillars and a black gate.
   Each floor: front (road, north) = stair/balcony bay + rooms 1–2,
   back (south) = rooms 3–5, west to east. Same on every floor.
   Three.js r128 is loaded from cdnjs only when the 3D view is opened.
   ========================================================= */
var B3D_STATUS = { ready: '#2FA36B', reserved: '#8B6BD6', occupied: '#3A73D9', dirty: '#E07B2A', cleaning: '#E5B52D', inspect: '#E5B52D', ooo: '#8E8E8E' };
var B3D = { renderer: null, scene: null, camera: null, el: null, labelLayer: null, built: 0, floor: 'all', yaw: -0.55, pitch: 0.38, dist: 44, target: null, waiters: [], loading: false, failed: false, floors: [], slots: [], roof: null, pick: [], host: null, ro: null, dark: null };
var B3D_L = 20, B3D_D = 12, B3D_FH = 3.2, B3D_COR = 0.9;
// Room slots on a floor, in board order (position 1..5)
var B3D_SLOTS = [
  { x0: -5, x1: 2.5, z0: B3D_COR, z1: B3D_D / 2, face: 1 },
  { x0: 2.5, x1: 10, z0: B3D_COR, z1: B3D_D / 2, face: 1 },
  { x0: -10, x1: -10 / 3, z0: -B3D_D / 2, z1: -B3D_COR, face: -1 },
  { x0: -10 / 3, x1: 10 / 3, z0: -B3D_D / 2, z1: -B3D_COR, face: -1 },
  { x0: 10 / 3, x1: 10, z0: -B3D_D / 2, z1: -B3D_COR, face: -1 }
];

function b3dFloorCount() { var m = 2; roomsSorted().forEach(function (r) { m = Math.max(m, roomFloor(r)); }); return m + 1; }
function b3dLoad(cb) {
  if (window.THREE) return cb();
  B3D.waiters.push(cb);
  if (B3D.loading) return;
  B3D.loading = true;
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = function () { var w = B3D.waiters; B3D.waiters = []; w.forEach(function (f) { f(); }); };
  s.onerror = function () { B3D.failed = true; B3D.loading = false; scheduleRender(); };
  document.head.appendChild(s);
}

/* ---------- HTML shell (inside the Room board) ---------- */
function building3dHtml() {
  if (B3D.failed) return '<div class="note warn">The 3D view could not load (it needs internet the first time). Showing the floor plan instead.</div>' + buildingMap(roomsSorted());
  var nf = b3dFloorCount(), fl = [['all', 'Whole building']];
  for (var i = 0; i < nf; i++) fl.push([String(i), floorName(i)]);
  var over = [];
  for (var f = 0; f < nf; f++) { var n = roomsSorted().filter(function (r) { return roomFloor(r) === f; }).length; if (n > 5) over.push(floorName(f)); }
  return '<div class="b3d-wrap"><div class="row between">' +
    '<div class="seg" role="group" aria-label="Floor to show">' + fl.map(function (x) { var on = String(B3D.floor) === x[0]; return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" onclick="b3dFloor(\'' + x[0] + '\')">' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
    '<div class="row"><button class="btn small" type="button" onclick="b3dView(\'front\')">Front</button><button class="btn small" type="button" onclick="b3dView(\'back\')">Back</button>' +
    '<button class="btn small" type="button" aria-label="Zoom in" onclick="b3dZoom(0.85)">+</button><button class="btn small" type="button" aria-label="Zoom out" onclick="b3dZoom(1.18)">−</button></div></div>' +
    '<div id="b3d-host" class="b3d-host"><div class="empty">Loading the 3D building…</div></div>' +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '<div class="muted small">Drag to turn the building · pinch or scroll to zoom · tap a room to open it · pick a floor to look inside it.</div></div>';
}
// Called by core render() after every redraw
function afterRender() {
  var host = $('b3d-host'); if (!host) return;
  b3dLoad(function () {
    try { b3dMount(host); }
    catch (e) { console.error(e); B3D.failed = true; scheduleRender(); }
  });
}
function b3dMount(host) {
  if (!host.isConnected) return;
  if (!B3D.renderer) b3dInit();
  var dark = document.body.classList.contains('dark-mode');
  if (B3D.built !== b3dFloorCount() || B3D.dark !== dark) b3dBuild();
  host.innerHTML = ''; host.appendChild(B3D.el); B3D.host = host;
  if (B3D.ro) B3D.ro.disconnect();
  if (window.ResizeObserver) { B3D.ro = new ResizeObserver(function () { requestAnimationFrame(b3dResize); }); B3D.ro.observe(host); }
  B3D.lastW = 0; b3dResize(); b3dUpdate(); b3dApplyFloor(); b3dDraw();
}

/* ---------- three.js setup ---------- */
function b3dInit() {
  B3D.el = document.createElement('div'); B3D.el.className = 'b3d-stage';
  var r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  B3D.renderer = r; B3D.el.appendChild(r.domElement);
  B3D.labelLayer = document.createElement('div'); B3D.labelLayer.className = 'b3d-labels'; B3D.el.appendChild(B3D.labelLayer);
  B3D.camera = new THREE.PerspectiveCamera(38, 1.6, 0.5, 500);
  B3D.target = new THREE.Vector3(0, 5, 0);
  b3dControls(r.domElement);
}
function b3dMat(color, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0 }, extra || {})); }
function b3dBox(parent, w, h, d, mat, x, y, z, noShadow) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m); return m;
}
// Hipped roof: rectangle a×b (half sizes) at height y, ridge rh above
function b3dHipRoof(a, b, y, rh, mat) {
  var rx = Math.max(0, a - b);
  var p0 = [-a, y, b], p1 = [a, y, b], p2 = [a, y, -b], p3 = [-a, y, -b], r0 = [-rx, y + rh, 0], r1 = [rx, y + rh, 0];
  var tris = [p0, p1, r1, p0, r1, r0, p2, p3, r0, p2, r0, r1, p1, p2, r1, p3, p0, r0];
  var pos = []; tris.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  var m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

function b3dBuild() {
  var dark = document.body.classList.contains('dark-mode');
  B3D.dark = dark;
  var nf = b3dFloorCount(), L = B3D_L, D = B3D_D, FH = B3D_FH, H = nf * FH;
  var sc = new THREE.Scene(); B3D.scene = sc;
  sc.background = new THREE.Color(dark ? '#1C2126' : '#DCE7EF');
  sc.add(new THREE.HemisphereLight(dark ? '#9AA6B8' : '#FFFFFF', '#B8A88A', dark ? 0.45 : 0.62));
  var sun = new THREE.DirectionalLight('#FFF3DD', dark ? 0.55 : 0.85);
  sun.position.set(-22, 38, 26); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  var sh = sun.shadow.camera; sh.left = -30; sh.right = 30; sh.top = 30; sh.bottom = -30; sh.near = 1; sh.far = 120;
  sc.add(sun);

  var M = {
    wall: b3dMat('#F2DE9C'), band: b3dMat('#E8D08A'), white: b3dMat('#F7F5EE'), roof: b3dMat('#5B3527', { side: THREE.DoubleSide }),
    win: b3dMat('#3F8F7F', { roughness: 0.3 }), rail: b3dMat('#3A3A3A'), door: b3dMat('#3B2A20'), ac: b3dMat('#EDEDED'),
    ground: b3dMat('#CFC5AC'), road: b3dMat('#A98B64'), fence: b3dMat('#EFD98E'), pillar: b3dMat('#4F86C6'), gate: b3dMat('#1E1E1E'),
    panel: b3dMat('#1F2C4A', { roughness: 0.4, metalness: 0.3 }), plan: b3dMat('#EAE3D1'), corr: b3dMat('#D8D0BB'), bay: b3dMat('#CFC6B0'), low: b3dMat('#F3E6BD'), bed: b3dMat('#FFFFFF'), pillow: b3dMat('#E9E4D8')
  };

  // Compound, road, boundary wall, gate, gatehouse
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
  b3dBox(sc, 90, 0.04, 11, M.road, 0, 0.02, 20, true).receiveShadow = true;
  var WX = 16, WN = 14, WS = -12, WH = 2.2;
  b3dBox(sc, WX - 2.6, WH, 0.3, M.fence, -(WX + 2.6) / 2, WH / 2, WN);
  b3dBox(sc, WX - 2.6, WH, 0.3, M.fence, (WX + 2.6) / 2, WH / 2, WN);
  b3dBox(sc, 2 * WX, WH, 0.3, M.fence, 0, WH / 2, WS);
  b3dBox(sc, 0.3, WH, WN - WS, M.fence, -WX, WH / 2, (WN + WS) / 2);
  b3dBox(sc, 0.3, WH, WN - WS, M.fence, WX, WH / 2, (WN + WS) / 2);
  [-WX, -10, -5, -2.6, 2.6, 5, 10, WX].forEach(function (x) { b3dBox(sc, 0.55, WH + 0.3, 0.55, M.pillar, x, (WH + 0.3) / 2, WN); });
  [-WX, -8, 0, 8, WX].forEach(function (x) { b3dBox(sc, 0.55, WH + 0.3, 0.55, M.pillar, x, (WH + 0.3) / 2, WS); });
  b3dBox(sc, 4.9, 2.5, 0.15, M.gate, 0, 1.3, WN);
  var gh = new THREE.Group(); gh.position.set(-12.2, 0, 9.5); sc.add(gh);
  b3dBox(gh, 3.6, 2.6, 3.6, M.wall, 0, 1.3, 0);
  b3dBox(gh, 1, 2, 0.1, M.door, 0.6, 1, 1.82);
  gh.add(b3dHipRoof(2.3, 2.3, 2.6, 1.4, M.roof));

  // The building, floor by floor
  B3D.floors = []; B3D.slots = []; B3D.pick = [];
  var bayX0 = -10, bayX1 = -5, recess = 1.8;
  for (var f = 0; f < nf; f++) {
    var y0 = f * FH, wallH = FH - 0.3, wy = y0 + wallH / 2;
    var shell = new THREE.Group(), plan = new THREE.Group();
    sc.add(shell); sc.add(plan);
    // floor band (slab edge)
    b3dBox(shell, L + 0.3, 0.3, D + 0.3, M.band, 0, y0 + FH - 0.15, 0);
    if (f === 0) b3dBox(shell, L + 0.5, 0.35, D + 0.5, M.band, 0, 0.17, 0);
    // walls
    b3dBox(shell, L - (bayX1 - bayX0), wallH, 0.25, M.wall, (bayX1 + L / 2) / 2, wy, D / 2 - 0.125);
    b3dBox(shell, bayX1 - bayX0, wallH, 0.25, M.wall, (bayX0 + bayX1) / 2, wy, D / 2 - recess);
    b3dBox(shell, L, wallH, 0.25, M.wall, 0, wy, -D / 2 + 0.125);
    b3dBox(shell, 0.25, wallH, D, M.wall, -L / 2 + 0.125, wy, 0);
    b3dBox(shell, 0.25, wallH, D, M.wall, L / 2 - 0.125, wy, 0);
    // arched balcony front of the stair bay
    var shp = new THREE.Shape(); shp.moveTo(-2.5, 0); shp.lineTo(2.5, 0); shp.lineTo(2.5, wallH); shp.lineTo(-2.5, wallH); shp.lineTo(-2.5, 0);
    var hole = new THREE.Path(); var hr = 1.65, hb = f === 0 ? 0.02 : 0.02, hs = 1.0;
    hole.moveTo(-hr, hb); hole.lineTo(hr, hb); hole.lineTo(hr, hs); hole.absarc(0, hs, hr, 0, Math.PI, false); hole.lineTo(-hr, hb);
    shp.holes.push(hole);
    var arch = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.28, bevelEnabled: false }), M.wall);
    arch.position.set((bayX0 + bayX1) / 2, y0, D / 2 - 0.28); arch.castShadow = true; arch.receiveShadow = true; shell.add(arch);
    b3dBox(shell, bayX1 - bayX0, 0.18, recess, M.band, (bayX0 + bayX1) / 2, y0 + 0.09, D / 2 - recess / 2);
    if (f > 0) {
      b3dBox(shell, 3.3, 0.08, 0.08, M.rail, (bayX0 + bayX1) / 2, y0 + 1.05, D / 2 - 0.15);
      for (var bx = -1.5; bx <= 1.5; bx += 0.375) b3dBox(shell, 0.04, 1.0, 0.04, M.rail, (bayX0 + bayX1) / 2 + bx, y0 + 0.55, D / 2 - 0.15, true);
    }
    b3dBox(shell, 1.0, 2.1, 0.08, M.door, -8.3, y0 + 1.05, D / 2 - recess + 0.16);
    b3dWin(shell, -6.4, y0 + 1.7, D / 2 - recess + 0.14, 1.0, 1.1, 'z', 1, M.win, M.white);
    // white pilasters
    [-L / 2, bayX1, 2.5, L / 2].forEach(function (x) { b3dBox(shell, 0.6, wallH + 0.3, 0.2, M.white, x, y0 + (wallH + 0.3) / 2, D / 2 + 0.02); });
    [-L / 2, L / 2].forEach(function (x) { b3dBox(shell, 0.6, wallH + 0.3, 0.2, M.white, x, y0 + (wallH + 0.3) / 2, -D / 2 - 0.02); });
    // stair-bay side window on the west wall
    b3dWin(shell, -L / 2, y0 + 1.7, 3.5, 1.0, 1.1, 'x', -1, M.win, M.white);

    // rooms on this floor
    var row = [];
    B3D_SLOTS.forEach(function (s, i) {
      var glass = b3dMat('#3F8F7F', { roughness: 0.25, emissive: '#000000' });
      var plateMat = b3dMat('#D8D0BC');
      var cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, w = s.x1 - s.x0, d = s.z1 - s.z0;
      var faceZ = s.face > 0 ? D / 2 : -D / 2;
      var big = b3dWin(shell, cx - w * 0.18, y0 + 1.6, faceZ, 1.7, 1.5, 'z', s.face, glass, M.white);
      var small = b3dWin(shell, cx + w * 0.28, y0 + 2.1, faceZ, 0.7, 0.7, 'z', s.face, glass, M.white);
      b3dBox(shell, 0.85, 0.55, 0.3, M.ac, cx + w * 0.18 + 0.15, y0 + 2.35, faceZ + s.face * 0.2);
      var glasses = [big, small];
      if (s.x0 <= -L / 2 + 0.01) glasses.push(b3dWin(shell, -L / 2, y0 + 1.6, cz, 1.4, 1.3, 'x', -1, glass, M.white));
      if (s.x1 >= L / 2 - 0.01) glasses.push(b3dWin(shell, L / 2, y0 + 1.6, cz, 1.4, 1.3, 'x', 1, glass, M.white));
      glasses.forEach(function (g) { g.userData.slot = [f, i]; B3D.pick.push(g); });
      // cut-away plan
      var plate = b3dBox(plan, w - 0.3, 0.1, d - 0.3, plateMat, cx, y0 + 0.3, cz, true);
      plate.receiveShadow = true; plate.userData.slot = [f, i]; B3D.pick.push(plate);
      b3dBox(plan, 1.8, 0.45, 2.1, M.bed, cx - w * 0.2, y0 + 0.55, cz + (s.face > 0 ? 1 : -1) * (d / 2 - 1.3));
      b3dBox(plan, 1.6, 0.15, 0.45, M.pillow, cx - w * 0.2, y0 + 0.85, cz + (s.face > 0 ? 1 : -1) * (d / 2 - 0.5));
      [[w, 0.15, cx, s.z0], [w, 0.15, cx, s.z1]].forEach(function (p) { b3dBox(plan, p[0], 1.1, p[1], M.low, p[2], y0 + 0.75, p[3]); });
      [[s.x0], [s.x1]].forEach(function (p) { b3dBox(plan, 0.15, 1.1, d, M.low, p[0], y0 + 0.75, cz); });
      row.push({ glass: glass, plate: plateMat, room: null, face: s.face,
        facePos: new THREE.Vector3(cx - w * 0.18, y0 + 2.75, faceZ + s.face * 0.4),
        planPos: new THREE.Vector3(cx + w * 0.12, y0 + 1.5, cz) });
    });
    b3dBox(plan, L, 0.2, D, M.plan, 0, y0 + 0.1, 0, true).receiveShadow = true;
    b3dBox(plan, L - 0.3, 0.08, B3D_COR * 2 - 0.2, M.corr, 0, y0 + 0.26, 0, true);
    b3dBox(plan, bayX1 - bayX0 - 0.3, 0.08, D / 2 - B3D_COR - 0.3, M.bay, (bayX0 + bayX1) / 2, y0 + 0.26, (D / 2 + B3D_COR) / 2, true);
    for (var st = 0; st < 8; st++) b3dBox(plan, 1.2, 0.18 * (st + 1), 0.3, M.band, -8.9, y0 + 0.09 * (st + 1), 1.5 + st * 0.32);
    B3D.floors.push({ shell: shell, plan: plan });
    B3D.slots.push(row);
  }
  // roof + solar panels
  var roof = new THREE.Group(); sc.add(roof); B3D.roof = roof;
  var o = 0.8, a = L / 2 + o, b = D / 2 + o, rh = 3.2;
  roof.add(b3dHipRoof(a, b, H, rh, M.roof));
  b3dBox(roof, 2 * a, 0.25, 0.12, M.white, 0, H - 0.05, b, true);
  b3dBox(roof, 2 * a, 0.25, 0.12, M.white, 0, H - 0.05, -b, true);
  var theta = Math.atan(rh / b);
  for (var px = 0; px < 4; px++) for (var pz = 0; pz < 2; pz++) {
    var zc = 2.2 + pz * 1.15, p = b3dBox(roof, 1.5, 0.06, 1.0, M.panel, -7 + px * 1.6, H + rh * (1 - zc / b) + 0.06, zc, true);
    p.rotation.x = theta;
  }
  B3D.built = nf;
  B3D.labelLayer.innerHTML = ''; B3D.labels = {};
}
// A framed window on a wall. axis 'z' = front/back wall, 'x' = side wall; sign = which way it faces
function b3dWin(parent, x, y, z, w, h, axis, sign, glassMat, frameMat) {
  var frame, glass;
  if (axis === 'z') {
    frame = b3dBox(parent, w + 0.24, h + 0.24, 0.1, frameMat, x, y, z + sign * 0.06, true);
    glass = b3dBox(parent, w, h, 0.06, glassMat, x, y, z + sign * 0.1, true);
  } else {
    frame = b3dBox(parent, 0.1, h + 0.24, w + 0.24, frameMat, x + sign * 0.06, y, z, true);
    glass = b3dBox(parent, 0.06, h, w, glassMat, x + sign * 0.1, y, z, true);
  }
  return glass;
}

/* ---------- live room colours and labels ---------- */
function b3dUpdate() {
  var by = {};
  roomsSorted().forEach(function (r) { var f = roomFloor(r); (by[f] = by[f] || []).push(r); });
  var seen = {};
  B3D.slots.forEach(function (row, f) {
    row.forEach(function (slot, i) {
      var r = (by[f] || [])[i] || null, st = r ? displayStatus(r) : null, col = st ? B3D_STATUS[st] : '#3F8F7F';
      slot.room = r;
      slot.glass.color.set(col); slot.glass.emissive.set(r ? col : '#000000'); slot.glass.emissiveIntensity = r ? 0.35 : 0;
      slot.plate.color.set(r ? col : '#D8D0BC');
      var key = f + '-' + i; if (!r) return; seen[key] = 1;
      var el = B3D.labels[key];
      if (!el) { el = document.createElement('button'); el.type = 'button'; B3D.labelLayer.appendChild(el); B3D.labels[key] = el; }
      var s = stayOf(r), flag = st === 'occupied' && s && (isOverstay(s) || dueOutToday(s) || (s.balance || 0) > 0);
      el.className = 'b3d-label ' + ROOM_STATUS[st].cls;
      el.textContent = r.number + (flag ? ' !' : '');
      el.setAttribute('aria-label', 'Room ' + r.number + ', ' + ROOM_STATUS[st].label);
      el.title = 'Room ' + r.number + ' · ' + ROOM_STATUS[st].label + (s && st === 'occupied' ? ' · ' + s.guestName : '');
      el.onclick = (function (id) { return function () { openRoom(id); }; })(r.id);
    });
  });
  Object.keys(B3D.labels).forEach(function (k) { if (!seen[k]) { B3D.labels[k].remove(); delete B3D.labels[k]; } });
}
function b3dApplyFloor() {
  var all = B3D.floor === 'all', k = all ? -1 : +B3D.floor;
  B3D.floors.forEach(function (fl, f) {
    fl.shell.visible = all || f < k;
    fl.plan.visible = !all && f === k;
  });
  if (B3D.roof) B3D.roof.visible = all;
  B3D.target.set(0, all ? B3D.built * B3D_FH * 0.55 : k * B3D_FH + 0.6, 0);
}
function b3dVisible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function b3dLabels() {
  if (!B3D.host) return;
  var w = B3D.renderer.domElement.clientWidth, h = B3D.renderer.domElement.clientHeight, all = B3D.floor === 'all', cam = B3D.camera;
  B3D.slots.forEach(function (row, f) {
    row.forEach(function (slot, i) {
      var el = B3D.labels[f + '-' + i]; if (!el) return;
      var show = all ? true : f === +B3D.floor;
      var p = all ? slot.facePos : slot.planPos;
      if (show && all) show = (cam.position.z - p.z) * slot.face > 0;
      var v = p.clone().project(cam);
      if (!show || v.z > 1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = 'translate(' + Math.round((v.x + 1) / 2 * w) + 'px,' + Math.round((1 - v.y) / 2 * h) + 'px) translate(-50%,-50%)';
    });
  });
}
function b3dDraw() {
  if (!B3D.renderer || !B3D.el.isConnected) return;
  var c = B3D.camera, t = B3D.target, cp = Math.cos(B3D.pitch);
  c.position.set(t.x + B3D.dist * Math.sin(B3D.yaw) * cp, t.y + B3D.dist * Math.sin(B3D.pitch), t.z + B3D.dist * Math.cos(B3D.yaw) * cp);
  c.lookAt(t);
  B3D.renderer.render(B3D.scene, c);
  b3dLabels();
}
function b3dResize() {
  if (!B3D.host || !B3D.host.isConnected) return;
  var w = B3D.host.clientWidth || 600, h = Math.round(Math.max(320, Math.min(580, w * 0.62)));
  if (w === B3D.lastW) return b3dDraw();
  B3D.lastW = w;
  B3D.renderer.setSize(w, h); B3D.camera.aspect = w / h; B3D.camera.updateProjectionMatrix(); b3dDraw();
}

/* ---------- controls ---------- */
function b3dFloor(v) { B3D.floor = v; if (v !== 'all') { B3D.pitch = Math.max(B3D.pitch, 0.95); B3D.dist = Math.min(B3D.dist, 36); } render(); }
function b3dView(which) { B3D.yaw = which === 'back' ? Math.PI - 0.45 : -0.55; if (B3D.floor === 'all') B3D.pitch = 0.38; b3dDraw(); }
function b3dZoom(f) { B3D.dist = Math.max(16, Math.min(95, B3D.dist * f)); b3dDraw(); }
function b3dControls(cv) {
  var pts = {}, moved = 0, pinch = 0;
  cv.addEventListener('pointerdown', function (e) { pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = 0; pinch = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', function (e) {
    var p = pts[e.pointerId]; if (!p) return;
    var ids = Object.keys(pts);
    if (ids.length === 2) {
      p.x = e.clientX; p.y = e.clientY;
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) b3dZoom(pinch / d); pinch = d; moved += 10; return;
    }
    var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    B3D.yaw -= dx * 0.008;
    if (e.pointerType !== 'touch') B3D.pitch = Math.max(0.06, Math.min(1.4, B3D.pitch + dy * 0.006));
    b3dDraw();
  });
  function up(e) {
    var wasTap = moved < 6 && Object.keys(pts).length === 1;
    delete pts[e.pointerId];
    if (wasTap && e.type === 'pointerup') b3dPick(e);
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); b3dZoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
}
function b3dPick(e) {
  var rect = B3D.renderer.domElement.getBoundingClientRect();
  var v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  var ray = new THREE.Raycaster(); ray.setFromCamera(v, B3D.camera);
  var hits = ray.intersectObjects(B3D.pick.filter(b3dVisible), false);
  if (!hits.length) return;
  var s = hits[0].object.userData.slot, slot = B3D.slots[s[0]][s[1]];
  if (slot.room) openRoom(slot.room.id);
}
