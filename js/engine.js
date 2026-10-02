/*
 * The Hunger Games Simulator - simulation engine.
 * Pure logic, no DOM. Game.create(tributes) -> state; Game.next(state) -> round | null
 *
 * Round kinds: intro, bloodbath, day, night, gm (feast / disaster / mutts), cannon, victory
 */
(function (global) {
  const EV = global.BPG_EVENTS;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Draw from an array without repeats until exhausted, then reshuffle.
  function deck(arr) {
    let bag = [];
    return () => {
      if (!bag.length) bag = shuffle(arr);
      return bag.pop();
    };
  }

  const aliveIds = (s) => s.tribs.filter((t) => t.alive).map((t) => t.id);

  const nameHtml = (t) => `<b class="nm">${esc(t.name)}</b><span class="dist">D${t.district}</span>`;

  function fill(s, tpl, ids, html, ally) {
    tpl = tpl.replace(/\{a\}/g, () => (ally ? (html ? `<b class="ally">${esc(ally)}</b>` : ally) : 'the alliance'));
    return tpl.replace(/\{(\d)\}/g, (m, i) => {
      const t = s.tribs[ids[i]];
      if (!t) return m;
      return html ? nameHtml(t) : t.name;
    });
  }

  /* ---- setup ------------------------------------------------------------ */
  function makeSchedule(target) {
    const schedule = {};
    const feastDay = ri(4, Math.min(8, target - 3));
    schedule[feastDay] = { phase: 'day', type: 'feast' };

    const count = 2 + Math.floor((target - 12) / 6); // 2..4
    const ms = shuffle(EV.mutts), ds = shuffle(EV.disasters);
    const defs = [ms.pop(), ds.pop()];
    const rest = shuffle(ms.concat(ds));
    while (defs.length < count && rest.length) defs.push(rest.pop());

    const days = shuffle(
      Array.from({ length: target - 3 }, (_, i) => i + 2).filter((d) => d !== feastDay)
    );
    defs.forEach((def) => {
      schedule[days.pop()] = { phase: Math.random() < 0.5 ? 'day' : 'night', type: 'gm', def };
    });
    return schedule;
  }

  function create(list) {
    const tribs = list.map((t, i) => ({
      id: i, name: t.name, img: t.img, district: t.district,
      alive: true, kills: 0, deathLabel: '', cause: '', deathOrder: 0, allyId: null, allyName: '',
    }));
    const target = ri(12, 15);
    return {
      tribs, day: 0, stage: 'intro', target,
      schedule: makeSchedule(target),
      cannonNext: 'day', sinceCannon: [], deathCount: 0,
      alliances: [], fallenAllies: [], allyCounter: 0, usedAllyNames: [],
    };
  }

  /* ---- pacing ----------------------------------------------------------- */
  function planBudget(s, phase) {
    const alive = aliveIds(s).length;
    const need = alive - 1;
    const left = (s.target - s.day) * 2 + (phase === 'day' ? 2 : 1);
    if (left <= 1) return need;
    if (alive === 2) return Math.random() < 0.45 ? 1 : 0; // the final duel shouldn't drag on
    const avg = (need / left) * rnd(0.6, 1.2); // slightly under, so the games run their course
    const b = Math.floor(avg) + (Math.random() < avg - Math.floor(avg) ? 1 : 0);
    return clamp(b, 0, need);
  }

  /* ---- applying events -------------------------------------------------- */
  /* ---- alliances ---- */
  function createAlliance(s, ids) {
    const free = EV.allianceNames.filter((n) => !s.usedAllyNames.includes(n));
    const name = free.length ? pick(free) : `${pick(EV.allianceNames)} ${++s.allyCounter + 1}`;
    s.usedAllyNames.push(name);
    const a = { id: ++s.allyCounter, name, members: ids.slice() };
    s.alliances.push(a);
    ids.forEach((id) => { s.tribs[id].allyId = a.id; s.tribs[id].allyName = name; });
    return name;
  }

  function leaveAlliance(s, id) {
    const t = s.tribs[id];
    const a = s.alliances.find((x) => x.id === t.allyId);
    t.allyId = null; t.allyName = '';
    if (!a) return;
    a.members = a.members.filter((m) => m !== id);
    if (a.members.length < 2) { // a lone survivor is no alliance
      a.members.forEach((m) => { s.tribs[m].allyId = null; s.tribs[m].allyName = ''; });
      s.alliances = s.alliances.filter((x) => x !== a);
    }
  }

  // Alliance members present in `R`, grouped; returns n of them from the same alliance (or null).
  function findGroup(s, R, n) {
    const by = {};
    R.forEach((id) => { const a = s.tribs[id].allyId; if (a != null) (by[a] = by[a] || []).push(id); });
    const groups = Object.values(by).filter((g) => g.length >= n);
    return groups.length ? shuffle(pick(groups)).slice(0, n) : null;
  }
  const unallied = (s, R) => R.filter((id) => s.tribs[id].allyId == null);

  function pickSlots(s, R, ev) {
    const take = (ids) => { ids.forEach((id) => R.splice(R.indexOf(id), 1)); return ids; };
    if (ev.form) return take(shuffle(unallied(s, R)).slice(0, ev.n));
    if (ev.ally || ev.betray) return take(findGroup(s, R, ev.n));
    if (ev.n >= 2 && !ev.d.length && Math.random() < 0.5) {
      const g = findGroup(s, R, ev.n);
      if (g) return take(g);
    }
    let cand = shuffle(R).slice(0, ev.n);
    if (ev.k.length) { // allies don't kill each other outside of betrayals
      for (let i = 0; i < 8; i++) {
        const friendly = ev.k.some((k) => ev.d.some((d) => {
          const a = s.tribs[cand[k]].allyId;
          return a != null && a === s.tribs[cand[d]].allyId;
        }));
        if (!friendly) break;
        cand = shuffle(R).slice(0, ev.n);
      }
    }
    return take(cand);
  }

  const feasible = (s, R, e) => {
    if (e.n > R.length) return false;
    if (e.form) return unallied(s, R).length >= e.n;
    if (e.ally || e.betray) return !!findGroup(s, R, e.n);
    return true;
  };

  // Survivors react to the death of an ally.
  const MOURN = [
    `A moment of silence for {x} of "{a}", courtesy of {s}. It lasts four seconds.`,
    `The vow: {s} will avenge {x} of "{a}". They mean it. For about an hour.`,
    `{s} lay {x} of "{a}" to rest under a pile of leaves and one very respectful brick.`,
    `{x} of "{a}" is gone. {s} pour out a little brown liquor. Then a lot.`,
  ];
  function allyAftermath(s) {
    const out = [];
    s.fallenAllies.forEach((f) => {
      const mates = f.mates.filter((m) => s.tribs[m].alive);
      if (!mates.length) return;
      const names = mates.map((m) => nameHtml(s.tribs[m]));
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      out.push({
        ids: mates, deaths: [], tag: 'mourning',
        html: pick(MOURN).replace('{s}', list).replace('{x}', nameHtml(s.tribs[f.dead]))
          .replace('{a}', esc(f.name)),
      });
    });
    s.fallenAllies = [];
    return out;
  }

  function kill(s, id, label, cause, killers) {
    const t = s.tribs[id];
    const al = s.alliances.find((x) => x.id === t.allyId);
    if (al) {
      const mates = al.members.filter((m) => m !== id && s.tribs[m].alive);
      if (mates.length) s.fallenAllies.push({ name: al.name, dead: id, mates });
      leaveAlliance(s, id);
    }
    t.alive = false;
    t.deathLabel = label;
    t.cause = cause;
    t.deathOrder = ++s.deathCount;
    s.sinceCannon.push(id);
    killers.forEach((k) => { s.tribs[k].kills += 1; });
  }

  function applyEvent(s, ev, ids, label) {
    const deaths = ev.d.map((i) => ids[i]);
    const killers = ev.k.map((i) => ids[i]);
    let ally = '';
    if (ev.form) ally = createAlliance(s, ids);
    else if (ev.ally || ev.betray) ally = s.tribs[ids[0]].allyName;
    if (ev.betray) killers.forEach((k) => leaveAlliance(s, k)); // the betrayer is cast out first
    deaths.forEach((id, n) => {
      const cause = ev.c ? fill(s, ev.c, ids, false, ally)
        : `Killed by ${killers.map((k) => s.tribs[k].name).join(' & ')}`;
      kill(s, id, label, cause, n === 0 ? killers : []);
    });
    // each killer gets credit for every death in the event
    if (deaths.length > 1) killers.forEach((k) => { s.tribs[k].kills += deaths.length - 1; });
    const tag = ev.betray ? 'betrayal' : ev.form ? 'alliance' : deaths.length ? 'fallen' : ev.ally ? 'allies' : '';
    return { ids, deaths, tag, html: fill(s, ev.t, ids, true, ally) };
  }

  function runRound(s, pool, ids, budget, label, reserve, count) {
    const R = shuffle(ids);
    const out = [];
    const used = new Set();
    const keep = reserve == null ? 1 : reserve;
    let spent = 0;
    const total = Math.max(count || R.length, Math.min(budget, R.length)); // enough events to spend the budget
    while (R.length && out.length < total) {
      const alive = aliveIds(s).length;
      const maxDeaths = Math.max(0, Math.min(budget - spent, alive - keep));
      const left = total - out.length;
      const wantFatal = maxDeaths > 0 && Math.random() < Math.min(1, (maxDeaths * 1.1) / left);
      const fits = (e) => feasible(s, R, e) && !used.has(e.t);
      let c = pool.filter((e) => fits(e) && (wantFatal ? e.d.length > 0 && e.d.length <= maxDeaths : e.d.length === 0));
      if (!c.length) c = pool.filter((e) => fits(e) && e.d.length === 0);
      if (!c.length) c = pool.filter((e) => feasible(s, R, e) && e.d.length === 0);
      if (!c.length) c = pool.filter((e) => e.n <= R.length && e.d.length === 0 && !e.form && !e.ally && !e.betray);
      const ev = pick(c);
      used.add(ev.t);
      const slots = pickSlots(s, R, ev);
      const res = applyEvent(s, ev, slots, label);
      spent += res.deaths.length;
      out.push(res);
    }
    return out;
  }

  /* ---- round builders --------------------------------------------------- */
  const phaseLabel = (s, phase) => (phase === 'day' ? `Day ${s.day}` : `Night ${s.day}`);

  function eventsRound(s, kind) {
    const budget = kind === 'bloodbath' ? ri(5, 8) : planBudget(s, kind);
    const label = kind === 'bloodbath' ? 'The Bloodbath' : phaseLabel(s, kind);
    const pool = EV[kind];
    // a slideshow-friendly handful of events: ~5-7 per day (3-4 by day, 2-3 by night)
    const count = kind === 'bloodbath' ? ri(8, 10) : kind === 'day' ? ri(3, 4) : ri(2, 3);
    const events = runRound(s, pool, aliveIds(s), budget, label, 1, count);
    events.push(...allyAftermath(s));
    // sponsors parachute gifts to survivors after the action
    let gifts = [];
    if (kind !== 'bloodbath' && Math.random() < (kind === 'day' ? 0.75 : 0.45)) {
      const lines = shuffle(EV.gifts);
      gifts = shuffle(aliveIds(s)).slice(0, ri(1, 3)).map((id) => ({
        ids: [id], deaths: [], tag: 'gift', html: fill(s, lines.pop(), [id], true),
      }));
    }
    return {
      kind, gifts,
      title: kind === 'bloodbath' ? 'The Bloodbath' : phaseLabel(s, kind),
      intro: kind === 'bloodbath'
        ? `The gong sounds. 24 tributes bolt from their pedestals toward the Cornucopia, piled high with weapons, white liquor, brown liquor, bricks, gas masks, an alarming amount of ibuprofen, and one really good shoe. Around you, the abandoned pavilion looms, overgrown and faintly glowing.`
        : kind === 'day' && s.day > 1 && Math.random() < 0.4 ? pick(EV.memos) : '',
      events,
    };
  }

  // How many deaths a single Gamemaker event may cause, given the pace of the games.
  function paceCap(s, max) {
    const alive = aliveIds(s).length;
    const left = Math.max(2, (s.target - s.day) * 2 + 1);
    return clamp(Math.ceil(((alive - 1) / left) * 2), 1, Math.min(max, alive - 2));
  }

  function feastRound(s) {
    const alive = aliveIds(s);
    if (alive.length < 5) return null;
    let att = alive.filter(() => Math.random() < 0.6);
    if (att.length < 3) att = shuffle(alive).slice(0, 3);
    const budget = paceCap(s, Math.round(att.length * 0.35) || 1);
    const label = phaseLabel(s, 'day') + ' (Feast)';
    return {
      kind: 'gm', title: 'The Cornucopia Feast',
      intro: pick(EV.feastIntros),
      events: runRound(s, EV.feast, att, budget, label, 2, ri(3, 5)).concat(allyAftermath(s)),
    };
  }

  function gmRound(s, def, phase) {
    const alive = aliveIds(s);
    if (alive.length < 5) return null;
    const n = clamp(Math.round(alive.length * rnd(def.min, def.max)), 3, alive.length);
    const hit = shuffle(alive).slice(0, n);
    let cap = paceCap(s, def.cap);
    const dDraw = deck(def.deaths), sDraw = deck(def.survives);
    const label = phaseLabel(s, phase) + ` (${def.title})`;
    const events = hit.map((id) => {
      if (cap > 0 && Math.random() < def.rate) {
        cap--;
        const [txt, cause] = dDraw();
        kill(s, id, label, cause, []);
        return { ids: [id], deaths: [id], tag: 'fallen', html: fill(s, txt, [id], true) };
      }
      return { ids: [id], deaths: [], tag: '', html: fill(s, sDraw(), [id], true) };
    });
    events.push(...allyAftermath(s));
    return {
      kind: 'gm', gmKind: def.kind, title: def.title,
      intro: def.intro, outro: def.outro, events,
    };
  }

  function cannonRound(s) {
    const fallen = s.sinceCannon.slice();
    s.sinceCannon = [];
    const label = s.day === 0 ? 'The Bloodbath' : `End of Day ${s.day}`;
    return {
      kind: 'cannon', title: `The Sky Tonight`, label,
      fallen, remaining: aliveIds(s),
    };
  }

  function victoryRound(s) {
    const winner = aliveIds(s)[0];
    const standings = s.tribs.slice().sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.deathOrder - a.deathOrder;
    }).map((t) => t.id);
    return {
      kind: 'victory', title: 'The Winner', winner, standings,
      line: pick(EV.winnerLines), days: s.day,
    };
  }

  /* ---- state machine ---------------------------------------------------- */
  function advance(s, next) {
    if (aliveIds(s).length <= 1) {
      s.stage = 'cannon';
      s.cannonNext = 'victory';
    } else {
      s.stage = next;
      if (next === 'cannon') s.cannonNext = 'day';
    }
  }

  function next(s) {
    const before = aliveIds(s).length;
    for (;;) {
      switch (s.stage) {
        case 'intro':
          s.stage = 'bloodbath';
          return { kind: 'intro', title: 'The Reaping', alive: s.tribs.length };

        case 'bloodbath': {
          const r = eventsRound(s, 'bloodbath');
          advance(s, 'cannon');
          return decorate(s, r, before);
        }
        case 'day': {
          const r = eventsRound(s, 'day');
          advance(s, 'gm-day');
          return decorate(s, r, before);
        }
        case 'night': {
          const r = eventsRound(s, 'night');
          advance(s, 'gm-night');
          return decorate(s, r, before);
        }
        case 'gm-day':
        case 'gm-night': {
          const phase = s.stage === 'gm-day' ? 'day' : 'night';
          const entry = s.schedule[s.day];
          let r = null;
          if (entry && entry.phase === phase) {
            r = entry.type === 'feast' ? feastRound(s) : gmRound(s, entry.def, phase);
          }
          advance(s, phase === 'day' ? 'night' : 'cannon');
          if (r) return decorate(s, r, before);
          break; // nothing scheduled: loop to next stage
        }
        case 'cannon': {
          const r = cannonRound(s);
          if (s.cannonNext === 'victory') s.stage = 'victory';
          else { s.day += 1; s.stage = 'day'; }
          return decorate(s, r, before);
        }
        case 'victory':
          s.stage = 'done';
          return decorate(s, victoryRound(s), before);
        default:
          return null;
      }
    }
  }

  function decorate(s, r, before) {
    r.aliveBefore = before;
    r.aliveCount = aliveIds(s).length;
    r.day = s.day;
    return r;
  }

  global.Game = { create, next, esc };
})(window);
