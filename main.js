(() => {
  const root = document.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = motionQuery.matches;
  motionQuery.addEventListener('change', () => location.reload());
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const isLight = () => root.dataset.theme === 'light';
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    remove: (k) => { try { localStorage.removeItem(k); } catch {} },
  };

  const frameFns = new Set();
  let ticking = false;
  function tick(now) {
    for (const fn of frameFns) fn(now);
    ticking = frameFns.size > 0;
    if (ticking) requestAnimationFrame(tick);
  }
  function onFrame(fn) {
    frameFns.add(fn);
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
    return () => frameFns.delete(fn);
  }
  function pacer() {
    let next = 0;
    return (now, fps) => {
      const interval = 1000 / fps;
      if (now < next - 2) return false;
      next = now - next > interval ? now + interval : next + interval;
      return true;
    };
  }

  const isLite = () => root.classList.contains('lite');
  const isUltra = () => root.classList.contains('ultra');
  window.perf = { isLite, isUltra, onFrame, pacer };
  function stepDown() {
    root.classList.add(isLite() ? 'ultra' : 'lite');
    document.dispatchEvent(new Event('litechange'));
  }
  if (!reduceMotion) {
    const samples = [];
    let prev = 0, settleUntil = performance.now() + 3500;
    const stopWatch = onFrame((now) => {
      const gap = now - prev;
      prev = now;
      if (gap > 250) { settleUntil = Math.max(settleUntil, now + 1000); return; }
      if (now < settleUntil) return;
      samples.push(gap);
      if (samples.length > 90) samples.shift();
      if (samples.length < 90) return;
      const p75 = [...samples].sort((a, b) => a - b)[67];
      if (p75 > (isLite() ? 40 : 24)) {
        stepDown();
        samples.length = 0;
        settleUntil = now + 2500;
        if (isUltra()) stopWatch();
      }
    });
  }

  let scrollPos = window.scrollY;
  window.addEventListener('scroll', () => { scrollPos = window.scrollY; }, { passive: true });

  const toastEl = document.querySelector('.toast');
  let toastTimer;
  function toast(msg, ms = 3200) {
    toastEl.textContent = '';
    requestAnimationFrame(() => { toastEl.textContent = msg; });
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function paintAurora() {
    document.querySelectorAll('.aurora canvas').forEach((c, i) => {
      const g = c.getContext('2d');
      const s = c.width;
      const rgb = cssVar(`--aurora-${i + 1}`).match(/\w\w/g).map((v) => parseInt(v, 16)).join(',');
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0.3, `rgba(${rgb},1)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.clearRect(0, 0, s, s);
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
  }
  paintAurora();

  const sky = (() => {
    const canvas = document.getElementById('stars');
    if (!canvas || !canvas.getContext) return null;

    const ctx = canvas.getContext('2d');
    const pace = pacer();
    let w = 0, h = 0, dpr = 1, stars = [], shooters = [];
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    let warpStart = 0, nextShot = performance.now() + 2500;
    let dirty = true, lastScroll = -1;
    const WARP_MS = 2000;
    const still = () => reduceMotion || isUltra();
    const targetDpr = () => Math.min(window.devicePixelRatio || 1, isLite() ? 1 : 2);

    function build() {
      const lite = isLite();
      dpr = targetDpr();
      w = canvas.clientWidth || innerWidth;
      h = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
      const count = Math.min(Math.round((w * h) / (lite ? 5200 : 2400)), lite ? 700 : 2000);
      stars = Array.from({ length: count }, () => {
        const z = Math.pow(Math.random(), 1.8);
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.35 + z * 1.25,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.6,
          tint: Math.random() < 0.12 ? (Math.random() < 0.5 ? '#ffd9b0' : '#b9ccff') : null,
        };
      });
    }

    const wrap = (v, m) => ((v % m) + m) % m;

    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      const light = isLight();
      const base = light ? '#2a2540' : '#ffffff';
      const dim = light ? 0.35 : 1;
      const scroll = scrollPos;
      const calm = still();
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      const cx = w / 2, cy = h / 2;
      const wp = warpStart ? (now - warpStart) / WARP_MS : 1;
      const warping = wp >= 0 && wp < 1;
      const warpK = warping ? Math.sin(wp * Math.PI) : 0;

      for (const s of stars) {
        if (warping) {
          const dx = s.x - cx, dy = s.y - cy;
          const k = 0.012 + warpK * 0.09 * (0.4 + s.z);
          const px = s.x, py = s.y;
          s.x += dx * k;
          s.y += dy * k;
          if (s.x < -50 || s.x > w + 50 || s.y < -50 || s.y > h + 50) {
            s.x = cx + (Math.random() - 0.5) * w * 0.2;
            s.y = cy + (Math.random() - 0.5) * h * 0.2;
            continue;
          }
          ctx.globalAlpha = (0.4 + 0.6 * s.z) * dim;
          ctx.strokeStyle = s.tint || base;
          ctx.lineWidth = s.r;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(s.x + dx * k * 2, s.y + dy * k * 2);
          ctx.stroke();
          continue;
        }

        const x = wrap(s.x + mx * s.z * 18, w);
        const y = wrap(s.y - (reduceMotion ? 0 : scroll * (0.04 + s.z * 0.22)) + my * s.z * 18, h);
        const twinkle = calm ? 1 : 0.6 + 0.4 * Math.sin(now * 0.001 * s.speed + s.phase);
        ctx.globalAlpha = (0.25 + 0.75 * s.z) * twinkle * dim;
        ctx.fillStyle = s.tint || base;
        if (s.r > 1.1) {
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, s.r * 1.6, s.r * 1.6);
        }
      }

      if (!calm && !warping && now > nextShot) {
        const fromLeft = Math.random() < 0.5;
        shooters.push({
          x: fromLeft ? Math.random() * w * 0.5 : w * (0.5 + Math.random() * 0.5),
          y: Math.random() * h * 0.45,
          vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 5),
          vy: 3 + Math.random() * 2.5,
          life: 1,
        });
        nextShot = now + 4500 + Math.random() * 7000;
      }
      for (const m of shooters) {
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.016;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
        g.addColorStop(0, light ? 'rgba(42,37,64,0.7)' : 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = Math.max(0, m.life);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
        ctx.stroke();
      }
      shooters = shooters.filter((m) => m.life > 0);
      ctx.globalAlpha = 1;
    }

    build();
    document.addEventListener('litechange', build);
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (canvas.clientWidth === w && canvas.clientHeight === h && targetDpr() === dpr) return;
        build();
      }, 150);
    });

    if (!reduceMotion) {
      window.addEventListener('pointermove', (e) => {
        tmx = e.clientX / w - 0.5;
        tmy = e.clientY / h - 0.5;
      });
    }
    onFrame((now) => {
      const warping = warpStart && now - warpStart < WARP_MS;
      if (still()) {
        if (!dirty && scrollPos === lastScroll) return;
      } else if (!pace(now, isLite() && !warping ? 30 : 60)) return;
      dirty = false;
      lastScroll = scrollPos;
      draw(now);
    });

    return {
      redraw: () => { dirty = true; },
      warp: () => { if (!still()) warpStart = performance.now(); },
    };
  })();

  const field = (() => {
    const canvas = document.getElementById('particles');
    const name = document.querySelector('.hero-name');
    if (!canvas || !canvas.getContext || reduceMotion) return null;

    const ctx = canvas.getContext('2d');
    const pointer = { x: -1e4, y: -1e4 };
    const INTRO_DUR = 1700;
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const pace = pacer();
    const buckets = [[], [], [], [], []];
    let pts = [];
    let w = 0, h = 0, dpr = 1, step = 4, visible = true, disabled = false, stopLoop = null;
    let intro = null;
    let colors = [];
    let sprites = [];

    function makeSprite(color) {
      const size = Math.ceil(step * 2.2 * dpr);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.shadowColor = color;
      g.shadowBlur = size * 0.28;
      g.fillStyle = color;
      g.beginPath();
      g.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2);
      g.fill();
      return c;
    }

    function recolor() {
      colors = ['--ink', '--accent', '--c-blue', '--c-amber', '--c-violet'].map(cssVar);
      sprites = colors.map(makeSprite);
    }

    function startIntro(spread) {
      const now = performance.now();
      for (const p of pts) {
        p.sx = p.x;
        p.sy = p.y;
        p.delay = (p.hx / w) * 650 * spread + Math.random() * 450 * spread;
      }
      intro = { start: now };
    }

    const STRETCH = { '75%': 'condensed', '87.5%': 'semi-condensed', '100%': 'normal', '112.5%': 'semi-expanded', '125%': 'expanded' };
    let rectTop = 0, rectLeft = 0;

    function build(first) {
      dpr = Math.min(window.devicePixelRatio || 1, isLite() ? 1 : 2);
      const rect = canvas.getBoundingClientRect();
      rectTop = rect.top + window.scrollY;
      rectLeft = rect.left + window.scrollX;
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const style = getComputedStyle(name);
      const box = name.getBoundingClientRect();
      const pad = Math.ceil(parseFloat(style.fontSize) * 0.25);
      const ox = Math.floor(box.left - rect.left) - pad;
      const oy = Math.floor(box.top - rect.top) - pad;
      const buf = document.createElement('canvas');
      buf.width = Math.ceil(box.width) + pad * 2;
      buf.height = Math.ceil(box.height) + pad * 2;
      const o = buf.getContext('2d', { willReadFrequently: true });
      const stretch = STRETCH[style.fontStretch] || style.fontStretch || 'normal';
      o.font = `${style.fontWeight} ${stretch} ${style.fontSize} ${style.fontFamily}`;
      if ('fontStretch' in o) o.fontStretch = stretch;
      if ('letterSpacing' in o) o.letterSpacing = style.letterSpacing;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      for (const span of name.children) {
        const r = span.getBoundingClientRect();
        o.fillText(span.textContent, r.left - rect.left - ox + r.width / 2, r.top - rect.top - oy + r.height / 2);
      }

      const data = o.getImageData(0, 0, buf.width, buf.height).data;
      step = (w < 600 ? 3 : w < 1100 ? 4 : 5) + (isLite() ? 1 : 0);
      const prev = pts;
      const next = [];
      for (let y = 0; y < buf.height; y += step) {
        for (let x = 0; x < buf.width; x += step) {
          if (data[(y * buf.width + x) * 4 + 3] < 140) continue;
          const old = prev[next.length];
          next.push({
            hx: x + ox, hy: y + oy,
            x: old ? old.x : Math.random() * w,
            y: old ? old.y : Math.random() * h,
            vx: 0, vy: 0,
            c: Math.random() < 0.04 ? 1 : 0,
            scale: 0.75 + Math.random() * 0.4,
            k: 1,
          });
        }
      }
      pts = next;
      recolor();
      if (first) startIntro(1);
      else if (intro) startIntro(0.3);
    }

    let cosmic = false;
    let inverted = false;
    let flip = null;
    const FLIP_SPEED = 2.2;
    const COSMIC = [1, 2, 3, 4];

    const J_OUT = 900, J_SWAP = 1100, J_IN = 1250, J_STAGGER = 300;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    let jump = null;

    function stepJump(now) {
      const el = now - jump.t0;
      if (!jump.swapped && el >= J_SWAP) { jump.apply(); jump.swapped = true; }
      const vx = w / 2, vy = h / 2;
      const far = Math.hypot(w, h) * 0.75;
      const place = (p, d) => { p.x = vx + p.dx * d; p.y = vy + p.dy * d; };
      for (const p of pts) {
        if (el < J_SWAP) {
          const at = (tt) => {
            const u = clamp01((tt - p.jd * 0.4) / J_OUT);
            return p.d0 * (1 + u * 0.5) + u * u * far * p.js;
          };
          const u = clamp01((el - p.jd * 0.4) / J_OUT);
          place(p, at(el));
          const d1 = at(el - 45);
          p.tx = vx + p.dx * d1; p.ty = vy + p.dy * d1;
          p.ja = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
          p.jg = 1 - 0.45 * u;
        } else {
          const dh = p.dh, ds = dh * p.ds;
          const at = (tt) => ds + (dh - ds) * easeOutCubic(clamp01((tt - J_SWAP - p.jd) / J_IN));
          const u = clamp01((el - J_SWAP - p.jd) / J_IN);
          place(p, at(el));
          const d1 = at(el - 70);
          p.tx = vx + p.dx * d1; p.ty = vy + p.dy * d1;
          const fa = clamp01(u / 0.22);
          p.ja = fa * fa * (3 - 2 * fa);
          p.jg = 0.55 + 0.45 * u;
        }
      }
      if (el >= J_SWAP + J_IN + J_STAGGER) {
        jump = null;
        for (const p of pts) { p.x = p.hx; p.y = p.hy; p.vx = p.vy = 0; p.k = 1; }
      }
    }

    function step60(now) {
      if (!visible || disabled) {
        stopLoop();
        stopLoop = null;
        return;
      }
      if (pace(now, 60)) render(now);
    }

    function render(now) {
      ctx.clearRect(0, 0, w, h);
      const wave = now / 650;

      if (jump) {
        stepJump(now);
      } else if (intro) {
        const elapsed = now - intro.start;
        let done = true;
        for (const p of pts) {
          const t = Math.min(1, Math.max(0, (elapsed - p.delay) / INTRO_DUR));
          if (t < 1) done = false;
          const e = easeOutQuart(t);
          p.x = p.sx + (p.hx - p.sx) * e;
          p.y = p.sy + (p.hy - p.sy) * e;
          p.k = t;
        }
        if (done) {
          intro = null;
          for (const p of pts) { p.vx = p.vy = 0; p.k = 1; }
        }
      } else {
        const R = Math.max(70, w * 0.075);
        const R2 = R * R;
        for (const p of pts) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / R) * 4.5;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
          p.vx = (p.vx + (p.hx - p.x) * 0.035) * 0.82;
          p.vy = (p.vy + (p.hy - p.y) * 0.035) * 0.82;
          p.x += p.vx;
          p.y += p.vy;
        }
      }

      for (const b of buckets) b.length = 0;
      for (const p of pts) {
        let ci;
        if (cosmic) ci = COSMIC[Math.floor(wave + (p.hx / w) * 3) % COSMIC.length];
        else {
          const reached = !flip || now - flip.t0 >= Math.hypot(p.hx - flip.x, p.hy - flip.y) / FLIP_SPEED;
          const inv = reached ? inverted : !inverted;
          ci = inv ? 1 - p.c : p.c;
        }
        buckets[ci].push(p);
      }
      const base = step * 2.2;
      const streaks = jump ? colors.map(() => [[], [], [], []]) : null;
      let ga = 1;
      ctx.globalAlpha = 1;
      for (let c = 0; c < sprites.length; c++) {
        const sprite = sprites[c];
        for (const p of buckets[c]) {
          const grow = jump ? p.jg : intro ? 0.35 + 0.65 * p.k : 1;
          const alpha = jump ? p.ja : intro ? 0.3 + 0.7 * p.k : 1;
          if (alpha <= 0.01) continue;
          const size = base * p.scale * grow;
          if (streaks && Math.abs(p.x - p.tx) + Math.abs(p.y - p.ty) > 2) {
            streaks[c][Math.min(3, Math.floor(alpha * 4))].push(p);
          }
          if (alpha !== ga) ctx.globalAlpha = ga = alpha;
          ctx.drawImage(sprite, p.x - size / 2 + step / 2, p.y - size / 2 + step / 2, size, size);
        }
      }
      if (streaks) {
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.8, step * 0.28);
        streaks.forEach((buckets, c) => buckets.forEach((list, b) => {
          if (!list.length) return;
          ctx.strokeStyle = colors[c];
          ctx.globalAlpha = (b + 1) / 4 * 0.5;
          ctx.beginPath();
          for (const p of list) {
            ctx.moveTo(p.tx + step / 2, p.ty + step / 2);
            ctx.lineTo(p.x + step / 2, p.y + step / 2);
          }
          ctx.stroke();
        }));
      }
      ctx.globalAlpha = 1;
    }

    function start() {
      if (!stopLoop && visible && !disabled) stopLoop = onFrame(step60);
    }

    function disable() {
      disabled = true;
      ctx.clearRect(0, 0, w, h);
      root.classList.remove('particles-on');
    }

    function endIntro() {
      if (!intro) return;
      intro = null;
      for (const p of pts) p.k = 1;
    }

    function burst(x, y, power) {
      endIntro();
      if (jump || disabled) return;
      for (const p of pts) {
        const dx = p.hx - x, dy = p.hy - y;
        const d = Math.hypot(dx, dy) || 1;
        const f = power * Math.max(0, 1 - d / (w * 0.5));
        p.vx += (dx / d) * f + (Math.random() - 0.5) * f * 0.6;
        p.vy += (dy / d) * f + (Math.random() - 0.5) * f * 0.6;
      }
    }

    const hero = canvas.parentElement;
    const setPointer = (cx, cy) => {
      pointer.x = cx - (rectLeft - window.scrollX);
      pointer.y = cy - (rectTop - scrollPos);
    };
    const clearPointer = () => { pointer.x = pointer.y = -1e4; };
    hero.addEventListener('pointermove', (e) => {
      if (intro && performance.now() - intro.start > 900) endIntro();
      setPointer(e.clientX, e.clientY);
    });
    hero.addEventListener('pointerleave', clearPointer);
    hero.addEventListener('touchmove', (e) => setPointer(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    hero.addEventListener('touchend', clearPointer);
    const burstAt = (e) => {
      if (e.target.closest('a, button')) return;
      setPointer(e.clientX, e.clientY);
      burst(pointer.x, pointer.y, 12);
    };
    let lastPointer = 'mouse';
    hero.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType;
      if (e.pointerType === 'mouse') burstAt(e);
    });
    hero.addEventListener('click', (e) => {
      if (lastPointer !== 'mouse') burstAt(e);
    });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    }).observe(canvas);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (disabled) return;
        const r = canvas.getBoundingClientRect();
        if (r.width === w && r.height === h && dpr === Math.min(window.devicePixelRatio || 1, isLite() ? 1 : 2)) return;
        build(false);
      }, 150);
    });
    document.addEventListener('litechange', () => {
      if (disabled) return;
      if (isUltra()) disable();
      else build(false);
    });

    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      if (isUltra()) return disable();
      build(true);
      root.classList.add('particles-on');
      start();
    });

    return {
      recolor,
      hyperspace({ flipColours = false } = {}) {
        if (jump || disabled) return;
        const now = performance.now();
        intro = null;
        flip = null;
        const vx = w / 2, vy = h / 2;
        for (const p of pts) {
          p.jd = Math.random() * J_STAGGER;
          const ox = p.hx - vx, oy = p.hy - vy;
          const len = Math.hypot(ox, oy);
          const ang = len > 1 ? Math.atan2(oy, ox) : Math.random() * Math.PI * 2;
          p.dx = Math.cos(ang); p.dy = Math.sin(ang);
          p.dh = len;
          p.d0 = Math.hypot(p.x - vx, p.y - vy);
          p.js = 0.55 + Math.random() * 0.9;
          p.ds = 0.05 + Math.random() * 0.45;
        }
        jump = {
          t0: now,
          swapped: false,
          apply() {
            if (flipColours) {
              inverted = cosmic ? true : !inverted;
              cosmic = false;
            } else {
              cosmic = true;
            }
          },
        };
      },
    };
  })();

  const themeBtn = document.querySelector('.theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function syncThemeUI() {
    const dark = !isLight();
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeMeta.content = dark ? '#05060f' : '#f5f0e7';
  }
  syncThemeUI();

  function setTheme(next) {
    root.dataset.theme = next;
    syncThemeUI();
    paintAurora();
    if (field) field.recolor();
    if (sky) sky.redraw();
  }
  const systemLight = matchMedia('(prefers-color-scheme: light)');
  const systemTheme = () => (systemLight.matches ? 'light' : 'dark');
  systemLight.addEventListener('change', () => {
    if (!store.get('theme')) setTheme(systemTheme());
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') setTheme(e.newValue || systemTheme());
  });

  let themeVT = null, pendingTheme = null, skippedAt = 0;
  document.addEventListener('pointerdown', () => {
    if (!themeVT) return;
    themeVT.skipTransition();
    skippedAt = performance.now();
  }, true);
  document.addEventListener('click', (e) => {
    if (e.target !== root || performance.now() - skippedAt > 1000) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('a, button');
    if (hit) hit.click();
  }, true);
  themeBtn.addEventListener('click', () => {
    const current = themeVT ? pendingTheme : isLight() ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    const apply = () => {
      if (next === systemTheme()) store.remove('theme');
      else store.set('theme', next);
      setTheme(next);
    };
    if (themeVT) themeVT.skipTransition();
    if (!document.startViewTransition || reduceMotion) return apply();

    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('vt');
    const vt = (themeVT = document.startViewTransition(apply));
    pendingTheme = next;
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    vt.finished.catch(() => {}).finally(() => {
      if (themeVT !== vt) return;
      themeVT = pendingTheme = null;
      root.classList.remove('vt');
    });
  });

  const revealer = new IntersectionObserver((entries) => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.style.transitionDelay = `${i++ * 0.08}s`;
      el.classList.add('in');
      revealer.unobserve(el);
      el.addEventListener('transitionend', function done(ev) {
        if (ev.target !== el || ev.propertyName !== 'transform') return;
        el.removeEventListener('transitionend', done);
        el.classList.remove('reveal', 'in');
        el.style.transitionDelay = '';
      });
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));

  const glance = document.querySelector('.glance');
  new IntersectionObserver(([e]) => glance.classList.toggle('is-shown', !e.isIntersecting), {
    rootMargin: '-55% 0px 0px 0px',
  }).observe(document.querySelector('.hero'));

  const glanceLinks = [...document.querySelectorAll('.glance a')];
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of glanceLinks) {
        const on = a.hash === `#${e.target.id}`;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-49% 0px -50% 0px' });
  ['about', 'career', 'work', 'quests', 'contact'].forEach((id) => spy.observe(document.getElementById(id)));

  (function stats() {
    const nf = new Intl.NumberFormat('en');
    const pct = (n, total) => `${Math.round((n / total) * 100)}%`;
    const num = (v) => Number.isFinite(v);
    const set = (attr, name, value) => {
      const el = document.querySelector(`[${attr}="${name}"]`);
      if (!el || value == null || el.textContent === String(value)) return;
      el.textContent = value;
      el.classList.remove('updated');
      void el.offsetWidth;
      el.classList.add('updated');
    };
    const stamp = (key, iso) => {
      const tag = document.querySelector(`[data-stats-status="${key}"]`);
      const when = new Date(iso);
      if (!tag || isNaN(when)) return;
      const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const fresh = Date.now() - when < 3 * 864e5;
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = `, updated ${date}`;
      tag.replaceChildren(fresh ? 'live' : `as of ${date}`, ...(fresh ? [sr] : []));
      tag.classList.toggle('is-live', fresh);
      tag.title = `Updated ${date}`;
    };
    fetch('data/stats.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ chess: c, leetcode: lc }) => {
        if (c && num(c.games) && c.games > 0) {
          set('data-chess', 'games', nf.format(c.games));
          if (num(c.wins)) {
            set('data-chess', 'wins', nf.format(c.wins));
            set('data-chess', 'winrate', pct(c.wins, c.games));
          }
          for (const mode of ['blitz', 'rapid', 'bullet']) {
            if (!c[mode]) continue;
            if (num(c[mode].rating)) set('data-chess', mode, c[mode].rating);
            if (num(c[mode].best)) set('data-chess', `${mode}-best`, `best ${c[mode].best}`);
          }
          stamp('chess', c.updatedAt);
        }
        if (lc && num(lc.solved) && lc.solved > 0) {
          set('data-lc', 'solved', nf.format(lc.solved));
          for (const level of ['easy', 'medium', 'hard']) {
            if (!num(lc[level])) continue;
            set('data-lc', level, nf.format(lc[level]));
            set('data-lc', `${level}-pct`, pct(lc[level], lc.solved));
          }
          stamp('leetcode', lc.updatedAt);
        }
      })
      .catch(() => {});
  })();

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    let resetTimer;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'copied ✓';
        toast('Email copied. Houston, your move.');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => (btn.textContent = 'copy'), 2000);
      } catch {
        toast(`Couldn't copy. Here it is: ${btn.dataset.copy}`, 10000);
      }
    });
  });

  const sheet = document.getElementById('sheet');
  const sheetBody = sheet && sheet.querySelector('.sheet-body');
  function openSheet(name) {
    const tpl = document.getElementById(`tpl-${name}`);
    if (!tpl) return;
    sheetBody.replaceChildren(tpl.content.cloneNode(true));
    sheetBody.querySelectorAll('[data-clone]').forEach((slot) => {
      const src = document.querySelector(slot.dataset.clone);
      if (!src) return slot.remove();
      const copy = src.cloneNode(true);
      copy.removeAttribute('id');
      copy.classList.add('is-playing');
      copy.querySelectorAll('[id]').forEach((el) => {
        const id = `${el.id}-sheet`;
        copy.querySelectorAll(`[fill="url(#${el.id})"]`).forEach((ref) => ref.setAttribute('fill', `url(#${id})`));
        el.id = id;
      });
      slot.replaceChildren(copy);
    });
    sheetBody.scrollTop = 0;
    sheet.showModal();
    if (window.lenis) window.lenis.stop();
  }
  if (sheet) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sheet]');
      if (btn) openSheet(btn.dataset.sheet);
    });
    sheet.querySelector('.sheet-close').addEventListener('click', () => sheet.close());
    let downOnBackdrop = false;
    sheet.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === sheet; });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet && downOnBackdrop && e.detail <= 1 && !String(getSelection())) sheet.close();
    });
    sheet.addEventListener('close', () => { if (window.lenis) window.lenis.start(); });
  }

  const playing = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('is-playing', e.isIntersecting);
  });
  document.querySelectorAll('.chapter-visual').forEach((el) => playing.observe(el));

  document.querySelectorAll('[data-site]').forEach((card) => {
    const on = () => window.planetFocus && window.planetFocus(card.dataset.site);
    const off = () => window.planetFocus && window.planetFocus(null);
    card.addEventListener('pointerenter', on);
    card.addEventListener('pointerleave', off);
    card.addEventListener('focusin', on);
    card.addEventListener('focusout', off);
  });

  // Phones: the project cards are a swipe row; turn the planet toward whichever card is in view.
  const projectGrid = document.querySelector('.project-grid');
  if (projectGrid) {
    const cards = [...projectGrid.querySelectorAll('[data-site]')];
    let shown = null;
    projectGrid.addEventListener('scroll', () => {
      const step = cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : 1;
      const i = Math.min(cards.length - 1, Math.round(projectGrid.scrollLeft / step));
      const site = projectGrid.scrollLeft < 8 ? null : cards[i].dataset.site;
      if (site !== shown && window.planetFocus) window.planetFocus((shown = site));
    }, { passive: true });
  }

  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  const sheetOpen = () => !!(sheet && sheet.open);
  function cheat() {
    const engage = () => {
      toast('Cheat code accepted. Engaging hyperspace…');
      if (sky) sky.warp();
      if (field) field.hyperspace();
    };
    if (window.glideTo && scrollY > 2) window.glideTo(0, engage);
    else if (window.glideTo) engage();
    else {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(engage, 350);
    }
  }
  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = key === code[pos] ? pos + 1 : key === code[0] ? Math.min(pos, 2) || 1 : 0;
    if (pos === code.length) {
      pos = 0;
      if (!sheetOpen()) cheat();
    }
  });
  let taps = 0, tapTimer;
  document.querySelector('.hero').addEventListener('click', (e) => {
    if (e.target.closest('a, button') || sheetOpen()) return;
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => (taps = 0), 700);
    if (taps >= 5) {
      taps = 0;
      if (sky) sky.warp();
      if (field) field.hyperspace({ flipColours: true });
    }
  });
})();
