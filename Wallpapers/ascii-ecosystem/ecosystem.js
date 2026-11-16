// One long strip of world that the view drifts along: open sea, a rocky reef, a koi pond, a reed
// bed, lily-pad shallows, a beach, dunes, a meadow, a thicket and a lake. Each animal comes from
// its own wallpaper's script and lives in a stretch of the strip. Rocks, logs, bushes, lily pads
// and flowers are scattered along it, and the animals steer round them or settle on them.
(() => {
  'use strict';
  const { TAU, rand, clamp, lerp, hash, mix, pack, parseHex, THEMES, BACKDROPS } = Ascii;
  const species = Ascii.collect;
  Ascii.collect = null;

  const MEADOW = { bg: [9, 21, 13], dim: [82, 148, 90], light: [232, 238, 214], dark: [50, 84, 56], food: [230, 200, 120] };
  const LAKE = { bg: [6, 18, 27], dim: [70, 128, 168], light: [228, 236, 240], dark: [50, 74, 96], food: [220, 190, 120] };
  const GRASS = {
    glyphs: ['.', ',', '"'],
    level(col, row) {
      const h = hash(col * 9.17 + row * 53.3);
      return h > 0.99 ? 0.8 : h > 0.965 ? 0.5 : h > 0.935 ? 0.2 : 0;
    },
  };

  // Positions along the strip are in screen widths. A zone fades into the one before it over
  // `blend` either side of where it starts; a `hard` start is a waterline instead.
  const ZONES = [
    { from: 0.0, theme: THEMES.dusk, backdrop: BACKDROPS.water, water: true },                // open sea
    { from: 1.45, blend: 0.28, theme: THEMES.night, backdrop: BACKDROPS.water, water: true }, // koi pond
    { from: 3.0, blend: 0.22, theme: THEMES.deep, backdrop: BACKDROPS.water, water: true },   // shallows
    { from: 4.2, hard: true, theme: THEMES.sand, backdrop: BACKDROPS.sand },                  // beach
    { from: 5.35, blend: 0.28, theme: MEADOW, backdrop: GRASS },                              // meadow
    { from: 7.1, hard: true, theme: LAKE, backdrop: BACKDROPS.water, water: true },           // lake
  ];
  const END = 8.4;
  const SHORES = ZONES.map((z, k) => ({ k, u: z.from, phase: k * 1.7 })).filter((s) => ZONES[s.k].hard);
  const FADE = 120; // creatures thin out this close (px) to the end of their stretch

  // `per` is how many live in each screen width; `pad` trims the stretch in pixels.
  // `set` overrides the creature's own settings: here mostly to make it sit still for longer.
  const RESIDENTS = [
    { name: 'jellyfish', from: 0, to: 1.6, per: 3.2, theme: THEMES.dusk, set: { speed: 0.7, pulseRate: 0.75 } },
    { name: 'koi', from: 1.35, to: 4.2, pad: [0, -120], per: 3, theme: THEMES.night, set: { speed: 0.7 } },
    { name: 'frogs', from: 3.05, to: 4.7, per: 3.2, theme: THEMES.deep, set: { hop: 0.12 } },
    { name: 'dragonflies', from: 3.1, to: 4.9, per: 1.6, theme: THEMES.deep, set: { hover: 4 } },
    { name: 'crabs', from: 4.2, to: 5.3, pad: [130, 0], per: 4, theme: THEMES.sand, set: { rest: 8 } },
    { name: 'butterflies', from: 5.35, to: 7.05, per: 4.5, theme: MEADOW },
    { name: 'frogs', from: 7.05, to: END, per: 2.2, theme: THEMES.deep, set: { hop: 0.12 } },
    { name: 'dragonflies', from: 7.15, to: END, per: 1.4, theme: THEMES.deep, set: { hover: 4 } },
    { name: 'cranes', from: 6.9, to: END, per: 3.6, theme: THEMES.night },
  ];

  const shades = ZONES.map((z) => [0.3, 0.5, 0.75, 1].map((a) => pack(mix(z.theme.bg, z.theme.dim, a))));
  const subs = [];
  const tongues = [];
  let cam = -1, direction = 1, U = 1, time = 0;

  // ---------------------------------------------------------------------------------------------
  // Scenery. Placed once from a fixed seed, so the world is the same every time. `u` is screen
  // widths along the strip and `v` the fraction of the way down; x and y are filled in by layout.

  const props = [];
  const specks = []; // single characters: small flowers and shells
  let seed = 20261114;
  function rnd(a = 0, b = 1) {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return a + ((t ^ (t >>> 14)) >>> 0) / 4294967296 * (b - a);
  }
  const SPACED = { rock: 1, log: 1, bush: 1, pad: 1, flower: 1 };
  function place(kind, count, u0, u1, make) {
    for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
      const p = Object.assign({ kind, u: rnd(u0, u1), v: rnd(0.05, 0.95), r: 20, seed: rnd(0, 100), x: 0, y: 0, guest: null }, make());
      const clear = !SPACED[kind] || props.every((o) => !SPACED[o.kind]
        || Math.hypot((o.u - p.u) * 1700, (o.v - p.v) * 1000) > o.r + p.r + 24);
      if (clear) { props.push(p); placed++; }
    }
  }
  const rock = (a, b) => () => ({ r: rnd(a, b) });
  const log = () => ({ r: rnd(15, 21), length: rnd(150, 260), angle: rnd(-0.5, 0.5) + (rnd() < 0.3 ? 1.2 : 0) });
  const bush = () => ({ r: rnd(34, 52) });
  const pad = () => ({ r: rnd(48, 74) });
  const stems = () => ({ r: 30, count: Math.floor(rnd(5, 10)) });
  const kelp = () => ({ r: 20, height: rnd(110, 220) });
  const PETALS = ['#ff8fb4', '#ffd166', '#c9a7ff', '#ffffff', '#ff7a59'].map(parseHex);
  const flower = () => ({ r: 14, rgb: PETALS[Math.floor(rnd(0, PETALS.length))], visited: -100 });

  place('rock', 2, 0.15, 1.0, rock(30, 60));        // open sea
  place('kelp', 4, 0.1, 1.1, kelp);
  place('rock', 6, 1.1, 1.8, rock(28, 64));        // reef, between sea and pond
  place('kelp', 12, 1.05, 1.85, kelp);
  place('rock', 2, 1.9, 2.7, rock(26, 48));         // koi pond
  place('log', 2, 2.75, 3.25, log);                 // reed bed, between pond and shallows
  place('pad', 3, 2.6, 3.2, pad);
  place('reeds', 7, 2.7, 3.3, stems);
  place('pad', 10, 3.2, 4.08, pad);                 // lily-pad shallows
  place('rock', 2, 3.3, 4.0, rock(26, 44));
  place('reeds', 5, 3.85, 4.14, stems);
  place('rock', 4, 4.12, 4.32, rock(26, 58));       // the waterline
  place('rock', 3, 4.35, 5.0, rock(28, 56));        // beach
  place('log', 2, 4.4, 4.95, log);
  place('tuft', 8, 4.75, 5.1, () => ({}));
  place('bush', 3, 5.05, 5.6, bush);                // dunes, between beach and meadow
  place('rock', 3, 5.0, 5.6, rock(26, 54));
  place('tuft', 24, 5.0, 5.7, () => ({}));
  place('flower', 4, 5.42, 5.6, flower);
  place('flower', 22, 5.6, 6.75, flower);           // meadow
  place('bush', 3, 5.7, 6.6, bush);
  place('rock', 2, 5.8, 6.6, rock(26, 44));
  place('bush', 5, 6.65, 7.04, bush);              // thicket, between meadow and lake
  place('log', 2, 6.65, 7.0, log);
  place('rock', 2, 6.7, 7.02, rock(26, 50));
  place('flower', 3, 6.7, 7.0, flower);
  place('reeds', 4, 6.98, 7.08, stems);
  place('reeds', 6, 7.1, 7.32, stems);             // lake
  place('log', 4, 7.25, 8.3, log);
  place('rock', 3, 7.2, 8.3, rock(28, 58));
  place('pad', 6, 7.2, 8.3, pad);
  for (let i = 0; i < 70; i++) {
    specks.push({ u: rnd(5.5, 6.9), v: rnd(0.02, 0.98), char: rnd() < 0.7 ? '*' : 'o', rgb: mix(MEADOW.bg, PETALS[i % PETALS.length], 0.7) });
  }
  for (let i = 0; i < 34; i++) {
    specks.push({ u: rnd(4.3, 5.2), v: rnd(0.02, 0.98), char: 'oc@e'[i % 4], rgb: mix(THEMES.sand.bg, THEMES.sand.light, 0.5) });
  }
  const only = (kind) => props.filter((p) => p.kind === kind);
  const rocks = only('rock'), logs = only('log'), bushes = only('bush'), flowers = only('flower');

  // The nearest point of a prop's footprint to (x, y): its centre, or along the middle of a log.
  const nearest = { x: 0, y: 0 };
  function closest(p, x, y) {
    if (p.kind !== 'log') { nearest.x = p.x; nearest.y = p.y; return; }
    const ax = Math.cos(p.angle), ay = Math.sin(p.angle);
    const along = clamp((x - p.x) * ax + (y - p.y) * ay, -p.length / 2, p.length / 2);
    nearest.x = p.x + ax * along; nearest.y = p.y + ay * along;
  }
  function randomSpotOn(p) {
    const along = p.kind === 'log' ? rand(-0.4, 0.4) * p.length : 0;
    const off = p.kind === 'log' ? 0 : rand(-0.2, 0.2) * p.r;
    return [p.x + Math.cos(p.angle || 0) * along + off, p.y + Math.sin(p.angle || 0) * along + off];
  }

  // ---------------------------------------------------------------------------------------------
  // Ground: which zone a point is in, the background colour and the scattered backdrop characters.

  function shoreX(s, y) {
    return s.u * U + 46 * Math.sin(y * 0.011 + s.phase) + 22 * Math.sin(y * 0.031 + 2 * s.phase)
      + 12 * Math.sin(time * 0.45 + y * 0.004 + s.phase);
  }
  function shoreNear(wx) {
    for (const s of SHORES) if (Math.abs(wx - s.u * U) < 110) return s;
    return null;
  }

  // Sets at.a / at.b / at.t: the zone, the one it is blending into and how far. Beside a
  // waterline it also sets at.shore and at.past, the distance to the right of the line.
  const at = { a: 0, b: 0, t: 0, shore: null, past: 0 };
  function zoneAt(wx, y) {
    at.t = 0;
    at.shore = shoreNear(wx);
    if (at.shore) {
      at.past = wx - shoreX(at.shore, y);
      at.a = at.b = at.past < 0 ? at.shore.k - 1 : at.shore.k;
      return;
    }
    const u = wx / U;
    let k = 0;
    while (k + 1 < ZONES.length && ZONES[k + 1].from <= u) k++;
    at.a = at.b = k;
    const next = ZONES[k + 1], here = ZONES[k];
    if (next && next.blend && next.from - u < next.blend) {
      at.b = k + 1; at.t = 0.5 - (next.from - u) / (2 * next.blend);
    } else if (here.blend && u - here.from < here.blend) {
      at.a = k - 1; at.t = 0.5 + (u - here.from) / (2 * here.blend);
    }
  }
  function isWater(wx, y) { zoneAt(wx, y); return !!ZONES[at.a].water; }

  const ground = {
    glyph: '.', colour: 0,
    column(world, x) {
      const wx = x + cam;
      if (shoreNear(wx)) return -1;
      zoneAt(wx, 0);
      return pack(mix(ZONES[at.a].theme.bg, ZONES[at.b].theme.bg, at.t));
    },
    cell(world, x, y) {
      zoneAt(x + cam, y);
      const left = ZONES[at.shore.k - 1], right = ZONES[at.shore.k];
      const wet = left.water ? left : right, dry = left.water ? right : left;
      const inland = left.water ? at.past : -at.past;
      if (inland < 0) return pack(wet.theme.bg);
      // The ground is darker where the water has just been.
      return pack(mix(wet.theme.bg, dry.theme.bg, clamp(0.5 + Math.floor(inland / 18) * 0.125, 0, 1)));
    },
    backdrop(world, col, row, x, y, ripple) {
      const wx = x + cam, wcol = Math.round(wx / world.cw - 0.5);
      zoneAt(wx, y);
      if (at.shore && ZONES[at.a].water && Math.abs(at.past) < world.cw * 1.6) { // foam along the waterline
        const T = ZONES[at.a].theme;
        this.glyph = '~';
        this.colour = pack(mix(T.bg, T.light, Math.abs(at.past) < world.cw * 0.8 ? 0.6 : 0.3));
        return true;
      }
      const k = at.t > 0 && hash(wcol * 7.13 + row * 3.71) < at.t ? at.b : at.a;
      let level = ripple;
      if (world.S.shimmer) level = Math.max(level, ZONES[k].backdrop.level(wcol, row, world.time));
      if (level <= 0.04) return false;
      this.glyph = ZONES[k].backdrop.glyphs[level > 0.66 ? 2 : level > 0.33 ? 1 : 0];
      this.colour = shades[k][Math.min(3, Math.floor(level * 4))];
      return true;
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Residents. Each creature script sees its own stretch of the strip, in its own coordinates.

  function resident(world, r) {
    const spec = species[r.name];
    const sub = Object.create(world);
    Object.assign(sub, { spec, r, list: [], left: 0, ox: 0, W: 1, H: 1, T: r.theme, visible: false, solids: [], goals: [] });
    sub.S = Object.assign({}, world.S, spec.defaults, r.set);
    sub.accent = parseHex(sub.S.accent);
    Object.defineProperty(sub, 'pointer', {
      get() { const p = world.pointer; return { x: p.x - sub.ox, y: p.y, inside: p.inside }; },
    });
    const fade = (x) => {
      let f = 1;
      if (r.from > 0) f = Math.min(f, x / FADE);
      if (r.to < END) f = Math.min(f, (sub.W - x) / FADE);
      return clamp(f, 0, 1);
    };
    sub.stamp = (x, y, radius, strength, colour) => {
      const s = strength * fade(x);
      if (s > 0.05) world.stamp(x + sub.ox, y, radius, s, colour);
    };
    sub.stroke = (x1, y1, x2, y2, colour) => { if (fade(x1) > 0.5) world.stroke(x1 + sub.ox, y1, x2 + sub.ox, y2, colour); };
    sub.glyph = (x, y, char, colour, onTop) => { if (fade(x) > 0.5) world.glyph(x + sub.ox, y, char, colour, onTop); };
    sub.ring = (x, y, strength) => { if (isWater(x + sub.left, y)) world.ring(x + sub.ox, y, strength); };

    // Every creature that steers asks `edges` to keep it on screen; here that also steers it
    // round whatever is solid to it and toward anything it has decided to visit.
    const edges = world.edges;
    sub.edges = (v, c, margin, gain) => {
      edges.call(sub, v, c, margin, gain);
      const wx = c.x + sub.left;
      for (const p of sub.solids) {
        closest(p, wx, c.y);
        const dx = wx - nearest.x, dy = c.y - nearest.y, d = Math.hypot(dx, dy) || 1, reach = p.r + 80;
        if (d < reach) {
          const push = (1 - (d - p.r) / 80) * 3.2;
          v.x += dx / d * push; v.y += dy / d * push;
          // ...and along its edge, whichever way the creature is already heading. Pushing straight
          // out alone cancels a pull toward something on the far side (food beyond a log), and the
          // creature would press against it; this way it slides round.
          let tx = -dy / d, ty = dx / d;
          if (tx * Math.cos(c.heading) + ty * Math.sin(c.heading) < 0) { tx = -tx; ty = -ty; }
          v.x += tx * push * 0.8; v.y += ty * push * 0.8;
        }
      }
      if (c.goal) {
        const dx = c.goal.x - wx, dy = c.goal.y - c.y, d = Math.hypot(dx, dy) || 1;
        v.x += dx / d * 3; v.y += dy / d * 3;
      }
    };
    if (r.name === 'frogs') sub.perch = (x, y, frog) => perch(sub, x, y, frog);
    if (r.name === 'koi') sub.reachable = (x, y) => !onSolid(sub, x + sub.left, y);
    return sub;
  }

  // Food that lands well inside a rock or log is out of reach: a koi's head can only get to the edge.
  function onSolid(sub, wx, y) {
    for (const p of sub.solids) {
      closest(p, wx, y);
      if (Math.hypot(wx - nearest.x, y - nearest.y) < p.r - 10) return true;
    }
    return false;
  }

  // Nothing walks or swims through a solid: anything that ends up inside one is moved to its edge.
  function keepOut(sub) {
    for (const c of sub.list) {
      const wx = c.x + sub.left;
      for (const p of sub.solids) {
        closest(p, wx, c.y);
        const dx = wx - nearest.x, dy = c.y - nearest.y, d = Math.hypot(dx, dy) || 1;
        if (d < p.r) { c.x += dx / d * (p.r - d); c.y += dy / d * (p.r - d); }
      }
    }
  }

  // Frogs. One heading for water lands on the nearest free lily pad, rock or log instead; one
  // heading for land sometimes picks a rock or log to sit on.
  function perch(sub, x, y, frog) {
    const wx = x + sub.left, wet = isWater(wx, y);
    if (!wet && Math.random() > 0.3) return [x, y];
    let best = null, bestDistance = wet ? Infinity : 260;
    for (const p of sub.goals) {
      closest(p, wx, y);
      const d = Math.hypot(nearest.x - wx, nearest.y - y);
      if (d >= bestDistance || isWater(p.x, p.y) !== wet) continue;
      const room = Math.max(p.r, 34);
      const taken = sub.list.some((o) => o !== frog
        && Math.hypot((o.leaping ? o.toX : o.x) + sub.left - nearest.x, (o.leaping ? o.toY : o.y) - nearest.y) < room);
      if (!taken) { best = p; bestDistance = d; }
    }
    if (!best) return wet ? [frog.x, frog.y] : [x, y];
    const [px, py] = randomSpotOn(best);
    return [px - sub.left, py];
  }

  // A sitting frog now and then flicks its tongue out at a dragonfly hovering close by.
  function hunt(sub, world) {
    for (const f of sub.list) {
      if (f.hungryAt === undefined) f.hungryAt = time + rand(8, 50);
      if (f.leaping || time < f.hungryAt) continue;
      f.hungryAt = time + 1.5; // look again shortly if nothing is in reach
      for (const other of subs) {
        if (other.r.name !== 'dragonflies' || !other.visible) continue;
        const prey = other.list.find((d) => !d.caught && d.speed < 90
          && Math.hypot(d.x + other.left - f.x - sub.left, d.y - f.y) < 230);
        if (!prey) continue;
        prey.caught = true;
        f.hungryAt = time + rand(40, 90);
        f.until = Math.max(f.until, time + 1.2);
        f.heading = Math.atan2(prey.y - f.y, prey.x + other.left - f.x - sub.left);
        tongues.push({ frog: f, home: sub, prey, from: other, born: time });
        break;
      }
    }
  }
  function updateTongues(world) {
    for (let i = tongues.length - 1; i >= 0; i--) {
      const t = tongues[i], age = time - t.born, prey = t.prey;
      const fx = t.frog.x + t.home.left, fy = t.frog.y;
      if (age < 0.12) { // out
        const k = age / 0.12;
        t.tipX = lerp(fx, prey.x + t.from.left, k); t.tipY = lerp(fy, prey.y, k);
      } else if (age < 0.34 && !t.frog.leaping) { // and back, with the dragonfly stuck to it
        if (!t.hit) { t.hit = true; t.hitX = prey.x + t.from.left; t.hitY = prey.y; }
        const k = (age - 0.12) / 0.22;
        t.tipX = lerp(t.hitX, fx, k); t.tipY = lerp(t.hitY, fy, k);
        prey.x = t.tipX - t.from.left; prey.y = t.tipY;
        prey.darting = false; prey.speed = 0; prey.until = time + 1;
      } else {
        // Eaten. Another one turns up later, somewhere out of sight.
        if (t.hit) {
          for (let tries = 0; tries < 30; tries++) {
            prey.x = rand(60, t.from.W - 60); prey.y = rand(60, t.from.H - 60);
            const sx = prey.x + t.from.ox;
            if (sx < -150 || sx > world.W + 150) break;
          }
          prey.until = time + rand(1, 4);
          if (isWater(fx, fy)) world.ring(fx - cam, fy, 0.3);
        }
        prey.caught = false;
        tongues.splice(i, 1);
      }
    }
  }

  // Butterflies. Each now and then picks a free flower nearby, flies to it and sits a while.
  function visitFlowers(sub) {
    for (const b of sub.list) {
      const startled = time < b.startledUntil;
      if (b.nextVisit === undefined) b.nextVisit = time + rand(2, 18);
      if (b.sitting) {
        if (time < b.leaveAt && !startled) continue;
        b.sitting.flower.guest = null;
        b.sitting = null;
        b.nextVisit = time + rand(5, 16);
      } else if (b.goal) {
        const d = Math.hypot(b.goal.x - b.x - sub.left, b.goal.y - b.y);
        if (startled || time > b.giveUpAt) {
          b.goal.guest = null; b.goal = null; b.nextVisit = time + rand(4, 12);
        } else if (d < 34) {
          b.sitting = { x: b.goal.x - sub.left, y: b.goal.y, flower: b.goal };
          b.goal.visited = time; // pollinated: it blooms wider for a while
          b.goal = null;
          b.leaveAt = time + rand(15, 45);
        }
      } else if (time > b.nextVisit && !startled) {
        let best = null, bestDistance = 460;
        for (const f of flowers) {
          const d = Math.hypot(f.x - b.x - sub.left, f.y - b.y);
          if (d < bestDistance && !f.guest) { best = f; bestDistance = d; }
        }
        if (best) { b.goal = best; best.guest = b; b.giveUpAt = time + 14; } else b.nextVisit = time + 6;
      }
    }
  }

  // Crabs. Each now and then picks a free rock nearby, climbs onto it and rests there.
  function climbRocks(sub) {
    for (const c of sub.list) {
      const wx = c.x + sub.left, fleeing = time < c.fleeUntil;
      if (c.baseSize === undefined) { c.baseSize = c.size; c.nextClimb = time + rand(3, 25); }
      if (c.goal) {
        const d = Math.hypot(c.goal.x - wx, c.goal.y - c.y);
        if (fleeing || time > c.giveUpAt) {
          c.goal.guest = null; c.goal = null; c.nextClimb = time + rand(10, 30);
        } else if (d < c.goal.r * 0.4) { // on top: stay put for a bit
          c.onRock = c.goal; c.goal = null;
          c.running = false; c.until = time + rand(20, 60);
        } else {
          c.running = true; c.until = Math.max(c.until, time + 0.5);
        }
      } else if (c.onRock) {
        if (c.running || fleeing) { c.onRock.guest = null; c.onRock = null; c.nextClimb = time + rand(15, 40); }
      } else if (time > c.nextClimb && !fleeing) {
        let best = null, bestDistance = 520;
        for (const p of sub.goals) {
          const d = Math.hypot(p.x - wx, p.y - c.y);
          if (d < bestDistance && !p.guest) { best = p; bestDistance = d; }
        }
        if (best) { c.goal = best; best.guest = c; c.giveUpAt = time + 18; } else c.nextClimb = time + 8;
      }
      // Up on a rock it is nearer the viewer, so it draws a little bigger.
      let lift = 0;
      for (const p of sub.goals) lift = Math.max(lift, 1 - Math.hypot(p.x - wx, p.y - c.y) / p.r);
      c.size = c.baseSize * (1 + 0.2 * clamp(lift * 1.6, 0, 1));
    }
  }

  // Cranes. One passing close to a free log or rock sometimes comes down and stands on it.
  function restOnLogs(sub) {
    for (const c of sub.list) {
      const scared = time < c.scaredUntil;
      if (c.nextRest === undefined) c.nextRest = time + rand(2, 30);
      if (c.resting) {
        if (time < c.leaveAt && !scared) continue;
        c.resting.on.guest = null;
        c.resting = null;
        c.nextRest = time + rand(25, 60);
      } else if (time > c.nextRest && !scared) {
        c.nextRest = time + 2;
        const wx = c.x + sub.left;
        const spot = sub.goals.find((p) => !p.guest && Math.hypot(p.x - wx, p.y - c.y) < 360);
        if (!spot) continue;
        const [px, py] = randomSpotOn(spot);
        spot.guest = c;
        c.resting = { x: px - sub.left, y: py, on: spot };
        c.leaveAt = time + rand(30, 90);
      }
    }
  }

  const HABITS = { frogs: hunt, butterflies: visitFlowers, crabs: climbRocks, cranes: restOnLogs };

  // ---------------------------------------------------------------------------------------------

  function layout(world) {
    U = world.W;
    if (cam < 0) cam = (world.S.at === undefined ? 1.6 : world.S.at) * U; // start over the koi pond
    cam = clamp(cam, 0, (END - 1) * U);
    for (const p of props) { p.x = p.u * U; p.y = p.v * world.H; }
    if (!subs.length) RESIDENTS.forEach((r) => subs.push(resident(world, r)));
    for (const sub of subs) {
      const trim = sub.r.pad || [0, 0], S = world.S, name = sub.r.name;
      sub.left = sub.r.from * U + trim[0];
      sub.W = sub.r.to * U + trim[1] - sub.left;
      sub.H = world.H;
      Object.assign(sub.S, { cell: S.cell, fps: S.fps, shimmer: S.shimmer, ripples: S.ripples });

      const here = (p) => p.x > sub.left - 100 && p.x < sub.left + sub.W + 100;
      const inside = (p) => p.x > sub.left + 60 && p.x < sub.left + sub.W - 60;
      sub.solids = name === 'koi' || name === 'jellyfish' ? [...rocks, ...logs].filter(here)
        : name === 'crabs' ? [...logs, ...bushes].filter(here) : [];
      sub.goals = name === 'frogs' ? props.filter((p) => (p.kind === 'pad' || p.kind === 'rock' || p.kind === 'log') && inside(p))
        : name === 'crabs' ? rocks.filter((p) => inside(p) && !isWater(p.x - 70, p.y))
        : name === 'cranes' ? [...logs, ...rocks].filter((p) => inside(p) && p.u > 6.6) : [];

      const want = Math.round(clamp(sub.r.per * (sub.W / U) * S.density, 0, 80));
      while (sub.list.length < want) {
        const c = sub.spec.make(sub);
        if (sub.perch) [c.x, c.y] = sub.perch(c.x, c.y, c);
        sub.list.push(c);
      }
      for (const gone of sub.list.splice(want)) { // let go of anything a removed creature held
        for (const held of [gone.goal, gone.onRock, gone.sitting && gone.sitting.flower, gone.resting && gone.resting.on]) {
          if (held) held.guest = null;
        }
      }
      sub.list.sort((a, b) => (a.depth || 0) - (b.depth || 0));
    }
  }

  function update(world, dt) {
    time = world.time;
    // Drift along the strip, easing off toward either end before turning back.
    const span = (END - 1) * U;
    const ease = clamp(Math.min(cam, span - cam) / 160 + 0.06, 0, 1);
    cam += direction * world.S.pan * ease * dt;
    if (cam >= span) { cam = span; direction = -1; } else if (cam <= 0) { cam = 0; direction = 1; }
    world.shift = cam % world.cw; // the character grid rides along with the scenery

    for (const sub of subs) {
      sub.ox = sub.left - cam;
      sub.visible = sub.ox < world.W + 320 && sub.ox + sub.W > -320;
      if (!sub.visible) continue;
      sub.spec.update(sub, dt);
      if (sub.solids.length) keepOut(sub);
      if (HABITS[sub.r.name]) HABITS[sub.r.name](sub, world);
    }
    updateTongues(world);
  }

  // Scenery colours: a colour laid over the background of the zone it sits in.
  const tone = (theme, rgb, amount) => pack(mix(theme.bg, rgb, amount));
  const INK = {
    stone: tone(THEMES.night, [128, 132, 140], 0.62), stoneTop: tone(THEMES.night, [178, 182, 188], 0.8),
    bark: tone(THEMES.sand, [150, 104, 62], 0.75), barkTop: tone(THEMES.sand, [196, 150, 100], 0.85),
    leaf: tone(THEMES.deep, [86, 168, 104], 0.55), leafTop: tone(THEMES.deep, [120, 200, 130], 0.7),
    bush: tone(MEADOW, [60, 132, 72], 0.7), bushTop: tone(MEADOW, [104, 178, 96], 0.85), berry: pack([226, 84, 92]),
    reed: tone(THEMES.deep, [128, 176, 96], 0.7), reedTop: tone(THEMES.sand, [178, 124, 72], 0.9),
    kelp: tone(THEMES.dusk, [70, 150, 120], 0.5), tuft: tone(THEMES.sand, [150, 176, 110], 0.6),
    heart: pack([250, 214, 96]), tongue: pack([244, 130, 150]),
  };

  function drawProp(world, p, x) {
    const y = p.y, t = world.time;
    switch (p.kind) {
      case 'rock':
        world.stamp(x, y, p.r, 0.62, INK.stone);
        world.stamp(x - p.r * 0.2, y - p.r * 0.22, p.r * 0.55, 0.74, INK.stoneTop);
        break;
      case 'log': {
        const dx = Math.cos(p.angle) * p.length / 2, dy = Math.sin(p.angle) * p.length / 2;
        world.line(x - dx, y - dy, x + dx, y + dy, p.r, p.r, 0.6, INK.bark);
        world.line(x - dx * 0.8, y - dy * 0.8, x + dx * 0.8, y + dy * 0.8, p.r * 0.4, p.r * 0.4, 0.7, INK.barkTop);
        world.glyph(x - dx, y - dy, 'O', INK.barkTop, true);
        world.glyph(x + dx, y + dy, 'O', INK.barkTop, true);
        break;
      }
      case 'bush':
        for (let k = 0; k < 5; k++) {
          const a = p.seed + k * 1.9, far = k ? p.r * 0.5 : 0;
          world.stamp(x + Math.cos(a) * far, y + Math.sin(a) * far, p.r * (k ? 0.56 : 0.66), k % 2 ? 0.5 : 0.64, k % 2 ? INK.bush : INK.bushTop);
        }
        for (let k = 0; k < 3; k++) {
          world.glyph(x + Math.cos(p.seed * 3 + k * 2.3) * p.r * 0.55, y + Math.sin(p.seed * 3 + k * 2.3) * p.r * 0.55, 'o', INK.berry, true);
        }
        break;
      case 'pad': {
        const px = x + Math.sin(t * 0.3 + p.seed) * 4, py = y + Math.cos(t * 0.24 + p.seed) * 3;
        world.stamp(px, py, p.r, 0.38, INK.leaf);
        world.stamp(px, py, p.r * 0.5, 0.52, INK.leafTop);
        break;
      }
      case 'reeds':
        for (let k = 0; k < p.count; k++) {
          const sx = x + Math.sin(p.seed + k * 2.4) * 26, sy = y + Math.cos(p.seed * 1.7 + k * 1.3) * 22;
          const tall = 30 + 26 * hash(p.seed + k), sway = Math.sin(t * 0.8 + p.seed + k) * 3;
          world.stroke(sx, sy, sx + sway, sy - tall, INK.reed);
          world.glyph(sx + sway, sy - tall - world.S.cell, k % 3 ? '|' : 'o', k % 3 ? INK.reed : INK.reedTop);
        }
        break;
      case 'kelp': {
        let px = x, py = y;
        for (let k = 1; k <= 8; k++) {
          const nx = x + Math.sin(t * 0.7 + k * 0.7 + p.seed) * k * 1.8, ny = y - p.height * k / 8;
          world.stroke(px, py, nx, ny, INK.kelp);
          px = nx; py = ny;
        }
        break;
      }
      case 'tuft':
        world.stroke(x, y, x - 7, y - 15, INK.tuft);
        world.stroke(x, y, x + 1, y - 18, INK.tuft);
        world.stroke(x, y, x + 8, y - 14, INK.tuft);
        break;
      case 'flower': {
        const since = t - p.visited, cw = world.cw, ch = world.S.cell;
        const petal = pack(mix(MEADOW.bg, p.rgb, since < 45 ? 1 : 0.75));
        world.glyph(x, y, 'o', INK.heart, true);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.glyph(x + dx * cw, y + dy * ch, '*', petal);
        if (since < 45) { // lately pollinated: in full bloom
          for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]]) world.glyph(x + dx * cw, y + dy * ch, '*', petal);
        }
        if (since < 3) { // and a puff of pollen as it happens
          for (let k = 0; k < 5; k++) {
            const a = p.seed + k * TAU / 5 + since, far = 14 + since * 16;
            world.glyph(x + Math.cos(a) * far, y + Math.sin(a) * far, '.', INK.heart, true);
          }
        }
        break;
      }
    }
  }

  function draw(world) {
    for (const p of props) {
      const x = p.x - cam, reach = (p.length || 0) / 2 + (p.height || 0) + p.r + 40;
      if (x > -reach && x < world.W + reach) drawProp(world, p, x);
    }
    for (const s of specks) {
      const x = s.u * U - cam;
      if (x > 0 && x < world.W) world.glyph(x, s.v * world.H, s.char, pack(s.rgb));
    }
    for (const sub of subs) if (sub.visible) sub.spec.draw(sub);
    for (const t of tongues) {
      if (t.tipX !== undefined) world.stroke(t.frog.x + t.home.ox, t.frog.y, t.tipX - cam, t.tipY, INK.tongue);
    }
  }

  function click(world, x, y) {
    for (const sub of subs) {
      const local = x - sub.ox;
      if (sub.visible && sub.spec.click && local >= 0 && local <= sub.W) sub.spec.click(sub, local, y);
    }
  }

  Ascii.start({
    defaults: { pan: 18, density: 1, theme: 'night' },
    ground, update, draw, click,
    resized: layout,
    settings: layout,
  });
})();
