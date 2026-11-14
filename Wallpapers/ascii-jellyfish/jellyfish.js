(() => {
  'use strict';
  const { TAU, rand, lerp, mix } = Ascii;

  const ARMS = 4;  // trailing arms per jellyfish
  const JOINTS = 9; // points along each arm

  function make(w) {
    const depth = rand(0.45, 1);
    const j = {
      x: rand(0, w.W), y: rand(0, w.H), vx: 0, vy: 0,
      heading: rand(0, TAU), wander: 0,
      radius: rand(46, 72) * (0.6 + 0.4 * depth),
      depth, phase: rand(0, TAU), rate: rand(0.85, 1.15), seed: rand(0, 100),
      squeeze: 0, beat: 0, hurry: 0,
      arms: [],
    };
    for (let k = 0; k < ARMS; k++) {
      // Laid out trailing behind the bell, so they are in place from the first frame.
      const arm = new Float32Array(JOINTS * 2);
      const [ax, ay] = anchor(j, k);
      for (let i = 0; i < JOINTS; i++) {
        arm[i * 2] = ax - Math.cos(j.heading) * j.radius * 0.4 * i;
        arm[i * 2 + 1] = ay - Math.sin(j.heading) * j.radius * 0.4 * i;
      }
      j.arms.push(arm);
    }
    return j;
  }

  // Where arm k attaches along the back edge of the bell.
  function anchor(j, k) {
    const fx = Math.cos(j.heading), fy = Math.sin(j.heading);
    const side = (k - (ARMS - 1) / 2) / ((ARMS - 1) / 2) * j.radius * 0.55 * (1 - 0.3 * j.squeeze);
    return [j.x - fx * j.radius * 0.45 - fy * side, j.y - fy * j.radius * 0.45 + fx * side];
  }

  function update(w, dt) {
    const S = w.S;
    for (const j of w.list) {
      j.phase += dt * TAU * 0.42 * S.pulseRate * j.rate;
      j.beat = (j.phase / TAU) % 1; // 0 to 1 through each pulse
      j.squeeze = j.beat < 0.22 ? j.beat / 0.22 : 1 - (j.beat - 0.22) / 0.78;

      j.wander = (j.wander + rand(-0.8, 0.8) * dt) * (1 - 0.3 * dt);
      const v = { x: Math.cos(j.heading + j.wander), y: Math.sin(j.heading + j.wander) };
      w.edges(v, j, 160);
      w.apart(v, j, j.radius * 3.2);
      const fear = w.cursor(v, j, 240, 420, 120);
      j.hurry = Math.max(fear, j.hurry - dt);
      w.turn(j, v, 0.6 + 2.4 * j.hurry, dt);

      // It only pushes while the bell is closing, then coasts.
      if (j.beat < 0.22) {
        const thrust = 190 * S.speed * (0.6 + 0.4 * j.depth) * (1 + 1.5 * j.hurry);
        j.vx += Math.cos(j.heading) * thrust * dt;
        j.vy += Math.sin(j.heading) * thrust * dt;
      }
      j.vx -= j.vx * 1.4 * dt; j.vy -= j.vy * 1.4 * dt;
      j.x += j.vx * dt; j.y += j.vy * dt;

      const gap = j.radius * 0.4 * S.arms;
      for (let k = 0; k < ARMS; k++) {
        const arm = j.arms[k];
        [arm[0], arm[1]] = anchor(j, k);
        for (let i = 1; i < JOINTS; i++) {
          const dx = arm[i * 2] - arm[i * 2 - 2], dy = arm[i * 2 + 1] - arm[i * 2 - 1], d = Math.hypot(dx, dy) || 1;
          arm[i * 2] = arm[i * 2 - 2] + dx / d * gap;
          arm[i * 2 + 1] = arm[i * 2 - 1] + dy / d * gap;
        }
      }
    }
  }

  function click(w, x, y) {
    w.ring(x, y, 0.8);
    for (const j of w.list) {
      const dx = j.x - x, dy = j.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > 420) continue;
      j.heading = Math.atan2(dy, dx);
      j.phase = Math.ceil(j.phase / TAU) * TAU; // start a fresh pulse right now
      j.hurry = 1;
    }
  }

  function draw(w) {
    const S = w.S;
    for (const j of w.list) {
      const fx = Math.cos(j.heading), fy = Math.sin(j.heading), r = j.radius;
      const bright = 0.35 + 0.65 * j.depth;
      const flash = (j.beat < 0.16 ? j.beat / 0.16 : Math.exp(-(j.beat - 0.16) * 4.5)) * S.glow;
      const core = w.colour(mix(w.accent, w.T.light, Math.min(1, 0.2 + 0.5 * flash)), bright);
      const rim = w.colour(w.accent, bright * (0.6 + 0.2 * Math.min(1, flash)));
      const halo = w.colour(w.accent, bright * 0.45);
      const armColour = w.colour(mix(w.accent, w.T.light, 0.35), bright * 0.8);

      if (S.arms > 0) {
        for (let k = 0; k < ARMS; k++) {
          const arm = j.arms[k];
          const frilly = k === 1 || k === 2; // the two middle arms are thick near the bell
          let px = arm[0], py = arm[1];
          for (let i = 1; i < JOINTS; i++) {
            const t = i / (JOINTS - 1);
            const sway = Math.sin(w.time * 1.6 + i * 0.7 + k * 1.9 + j.seed) * r * 0.16 * t;
            const x = arm[i * 2] - fy * sway, y = arm[i * 2 + 1] + fx * sway;
            if (frilly && t < 0.7) w.line(px, py, x, y, r * 0.16, r * 0.1, 0.5 * (1 - t * 0.8), armColour);
            else w.stroke(px, py, x, y, armColour);
            px = x; py = y;
          }
        }
      }

      // The bell: narrower and longer while it squeezes.
      const wide = 1 - 0.28 * j.squeeze, long = 1 + 0.22 * j.squeeze;
      w.stamp(j.x, j.y, r * 1.12 * wide, 0.22, halo);
      for (const side of [-1, 1]) {
        w.stamp(j.x - fx * r * 0.3 * long - fy * side * r * 0.55 * wide,
                j.y - fy * r * 0.3 * long + fx * side * r * 0.55 * wide, r * 0.55, 0.7, rim);
      }
      w.stamp(j.x + fx * r * 0.18 * long, j.y + fy * r * 0.18 * long, r * 0.82 * wide, 0.95, core);
    }
  }

  Ascii.start({
    name: 'jellyfish',
    backdrop: 'water',
    defaults: { count: 7, speed: 1, pulseRate: 1, glow: 1, arms: 1, cursor: 'ignore', accent: '#ff82d6', theme: 'dusk' },
    make, update, draw, click,
  });
})();
