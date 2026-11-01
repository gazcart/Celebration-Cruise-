/* RefurbVision – preview renovated wooden furniture, entirely in the browser. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  const MAX_SIDE = 1100;

  // ---------- Options ----------
  const STAINS = [
    { id: 'natural', name: 'Clear', color: null, swatch: '#d8b07a' },
    { id: 'lightoak', name: 'Light Oak', color: '#d1a066' },
    { id: 'honey', name: 'Honey', color: '#c07c35' },
    { id: 'teak', name: 'Teak', color: '#9c5f2c' },
    { id: 'walnut', name: 'Walnut', color: '#62402a' },
    { id: 'mahogany', name: 'Mahogany', color: '#7a3020' },
    { id: 'ebony', name: 'Ebony', color: '#2e221b' },
    { id: 'greywash', name: 'Grey Wash', color: '#9b958b' },
  ];
  const PAINTS = [
    { name: 'Chalk White', color: '#ece6da' },
    { name: 'Dove Grey', color: '#a9a8a1' },
    { name: 'Sage', color: '#9aac87' },
    { name: 'Duck Egg', color: '#b3cfca' },
    { name: 'Navy', color: '#22314f' },
    { name: 'Charcoal', color: '#3a3b3d' },
    { name: 'Forest', color: '#2f4a3a' },
    { name: 'Mustard', color: '#c9982e' },
    { name: 'Blush', color: '#d8a69e' },
    { name: 'Terracotta', color: '#b2603f' },
    { name: 'Black', color: '#1d1d1d' },
  ];
  const HW_FINISHES = {
    brass: { name: 'Brass', base: '#b8913a', hi: '#f6e09a', lo: '#5f4512' },
    black: { name: 'Matt Black', base: '#252525', hi: '#5d5d5d', lo: '#080808' },
    chrome: { name: 'Chrome', base: '#aeb4bb', hi: '#ffffff', lo: '#4f565e' },
    nickel: { name: 'Brushed Nickel', base: '#a19f98', hi: '#dedcd5', lo: '#5f5d57' },
    copper: { name: 'Copper', base: '#b5683a', hi: '#f5b98e', lo: '#5f2e14' },
    bronze: { name: 'Antique Bronze', base: '#5d4530', hi: '#a37d55', lo: '#271b10' },
    ceramic: { name: 'White Ceramic', base: '#efebe3', hi: '#ffffff', lo: '#aaa497' },
    wood: { name: 'Wood', base: '#98683b', hi: '#cf9f6b', lo: '#53341a' },
  };
  // footprint in units of "size" (width, height) when horizontal
  const HW_KINDS = {
    keep: { name: 'Keep original', fp: [1, 1] },
    knob: { name: 'Round knob', fp: [1, 1] },
    square: { name: 'Square knob', fp: [0.9, 0.9] },
    tbar: { name: 'T-bar knob', fp: [1.5, 0.5] },
    bar: { name: 'Bar pull', fp: [3.4, 0.5] },
    cup: { name: 'Cup pull', fp: [2.6, 1.1] },
    ring: { name: 'Ring pull', fp: [1.3, 1.6] },
    leather: { name: 'Leather strap', fp: [2.8, 0.7] },
    none: { name: 'Handleless', fp: [1, 1] },
  };

  // ---------- State ----------
  const S = {
    w: 0, h: 0,
    orig: null,            // Uint8ClampedArray RGBA
    sr: null, sg: null, sb: null, // "sanded" (smoothed) channels 0..1
    L: null, Lb: null,     // luminance + blurred luminance
    autoMask: null, mask: null,
    view: 'original',
    stain: 'natural', varnishSheen: 0.45,
    paint: '#9aac87', paintSheen: 0.3, grain: 0.35,
    hw: { kind: 'keep', finish: 'brass', size: 38, cover: 1 },
    items: [], sel: -1,
    tool: null,            // 'hw' | 'add' | 'erase'
    maskMode: 'auto',
    brush: 50, showMask: false,
    split: 0,
    finished: null,        // ImageData of finish (no hardware)
    lastLook: null,
  };

  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const origCanvas = document.createElement('canvas');
  const maskCanvas = document.createElement('canvas');

  // ---------- Image setup ----------
  function loadError(msg) {
    $('#uploadView').hidden = false; $('#editor').hidden = true;
    setStatus(msg || 'Sorry, that photo could not be opened. Try a different photo (JPG or PNG).', true);
  }
  function setStatus(msg, isErr) {
    const el = $('#status'); el.textContent = msg || ''; el.hidden = !msg; el.classList.toggle('err', !!isErr);
  }

  function loadFromSrc(src, onFail) {
    const img = new Image();
    img.onload = () => { try { setupImage(img); } catch (err) { (onFail || loadError)(); } };
    img.onerror = () => (onFail || loadError)();
    img.src = src;
  }

  // Phones (especially in-app browsers) are picky, so try several ways to read the photo.
  async function loadFile(file) {
    if (!file) return;
    setStatus('Loading your photo…');
    await new Promise((r) => setTimeout(r, 30));
    if (window.createImageBitmap) {
      try {
        let bmp;
        try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { bmp = await createImageBitmap(file); }
        setupImage(bmp); return;
      } catch (_) { /* fall through */ }
    }
    const viaReader = () => {
      try {
        const fr = new FileReader();
        fr.onload = () => loadFromSrc(fr.result);
        fr.onerror = () => loadError();
        fr.readAsDataURL(file);
      } catch (_) { loadError(); }
    };
    try { loadFromSrc(URL.createObjectURL(file), viaReader); } catch (_) { viaReader(); }
  }

  function setupImage(img) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('empty image');
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    S.w = w; S.h = h;
    canvas.width = origCanvas.width = maskCanvas.width = w;
    canvas.height = origCanvas.height = maskCanvas.height = h;
    const octx = origCanvas.getContext('2d');
    octx.drawImage(img, 0, 0, w, h);
    S.orig = octx.getImageData(0, 0, w, h).data;
    precompute();
    S.split = 0; $('#split').value = 0;
    setMaskMode('auto');
    detectHardware();
    setStatus('');
    $('#uploadView').hidden = true;
    $('#editor').hidden = false;
    setView('original');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), inv = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = acc * inv;
        acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc * inv;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }
  const blur = (src, w, h, r) => boxBlur(boxBlur(src, w, h, r), w, h, r);

  function precompute() {
    const { w, h, orig } = S, n = w * h;
    const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { r[i] = orig[i * 4] / 255; g[i] = orig[i * 4 + 1] / 255; b[i] = orig[i * 4 + 2] / 255; }
    const rad = Math.max(1, Math.round(w / 600));
    const rb = blur(r, w, h, rad), gb = blur(g, w, h, rad), bb = blur(b, w, h, rad);
    S.sr = new Float32Array(n); S.sg = new Float32Array(n); S.sb = new Float32Array(n);
    S.L = new Float32Array(n);
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // "sanding": soften fine scratches and scuffs but keep the grain
      const sr = r[i] * 0.4 + rb[i] * 0.6, sg = g[i] * 0.4 + gb[i] * 0.6, sb = b[i] * 0.4 + bb[i] * 0.6;
      S.sr[i] = sr; S.sg[i] = sg; S.sb[i] = sb;
      S.L[i] = 0.299 * sr + 0.587 * sg + 0.114 * sb;
      // wood detection score from hue/saturation/value
      const mx = Math.max(sr, sg, sb), mn = Math.min(sr, sg, sb), d = mx - mn;
      const sat = mx > 0 ? d / mx : 0;
      let hue = 0;
      if (d > 1e-5) {
        if (mx === sr) hue = 60 * (((sg - sb) / d) % 6);
        else if (mx === sg) hue = 60 * ((sb - sr) / d + 2);
        else hue = 60 * ((sr - sg) / d + 4);
      }
      if (hue < 0) hue += 360;
      if (hue > 300) hue -= 360;
      let hs = 1;
      if (hue < 6) hs = clamp(1 - (6 - hue) / 22);
      else if (hue > 52) hs = clamp(1 - (hue - 52) / 18);
      raw[i] = hs * smooth(0.13, 0.3, sat) * smooth(0.04, 0.12, mx);
    }
    const mb = blur(raw, w, h, Math.max(2, Math.round(w / 150)));
    S.autoMask = new Float32Array(n);
    let cov = 0;
    for (let i = 0; i < n; i++) { const m = smooth(0.22, 0.55, mb[i]); S.autoMask[i] = m; cov += m; }
    S.autoCoverage = cov / n;
    // blurs that only average within the furniture, so the wall doesn't bleed in at the edges
    const useMask = S.autoCoverage >= 0.06;
    const wgt = new Float32Array(n), lm = new Float32Array(n);
    for (let i = 0; i < n; i++) { wgt[i] = useMask ? 0.02 + S.autoMask[i] : 1; lm[i] = S.L[i] * wgt[i]; }
    const nblur = (r) => { const a = blur(lm, w, h, r), b2 = blur(wgt, w, h, r), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] / b2[i]; return o; };
    S.Lb = nblur(Math.max(3, Math.round(w / 160)));   // grain detail reference
    S.Lshade = nblur(Math.max(6, Math.round(w / 45))); // overall form / lighting for paint
  }

  // ---------- Masks ----------
  function setMaskMode(mode) {
    S.maskMode = mode;
    $$('#maskModes .chip').forEach((c) => c.classList.toggle('active', c.dataset.mask === mode));
    if (mode === 'auto') {
      if (S.autoCoverage < 0.06) {
        S.mask = new Float32Array(S.w * S.h).fill(1);
        showHint('Couldn\'t find much wood – applying to the whole photo', 3000);
      } else S.mask = new Float32Array(S.autoMask);
      setTool(null);
    } else if (mode === 'whole') {
      S.mask = new Float32Array(S.w * S.h).fill(1);
      setTool(null);
    } else if (mode === 'custom') {
      // finished brushing: keep the painted mask
      setTool(null);
      return;
    } else {
      setTool(mode);
      if (!S.showMask) { S.showMask = true; $('#showMask').checked = true; }
      showHint(mode === 'add' ? 'Paint over parts of the furniture that were missed' : 'Paint over wall/floor to leave it unchanged', 3500);
    }
    renderFinish(); compose();
  }

  function paintMask(p) {
    const r = S.brush * S.w / 1000, add = S.tool === 'add';
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(S.w - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(S.h - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - p.x, y - p.y) / r;
      if (d > 1) continue;
      const f = smooth(1, 0.6, d), i = y * S.w + x;
      S.mask[i] = add ? Math.max(S.mask[i], f) : Math.min(S.mask[i], 1 - f);
    }
  }

  function maskStats() {
    const { mask, L } = S, n = mask.length;
    const hist = new Float64Array(256);
    let sum = 0, wsum = 0, satSum = 0, hf = 0;
    for (let i = 0; i < n; i += 2) {
      const m = mask[i]; if (m < 0.5) continue;
      hist[Math.min(255, (L[i] * 255) | 0)]++;
      sum += L[i]; wsum++;
      const mx = Math.max(S.sr[i], S.sg[i], S.sb[i]), mn = Math.min(S.sr[i], S.sg[i], S.sb[i]);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
      hf += Math.abs(S.L[i] - S.Lb[i]);
    }
    if (!wsum) return { lo: 0, hi: 1, mean: 0.5, sat: 0.3, detail: 0.03 };
    const pct = (p) => { let acc = 0; const t = wsum * p; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= t) return k / 255; } return 1; };
    return { lo: pct(0.02), hi: Math.max(pct(0.985), pct(0.02) + 0.1), mean: sum / wsum, sat: satSum / wsum, detail: hf / wsum };
  }

  // ---------- Finish rendering ----------
  function renderFinish() {
    if (!S.w) return;
    const { w, h, orig, mask, sr, sg, sb, L, Lb, Lshade: Ls } = S, n = w * h;
    const out = new ImageData(w, h), o = out.data;
    if (S.view === 'original' || S.view === 'hardware' && !S.baseView) {
      o.set(orig);
      S.finished = out; return;
    }
    const mode = S.view === 'hardware' ? S.baseView : S.view;
    if (mode === 'original') { o.set(orig); S.finished = out; return; }
    const st = maskStats();
    const range = st.hi - st.lo;

    if (mode === 'varnish') {
      const stain = STAINS.find((s) => s.id === S.stain);
      const sc = stain.color ? hexToRgb(stain.color) : null;
      const sheen = S.varnishSheen;
      // gentle contrast stretch around the average tone, capped so faded wood doesn't turn neon
      const mean = st.mean, k = clamp(0.45 / range, 1, 1.5), lift = 0.04;
      const satK = clamp(1.35 - (st.sat - 0.3) * 1.5, 1, 1.35);
      const meanAdj = clamp(mean + lift, 0.15, 0.85);
      for (let i = 0; i < n; i++) {
        const m = mask[i], j = i * 4;
        if (m < 0.004) { o[j] = orig[j]; o[j + 1] = orig[j + 1]; o[j + 2] = orig[j + 2]; o[j + 3] = 255; continue; }
        // restore: stretch tones, revive colour, warm
        let r = mean + (sr[i] - mean) * k + lift, g = mean + (sg[i] - mean) * k + lift, b = mean + (sb[i] - mean) * k + lift;
        let l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * satK; g = l + (g - l) * satK; b = l + (b - l) * satK;
        r *= 1.03; b *= 0.94;
        // emphasise fine grain, and sand out mid-size blotches / water marks
        const det = (L[i] - Lb[i]) * 0.6 + (Ls[i] - Lb[i]) * 0.5;
        r += det; g += det; b += det;
        l = clamp(0.299 * r + 0.587 * g + 0.114 * b, 0.001, 1);
        if (sc) {
          const t = Math.pow(l / meanAdj, 1.15);
          r = r * 0.22 + sc[0] * t * 0.78; g = g * 0.22 + sc[1] * t * 0.78; b = b * 0.22 + sc[2] * t * 0.78;
        }
        // varnish depth + gloss highlights
        const deep = 1 - sheen * 0.1;
        const spec = sheen * 0.5 * Math.pow(clamp(l), 3.2);
        r = Math.pow(clamp(r * deep), 1.06) + spec; g = Math.pow(clamp(g * deep), 1.06) + spec; b = Math.pow(clamp(b * deep), 1.06) + spec * 0.9;
        o[j] = orig[j] * (1 - m) + clamp(r) * 255 * m;
        o[j + 1] = orig[j + 1] * (1 - m) + clamp(g) * 255 * m;
        o[j + 2] = orig[j + 2] * (1 - m) + clamp(b) * 255 * m;
        o[j + 3] = 255;
      }
    } else if (mode === 'paint') {
      const pc = hexToRgb(S.paint);
      const sheen = S.paintSheen, grain = S.grain;
      const mean = Math.max(0.03, st.mean);
      const pl = 0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2];
      const detK = (0.25 + grain * 1.6) * (0.5 + pl);
      for (let i = 0; i < n; i++) {
        const m = mask[i], j = i * 4;
        if (m < 0.004) { o[j] = orig[j]; o[j + 1] = orig[j + 1]; o[j + 2] = orig[j + 2]; o[j + 3] = 255; continue; }
        // keep the form's shading (from the blurred light), not the dark wood tone
        const shade = clamp(1 + (Ls[i] / mean - 1) * 0.6, 0.3, 1.3);
        const fine = clamp(1 + (L[i] / Math.max(0.02, Lb[i]) - 1) * 0.35, 0.55, 1.2); // edges & creases
        const det = (L[i] - Lb[i]) * detK;
        const spec = sheen * 0.35 * Math.pow(clamp((shade - 0.85) / 0.45), 2);
        const r = pc[0] * shade * fine + det + spec, g = pc[1] * shade * fine + det + spec, b = pc[2] * shade * fine + det + spec;
        o[j] = orig[j] * (1 - m) + clamp(r) * 255 * m;
        o[j + 1] = orig[j + 1] * (1 - m) + clamp(g) * 255 * m;
        o[j + 2] = orig[j + 2] * (1 - m) + clamp(b) * 255 * m;
        o[j + 3] = 255;
      }
    }
    S.finished = out;
  }

  // ---------- Hardware ----------
  function hwUnit() { return S.hw.size * S.w / 1000; }

  function patchOld(data, w, h, it) {
    const s = hwUnit(), fp = HW_KINDS[S.hw.kind].fp, c = S.hw.cover;
    if (c <= 0.01) return;
    let nw = fp[0] * s, nh = fp[1] * s;
    if (it.rot) [nw, nh] = [nh, nw];
    const pad = w * 0.006;
    const hw2 = Math.max(nw * 0.55, (it.ow || s) * 0.62 + pad) * c, hh2 = Math.max(nh * 0.55, (it.oh || s) * 0.62 + pad) * c;
    const x0 = Math.max(1, Math.round(it.x - hw2)), x1 = Math.min(w - 2, Math.round(it.x + hw2));
    const y0 = Math.max(1, Math.round(it.y - hh2)), y1 = Math.min(h - 2, Math.round(it.y + hh2));
    if (x1 <= x0 || y1 <= y0) return;
    const horiz = (x1 - x0) >= (y1 - y0) * 0.8;
    const fe = Math.max(2, Math.min(x1 - x0, y1 - y0) * 0.22);
    const src = new Uint8ClampedArray(data); // read edges from the unpatched copy
    const sample = (x, y, ch) => {
      // 3px average at the edge for less noise
      x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
      if (horiz) return (src[(y * w + x) * 4 + ch] + src[(Math.max(0, y - 1) * w + x) * 4 + ch] + src[(Math.min(h - 1, y + 1) * w + x) * 4 + ch]) / 3;
      return (src[(y * w + x) * 4 + ch] + src[(y * w + Math.max(0, x - 1)) * 4 + ch] + src[(y * w + Math.min(w - 1, x + 1)) * 4 + ch]) / 3;
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = horiz ? (x - x0) / (x1 - x0) : (y - y0) / (y1 - y0);
      const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const a = smooth(0, fe, edge);
      const i = (y * w + x) * 4, n = (Math.random() - 0.5) * 5;
      for (let ch = 0; ch < 3; ch++) {
        const v = horiz ? sample(x0 - 2, y, ch) * (1 - t) + sample(x1 + 2, y, ch) * t
                        : sample(x, y0 - 2, ch) * (1 - t) + sample(x, y1 + 2, ch) * t;
        data[i + ch] = data[i + ch] * (1 - a) + (v + n) * a;
      }
    }
  }

  function metal(c, x0, y0, x1, y1, f) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, f.hi); g.addColorStop(0.35, f.base); g.addColorStop(0.7, f.lo); g.addColorStop(1, f.base);
    return g;
  }
  function radialMetal(c, r, f) {
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    g.addColorStop(0, f.hi); g.addColorStop(0.45, f.base); g.addColorStop(1, f.lo);
    return g;
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function shadow(c, s, k = 1) {
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = s * 0.25 * k; c.shadowOffsetX = s * 0.06 * k; c.shadowOffsetY = s * 0.12 * k;
  }
  function noShadow(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }

  function drawHardware(c, x, y, s, kind, fid, rot) {
    const f = HW_FINISHES[fid];
    c.save(); c.translate(x, y); if (rot) c.rotate(Math.PI / 2);
    switch (kind) {
      case 'knob': {
        const r = s / 2;
        shadow(c, s); c.fillStyle = radialMetal(c, r, f); c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); noShadow(c);
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = s * 0.03; c.beginPath(); c.arc(0, 0, r * 0.62, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.35, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'square': {
        const a = s * 0.9;
        shadow(c, s); c.fillStyle = metal(c, -a / 2, -a / 2, a / 2, a / 2, f); rrect(c, -a / 2, -a / 2, a, a, a * 0.16); c.fill(); noShadow(c);
        c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = s * 0.04; rrect(c, -a * 0.32, -a * 0.32, a * 0.64, a * 0.64, a * 0.1); c.stroke();
        break;
      }
      case 'tbar': {
        shadow(c, s); c.fillStyle = radialMetal(c, s * 0.2, f); c.beginPath(); c.arc(0, 0, s * 0.18, 0, Math.PI * 2); c.fill();
        c.fillStyle = metal(c, 0, -s * 0.25, 0, s * 0.25, f); rrect(c, -s * 0.75, -s * 0.2, s * 1.5, s * 0.4, s * 0.2); c.fill(); noShadow(c);
        break;
      }
      case 'bar': {
        const L = s * 3.4, t = s * 0.26, px = L * 0.4;
        c.fillStyle = f.lo;
        for (const sx of [-px, px]) { c.beginPath(); c.arc(sx, 0, s * 0.17, 0, Math.PI * 2); c.fill(); }
        shadow(c, s, 1.6); c.fillStyle = metal(c, 0, -t, 0, t, f); rrect(c, -L / 2, -t / 2, L, t, t / 2); c.fill(); noShadow(c);
        c.fillStyle = 'rgba(255,255,255,0.35)'; rrect(c, -L / 2 + t * 0.6, -t * 0.32, L - t * 1.2, t * 0.14, t * 0.07); c.fill();
        break;
      }
      case 'cup': {
        const W = s * 2.5, H = s * 1.05;
        shadow(c, s); c.fillStyle = metal(c, 0, -H / 2, 0, H / 2, f);
        c.beginPath(); c.moveTo(-W / 2, -H * 0.4); c.lineTo(W / 2, -H * 0.4);
        c.quadraticCurveTo(W / 2, H * 0.6, 0, H * 0.6); c.quadraticCurveTo(-W / 2, H * 0.6, -W / 2, -H * 0.4); c.closePath(); c.fill(); noShadow(c);
        // shadowed opening
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.beginPath(); c.moveTo(-W * 0.38, -H * 0.18); c.lineTo(W * 0.38, -H * 0.18);
        c.quadraticCurveTo(W * 0.36, H * 0.38, 0, H * 0.4); c.quadraticCurveTo(-W * 0.36, H * 0.38, -W * 0.38, -H * 0.18); c.closePath(); c.fill();
        c.fillStyle = f.lo; for (const sx of [-W * 0.44, W * 0.44]) { c.beginPath(); c.arc(sx, -H * 0.3, s * 0.05, 0, Math.PI * 2); c.fill(); }
        break;
      }
      case 'ring': {
        const pr = s * 0.32, rr = s * 0.55, cy = s * 0.15;
        shadow(c, s); c.fillStyle = radialMetal(c, pr, f); c.beginPath(); c.arc(0, -s * 0.38, pr, 0, Math.PI * 2); c.fill();
        c.strokeStyle = metal(c, -rr, cy - rr, rr, cy + rr, f); c.lineWidth = s * 0.14;
        c.beginPath(); c.arc(0, cy, rr * 0.82, 0, Math.PI * 2); c.stroke(); noShadow(c);
        c.fillStyle = radialMetal(c, s * 0.12, f); c.beginPath(); c.arc(0, -s * 0.38, s * 0.12, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'leather': {
        const W = s * 2.8, H = s * 0.55;
        shadow(c, s, 1.3);
        const g = c.createLinearGradient(0, -H, 0, H); g.addColorStop(0, '#b07a45'); g.addColorStop(0.5, '#8a5527'); g.addColorStop(1, '#5e3416');
        c.fillStyle = g; rrect(c, -W / 2, -H / 2, W, H, H * 0.3); c.fill(); noShadow(c);
        c.strokeStyle = 'rgba(255,230,190,0.55)'; c.setLineDash([s * 0.08, s * 0.07]); c.lineWidth = s * 0.03;
        rrect(c, -W / 2 + H * 0.15, -H / 2 + H * 0.15, W - H * 0.3, H * 0.7, H * 0.2); c.stroke(); c.setLineDash([]);
        for (const sx of [-W * 0.38, W * 0.38]) { c.fillStyle = radialMetal(c, s * 0.12, f); c.beginPath(); c.arc(sx, 0, s * 0.11, 0, Math.PI * 2); c.fill(); }
        break;
      }
      case 'none': default: break;
    }
    c.restore();
  }

  // Find the existing handles/knobs: small, compact spots that stand out from the wood around them.
  function detectHardware() {
    const { w, h, L, Lshade, sr, sg, sb } = S, n = w * h;
    const reg = blur(S.mask, w, h, Math.max(4, Math.round(w / 40)));
    const sat = new Float32Array(n);
    for (let i = 0; i < n; i++) { const mx = Math.max(sr[i], sg[i], sb[i]), mn = Math.min(sr[i], sg[i], sb[i]); sat[i] = mx > 0 ? (mx - mn) / mx : 0; }
    const satB = blur(sat, w, h, Math.max(6, Math.round(w / 45)));
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = Math.abs(L[i] - Lshade[i]) + 0.5 * Math.abs(sat[i] - satB[i]);
    const c = blur(raw, w, h, Math.max(1, Math.round(w / 500)));
    let m = 0, m2 = 0, cnt = 0;
    for (let i = 0; i < n; i += 3) if (reg[i] > 0.55) { m += c[i]; m2 += c[i] * c[i]; cnt++; }
    if (!cnt) { S.items = []; return; }
    m /= cnt; const sd = Math.sqrt(Math.max(0, m2 / cnt - m * m));
    const thr = Math.max(0.06, m + 2.4 * sd);

    // connected components on a downsampled grid
    const f = Math.max(1, Math.round(w / 450)), dw = Math.floor(w / f), dh = Math.floor(h / f);
    const bin = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = (y * f) * w + x * f; if (reg[i] > 0.55 && c[i] > thr) bin[y * dw + x] = 1;
    }
    const seen = new Uint8Array(dw * dh), stack = [], found = [];
    for (let start = 0; start < bin.length; start++) {
      if (!bin[start] || seen[start]) continue;
      let area = 0, sx = 0, sy = 0, sc = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      stack.push(start); seen[start] = 1;
      while (stack.length) {
        const q = stack.pop(), x = q % dw, y = (q / dw) | 0;
        area++; sx += x; sy += y; sc += c[(y * f) * w + x * f];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bin[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
        if (x < dw - 1 && bin[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
        if (y > 0 && bin[q - dw] && !seen[q - dw]) { seen[q - dw] = 1; stack.push(q - dw); }
        if (y < dh - 1 && bin[q + dw] && !seen[q + dw]) { seen[q + dw] = 1; stack.push(q + dw); }
      }
      const bw = (x1 - x0 + 1) * f, bh = (y1 - y0 + 1) * f, mn = Math.min(bw, bh), mx = Math.max(bw, bh);
      const fill = area / ((x1 - x0 + 1) * (y1 - y0 + 1));
      const asp = mx / mn;
      if (mn < w * 0.009 || mx > w * 0.16 || asp > 12 || fill < (asp > 4 ? 0.6 : 0.3)) continue;
      const cx = (sx / area) * f + f / 2, cy = (sy / area) * f + f / 2;
      // must be surrounded by furniture on (nearly) all sides
      const off = mx * 0.6 + w * 0.012;
      const around = [[cx - off, cy], [cx + off, cy], [cx, cy - off], [cx, cy + off]]
        .filter(([px, py]) => px >= 0 && py >= 0 && px < w && py < h && reg[(py | 0) * w + (px | 0)] > 0.5).length;
      if (around < 4) continue;
      // measure the full handle (the core above is only its most contrasting part)
      const lo = m + 0.9 * sd, lim = mx * 0.8 + w * 0.03;
      const reach = (dx, dy) => { let d = 0; for (; d < lim; d++) { const px = Math.round(cx + dx * d), py = Math.round(cy + dy * d); if (px < 0 || py < 0 || px >= w || py >= h || c[py * w + px] < lo) break; } return d; };
      const ow = Math.max(bw, reach(-1, 0) + reach(1, 0)), oh = Math.max(bh, reach(0, -1) + reach(0, 1));
      found.push({ x: cx, y: cy, ow, oh, rot: oh > ow * 1.4 ? 1 : 0, score: (sc / area) * fill });
    }
    found.sort((a, b) => b.score - a.score);
    const best = found.length ? found[0].score : 0;
    const items = [];
    for (const it of found) {
      if (it.score < best * 0.35 || items.length >= 30) break;
      if (items.some((o) => Math.abs(o.x - it.x) < (o.ow + it.ow) * 0.45 && Math.abs(o.y - it.y) < (o.oh + it.oh) * 0.45)) continue;
      items.push(it);
    }
    S.items = items; S.sel = -1;
    if (items.length) {
      const sizes = items.map((it) => { const mx = Math.max(it.ow, it.oh), mn = Math.min(it.ow, it.oh); return mx / mn < 1.8 ? mx * 1.35 : mx / 3.3; }).sort((a, b) => a - b);
      S.hw.size = clamp(Math.round(sizes[sizes.length >> 1] * 1000 / w), 15, 90);
      $('#hwSize').value = S.hw.size;
    }
    updateHwCount();
  }

  function updateHwCount() {
    const el = $('#hwCount'); if (!el) return;
    el.textContent = S.items.length
      ? `Found ${S.items.length} handle${S.items.length === 1 ? '' : 's'} on your furniture – pick a style below to change them all.`
      : 'No handles found automatically. Tap “Fix handle spots”, then tap once on each handle.';
  }

  function hitItem(p) {
    const s = hwUnit();
    for (let k = S.items.length - 1; k >= 0; k--) {
      if (Math.hypot(S.items[k].x - p.x, S.items[k].y - p.y) < Math.max(s * 1.1, S.w * 0.03)) return k;
    }
    return -1;
  }

  // ---------- Compose to screen ----------
  function compose(clean = false) {
    if (!S.finished) return;
    const { w, h } = S;
    const img = new ImageData(new Uint8ClampedArray(S.finished.data), w, h);
    const s = hwUnit(), showHw = S.hw.kind !== 'keep';
    if (showHw) for (const it of S.items) patchOld(img.data, w, h, it);
    ctx.putImageData(img, 0, 0);
    if (showHw) for (const it of S.items) drawHardware(ctx, it.x, it.y, s, S.hw.kind, S.hw.finish, it.rot);

    if (!clean) {
      if (S.showMask && S.mask) drawMaskOverlay();
      if (S.tool === 'hw') {
        ctx.save(); ctx.lineWidth = Math.max(2, w / 350); ctx.setLineDash([6, 5]);
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 4; ctx.strokeStyle = '#fff';
        for (const it of S.items) {
          const R = Math.max(it.ow || s, it.oh || s) * 0.6 + w * 0.012;
          ctx.beginPath(); ctx.arc(it.x, it.y, R, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      if (S.split > 0) {
        const x = w * S.split;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, h); ctx.clip(); ctx.drawImage(origCanvas, 0, 0); ctx.restore();
        ctx.save(); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6;
        ctx.fillRect(x - Math.max(1, w / 500), 0, Math.max(2, w / 250), h); ctx.restore();
      }
    }
  }

  function drawMaskOverlay() {
    const { w, h, mask } = S, mc = maskCanvas.getContext('2d');
    const id = mc.createImageData(w, h), d = id.data;
    for (let i = 0; i < mask.length; i++) { const j = i * 4; d[j] = 60; d[j + 1] = 200; d[j + 2] = 120; d[j + 3] = mask[i] * 105; }
    mc.putImageData(id, 0, 0);
    ctx.drawImage(maskCanvas, 0, 0);
  }

  // ---------- View / panels ----------
  const VIEW_LABEL = { original: 'Original', varnish: 'Sanded & varnished', paint: 'Painted', hardware: 'Handles & knobs', ai: 'AI suggestion' };

  function setView(v) {
    if (v === 'hardware') {
      // keep whatever finish was showing
      S.baseView = S.view === 'hardware' ? S.baseView : S.view;
    } else {
      S.baseView = null;
    }
    S.view = v;
    $$('.look').forEach((b) => b.classList.toggle('active', b.dataset.panel === v || (v !== 'hardware' && S.aiActive && b.dataset.panel === 'ai')));
    $$('.panel').forEach((p) => { p.hidden = p.dataset.for !== v; });
    if (v !== 'hardware' && S.tool === 'hw') setTool(null);
    if (v === 'hardware') {
      updateHwCount();
      showHint(S.items.length ? `Pick a style to change all ${S.items.length} handles at once` : 'Tap “Fix handle spots” to mark your handles', 3500);
    }
    updateBadge();
    renderFinish(); compose();
  }

  function updateBadge() {
    let label = VIEW_LABEL[S.view];
    if (S.view === 'hardware') {
      const base = S.baseView && S.baseView !== 'original' ? VIEW_LABEL[S.baseView] : 'Original';
      label = S.hw.kind === 'keep' ? base : base + ' + new handles';
    }
    if (S.aiActive && S.lastLook && S.view !== 'original') label = '🎲 ' + S.lastLook.name;
    $('#badge').textContent = label;
  }

  function setEditSpots(on) {
    if (on && (S.maskMode === 'add' || S.maskMode === 'erase')) setMaskMode('custom');
    setTool(on ? 'hw' : null);
    if (on) showHint('Tap a missed handle to add it · tap a circle to remove it', 4000);
    compose();
  }

  function setTool(t) {
    S.tool = t;
    const b = $('#editSpotsBtn');
    b.classList.toggle('primary', t === 'hw');
    b.textContent = t === 'hw' ? '✓ Done fixing spots' : '✏️ Fix handle spots';
    canvas.classList.toggle('tool', !!t);
  }

  let hintTimer;
  function showHint(text, ms) {
    const el = $('#hint'); el.textContent = text; el.hidden = false;
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { el.hidden = true; }, ms || 2500);
  }

  // ---------- Build controls ----------
  function buildSwatches() {
    const ss = $('#stainSwatches');
    STAINS.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (s.id === S.stain ? ' active' : '');
      b.innerHTML = `<i style="background:${s.swatch || s.color}"></i>${s.name}`;
      b.onclick = () => { S.stain = s.id; S.aiActive = false; markActive(ss, b); applyAndRender('varnish'); };
      ss.appendChild(b);
    });
    const ps = $('#paintSwatches');
    PAINTS.forEach((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (p.color === S.paint ? ' active' : '');
      b.dataset.color = p.color;
      b.innerHTML = `<i style="background:${p.color}"></i>${p.name}`;
      b.onclick = () => { S.paint = p.color; S.aiActive = false; markActive(ps, b); applyAndRender('paint'); };
      ps.appendChild(b);
    });
    const hk = $('#hwKinds');
    Object.entries(HW_KINDS).forEach(([id, k]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (id === S.hw.kind ? ' active' : ''); b.dataset.kind = id;
      const icon = document.createElement('canvas'); icon.width = 68; icon.height = 40;
      b.appendChild(icon); b.appendChild(document.createTextNode(k.name));
      b.onclick = () => {
        S.hw.kind = id; S.aiActive = false; markActive(hk, b); updateBadge(); compose();
        if (!S.items.length && id !== 'keep') showHint('No handles marked yet – tap “Fix handle spots”', 3500);
      };
      hk.appendChild(b);
    });
    const hf = $('#hwFinishes');
    Object.entries(HW_FINISHES).forEach(([id, f]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (id === S.hw.finish ? ' active' : ''); b.dataset.finish = id;
      b.innerHTML = `<i style="background:radial-gradient(circle at 35% 30%, ${f.hi}, ${f.base} 50%, ${f.lo})"></i>${f.name}`;
      b.onclick = () => { S.hw.finish = id; S.aiActive = false; markActive(hf, b); drawKindIcons(); updateBadge(); compose(); };
      hf.appendChild(b);
    });
    drawKindIcons();
  }

  function drawKindIcons() {
    $$('#hwKinds .chip').forEach((b) => {
      const c = b.querySelector('canvas').getContext('2d');
      c.clearRect(0, 0, 68, 40);
      const kind = b.dataset.kind;
      if (kind === 'keep') { c.font = '22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('↺', 34, 21); return; }
      if (kind === 'none') { c.strokeStyle = '#aaa'; c.lineWidth = 2; c.setLineDash([4, 3]); c.strokeRect(10, 8, 48, 24); return; }
      const s = { bar: 17, cup: 22, leather: 20, ring: 20, tbar: 30 }[kind] || 26;
      drawHardware(c, 34, kind === 'ring' ? 18 : 20, s, kind, S.hw.finish, 0);
    });
  }

  function markActive(container, btn) {
    container.querySelectorAll('.active').forEach((e) => e.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  function sheenName(v) { return v < 0.2 ? 'Matt' : v < 0.6 ? 'Satin' : 'Gloss'; }

  function applyAndRender(view) {
    if (S.view !== view) setView(view); else { updateBadge(); renderFinish(); compose(); }
  }

  // ---------- AI designer ----------
  const LOOKS = [
    { name: 'Mid-Century Revival', mode: 'varnish', stain: 'teak', sheen: 0.55, kind: 'bar', finish: 'brass', likes: { rich: 1, mid: 0.6 },
      why: 'A warm teak oil finish and slim brass bar pulls give that 1960s Danish feel – perfect for showing off the grain.' },
    { name: 'Scandi Light', mode: 'varnish', stain: 'lightoak', sheen: 0.15, kind: 'leather', finish: 'nickel', likes: { light: 1, rich: 0.3 },
      why: 'Sanded back to pale timber with a near-matt finish and leather strap handles – calm, natural and very Scandinavian.' },
    { name: 'Farmhouse Chalk', mode: 'paint', paint: '#ece6da', sheen: 0.08, grain: 0.6, kind: 'cup', finish: 'black', likes: { worn: 1, dark: 0.5 },
      why: 'Chalky white paint hides wear and tired timber, and black cup pulls add that country-kitchen charm.' },
    { name: 'Coastal Calm', mode: 'paint', paint: '#b3cfca', sheen: 0.3, grain: 0.35, kind: 'knob', finish: 'ceramic', likes: { worn: 0.6, light: 0.4 },
      why: 'Soft duck-egg blue with white ceramic knobs – fresh and breezy, lovely for a bedroom or bathroom.' },
    { name: 'Moody Modern', mode: 'paint', paint: '#22314f', sheen: 0.45, grain: 0.15, kind: 'knob', finish: 'brass', likes: { light: 0.6, worn: 0.6 },
      why: 'Deep navy with polished brass knobs makes a dramatic statement piece and covers any patchy wood.' },
    { name: 'Shaker Sage', mode: 'paint', paint: '#9aac87', sheen: 0.2, grain: 0.3, kind: 'knob', finish: 'wood', likes: { worn: 0.7, mid: 0.5 },
      why: 'Sage green with simple turned wooden knobs – a timeless Shaker look that suits almost any room.' },
    { name: 'Victorian Grandeur', mode: 'varnish', stain: 'mahogany', sheen: 0.85, kind: 'ring', finish: 'bronze', likes: { dark: 1, rich: 0.6 },
      why: 'Rich mahogany French-polish style gloss with antique bronze ring pulls brings out the heritage in older pieces.' },
    { name: 'Industrial Edge', mode: 'varnish', stain: 'ebony', sheen: 0.3, kind: 'tbar', finish: 'black', likes: { dark: 0.8, worn: 0.5 },
      why: 'An ebonised finish with matt black T-bar knobs – bold, urban and great at hiding marks.' },
    { name: 'Honey Heritage', mode: 'varnish', stain: 'honey', sheen: 0.5, kind: 'knob', finish: 'brass', likes: { mid: 1, rich: 0.8 },
      why: 'A classic honey oak varnish with brass knobs – the traditional restoration that lets good timber glow again.' },
    { name: 'Forest Retreat', mode: 'paint', paint: '#2f4a3a', sheen: 0.35, grain: 0.25, kind: 'bar', finish: 'copper', likes: { worn: 0.6, light: 0.5 },
      why: 'Deep forest green paired with copper bar pulls feels cosy and luxurious, especially against light walls.' },
    { name: 'Terracotta Boho', mode: 'paint', paint: '#b2603f', sheen: 0.12, grain: 0.45, kind: 'leather', finish: 'brass', likes: { mid: 0.5, worn: 0.4 },
      why: 'Earthy terracotta with leather pulls is warm and relaxed – great for a boho or Mediterranean scheme.' },
    { name: 'Handleless Minimal', mode: 'paint', paint: '#a9a8a1', sheen: 0.25, grain: 0.1, kind: 'none', finish: 'nickel', likes: { light: 0.4, worn: 0.4 },
      why: 'A smooth dove-grey with the handles removed (push-to-open catches) for a clean, contemporary look.' },
    { name: 'Walnut & Chrome', mode: 'varnish', stain: 'walnut', sheen: 0.6, kind: 'bar', finish: 'chrome', likes: { mid: 0.6, dark: 0.5 },
      why: 'Dark walnut with sleek chrome bar handles mixes warmth with a crisp modern edge.' },
  ];

  function analyse() {
    const st = maskStats();
    const f = {
      light: smooth(0.45, 0.65, st.mean),
      dark: 1 - smooth(0.2, 0.38, st.mean),
      mid: 1 - Math.abs(clamp((st.mean - 0.42) / 0.2, -1, 1)),
      rich: smooth(0.3, 0.55, st.sat),
      worn: Math.max(1 - smooth(0.2, 0.35, st.sat), smooth(0.03, 0.07, st.detail)),
    };
    return { st, f };
  }

  function describe(a) {
    const bits = [];
    if (a.f.dark > 0.6) bits.push('dark'); else if (a.f.light > 0.6) bits.push('light'); else bits.push('mid-toned');
    if (a.f.rich > 0.6) bits.push('richly coloured'); else if (a.st.sat < 0.25) bits.push('rather faded');
    const tone = bits.join(', ');
    const wear = a.f.worn > 0.6 ? ' with a fair bit of wear or uneven colour' : ' with decent-looking grain';
    return `Your piece looks ${tone}${wear}.`;
  }

  function suggest() {
    const a = analyse();
    const scored = LOOKS.map((l) => {
      let sc = 0.6;
      for (const [k, v] of Object.entries(l.likes)) sc += v * a.f[k] * 2;
      if (S.lastLook && l.name === S.lastLook.name) sc = 0;
      return { l, sc: sc * (0.6 + Math.random() * 0.8) };
    });
    const total = scored.reduce((t, x) => t + x.sc, 0);
    let r = Math.random() * total, look = scored[0].l;
    for (const x of scored) { r -= x.sc; if (r <= 0) { look = x.l; break; } }
    applyLook(look, a);
  }

  function applyLook(look, a) {
    S.lastLook = look; S.aiActive = true;
    if (look.mode === 'varnish') {
      S.stain = look.stain; S.varnishSheen = look.sheen;
      $('#varnishSheen').value = look.sheen * 100; $('#varnishSheenLbl').textContent = sheenName(look.sheen);
      markActive($('#stainSwatches'), $$('#stainSwatches .swatch')[STAINS.findIndex((s) => s.id === look.stain)]);
    } else {
      S.paint = look.paint; S.paintSheen = look.sheen; S.grain = look.grain;
      $('#paintSheen').value = look.sheen * 100; $('#paintSheenLbl').textContent = sheenName(look.sheen); $('#grain').value = look.grain * 100;
      markActive($('#paintSwatches'), $$('#paintSwatches .swatch').find((b) => b.dataset.color === look.paint));
      $('#customPaint').value = look.paint;
    }
    S.hw.kind = look.kind; S.hw.finish = look.finish;
    markActive($('#hwKinds'), $$('#hwKinds .chip').find((b) => b.dataset.kind === look.kind));
    markActive($('#hwFinishes'), $$('#hwFinishes .swatch').find((b) => b.dataset.finish === look.finish));
    drawKindIcons();

    const finishName = look.mode === 'varnish'
      ? `Sanded, ${STAINS.find((s) => s.id === look.stain).name.toLowerCase()} stain, ${sheenName(look.sheen).toLowerCase()} varnish`
      : `Painted ${PAINTS.find((p) => p.color === look.paint).name}, ${sheenName(look.sheen).toLowerCase()} finish`;
    const hwName = look.kind === 'none' ? 'Handles removed (push-to-open)' : `${HW_FINISHES[look.finish].name} ${HW_KINDS[look.kind].name.toLowerCase()}s`;
    $('#suggTitle').textContent = look.name;
    $('#suggWhy').textContent = describe(a) + ' ' + look.why;
    $('#suggSpec').innerHTML = `<li>${finishName}</li><li>${hwName}${S.items.length ? '' : ' – open <b>Handles &amp; Knobs</b> and tap <b>Fix handle spots</b> to mark your handles'}</li>`;
    $('#suggestion').hidden = false;

    S.view = look.mode; S.baseView = null;
    $$('.look').forEach((b) => b.classList.toggle('active', b.dataset.panel === 'ai'));
    $$('.panel').forEach((p) => { p.hidden = true; });
    if (S.tool === 'hw') setTool(null);
    updateBadge(); renderFinish(); compose();
  }

  // ---------- Sample image ----------
  function makeSample() {
    const w = 1000, h = 800, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    // wall + floor
    const wall = x.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#c9ccc8'); wall.addColorStop(1, '#b4b8b4');
    x.fillStyle = wall; x.fillRect(0, 0, w, h);
    x.fillStyle = '#8f9493'; x.fillRect(0, 690, w, 110);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(500, 700, 360, 22, 0, 0, Math.PI * 2); x.fill();
    // wood texture
    const wood = document.createElement('canvas'); wood.width = w; wood.height = h;
    const wx = wood.getContext('2d');
    wx.fillStyle = '#7d5634'; wx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h, amp = 2 + Math.random() * 6, fr = 0.004 + Math.random() * 0.01;
      wx.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,22,10' : '160,110,70'},${0.08 + Math.random() * 0.18})`;
      wx.lineWidth = 0.6 + Math.random() * 2.4; wx.beginPath();
      for (let xx = 0; xx <= w; xx += 8) wx.lineTo(xx, y + Math.sin(xx * fr + i) * amp);
      wx.stroke();
    }
    // wear patches & scratches
    for (let i = 0; i < 40; i++) {
      wx.fillStyle = `rgba(${Math.random() < 0.5 ? '150,120,90' : '50,35,25'},0.12)`;
      wx.beginPath(); wx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 8 + Math.random() * 25, Math.random() * 3, 0, Math.PI * 2); wx.fill();
    }
    for (let i = 0; i < 120; i++) {
      wx.strokeStyle = 'rgba(210,190,160,0.35)'; wx.lineWidth = 0.8; wx.beginPath();
      const sx = Math.random() * w, sy = Math.random() * h; wx.moveTo(sx, sy); wx.lineTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 20); wx.stroke();
    }
    const woodPat = x.createPattern(wood, 'no-repeat');
    // carcass
    x.fillStyle = woodPat; x.fillRect(160, 120, 680, 40); // top
    x.fillRect(180, 160, 640, 520);
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(180, 160, 640, 10);
    // legs
    x.fillStyle = woodPat; x.fillRect(195, 680, 40, 20); x.fillRect(765, 680, 40, 20);
    // drawers
    const rows = [[200, 180, 600, 150], [200, 345, 600, 150], [200, 510, 600, 150]];
    rows.forEach(([dx, dy, dw, dh]) => {
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(dx - 3, dy - 3, dw + 6, dh + 6);
      x.fillStyle = woodPat; x.fillRect(dx, dy, dw, dh);
      x.fillStyle = 'rgba(255,240,220,0.08)'; x.fillRect(dx, dy, dw, 6);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(dx, dy + dh - 6, dw, 6);
      // old knobs
      for (const kx of [dx + 150, dx + dw - 150]) {
        const ky = dy + dh / 2;
        x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.arc(kx + 3, ky + 5, 17, 0, Math.PI * 2); x.fill();
        const g = x.createRadialGradient(kx - 5, ky - 6, 2, kx, ky, 17); g.addColorStop(0, '#a08a5a'); g.addColorStop(1, '#4a3a20');
        x.fillStyle = g; x.beginPath(); x.arc(kx, ky, 16, 0, Math.PI * 2); x.fill();
      }
    });
    loadFromSrc(c.toDataURL('image/jpeg', 0.92));
    S.sampleKnobs = rows.flatMap(([dx, dy, dw, dh]) => [{ x: dx + 150, y: dy + dh / 2 }, { x: dx + dw - 150, y: dy + dh / 2 }]);
  }

  // ---------- Events ----------
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * S.w / r.width, y: (e.clientY - r.top) * S.h / r.height };
  }

  let painting = false, raf = 0, needFinish = false;
  function schedule(finish) {
    needFinish = needFinish || finish;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (needFinish) renderFinish(); needFinish = false; compose(); });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!S.w || !S.tool) return;
    const p = canvasPos(e);
    canvas.setPointerCapture(e.pointerId);
    if (S.tool === 'hw') {
      const k = hitItem(p);
      if (k >= 0) S.items.splice(k, 1);
      else { const o = hwUnit(); S.items.push({ x: p.x, y: p.y, rot: 0, ow: o, oh: o }); }
      updateHwCount(); schedule(false);
    } else {
      painting = true; paintMask(p); schedule(true);
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (painting) { paintMask(canvasPos(e)); schedule(true); }
  });
  const endPointer = () => { painting = false; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  $$('.look').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.panel;
    if (p === 'ai') { suggest(); return; }
    if (p !== 'hardware') { S.aiActive = false; $('#suggestion').hidden = true; }
    setView(p);
  }));
  $('#anotherBtn').onclick = suggest;

  $('#varnishSheen').oninput = (e) => { S.varnishSheen = e.target.value / 100; $('#varnishSheenLbl').textContent = sheenName(S.varnishSheen); S.aiActive = false; updateBadge(); schedule(true); };
  $('#paintSheen').oninput = (e) => { S.paintSheen = e.target.value / 100; $('#paintSheenLbl').textContent = sheenName(S.paintSheen); S.aiActive = false; updateBadge(); schedule(true); };
  $('#grain').oninput = (e) => { S.grain = e.target.value / 100; schedule(true); };
  $('#customPaint').oninput = (e) => { S.paint = e.target.value; S.aiActive = false; markActive($('#paintSwatches'), null); updateBadge(); schedule(true); };
  $('#hwSize').oninput = (e) => { S.hw.size = +e.target.value; schedule(false); };
  $('#hwCover').oninput = (e) => { S.hw.cover = e.target.value / 100; schedule(false); };
  $('#editSpotsBtn').onclick = () => setEditSpots(S.tool !== 'hw');
  $('#redetectBtn').onclick = () => { detectHardware(); compose(); showHint(S.items.length ? `Found ${S.items.length} handles` : 'No handles found – use Fix handle spots'); };
  $('#rotateAllBtn').onclick = () => { S.items.forEach((it) => { it.rot = it.rot ? 0 : 1; }); compose(); };
  $('#split').oninput = (e) => { S.split = e.target.value / 100; schedule(false); };
  $$('#maskModes .chip').forEach((c) => c.addEventListener('click', () => setMaskMode(c.dataset.mask)));
  $('#brush').oninput = (e) => { S.brush = +e.target.value; };
  $('#showMask').onchange = (e) => { S.showMask = e.target.checked; compose(); };
  $('.area').addEventListener('toggle', (e) => {
    if (!e.target.open && (S.tool === 'add' || S.tool === 'erase')) {
      setMaskMode('custom');
      S.showMask = false; $('#showMask').checked = false; compose();
    }
  });

  $('#downloadBtn').onclick = () => {
    compose(true);
    const a = document.createElement('a');
    a.download = 'refurb-preview.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    // Embedded pages and some phones block downloads: also show the image to long-press / right-click and save
    let embedded = false; try { embedded = window.self !== window.top; } catch (_) { embedded = true; }
    if (embedded || /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      $('#saveImg').src = a.href; $('#saveOverlay').hidden = false;
    } else a.click();
    compose();
  };
  $('#newBtn').onclick = () => { $('#file').value = ''; $('#editor').hidden = true; $('#uploadView').hidden = false; $('#suggestion').hidden = true; S.aiActive = false; };

  $('#file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    loadFile(f);
  });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; loadFile(f); });
  $('#sampleBtn').onclick = makeSample;
  $('#saveClose').onclick = () => { $('#saveOverlay').hidden = true; };

  buildSwatches();
  // inside an embedded viewer (e.g. the Claude app) the photo picker may be blocked: show a way out
  try { if (window.self !== window.top) $('#embedNote').hidden = false; } catch (_) { $('#embedNote').hidden = false; }

  // small hook for automated testing
  window.__refurb = { S, setView, suggest, compose, setMaskMode };
})();
