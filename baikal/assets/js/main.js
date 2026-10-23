import { createScene } from './scene.js';
import { createSound } from './sound.js';

const root = document.documentElement;
root.classList.add('js');

const H = 0.36; // линия горизонта, как в шейдере
const TAU = Math.PI * 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?capture — режим записи превью: кадры шагают по виртуальному времени
const capture = new URLSearchParams(location.search).has('capture');
let virtualNow = 0;
const clockNow = () => (capture ? virtualNow : performance.now());

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const notes = $('#sky-notes');
const nctx = notes.getContext('2d');

const scene = createScene(canvas);
if (!scene) root.classList.add('no-gl');
const sound = createSound();

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const pad = (n) => String(n).padStart(2, '0');

function fmtHour(h) {
  const total = Math.round(h * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

// Солнце: мартовский день на 53° с. ш., восход около 06:50, закат около 19:10
function sunAt(hour, aspect) {
  const ang = (TAU * (hour - 13)) / 24;
  const elev = 0.63 * Math.cos(ang) + 0.033;
  const x = Math.sin(ang) * Math.min(0.9, aspect * 0.5 * 0.88);
  return { elev, pos: [x, H + elev * 0.62] };
}

/* ---------- скролл = время ---------- */

const chapters = [...document.querySelectorAll('.chapter')];
let anchors = [];

function measure() {
  anchors = chapters.map((el) => ({
    y: el.offsetTop + Math.min(el.offsetHeight * 0.5, innerHeight * 0.75),
    hour: parseFloat(el.dataset.hour),
    el,
  }));
}

function hourAt(y) {
  if (y <= anchors[0].y) return anchors[0].hour;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.hour + (b.hour - a.hour) * (t * t * (3 - 2 * t));
    }
  }
  return anchors[anchors.length - 1].hour;
}

function scrollForHour(h) {
  if (h <= anchors[0].hour) return anchors[0].y - innerHeight / 2;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (h <= b.hour) {
      // обратная к smoothstep: решаем 3t² − 2t³ = s
      const s = (h - a.hour) / (b.hour - a.hour);
      const t = 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);
      return a.y + (b.y - a.y) * t - innerHeight / 2;
    }
  }
  return anchors[anchors.length - 1].y - innerHeight / 2;
}

function chapterAt(y) {
  let current = anchors[0];
  for (const a of anchors) if (a.el.offsetTop <= y) current = a;
  return current.el;
}

/* ---------- состояние ---------- */

const state = {
  time: 0,
  hour: 6,
  sun: [0, 0],
  elev: 0,
  night: 0,
  aurora: 0,
  mouse: [0, 0.2],
  mouseOn: 0,
  cracks: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, t: -100 })),
};
let crackSlot = 0;
let targetHour = 6;
const pointer = { x: 0.5, y: 0.7, active: false, last: 0 };

/* ---------- курсор и клики ---------- */

function toScene(clientX, clientY) {
  const aspect = innerWidth / innerHeight;
  return [(clientX / innerWidth - 0.5) * aspect, 1 - clientY / innerHeight];
}

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  pointer.last = performance.now();
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.active = false; });

const userStars = [];
const links = [];

addEventListener('click', (e) => {
  if (e.target.closest('a, button, .dial, .hud')) return;
  const [x, y] = toScene(e.clientX, e.clientY);
  if (y < H - 0.005) {
    const slot = state.cracks[crackSlot];
    slot.x = x; slot.y = y; slot.t = state.time;
    crackSlot = (crackSlot + 1) % 4;
    sound.crack();
  } else if (state.night > 0.5 && y > H + 0.03) {
    addStar(e.clientX / innerWidth, e.clientY / innerHeight);
  }
});

/* ---------- созвездие пользователя ---------- */

