(() => {
  'use strict';
  const { TAU, rand, mix, hue } = Ascii;

  function make(w) {
    const depth = rand(0.5, 1);
    return {
      x: rand(0, w.W), y: rand(0, w.H),
      heading: rand(0, TAU), wander: 0, speed: 0,
      size: rand(36, 54) * (0.65 + 0.35 * depth), // wing length
      depth, phase: rand(0, TAU), tone: rand(-1, 1),
      driftX: 0, driftY: 0,        // the zigzag on top of where it is heading
      open: 1, glide: 0, glideUntil: 0, startledUntil: 0,
    };
  }

  function update(w, dt) {
    const S = w.S;
    for (const b of w.list) {
      if (b.sitting) { // set by a scene: settled on a flower, slowly fanning its wings
        b.x += (b.sitting.x - b.x) * Math.min(1, dt * 5);
        b.y += (b.sitting.y - b.y) * Math.min(1, dt * 5);
        b.speed = 0; b.driftX = 0; b.driftY = 0;
        b.phase += dt * TAU * 0.3;
        b.open = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(b.phase));
        continue;
      }
      const startled = w.time < b.startledUntil;
      b.wander = (b.wander + rand(-2.4, 2.4) * dt) * (1 - 0.5 * dt);
      const v = { x: Math.cos(b.heading + b.wander), y: Math.sin(b.heading + b.wander) };
      w.edges(v, b, 120);
      w.apart(v, b, b.size * 2);
      const fear = startled ? 1 : w.cursor(v, b, 220, 420, 80);
      w.turn(b, v, 2.4 + 3 * fear, dt);

      const kick = Math.sqrt(dt) * 420 * S.flutter * (1 - 0.8 * b.glide);
      b.driftX += -b.driftX * 3 * dt + rand(-1, 1) * kick;
      b.driftY += -b.driftY * 3 * dt + rand(-1, 1) * kick;

      const target = 60 * S.speed * (0.7 + 0.3 * b.depth) * (1 + 2.2 * fear);
      b.speed += (target - b.speed) * Math.min(1, dt * 4);
      b.x += (Math.cos(b.heading) * b.speed + b.driftX) * dt;
      b.y += (Math.sin(b.heading) * b.speed + b.driftY) * dt;

      // Now and then it stops flapping and glides with its wings held flat.
      if (!startled && w.time > b.glideUntil && Math.random() < 0.25 * dt) b.glideUntil = w.time + rand(0.5, 1.4);
      if (startled) b.glideUntil = 0;
      b.glide += ((w.time < b.glideUntil ? 1 : 0) - b.glide) * Math.min(1, dt * 6);
      b.phase += dt * TAU * 3.2 * S.flapRate * (1 + fear) * (1 - 0.9 * b.glide);
      const beat = Math.pow(0.5 + 0.5 * Math.cos(b.phase), 0.8);
      b.open = 0.12 + 0.88 * (beat * (1 - b.glide) + 0.96 * b.glide);
    }
  }

  function click(w, x, y) {
    for (const b of w.list) {
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > 460) continue;
      b.heading = Math.atan2(dy, dx) + rand(-0.5, 0.5);
      b.startledUntil = w.time + rand(0.7, 1.4);
    }
  }

  function draw(w) {
    const S = w.S;
    for (const b of w.list) {
      const fx = Math.cos(b.heading), fy = Math.sin(b.heading), s = b.size;
      const bright = 0.4 + 0.6 * b.depth;
      const base = S.variety ? hue(w.accent, b.tone * 55) : w.accent;
      const wing = w.colour(mix(base, w.T.light, 0.12), bright);
      const edge = w.colour(mix(base, w.T.bg, 0.45), bright);
      const body = w.colour(w.T.light, bright * 0.7);

      // Seen from above, wings look narrower as they lift, so they shrink toward the body.
      for (const side of [-1, 1]) {
        const px = -fy * side, py = fx * side;
        const foreX = b.x + fx * s * 0.25 + px * s * 0.62 * b.open, foreY = b.y + fy * s * 0.25 + py * s * 0.62 * b.open;
        const hindX = b.x - fx * s * 0.38 + px * s * 0.46 * b.open, hindY = b.y - fy * s * 0.38 + py * s * 0.46 * b.open;
        const foreR = s * (0.28 + 0.34 * b.open), hindR = s * (0.22 + 0.26 * b.open);
        w.stamp(foreX, foreY, foreR, 0.6, edge);
        w.stamp(foreX, foreY, foreR * 0.62, 0.95, wing);
        w.stamp(hindX, hindY, hindR, 0.55, edge);
        w.stamp(hindX, hindY, hindR * 0.6, 0.9, wing);
        w.stroke(b.x + fx * s * 0.5, b.y + fy * s * 0.5,
                 b.x + fx * s * 0.95 + px * s * 0.28, b.y + fy * s * 0.95 + py * s * 0.28, body); // antenna
      }
      w.line(b.x + fx * s * 0.5, b.y + fy * s * 0.5, b.x - fx * s * 0.55, b.y - fy * s * 0.55, s * 0.07, s * 0.05, 1, body);
    }
  }

  Ascii.start({
    name: 'butterflies',
    backdrop: 'air',
    defaults: { count: 14, speed: 1, flutter: 1, flapRate: 1, variety: true, cursor: 'ignore', accent: '#5f9bff', theme: 'night' },
    make, update, draw, click,
  });
})();
