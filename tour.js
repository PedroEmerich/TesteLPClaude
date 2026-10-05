/*
 * Tour imersivo controlado pelo scroll.
 * Cada "tomada" (shot) é uma imagem com keyframes de câmera:
 *   p    = progresso do scroll (0..1) dentro da seção .tour
 *   z    = zoom (1 = imagem cobrindo o quadro)
 *   x, y = ponto focal normalizado (0..1) que fica no centro do quadro
 *   a    = opacidade da tomada (entrada sobre a anterior)
 *   b    = desfoque em px (motion blur das passagens)
 * As passagens "atravessam" a cena: a tomada anterior acelera o zoom
 * em direção a uma porta/janela enquanto a próxima surge desfocada.
 */
(() => {
  const SHOTS = [
    { src: "assets/01-fachada.jpg", keys: [
      { p: 0.00, z: 1.00, x: 0.50, y: 0.50, a: 1, b: 0 },
      { p: 0.15, z: 1.35, x: 0.44, y: 0.56, a: 1, b: 0 },
      { p: 0.205, z: 2.70, x: 0.40, y: 0.58, a: 1, b: 2 },
      { p: 0.235, z: 3.80, x: 0.40, y: 0.58, a: 1, b: 10 },
    ]},
    { src: "assets/02-sala.jpg", keys: [
      { p: 0.195, z: 1.70, x: 0.55, y: 0.56, a: 0, b: 12 },
      { p: 0.235, z: 1.25, x: 0.55, y: 0.56, a: 1, b: 0 },
      { p: 0.36, z: 1.05, x: 0.45, y: 0.55, a: 1, b: 0 },
      { p: 0.425, z: 1.55, x: 0.18, y: 0.52, a: 1, b: 1 },
      { p: 0.465, z: 2.60, x: 0.16, y: 0.50, a: 1, b: 9 },
    ]},
    { src: "assets/03-jantar.jpg", keys: [
      { p: 0.425, z: 1.65, x: 0.50, y: 0.56, a: 0, b: 12 },
      { p: 0.465, z: 1.22, x: 0.55, y: 0.56, a: 1, b: 0 },
      { p: 0.585, z: 1.05, x: 0.62, y: 0.55, a: 1, b: 0 },
      { p: 0.645, z: 1.70, x: 0.95, y: 0.47, a: 1, b: 1 },
      { p: 0.685, z: 2.80, x: 0.97, y: 0.46, a: 1, b: 10 },
    ]},
    { src: "assets/04-cascata.jpg", keys: [
      { p: 0.645, z: 1.70, x: 0.30, y: 0.42, a: 0, b: 12 },
      { p: 0.685, z: 1.30, x: 0.35, y: 0.45, a: 1, b: 0 },
      { p: 0.80, z: 1.02, x: 0.50, y: 0.50, a: 1, b: 0 },
      { p: 0.86, z: 1.00, x: 0.50, y: 0.50, a: 1, b: 0 },
    ]},
    { src: "assets/05-area-externa.jpg", keys: [
      { p: 0.80, z: 2.00, x: 0.17, y: 0.34, a: 0, b: 4 },
      { p: 0.86, z: 1.55, x: 0.25, y: 0.40, a: 1, b: 0 },
      { p: 1.00, z: 1.00, x: 0.50, y: 0.50, a: 1, b: 0 },
    ]},
  ];

  const tour = document.getElementById("tour");
  const film = document.getElementById("film");
  const ambient = document.getElementById("ambient");
  const ctx = film.getContext("2d");
  const actx = ambient.getContext("2d");
  const chapters = [...document.querySelectorAll(".chapter")];
  const progressItems = [...document.querySelectorAll("#progress li")];
  const progressFill = document.getElementById("progressFill");
  const hint = document.getElementById("scrollHint");
  const loader = document.getElementById("loader");
  const loaderFill = document.getElementById("loaderFill");
  const isMobile = matchMedia("(max-width: 860px)");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFilter = "filter" in ctx;

  let target = 0;
  let current = 0;
  let running = false;
  let W = 0, H = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  function sample(keys, p) {
    if (p <= keys[0].p) return { ...keys[0], a: p < keys[0].p ? 0 : keys[0].a };
    const last = keys[keys.length - 1];
    if (p >= last.p) return last;
    let i = 0;
    while (p > keys[i + 1].p) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const t = smooth((p - k0.p) / (k1.p - k0.p));
    return {
      z: lerp(k0.z, k1.z, t), x: lerp(k0.x, k1.x, t), y: lerp(k0.y, k1.y, t),
      a: lerp(k0.a, k1.a, t), b: lerp(k0.b, k1.b, t),
    };
  }

  function drawShot(c, img, s, w, h, blurScale) {
    const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const scale = cover * s.z;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    // centraliza o ponto focal e impede que apareçam bordas vazias
    const dx = clamp(w / 2 - s.x * dw, w - dw, 0);
    const dy = clamp(h / 2 - s.y * dh, h - dh, 0);
    c.globalAlpha = s.a;
    if (supportsFilter) c.filter = s.b > 0.3 ? `blur(${(s.b * blurScale).toFixed(1)}px)` : "none";
    c.drawImage(img, dx, dy, dw, dh);
  }

  function render(p) {
    // descobre a tomada mais recente totalmente opaca: nada abaixo dela precisa ser desenhado
    const states = SHOTS.map((shot) => sample(shot.keys, p));
    let base = 0;
    states.forEach((s, i) => { if (s.a >= 0.999) base = i; });

    const dpr = W / film.clientWidth || 1;
    ctx.clearRect(0, 0, W, H);
    for (let i = base; i < SHOTS.length; i++) {
      if (states[i].a <= 0.001) continue;
      drawShot(ctx, SHOTS[i].img, states[i], W, H, dpr);
    }
    ctx.globalAlpha = 1;
    if (supportsFilter) ctx.filter = "none";

    actx.clearRect(0, 0, ambient.width, ambient.height);
    actx.drawImage(film, 0, 0, ambient.width, ambient.height);

    updateUI(p);
  }

  function updateUI(p) {
    chapters.forEach((el) => {
      const from = +el.dataset.from, to = +el.dataset.to;
      const fade = 0.025;
      let o = 0;
      if (p >= from && p <= to) {
        o = Math.min(1, (p - from) / fade + (from === 0 ? 1 : 0), (to - p) / fade);
      }
      o = clamp(o, 0, 1);
      const shift = (1 - o) * (p < from + fade ? 24 : -24);
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
      el.classList.toggle("is-active", o > 0.5);
    });

    progressItems.forEach((li) => li.classList.toggle("is-on", p >= +li.dataset.at - 0.001));
    progressFill.style.transform = isMobile.matches ? `scaleX(${p})` : `scaleY(${p})`;
    hint.classList.toggle("is-hidden", p > 0.015);
  }

  function readScroll() {
    const rect = tour.getBoundingClientRect();
    const total = tour.offsetHeight - innerHeight;
    target = clamp(-rect.top / total, 0, 1);
  }

  function tick() {
    const diff = target - current;
    current = reduceMotion || Math.abs(diff) < 0.0002 ? target : current + diff * 0.1;
    render(current);
    if (current !== target) requestAnimationFrame(tick);
    else running = false;
  }

  function kick() {
    readScroll();
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    W = Math.round(film.clientWidth * ratio);
    H = Math.round(film.clientHeight * ratio);
    film.width = W;
    film.height = H;
    readScroll();
    current = target;
    render(current);
  }

  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
      img.onerror = reject;
      img.src = src;
    });
  }

  let loaded = 0;
  Promise.all(SHOTS.map((shot) => load(shot.src).then((img) => {
    shot.img = img;
    loaded++;
    loaderFill.style.width = `${(loaded / SHOTS.length) * 100}%`;
  }))).then(() => {
    resize();
    addEventListener("scroll", kick, { passive: true });
    addEventListener("resize", resize);
    setTimeout(() => loader.classList.add("is-done"), 250);
  }).catch(() => loader.classList.add("is-done"));

  // revelação suave da galeria
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); reveal.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".room, .section-head, .cta__inner, .facts__grid > div").forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = `${(i % 3) * 80}ms`;
    reveal.observe(el);
  });
})();