const starCount = $('#star-count');
const clearBtn = $('#clear-stars');

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function addStar(u, v) {
  const star = { u, v, born: state.time, seed: Math.random() * 10 };
  if (userStars.length) {
    // соединяем с ближайшей звездой — так и складывается фигура
    let best = null;
    let bestD = Infinity;
    for (const s of userStars) {
      const d = Math.hypot((s.u - u) * innerWidth, (s.v - v) * innerHeight);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (bestD < Math.max(innerWidth, innerHeight) * 0.35) links.push([best, star]);
  }
  userStars.push(star);
  sound.chime();
  const n = userStars.length;
  starCount.textContent = `В вашем созвездии ${n} ${plural(n, 'звезда', 'звезды', 'звёзд')}`;
  clearBtn.hidden = false;
}

clearBtn.addEventListener('click', () => {
  userStars.length = 0;
  links.length = 0;
  starCount.textContent = 'Пока ни одной звезды';
  clearBtn.hidden = true;
});

function sizeNotes() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  notes.width = Math.round(innerWidth * dpr);
  notes.height = Math.round(innerHeight * dpr);
  nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStars(ctx, w, h, vis, t) {
  if (vis <= 0.01 || !userStars.length) return;
  ctx.save();
  ctx.lineWidth = 1;
  for (const [a, b] of links) {
    const grow = clamp((t - b.born) / 0.8);
    const ax = a.u * w, ay = a.v * h;
    const bx = ax + (b.u * w - ax) * grow, by = ay + (b.v * h - ay) * grow;
    ctx.strokeStyle = `rgba(200, 220, 255, ${0.38 * vis})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  for (const s of userStars) {
    const age = t - s.born;
    const pop = 1 + 2.5 * Math.exp(-age * 4);
    const tw = 0.75 + 0.25 * Math.sin(t * 2.2 + s.seed * 7);
    const x = s.u * w, y = s.v * h;
    const r = 2.1 * pop;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
    g.addColorStop(0, `rgba(235, 242, 255, ${0.55 * vis * tw})`);
    g.addColorStop(1, 'rgba(235, 242, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${vis * tw})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- палитра со сцены ---------- */

const swatchCodes = [...document.querySelectorAll('#swatches code')];
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
let ink = 'light';

function samplePalette() {
  const aspect = innerWidth / innerHeight;
  const sunU = clamp(state.sun[0] / aspect + 0.5, 0.04, 0.96);
  const antiU = clamp(1 - sunU, 0.08, 0.92);
  const cols = scene.sample([
    [0.5, 0.95],
    [sunU, H + 0.05],
    [antiU, H + 0.07],
    [0.82, H + 0.012],
    [0.5, 0.12],
  ]);
  cols.forEach((c, i) => {
    const v = hex(c);
    root.style.setProperty(`--sky-${i}`, v);
    if (swatchCodes[i]) swatchCodes[i].textContent = v;
  });

  // текст живёт в верхней половине неба: смотрим на её яркость
  const behind = scene.sample([[0.25, 0.7], [0.75, 0.7], [0.25, 0.55], [0.75, 0.55]]);
  const l = behind.reduce((s, c) => s + lum(c), 0) / behind.length;
  const next = ink === 'light' ? (l > 0.66 ? 'dark' : 'light') : (l < 0.56 ? 'light' : 'dark');
  if (next !== ink) {
    ink = next;
    root.dataset.ink = ink;
  }
}

/* ---------- циферблат ---------- */

const dial = $('#dial');
const dialSun = $('#dial-sun');
const dialHand = $('#dial-hand');
const clockTime = $('#clock-time');
const clockChapter = $('#clock-chapter');
const hint = $('#hint');

const polar = (h, r) => {
  const a = (h / 24) * TAU - Math.PI / 2;
  return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r];
};

// ночная дуга: от заката до восхода
(function drawNightArc() {
  const [x1, y1] = polar(19.15, 48);
  const [x2, y2] = polar(6.85, 48);
  $('#dial-night').setAttribute('d', `M ${x1} ${y1} A 48 48 0 0 1 ${x2} ${y2}`);
})();

function updateDial(hour) {
  const h = hour % 24;
  const [sx, sy] = polar(h, 48);
  dialSun.setAttribute('cx', sx.toFixed(2));
  dialSun.setAttribute('cy', sy.toFixed(2));
  const [hx, hy] = polar(h, 40);
  dialHand.setAttribute('x2', hx.toFixed(2));
  dialHand.setAttribute('y2', hy.toFixed(2));
  const label = fmtHour(hour);
  if (clockTime.textContent !== label) {
    clockTime.textContent = label;
    dial.setAttribute('aria-valuenow', hour.toFixed(2));
    dial.setAttribute('aria-valuetext', label);
  }
}

function hourFromDial(e) {
  const r = dial.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  let h = (((Math.atan2(dy, dx) + Math.PI / 2) / TAU) * 24 + 24) % 24;
  if (h < 5) h += 24; // ночь после полуночи — продолжение тех же суток
  return clamp(h, anchors[0].hour, anchors[anchors.length - 1].hour);
}

function goToHour(h) {
  scrollTo({ top: scrollForHour(h), behavior: 'instant' });
}

dial.addEventListener('pointerdown', (e) => {
  dial.setPointerCapture(e.pointerId);
  goToHour(hourFromDial(e));
  const move = (ev) => goToHour(hourFromDial(ev));
  const up = () => {
    dial.removeEventListener('pointermove', move);
    dial.removeEventListener('pointerup', up);
  };
  dial.addEventListener('pointermove', move);
  dial.addEventListener('pointerup', up);
});

dial.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 1 : 0.25;
  const keys = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
  if (e.key in keys) {
    e.preventDefault();
    goToHour(clamp(targetHour + keys[e.key], anchors[0].hour, anchors[anchors.length - 1].hour));
  }
});

/* ---------- появление глав ---------- */

document.querySelectorAll('h2').forEach((h2) => {
  const words = h2.textContent.trim().split(/\s+/);
  h2.setAttribute('aria-label', h2.textContent.trim());
  h2.innerHTML = words
    .map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`)
    .join(' ');
});

