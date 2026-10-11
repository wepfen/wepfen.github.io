// GIF maker: tweets / videos / gifs / images -> Discord-ready GIF, with a tiny montage editor.
// Everything runs in the browser, nothing is uploaded.
import { GIFEncoder, quantize, applyPalette } from 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';

const $ = (id) => document.getElementById(id);
const MO = 1024 * 1024;

const ui = {
  url: $('gif-url'), go: $('gif-go'), drop: $('gif-drop'), file: $('gif-file'),
  status: $('gif-status'), picker: $('gif-picker'), workspace: $('gif-workspace'),
  canvas: $('gif-canvas'), play: $('gif-play'), scrub: $('gif-scrub'), time: $('gif-time'),
  clips: $('gif-clips'), clear: $('gif-clear'),
  width: $('gif-width'), aspect: $('gif-aspect'), fit: $('gif-fit'), bg: $('gif-bg'),
  fps: $('gif-fps'), colors: $('gif-colors'), limit: $('gif-limit'), auto: $('gif-auto'),
  fadeIn: $('gif-fade-in'), fadeOut: $('gif-fade-out'), boomerang: $('gif-boomerang'),
  make: $('gif-make'), cancel: $('gif-cancel'), progress: $('gif-progress'),
  result: $('gif-result'), out: $('gif-out'), outInfo: $('gif-out-info'), download: $('gif-download'),
};

const EFFECTS = {
  none: 'None', zoomin: 'Zoom in', zoomout: 'Zoom out', panright: 'Pan →', panleft: 'Pan ←',
  shake: 'Shake', bounce: 'Bounce', spin: 'Spin',
};
const FILTERS = {
  none: ['None', () => 'none'],
  bw: ['Black & white', () => 'grayscale(1)'],
  sepia: ['Sepia', () => 'sepia(1)'],
  fried: ['Deep fried', () => 'saturate(4) contrast(1.8) brightness(1.1)'],
  invert: ['Invert', () => 'invert(1)'],
  blur: ['Blur', () => 'blur(2px)'],
  rainbow: ['Rainbow', (q) => `hue-rotate(${Math.round(q * 360)}deg) saturate(1.5)`],
};
const TRANSITIONS = {
  cut: 'Cut', crossfade: 'Crossfade', black: 'Fade through black', white: 'Fade through white',
  slide: 'Slide ←', slideup: 'Slide ↑', wipe: 'Wipe', circle: 'Circle', zoom: 'Zoom',
};

// clip: { id, name, kind: 'video'|'frames', el?, frames?, width, height, srcDuration,
//         start, end, still, speed, effect, filter, top, bottom, transition, transDur, card }
const clips = [];
let nextId = 1;
let outUrl = null;
let cancelled = false;
let encoding = false;

function status(msg, isError = false) {
  ui.status.textContent = msg;
  ui.status.classList.toggle('gif-error', isError);
}

const fmtSize = (b) => (b >= MO ? (b / MO).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB');
const round2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (p) => p * p * (3 - 2 * p);
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function baseName(name) {
  return (name || 'gif').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60) || 'gif';
}

// ---------- Fetching from URLs ----------

const TWEET_RE = /(?:twitter|x|fxtwitter|vxtwitter|fixupx|fixvx|nitter\.[a-z.]+)\.com\/(?:[^/]+|i)\/status(?:es)?\/(\d+)/i;
const GIPHY_RE = /giphy\.com\/(?:gifs\/(?:[\w-]*-)?|media\/(?:v1\.[^/]+\/)?|embed\/)([a-zA-Z0-9]+)/;

