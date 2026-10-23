// Звук генерируется на лету через Web Audio: ветер, ночной гул,
// «пение» льда при ударе и тихий звон звезды. Ни одного аудиофайла.
export function createSound() {
  let ctx = null;
  let master = null;
  let windFilter = null;
  let windGain = null;
  let padGain = null;
  let on = false;

  function brownNoise(seconds) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const wind = ctx.createBufferSource();
    wind.buffer = brownNoise(6);
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0.5;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // медленный порыв ветра
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(windFilter.frequency);
    lfo.start();

    // ночной гул: квинта, едва слышно
    padGain = ctx.createGain();
    padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padGain.connect(padFilter).connect(master);
    [110, 164.81, 220.5].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(padGain);
      o.start();
    });
  }

  function toggle() {
    if (!ctx) init();
    on = !on;
    if (on) ctx.resume();
    master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.4);
    return on;
  }

  // night 0..1, elev — высота солнца: днём ветер ярче, ночью гул
  function update(night, elev) {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.35 + 0.25 * Math.max(0, elev), t, 0.5);
    padGain.gain.setTargetAtTime(0.18 * night, t, 0.8);
  }

  // Байкальский лёд при трещине «стреляет» и поёт, как лазер
  function crack() {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = brownNoise(0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(1.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    noise.connect(bp).connect(ng).connect(master);
    noise.start(t);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500 + Math.random() * 500, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.9);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 1.2);
  }

  function chime() {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const f = notes[Math.floor(Math.random() * notes.length)];
    [1, 2.01].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i ? 0.03 : 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 2.3);
    });
  }

  return { toggle, update, crack, chime, get on() { return on; } };
}
