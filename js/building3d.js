/* =========================================================
   3D MODEL OF THE WIWE BUILDING
   Matched to the opening video and flyer: a 3-storey cream block, long
   side facing the road and gate. At the left end (seen from the road) is
   the entrance face: an arched bay stacked over 3 floors (entrance and
   reception on the ground floor, balconies above), two tall louvred
   windows on the road side of the bay, one smaller window on the back
   side, and a raised parapet. A central corridor runs from the entrance;
   on every floor rooms 1–2 face the road and rooms 3–5 face the back,
   counted from the entrance end.
   Coordinates: x along the building (entrance end at x = -10), z towards
   the road (+z), y up. three.js r128 is loaded from cdnjs when needed.
   ========================================================= */
var B3D_STATUS = { ready: '#2FA36B', reserved: '#8B6BD6', occupied: '#3A73D9', dirty: '#E07B2A', cleaning: '#E5B52D', inspect: '#E5B52D', ooo: '#8E8E8E' };
var B3D = { renderer: null, scene: null, camera: null, el: null, labelLayer: null, built: 0, floor: 'all', yaw: -0.62, pitch: 0.36, dist: 46, target: null, waiters: [], loading: false, failed: false, floors: [], slots: [], roof: null, pick: [], host: null, ro: null, dark: null, labels: {}, focus: null, pulse: 0 };
var B3D_L = 20, B3D_D = 12, B3D_FH = 3.2, B3D_BAND = 1.6, B3D_LOBBY = -6.5;
// Room positions on a floor, in board order (position 1..5)
var B3D_SLOTS = [
  { x0: -10, x1: 0, z0: B3D_BAND, z1: 6, face: 1, big: -5.6, small: -1.8, end: 'small' },
  { x0: 0, x1: 10, z0: B3D_BAND, z1: 6, face: 1, big: 4, small: 7.8, end: 'east' },
  { x0: -10, x1: -10 / 3, z0: -6, z1: -B3D_BAND, face: -1, big: -6.4, small: -4.3, end: 'tall' },
  { x0: -10 / 3, x1: 10 / 3, z0: -6, z1: -B3D_BAND, face: -1, big: -0.6, small: 1.9, end: null },
  { x0: 10 / 3, x1: 10, z0: -6, z1: -B3D_BAND, face: -1, big: 6.2, small: 8.6, end: 'east' }
];
var B3D_POS_NAMES = ['road side, by the entrance', 'road side, far end', 'back, by the entrance', 'back, middle', 'back, far end'];

function b3dFloorCount() { var m = 2; roomsSorted().forEach(function (r) { m = Math.max(m, roomFloor(r)); }); return m + 1; }
// Where a room sits: { floor, pos (0..4) }
function b3dPlace(room) {
  var f = roomFloor(room), same = roomsSorted().filter(function (r) { return roomFloor(r) === f; });
  return { floor: f, pos: same.indexOf(room) };
}
function roomWhere(room) { var p = b3dPlace(room); return floorName(p.floor) + (p.pos >= 0 && p.pos < 5 ? ', ' + B3D_POS_NAMES[p.pos] : ''); }
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

