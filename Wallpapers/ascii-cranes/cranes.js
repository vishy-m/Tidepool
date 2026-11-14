(() => {
  'use strict';
  const { TAU, rand, mix } = Ascii;

  function make(w) {
    const depth = rand(0.45, 1);
    return {
      x: rand(0, w.W), y: rand(0, w.H),
      heading: w.S.direction * Math.PI / 180,
      bias: rand(-0.22, 0.22),       // each bird's own lean off the flock's course
      size: rand(44, 66) * (0.6 + 0.4 * depth),
      depth, seed: rand(0, 100), speed: 0,
      phase: rand(0, TAU), open: 1, glide: 0, glideUntil: 0,
      scaredUntil: 0, scareX: 0, scareY: 0,
    };
  }

  function update(w, dt) {
    const S = w.S, course = S.direction * Math.PI / 180;
    for (const c of w.list) {
      if (c.resting) { // set by a scene: come down onto a log or rock, wings folded
        c.x += (c.resting.x - c.x) * Math.min(1, dt * 1.8);
        c.y += (c.resting.y - c.y) * Math.min(1, dt * 1.8);
        c.speed = 0; c.glide = 1;
        c.open += (0.2 - c.open) * Math.min(1, dt * 2.5);
        continue;
      }
      const want = course + c.bias + 0.15 * Math.sin(w.time * 0.2 + c.seed);
      const v = { x: Math.cos(want), y: Math.sin(want) };
      w.apart(v, c, c.size * 2.4, 0.8);
      let fear = w.cursor(v, c, 280, 420, 120);
      if (w.time < c.scaredUntil) {
        v.x += c.scareX * 3; v.y += c.scareY * 3;
        fear = 1;
      }
      w.turn(c, v, 1.2 + 3 * fear, dt);

      const target = 85 * S.speed * (0.65 + 0.35 * c.depth) * (1 + fear);
      c.speed += (target - c.speed) * Math.min(1, dt * 3);
      c.x += Math.cos(c.heading) * c.speed * dt;
      c.y += Math.sin(c.heading) * c.speed * dt;
      w.wrap(c, c.size * 2.5);

      if (fear < 0.1 && w.time > c.glideUntil && Math.random() < 0.18 * dt) c.glideUntil = w.time + rand(0.8, 2.2);
      if (fear > 0.1) c.glideUntil = 0;
      c.glide += ((w.time < c.glideUntil ? 1 : 0) - c.glide) * Math.min(1, dt * 4);
      c.phase += dt * TAU * 1.1 * S.flapRate * (1 + fear) * (1 - 0.9 * c.glide);
      const beat = 0.5 + 0.5 * Math.cos(c.phase);
      c.open = (0.3 + 0.7 * beat) * (1 - c.glide) + 0.95 * c.glide;
    }
  }

  function click(w, x, y) {
    for (const c of w.list) {
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > 520) continue;
      c.scareX = dx / d; c.scareY = dy / d;
      c.scaredUntil = w.time + rand(0.8, 1.6);
    }
  }

  function draw(w) {
    for (const c of w.list) {
      const s = c.size, bright = 0.35 + 0.65 * c.depth;
      const fx = Math.cos(c.heading), fy = Math.sin(c.heading), lx = -fy, ly = fx;
      const at = (across, forward) => [c.x + lx * across * s + fx * forward * s, c.y + ly * across * s + fy * forward * s];
      const paper = w.colour(w.T.light, bright);
      const fold = w.colour(mix(w.T.light, w.T.bg, 0.3), bright);
      const accent = w.colour(w.accent, bright);

      // Seen from above, the wings look shorter at the top and bottom of each beat.
      const front = at(0, 0.25), rear = at(0, -0.3);
      for (const side of [-1, 1]) {
        const tip = at(side * 1.75 * c.open, -0.4);
        w.line(front[0], front[1], tip[0], tip[1], s * 0.24, s * 0.06, 0.8, paper);
        w.line(rear[0], rear[1], tip[0], tip[1], s * 0.2, s * 0.06, 0.55, fold);
        w.line(c.x, c.y, tip[0], tip[1], s * 0.24, s * 0.06, 0.7, paper);
        w.stamp(tip[0], tip[1], s * 0.1, 0.9, accent);
      }

      const chest = at(0, 0.35), tail = at(0, -1.05), head = at(0, 1.15);
      w.line(rear[0], rear[1], tail[0], tail[1], s * 0.13, s * 0.04, 0.7, fold);
      w.line(chest[0], chest[1], rear[0], rear[1], s * 0.2, s * 0.14, 0.95, paper);
      w.line(chest[0], chest[1], head[0], head[1], s * 0.1, s * 0.07, 0.85, paper);
      w.stamp(head[0], head[1], s * 0.1, 1, accent);
    }
  }

  Ascii.start({
    name: 'cranes',
    backdrop: 'air',
    defaults: { count: 9, speed: 1, direction: 20, flapRate: 1, cursor: 'ignore', accent: '#ff5a4d', theme: 'night' },
    make, update, draw, click,
  });
})();