async function fetchBlob(url) {
  let res;
  try {
    // twimg rejects requests whose Referer isn't twitter
    res = await fetch(url, { referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('That site blocks downloads from the browser (CORS). Download the file and drop it here instead.');
  }
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  return res.blob();
}

async function loadFromUrl(raw) {
  const url = raw.trim();
  if (!url) return;
  ui.picker.innerHTML = '';

  const tweet = url.match(TWEET_RE);
  if (tweet) return loadTweet(tweet[1]);

  const giphy = url.match(GIPHY_RE);
  if (giphy) {
    status('Fetching Giphy GIF…');
    return addBlob(await fetchBlob(`https://media.giphy.com/media/${giphy[1]}/giphy.mp4`), `giphy-${giphy[1]}`);
  }

  const direct = url.replace(/^(https?:\/\/i\.imgur\.com\/\w+)\.gifv$/i, '$1.mp4');
  status('Downloading…');
  return addBlob(await fetchBlob(direct), decodeURIComponent(new URL(direct).pathname.split('/').pop()));
}

async function loadTweet(id) {
  status('Fetching tweet…');
  const res = await fetch(`https://api.fxtwitter.com/status/${id}`);
  const data = await res.json().catch(() => null);
  if (!data || data.code !== 200) {
    throw new Error(data?.message === 'NOT_FOUND' ? 'Tweet not found (deleted or private?).' : "Couldn't fetch the tweet.");
  }

  const media = (data.tweet.media?.all || []).filter((m) => ['gif', 'video', 'photo'].includes(m.type));
  if (!media.length) throw new Error('No media in this tweet.');

  const add = async (m, i) => {
    status(`Downloading media${media.length > 1 ? ` ${i + 1}/${media.length}` : ''}…`);
    const suffix = media.length > 1 ? `-${i + 1}` : '';
    await addBlob(await fetchBlob(bestUrl(m)), `tweet-${id}${suffix}`);
  };

  if (media.length === 1) return add(media[0], 0);

  status(`${media.length} media in this tweet, pick which ones to add:`);
  media.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `<img src="${esc(m.thumbnail_url || m.url)}" alt="${m.type} ${i + 1}"><span>+ ${m.type}</span>`;
    btn.onclick = () => run(() => add(m, i));
    ui.picker.appendChild(btn);
  });
  const all = document.createElement('button');
  all.type = 'button';
  all.textContent = '+ add all';
  all.onclick = () => run(async () => {
    for (let i = 0; i < media.length; i++) await add(media[i], i);
  });
  ui.picker.appendChild(all);
}

// best mp4 variant without grabbing something huge for nothing
function bestUrl(m) {
  if (m.type !== 'video') return m.url;
  const mp4 = (m.variants || []).filter((v) => v.content_type === 'video/mp4').sort((a, b) => b.bitrate - a.bitrate);
  return (mp4.find((v) => v.bitrate <= 2_200_000) || mp4[mp4.length - 1] || m).url;
}

// ---------- Loading files into clips ----------

async function sniff(blob) {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const str = String.fromCharCode(...head);
  if (str.startsWith('GIF8')) return 'image/gif';
  if (head[0] === 0x89 && str.slice(1, 4) === 'PNG') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (str.startsWith('RIFF') && str.slice(8, 12) === 'WEBP') return 'image/webp';
  return blob.type || 'video/mp4';
}

async function addBlob(blob, name) {
  const type = await sniff(blob);
  const media = type.startsWith('image/') ? await decodeImage(blob, type) : await loadVideo(blob);
  const animated = media.srcDuration > 0;
  const clip = {
    id: nextId++, name: baseName(name), ...media,
    start: 0, end: animated ? round2(Math.min(media.srcDuration, 10)) : 0, still: 2,
    speed: 1, effect: 'none', filter: 'none', top: '', bottom: '',
    transition: 'crossfade', transDur: 0.5,
  };
  if (!clips.length) ui.width.value = String(pickWidth(clip.width));
  clips.push(clip);
  buildCard(clip);
  refresh();
  status(`Added ${clip.name}. Add more clips to make a montage, or hit "Make GIF".`);
}

