// Game feel: synthesized sound effects, confetti, screen flash/shake, count-ups.
(function (root) {
  // ── sound (WebAudio, no files) ──
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('lt:muted') === '1'; } catch {}

  function audio() {
    if (muted) return null;
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, slide = null } = {}) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const arp = (notes, step, opts) => notes.forEach((f, i) => tone(f, step * 2.2, { ...opts, at: i * step }));

  const sfx = {
    count: () => tone(520, 0.12, { type: 'square', vol: 0.08 }),
    go: () => tone(660, 0.25, { type: 'square', vol: 0.1, slide: 1320 }),
    tick: () => tone(1100, 0.04, { type: 'square', vol: 0.04 }),
    tickHot: () => { tone(1400, 0.06, { type: 'square', vol: 0.09 }); tone(700, 0.06, { type: 'square', vol: 0.05 }); },
    ask: () => tone(780, 0.09, { type: 'triangle', vol: 0.12 }),
    lock: () => tone(500, 0.18, { type: 'triangle', vol: 0.15, slide: 1000 }),
    wrong: () => { tone(180, 0.16, { type: 'sawtooth', vol: 0.08 }); tone(130, 0.22, { type: 'sawtooth', vol: 0.08, at: 0.08 }); },
    timeUp: () => tone(440, 0.6, { type: 'sawtooth', vol: 0.08, slide: 110 }),
    blip: (i = 0) => tone(500 + i * 90, 0.08, { type: 'triangle', vol: 0.1 }),
    tier: {
      obvious: () => arp([392, 330], 0.14, { type: 'triangle', vol: 0.12 }),
      clever: () => arp([440, 415, 392], 0.1, { type: 'square', vol: 0.06 }),
      common: () => arp([523, 659], 0.09, { type: 'triangle', vol: 0.13 }),
      rare: () => arp([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.14 }),
      deep: () => { arp([392, 523, 659, 784, 1047, 1319], 0.07, { type: 'square', vol: 0.08 }); tone(98, 0.6, { type: 'sine', vol: 0.3 }); },
      gem: () => { arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.06, { type: 'square', vol: 0.08 }); arp([1568, 2093, 2637], 0.12, { type: 'sine', vol: 0.1 }); tone(65, 0.9, { type: 'sine', vol: 0.35 }); },
    },
  };

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('lt:muted', m ? '1' : '0'); } catch {}
  }

  // ── confetti ──
  const canvas = document.getElementById('fx');
  let g = null;
  try { g = canvas.getContext('2d'); } catch {}
  let parts = [];
  let raf = 0;
  function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', resize);
  resize();

  function confetti(n, colors) {
    if (!g) return;
    const w = canvas.width, h = canvas.height;
    for (let i = 0; i < n; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? w * 0.1 : w * 0.9, y: h * 0.75,
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 10) * devicePixelRatio,
        vy: -(12 + Math.random() * 14) * devicePixelRatio,
        s: (5 + Math.random() * 7) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length], life: 0,
      });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter((p) => p.life < 220 && p.y < canvas.height + 40);
    for (const p of parts) {
      p.life++; p.vy += 0.45 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if (!raf) g.clearRect(0, 0, canvas.width, canvas.height);
  }

  function flash(color) {
    const el = document.getElementById('flash');
    el.style.background = color;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function shake(el, cls = 'shake') {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  // Animate a number from `from` to `to` inside `el`.
  function countUp(el, from, to, ms, fmt = (v) => v) {
    const t0 = performance.now();
    const tickFn = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(tickFn);
    };
    requestAnimationFrame(tickFn);
  }

  root.FX = { sfx, setMuted, isMuted: () => muted, confetti, flash, shake, countUp };
})(window);
