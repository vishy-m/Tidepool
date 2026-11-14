(() => {
  'use strict';
  const { TAU, rand, clamp, lerp, noise } = Ascii;

  const SPINE = 16; // points along each koi, head to tail
  const pellets = [];

  function make(w) {
    const depth = rand(0.45, 1); // 1 is nearest the surface: bigger and brighter
    const f = {
      x: rand(0, w.W), y: rand(0, w.H),
      heading: rand(0, TAU), wander: 0,
      speed: 0, cruise: rand(36, 56),
      length: rand(200, 330) * (0.55 + 0.45 * depth),
      depth, phase: rand(0, TAU), seed: rand(0, 1000),
      variety: Math.floor(rand(0, 5)),
      nodes: new Float32Array(SPINE * 2),
    };
    const gap = f.length / (SPINE - 1);
    for (let i = 0; i < SPINE; i++) {
      f.nodes[i * 2] = f.x - Math.cos(f.heading) * gap * i;
      f.nodes[i * 2 + 1] = f.y - Math.sin(f.heading) * gap * i;
    }
    return f;
  }

  function click(w, x, y) {
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = 46 * Math.sqrt(Math.random());
      pellets.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: Math.cos(a) * rand(4, 16), vy: Math.sin(a) * rand(4, 16), born: w.time,
      });
    }
    if (pellets.length > 80) pellets.splice(0, pellets.length - 80);
    w.ring(x, y, 1);
  }

  function update(w, dt) {
    const S = w.S;
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      p.vx *= Math.exp(-dt); p.vy *= Math.exp(-dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (w.time - p.born > 30) pellets.splice(i, 1);
    }

    for (const f of w.list) {
      f.wander = (f.wander + rand(-1.1, 1.1) * dt) * (1 - 0.4 * dt);
      const v = { x: Math.cos(f.heading + f.wander), y: Math.sin(f.heading + f.wander) };
      let hurry = 0;
      w.edges(v, f);

      let food = null, foodDist = 460;
      for (const p of pellets) {
        const d = Math.hypot(p.x - f.x, p.y - f.y);
        if (d < foodDist) { food = p; foodDist = d; }
      }
      if (food && foodDist < 16) {
        pellets.splice(pellets.indexOf(food), 1);
        w.ring(f.x, f.y, 0.3);
      } else if (food) {
        v.x += (food.x - f.x) / foodDist * 3;
        v.y += (food.y - f.y) / foodDist * 3;
        hurry = 0.35 + 0.65 * (1 - foodDist / 460);
      } else {
        hurry = w.cursor(v, f);
      }
      w.apart(v, f, 110);

      w.turn(f, v, 1.3 + 2.8 * hurry, dt);
      const target = f.cruise * S.speed * (1 + 1.8 * hurry) * (0.85 + 0.15 * Math.sin(w.time * 0.5 + f.seed));
      f.speed += (target - f.speed) * Math.min(1, dt * 2);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.y += Math.sin(f.heading) * f.speed * dt;
      f.phase += dt * (1.6 + f.speed * 0.06);

      // The body trails the head: each point is pulled to a fixed distance from the one ahead.
      const n = f.nodes, gap = f.length / (SPINE - 1);
      n[0] = f.x; n[1] = f.y;
      for (let i = 1; i < SPINE; i++) {
        const dx = n[i * 2] - n[i * 2 - 2], dy = n[i * 2 + 1] - n[i * 2 - 1], d = Math.hypot(dx, dy) || 1;
        n[i * 2] = n[i * 2 - 2] + dx / d * gap;
        n[i * 2 + 1] = n[i * 2 - 1] + dy / d * gap;
      }
    }
  }

  function bodyWidth(t) {
    if (t < 0.12) return lerp(0.55, 1, t / 0.12);
    if (t < 0.4) return 1;
    if (t < 0.82) return lerp(1, 0.2, (t - 0.4) / 0.42);
    return lerp(0.3, 0.8, (t - 0.82) / 0.18); // tail fin flares back out
  }

  function patchColour(w, f, t) {
    const T = w.T, n = noise(f.seed + t * 5);
    switch (f.variety) {
      case 0: return n > 0.5 ? w.accent : T.light;                       // white with coloured patches
      case 1: return w.accent;                                           // solid colour
      case 2: return n > 0.62 ? w.accent : n < 0.36 ? T.light : T.dark;  // dark, three colours
      case 3: return n > 0.58 ? T.dark : T.light;                        // white with dark patches
      default: return t > 0.04 && t < 0.2 ? w.accent : T.light;          // white with one spot on the head
    }
  }

  function drawFish(w, f) {
    const n = f.nodes;
    const half = f.length * 0.13;
    const bright = 0.35 + 0.65 * f.depth;
    const sway = f.length * 0.06 * (0.5 + Math.min(1.2, f.speed / 60));
    const finColour = w.colour(w.T.light, bright * 0.75);

    for (let i = SPINE - 1; i >= 0; i--) {
      const t = i / (SPINE - 1);
      const a = Math.min(i + 1, SPINE - 1), b = Math.max(i - 1, 0);
      let nx = n[b * 2 + 1] - n[a * 2 + 1], ny = n[a * 2] - n[b * 2];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;

      const wave = Math.sin(f.phase - t * 5.5) * sway * Math.pow(t, 1.3);
      const x = n[i * 2] + nx * wave, y = n[i * 2 + 1] + ny * wave;
      const tail = t > 0.82;
      const colour = tail ? finColour : w.colour(patchColour(w, f, t), bright);
      w.stamp(x, y, half * bodyWidth(t), tail ? 0.42 : 0.95, colour);

      if (i === 4) { // side fins, just behind the head
        const flap = 1.2 + 0.2 * Math.sin(f.phase * 0.7);
        w.stamp(x + nx * half * flap, y + ny * half * flap, half * 0.55, 0.36, finColour);
        w.stamp(x - nx * half * flap, y - ny * half * flap, half * 0.55, 0.36, finColour);
      }
    }
  }

  function draw(w) {
    for (const f of w.list) drawFish(w, f);
    for (const p of pellets) {
      const fade = clamp((30 - (w.time - p.born)) / 4, 0, 1);
      w.glyph(p.x, p.y, 'o', w.colour(w.T.food, fade));
    }
  }

  Ascii.start({
    name: 'koi',
    backdrop: 'water',
    defaults: { count: 10, speed: 1, cursor: 'ignore', accent: '#ff6a2b', theme: 'night' },
    make, update, draw, click,
  });
})();