function loadVideo(blob) {
  status('Reading video…');
  const el = document.createElement('video');
  el.muted = true;
  el.loop = true;
  el.playsInline = true;
  el.controls = true;
  el.preload = 'auto';
  return new Promise((resolve, reject) => {
    el.onloadeddata = () => resolve({ kind: 'video', el, width: el.videoWidth, height: el.videoHeight, srcDuration: el.duration });
    el.onerror = () => reject(new Error("Your browser can't read this video (unsupported format?)."));
    el.src = URL.createObjectURL(blob);
  });
}

async function decodeImage(blob, type) {
  status('Decoding image…');
  if ('ImageDecoder' in window && (await ImageDecoder.isTypeSupported(type))) {
    const dec = new ImageDecoder({ data: blob.stream(), type });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount || 1;
    const frames = [];
    let t = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      // duration is in µs; browsers play 0 or 10ms GIF frames at 100ms
      let d = (image.duration || 0) / 1e6;
      if (count > 1 && d <= 0.01) d = 0.1;
      frames.push({ bitmap: await createImageBitmap(image), start: t });
      t += d;
      image.close();
    }
    dec.close();
    const { width, height } = frames[0].bitmap;
    return { kind: 'frames', frames, width, height, srcDuration: count > 1 ? t : 0 };
  }
  if (type === 'image/gif') throw new Error("Your browser can't decode animated GIFs (try Chrome or Edge).");
  const bitmap = await createImageBitmap(blob);
  return { kind: 'frames', frames: [{ bitmap, start: 0 }], width: bitmap.width, height: bitmap.height, srcDuration: 0 };
}

function removeClip(clip) {
  clips.splice(clips.indexOf(clip), 1);
  clip.card.remove();
  if (clip.kind === 'video') URL.revokeObjectURL(clip.el.src);
  else if (!clips.some((c) => c.frames === clip.frames)) clip.frames.forEach((f) => f.bitmap.close?.());
  refresh();
}

function pickWidth(srcW) {
  const opts = [...ui.width.options].map((o) => +o.value).filter(Boolean);
  const fit = opts.filter((w) => w <= Math.min(srcW, 320));
  return fit.length ? Math.max(...fit) : 0;
}

function paintScrub() {
  const max = +ui.scrub.max || 1;
  ui.scrub.style.setProperty('--fill', `${(ui.scrub.value / max) * 100}%`);
}

// ---------- Clip cards ----------

