/* The Hunger Games Simulator - UI */
(function () {
  const EV = window.BPG_EVENTS;
  const esc = Game.esc;
  const $ = (id) => document.getElementById(id);
  const STORE = 'bpg-tributes-v1';

  let tributes = Array.from({ length: 24 }, (_, i) => ({ district: Math.floor(i / 2) + 1, name: '', img: '' }));
  let state = null;
  let autoTimer = null;

  /* ---------- persistence ---------- */
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (Array.isArray(saved) && saved.length === 24) tributes = saved;
    } catch (e) { /* storage unavailable: start blank */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(tributes)); } catch (e) { /* too big / blocked */ }
  }

  /* ---------- avatars ---------- */
  function avatar(t, cls) {
    const c = cls ? ' ' + cls : '';
    if (t.img) return `<span class="av${c}"><img src="${t.img}" alt="${esc(t.name)}"></span>`;
    const ini = esc((t.name || String(t.district)).trim().charAt(0).toUpperCase() || '?');
    return `<span class="av ph${c}" title="${esc(t.name)}">${ini}</span>`;
  }

  function resizeImage(file, size = 220) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const side = Math.min(img.width, img.height);
          c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- reaping screen ---------- */
  function renderReaping() {
    const wrap = $('districts');
    wrap.innerHTML = '';
    for (let d = 0; d < 12; d++) {
      const box = document.createElement('div');
      box.className = 'district';
      box.innerHTML = `<h3>District ${d + 1}<small>${esc(EV.zones[d])}</small></h3><div class="pair"></div>`;
      const pair = box.querySelector('.pair');
      [d * 2, d * 2 + 1].forEach((i) => pair.appendChild(tributeCard(i)));
      wrap.appendChild(box);
    }
    updateStartState();
  }

  function tributeCard(i) {
    const t = tributes[i];
    const card = document.createElement('div');
    card.className = 'tcard';
    card.innerHTML = `
      <label class="pic" title="Upload a picture">
        <span class="slot"></span>
        <input type="file" accept="image/*" hidden>
      </label>
      <input class="nm-in" type="text" maxlength="28" placeholder="Tribute name" value="${esc(t.name)}">
      <button class="x" title="Remove picture" ${t.img ? '' : 'hidden'}>&times;</button>`;
    const slot = card.querySelector('.slot');
    const paint = () => {
      slot.innerHTML = avatar(tributes[i], 'xl');
      card.querySelector('.x').hidden = !tributes[i].img;
    };
    paint();
    card.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { tributes[i].img = await resizeImage(f); } catch (err) { return; }
      save(); paint();
    });
    card.querySelector('.nm-in').addEventListener('input', (e) => {
      tributes[i].name = e.target.value;
      save(); updateStartState();
    });
    card.querySelector('.x').addEventListener('click', (e) => {
      e.preventDefault();
      tributes[i].img = '';
      save(); paint();
    });
    return card;
  }

  function updateStartState() {
    const missing = tributes.filter((t) => !t.name.trim()).length;
    $('btnStart').disabled = missing > 0;
    $('startMsg').textContent = missing ? `${missing} tribute${missing === 1 ? '' : 's'} still need a name.` : 'All 24 tributes are reaped. Good luck.';
  }

  $('btnSample').addEventListener('click', () => {
    tributes.forEach((t, i) => { if (!t.name.trim()) t.name = EV.sampleNames[i]; });
    save(); renderReaping();
  });

  $('btnClear').addEventListener('click', () => {
    if (!confirm('Clear all 24 names and pictures?')) return;
    tributes.forEach((t) => { t.name = ''; t.img = ''; });
    save(); renderReaping();
  });

  $('btnBulk').addEventListener('click', () => $('bulkFile').click());
  $('bulkFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    e.target.value = '';
    for (const f of files) {
      let i = tributes.findIndex((t) => !t.img);
      if (i < 0) break;
      try { tributes[i].img = await resizeImage(f); } catch (err) { continue; }
      if (!tributes[i].name.trim()) {
        tributes[i].name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 28);
      }
    }
    save(); renderReaping();
  });

  /* ---------- screens ---------- */
  function show(screen) {
    $('screen-reaping').hidden = screen !== 'reaping';
    $('screen-arena').hidden = screen !== 'arena';
    window.scrollTo(0, 0);
  }

  /* ---------- audio: cannon + background music ----------
   * Everything is synthesized in the browser by default. To use real recordings instead, drop
   *   audio/cannon.mp3   (one cannon shot)   and/or   audio/music.mp3   (looping background track)
   * into the project folder. A track can also be picked live with "Load music". */
  let audio = null;
  let sfxMuted = false;
  const music = { on: true, vol: 0.35, el: null, file: null, synth: null, started: false };

  function ctx() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  function probe(src, cb) { // finds out if an optional audio file exists
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('canplaythrough', () => cb(a), { once: true });
    a.src = src;
  }
  let cannonFile = null;
  probe('audio/cannon.mp3', (a) => { cannonFile = a; });

  // Sound effects go through one boosted, limited bus so the cannon is LOUD without clipping.
  const SFX_GAIN = 3.5;
  let sfxOut = null;
  function sfxBus() {
    if (sfxOut) return sfxOut;
    const c = ctx();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.25;
    sfxOut = c.createGain();
    sfxOut.gain.value = SFX_GAIN;
    sfxOut.connect(limiter).connect(c.destination);
    return sfxOut;
  }

  // The recording embedded by tools/embed-audio.js (audio/cannon.js), decoded once.
  let cannonBuf = null;
  function loadCannonBuffer() {
    if (cannonBuf || !window.BPG_CANNON) return;
    try {
      const bin = atob(window.BPG_CANNON.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      ctx().decodeAudioData(bytes.buffer).then((b) => { cannonBuf = b; }).catch(() => {});
    } catch (e) { /* fall back to the other sources */ }
  }
  probe('audio/music.mp3', (a) => { music.file = a; a.loop = true; });

  function synthCannon() {
    try {
      const c = ctx();
      const t = c.currentTime;
      const out = c.createGain();
      out.gain.setValueAtTime(0.9, t);
      out.connect(sfxBus());
      // low thump: a sine that falls fast in pitch
      const thump = c.createOscillator();
      const tg = c.createGain();
      thump.frequency.setValueAtTime(140, t);
      thump.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      tg.gain.setValueAtTime(1, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      thump.connect(tg).connect(out);
      thump.start(t); thump.stop(t + 1.5);
      // crack + rumble: filtered noise burst
      const len = Math.floor(c.sampleRate * 1.8);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const noise = c.createBufferSource();
      noise.buffer = buf;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, t);
      lp.frequency.exponentialRampToValueAtTime(140, t + 1.2);
      noise.connect(lp).connect(out);
      noise.start(t);
      // distant echo
      const echo = c.createDelay(); echo.delayTime.value = 0.42;
      const eg = c.createGain(); eg.gain.value = 0.28;
      out.connect(echo).connect(eg).connect(sfxBus());
    } catch (e) { /* audio unavailable: carry on silently */ }
  }

  // force = true for the manual button, which ignores the mute toggle
  function playCannon(force) {
    if (sfxMuted && !force) return;
    if (cannonBuf) {
      try {
        const c = ctx();
        const src = c.createBufferSource();
        src.buffer = cannonBuf;
        src.connect(sfxBus());
        src.start();
        return;
      } catch (e) { /* fall through */ }
    }
    if (cannonFile) {
      const a = cannonFile.cloneNode();
      a.volume = 1;
      a.play().catch(synthCannon);
    } else synthCannon();
  }

  // Dark ambient score: a slowly breathing drone, a heartbeat, and sparse minor-key notes.
  function startSynthMusic() {
    const c = ctx();
    if (music.synth) { music.synth.master.gain.setTargetAtTime(music.vol * 0.5, c.currentTime, 0.3); return; }
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    master.gain.setTargetAtTime(music.vol * 0.5, c.currentTime, 1.5);
    const bus = c.createGain();
    bus.connect(master);
    const fb = c.createDelay(2); fb.delayTime.value = 0.6; // cheap echo for space
    const fbg = c.createGain(); fbg.gain.value = 0.5;
    const wet = c.createGain(); wet.gain.value = 0.45;
    bus.connect(fb); fb.connect(fbg).connect(fb); fb.connect(wet).connect(master);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 4;
    lp.connect(bus);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 220;
    lfo.connect(lg).connect(lp.frequency); lfo.start();
    [[55, 'sawtooth', 0.16], [55.5, 'sawtooth', 0.16], [82.4, 'triangle', 0.1], [110.3, 'triangle', 0.07]].forEach(([f, type, v]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = v;
      o.connect(g).connect(lp); o.start();
    });

    const scale = [220, 261.6, 293.7, 329.6, 349.2, 440, 523.3];
    const note = () => {
      if (!music.on || c.state !== 'running') return;
      const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.value = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.25 ? 2 : 1);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + 4);
      o.connect(g).connect(bus); o.start(t); o.stop(t + 4.2);
    };
    const beat = () => { // a slow, low heartbeat
      if (!music.on || c.state !== 'running') return;
      const t = c.currentTime;
      [0, 0.28].forEach((dt, i) => {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(70, t + dt);
        o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.25);
        const g = c.createGain();
        g.gain.setValueAtTime(i ? 0.35 : 0.55, t + dt);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.4);
        o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.5);
      });
    };
    music.synth = { master, timers: [setInterval(note, 3600), setInterval(beat, 2600)] };
    note();
  }

  function applyMusicVolume() {
    if (music.el) music.el.volume = music.vol;
    if (music.synth && audio) music.synth.master.gain.setTargetAtTime(music.on ? music.vol * 0.5 : 0, audio.currentTime, 0.1);
  }

  function startMusic() {
    music.started = true;
    if (!music.on) return;
    const el = music.el || music.file;
    if (el) {
      el.loop = true; el.volume = music.vol;
      el.play().catch(() => {});
      music.el = el;
    } else {
      try { startSynthMusic(); } catch (e) { /* no audio */ }
    }
  }

  function stopMusic() {
    if (music.el) music.el.pause();
    if (music.synth && audio) music.synth.master.gain.setTargetAtTime(0, audio.currentTime, 0.2);
  }

  function setMusicOn(on) {
    music.on = on;
    $('btnMusic').textContent = on ? 'Music: on' : 'Music: off';
    if (on) { startMusic(); applyMusicVolume(); } else stopMusic();
  }

  /* ---------- slideshow ---------- */
  let slides = [];
  let cur = -1;

  const T = (id) => state.tribs[id];
  const zone = (id) => EV.zones[T(id).district - 1];

  function figure(id, cls, dead) {
    const t = T(id);
    return `<figure class="fig">${avatar(t, cls + (dead ? ' dead' : ''))}
      <figcaption><b>${esc(t.name)}</b><small>District ${t.district}</small></figcaption></figure>`;
  }
  const avSize = (n) => (n <= 2 ? 'hero' : n === 3 ? 'xl' : 'lg');

  const BADGES = {
    fallen: 'Fallen', alliance: 'Alliance formed', allies: 'Allies', betrayal: 'Betrayal',
    mourning: 'Mourning', gift: 'Sponsor gift',
  };

  function titleSlide(title, sub, theme) {
    return `<div class="slide slide-title theme-${theme}">
      <span class="rule"></span>
      <h1 class="fade-title">${esc(title)}</h1>
      ${sub ? `<p class="fade-sub">${esc(sub)}</p>` : ''}
      <span class="rule"></span></div>`;
  }

  function eventSlide(r, e, i, total) {
    const n = e.ids.length;
    const causes = e.deaths.map((id) =>
      `<li><b>${esc(T(id).name)}</b> <span class="dist">D${T(id).district}</span> &mdash; ${esc(T(id).cause)}</li>`).join('');
    return `<div class="slide slide-event${e.deaths.length ? ' has-death' : ''}">
      <div class="slide-meta">${esc(r.title)} <i>/</i> ${i + 1} of ${total}</div>
      ${BADGES[e.tag] ? `<div class="badge badge-${e.tag}">${BADGES[e.tag]}</div>` : ''}
      <div class="slide-avs">${e.ids.map((id) => figure(id, avSize(n), e.deaths.includes(id))).join('')}</div>
      <p class="slide-text">${e.html}</p>
      ${causes ? `<ul class="slide-cause">${causes}</ul>` : ''}</div>`;
  }

  function listSlide(badge, items, outro) {
    return `<div class="slide slide-list">
      <div class="badge">${esc(badge)}</div>
      <ul class="rows">${items.map((e, i) => `
        <li class="row${e.deaths.length ? ' row-death' : ''}" style="animation-delay:${0.25 + i * 0.22}s">
          <span class="row-avs">${e.ids.map((id) => avatar(T(id), 'md' + (e.deaths.includes(id) ? ' dead' : ''))).join('')}</span>
          <p>${e.html}</p></li>`).join('')}</ul>
      ${outro ? `<p class="outro">${esc(outro)}</p>` : ''}</div>`;
  }

  function rosterSlide() {
    const rows = [];
    for (let d = 0; d < 12; d++) {
      const pair = [d * 2, d * 2 + 1].map((i) =>
        `<div class="roster-t">${avatar(T(i), 'md')}<span>${esc(T(i).name)}</span></div>`).join('');
      rows.push(`<div class="roster-d"><h4>District ${d + 1}<small>${esc(EV.zones[d])}</small></h4><div class="roster-pair">${pair}</div></div>`);
    }
    return `<div class="slide slide-roster"><div class="badge">The tributes</div><div class="roster">${rows.join('')}</div></div>`;
  }

  function remainingSlide(r) {
    return `<div class="slide slide-remaining">
      <div class="badge">${r.remaining.length} remain</div>
      <div class="remaining">${r.remaining.map((id) => `
        <div class="rem-t">${avatar(T(id), 'lg')}<b>${esc(T(id).name)}</b><small>District ${T(id).district}</small>
          ${T(id).kills ? `<em>${T(id).kills} kill${T(id).kills === 1 ? '' : 's'}</em>` : ''}
          ${T(id).allyName ? `<span class="ally-tag">${esc(T(id).allyName)}</span>` : ''}</div>`).join('')}</div></div>`;
  }

  function resultsSlide(r) {
    const rows = r.standings.map((id, i) => {
      const t = T(id);
      return `<tr class="${t.alive ? 'win' : ''}"><td>${i + 1}</td>
        <td class="who">${avatar(t, 'sm' + (t.alive ? '' : ' dead'))}${esc(t.name)}</td><td>${t.district}</td>
        <td>${t.kills}</td><td>${t.alive ? 'Survived' : esc(t.deathLabel)}</td><td>${t.alive ? '' : esc(t.cause)}</td></tr>`;
    }).join('');
    return `<div class="slide slide-results">
      <div class="tablewrap"><table class="results">
        <thead><tr><th>#</th><th>Tribute</th><th>Dist.</th><th>Kills</th><th>Fell</th><th>Cause of death</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="victory-btns">
        <button class="btn big" data-act="again">Play again (same tributes)</button>
        <button class="btn" data-act="edit">Edit tributes</button>
      </div></div>`;
  }

  function makeSlides(r) {
    const out = [];
    const add = (html, extra) => out.push({ html, ...extra });

    switch (r.kind) {
      case 'intro':
        add(titleSlide('The Reaping', 'Twenty-four tributes. An abandoned, overgrown butterfly pavilion with a Cornucopia at its heart. The butterflies are killers, the plants are poisonous, the still water is a mistake and the green glow is worse. Only one walks out.', 'intro'));
        add(rosterSlide());
        break;

      case 'bloodbath': case 'day': case 'night':
        add(titleSlide(r.title, '', r.kind));
        r.events.forEach((e, i) => add(eventSlide(r, e, i, r.events.length)));
        if (r.gifts && r.gifts.length) add(listSlide('Sponsor gifts', r.gifts));
        break;

      case 'gm': {
        add(titleSlide(r.title, '', r.gmKind === 'mutt' ? 'mutt' : 'gm'));
        if (r.gmKind) add(listSlide(`${r.title}: the aftermath`, r.events));
        else r.events.forEach((e, i) => add(eventSlide(r, e, i, r.events.length)));
        break;
      }

      case 'cannon': {
        const n = r.fallen.length;
        add(titleSlide(r.label === 'The Bloodbath' ? 'The Sky Tonight' : `${r.label}: The Sky Tonight`,
          n ? `${n} cannon shot${n === 1 ? '' : 's'}` : 'No cannons tonight', 'cannon'), n ? { sound: true } : {});
        r.fallen.forEach((id, i) => add(`<div class="slide slide-fallen">
          <div class="slide-meta">Cannon <i>/</i> ${i + 1} of ${n}</div>
          <div class="slide-avs">${avatar(T(id), 'hero dead')}</div>
          <h2>${esc(T(id).name)}</h2>
          <p class="fallen-d">District ${T(id).district} &middot; ${esc(zone(id))}</p>
          <p class="slide-cause only">${esc(T(id).cause)}</p></div>`, { sound: true }));
        add(remainingSlide(r));
        break;
      }

      case 'victory': {
        const w = T(r.winner);
        add(titleSlide('The Winner', '', 'victory'));
        add(`<div class="slide slide-winner">
          <div class="slide-avs">${avatar(w, 'xxl')}</div>
          <h2>${esc(w.name)}</h2>
          <p class="fallen-d">District ${w.district} &middot; ${esc(zone(w.id))}</p>
          <p class="slide-text">${esc(w.name)} ${esc(r.line)}</p>
          <p class="stat">${w.kills} kill${w.kills === 1 ? '' : 's'} &middot; ${r.days} day${r.days === 1 ? '' : 's'} in the arena</p></div>`, { winner: true });
        add(resultsSlide(r));
        break;
      }
    }

    const status = {
      day: r.kind === 'intro' ? 'The Reaping' : r.kind === 'bloodbath' ? 'The Bloodbath' : r.kind === 'victory' ? 'Victory'
        : r.kind === 'cannon' && r.day === 0 ? 'The Bloodbath' : `Day ${r.day}`,
      alive: r.kind === 'intro' ? `${r.alive} tributes` : `${r.aliveBefore} alive`,
    };
    out.forEach((sl) => { sl.status = status; });
    return out;
  }

  function showSlide(i) {
    cur = i;
    const sl = slides[i];
    $('stage').innerHTML = sl.html;
    if (sl.sound) playCannon(false);
    $('statusDay').textContent = sl.status.day;
    $('statusAlive').textContent = sl.status.alive;
    syncButtons();
  }

  const atEnd = () => state.stage === 'done' && cur >= slides.length - 1;
  function syncButtons() {
    $('btnPrev').disabled = cur <= 0;
    $('btnNext').disabled = atEnd();
    $('btnAuto').disabled = atEnd();
    $('btnSkip').disabled = state.stage === 'done';
    if (atEnd()) stopAuto();
  }

  function generate() {
    const r = Game.next(state);
    if (!r) return -1;
    const start = slides.length;
    makeSlides(r).forEach((sl) => slides.push(sl));
    return start;
  }

  function goNext() {
    if (!state) return;
    if (cur < slides.length - 1) { showSlide(cur + 1); return; }
    const start = generate();
    if (start >= 0) showSlide(start);
  }
  function goPrev() { if (cur > 0) showSlide(cur - 1); }

  function startGame() {
    stopAuto();
    state = Game.create(tributes.map((t) => ({ ...t, name: t.name.trim() })));
    slides = []; cur = -1;
    show('arena');
    goNext();
  }

  $('btnStart').addEventListener('click', startGame);
  $('btnSound').addEventListener('click', () => {
    sfxMuted = !sfxMuted;
    $('btnSound').textContent = sfxMuted ? 'Cannon sound: off' : 'Cannon sound: on';
  });
  $('btnFire').addEventListener('click', () => { loadCannonBuffer(); playCannon(true); });
  $('btnMusic').addEventListener('click', () => setMusicOn(!music.on));
  $('musicVol').addEventListener('input', (e) => { music.vol = e.target.value / 100; applyMusicVolume(); });
  $('btnLoadMusic').addEventListener('click', () => $('musicFile').click());
  $('musicFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    stopMusic();
    const el = new Audio(URL.createObjectURL(f));
    el.loop = true;
    music.el = el;
    setMusicOn(true);
  });
  // browsers only allow sound after a click: start the music on the first one
  document.addEventListener('click', function first() {
    document.removeEventListener('click', first);
    loadCannonBuffer();
    if (!music.started) startMusic();
  });
  $('btnBack').addEventListener('click', () => { stopAuto(); show('reaping'); });
  $('btnNext').addEventListener('click', () => { stopAuto(); goNext(); });
  $('btnPrev').addEventListener('click', () => { stopAuto(); goPrev(); });
  $('btnSkip').addEventListener('click', () => {
    stopAuto();
    let guard = 0;
    while (state.stage !== 'done' && guard++ < 400) generate();
    const w = slides.findIndex((sl) => sl.winner);
    showSlide(w >= 0 ? w : slides.length - 1);
  });
  $('stage').addEventListener('click', (e) => {
    const act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'again') startGame();
    if (act === 'edit') show('reaping');
  });

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    $('btnAuto').textContent = 'Auto-play';
  }
  $('btnAuto').addEventListener('click', () => {
    if (autoTimer) { stopAuto(); return; }
    $('btnAuto').textContent = 'Pause';
    goNext();
    autoTimer = setInterval(goNext, 6500);
  });

  /* ---------- falling embers + flames (decor) ---------- */
  function fire() {
    const cv = $('fire');
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    let w, h, parts = [];
    const resize = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
    resize();
    addEventListener('resize', resize);
    const spawn = (anywhere) => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -20,
      r: 0.8 + Math.random() * 2.4,
      vy: 0.6 + Math.random() * 2.2,
      sway: Math.random() * Math.PI * 2,
      hue: 10 + Math.random() * 40,
      flame: Math.random() < 0.3, // teardrop "falling flame" vs. round ember
    });
    const count = Math.min(90, Math.floor(w / 16));
    for (let i = 0; i < count; i++) parts.push(spawn(true));
    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      parts.forEach((p, i) => {
        p.y += p.vy;
        p.sway += 0.03;
        p.x += Math.sin(p.sway) * 0.7;
        if (p.y > h + 20) parts[i] = spawn(false);
        const flick = 0.55 + 0.45 * Math.sin(t / 90 + i);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
        g.addColorStop(0, `hsla(${p.hue + 20}, 100%, 70%, ${0.75 * flick})`);
        g.addColorStop(0.4, `hsla(${p.hue}, 100%, 50%, ${0.3 * flick})`);
        g.addColorStop(1, `hsla(${p.hue - 8}, 100%, 40%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        if (p.flame) ctx.ellipse(p.x, p.y - p.r * 2, p.r * 1.4, p.r * 5, 0, 0, Math.PI * 2); // streaks upward as it falls
        else ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- presentation mode + keyboard ---------- */
  function togglePresent() {
    const on = document.body.classList.toggle('present');
    $('btnPresent').textContent = on ? 'Exit presentation' : 'Presentation mode';
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) document.exitFullscreen();
    } catch (e) { /* fullscreen unavailable: bigger text still applies */ }
  }
  $('btnPresent').addEventListener('click', togglePresent);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('present')) togglePresent();
  });
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!$('screen-arena').hidden) {
      if ((e.key === ' ' || e.key === 'ArrowRight') && !$('btnNext').disabled) { e.preventDefault(); stopAuto(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stopAuto(); goPrev(); }
    }
    if (e.key === 'f' || e.key === 'F') togglePresent();
    if (e.key === 'c' || e.key === 'C') playCannon(true);
  });

  load();
  renderReaping();
  fire();
})();
