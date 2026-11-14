(() => {
  'use strict';
  const { TAU, rand, clamp, angleDiff, mix } = Ascii;

  function make(w) {
    const depth = rand(0.5, 1);
    return {
      x: rand(0, w.W), y: rand(0, w.H), heading: rand(0, TAU),
      length: rand(90, 130) * (0.65 + 0.35 * depth),
      depth, seed: rand(0, 100), speed: 0,
      darting: false, targetX: 0, targetY: 0, until: w.time + rand(0, 2),
    };
  }

  function dartTo(w, d, x, y) {
    d.targetX = clamp(x, 60, w.W - 60);
    d.targetY = clamp(y, 60, w.H - 60);
    d.darting = true;
  }

  // Pick the next place to hover: near the cursor if curious, otherwise somewhere ahead.
  function chooseTarget(w, d) {
    const p = w.pointer;
    if (w.S.cursor === 'curious' && p.inside) {
      const a = rand(0, TAU), r = rand(60, 220);
      dartTo(w, d, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    } else {
      const a = d.heading + rand(-1.4, 1.4), r = rand(160, 480);
      dartTo(w, d, d.x + Math.cos(a) * r, d.y + Math.sin(a) * r);
    }
  }

  function update(w, dt) {
    const S = w.S, p = w.pointer;
    for (const d of w.list) {
      if (!d.darting) {
        d.speed += (0 - d.speed) * Math.min(1, dt * 10);
        const scared = S.cursor === 'shy' && p.inside && Math.hypot(p.x - d.x, p.y - d.y) < 200;
        if (scared) {
          const a = Math.atan2(d.y - p.y, d.x - p.x) + rand(-0.6, 0.6);
          dartTo(w, d, d.x + Math.cos(a) * 360, d.y + Math.sin(a) * 360);
        } else if (w.time >= d.until) {
          chooseTarget(w, d);
        }
        continue;
      }

      const dx = d.targetX - d.x, dy = d.targetY - d.y, dist = Math.hypot(dx, dy);
      if (dist < 14) {
        d.darting = false;
        d.until = w.time + rand(0.5, 2.4) * S.hover;
        continue;
      }
      const turn = 10 * dt;
      d.heading += clamp(angleDiff(d.heading, Math.atan2(dy, dx)), -turn, turn);
      const target = Math.min(560 * S.speed, 60 + dist * 5); // slows as it arrives
      d.speed += (target - d.speed) * Math.min(1, dt * 6);
      d.x += Math.cos(d.heading) * d.speed * dt;
      d.y += Math.sin(d.heading) * d.speed * dt;
    }
  }

  function click(w, x, y) {
    for (const d of w.list) {
      const dx = d.x - x, dy = d.y - y, dist = Math.hypot(dx, dy) || 1;
      if (dist > 500) continue;
      const a = Math.atan2(dy, dx) + rand(-0.5, 0.5);
      dartTo(w, d, d.x + Math.cos(a) * 420, d.y + Math.sin(a) * 420);
    }
  }

  function draw(w) {
    for (const d of w.list) {
      const L = d.length, bright = 0.4 + 0.6 * d.depth;
      // While hovering it bobs in place.
      const bob = d.darting ? 0 : 1;
      const x = d.x + Math.sin(w.time * 5 + d.seed) * 3 * bob, y = d.y + Math.cos(w.time * 4.3 + d.seed) * 3 * bob;
      const fx = Math.cos(d.heading), fy = Math.sin(d.heading);
      const body = w.colour(w.accent, bright);
      const tail = w.colour(mix(w.accent, w.T.bg, 0.3), bright);
      const eyes = w.colour(mix(w.accent, w.T.light, 0.6), bright);
      const wing = w.colour(mix(w.T.light, w.accent, 0.25), bright * 0.75);

      // Two pairs of wings, beating too fast to see: they flicker instead.
      const buzz = 0.5 + 0.5 * Math.sin(w.time * 46 + d.seed);
      for (const [along, sweep] of [[0.1, 0.16], [-0.06, -0.2]]) {
        const ax = x + fx * L * along, ay = y + fy * L * along;
        for (const side of [-1, 1]) {
          const tipX = ax - fy * side * L * 0.58 + fx * L * (sweep + 0.05 * buzz);
          const tipY = ay + fx * side * L * 0.58 + fy * L * (sweep + 0.05 * buzz);
          w.line(ax, ay, tipX, tipY, L * 0.06, L * 0.09, 0.42 + 0.16 * buzz, wing);
        }
      }
      w.line(x, y, x - fx * L * 0.72, y - fy * L * 0.72, L * 0.07, L * 0.04, 0.9, tail);
      w.stamp(x + fx * L * 0.08, y + fy * L * 0.08, L * 0.1, 0.95, body);
      w.stamp(x + fx * L * 0.24, y + fy * L * 0.24, L * 0.085, 1, eyes);
    }
  }

  Ascii.start({
    name: 'dragonflies',
    backdrop: 'air',
    defaults: { count: 8, speed: 1, hover: 1, cursor: 'ignore', accent: '#4de0c8', theme: 'deep' },
    make, update, draw, click,
  });
})();
