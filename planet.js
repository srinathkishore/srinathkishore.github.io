(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEG = Math.PI / 180;

  const toVec = (lat, lon) => [
    Math.cos(lat * DEG) * Math.sin(lon * DEG),
    Math.sin(lat * DEG),
    Math.cos(lat * DEG) * Math.cos(lon * DEG),
  ];
  const BLOBS = [
    [14, 0, 0.40], [30, -18, 0.26], [0, 14, 0.24], [-12, -6, 0.2],
    [-2, 118, 0.42], [14, 132, 0.28], [-18, 104, 0.26], [8, 98, 0.22],
    [24, 232, 0.32], [6, 248, 0.26], [-14, 236, 0.18],
    [-40, 60, 0.1], [45, 180, 0.12], [-35, 300, 0.14], [52, 70, 0.08], [-50, 190, 0.1],
  ];
  const SITES = {
    beacon: [16, 4],
    coimbatore: [6, -8],

    chess: [4, 112],
    atoll: [-24, 150],
    uncharted: [22, 236],
  };

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;
  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uPlanet;
    uniform mat3 uRot;
    uniform vec3 uLight;
    uniform float uTime;
    uniform vec4 uFocus;
    uniform float uLightTheme;
    uniform vec4 uBlobs[16];
    uniform vec3 uBeacon;
    uniform vec3 uCity2;
    uniform vec3 uChess;
    uniform vec3 uAtoll;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < OCTAVES; i++) {
        s += a * noise(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.1);
        a *= 0.5;
      }
      return s;
    }
    float ang(vec3 a, vec3 b) { return acos(clamp(dot(a, b), -1.0, 1.0)); }

    float landField(vec3 p) {
      float f = -1.0;
      for (int i = 0; i < 16; i++) {
        f = max(f, uBlobs[i].w - ang(p, uBlobs[i].xyz));
      }
      f += (fbm(p * 2.6) - 0.5) * 0.34;
    #ifndef LITE
      f += (fbm(p * 9.0) - 0.5) * 0.08;
    #endif
      return min(f, ang(p, uAtoll) - 0.17);
    }

    vec2 local(vec3 p, vec3 c) {
      vec3 t1 = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
      vec3 t2 = cross(c, t1);
      return vec2(dot(p, t1), dot(p, t2));
    }

    void main() {
      vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
      vec2 d = (frag - uPlanet.xy) / uPlanet.z;
      d.y = -d.y;
      float len = length(d);
      float R = uPlanet.z;
      vec3 L = normalize(uLight);
      vec3 atmo = vec3(0.36, 0.56, 1.0);

      float glowPx = clamp(R * 0.075, 10.0, 55.0);
      float distPx = (len - 1.0) * R;
      vec4 outside = vec4(0.0);
      if (len > 0.98) {
        vec2 rimDir = d / max(len, 1e-4);
        float lit = smoothstep(-0.5, 0.9, dot(rimDir, L.xy));
        float back = max(-L.z, 0.0);
        float toward = max(dot(rimDir, normalize(L.xy + 1e-4)), 0.0);
        float g = exp(-max(distPx, 0.0) / (glowPx * 0.45));
        float scatter = pow(toward, 16.0) * back;
        float flare = pow(toward, 60.0) * back * exp(-max(distPx, 0.0) / (glowPx * 0.18));
        vec3 col = atmo * (0.2 + lit) + vec3(1.0, 0.85, 0.7) * scatter * 0.8 + vec3(1.0) * flare * 2.0;
        float a = clamp(g * (0.3 + lit * 0.8 + scatter) + flare, 0.0, 1.0) * mix(1.0, 0.55, uLightTheme);
        outside = vec4(col * a, a);
      }
      if (len > 1.0 + 6.0 * glowPx / R) { gl_FragColor = vec4(0.0); return; }

      if (len >= 1.0) { gl_FragColor = outside; return; }

      vec3 n = vec3(d, sqrt(1.0 - len * len));
      vec3 p = uRot * n;
      float ndl = dot(n, L);
      float day = smoothstep(-0.12, 0.55, ndl);

      float f = landField(p);
      float land = smoothstep(-0.004, 0.004, f);
    #ifdef LITE
      float elev = clamp(f * 3.0, 0.0, 1.0);
    #else
      float elev = clamp(f * 3.0 + (fbm(p * 14.0) - 0.5) * 0.4, 0.0, 1.0);
    #endif

      vec3 deep = vec3(0.025, 0.06, 0.18);
      vec3 shallow = vec3(0.05, 0.25, 0.42);
      vec3 sea = mix(deep, shallow, smoothstep(-0.18, 0.0, f));
      sea = mix(sea, vec3(0.2, 0.46, 0.66), 0.4 * uLightTheme);
      vec3 lowland = vec3(0.12, 0.44, 0.39);
      vec3 midland = vec3(0.36, 0.6, 0.47);
      vec3 highland = vec3(0.86, 0.8, 0.64);
      vec3 ground = mix(lowland, midland, smoothstep(0.05, 0.45, elev));
      ground = mix(ground, highland, smoothstep(0.6, 0.95, elev));

      float da = ang(p, uAtoll);
      vec2 la = local(p, uAtoll);
      float th = atan(la.y, la.x);
      float ring = 0.016 - abs(da - 0.085) + 0.011 * (cos(th * 5.0) - 0.35);
      float islands = smoothstep(-0.002, 0.002, ring);
      float lagoon = smoothstep(0.12, 0.09, da);
      sea = mix(sea, vec3(0.12, 0.55, 0.62), lagoon * 0.8);
      land = max(land, islands);
      ground = mix(ground, vec3(0.92, 0.85, 0.66), islands);

      float dc = ang(p, uChess);
      vec2 lc = local(p, uChess) * 42.0;
      float checker = mod(floor(lc.x) + floor(lc.y), 2.0);
      float board = smoothstep(0.1, 0.095, dc) * land;
      ground = mix(ground, mix(vec3(0.85, 0.8, 0.68), vec3(0.2, 0.3, 0.32), checker), board * 0.85);

      float ice = smoothstep(0.93, 0.95, abs(p.y) + (fbm(p * 6.0) - 0.5) * 0.1);

      vec3 albedo = mix(sea, ground, land);
      albedo = mix(albedo, vec3(0.92, 0.96, 1.0), ice);

      vec3 col = albedo * (0.035 + 0.1 * uLightTheme + day * 1.05);
      vec3 refl = reflect(-L, n);
      float spec = pow(max(refl.z, 0.0), 36.0) * (1.0 - land) * (1.0 - ice) * day;
      col += vec3(1.0, 0.92, 0.8) * spec * 0.55;

      float night = 1.0 - smoothstep(-0.25, 0.1, ndl);
      float cities = step(0.82, hash(floor(p * 160.0))) * smoothstep(0.45, 0.62, fbm(p * 5.0));
      col += vec3(1.0, 0.72, 0.38) * cities * land * (1.0 - ice) * night * 1.3;

      float ct = uTime * 0.012;
      vec3 cp = vec3(p.x * cos(ct) - p.z * sin(ct), p.y, p.x * sin(ct) + p.z * cos(ct));
      float cloud = smoothstep(0.56, 0.78, fbm(cp * 3.2 + vec3(0.0, uTime * 0.003, 0.0)));
      col = mix(col, vec3(1.0) * (0.03 + day * 0.95), cloud * 0.75);

      vec3 accent = vec3(1.0, 0.42, 0.29);
      float pulse = fract(uTime * 0.45);
      float db = ang(p, uBeacon);
      float beacon = exp(-pow(db / 0.018, 2.0)) * 1.6 + exp(-pow((db - pulse * 0.13) / 0.007, 2.0)) * (1.0 - pulse);
      col += accent * beacon * (0.25 + uFocus.x);
      float boardEdge = exp(-pow((dc - 0.1) / 0.006, 2.0));
      col += accent * boardEdge * (0.15 + uFocus.y * 1.2);
      float core = exp(-pow(da / 0.016, 2.0)) * 1.6 + exp(-pow((da - pulse * 0.12) / 0.006, 2.0)) * (1.0 - pulse);
      col += accent * core * (0.2 + uFocus.z);

      float dk = ang(p, uCity2);
      col += vec3(1.0, 0.85, 0.6) * exp(-pow(dk / 0.014, 2.0)) * (0.15 + uFocus.w * 1.2);
      vec3 an = normalize(cross(uCity2, uBeacon));
      float within = step(0.0, dot(cross(uCity2, p), an)) * step(0.0, dot(cross(p, uBeacon), an));
      float cell = (fract(ang(uCity2, p) * 45.0) - 0.5) / 45.0;
      float dotm = smoothstep(0.0058, 0.0038, length(vec2(cell, dot(p, an)))) * within;
      col = mix(col, vec3(1.0, 0.93, 0.85), dotm * uFocus.w);

      float fres = pow(1.0 - n.z, 4.0);
      col += atmo * fres * (0.18 + 0.9 * smoothstep(-0.3, 0.6, ndl));

      float edge = smoothstep(1.0, 1.0 - 1.5 / R, len);
      gl_FragColor = vec4(col, 1.0) * edge + outside * (1.0 - edge);
    }
  `;

  const canvas = document.getElementById('planet');
  const gl = canvas && canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, failIfMajorPerformanceCaveat: true,
  });
  const { isLite, isUltra, onFrame, pacer } = window.perf;
  const UNIFORMS = ['uRes', 'uPlanet', 'uRot', 'uLight', 'uTime', 'uFocus', 'uLightTheme', 'uBlobs', 'uBeacon', 'uCity2', 'uChess', 'uAtoll'];
  let parallel = null, quad = null, prog = null, progLite = false, pending = null, uni = {};
  let dirty = true;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  }
  function build(lite) {
    const p = gl.createProgram();
    const defs = lite ? '#define LITE\n#define OCTAVES 4\n' : '#define OCTAVES 5\n';
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, defs + FRAG);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return { p, vs, fs, lite };
  }
  function rebuild(lite) {
    if (pending) gl.deleteProgram(pending.p);
    pending = build(lite);
  }
  function disable(reason) {
    console.warn('Planet disabled:', reason);
    prog = pending = null;
    root.classList.add('no-webgl');
  }
  function settle() {
    if (!pending || (parallel && !gl.getProgramParameter(pending.p, parallel.COMPLETION_STATUS_KHR))) return;
    const { p, vs, fs, lite } = pending;
    pending = null;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      if (!prog) disable(log);
      return;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (prog) gl.deleteProgram(prog);
    prog = p;
    progLite = lite;
    use(p);
    dirty = true;
    root.classList.add('planet-ready');
  }
  function setup() {
    parallel = gl.getExtension('KHR_parallel_shader_compile');
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const start = () => { if (!pending && !prog) rebuild(isLite()); };
    if (parallel) start();
    else if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1000 });
    else setTimeout(start, 300);
  }

  const $ = (sel) => document.querySelector(sel);
  const anchors = {
    about: $('[data-planet="about"]'),
    career: $('[data-planet="career"]'),
    work: $('[data-planet="work"]'),
    contact: $('[data-planet="contact"]'),
  };
  const aboutEl = $('#about');
  const contactEl = $('#contact');

  const geo = {};
  const fromAnchor = (name, scale = 0.84) => (sy) => {
    const a = geo[name];
    return { x: a.x + a.w / 2, y: a.top - sy + a.h / 2, r: (Math.min(a.w, a.h) / 2) * scale };
  };
  const heroPos = () => {
    const vw = innerWidth, vh = innerHeight;
    const R = Math.max(vw * 0.85, 700);
    const lift = Math.min(Math.max(vh * 0.16, 80), 160);
    return { x: vw / 2, y: vh - lift + R, r: R };
  };
  const minimapPos = (sy) => {
    const vw = innerWidth, vh = innerHeight;
    if (vw >= 640 && vh > 500) return { x: vw - 96, y: vh - 96, r: 56 };
    // Phones: sit right of the section title, between the theme toggle and the cards.
    const t = geo.questsTitle;
    const top = t.section + t.toggle + 8, bottom = t.grid - 8;
    const r = Math.min(46, Math.max(24, (vw - t.right - 32) / 2), Math.max(24, (bottom - top) / 2));
    return { x: vw - 20 - r, y: (top + bottom) / 2 - sy, r };
  };

  const KEYS = [
    { name: 'hero', pos: heroPos, face: [-60, -60], light: [-0.45, 0.42, 0.79], focus: [0, 0, 0, 0] },
    { name: 'about', pos: fromAnchor('about'), face: [14, -30], light: [-0.45, 0.42, 0.79], focus: [1, 0, 0, 0] },
    { name: 'career', pos: fromAnchor('career', 1.1), face: [11, -2], light: [-0.35, 0.45, 0.82], focus: [0.4, 0, 0, 1] },
    { name: 'work', pos: fromAnchor('work'), face: [-8, 130], light: [-0.5, 0.45, 0.74], focus: [0, 0.6, 0.6, 0] },
    { name: 'quests', pos: minimapPos, face: SITES.uncharted, light: [0.6, 0.35, 0.72], focus: [0, 0, 0, 0] },
    { name: 'contact', pos: fromAnchor('contact', 0.8), face: [16, 262], light: [0.7, 0.32, 0.64], focus: [0, 0, 0, 0] },
  ];
  const WORK = 3;
  KEYS.forEach((k, i) => {
    k.lon = i === 0 ? k.face[1] : k.face[1] + 360 * Math.round((KEYS[i - 1].lon - k.face[1]) / 360);
  });

  const stopEls = [aboutEl, $('#career'), $('#work'), $('#quests'), contactEl];
  let stops = [];
  function measure() {
    const sy = scrollY;
    for (const [name, el] of Object.entries(anchors)) {
      const r = el.getBoundingClientRect();
      geo[name] = { x: r.left, top: r.top + sy, w: r.width, h: r.height };
    }
    const qt = $('#quests-title');
    const ink = document.createRange();
    ink.selectNodeContents(qt);
    const docTop = (el) => { let y = 0; for (; el; el = el.offsetParent) y += el.offsetTop; return y; };
    geo.questsTitle = {
      right: ink.getBoundingClientRect().right,
      section: docTop($('#quests')),
      toggle: $('.theme-toggle').getBoundingClientRect().bottom,
      grid: docTop($('.quest-grid')),
    };
    const maxScroll = root.scrollHeight - innerHeight;
    stops = [0, ...stopEls.map((el) => el.getBoundingClientRect().top + sy)];
    stops[stops.length - 1] = Math.min(stops[stops.length - 1], maxScroll);
    for (let i = 1; i < stops.length; i++) stops[i] = Math.max(stops[i], stops[i - 1] + 1);
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  function rotation(lat, lon) {
    const a = -lat * DEG, b = lon * DEG;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    return [
      cb, sb * sa, sb * ca,
      0, ca, -sa,
      -sb, cb * sa, cb * ca,
    ];
  }
  function toView(m, v) {
    return [
      m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
      m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
      m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
    ];
  }
  function slerp(a, b, u) {
    const om = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const so = Math.sin(om) || 1;
    const ka = Math.sin((1 - u) * om) / so, kb = Math.sin(u * om) / so;
    return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  }

  const labelLayer = $('.planet-labels');
  // Same query as the single-column layout in styles.css.
  const oneColumn = matchMedia('(max-width: 860px) and (min-height: 501px), (max-width: 1180px) and (orientation: portrait) and (min-height: 1100px)');
  const logo = (name, w, city) =>
    `<img class="on-dark" src="assets/logos/${name}.png" alt="" width="${w}" height="13">`
    + `<img class="on-light" src="assets/logos/${name}-dark.png" alt="" width="${w}" height="13"><b>${city}</b>`;
  const LABELS = [
    { html: 'Chennai', site: 'beacon', keys: [1] },
    { html: logo('amazon', 44, 'Chennai'), logo: true, site: 'beacon', keys: [2] },
    { html: logo('greeno', 43, 'Coimbatore'), logo: true, site: 'coimbatore', keys: [2], left: true },
    { html: 'Chess Analyzer', site: 'chess', keys: [WORK], left: true },
    { html: 'Agents Circle', site: 'atoll', keys: [WORK], left: true, narrowLeft: false },
    { html: 'Uncharted · your idea?', site: 'uncharted', keys: [5] },
  ].map((l) => {
    const el = document.createElement('div');
    el.className = 'planet-label' + (l.logo ? ' logo' : '') + (l.left ? ' left' : '');
    el.innerHTML = `<span>${l.html}</span>`;
    labelLayer.appendChild(el);
    return { ...l, el, pill: el.firstElementChild, vec: toVec(...SITES[l.site]), op: '', side: !!l.left, shift: 0, dy: 0 };
  });
  const plane = $('.flight-plane');
  const FROM = toVec(...SITES.coimbatore), TO = toVec(...SITES.beacon);

  let hoverSite = null;
  window.planetFocus = (site) => { hoverSite = site || null; };

  function use(p) {
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uni = {};
    for (const n of UNIFORMS) uni[n] = gl.getUniformLocation(p, n);
    const blobData = new Float32Array(16 * 4);
    BLOBS.forEach(([lat, lon, r], i) => blobData.set([...toVec(lat, lon), r], i * 4));
    gl.uniform4fv(uni.uBlobs, blobData);
    gl.uniform3fv(uni.uBeacon, toVec(...SITES.beacon));
    gl.uniform3fv(uni.uCity2, toVec(...SITES.coimbatore));
    gl.uniform3fv(uni.uChess, toVec(...SITES.chess));
    gl.uniform3fv(uni.uAtoll, toVec(...SITES.atoll));
  }
  let cssW = 0;
  function resize(force) {
    if (!quad) return false;
    cssW = canvas.clientWidth || innerWidth;
    const cssH = canvas.clientHeight || innerHeight;
    const lite = isLite();
    const budget = lite ? 1e6 : 3e6;
    const dpr = Math.min(window.devicePixelRatio || 1, lite ? 0.6 : 1.5, Math.sqrt(budget / (cssW * cssH)));
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    if (!force && W === canvas.width && H === canvas.height) return false;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
    dirty = true;
    return true;
  }

  if (!gl) disable('no webgl');
  else {
    setup();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      prog = pending = quad = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      setup();
      resize(true);
    });
  }

  const t0 = performance.now();
  let last = t0;
  let S = null;
  const TAU = 380;
  const TAU_HERO = 140;

  let heroSpin = 0;
  const HERO_SPIN_SPEED = 0.006;
  const spinLanding = () => 360 * Math.round(heroSpin / 360);

  let scrollPos = 0;
  function target(time) {
    const y = scrollPos;
    let i = 0;
    while (i < stops.length - 2 && y >= stops[i + 1]) i++;
    const raw = clamp01((y - stops[i]) / (stops[i + 1] - stops[i]));
    const t = reduceMotion ? (raw < 0.5 ? 0 : 1)
      : i === 0 ? easeInOutSine(raw) : easeInOutSine(clamp01((raw - 0.1) / 0.8));
    const A = KEYS[i], B = KEYS[i + 1];
    const pa = A.pos(y);
    const pb = i === 0 ? B.pos(stops[1]) : B.pos(y);
    const intro = reduceMotion ? 1 : 1 - Math.pow(1 - clamp01(time / 1.8), 3);
    let lat = lerp(A.face[0], B.face[0], t);
    let lon = lerp(A.lon, B.lon, t) + (i === 0 ? lerp(heroSpin, spinLanding(), t) : spinLanding());
    const focus = A.focus.map((v, k) => lerp(v, B.focus[k], t));
    const f = i + t;
    if (hoverSite) {
      const w = clamp01(1 - Math.abs(f - WORK) * 2) * 0.85;
      const site = SITES[hoverSite];
      const siteLon = site[1] + 360 * Math.round((lon - site[1]) / 360);
      lat = lerp(lat, site[0], w);
      lon = lerp(lon, siteLon, w);
      const idx = hoverSite === 'chess' ? 1 : 2;
      focus[idx] = Math.max(focus[idx], w / 0.85);
    }
    const lr = lerp(Math.log(pa.r), Math.log(pb.r), t);
    let cy = lerp(pa.y, pb.y, t);
    if (i === 0) {
      cy = lerp(pa.y - pa.r, pb.y - pb.r, t) + Math.exp(lr);
    }
    return {
      x: lerp(pa.x, pb.x, t),
      y: cy + (1 - intro) * 120 * (i === 0 ? 1 - t : 0),
      lr,
      lat, lon,
      light: A.light.map((v, k) => lerp(v, B.light[k], t)),
      focus, f,
    };
  }

  const pace = pacer();
  let lastKey = '', settled = false;
  function frame(now, force) {
    settle();
    if (!prog) return;
    scrollPos = lenis.scroll;
    const still = reduceMotion || isUltra();
    if (still) {
      const key = `${scrollPos}|${root.dataset.theme}|${hoverSite}`;
      if (!dirty && !force && key === lastKey) return;
      lastKey = key;
    } else if (!force && !pace(now, isLite() || settled ? 30 : 60)) return;
    dirty = false;
    const time = (now - t0) / 1000;
    const dt = Math.min(64, now - last);
    last = now;
    if (!still && scrollPos < 2) heroSpin += dt * HERO_SPIN_SPEED;
    const T = target(time);
    if (!S || still) {
      S = { ...T, light: [...T.light], focus: [...T.focus] };
    } else {
      const k = 1 - Math.exp(-dt / (T.f < 1 ? TAU_HERO : TAU));
      for (const key of ['x', 'y', 'lr', 'lat', 'lon', 'f']) S[key] += (T[key] - S[key]) * k;
      for (let j = 0; j < 3; j++) S.light[j] += (T.light[j] - S.light[j]) * k;
      for (let j = 0; j < 4; j++) S.focus[j] += (T.focus[j] - S.focus[j]) * k;
    }
    settled = Math.abs(T.x - S.x) + Math.abs(T.y - S.y) < 0.5 && Math.abs(T.lat - S.lat) + Math.abs(T.lon - S.lon) < 0.05
      && Math.abs(T.lr - S.lr) < 0.001 && Math.abs(T.f - S.f) < 0.001;
    const x = S.x, yy = S.y, r = Math.exp(S.lr), f = S.f;
    const drift = still ? 0 : Math.sin(time * 0.15) * 3;
    const rot = rotation(S.lat, S.lon + drift);

    const sx = canvas.width / (cssW || innerWidth);
    gl.uniform2f(uni.uRes, canvas.width, canvas.height);
    gl.uniform3f(uni.uPlanet, x * sx, yy * sx, r * sx);
    gl.uniformMatrix3fv(uni.uRot, false, [rot[0], rot[3], rot[6], rot[1], rot[4], rot[7], rot[2], rot[5], rot[8]]);
    gl.uniform3fv(uni.uLight, S.light);
    gl.uniform1f(uni.uTime, still ? 0 : time);
    gl.uniform4fv(uni.uFocus, S.focus);
    gl.uniform1f(uni.uLightTheme, root.dataset.theme === 'light' ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const weightFor = (keys) => Math.max(...keys.map((k) => clamp01(1 - Math.abs(f - k) * 2.2)));
    const placed = [];
    for (const l of LABELS) {
      const v = toView(rot, l.vec);
      const o = weightFor(l.keys) * clamp01((v[2] - 0.25) / 0.3);
      const op = o > 0 ? o.toFixed(2) : '0';
      if (op !== l.op) l.el.style.opacity = l.op = op;
      if (o <= 0) continue;
      const px = x + v[0] * r;
      const lw = (l.w ||= l.pill.offsetWidth) + 14;
      const vw = innerWidth;
      let left = oneColumn.matches && 'narrowLeft' in l ? l.narrowLeft : !!l.left;
      if (left && px - lw < 8) left = false;
      else if (!left && px + lw > vw - 8) left = true;
      if (px - lw < 8 && px + lw > vw - 8) left = px > vw / 2;
      const shift = Math.round(left ? Math.max(0, 8 - (px - lw)) : Math.min(0, vw - 8 - (px + lw)));
      if (left !== l.side) l.el.classList.toggle('left', (l.side = left));
      if (shift !== l.shift) l.pill.style.setProperty('--shift', `${(l.shift = shift)}px`);
      // Small planets put landmarks close together: nudge a pill up or down so it doesn't cover another.
      const py = yy - v[1] * r, ph = (l.h ||= l.pill.offsetHeight) + 4;
      const x0 = (left ? px - lw : px) + shift, x1 = x0 + lw;
      let dy = 0;
      for (const q of placed) {
        if (x0 < q.x1 && x1 > q.x0 && Math.abs(py + dy - q.y) < ph) dy = q.y - py + (py >= q.y ? ph : -ph);
      }
      dy = Math.round(dy);
      placed.push({ x0, x1, y: py + dy });
      if (dy !== l.dy) l.pill.style.setProperty('--dy', `${(l.dy = dy)}px`);
      l.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    }

    const pw = weightFor([2]);
    if (pw > 0) {
      const u = still ? 0.5 : (time * 0.16) % 1;
      const a = toView(rot, slerp(FROM, TO, u));
      const b = toView(rot, slerp(FROM, TO, Math.min(1, u + 0.02)));
      const ax = x + a[0] * r, ay = yy - a[1] * r;
      const ang = Math.atan2(yy - b[1] * r - ay, x + b[0] * r - ax) * 180 / Math.PI + 90;
      const ends = Math.min(1, Math.sin(Math.PI * u) * 4);
      plane.style.opacity = (pw * ends * clamp01((a[2] - 0.2) / 0.3)).toFixed(3);
      plane.style.transform = `translate3d(${ax}px, ${ay - 4}px, 0) rotate(${ang.toFixed(1)}deg)`;
    } else {
      if (plane.style.opacity !== '0') plane.style.opacity = '0';
    }
  }

  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  const lenis = new Lenis({
    lerp: 0.09,
    smoothWheel: !reduceMotion,
  });
  window.lenis = lenis;
  onFrame((now) => {
    lenis.raf(now);
    frame(now);
  });

  function destination(hash) {
    if (hash === '#top') return 0;
    const KEY_FOR = { '#about': 1, '#career': 2, '#work': 3, '#quests': 4, '#contact': 5 };
    if (hash in KEY_FOR) return stops[KEY_FOR[hash]];
    const el = document.querySelector(hash);
    return el ? el.getBoundingClientRect().top + scrollY : null;
  }
  function glide(target, onComplete, immediate = false) {
    const dist = Math.abs(target - scrollY);
    lenis.scrollTo(target, {
      duration: Math.min(1.1, 0.6 + dist * 0.00012),
      easing: easeOutQuart,
      immediate: reduceMotion || immediate,
      force: true,
      onComplete,
    });
  }
  window.glideTo = (y, onDone) => glide(y, onDone);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const dest = destination(a.hash);
    if (dest === null) return;
    e.preventDefault();
    const section = a.hash === '#top' ? null : document.querySelector(a.hash);
    history.replaceState(null, '', a.hash === '#top' ? location.pathname + location.search : a.hash);
    if (section) {
      if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '-1');
      section.focus({ preventScroll: true });
    }
    glide(Math.round(dest), undefined, a.classList.contains('skip'));
  });

  function layout() {
    LABELS.forEach((l) => { l.w = 0; l.h = 0; });
    measure();
    dirty = true;
    if (resize()) frame(performance.now(), true);
  }
  let queued = false;
  const relayout = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      lenis.resize();
      layout();
    });
  };
  window.addEventListener('resize', relayout);
  window.addEventListener('load', relayout);
  new ResizeObserver(relayout).observe($('main'));
  if (document.fonts) document.fonts.ready.then(relayout);
  document.addEventListener('litechange', () => {
    if (quad && !progLite && !(pending && pending.lite)) rebuild(true);
    resize();
    frame(performance.now(), true);
  });
  layout();
})();
