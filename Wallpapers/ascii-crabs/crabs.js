(() => {
  'use strict';
  const { TAU, rand, clamp, angleDiff, mix } = Ascii;

  function make(w) {
    return {
      x: rand(0, w.W), y: rand(0, w.H),
      facing: rand(0, TAU),            // where its eyes point; it walks at right angles to this
      side: Math.random() < 0.5 ? 1 : -1,
      size: rand(24, 34),              // half the shell's width
      depth: rand(0, 1), speed: 0, gait: rand(0, TAU),
      running: true, until: w.time + rand(0.3, 1.5),
      alarm: 0, fleeUntil: 0, fleeX: 0, fleeY: 0,
    };
  }

  function update(w, dt) {
    const S = w.S;
    for (const c of w.list) {
      if (w.time >= c.until) {
        c.running = !c.running || S.rest <= 0;
        c.until = w.time + (c.running ? rand(0.6, 2) : rand(0.4, 1.8) * S.rest);
        if (c.running && Math.random() < 0.35) c.side = -c.side;
      }

      const walk = c.facing + c.side * Math.PI / 2;
      const v = { x: Math.cos(walk), y: Math.sin(walk) };
      c.heading = walk; // the steering helpers think in terms of a heading
      w.edges(v, c, 110, 2.2);
      w.apart(v, c, c.size * 3.2);
      let fear = w.cursor(v, c, 250, 420, 110);
      if (w.time < c.fleeUntil) {
        v.x += c.fleeX * 6; v.y += c.fleeY * 6;
        fear = 1;
      }
      fear = Math.min(1, fear * S.scare);
      c.alarm += (fear - c.alarm) * Math.min(1, dt * 6);

      // Turn the body so that walking sideways carries it along the steering vector.
      const wantFacing = Math.atan2(v.y, v.x) - c.side * Math.PI / 2;
      const turn = (2.5 + 9 * fear) * dt;
      c.facing += clamp(angleDiff(c.facing, wantFacing), -turn, turn);

      const target = (c.running || fear > 0.05 ? 70 : 0) * S.speed * (1 + 3 * fear);
      c.speed += (target - c.speed) * Math.min(1, dt * 8);
      const go = c.facing + c.side * Math.PI / 2;
      c.x += Math.cos(go) * c.speed * dt;
      c.y += Math.sin(go) * c.speed * dt;
      c.gait += dt * c.speed * 0.16;
    }
  }

  function click(w, x, y) {
    for (const c of w.list) {
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > 400) continue;
      c.fleeX = dx / d; c.fleeY = dy / d;
      c.fleeUntil = w.time + rand(0.8, 1.5);
    }
  }

  function draw(w) {
    for (const c of w.list) {
      const s = c.size;
      const fx = Math.cos(c.facing), fy = Math.sin(c.facing); // toward the eyes
      const lx = -fy, ly = fx;                                // across the shell
      const at = (across, forward) => [c.x + lx * across * s + fx * forward * s, c.y + ly * across * s + fy * forward * s];
      const shell = w.colour(w.accent);
      const top = w.colour(mix(w.accent, w.T.light, 0.3));
      const limb = w.colour(mix(w.accent, w.T.bg, 0.3));
      const eye = w.colour(w.T.light);

      // Four legs a side, stepping in turn.
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const spread = (k - 1.5) * 0.36;
          const step = Math.sin(c.gait + k * 1.7 + (side > 0 ? 0 : Math.PI)) * 0.22;
          const hip = at(side * 0.85, spread - 0.1);
          const knee = at(side * 1.55, spread * 1.5 - 0.15);
          const foot = at(side * (1.85 + step), spread * 2 - 0.4);
          w.stroke(hip[0], hip[1], knee[0], knee[1], limb);
          w.stroke(knee[0], knee[1], foot[0], foot[1], limb);
        }
        // Claws lift and open when it is alarmed.
        const shoulder = at(side * 0.8, 0.35);
        const claw = at(side * (1.3 - 0.3 * c.alarm), 0.95 + 0.55 * c.alarm);
        w.line(shoulder[0], shoulder[1], claw[0], claw[1], s * 0.18, s * 0.18, 0.6, limb);
        w.stamp(claw[0], claw[1], s * (0.36 + 0.12 * c.alarm), 0.9, top);
      }

      for (const across of [-0.55, 0.55]) {
        const p = at(across, 0);
        w.stamp(p[0], p[1], s * 0.75, 0.9, shell);
      }
      w.stamp(c.x, c.y, s * 0.7, 1, top);
      for (const across of [-0.32, 0.32]) {
        const p = at(across, 0.62);
        w.glyph(p[0], p[1], 'o', eye, true);
      }
    }
  }

  Ascii.start({
    name: 'crabs',
    backdrop: 'sand',
    defaults: { count: 9, speed: 1, rest: 1, scare: 1, cursor: 'ignore', accent: '#ef5b3c', theme: 'sand' },
    make, update, draw, click,
  });
})();
