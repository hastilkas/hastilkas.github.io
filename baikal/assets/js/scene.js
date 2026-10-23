import { VERT, FRAG } from './shader.js';

// Рендерер шейдера: полноэкранный треугольник, адаптивное разрешение,
// чтение цветов прямо из кадра для живой палитры.
export function createScene(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uRes', 'uAspect', 'uTime', 'uHour', 'uSun', 'uElev', 'uNight', 'uAurora', 'uMouse', 'uMouseOn', 'uCrack']
    .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  // доля от CSS-пикселей; подстраивается под скорость видеокарты
  const maxScale = Math.min(window.devicePixelRatio || 1, 1.25);
  let scale = Math.min(0.75, maxScale);
  let cssW = 0;
  let cssH = 0;

  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.max(2, Math.round(cssW * scale));
    canvas.height = Math.max(2, Math.round(cssH * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  const crackData = new Float32Array(16);

  function render(s) {
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uAspect, cssW / cssH);
    gl.uniform1f(U.uTime, s.time);
    gl.uniform1f(U.uHour, s.hour);
    gl.uniform2f(U.uSun, s.sun[0], s.sun[1]);
    gl.uniform1f(U.uElev, s.elev);
    gl.uniform1f(U.uNight, s.night);
    gl.uniform1f(U.uAurora, s.aurora);
    gl.uniform2f(U.uMouse, s.mouse[0], s.mouse[1]);
    gl.uniform1f(U.uMouseOn, s.mouseOn);
    s.cracks.forEach((c, i) => crackData.set([c.x, c.y, c.t, 0], i * 4));
    gl.uniform4fv(U.uCrack, crackData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Цвета пикселей сразу после отрисовки; points — доли экрана, y снизу вверх.
  const px = new Uint8Array(4);
  function sample(points) {
    return points.map(([x, y]) => {
      const sx = Math.min(canvas.width - 1, Math.max(0, Math.round(x * canvas.width)));
      const sy = Math.min(canvas.height - 1, Math.max(0, Math.round(y * canvas.height)));
      gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    });
  }

  // Кадр в полном разрешении для сохранения в PNG
  function snapshot(s) {
    const prev = scale;
    scale = Math.min((window.devicePixelRatio || 1) * 1.25, 2.5);
    resize();
    render(s);
    const url = canvas.toDataURL('image/png');
    const out = { url, width: canvas.width, height: canvas.height };
    scale = prev;
    resize();
    return out;
  }

  // Подстройка разрешения по среднему времени кадра
  let acc = 0;
  let frames = 0;
  function adapt(dt) {
    // фоновая вкладка тормозит rAF до 1 кадра в секунду — такие кадры не в счёт
    if (dt > 100) { acc = 0; frames = 0; return; }
    acc += dt;
    frames += 1;
    if (frames < 40) return;
    const avg = acc / frames;
    acc = 0;
    frames = 0;
    if (avg > 24 && scale > 0.4) { scale = Math.max(0.4, scale - 0.1); resize(); }
    else if (avg < 17.5 && scale < maxScale) { scale = Math.min(maxScale, scale + 0.05); resize(); }
  }

  function setScale(s) {
    scale = Math.min(s, maxScale);
    resize();
  }

  resize();
  return { gl, resize, render, sample, snapshot, adapt, setScale };
}