const options = (map, sel) => Object.entries(map)
  .map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${Array.isArray(v) ? v[0] : v}</option>`).join('');

function buildCard(c) {
  const animated = c.srcDuration > 0;
  const card = document.createElement('div');
  card.className = 'gif-clip';
  card.innerHTML = `
    <div class="gif-clip-head">
      <div class="gif-clip-media"></div>
      <div class="gif-clip-title">
        <input class="gif-clip-name" data-k="name" type="text" value="${esc(c.name)}" title="Rename clip" aria-label="Clip name">
        <small>${c.kind === 'video' ? 'video' : animated ? 'GIF' : 'image'} ${c.width}×${c.height}${animated ? `, ${round2(c.srcDuration)} s` : ''}</small>
      </div>
      <div class="gif-clip-tools">
        <button type="button" data-act="up" title="Move up">↑</button>
        <button type="button" data-act="down" title="Move down">↓</button>
        <button type="button" data-act="dup" title="Duplicate">⧉</button>
        <button type="button" data-act="del" title="Remove">✕</button>
      </div>
    </div>
    <div class="gif-settings">
      ${animated ? `
      <label>Start (s)<span class="gif-row"><input data-k="start" type="number" min="0" max="${round2(c.srcDuration)}" step="0.1" value="${c.start}">${c.kind === 'video' ? '<button type="button" data-act="here-start">= here</button>' : ''}</span></label>
      <label>End (s)<span class="gif-row"><input data-k="end" type="number" min="0" max="${round2(c.srcDuration)}" step="0.1" value="${c.end}">${c.kind === 'video' ? '<button type="button" data-act="here-end">= here</button>' : ''}</span></label>
      <label>Speed<select data-k="speed">${options({ 0.5: 'x0.5', 1: 'x1', 1.5: 'x1.5', 2: 'x2', 3: 'x3' }, String(c.speed))}</select></label>
      ` : `
      <label>Duration (s)<input data-k="still" type="number" min="0.1" step="0.1" value="${c.still}"></label>
      `}
      <label>Effect<select data-k="effect">${options(EFFECTS, c.effect)}</select></label>
      <label>Filter<select data-k="filter">${options(FILTERS, c.filter)}</select></label>
      <label>Top text<input data-k="top" type="text" value="${esc(c.top)}" placeholder="meme text"></label>
      <label>Bottom text<input data-k="bottom" type="text" value="${esc(c.bottom)}" placeholder="meme text"></label>
    </div>
    <div class="gif-transition gif-row">
      ↓ Transition to next clip:
      <select data-k="transition">${options(TRANSITIONS, c.transition)}</select>
      <input data-k="transDur" type="number" min="0.1" max="3" step="0.1" value="${c.transDur}"> s
    </div>`;

  card.querySelector('.gif-clip-media').appendChild(c.kind === 'video' ? c.el : thumb(c));

  card.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = e.target.value;
    c[k] = ['name', 'top', 'bottom', 'effect', 'filter', 'transition'].includes(k) ? v : +v || 0;
    refresh();
  });
  card.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act || encoding) return;
    const i = clips.indexOf(c);
    if (act === 'del') return removeClip(c);
    if (act === 'dup') return run(duplicate(c, i));
    if (act === 'up' && i > 0) [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]];
    if (act === 'down' && i < clips.length - 1) [clips[i + 1], clips[i]] = [clips[i], clips[i + 1]];
    if (act === 'here-start' || act === 'here-end') {
      const k = act === 'here-start' ? 'start' : 'end';
      c[k] = round2(c.el.currentTime);
      card.querySelector(`[data-k="${k}"]`).value = c[k];
    }
    refresh();
  });
  c.card = card;
}

function duplicate(c, i) {
  return async () => {
    const copy = { ...c, id: nextId++, card: null };
    if (c.kind === 'video') {
      // a crossfade between two copies needs two separate decoders
      Object.assign(copy, await loadVideo(await (await fetch(c.el.src)).blob()));
    }
    clips.splice(i + 1, 0, copy);
    buildCard(copy);
    refresh();
    status('');
  };
}

function thumb(c) {
  const cv = document.createElement('canvas');
  const bmp = c.frames[0].bitmap;
  cv.width = bmp.width;
  cv.height = bmp.height;
  cv.getContext('2d').drawImage(bmp, 0, 0);
  return cv;
}

// ---------- Timeline ----------

function clipDuration(c) {
  return c.srcDuration > 0 ? Math.max(0.05, (Math.max(c.end, c.start + 0.05) - c.start) / c.speed) : Math.max(0.1, c.still);
}

// each clip overlaps the previous one by the transition length
function timeline() {
  const items = [];
  clips.forEach((c, i) => {
    const d = clipDuration(c);
    let start = 0, transIn = 0, typeIn = 'cut';
    if (i > 0) {
      const prev = items[i - 1];
      typeIn = prev.c.transition;
      if (typeIn !== 'cut') transIn = Math.min(prev.c.transDur, prev.d / 2, d / 2);
      start = prev.start + prev.d - transIn;
    }
    items.push({ c, d, start, transIn, typeIn });
  });
  const last = items[items.length - 1];
  return { items, total: last ? last.start + last.d : 0 };
}

// a single still image with nothing moving -> 1-frame GIF
function isStatic(o) {
  if (clips.length !== 1 || o.fadeIn || o.fadeOut) return false;
  const c = clips[0];
  return c.srcDuration === 0 && c.effect === 'none' && c.filter !== 'rainbow';
}

function refresh() {
  ui.workspace.hidden = clips.length === 0;
  ui.result.hidden = true;
  clips.forEach((c, i) => {
    ui.clips.appendChild(c.card);
    c.card.querySelector('.gif-transition').hidden = i === clips.length - 1;
  });
  if (!clips.length) return;
  const { total } = timeline();
  ui.scrub.max = total;
  previewT = Math.min(previewT, total);
  ui.scrub.value = previewT; paintScrub();
  schedulePreview();
}

// ---------- Rendering ----------

const layerA = document.createElement('canvas');
const layerB = document.createElement('canvas');

function ctxOf(cv, W, H) {
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  return cv.getContext('2d', { willReadFrequently: true });
}

function paintBg(ctx, W, H, bg) {
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bg === 'transparent') ctx.clearRect(0, 0, W, H);
  else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }
}

function srcTime(c, local) {
  return c.srcDuration > 0 ? Math.min(c.start + local * c.speed, c.srcDuration - 0.001) : 0;
}

function seek(el, t) {
  if (Math.abs(el.currentTime - t) < 1e-3 && !el.seeking && el.readyState >= 2) return;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('A video stopped responding, try re-adding it.')), 5000);
    el.addEventListener('seeked', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    el.currentTime = t;
  });
}

function frameAt(frames, t) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return frames[lo].bitmap;
}

function drawClip(ctx, it, local, W, H, o) {
  const c = it.c;
  const q = clamp(local / it.d, 0, 1);
  const img = c.kind === 'video' ? c.el : frameAt(c.frames, srcTime(c, local));
  const r = o.fit === 'cover' ? Math.max(W / c.width, H / c.height) : Math.min(W / c.width, H / c.height);
  const dw = c.width * r, dh = c.height * r;

  let s = 1, dx = 0, dy = 0, rot = 0;
  switch (c.effect) {
    case 'zoomin': s = 1 + 0.3 * ease(q); break;
    case 'zoomout': s = 1.3 - 0.3 * ease(q); break;
    case 'panright': s = 1.25; dx = (q - 0.5) * -dw * 0.25; break;
    case 'panleft': s = 1.25; dx = (q - 0.5) * dw * 0.25; break;
    case 'shake': s = 1.08; dx = (Math.sin(local * 53) + Math.sin(local * 31)) * W * 0.012; dy = Math.sin(local * 41) * H * 0.015; break;
    case 'bounce': s = 1 + 0.12 * Math.abs(Math.sin(q * Math.PI * 3)); break;
    case 'spin': rot = ease(q) * Math.PI * 2; break;
  }

  ctx.save();
  ctx.filter = FILTERS[c.filter][1](q);
  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  caption(ctx, c.top, 'top', W, H);
  caption(ctx, c.bottom, 'bottom', W, H);
}

function caption(ctx, text, pos, W, H) {
  text = text.trim().toUpperCase();
  if (!text) return;
  let size = Math.round(H * 0.14);
  const font = () => `bold ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif`;
  ctx.font = font();
  while (size > 8 && ctx.measureText(text).width > W * 0.94) {
    size--;
    ctx.font = font();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = pos === 'top' ? 'top' : 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  const y = pos === 'top' ? H * 0.03 : H * 0.97;
  ctx.strokeText(text, W / 2, y);
  ctx.fillText(text, W / 2, y);
}

function composite(ctx, A, B, type, p, W, H, bg) {
  const e = ease(p);
  switch (type) {
    case 'crossfade':
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      break;
    case 'black':
    case 'white':
      ctx.drawImage(p < 0.5 ? A : B, 0, 0);
      ctx.globalAlpha = 1 - Math.abs(1 - 2 * p);
      ctx.fillStyle = type;
      ctx.fillRect(0, 0, W, H);
      break;
    case 'slide':
      ctx.drawImage(A, -e * W, 0);
      ctx.drawImage(B, (1 - e) * W, 0);
      break;
    case 'slideup':
      ctx.drawImage(A, 0, -e * H);
      ctx.drawImage(B, 0, (1 - e) * H);
      break;
    case 'wipe':
      ctx.drawImage(A, 0, 0);
      if (e > 0) ctx.drawImage(B, 0, 0, e * W, H, 0, 0, e * W, H);
      break;
    case 'circle':
      ctx.drawImage(A, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, (e * Math.hypot(W, H)) / 2, 0, Math.PI * 2);
      ctx.clip();
      if (bg === 'transparent') ctx.clearRect(0, 0, W, H);
      ctx.drawImage(B, 0, 0);
      ctx.restore();
      break;
    case 'zoom': {
      ctx.drawImage(A, 0, 0);
      const s = 0.4 + 0.6 * e;
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.drawImage(B, (W * (1 - s)) / 2, (H * (1 - s)) / 2, W * s, H * s);
      break;
    }
    default:
      ctx.drawImage(B, 0, 0);
  }
  ctx.globalAlpha = 1;
}

async function renderAt(ctx, T, o) {
  const { W, H, bg } = o;
  const { items, total } = timeline();
  let active = items.filter((it) => T >= it.start && T < it.start + it.d);
  if (!active.length) active = [items[items.length - 1]];

  await Promise.all(active.filter((it) => it.c.kind === 'video').map((it) => seek(it.c.el, srcTime(it.c, T - it.start))));

  paintBg(ctx, W, H, bg);
  if (active.length === 1) {
    drawClip(ctx, active[0], T - active[0].start, W, H, o);
  } else {
    const [a, b] = active;
    const la = ctxOf(layerA, W, H), lb = ctxOf(layerB, W, H);
    paintBg(la, W, H, bg);
    drawClip(la, a, T - a.start, W, H, o);
    paintBg(lb, W, H, bg);
    drawClip(lb, b, T - b.start, W, H, o);
    composite(ctx, layerA, layerB, b.typeIn, clamp((T - b.start) / b.transIn, 0, 1), W, H, bg);
  }

  // global fades from/to black (or white on a white background)
  const fd = Math.min(0.5, total / 3);
  let veil = 0;
  if (o.fadeIn && T < fd) veil = 1 - T / fd;
  if (o.fadeOut && T > total - fd) veil = Math.max(veil, (T - (total - fd)) / fd);
  if (veil > 0) {
    ctx.globalAlpha = veil;
    ctx.fillStyle = bg === 'white' ? 'white' : 'black';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// ---------- Live preview ----------

const pctx = ui.canvas.getContext('2d', { willReadFrequently: true });
let previewT = 0;
let previewBusy = false;
let previewDirty = false;
let playing = false;

async function drawPreview() {
  if (encoding || !clips.length) return;
  if (previewBusy) {
    previewDirty = true;
    return;
  }
  previewBusy = true;
  try {
    do {
      previewDirty = false;
      const o = readOptions();
      const { total } = timeline();
      ctxOf(ui.canvas, o.W, o.H);
      await renderAt(pctx, Math.min(previewT, total - 1e-3), o);
      ui.time.textContent = `${previewT.toFixed(1)} / ${total.toFixed(1)} s`;
    } while (previewDirty && !playing);
  } catch (e) {
    status(e.message, true);
  } finally {
    previewBusy = false;
  }
}

function schedulePreview() {
  if (!playing) drawPreview();
}

async function playLoop() {
  let last = performance.now();
  while (playing && clips.length) {
    const now = performance.now();
    previewT += (now - last) / 1000;
    last = now;
    if (previewT >= timeline().total) previewT = 0;
    ui.scrub.value = previewT; paintScrub();
    await drawPreview();
    await new Promise(requestAnimationFrame);
  }
}

function setPlaying(on) {
  playing = on;
  ui.play.textContent = on ? '❚❚ Pause' : '▶ Play';
  if (on) {
    clips.forEach((c) => c.el?.pause());
    playLoop();
  }
}

ui.play.onclick = () => setPlaying(!playing);
ui.scrub.addEventListener('input', () => {
  previewT = +ui.scrub.value;
  paintScrub();
  schedulePreview();
});

// ---------- Encoding ----------

function readOptions() {
  const first = clips[0];
  const [aw, ah] = ui.aspect.value === 'auto' ? [first.width, first.height] : ui.aspect.value.split(':').map(Number);
  const aspect = aw / ah;
  const W = Math.max(16, Math.round(+ui.width.value || Math.min(first.width, 1280)));
  return {
    W, H: Math.max(16, Math.round(W / aspect)), aspect,
    fit: ui.fit.value,
    bg: ui.bg.value,
    fps: +ui.fps.value,
    colors: +ui.colors.value,
    limit: +ui.limit.value * MO,
    fadeIn: ui.fadeIn.checked,
    fadeOut: ui.fadeOut.checked,
    boomerang: ui.boomerang.checked,
  };
}

async function encode(o, onFrame) {
  const canvas = document.createElement('canvas');
  const ctx = ctxOf(canvas, o.W, o.H);
  const { total } = timeline();
  const times = [];
  if (isStatic(o)) times.push(0);
  else for (let t = 0; t < total - 1e-6; t += 1 / o.fps) times.push(t);

  const delay = Math.round(1000 / o.fps);
  const alpha = o.bg === 'transparent';
  const format = alpha ? 'rgba4444' : 'rgb565';
  const gif = GIFEncoder();
  const kept = [];

  for (let i = 0; i < times.length; i++) {
    if (cancelled) throw new Error('Cancelled.');
    await renderAt(ctx, times[i], o);
    const { data } = ctx.getImageData(0, 0, o.W, o.H);
    const palette = quantize(data, o.colors, { format, oneBitAlpha: alpha });
    const index = applyPalette(data, palette, format);
    const frame = { index, palette, transparentIndex: alpha ? palette.findIndex((c) => c[3] === 0) : -1 };
    writeFrame(gif, frame, o, delay);
    if (o.boomerang) kept.push(frame);
    onFrame(i + 1, times.length);
    // let the UI breathe
    if (i % 4 === 3) await new Promise((r) => setTimeout(r));
  }
  for (let i = kept.length - 2; i > 0; i--) writeFrame(gif, kept[i], o, delay);

  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), frames: times.length + Math.max(0, kept.length - 2) };
}

function writeFrame(gif, f, o, delay) {
  const transparent = f.transparentIndex >= 0;
  gif.writeFrame(f.index, o.W, o.H, {
    palette: f.palette, delay, repeat: 0,
    transparent, transparentIndex: transparent ? f.transparentIndex : 0,
    dispose: transparent ? 2 : -1,
  });
}

async function make() {
  const o = readOptions();
  const auto = ui.auto.checked && o.limit > 0;
  let result;
  let retries = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const label = attempt ? `Retry ${attempt} (${o.W}px, ${o.fps} fps, ${o.colors} colors)` : 'Encoding';
    result = await encode(o, (i, n) => {
      ui.progress.value = i / n;
      status(`${label}: frame ${i}/${n}`);
    });
    if (!auto || result.blob.size <= o.limit) break;

    // too big: mostly shrink the size, a bit the fps, then the colors
    const ratio = (o.limit / result.blob.size) * 0.92;
    const prev = { W: o.W, fps: o.fps };
    o.W = Math.max(120, Math.floor(o.W * Math.pow(ratio, 0.35)));
    o.H = Math.max(16, Math.round(o.W / o.aspect));
    o.fps = Math.max(8, Math.floor(o.fps * Math.pow(ratio, 0.3)));
    if (o.W === prev.W && o.fps === prev.fps) {
      if (o.colors <= 32) break;
      o.colors = Math.max(32, o.colors >> 1);
    }
    retries++;
  }
  return { ...result, o, retries };
}

function showResult({ blob, frames, o, retries }) {
  if (outUrl) URL.revokeObjectURL(outUrl);
  outUrl = URL.createObjectURL(blob);
  ui.out.src = outUrl;
  ui.download.href = outUrl;
  ui.download.download = `${clips.length > 1 ? 'montage' : clips[0].name}.gif`;
  ui.result.hidden = false;

  const tooBig = o.limit > 0 && blob.size > o.limit;
  let txt = `${fmtSize(blob.size)} · ${o.W}×${o.H}`;
  if (frames > 1) txt += ` · ${frames} frames · ${o.fps} fps`;
  if (retries) txt += ` · auto-shrunk (${retries} extra pass${retries > 1 ? 'es' : ''})`;
  if (tooBig) txt += ' · ⚠️ still over the limit, try a shorter clip';
  ui.outInfo.textContent = txt;
  ui.outInfo.classList.toggle('gif-error', tooBig);
  status(tooBig ? 'Done, but too heavy.' : 'Done! Download it and drop it on Discord.');
  ui.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Wiring ----------

async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    status(e.message || String(e), true);
  }
}

ui.make.onclick = () => run(async () => {
  if (!clips.length) return;
  setPlaying(false);
  encoding = true;
  cancelled = false;
  ui.make.disabled = true;
  ui.cancel.hidden = false;
  ui.progress.hidden = false;
  try {
    while (previewBusy) await new Promise((r) => setTimeout(r, 20));
    clips.forEach((c) => c.el?.pause());
    showResult(await make());
  } finally {
    encoding = false;
    ui.make.disabled = false;
    ui.cancel.hidden = true;
    ui.progress.hidden = true;
  }
});
ui.cancel.onclick = () => (cancelled = true);

ui.clear.onclick = () => {
  if (encoding) return;
  setPlaying(false);
  [...clips].forEach(removeClip);
  ui.picker.innerHTML = '';
  status('');
};

for (const el of [ui.width, ui.aspect, ui.fit, ui.bg, ui.fadeIn, ui.fadeOut]) el.addEventListener('input', schedulePreview);

ui.go.onclick = () => run(() => loadFromUrl(ui.url.value));
ui.url.addEventListener('keydown', (e) => e.key === 'Enter' && ui.go.click());

async function addFiles(files) {
  for (const f of files) await addBlob(f, f.name || 'pasted');
}

ui.file.onchange = () => run(async () => {
  await addFiles([...ui.file.files]);
  ui.file.value = '';
});

ui.drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.drop.classList.add('gif-over');
});
ui.drop.addEventListener('dragleave', () => ui.drop.classList.remove('gif-over'));
ui.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.drop.classList.remove('gif-over');
  const files = [...e.dataTransfer.files];
  if (files.length) return run(() => addFiles(files));
  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (text) {
    ui.url.value = text.split('\n')[0];
    run(() => loadFromUrl(ui.url.value));
  }
});

// Ctrl+V a file or a link anywhere on the page
document.addEventListener('paste', (e) => {
  const files = [...e.clipboardData.files];
  if (files.length) {
    e.preventDefault();
    return run(() => addFiles(files));
  }
  if (e.target instanceof HTMLInputElement) return;
  const text = e.clipboardData.getData('text').trim();
  if (/^https?:\/\//.test(text)) {
    e.preventDefault();
    ui.url.value = text;
    run(() => loadFromUrl(text));
  }
});

// ?url=... to share a direct link
const param = new URLSearchParams(location.search).get('url');
if (param) {
  ui.url.value = param;
  run(() => loadFromUrl(param));
}