function countUp(el) {
  const to = parseInt(el.dataset.count, 10);
  const fmt = (v) => v.toLocaleString('ru-RU').replace(/\s/g, ' ');
  if (reduceMotion) { el.textContent = fmt(to); return; }
  const start = clockNow();
  const dur = 1600;
  const tick = () => {
    const t = clamp((clockNow() - start) / dur);
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - t, 4))));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in');
    en.target.querySelectorAll('[data-count]').forEach(countUp);
    io.unobserve(en.target);
  });
}, { threshold: 0.2 });
document.querySelectorAll('.inner').forEach((el) => io.observe(el));

/* ---------- кнопки ---------- */

const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  const on = sound.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.querySelector('.sound-label').textContent = on ? 'Звук включён' : 'Звук выключен';
});

$('#restart').addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' }));

$('#save').addEventListener('click', () => {
  if (!scene) return;
  const shot = scene.snapshot(state);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = shot.width;
    c.height = shot.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    drawStars(ctx, c.width, c.height, state.night, state.time);
    const s = c.width / 1600;
    ctx.fillStyle = 'rgba(242, 245, 247, 0.85)';
    ctx.font = `italic 300 ${Math.round(34 * s)}px Literata, Georgia, serif`;
    ctx.fillText('Сутки света', 48 * s, c.height - 76 * s);
    ctx.font = `400 ${Math.round(18 * s)}px "Golos Text", system-ui, sans-serif`;
    ctx.fillText(`Байкал, март · ${fmtHour(state.hour)}`, 48 * s, c.height - 46 * s);
    const a = document.createElement('a');
    a.download = `baikal-${fmtHour(state.hour).replace(':', '')}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };
  img.src = shot.url;
});

/* ---------- кадр ---------- */

let frame = 0;
let lastNow = performance.now();
let currentChapter = null;

function onResize() {
  measure();
  sizeNotes();
  if (scene) scene.resize();
}
addEventListener('resize', onResize);
onResize();

// ссылка на конкретную минуту: …/#22:30
function hourFromHash() {
  const m = location.hash.match(/^#(\d{1,2})[:-](\d{2})$/);
  if (!m) return null;
  let h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  if (h < 5) h += 24;
  return clamp(h, anchors[0].hour, anchors[anchors.length - 1].hour);
}
const startHour = hourFromHash();
if (startHour !== null) {
  history.scrollRestoration = 'manual';
  goToHour(startHour);
  state.hour = startHour;
}
// после загрузки шрифтов высоты глав меняются
document.fonts?.ready.then(() => {
  measure();
  if (startHour !== null) goToHour(startHour);
});

function tick(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  state.time += dt * (reduceMotion ? 0.3 : 1);

  targetHour = hourAt(scrollY + innerHeight / 2);
  const k = reduceMotion ? 1 : 1 - Math.pow(0.02, dt);
  state.hour += (targetHour - state.hour) * k;

  const aspect = innerWidth / innerHeight;
  const sun = sunAt(state.hour, aspect);
  state.sun = sun.pos;
  state.elev = sun.elev;
  state.night = smooth(-0.06, -0.2, sun.elev);
  state.aurora = smooth(23, 24.6, state.hour);

  // курсор догоняет мягко; через пару секунд без движения линза гаснет
  const [mx, my] = toScene(pointer.x, pointer.y);
  const mk = 1 - Math.pow(0.0005, dt);
  state.mouse[0] += (mx - state.mouse[0]) * mk;
  state.mouse[1] += (my - state.mouse[1]) * mk;
  const awake = pointer.active && now - pointer.last < 2500 ? 1 : 0;
  state.mouseOn += (awake - state.mouseOn) * (1 - Math.pow(0.05, dt));

  if (scene) {
    scene.render(state);
    if (frame % 6 === 0) samplePalette();
    if (!capture) scene.adapt(dt * 1000);
  }

  nctx.clearRect(0, 0, innerWidth, innerHeight);
  drawStars(nctx, innerWidth, innerHeight, state.night, state.time);

  updateDial(state.hour);
  sound.update(state.night, state.elev);

  const ch = chapterAt(scrollY + innerHeight * 0.5);
  if (ch !== currentChapter) {
    currentChapter = ch;
    clockChapter.textContent = ch.dataset.name;
    hint.classList.add('swap');
    setTimeout(() => {
      hint.textContent = ch.dataset.hint;
      hint.classList.remove('swap');
    }, capture ? 0 : 350);
  }

  if (frame === 2) $('#veil').classList.add('gone');
  frame += 1;
  if (!capture) requestAnimationFrame(tick);
}

if (capture) {
  $('#veil').classList.add('gone');
  if (scene) scene.setScale(1);
  virtualNow = performance.now();
  lastNow = virtualNow;
  // один кадр: сдвиг времени, прокрутка и положение курсора задаются снаружи
  window.__frame = (dtMs, top, mouse) => {
    if (top !== undefined) scrollTo(0, top);
    virtualNow += dtMs;
    if (mouse) {
      pointer.x = mouse.x;
      pointer.y = mouse.y;
      pointer.active = mouse.on;
      pointer.last = virtualNow;
    }
    tick(virtualNow);
    // CSS-переходы тоже переводим на виртуальные часы
    for (const a of document.getAnimations()) {
      if (a.vStart === undefined) { a.vStart = virtualNow - dtMs; a.pause(); }
      a.currentTime = virtualNow - a.vStart;
    }
  };
} else {
  requestAnimationFrame(tick);
  // если вкладка открыта в фоне, rAF почти стоит — не держим заставку вечно
  setTimeout(() => $('#veil').classList.add('gone'), 2500);
}
