/**
 * liquid-transitions
 * WebGL image transitions in one dependency-free file.
 *
 *   import { LiquidTransition } from './liquid-transitions.js';
 *   const lt = new LiquidTransition(el, { images: ['a.jpg', 'b.jpg', 'c.jpg'], effect: 'liquid' });
 *   lt.next();
 */

/* ---------- small pure helpers (unit tested in Node) ---------- */

export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const wrapIndex = (i, n) => ((i % n) + n) % n;

/** UV scale that makes an image fill a box like CSS object-fit: cover. */
export function coverScale(imgW, imgH, boxW, boxH) {
  const imgA = imgW / imgH;
  const boxA = boxW / boxH;
  return boxA > imgA ? [1, imgA / boxA] : [boxA / imgA, 1];
}

export const EFFECTS = ['liquid', 'ripple', 'dissolve'];

const DEFAULTS = { images: [], effect: 'liquid', duration: 1.1, intensity: 0.6, trigger: 'click', alt: '', start: 0 };

export function normalizeOptions(o = {}) {
  const opt = { ...DEFAULTS, ...o };
  if (!Array.isArray(opt.images) || opt.images.length < 2) throw new Error('liquid-transitions: give at least two images.');
  if (!EFFECTS.includes(opt.effect)) throw new Error(`liquid-transitions: effect must be one of ${EFFECTS.join(', ')}.`);
  if (!['click', 'hover', 'manual'].includes(opt.trigger)) throw new Error('liquid-transitions: trigger must be click, hover or manual.');
  opt.duration = clamp(Number(opt.duration) || DEFAULTS.duration, 0.1, 10);
  opt.intensity = clamp(Number(opt.intensity) || 0, 0, 2);
  opt.start = wrapIndex(Math.floor(Number(opt.start) || 0), opt.images.length);
  return opt;
}

/* ---------- shaders ---------- */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_from; uniform sampler2D u_to;
uniform vec2 u_sFrom; uniform vec2 u_sTo;
uniform float u_p; uniform float u_time; uniform float u_int;
uniform vec2 u_mouse; uniform float u_aspect; uniform int u_effect;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
vec2 cover(vec2 uv, vec2 s){ return (uv - 0.5) * s + 0.5; }

void main(){
  vec2 uv = v_uv;
  float k = u_p;
  vec4 col;
  if (u_effect == 0) {
    // liquid: both images are pushed around by flowing noise, the new one flows in through a noisy front
    vec2 flow = vec2(fbm(uv * 3.0 + u_time * 0.6), fbm(uv * 3.0 - u_time * 0.6 + 7.3)) - 0.5;
    float wob = sin(k * 3.14159);
    vec2 a = uv + flow * u_int * 1.6 * k * wob * 2.0;
    vec2 b = uv - flow * u_int * 1.6 * (1.0 - k) * wob * 2.0;
    float front = fbm(uv * 2.5 + 3.0);
    float m = smoothstep(0.0, 0.35, k * 1.35 - front * 0.35 - uv.y * 0.0);
    col = mix(texture2D(u_from, cover(a, u_sFrom)), texture2D(u_to, cover(b, u_sTo)), m);
  } else if (u_effect == 1) {
    // ripple: a ring spreads from the pointer and refracts the picture as it passes
    vec2 d = (uv - u_mouse) * vec2(u_aspect, 1.0);
    float dist = length(d);
    float radius = k * 1.8;
    float ring = exp(-pow((dist - radius) * 7.0, 2.0));
    vec2 dir = normalize(d + 0.0001);
    vec2 off = dir * ring * u_int * 0.12 * sin(dist * 40.0 - k * 18.0);
    float m = smoothstep(radius + 0.04, radius - 0.04, dist);
    col = mix(texture2D(u_from, cover(uv + off, u_sFrom)), texture2D(u_to, cover(uv + off * 0.6, u_sTo)), m);
  } else {
    // dissolve: grainy threshold with a slight horizontal drift
    float n = fbm(uv * 6.0 + vec2(u_time * 0.2, 0.0));
    float m = smoothstep(n - 0.12, n + 0.12, k * 1.3 - 0.15);
    vec2 drift = vec2((n - 0.5) * 0.04 * u_int * sin(k * 3.14159), 0.0);
    col = mix(texture2D(u_from, cover(uv + drift, u_sFrom)), texture2D(u_to, cover(uv - drift, u_sTo)), m);
  }
  gl_FragColor = vec4(col.rgb, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
  return s;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`liquid-transitions: could not load ${url}`));
    img.src = url;
  });
}

/* ---------- the component ---------- */

