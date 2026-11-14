// Shared by every "ASCII ..." wallpaper. The screen is a grid of character cells; a creature
// script describes how its animals move and stamps their shapes into the grid each frame.
//
//   Ascii.start({
//     backdrop: 'water' | 'air' | 'sand',
//     defaults: { count: 8, ... },          // setting values used outside the app
//     make(world) -> creature,               // called until there are `count` of them
//     update(world, dt), draw(world),
//     click(world, x, y),                    // optional
//   });
//
// The helpers on `world` read their state through `this`, so a scene can hand a creature script a
// derived world (Object.create(world)) with its own list, size and offset. See ascii-ecosystem.
window.Ascii = (() => {
  'use strict';

  const TAU = Math.PI * 2;
  const RAMP = '.:-=+*#%@';
  const THEMES = {
    night: { bg: [10, 15, 20], dim: [78, 122, 164], light: [236, 232, 222], dark: [70, 78, 92], food: [214, 178, 110] },
    deep: { bg: [3, 22, 26], dim: [48, 150, 146], light: [222, 240, 232], dark: [36, 84, 88], food: [230, 200, 120] },
    dusk: { bg: [17, 12, 28], dim: [124, 98, 176], light: [238, 228, 240], dark: [78, 66, 100], food: [230, 190, 130] },
    sand: { bg: [30, 23, 16], dim: [156, 124, 86], light: [242, 228, 204], dark: [104, 78, 54], food: [236, 200, 120] },
    paper: { bg: [241, 236, 226], dim: [128, 146, 160], light: [132, 126, 116], dark: [34, 34, 38], food: [150, 110, 60] },
  };
  // What fills the empty cells: glyphs from faint to strong, and how strong each cell is right now.
  const BACKDROPS = {
    water: {
      glyphs: ['.', '-', '~'],
      level(col, row, t) {
        const s = Math.sin(col * 0.31 + t * 0.6 + Math.sin(row * 0.17 + t * 0.23) * 2.1)
          * Math.sin(row * 0.43 - t * 0.4 + col * 0.05);
        return s > 0.9 ? (s - 0.9) * 4 : 0;
      },
    },
    air: {
      glyphs: ['.', "'", '*'],
      level(col, row, t) {
        const s = Math.sin(col * 0.53 + row * 0.9 + t * 0.12) * Math.sin(row * 0.71 + col * 0.13 - t * 0.08);
        return s > 0.95 ? (s - 0.95) * 5 : 0;
      },
    },
    sand: {
      glyphs: ['.', ',', ':'],
      level(col, row) {
        const h = hash(col * 13.37 + row * 71.93);
        return h > 0.985 ? 0.4 : h > 0.955 ? 0.15 : 0;
      },
    },
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angleDiff(from, to) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function noise(x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash(i), hash(i + 1), u);
  }
  function parseHex(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  // Rotate a colour around the colour wheel by `degrees`.
  function hue(c, degrees) {
    const a = degrees * Math.PI / 180, k = Math.cos(a), s = Math.sin(a) * Math.sqrt(1 / 3), m = (1 - k) / 3;
    return [
      clamp(c[0] * (k + m) + c[1] * (m - s) + c[2] * (m + s), 0, 255),
      clamp(c[0] * (m + s) + c[1] * (k + m) + c[2] * (m - s), 0, 255),
      clamp(c[0] * (m - s) + c[1] * (m + s) + c[2] * (k + m), 0, 255),
    ];
  }
  function css(packed) { return `rgb(${packed >> 16},${(packed >> 8) & 255},${packed & 255})`; }

  // Lets a wallpaper run in a normal browser tab while you work on it.
  function browserFallback() {
    const handlers = {};
    const api = {
      settings: {}, pointer: { x: 0, y: 0, inside: false }, paused: false,
      on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
      emit(type, detail) { (handlers[type] || []).forEach((fn) => fn(detail)); },
    };
    // Settings can be tried from the address bar: index.html?count=20&theme=dusk
    for (const [key, value] of new URLSearchParams(location.search)) {
      api.settings[key] = value === 'true' ? true : value === 'false' ? false : Number.isNaN(Number(value)) ? value : Number(value);
    }
    addEventListener('pointermove', (e) => {
      api.pointer = { x: e.clientX, y: e.clientY, inside: true };
      api.emit('pointermove', api.pointer);
    });
    addEventListener('pointerdown', (e) => api.emit('click', { x: e.clientX, y: e.clientY }));
    document.addEventListener('pointerleave', () => { api.pointer.inside = false; });
    return api;
  }

  function start(spec) {
    // A page that combines several creature scripts collects their specs instead of running them.
    if (window.Ascii.collect) { window.Ascii.collect[spec.name] = spec; return null; }
    const wp = window.wallpaper || browserFallback();
    const S = Object.assign(
      { count: 8, cell: 11, theme: 'night', cursor: 'ignore', accent: '#ffffff', ripples: true, shimmer: true, fps: 60 },
      spec.defaults, wp.settings);
    const backdrop = BACKDROPS[spec.backdrop] || BACKDROPS.water;

    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    // Per cell: `ink` is how solid a creature is there (it picks the glyph) and `tint` its colour;
    // `back` holds ripples; `mark` holds single characters such as legs, drawn where there is no ink.
    let cw = 0, ch = 0, cols = 0, rows = 0, dpr = 1;
    let ink, tint, back, mark, markTint, markTop;
    const rings = [];

    const world = {
      S, W: 0, H: 0, time: 0, list: [],
      // How far (px) the character grid is slid to the left. A scrolling scene sets this to its
      // scroll position modulo the cell width, so the grid travels with the scenery instead of
      // the scenery snapping from cell to cell.
      shift: 0,
      T: THEMES.night, accent: parseHex(S.accent),
      get pointer() { return wp.pointer; },

      /** A colour faded toward the background; `amount` 1 is the full colour. */
      colour(rgb, amount = 1) {
        const bg = this.T.bg;
        return (Math.round(lerp(bg[0], rgb[0], amount)) << 16)
          | (Math.round(lerp(bg[1], rgb[1], amount)) << 8)
          | Math.round(lerp(bg[2], rgb[2], amount));
      },

      /** A soft disc. Each cell keeps whichever stamp is most solid there. */
      stamp(px, py, radius, strength, colour) {
        px += world.shift;
        const r = Math.max(radius, ch * 0.62);
        const c0 = Math.max(0, Math.floor((px - r) / cw)), c1 = Math.min(cols - 1, Math.floor((px + r) / cw));
        const r0 = Math.max(0, Math.floor((py - r) / ch)), r1 = Math.min(rows - 1, Math.floor((py + r) / ch));
        for (let row = r0; row <= r1; row++) {
          const dy = (row + 0.5) * ch - py;
          for (let col = c0; col <= c1; col++) {
            const dx = (col + 0.5) * cw - px;
            const q = (dx * dx + dy * dy) / (r * r);
            if (q >= 1) continue;
            const v = strength * (1 - q * q);
            const i = row * cols + col;
            if (v > ink[i]) { ink[i] = v; tint[i] = colour; }
          }
        }
      },

      /** Stamps along a line, the radius going from r1 to r2. */
      line(x1, y1, x2, y2, r1, r2, strength, colour) {
        const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cw * 0.9)));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          this.stamp(lerp(x1, x2, t), lerp(y1, y2, t), lerp(r1, r2, t), strength, colour);
        }
      },

      /** A one-character-wide line drawn with - / | \ to match its slope. */
      stroke(x1, y1, x2, y2, colour) {
        let a = Math.atan2(y2 - y1, x2 - x1);
        if (a < 0) a += Math.PI;
        const code = a < Math.PI / 8 || a >= Math.PI * 7 / 8 ? 45 : a < Math.PI * 3 / 8 ? 92 : a < Math.PI * 5 / 8 ? 124 : 47;
        const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cw * 0.8)));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          put(lerp(x1, x2, t), lerp(y1, y2, t), code, colour, 0);
        }
      },

      /** One character. With `onTop` it shows even over a creature's body (eyes, for instance). */
      glyph(x, y, char, colour, onTop = false) { put(x, y, char.charCodeAt(0), colour, onTop ? 1 : 0); },

      /** An expanding ripple. */
      ring(x, y, strength) {
        if (!this.S.ripples) return;
        rings.push({ x, y, born: world.time, strength });
        if (rings.length > 48) rings.shift();
      },

      // Steering: build up a vector from several influences, then turn toward it.
      /** Pushes back toward the screen when within `margin` of an edge. */
      edges(v, c, margin = 140, gain = 1.6) {
        if (c.x < margin) v.x += (margin - c.x) / margin * gain;
        if (c.x > this.W - margin) v.x -= (c.x - (this.W - margin)) / margin * gain;
        if (c.y < margin) v.y += (margin - c.y) / margin * gain;
        if (c.y > this.H - margin) v.y -= (c.y - (this.H - margin)) / margin * gain;
      },
      /** Pushes away from other creatures closer than `distance`. */
      apart(v, c, distance, gain = 1.4) {
        for (const other of this.list) {
          if (other === c) continue;
          const dx = c.x - other.x, dy = c.y - other.y, d = Math.hypot(dx, dy) || 1;
          if (d < distance) { v.x += dx / d * (1 - d / distance) * gain; v.y += dy / d * (1 - d / distance) * gain; }
        }
      },
      /** Applies the Cursor setting. Returns how frightened the creature is, 0 to 1. */
      cursor(v, c, shyRadius = 260, curiousRadius = 420, orbit = 100) {
        const p = this.pointer, S = this.S;
        if (!p.inside) return 0;
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
        if (S.cursor === 'shy' && d < shyRadius) {
          const fear = 1 - d / shyRadius;
          v.x -= dx / d * fear * 5; v.y -= dy / d * fear * 5;
          return fear;
        }
        if (S.cursor === 'curious' && d < curiousRadius) {
          if (d > orbit) {
            v.x += dx / d * 1.1; v.y += dy / d * 1.1;
          } else { // close enough: circle it instead of sitting on it
            v.x += -dy / d * 0.9 - dx / d * 0.3; v.y += dx / d * 0.9 - dy / d * 0.3;
          }
        }
        return 0;
      },
      /** Turns c.heading toward the vector, at most `rate` radians per second. */
      turn(c, v, rate, dt) {
        c.heading += clamp(angleDiff(c.heading, Math.atan2(v.y, v.x)), -rate * dt, rate * dt);
      },
      /** Moves a creature that left one side of the screen to the opposite side. */
      wrap(c, margin) {
        if (c.x < -margin) c.x = this.W + margin; else if (c.x > this.W + margin) c.x = -margin;
        if (c.y < -margin) c.y = this.H + margin; else if (c.y > this.H + margin) c.y = -margin;
      },
    };

    function put(x, y, code, colour, top) {
      const col = Math.floor((x + world.shift) / cw), row = Math.floor(y / ch);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const i = row * cols + col;
      if (mark[i] && markTop[i] && !top) return;
      mark[i] = code; markTint[i] = colour; markTop[i] = top;
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      world.W = window.innerWidth;
      world.H = window.innerHeight;
      canvas.width = Math.round(world.W * dpr);
      canvas.height = Math.round(world.H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `600 ${S.cell}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      cw = ctx.measureText('M').width;
      ch = S.cell;
      cols = Math.ceil(world.W / cw) + 1; // one spare for when the grid is slid left
      rows = Math.ceil(world.H / ch);
      ink = new Float32Array(cols * rows);
      tint = new Uint32Array(cols * rows);
      back = new Float32Array(cols * rows);
      mark = new Uint16Array(cols * rows);
      markTint = new Uint32Array(cols * rows);
      markTop = new Uint8Array(cols * rows);
      world.cw = cw;
      if (spec.resized) spec.resized(world);
    }

    function syncCount() {
      if (!spec.make) return;
      const want = Math.round(clamp(S.count, 0, 80));
      while (world.list.length < want) world.list.push(spec.make(world));
      world.list.length = want;
      world.list.sort((a, b) => (a.depth || 0) - (b.depth || 0)); // deepest first, nearer ones draw over them
    }

    function drawRings() {
      while (rings.length && world.time - rings[0].born > 3.2) rings.shift();
      for (const ring of rings) {
        const age = world.time - ring.born;
        const life = 1.4 + 1.6 * ring.strength;
        if (age > life) continue;
        const fade = ring.strength * Math.pow(1 - age / life, 1.5);
        for (const [scale, gain] of [[1, 1], [0.62, 0.55]]) {
          const radius = (14 + age * 120) * scale;
          const steps = Math.max(10, Math.floor(TAU * radius / cw));
          for (let k = 0; k < steps; k++) {
            const a = k / steps * TAU;
            const col = Math.floor((ring.x + world.shift + Math.cos(a) * radius) / cw);
            const row = Math.floor((ring.y + Math.sin(a) * radius) / ch);
            if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
            const i = row * cols + col;
            if (fade * gain > back[i]) back[i] = fade * gain;
          }
        }
      }
    }

    function render() {
      world.T = THEMES[S.theme] || THEMES.night;
      ink.fill(0);
      back.fill(0);
      mark.fill(0);
      spec.draw(world);
      drawRings();

      // A scene with its own `ground` paints the background itself, column by column, or cell by
      // cell where a column is not one colour (`column` returns -1).
      // Slid by whole device pixels, which keeps the characters crisp.
      const ground = spec.ground, shift = Math.round(world.shift * dpr) / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, -shift * dpr, 0);
      if (ground) {
        // Neighbouring columns, and neighbouring cells in a split column, usually share a colour,
        // so each run of them is painted as one rectangle.
        let runStart = 0, runColour = -2;
        for (let col = 0; col <= cols; col++) {
          const x = col * cw;
          const whole = col < cols ? ground.column(world, x + cw / 2 - shift) : -2;
          if (whole === runColour) continue;
          if (runColour >= 0) { ctx.fillStyle = css(runColour); ctx.fillRect(runStart, 0, x - runStart + 1, world.H); }
          runStart = x; runColour = whole;
          if (whole !== -1) continue;
          runColour = -2;
          let from = 0, colour = ground.cell(world, x + cw / 2 - shift, ch / 2);
          for (let row = 1; row <= rows; row++) {
            const next = row < rows ? ground.cell(world, x + cw / 2 - shift, row * ch + ch / 2) : -1;
            if (next === colour) continue;
            ctx.fillStyle = css(colour);
            ctx.fillRect(x, from * ch, cw + 1, (row - from) * ch + 1);
            from = row; colour = next;
          }
        }
      } else {
        ctx.fillStyle = css(world.colour(world.T.bg));
        ctx.fillRect(0, 0, world.W + cw, world.H);
      }

      const shades = [0.3, 0.5, 0.75, 1].map((a) => css(world.colour(world.T.dim, a)));
      let current = -1; // the packed colour ctx.fillStyle is set to, to avoid resetting it per cell
      for (let row = 0; row < rows; row++) {
        const y = row * ch + ch / 2;
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const x = col * cw + cw / 2;
          const v = ink[i];
          if (mark[i] && (markTop[i] || v <= 0.05)) {
            if (markTint[i] !== current) { current = markTint[i]; ctx.fillStyle = css(current); }
            ctx.fillText(String.fromCharCode(mark[i]), x, y);
          } else if (v > 0.05) {
            if (tint[i] !== current) { current = tint[i]; ctx.fillStyle = css(current); }
            ctx.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))], x, y);
          } else if (ground) {
            // Returns true after setting ground.glyph and ground.colour, or false for an empty cell.
            if (ground.backdrop(world, col, row, x - shift, y, back[i])) {
              if (ground.colour !== current) { current = ground.colour; ctx.fillStyle = css(current); }
              ctx.fillText(ground.glyph, x, y);
            }
          } else {
            let w = back[i];
            if (S.shimmer) w = Math.max(w, backdrop.level(col, row, world.time));
            if (w > 0.04) {
              current = -1;
              ctx.fillStyle = shades[Math.min(3, Math.floor(w * 4))];
              ctx.fillText(backdrop.glyphs[w > 0.66 ? 2 : w > 0.33 ? 1 : 0], x, y);
            }
          }
        }
      }
    }

    let raf = 0, lastFrame = 0;
    function frame(now) {
      raf = 0;
      if (wp.paused) return;
      schedule();
      const minGap = 1000 / (Number(S.fps) || 60) - 2;
      if (now - lastFrame < minGap) return;
      const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
      lastFrame = now;
      world.time += dt;
      spec.update(world, dt);
      render();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    wp.on('settings', (changed) => {
      const cellChanged = changed.cell !== undefined && changed.cell !== S.cell;
      Object.assign(S, changed);
      world.accent = parseHex(S.accent);
      if (cellChanged) resize();
      syncCount();
      if (spec.settings) spec.settings(world);
    });
    wp.on('click', (p) => { if (spec.click) spec.click(world, p.x, p.y); });
    wp.on('resume', () => { lastFrame = performance.now(); schedule(); });
    addEventListener('resize', resize);

    resize();
    syncCount();
    schedule();
    return world;
  }

  function pack(rgb) { return (Math.round(rgb[0]) << 16) | (Math.round(rgb[1]) << 8) | Math.round(rgb[2]); }

  return { start, TAU, rand, clamp, lerp, angleDiff, hash, noise, parseHex, mix, hue, pack, THEMES, BACKDROPS };
})();
