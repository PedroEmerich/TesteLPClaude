/* =============================================================
   teeth.js — modelos dentários procedurais (Three.js r128)
   Usado pela landing page (dente interativo e dentes flutuantes do hero)
   e por tools/render-assets.html (gera as imagens de assets/img).

   API (window.Teeth):
     buildMolar({ detail })          → { group, setState(m), anchors }
                                       m = 0 dente "doente" … 1 dente saudável
     buildIncisor(type, opts)        → Mesh   (central | lateral | canine | premolar)
     buildArch({ ugly, seed })       → Group  (arcada superior + inferior com gengiva)
     buildImplant()                  → Group  (parafuso + pilar + coroa, vista explodida)
     buildVeneer()                   → Group  (incisivo + lente de contato cerâmica)
     studioEnvironment(renderer, scene)  mapa de reflexo de estúdio claro
   ============================================================= */
(() => {
  'use strict';
  const T = THREE;

  /* ---------- utilitários ---------- */
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash3 = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const s = t => t * t * (3 - 2 * t);
    const u = s(x - xi), v = s(y - yi), w = s(z - zi);
    let r = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++)
      r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    return r;
  }
  const fbm = (x, y, z) => noise3(x, y, z) * .5 + noise3(x * 2.1, y * 2.1, z * 2.1) * .3 + noise3(x * 4.3, y * 4.3, z * 4.3) * .2;
  const col = hex => new T.Color(hex);
  const mixInto = (out, a, b, t) => { out.r = lerp(a.r, b.r, t); out.g = lerp(a.g, b.g, t); out.b = lerp(a.b, b.b, t); return out; };

  /* Esfera unitária indexada sem costura (normais suaves após deformar) */
  const sphereCache = {};
  function unitSphere(ws, hs) {
    const key = ws + 'x' + hs;
    if (sphereCache[key]) return sphereCache[key];
    const g = new T.SphereGeometry(1, ws, hs);
    const p = g.attributes.position, idx = g.index.array;
    const map = new Map(), verts = [], remap = new Uint32Array(p.count);
    const r = v => Math.round(v * 1e4);
    for (let i = 0; i < p.count; i++) {
      const k = r(p.getX(i)) + ',' + r(p.getY(i)) + ',' + r(p.getZ(i));
      let j = map.get(k);
      if (j === undefined) { j = verts.length / 3; map.set(k, j); verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
      remap[i] = j;
    }
    const tri = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
      if (a !== b && b !== c && a !== c) tri.push(a, b, c);
    }
    g.dispose();
    return (sphereCache[key] = { verts: new Float32Array(verts), index: tri });
  }

  /* Cria geometria deformando a esfera; shapeFn(nx,ny,nz) → [x,y,z]; colorFn(nx,ny,nz,Color) */
  function deformed(ws, hs, shapeFn, colorFn) {
    const s = unitSphere(ws, hs), n = s.verts.length / 3;
    const pos = new Float32Array(n * 3), cols = colorFn ? new Float32Array(n * 3) : null;
    const c = new T.Color();
    for (let i = 0; i < n; i++) {
      const nx = s.verts[i * 3], ny = s.verts[i * 3 + 1], nz = s.verts[i * 3 + 2];
      pos.set(shapeFn(nx, ny, nz), i * 3);
      if (cols) { colorFn(nx, ny, nz, c); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    if (cols) g.setAttribute('color', new T.BufferAttribute(cols, 3));
    g.setIndex(s.index);
    g.computeVertexNormals();
    return g;
  }

  /* Materiais base */
  const enamelMat = (o = {}) => new T.MeshPhysicalMaterial(Object.assign({
    vertexColors: true, roughness: .3, metalness: 0, clearcoat: .8, clearcoatRoughness: .14, reflectivity: .35, envMapIntensity: .32,
  }, o));
  const gumMat = hex => new T.MeshPhysicalMaterial({ color: hex, roughness: .5, clearcoat: .5, clearcoatRoughness: .35, envMapIntensity: .25 });

  /* =============================================================
     MOLAR (coroa + 2 raízes) com transição doente → saudável
     ============================================================= */
  const CAVITY_DIR = new T.Vector3(.32, 1, .22).normalize();

  function crownShape(nx, ny, nz, ugly) {
    const phi = Math.atan2(nz, nx), c = Math.cos(phi), s = Math.sin(phi);
    const p = 3.2;
    const sq = 1 / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);
    let R = Math.hypot(nx, nz) * sq, y;
    if (ny < 0) { const t = Math.min(1, -ny); R *= 1 - .36 * t; y = ny * .72; } else y = ny * .7;
    R *= .9;

    const top = smooth(.25, .9, ny);
    const cuspAmp = ugly ? .1 : .16;                       // dente doente: cúspides desgastadas
    y += top * cuspAmp * (.5 + .5 * Math.cos(4 * phi - Math.PI));
    y -= .12 * smooth(.82, 1, ny);                          // fossa central
    y -= .05 * smooth(.6, 1, ny) * Math.pow(Math.abs(Math.cos(2 * phi)), 8); // sulcos

    if (ugly) {
      // fratura em uma cúspide
      const chip = smooth(.45, .9, ny) * Math.pow(Math.max(0, Math.cos(phi - 2.36)), 6);
      y -= .24 * chip; R *= 1 - .1 * chip;
      // cavidade (cárie)
      const d = nx * CAVITY_DIR.x + ny * CAVITY_DIR.y + nz * CAVITY_DIR.z;
      y -= .07 * smooth(.95, .99, d);
      // irregularidades + tártaro no colo
      R += (fbm(nx * 4 + 3, ny * 4, nz * 4) - .5) * .05;
      const band = smooth(-.8, -.6, ny) * (1 - smooth(-.4, -.25, ny));
      R += band * fbm(nx * 9, ny * 9, nz * 9) * .07;
    }
    return [R * c * 1.08, y + .55, R * s * .98];
  }

  const C = {
    enamel: col('#ECE9E2'), enamelTip: col('#DCE5EA'), ivory: col('#EADFC8'),
    yellow: col('#DEC994'), stain: col('#94703C'), cavity: col('#3A2717'), cavityRim: col('#6E4B27'),
    tartar: col('#B89B5E'), groove: col('#8C6A3C'),
    rootNice: col('#EBDDBF'), rootUgly: col('#C5A56A'),
  };

  function crownColor(nx, ny, nz, ugly, out) {
    if (!ugly) {
      mixInto(out, C.enamel, C.enamelTip, smooth(.5, .95, ny) * .7);
      return mixInto(out, out, C.ivory, smooth(-.4, -.9, ny));
    }
    out.copy(C.yellow);
    const f = fbm(nx * 3 + 11, ny * 3 + 7, nz * 3 + 5);
    mixInto(out, out, C.stain, smooth(.6, .74, f) * .75);
    const phi = Math.atan2(nz, nx);
    mixInto(out, out, C.groove, smooth(.6, 1, ny) * Math.pow(Math.abs(Math.cos(2 * phi)), 10) * .8);
    const d = nx * CAVITY_DIR.x + ny * CAVITY_DIR.y + nz * CAVITY_DIR.z;
    mixInto(out, out, C.cavityRim, smooth(.9, .95, d));
    mixInto(out, out, C.cavity, smooth(.95, .985, d));
    const band = smooth(-.85, -.6, ny) * (1 - smooth(-.4, -.25, ny));
    return mixInto(out, out, C.tartar, band * (.5 + .5 * fbm(nx * 8, ny * 8, nz * 8)));
  }

  function rootShape(side, ugly) {
    return (nx, ny, nz) => {
      const t = (1 - ny) / 2;                       // 0 topo → 1 ápice
      let r = Math.hypot(nx, nz) * .5 * (1 - .8 * Math.pow(t, 1.4));
      if (ugly) r *= 1 + (fbm(nx * 5, ny * 5 + side, nz * 5) - .5) * .12;
      const ang = Math.atan2(nz, nx);
      return [side * (.27 + .16 * t * t) + Math.cos(ang) * r, lerp(.25, -1.35, t), Math.sin(ang) * r * .85];
    };
  }

  function buildMolar({ detail = 1 } = {}) {
    const ws = Math.round(150 * detail), hs = Math.round(120 * detail);
    const group = new T.Group();
    const parts = [];

    const addPart = (shapeU, shapeN, colorU, colorN, rws, rhs) => {
      const gN = deformed(rws, rhs, shapeN, colorN);
      const gU = deformed(rws, rhs, shapeU, colorU);
      // geometria base = estado "doente"; morph target = estado saudável
      gU.morphAttributes.position = [gN.attributes.position];
      gU.morphAttributes.normal = [gN.attributes.normal];
      const colU = gU.attributes.color.array.slice(), colN = gN.attributes.color.array;
      const mat = enamelMat({ morphTargets: true, morphNormals: true });
      const mesh = new T.Mesh(gU, mat);
      mesh.updateMorphTargets();
      group.add(mesh);
      parts.push({ mesh, colU, colN });
    };

    addPart((x, y, z) => crownShape(x, y, z, true), (x, y, z) => crownShape(x, y, z, false),
      (x, y, z, o) => crownColor(x, y, z, true, o), (x, y, z, o) => crownColor(x, y, z, false, o), ws, hs);
    [-1, 1].forEach(side => addPart(rootShape(side, true), rootShape(side, false),
      (x, y, z, o) => o.copy(C.rootUgly).lerp(C.stain, smooth(.55, .75, fbm(x * 4, y * 4 + side, z * 4)) * .5),
      (x, y, z, o) => o.copy(C.rootNice), Math.round(48 * detail), Math.round(40 * detail)));

    group.position.y = .25;   // centraliza verticalmente (coroa + raízes)

    let current = -1;
    function setState(m) {
      m = Math.min(1, Math.max(0, m));
      if (Math.abs(m - current) < 1e-4) return;
      current = m;
      parts.forEach(({ mesh, colU, colN }) => {
        mesh.morphTargetInfluences[0] = m;
        const arr = mesh.geometry.attributes.color.array;
        for (let i = 0; i < arr.length; i++) arr[i] = colU[i] + (colN[i] - colU[i]) * m;
        mesh.geometry.attributes.color.needsUpdate = true;
        mesh.material.roughness = lerp(.7, .28, m);
        mesh.material.clearcoat = lerp(.05, .8, m);
      });
    }
    setState(0);

    // Pontos de interesse (espaço local do grupo) para rótulos de diagnóstico
    const pt = (x, y, z) => { const v = new T.Vector3(x, y, z).normalize(); const p = crownShape(v.x, v.y, v.z, true); return new T.Vector3(p[0], p[1] + .25, p[2]); };
    const anchors = {
      carie: pt(CAVITY_DIR.x, CAVITY_DIR.y, CAVITY_DIR.z),
      fratura: pt(Math.cos(2.36), .75, Math.sin(2.36)),
      manchas: pt(.35, .15, .95),
      tartaro: pt(-.15, -.55, 1),
    };
    return { group, setState, anchors };
  }

  /* =============================================================
     DENTES ANTERIORES (para arcada, lente de contato)
     ============================================================= */
  const TYPES = {
    central: { w: .9, h: 1.16, t: .46, p: 3.6 },
    lateral: { w: .7, h: 1.0, t: .42, p: 3.0 },
    canine: { w: .78, h: 1.14, t: .56, p: 2.6, point: true },
    premolar: { w: .72, h: .96, t: .62, p: 2.6 },
  };

  function incisorShape(type, o = {}) {
    const P = TYPES[type];
    return (nx, ny, nz) => {
      const a = Math.atan2(ny, nx), ca = Math.cos(a), sa = Math.sin(a);
      const sq = 1 / Math.pow(Math.pow(Math.abs(ca), P.p) + Math.pow(Math.abs(sa), P.p), 1 / P.p);
      const rxy = Math.hypot(nx, ny);
      let x = rxy * ca * sq * P.w * .5, y = rxy * sa * sq * P.h * .5;
      // face vestibular mais plana (perfil "pá"), lingual côncava
      let z = Math.sign(nz) * Math.pow(Math.abs(nz), .6) * P.t * .5;
      if (nz < 0) z *= .5;
      const cerv = Math.max(0, ny); x *= 1 - .26 * cerv * cerv;          // afunila no colo
      const inc = Math.max(0, -ny); z *= 1 - .55 * inc * inc * (type === 'premolar' ? .3 : 1); // borda incisal fina
      z += .05 * (1 - nx * nx) * (1 - inc) * (nz > 0 ? 1 : 0);           // convexidade suave
      if (P.point) y -= .07 * P.h * Math.pow(inc, 3) * Math.pow(Math.max(0, 1 - Math.abs(nx) * 1.6), 2);
      if (o.chip) { const m = smooth(.6, .95, inc) * smooth(.15, .65, nx * o.chipSide); y += .14 * P.h * m; }
      if (o.ugly) { const f = (fbm(nx * 5 + o.seed, ny * 5, nz * 5) - .5) * .025; x += f; z += f; }
      if (!o.ugly && nz > 0) z += .005 * Math.sin(nx * 14) * smooth(.2, .8, inc); // mamelões sutis
      const sc = o.scale || 1;
      return [x * sc, y * sc, z * sc];
    };
  }

  function incisorColor(o = {}) {
    const enamel = col('#F5F3EE'), tip = col('#DCE6EC'), cerv = col('#EFE6D4');
    const yel = col('#E0CFA0'), yelCerv = col('#C2A266'), stain = col('#8E6B3C'), dark = col('#A59C88');
    return (nx, ny, nz, out) => {
      const inc = Math.max(0, -ny);
      if (!o.ugly) {
        mixInto(out, enamel, tip, smooth(.72, 1, inc) * .75);
        return mixInto(out, out, cerv, smooth(.3, .95, ny) * .8);
      }
      mixInto(out, yel, yelCerv, smooth(-.1, .85, ny));
      // manchas concentradas no colo e nas faces proximais
      const where = smooth(.1, .9, ny) * .8 + smooth(.6, .95, Math.abs(nx)) * .6;
      mixInto(out, out, stain, smooth(.58, .74, fbm(nx * 3 + o.seed, ny * 3, nz * 3)) * .6 * Math.min(1, where));
      if (o.dark) mixInto(out, out, dark, .6);
      return out;
    };
  }

  function buildIncisor(type, o = {}) {
    const g = deformed(72, 60, incisorShape(type, o), incisorColor(o));
    return new T.Mesh(g, enamelMat(o.ugly ? { roughness: .5, clearcoat: .3 } : {}));
  }

  /* Gengiva: superfície recortada (zênite alto no centro do dente, papila entre os dentes) */
  function gumSheet(teeth, upper, curve, zRow, color, ugly) {
    const ySign = upper ? 1 : -1;
    const x0 = -5.2, x1 = 5.2, NU = 260, NV = 26, yFar = upper ? 3 : 2.6;
    const margin = x => {
      const t = teeth.find(tt => x >= tt.cx - tt.w / 2 && x < tt.cx + tt.w / 2);
      if (!t) return upper ? .62 : .5;
      const u = (x - t.cx) / (t.w / 2);
      const zen = t.zenith, pap = t.papilla;
      return pap + (zen - pap) * Math.sqrt(Math.max(0, 1 - u * u));
    };
    const pos = [], cols = [], idx = [];
    const base = col(color), red = col('#C95463');
    const c = new T.Color();
    for (let i = 0; i <= NU; i++) {
      const x = lerp(x0, x1, i / NU), m = margin(x);
      for (let j = 0; j <= NV; j++) {
        const v = j / NV, yy = lerp(m, yFar, Math.pow(v, 1.6));
        const edge = 1 - smooth(0, .18, yy - m);                  // borda arredondada
        const bulge = .018 * Math.cos(x * 7.5) * smooth(.1, .8, yy - m); // eminências radiculares
        const z = curve(x) + zRow + .28 - .16 * edge + bulge + .06 * smooth(0, 1.2, yy - m);
        pos.push(x, ySign * yy, z);
        mixInto(c, base, red, ugly ? edge * .6 : 0);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1;
      if (upper) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: .5, clearcoat: .25, clearcoatRoughness: .4, envMapIntensity: .2, side: T.DoubleSide });
    return new T.Mesh(g, mat);
  }

  /* =============================================================
     ARCADA (sorriso frontal) — antes/depois
     ============================================================= */
  function buildArch({ ugly = false, seed = 1 } = {}) {
    let s = seed * 9973;
    const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const group = new T.Group();
    const upperOrder = ['premolar', 'premolar', 'canine', 'lateral', 'central', 'central', 'lateral', 'canine', 'premolar', 'premolar'];
    const lowerOrder = ['premolar', 'premolar', 'canine', 'lateral', 'lateral', 'lateral', 'lateral', 'canine', 'premolar', 'premolar'];
    const edge = { central: 0, lateral: .07, canine: .02, premolar: .1 };
    const curve = x => -.075 * x * x;

    // interior da boca (escuro) atrás dos dentes
    const back = new T.Mesh(new T.PlaneGeometry(14, 3.2), new T.MeshBasicMaterial({ color: '#3b1c22' }));
    back.position.set(0, 0, -1.6); group.add(back);

    const row = upper => {
      const order = upper ? upperOrder : lowerOrder;
      const scale = upper ? 1 : .8;
      const gap = ugly ? () => .02 + rand() * .07 : () => .012;
      const widths = order.map(t => TYPES[t].w * scale);
      const gaps = order.map(gap);
      const total = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
      let x = -total / 2;
      const ySign = upper ? 1 : -1;
      const zRow = upper ? 0 : -.2;
      const placed = [];
      order.forEach((type, i) => {
        const w = widths[i], g = gaps[i], cx = x + g / 2 + w / 2;
        const opts = {
          ugly, seed: seed * 3 + i, scale,
          chip: ugly && upper && i === (seed % 2 ? 4 : 5), chipSide: seed % 2 ? 1 : -1,
          dark: ugly && upper && i === (seed % 2 ? 6 : 3),
        };
        const tooth = buildIncisor(type, opts);
        const h = TYPES[type].h * scale;
        const yEdge = (upper ? edge[type] : edge[type] * .5) * scale;
        tooth.position.set(cx, ySign * (h / 2 + yEdge + (upper ? 0 : -.08)), curve(cx) + zRow);
        tooth.rotation.y = Math.atan(.15 * cx);
        if (!upper) tooth.rotation.z = Math.PI;
        if (ugly) {
          tooth.rotation.z += (rand() - .5) * .2;
          tooth.rotation.y += (rand() - .5) * .55;
          tooth.position.z += (rand() - .5) * .18;
          tooth.position.y += ySign * (rand() - .3) * .08;
        }
        group.add(tooth);
        const top = h + yEdge;
        placed.push({ cx, w: w + g, zenith: top * (upper ? .78 : .74) + (ugly ? .1 * rand() : 0), papilla: top * (upper ? .5 : .5) });
        x += w + g;
      });
      group.add(gumSheet(placed, upper, curve, zRow, ugly ? '#DC7B87' : '#E9A0A8', ugly));
    };
    row(true); row(false);
    return group;
  }

  /* =============================================================
     IMPLANTE (vista explodida)
     ============================================================= */
  function buildImplant() {
    const group = new T.Group();
    const ti = new T.MeshPhysicalMaterial({ color: '#B8C0C9', metalness: 1, roughness: .28, clearcoat: .4 });
    const tiLight = new T.MeshPhysicalMaterial({ color: '#D9DEE4', metalness: 1, roughness: .18, clearcoat: .6 });
    // parafuso com roscas (perfil serrilhado em torno)
    const prof = [];
    const N = 26;
    prof.push(new T.Vector2(0, -1.75));
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = lerp(-1.65, 0, t);
      const base = lerp(.2, .3, smooth(0, .35, t));
      prof.push(new T.Vector2(base + (i % 2 ? .07 : 0) * smooth(0, .1, t) * (1 - smooth(.92, 1, t)), y));
    }
    prof.push(new T.Vector2(.3, .05), new T.Vector2(0, .05));
    const screw = new T.Mesh(new T.LatheGeometry(prof, 72), ti);
    group.add(screw);
    // pilar (abutment)
    const abut = new T.Mesh(new T.CylinderGeometry(.17, .27, .55, 48), tiLight);
    abut.position.y = .55; group.add(abut);
    const hex = new T.Mesh(new T.CylinderGeometry(.27, .29, .08, 6), tiLight);
    hex.position.y = .24; group.add(hex);
    // coroa cerâmica (somente coroa do molar saudável)
    const crown = new T.Mesh(deformed(140, 110, (x, y, z) => crownShape(x, y, z, false), (x, y, z, o) => crownColor(x, y, z, false, o)), enamelMat());
    crown.scale.setScalar(.7); crown.position.y = 1.2;
    group.add(crown);
    group.position.y = -.1;
    return group;
  }

  /* =============================================================
     LENTE DE CONTATO DENTAL (incisivo + faceta cerâmica)
     ============================================================= */
  function buildVeneer() {
    const group = new T.Group();
    const tooth = buildIncisor('central', { scale: 1.6, ugly: true, seed: 4 });
    tooth.material = enamelMat({ roughness: .45, clearcoat: .3 });
    group.add(tooth);
    // faceta: metade frontal do mesmo formato, levemente maior, translúcida
    const sh = incisorShape('central', { scale: 1.6 * 1.04 });
    const half = new T.SphereGeometry(1, 72, 60, 0, Math.PI);
    const p = half.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = sh(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
    half.computeVertexNormals();
    const veneer = new T.Mesh(half, new T.MeshPhysicalMaterial({
      color: '#FBFCFE', roughness: .08, clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity: .9, side: T.FrontSide,
    }));
    veneer.position.set(.62, .06, .85);
    veneer.rotation.set(.02, .18, -.05);
    group.add(veneer);
    return group;
  }

  /* =============================================================
     AMBIENTE DE ESTÚDIO (reflexos suaves, tema claro)
     ============================================================= */
  function studioEnvironment(renderer, scene) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#d9dee3'); sky.addColorStop(.5, '#9ea8b2'); sky.addColorStop(1, '#4b5560');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
    [[80, 34, '#ffffff'], [250, 18, '#ffffff'], [400, 28, '#eaf7fa']].forEach(([x, w, c]) => {
      const b = g.createLinearGradient(x - w, 0, x + w, 0);
      b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(.5, c); b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b; g.fillRect(x - w, 20, w * 2, 110);
    });
    const tex = new T.CanvasTexture(cv);
    tex.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(tex).texture;
    tex.dispose(); pm.dispose();

    scene.add(new T.HemisphereLight(0xffffff, 0xb9aea2, .32));
    const key = new T.DirectionalLight(0xfffaf2, .52); key.position.set(-3, 5, 6); scene.add(key);
    const fill = new T.DirectionalLight(0xe4f3ff, .22); fill.position.set(5, 0, 4); scene.add(fill);
    const rim = new T.DirectionalLight(0xffffff, .45); rim.position.set(2, 4, -6); scene.add(rim);
    const under = new T.DirectionalLight(0xfff6ec, .3); under.position.set(1, -5, 4); scene.add(under); // preenche a face inferior da coroa
  }

  window.Teeth = { buildMolar, buildIncisor, buildArch, buildImplant, buildVeneer, studioEnvironment, smooth, lerp };
})();