export class LiquidTransition {
  constructor(container, options = {}) {
    this.opt = normalizeOptions(options);
    this.el = container;
    this.index = this.opt.start;
    this.busy = false;
    this.destroyed = false;
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mouse = [0.5, 0.5];
    this.time = 0;
    this.textures = [];
    this.sizes = [];
    this.from = this.index;
    this.to = this.index;
    this.progress = 1;

    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', this.opt.alt || 'Image gallery');

    // plain image underneath: shown while loading, and forever if WebGL is unavailable
    this.fallback = document.createElement('img');
    this.fallback.alt = '';
    this.fallback.src = this.opt.images[this.index];
    this.fallback.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
    container.appendChild(this.fallback);

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .25s';
    container.appendChild(this.canvas);

    this._onMove = (e) => {
      const r = container.getBoundingClientRect();
      this.mouse = [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
    };
    this._onClick = () => this.next();
    this._onEnter = (e) => { this._onMove(e); this.goTo(wrapIndex(this.index + 1, this.opt.images.length)); };
    this._onLeave = () => this.goTo(this.opt.start);
    container.addEventListener('pointermove', this._onMove);
    if (this.opt.trigger === 'click') container.addEventListener('click', this._onClick);
    if (this.opt.trigger === 'hover') { container.addEventListener('pointerenter', this._onEnter); container.addEventListener('pointerleave', this._onLeave); }

    this.ready = this._init();
  }

  async _init() {
    try {
      const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
      if (!gl) throw new Error('no webgl');
      this.gl = gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link error');
      gl.useProgram(prog);
      this.prog = prog;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = Object.fromEntries(['u_from', 'u_to', 'u_sFrom', 'u_sTo', 'u_p', 'u_time', 'u_int', 'u_mouse', 'u_aspect', 'u_effect'].map((n) => [n, gl.getUniformLocation(prog, n)]));

      const imgs = await Promise.all(this.opt.images.map(loadImage));
      if (this.destroyed) return;
      imgs.forEach((img, i) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.textures[i] = t;
        this.sizes[i] = [img.naturalWidth, img.naturalHeight];
      });
      this.ro = new ResizeObserver(() => { this._resize(); this._draw(); });
      this.ro.observe(this.el);
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.canvas.style.opacity = '0'; });
      this._resize();
      this._draw();
      this.canvas.style.opacity = '1';
      this.webgl = true;
    } catch (err) {
      this.webgl = false; // the plain image stays visible
      this.canvas.remove();
    }
    return this;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.el.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.el.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  _draw() {
    const { gl, u } = this;
    if (!gl || gl.isContextLost() || !this.textures.length) return;
    const box = [this.canvas.width, this.canvas.height];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[this.from]); gl.uniform1i(u.u_from, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures[this.to]); gl.uniform1i(u.u_to, 1);
    gl.uniform2fv(u.u_sFrom, coverScale(...this.sizes[this.from], ...box));
    gl.uniform2fv(u.u_sTo, coverScale(...this.sizes[this.to], ...box));
    gl.uniform1f(u.u_p, this.progress);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_int, this.opt.intensity);
    gl.uniform2f(u.u_mouse, this.mouse[0], this.mouse[1]);
    gl.uniform1f(u.u_aspect, box[0] / box[1]);
    gl.uniform1i(u.u_effect, EFFECTS.indexOf(this.opt.effect));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Transitions to image `i`. Returns a promise that resolves when it is on screen. */
  goTo(i) {
    const n = this.opt.images.length;
    const target = wrapIndex(i, n);
    if (target === this.index && !this.busy) return Promise.resolve(this.index);
    const finish = () => {
      this.index = target;
      this.from = target;
      this.to = target;
      this.progress = 1;
      this.fallback.src = this.opt.images[target];
      this.el.dispatchEvent(new CustomEvent('liquid:change', { detail: { index: target } }));
      return target;
    };
    if (!this.webgl || this.reduce) {
      this.fallback.src = this.opt.images[target];
      return this.ready.then(() => (this.webgl && this._instant(target)) || finish());
    }
    return this.ready.then(() => new Promise((resolve) => {
      this.from = this.busy ? this.to : this.index; // if interrupted, start from where we were heading
      this.to = target;
      this.progress = 0;
      this.busy = true;
      const t0 = performance.now();
      const dur = this.opt.duration * 1000;
      const tick = (now) => {
        if (this.destroyed) return resolve(this.index);
        if (this.to !== target) return resolve(this.index); // superseded by a newer goTo
        const raw = clamp((now - t0) / dur, 0, 1);
        this.progress = easeInOutCubic(raw);
        this.time = now / 1000;
        this._draw();
        if (raw < 1) requestAnimationFrame(tick);
        else { this.busy = false; resolve(finish()); }
      };
      requestAnimationFrame(tick);
    }));
  }

  _instant(target) {
    this.from = target; this.to = target; this.progress = 1; this.index = target;
    this._draw();
    this.el.dispatchEvent(new CustomEvent('liquid:change', { detail: { index: target } }));
    return target;
  }

  next() { return this.goTo(this.index + 1); }
  prev() { return this.goTo(this.index - 1); }

  setEffect(name) { normalizeOptions({ ...this.opt, effect: name }); this.opt.effect = name; }
  setIntensity(v) { this.opt.intensity = clamp(Number(v) || 0, 0, 2); }
  setDuration(s) { this.opt.duration = clamp(Number(s) || 1, 0.1, 10); }

  destroy() {
    this.destroyed = true;
    this.ro && this.ro.disconnect();
    this.el.removeEventListener('pointermove', this._onMove);
    this.el.removeEventListener('click', this._onClick);
    this.el.removeEventListener('pointerenter', this._onEnter);
    this.el.removeEventListener('pointerleave', this._onLeave);
    this.canvas.remove();
    this.fallback.remove();
    if (this.gl && !this.gl.isContextLost()) {
      this.textures.forEach((t) => this.gl.deleteTexture(t));
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext && ext.loseContext();
    }
  }
}

export default LiquidTransition;