/* ---------- HTML around the model ---------- */
function building3dHtml() {
  if (B3D.failed) return '<div class="note warn">The 3D view could not load (it needs internet the first time). Showing the floor plan instead.</div>' + buildingMap(roomsSorted());
  var nf = b3dFloorCount(), fl = [['all', 'Whole building']];
  for (var i = 0; i < nf; i++) fl.push([String(i), floorName(i)]);
  var over = [];
  for (var f = 0; f < nf; f++) { var n = roomsSorted().filter(function (r) { return roomFloor(r) === f; }).length; if (n > 5) over.push(floorName(f)); }
  var legend = [['ready', 'Ready'], ['occupied', 'Occupied'], ['reserved', 'Reserved'], ['dirty', 'Dirty'], ['cleaning', 'Cleaning / inspection'], ['ooo', 'Out of order']];
  return '<div class="b3d-wrap">' +
    '<div class="row between"><div class="seg" role="group" aria-label="Floor to show">' + fl.map(function (x) { var on = String(B3D.floor) === x[0]; return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" onclick="b3dFloor(\'' + x[0] + '\')">' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
    '<div class="row"><label class="sr-only" for="b3d-find">Find a room</label><select id="b3d-find" class="search b3d-find" onchange="if(this.value)b3dFocus(this.value)"><option value="">Find a room…</option>' + roomsSorted().map(function (r) { return '<option value="' + r.id + '"' + (B3D.focus === r.id ? ' selected' : '') + '>Room ' + esc(r.number) + ' · ' + esc(floorName(roomFloor(r))) + '</option>'; }).join('') + '</select>' +
    '<button class="btn small" type="button" onclick="b3dView(\'front\')">Road side</button><button class="btn small" type="button" onclick="b3dView(\'entrance\')">Entrance</button><button class="btn small" type="button" onclick="b3dView(\'back\')">Back</button>' +
    '<button class="btn small" type="button" aria-label="Zoom in" onclick="b3dZoom(0.85)">+</button><button class="btn small" type="button" aria-label="Zoom out" onclick="b3dZoom(1.18)">−</button></div></div>' +
    '<div id="b3d-host" class="b3d-host"><div class="empty">Loading the 3D building…</div></div>' +
    '<div class="b3d-legend" aria-label="Colour key">' + legend.map(function (l) { return '<span><i style="background:' + B3D_STATUS[l[0]] + '"></i>' + l[1] + '</span>'; }).join('') + '<span><i style="background:#3F8F7F"></i>Corridor / stairs window</span></div>' +
    (B3D.focus && byId(S.data.rooms, B3D.focus) ? '<div class="note">' + (function (r) { return '<strong>Room ' + esc(r.number) + '</strong> is on the ' + esc(roomWhere(r).toLowerCase()) + '. ' + pill(ROOM_STATUS[displayStatus(r)].label, ROOM_STATUS[displayStatus(r)].cls) + ' <button class="btn small" type="button" onclick="openRoom(\'' + r.id + '\')">Open room</button>'; })(byId(S.data.rooms, B3D.focus)) + '</div>' : '') +
    (over.length ? '<div class="note warn">' + esc(over.join(', ')) + ' has more than 5 rooms; only the first 5 are drawn. Check floors in Admin settings → Rooms.</div>' : '') +
    '<div class="muted small">Each room has its number on the wall and on its floor. On every floor, rooms 1–2 face the road and 3–5 face the back, counted from the entrance end. Drag to turn · pinch or scroll to zoom · tap a room · pick a floor to look inside.</div></div>';
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

/* ---------- three.js helpers ---------- */
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
function b3dHipRoof(a, b, y, rh, mat) {
  var rx = Math.max(0, a - b);
  var p0 = [-a, y, b], p1 = [a, y, b], p2 = [a, y, -b], p3 = [-a, y, -b], r0 = [-rx, y + rh, 0], r1 = [rx, y + rh, 0];
  var tris = [p0, p1, r1, p0, r1, r0, p2, p3, r0, p2, r0, r1, p1, p2, r1, p3, p0, r0];
  var pos = []; tris.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  var m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
// Window: axis 'z' = long walls (faces ±z), 'x' = end walls (faces ±x)
function b3dWin(parent, x, y, z, w, h, axis, sign, glassMat, frameMat, louvre) {
  var glass;
  if (axis === 'z') {
    b3dBox(parent, w + 0.24, h + 0.24, 0.1, frameMat, x, y, z + sign * 0.06, true);
    glass = b3dBox(parent, w, h, 0.06, glassMat, x, y, z + sign * 0.1, true);
  } else {
    b3dBox(parent, 0.1, h + 0.24, w + 0.24, frameMat, x + sign * 0.06, y, z, true);
    glass = b3dBox(parent, 0.06, h, w, glassMat, x + sign * 0.1, y, z, true);
    if (louvre) for (var k = -h / 2 + 0.2; k < h / 2; k += 0.25) b3dBox(parent, 0.05, 0.04, w, frameMat, x + sign * 0.14, y + k, z, true);
  }
  return glass;
}
// A sign or number plaque drawn on a canvas
function b3dSign(text, w, h, opts) {
  opts = opts || {};
  var c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  var tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.userData.sign = { canvas: c, tex: tex };
  b3dPaintSign(mesh, text, opts);
  return mesh;
}
function b3dPaintSign(mesh, text, opts) {
  var s = mesh.userData.sign, c = s.canvas, g = c.getContext('2d'), W = c.width, H = c.height, r = Math.min(40, H / 3);
  g.clearRect(0, 0, W, H);
  g.fillStyle = opts.bg || '#FFFFFF';
  g.beginPath(); g.moveTo(r, 0); g.lineTo(W - r, 0); g.quadraticCurveTo(W, 0, W, r); g.lineTo(W, H - r); g.quadraticCurveTo(W, H, W - r, H); g.lineTo(r, H); g.quadraticCurveTo(0, H, 0, H - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.fill();
  if (opts.stripe) { g.fillStyle = opts.stripe; g.fillRect(0, H - H * 0.2, W, H * 0.2); }
  if (opts.border) { g.lineWidth = 14; g.strokeStyle = opts.border; g.stroke(); }
  g.fillStyle = opts.fg || '#111111';
  var size = opts.size || Math.round(H * 0.62);
  g.font = '700 ' + size + 'px "Space Grotesk", Inter, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, opts.stripe ? H * 0.42 : H * 0.53);
  s.tex.needsUpdate = true; s.text = text;
}

/* ---------- build the scene ---------- */
function b3dBuild() {
  var dark = document.body.classList.contains('dark-mode');
  B3D.dark = dark;
  var nf = b3dFloorCount(), L = B3D_L, D = B3D_D, FH = B3D_FH, H = nf * FH, XE = -L / 2;
  var sc = new THREE.Scene(); B3D.scene = sc;
  sc.background = new THREE.Color(dark ? '#1C2126' : '#DCE7EF');
  sc.add(new THREE.HemisphereLight(dark ? '#9AA6B8' : '#FFFFFF', '#B8A88A', dark ? 0.45 : 0.62));
  var sun = new THREE.DirectionalLight('#FFF3DD', dark ? 0.55 : 0.85);
  sun.position.set(-26, 38, 22); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  var sh = sun.shadow.camera; sh.left = -30; sh.right = 30; sh.top = 30; sh.bottom = -30; sh.near = 1; sh.far = 130;
  sc.add(sun);
  var M = {
    wall: b3dMat('#F2DE9C'), band: b3dMat('#E8D08A'), white: b3dMat('#F7F5EE'), roof: b3dMat('#5B3527', { side: THREE.DoubleSide }),
    win: b3dMat('#3F8F7F', { roughness: 0.3 }), rail: b3dMat('#262626'), door: b3dMat('#2B211B'), ac: b3dMat('#EDEDED'), cap: b3dMat('#3A3A3A'), red: b3dMat('#C62B2B'),
    ground: b3dMat('#CFC5AC'), paving: b3dMat('#8E8B85'), road: b3dMat('#A98B64'), fence: b3dMat('#EFD98E'), pillar: b3dMat('#4F86C6'), gate: b3dMat('#1E1E1E'),
    panel: b3dMat('#1F2C4A', { roughness: 0.4, metalness: 0.3 }), plan: b3dMat('#EAE3D1'), corr: b3dMat('#D8D0BB'), lobby: b3dMat('#2A2A2A', { roughness: 0.3 }), low: b3dMat('#F3E6BD'), bed: b3dMat('#FFFFFF'), wood: b3dMat('#B9874E'), sofa: b3dMat('#8C8C8C')
  };

  // Compound
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
  b3dBox(sc, 7, 0.03, 9, M.paving, XE - 3.6, 0.015, 0, true).receiveShadow = true;
  b3dBox(sc, 90, 0.04, 11, M.road, 0, 0.02, 20, true).receiveShadow = true;
  var WX = 17, WN = 14, WS = -12, WH = 2.2;
  b3dBox(sc, WX - 2.6, WH, 0.3, M.fence, -(WX + 2.6) / 2, WH / 2, WN);
  b3dBox(sc, WX - 2.6, WH, 0.3, M.fence, (WX + 2.6) / 2, WH / 2, WN);
  b3dBox(sc, 2 * WX, WH, 0.3, M.fence, 0, WH / 2, WS);
  b3dBox(sc, 0.3, WH, WN - WS, M.fence, -WX, WH / 2, (WN + WS) / 2);
  b3dBox(sc, 0.3, WH, WN - WS, M.fence, WX, WH / 2, (WN + WS) / 2);
  [-WX, -11, -5.5, -2.6, 2.6, 5.5, 11, WX].forEach(function (x) { b3dBox(sc, 0.55, WH + 0.3, 0.55, M.pillar, x, (WH + 0.3) / 2, WN); });
  [-WX, -8, 0, 8, WX].forEach(function (x) { b3dBox(sc, 0.55, WH + 0.3, 0.55, M.pillar, x, (WH + 0.3) / 2, WS); });
  b3dBox(sc, 4.9, 2.5, 0.15, M.gate, 0, 1.3, WN);
  var gh = new THREE.Group(); gh.position.set(-13.4, 0, 10); sc.add(gh);
  b3dBox(gh, 3.4, 2.6, 3.4, M.wall, 0, 1.3, 0); b3dBox(gh, 1, 2, 0.1, M.door, 0.6, 1, 1.72);
  gh.add(b3dHipRoof(2.2, 2.2, 2.6, 1.3, M.roof));
  // Ground signs
  var road = b3dSign('ROAD · GATE', 6, 1.2, { bg: '#161616', fg: '#F4E6B8' }); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.06, 17); sc.add(road);

  B3D.floors = []; B3D.slots = []; B3D.pick = [];
  for (var f = 0; f < nf; f++) {
    var y0 = f * FH, wallH = FH - 0.3, wy = y0 + wallH / 2;
    var shell = new THREE.Group(), plan = new THREE.Group(); sc.add(shell); sc.add(plan);
    b3dBox(shell, L + 0.3, 0.3, D + 0.3, M.band, 0, y0 + FH - 0.15, 0);
    if (f === 0) b3dBox(shell, L + 0.5, 0.35, D + 0.5, M.band, 0, 0.17, 0);
    // long walls and far end
    b3dBox(shell, L, wallH, 0.25, M.wall, 0, wy, D / 2 - 0.125);
    b3dBox(shell, L, wallH, 0.25, M.wall, 0, wy, -D / 2 + 0.125);
    b3dBox(shell, 0.25, wallH, D, M.wall, L / 2 - 0.125, wy, 0);
    // entrance end: walls either side of the arched bay, recessed bay behind
    b3dBox(shell, 0.25, wallH, D / 2 - 2, M.wall, XE + 0.125, wy, (D / 2 + 2) / 2);
    b3dBox(shell, 0.25, wallH, D / 2 - 2, M.wall, XE + 0.125, wy, -(D / 2 + 2) / 2);
    b3dBox(shell, 0.25, wallH, 4, M.wall, XE + 1.5, wy, 0);
    b3dBox(shell, 1.5, wallH, 0.2, M.wall, XE + 0.75, wy, 2); b3dBox(shell, 1.5, wallH, 0.2, M.wall, XE + 0.75, wy, -2);
    b3dBox(shell, 1.5, 0.18, 4, M.band, XE + 0.75, y0 + 0.09, 0);
    var shp = new THREE.Shape(); shp.moveTo(-2, 0); shp.lineTo(2, 0); shp.lineTo(2, wallH); shp.lineTo(-2, wallH); shp.lineTo(-2, 0);
    var hole = new THREE.Path(), hr = 1.45, hs = 1.05;
    hole.moveTo(-hr, 0.02); hole.lineTo(hr, 0.02); hole.lineTo(hr, hs); hole.absarc(0, hs, hr, 0, Math.PI, false); hole.lineTo(-hr, 0.02);
    shp.holes.push(hole);
    var arch = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.28, bevelEnabled: false }), M.wall);
    arch.rotation.y = Math.PI / 2; arch.position.set(XE, y0, 0); arch.castShadow = true; arch.receiveShadow = true; shell.add(arch);
    b3dBox(shell, 0.08, 0.08, 2.8, M.rail, XE + 0.2, y0 + 1.05, f === 0 ? -0.55 : 0);
    for (var bz = (f === 0 ? -1.4 : -1.4); bz <= (f === 0 ? 0.3 : 1.4); bz += 0.35) b3dBox(shell, 0.04, 1.0, 0.04, M.rail, XE + 0.2, y0 + 0.55, bz, true);
    b3dBox(shell, 0.08, 2.15, 1.0, M.door, XE + 1.36, y0 + 1.1, 0.95);
    b3dWin(shell, XE + 1.36, y0 + 1.5, -0.9, 0.9, 1.2, 'x', -1, M.win, M.white);
    b3dBox(shell, 0.3, 0.45, 0.8, M.ac, XE + 1.2, y0 + 2.45, -0.9);
    if (f === 0) {
      b3dBox(shell, 0.05, 0.4, 0.3, M.red, XE + 1.34, y0 + 1.5, 0.2, true);
      b3dBox(shell, 1.1, 0.2, 3.6, M.lobby, XE - 0.45, 0.1, 0);
      var ent = b3dSign('ENTRANCE', 2.6, 0.55, { bg: '#161616', fg: '#F4E6B8' }); ent.rotation.y = -Math.PI / 2; ent.position.set(XE - 0.05, FH - 0.45, 0); shell.add(ent);
    }
    // white pilasters
    [XE, 0, L / 2].forEach(function (x) { b3dBox(shell, 0.6, wallH + 0.3, 0.2, M.white, x, y0 + (wallH + 0.3) / 2, D / 2 + 0.02); });
    [XE, L / 2].forEach(function (x) { b3dBox(shell, 0.6, wallH + 0.3, 0.2, M.white, x, y0 + (wallH + 0.3) / 2, -D / 2 - 0.02); });
    [D / 2, -D / 2, 2.15, -2.15].forEach(function (z) { b3dBox(shell, 0.2, wallH + 0.3, 0.5, M.white, XE - 0.02, y0 + (wallH + 0.3) / 2, z); });

    // rooms
    var row = [];
    B3D_SLOTS.forEach(function (s, i) {
      var glass = b3dMat('#3F8F7F', { roughness: 0.25, emissive: '#000000' }), plateMat = b3dMat('#D8D0BC');
      var cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, w = s.x1 - s.x0, d = s.z1 - s.z0, faceZ = s.face * D / 2;
      var gl = [b3dWin(shell, s.big, y0 + 1.6, faceZ, 1.7, 1.5, 'z', s.face, glass, M.white), b3dWin(shell, s.small, y0 + 2.05, faceZ, 0.75, 0.75, 'z', s.face, glass, M.white)];
      b3dBox(shell, 0.85, 0.55, 0.3, M.ac, s.big + 1.45, y0 + 2.35, faceZ + s.face * 0.2);
      if (s.end === 'tall') { gl.push(b3dWin(shell, XE, y0 + 1.45, -3.4, 0.6, 1.9, 'x', -1, glass, M.white, true)); gl.push(b3dWin(shell, XE, y0 + 1.45, -4.5, 0.6, 1.9, 'x', -1, glass, M.white, true)); }
      if (s.end === 'small') gl.push(b3dWin(shell, XE, y0 + 1.8, 4, 1.1, 0.9, 'x', -1, glass, M.white));
      if (s.end === 'east') gl.push(b3dWin(shell, L / 2, y0 + 1.6, cz, 1.4, 1.3, 'x', 1, glass, M.white));
      gl.forEach(function (g) { g.userData.slot = [f, i]; B3D.pick.push(g); });
      // number plaque on the outside wall
      var plaque = b3dSign('—', 1.5, 0.75, {}); plaque.position.set(s.big, y0 + 2.75, faceZ + s.face * 0.16); if (s.face < 0) plaque.rotation.y = Math.PI;
      shell.add(plaque); plaque.userData.slot = [f, i]; B3D.pick.push(plaque);
      // look-inside plan
      var plate = b3dBox(plan, w - 0.3, 0.1, d - 0.3, plateMat, cx, y0 + 0.3, cz, true); plate.receiveShadow = true;
      plate.userData.slot = [f, i]; B3D.pick.push(plate);
      var by = s.face > 0 ? s.z1 - 1.3 : s.z0 + 1.3;
      b3dBox(plan, 2.0, 0.45, 2.1, M.bed, s.x1 - 2.2, y0 + 0.55, by);
      [[w, cx, s.z0], [w, cx, s.z1]].forEach(function (p) { b3dBox(plan, p[0], 1.1, 0.15, M.low, p[1], y0 + 0.75, p[2]); });
      [s.x0, s.x1].forEach(function (x) { b3dBox(plan, 0.15, 1.1, d, M.low, x, y0 + 0.75, cz); });
      var floorNo = b3dSign('—', 3.2, 1.6, {}); floorNo.rotation.x = -Math.PI / 2; floorNo.position.set(cx - (w > 7 ? 1.2 : 0.4), y0 + 0.37, cz); plan.add(floorNo);
      floorNo.userData.slot = [f, i]; B3D.pick.push(floorNo);
      row.push({ glass: glass, plate: plateMat, plaque: plaque, floorNo: floorNo, room: null, face: s.face,
        facePos: new THREE.Vector3(s.big, y0 + 2.75, faceZ + s.face * 0.6), planPos: new THREE.Vector3(cx + (w > 7 ? 1.6 : 0.9), y0 + 1.4, cz) });
    });
    // corridor, lobby, stairs
    b3dBox(plan, L, 0.2, D, M.plan, 0, y0 + 0.1, 0, true).receiveShadow = true;
    b3dBox(plan, L / 2 - B3D_LOBBY - 0.3, 0.08, 2 * B3D_BAND - 0.3, M.corr, (B3D_LOBBY + L / 2) / 2, y0 + 0.26, 0, true);
    b3dBox(plan, B3D_LOBBY - XE - 1.5, 0.08, 2 * B3D_BAND + 0.6, f === 0 ? M.lobby : M.corr, (XE + 1.5 + B3D_LOBBY) / 2, y0 + 0.26, 0, true);
    for (var st = 0; st < 7; st++) b3dBox(plan, 0.32, 0.18 * (st + 1), 1.1, M.band, B3D_LOBBY - 0.2 - st * 0.32, y0 + 0.09 * (st + 1), -1.0);
    var lobbySign = b3dSign(f === 0 ? 'RECEPTION' : 'STAIRS', 2.6, 0.7, { bg: '#161616', fg: '#F4E6B8' });
    lobbySign.rotation.x = -Math.PI / 2; lobbySign.position.set((XE + 1.5 + B3D_LOBBY) / 2, y0 + 0.33, 1.0); plan.add(lobbySign);
    var corrSign = b3dSign('CORRIDOR', 3, 0.6, { bg: '#D8D0BB', fg: '#5E5848' }); corrSign.rotation.x = -Math.PI / 2; corrSign.position.set(2, y0 + 0.32, 0); plan.add(corrSign);
    if (f === 0) { b3dBox(plan, 0.6, 1.0, 1.8, M.wood, B3D_LOBBY - 0.6, 0.5, 1.6); b3dBox(plan, 0.9, 0.5, 0.9, M.sofa, XE + 2.3, 0.45, -1.6); }
    B3D.floors.push({ shell: shell, plan: plan });
    B3D.slots.push(row);
  }
  // Raised parapet over the entrance end, then the roof
  var roof = new THREE.Group(); sc.add(roof); B3D.roof = roof;
  b3dBox(sc, 0.3, 1.0, D + 0.3, M.wall, XE, H + 0.5, 0);
  b3dBox(sc, 0.5, 0.14, D + 0.6, M.cap, XE, H + 1.05, 0);
  B3D.parapet = sc.children.slice(-2);
  var o = 0.8, a = L / 2 + o, b = D / 2 + o, rh = 3.0;
  roof.add(b3dHipRoof(a, b, H, rh, M.roof));
  b3dBox(roof, 2 * a, 0.25, 0.12, M.white, 0, H - 0.05, b, true);
  b3dBox(roof, 2 * a, 0.25, 0.12, M.white, 0, H - 0.05, -b, true);
  var theta = Math.atan(rh / b);
  for (var px = 0; px < 4; px++) for (var pz = 0; pz < 2; pz++) {
    var zc = 2.2 + pz * 1.15, p = b3dBox(roof, 1.5, 0.06, 1.0, M.panel, -6 + px * 1.6, H + rh * (1 - zc / b) + 0.06, zc, true);
    p.rotation.x = theta;
  }
  B3D.built = nf;
  B3D.labelLayer.innerHTML = ''; B3D.labels = {};
}

/* ---------- live colours, numbers and labels ---------- */
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
      var focused = r && B3D.focus === r.id;
      var txt = r ? r.number : '—', opt = { stripe: r ? col : null, border: focused ? '#E5007E' : null };
      b3dPaintSign(slot.plaque, txt, opt);
      b3dPaintSign(slot.floorNo, txt, { bg: 'rgba(255,255,255,0.92)', border: focused ? '#E5007E' : null });
      var key = f + '-' + i; if (!r) return; seen[key] = 1;
      var el = B3D.labels[key];
      if (!el) { el = document.createElement('button'); el.type = 'button'; B3D.labelLayer.appendChild(el); B3D.labels[key] = el; }
      var s = stayOf(r), flag = st === 'occupied' && s && (isOverstay(s) || dueOutToday(s) || (s.balance || 0) > 0);
      el.className = 'b3d-label ' + ROOM_STATUS[st].cls + (focused ? ' focus' : '');
      el.innerHTML = '<strong>' + esc(r.number) + '</strong> ' + esc(ROOM_STATUS[st].label) + (flag ? ' <span class="b3d-bang">!</span>' : '');
      el.setAttribute('aria-label', 'Room ' + r.number + ', ' + ROOM_STATUS[st].label + ', ' + roomWhere(r));
      el.title = 'Room ' + r.number + ' · ' + roomType(r).name + ' · ' + roomWhere(r) + (s && st === 'occupied' ? ' · ' + s.guestName : '');
      el.onclick = (function (id) { return function () { openRoom(id); }; })(r.id);
    });
  });
  Object.keys(B3D.labels).forEach(function (k) { if (!seen[k]) { B3D.labels[k].remove(); delete B3D.labels[k]; } });
}
function b3dApplyFloor() {
  var all = B3D.floor === 'all', k = all ? -1 : +B3D.floor;
  B3D.floors.forEach(function (fl, f) { fl.shell.visible = all || f < k; fl.plan.visible = !all && f === k; });
  if (B3D.roof) B3D.roof.visible = all;
  (B3D.parapet || []).forEach(function (p) { p.visible = all; });
  if (all && B3D.focusPos) B3D.target.copy(B3D.focusPos);
  else B3D.target.set(-1, all ? B3D.built * B3D_FH * 0.5 : k * B3D_FH + 0.6, 0);
}
function b3dVisible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function b3dLabels() {
  if (!B3D.host) return;
  var w = B3D.renderer.domElement.clientWidth, h = B3D.renderer.domElement.clientHeight, all = B3D.floor === 'all', cam = B3D.camera;
  B3D.slots.forEach(function (row, f) {
    row.forEach(function (slot, i) {
      var el = B3D.labels[f + '-' + i]; if (!el) return;
      var show = all ? true : f === +B3D.floor, p = all ? slot.facePos : slot.planPos;
      if (show && all) show = (cam.position.z - p.z) * slot.face > 0 || (slot.room && B3D.focus === slot.room.id);
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
  var w = B3D.host.clientWidth || 600, h = Math.round(Math.max(340, Math.min(600, w * 0.64)));
  if (w === B3D.lastW) return b3dDraw();
  B3D.lastW = w;
  B3D.renderer.setSize(w, h); B3D.camera.aspect = w / h; B3D.camera.updateProjectionMatrix(); b3dDraw();
}

/* ---------- controls ---------- */
function b3dFloor(v) { B3D.floor = v; B3D.focusPos = null; if (v !== 'all') { B3D.pitch = Math.max(B3D.pitch, 0.95); B3D.dist = Math.min(B3D.dist, 36); } render(); }
function b3dView(which) {
  B3D.yaw = which === 'back' ? Math.PI - 0.35 : which === 'entrance' ? -1.35 : -0.3;
  if (B3D.floor === 'all') B3D.pitch = 0.3;
  B3D.focusPos = null; b3dApplyFloor(); b3dDraw();
}
function b3dZoom(f) { B3D.dist = Math.max(14, Math.min(95, B3D.dist * f)); b3dDraw(); }
// Turn to a room and make it flash
function b3dFocus(id) {
  var r = byId(S.data.rooms, id); if (!r) return;
  var p = b3dPlace(r), s = B3D_SLOTS[p.pos]; if (!s) return toast('Room ' + r.number + ' is not on the model (more than 5 rooms on its floor)', true);
  B3D.focus = id; B3D.floor = 'all';
  B3D.yaw = s.face > 0 ? -0.25 + s.big * 0.02 : Math.PI + 0.25 + s.big * 0.02;
  B3D.pitch = 0.18 + p.floor * 0.06; B3D.dist = 30;
  B3D.focusPos = new THREE.Vector3(s.big, p.floor * B3D_FH + 1.6, 0);
  render();
  b3dPulse();
}
function b3dPulse() {
  var start = performance.now();
  (function tick(now) {
    var f = B3D.focus && byId(S.data.rooms, B3D.focus); if (!f || !B3D.el || !B3D.el.isConnected) return;
    var p = b3dPlace(f), slot = B3D.slots[p.floor] && B3D.slots[p.floor][p.pos]; if (!slot) return;
    var k = (Math.sin((now - start) / 180) + 1) / 2;
    slot.glass.emissiveIntensity = 0.3 + k * 0.9;
    b3dDraw();
    if (now - start < 4000) requestAnimationFrame(tick); else { slot.glass.emissiveIntensity = 0.35; b3dDraw(); }
  })(start);
}
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

/* ---------- "Building" page for every staff member ---------- */
VIEWS.building = {
  title: 'Building',
  eyebrow: function () { return 'Wiwe Apartments · Onilude Street, Sowhe'; },
  render: function () { return building3dHtml(); }
};
