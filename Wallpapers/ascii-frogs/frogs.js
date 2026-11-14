(() => {
  'use strict';
  const { TAU, rand, clamp, lerp, angleDiff, mix } = Ascii;

  function make(w) {
    return {
      x: rand(60, w.W - 60), y: rand(60, w.H - 60), heading: rand(0, TAU),
      size: rand(32, 46), depth: rand(0, 1),
      leaping: false, progress: 0, duration: 0.5,
      fromX: 0, fromY: 0, toX: 0, toY: 0, aim: 0,
      until: w.time + rand(0, 3),
    };
  }

  function leap(w, f, angle, power) {
    const distance = f.size * rand(3.2, 5.2) * w.S.leap * power;
    f.fromX = f.x; f.fromY = f.y;
    f.toX = clamp(f.x + Math.cos(angle) * distance, 40, w.W - 40);
    f.toY = clamp(f.y + Math.sin(angle) * distance, 40, w.H - 40);
    // A scene can give frogs places to land (lily pads) by providing `perch`.
    if (w.perch) [f.toX, f.toY] = w.perch(f.toX, f.toY, f);
    f.aim = Math.atan2(f.toY - f.y, f.toX - f.x);
    f.duration = 0.3 + Math.hypot(f.toX - f.x, f.toY - f.y) / 900;
    f.progress = 0;
    f.leaping = true;
  }

  function update(w, dt) {
    const S = w.S, p = w.pointer;
    for (const f of w.list) {
      if (f.leaping) {
        f.heading += clamp(angleDiff(f.heading, f.aim), -14 * dt, 14 * dt);
        f.progress += dt / f.duration;
        const t = Math.min(1, f.progress), eased = t * (2 - t);
        f.x = lerp(f.fromX, f.toX, eased);
        f.y = lerp(f.fromY, f.toY, eased);
        if (f.progress >= 1) {
          f.leaping = false;
          f.until = w.time + rand(0.8, 3.6) / S.hop;
          if (S.ripples) w.ring(f.x, f.y, 0.45);
        }
        continue;
      }

      const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy);
      if (p.inside && S.cursor === 'shy' && d < 150) {
        leap(w, f, Math.atan2(-dy, -dx) + rand(-0.5, 0.5), 1.1);
      } else if (w.time >= f.until) {
        // Usually onward, but back toward the middle near an edge, and toward the cursor if curious.
        const v = { x: Math.cos(f.heading + rand(-1, 1)), y: Math.sin(f.heading + rand(-1, 1)) };
        w.edges(v, f, 200, 3);
        if (p.inside && S.cursor === 'curious' && d > 120 && d < 600) { v.x += dx / d * 2; v.y += dy / d * 2; }
        leap(w, f, Math.atan2(v.y, v.x), 1);
      }
    }
  }

  function click(w, x, y) {
    w.ring(x, y, 1);
    for (const f of w.list) {
      const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 420 && !f.leaping) leap(w, f, Math.atan2(dy, dx) + rand(-0.4, 0.4), 1.3);
    }
  }

  function draw(w) {
    for (const f of w.list) {
      // Mid-leap it is nearer the viewer, so it draws a little bigger.
      const air = f.leaping ? Math.sin(Math.PI * Math.min(1, f.progress)) : 0;
      const s = f.size * (1 + 0.3 * air);
      const fx = Math.cos(f.heading), fy = Math.sin(f.heading), lx = -fy, ly = fx;
      const at = (across, forward) => [f.x + lx * across * s + fx * forward * s, f.y + ly * across * s + fy * forward * s];
      const skin = w.colour(w.accent);
      const belly = w.colour(mix(w.accent, w.T.light, 0.3));
      const bump = w.colour(mix(w.accent, w.T.bg, 0.25));
      const leg = w.colour(mix(w.accent, w.T.bg, 0.3));
      const eye = w.colour(w.T.light);

      // Back legs fold beside the body at rest and stretch out behind in the air.
      const stretch = f.leaping ? Math.min(1, f.progress * 5) * (1 - clamp((f.progress - 0.7) / 0.3, 0, 1)) : 0;
      for (const side of [-1, 1]) {
        const hip = at(side * 0.5, -0.6);
        const knee = at(side * lerp(1.0, 0.75, stretch), lerp(-0.45, -1.5, stretch));
        const foot = at(side * lerp(0.85, 0.9, stretch), lerp(-1.05, -2.3, stretch));
        w.line(hip[0], hip[1], knee[0], knee[1], s * 0.34, s * 0.26, 0.8, leg);
        w.line(knee[0], knee[1], foot[0], foot[1], s * 0.2, s * 0.12, 0.6, leg);
        const elbow = at(side * 0.6, 0.3), hand = at(side * 1.0, 0.7);
        w.stroke(elbow[0], elbow[1], hand[0], hand[1], leg);
      }

      const body = at(0, -0.2), head = at(0, 0.5);
      w.stamp(body[0], body[1], s * 0.8, 0.95, skin);
      w.stamp(body[0], body[1], s * 0.4, 1, belly);
      w.stamp(head[0], head[1], s * 0.6, 0.95, skin);
      for (const side of [-1, 1]) {
        const p = at(side * 0.42, 0.72);
        w.stamp(p[0], p[1], s * 0.26, 1, bump);
        w.glyph(p[0], p[1], 'o', eye, true);
      }
    }
  }

  Ascii.start({
    name: 'frogs',
    backdrop: 'water',
    defaults: { count: 8, hop: 1, leap: 1, cursor: 'ignore', accent: '#6fd66a', theme: 'deep' },
    make, update, draw, click,
  });
})();
