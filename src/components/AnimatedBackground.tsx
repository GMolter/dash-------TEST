import { useEffect, useRef } from 'react';
import { AppBackgroundPreset, AppBackgroundTheme } from '../lib/appTheme';

type WaveThemeConfig = {
  noiseAlpha: number;
  vignetteAlpha: number;
  waveCount: number;
  waveAmpBase: number;
  waveAmpStep: number;
  waveFreqBase: number;
  waveFreqStep: number;
  waveSpeedBase: number;
  waveSpeedStep: number;
  waveOpacityBase: number;
  waveOpacityStep: number;
  waveYOffsetBase: number;
  waveYOffsetStep: number;
};

type PresetConfig = {
  bodyBackground: string;
  baseGradientStops: [number, string][];
  spotGradientStops: [number, string][];
  gridMinorColor: string;
  gridMajorColor: string;
  dotColor: string;
  waveHueBase: number;
  waveHueStep: number;
  contourLinePair: [string, string];
  contourFillColor: string;
  contourGlowColor: string;
};

const WAVE_THEME_CONFIGS: Record<Exclude<AppBackgroundTheme, 'contour-drift'>, WaveThemeConfig> = {
  'dynamic-waves': {
    noiseAlpha: 0.12,
    vignetteAlpha: 0.55,
    waveCount: 6,
    waveAmpBase: 70,
    waveAmpStep: 18,
    waveFreqBase: 0.0028,
    waveFreqStep: 0.00018,
    waveSpeedBase: 0.018,
    waveSpeedStep: 0.004,
    waveOpacityBase: 0.13,
    waveOpacityStep: 0.015,
    waveYOffsetBase: 0.3,
    waveYOffsetStep: 62,
  },
  'aurora-lattice': {
    noiseAlpha: 0.11,
    vignetteAlpha: 0.5,
    waveCount: 5,
    waveAmpBase: 58,
    waveAmpStep: 14,
    waveFreqBase: 0.0022,
    waveFreqStep: 0.00014,
    waveSpeedBase: 0.016,
    waveSpeedStep: 0.003,
    waveOpacityBase: 0.16,
    waveOpacityStep: 0.02,
    waveYOffsetBase: 0.34,
    waveYOffsetStep: 56,
  },
};

const PRESET_CONFIGS: Record<AppBackgroundPreset, PresetConfig> = {
  indigo: {
    bodyBackground: '#05050a',
    baseGradientStops: [
      [0, '#05050a'],
      [0.35, '#070814'],
      [0.7, '#060610'],
      [1, '#04040a'],
    ],
    spotGradientStops: [
      [0, 'rgba(120,140,255,0.10)'],
      [0.35, 'rgba(90,120,255,0.05)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    gridMinorColor: 'rgba(120,140,255,0.35)',
    gridMajorColor: 'rgba(255,255,255,0.35)',
    dotColor: '190,205,255',
    waveHueBase: 228,
    waveHueStep: 10,
    contourLinePair: ['#4fa8ff', '#3d6fff'],
    contourFillColor: '#07101f',
    contourGlowColor: 'rgba(15,40,100,0.10)',
  },
  ocean: {
    bodyBackground: '#06101b',
    baseGradientStops: [
      [0, '#05101a'],
      [0.35, '#082134'],
      [0.7, '#08182d'],
      [1, '#050a15'],
    ],
    spotGradientStops: [
      [0, 'rgba(56,189,248,0.11)'],
      [0.35, 'rgba(59,130,246,0.06)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    gridMinorColor: 'rgba(125,211,252,0.33)',
    gridMajorColor: 'rgba(191,219,254,0.30)',
    dotColor: '186,230,253',
    waveHueBase: 202,
    waveHueStep: 8,
    contourLinePair: ['#00c8e0', '#3d6fff'],
    contourFillColor: '#07101f',
    contourGlowColor: 'rgba(15,40,100,0.12)',
  },
  teal: {
    bodyBackground: '#041114',
    baseGradientStops: [
      [0, '#041014'],
      [0.35, '#063138'],
      [0.7, '#08262c'],
      [1, '#050b11'],
    ],
    spotGradientStops: [
      [0, 'rgba(45,212,191,0.11)'],
      [0.35, 'rgba(20,184,166,0.06)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    gridMinorColor: 'rgba(94,234,212,0.32)',
    gridMajorColor: 'rgba(153,246,228,0.26)',
    dotColor: '153,246,228',
    waveHueBase: 174,
    waveHueStep: 8,
    contourLinePair: ['#00bcd4', '#4fc3f7'],
    contourFillColor: '#06121c',
    contourGlowColor: 'rgba(4,113,113,0.12)',
  },
  sunset: {
    bodyBackground: '#13080d',
    baseGradientStops: [
      [0, '#14070e'],
      [0.35, '#2a0f23'],
      [0.7, '#211338'],
      [1, '#0d0a17'],
    ],
    spotGradientStops: [
      [0, 'rgba(251,113,133,0.12)'],
      [0.35, 'rgba(244,114,182,0.06)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    gridMinorColor: 'rgba(251,146,60,0.28)',
    gridMajorColor: 'rgba(244,114,182,0.24)',
    dotColor: '253,186,116',
    waveHueBase: 336,
    waveHueStep: 10,
    contourLinePair: ['#ff7a59', '#a855f7'],
    contourFillColor: '#1a0f14',
    contourGlowColor: 'rgba(111,21,66,0.14)',
  },
};

type AnimatedBackgroundProps = {
  theme?: AppBackgroundTheme;
  preset?: AppBackgroundPreset;
  fixed?: boolean;
  className?: string;
};

export function AnimatedBackground({
  theme = 'dynamic-waves',
  preset = 'indigo',
  fixed = true,
  className,
}: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const presetConfig = PRESET_CONFIGS[preset];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const prevBg = document.body.style.background;
    if (fixed) document.body.style.background = presetConfig.bodyBackground;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let time = 0;

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

    type Dot = {
      x: number;
      y: number;
      r: number;
      a: number;
      vx: number;
      vy: number;
      tw: number;
      tws: number;
    };

    let dots: Dot[] = [];
    let noiseCanvas: HTMLCanvasElement | null = null;
    let noiseCtx: CanvasRenderingContext2D | null = null;

    function initDots() {
      const area = w * h;
      const count = clamp(Math.floor(area / 18000), 60, 180);
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.2,
        a: Math.random() * 0.25 + 0.05,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.015 + 0.004,
      }));
    }

    function buildNoise() {
      const size = 128;
      noiseCanvas = document.createElement('canvas');
      noiseCanvas.width = size;
      noiseCanvas.height = size;
      noiseCtx = noiseCanvas.getContext('2d');
      if (!noiseCtx) return;

      const img = noiseCtx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 18;
      }
      noiseCtx.putImageData(img, 0, 0);
    }

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (fixed) {
        w = Math.max(1, Math.floor(window.innerWidth));
        h = Math.max(1, Math.floor(window.innerHeight));
      } else {
        const rect = canvas.getBoundingClientRect();
        w = Math.max(1, Math.floor(rect.width));
        h = Math.max(1, Math.floor(rect.height));
      }

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      initDots();
      buildNoise();
      if (theme !== 'contour-drift') {
        initWaves();
        waves.forEach((wave) => wave.onResize());
      }
    }

    function drawBaseGradient() {
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, w, h);
      for (const [stop, color] of presetConfig.baseGradientStops) {
        bg.addColorStop(stop, color);
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const spot = ctx.createRadialGradient(
        w * 0.25,
        h * 0.15,
        0,
        w * 0.25,
        h * 0.15,
        Math.max(w, h) * 0.75
      );
      for (const [stop, color] of presetConfig.spotGradientStops) {
        spot.addColorStop(stop, color);
      }
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, w, h);
    }

    function drawGrid() {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.08;

      const spacing = 48;
      const ox = (time * 0.15) % spacing;
      const oy = (time * 0.1) % spacing;

      ctx.beginPath();
      for (let x = -spacing + ox; x <= w + spacing; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -spacing + oy; y <= h + spacing; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.strokeStyle = presetConfig.gridMinorColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 0.06;
      const major = spacing * 4;
      ctx.beginPath();
      for (let x = -major + ox * 0.5; x <= w + major; x += major) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -major + oy * 0.5; y <= h + major; y += major) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.strokeStyle = presetConfig.gridMajorColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }

    function drawDots() {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const p of dots) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += p.tws;

        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        const twinkle = (Math.sin(p.tw) + 1) * 0.5;
        const a = p.a * (0.55 + twinkle * 0.75);

        ctx.fillStyle = `rgba(${presetConfig.dotColor},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawNoise(alpha: number) {
      if (!noiseCanvas) return;
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = alpha;
      const pattern = ctx.createPattern(noiseCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    function drawVignette(alpha: number) {
      ctx.save();
      const vg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        Math.min(w, h) * 0.2,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.75
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${alpha})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const waves: Array<{
      onResize: () => void;
      draw: () => void;
    }> = [];

    class Wave {
      index: number;
      amp: number;
      freq: number;
      speed: number;
      yBase: number;
      opacity: number;
      hue: number;
      themeConfig: WaveThemeConfig;

      constructor(index: number, themeConfig: WaveThemeConfig) {
        this.index = index;
        this.themeConfig = themeConfig;
        this.amp = themeConfig.waveAmpBase + index * themeConfig.waveAmpStep;
        this.freq = themeConfig.waveFreqBase - index * themeConfig.waveFreqStep;
        this.speed = themeConfig.waveSpeedBase + index * themeConfig.waveSpeedStep;
        this.yBase = 0;
        this.opacity = themeConfig.waveOpacityBase - index * themeConfig.waveOpacityStep;
        this.hue = presetConfig.waveHueBase - index * presetConfig.waveHueStep;
      }

      onResize() {
        this.yBase = h * this.themeConfig.waveYOffsetBase + this.index * this.themeConfig.waveYOffsetStep;
      }

      yAt(x: number) {
        const a = this.amp;
        const f = this.freq;
        const s = this.speed;
        return (
          this.yBase +
          Math.sin(x * f + time * s) * a +
          Math.sin(x * f * 1.9 + time * s * 1.15) * (a * 0.28) +
          Math.sin(x * f * 0.65 + time * s * 0.75) * (a * 0.42)
        );
      }

      draw() {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        ctx.beginPath();
        ctx.moveTo(0, this.yBase);
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, this.yAt(x));
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        const g = ctx.createLinearGradient(0, this.yBase - this.amp * 1.8, 0, h);
        g.addColorStop(0, `hsla(${this.hue}, 75%, 60%, ${this.opacity})`);
        g.addColorStop(0.45, `hsla(${this.hue + 18}, 70%, 52%, ${this.opacity * 0.55})`);
        g.addColorStop(1, `hsla(${this.hue + 34}, 65%, 45%, 0)`);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsla(${this.hue}, 85%, 65%, ${this.opacity * 2.2})`;
        ctx.strokeStyle = `hsla(${this.hue}, 85%, 65%, ${this.opacity * 2.0})`;
        ctx.beginPath();
        ctx.moveTo(0, this.yBase);
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, this.yAt(x));
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `hsla(${this.hue + 8}, 90%, 78%, ${this.opacity * 1.4})`;
        ctx.stroke();
        ctx.restore();
      }
    }

    function initWaves() {
      waves.length = 0;
      if (theme === 'contour-drift') return;
      const themeConfig = WAVE_THEME_CONFIGS[theme];
      for (let i = 0; i < themeConfig.waveCount; i++) {
        const wave = new Wave(i, themeConfig);
        wave.onResize();
        waves.push(wave);
      }
    }

    const perm = new Uint8Array(512);
    {
      const p = Array.from({ length: 256 }, (_, i) => i);
      for (let i = 255; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [p[i], p[j]] = [p[j], p[i]];
      }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    }

    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const grad = (hash: number, x: number, y: number, z: number) => {
      const hsh = hash & 15;
      const u = hsh < 8 ? x : y;
      const v = hsh < 4 ? y : hsh === 12 || hsh === 14 ? x : z;
      return ((hsh & 1) === 0 ? u : -u) + ((hsh & 2) === 0 ? v : -v);
    };

    const noise = (x: number, y: number, z = 0) => {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      z -= Math.floor(z);
      const u = fade(x);
      const v = fade(y);
      const wv = fade(z);
      const A = perm[X] + Y;
      const AA = perm[A] + Z;
      const AB = perm[A + 1] + Z;
      const B = perm[X + 1] + Y;
      const BA = perm[B] + Z;
      const BB = perm[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u), lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
        wv
      );
    };

    const fbm = (x: number, y: number, z: number) =>
      noise(x, y, z) * 0.5 +
      noise(x * 1.9, y * 1.9, z * 1.3) * 0.25 +
      noise(x * 3.7, y * 3.7, z * 1.7) * 0.125 +
      noise(x * 7.5, y * 7.5, z * 2.1) * 0.0625;

    const marchingTable: Array<Array<[number, number]>> = [
      [],
      [[2, 3]],
      [[1, 2]],
      [[1, 3]],
      [[0, 1]],
      [[0, 1], [2, 3]],
      [[0, 2]],
      [[0, 3]],
      [[0, 3]],
      [[0, 2]],
      [[0, 3], [1, 2]],
      [[0, 1]],
      [[1, 3]],
      [[1, 2]],
      [[2, 3]],
      [],
    ];

    const edgePoint = (corners: [number, number, number, number], edge: number, thr: number): [number, number] | null => {
      const [c0, c1, c2, c3] = corners;
      let t = 0;
      switch (edge) {
        case 0:
          t = (thr - c0) / (c1 - c0);
          return [t, 0];
        case 1:
          t = (thr - c1) / (c2 - c1);
          return [1, t];
        case 2:
          t = (thr - c3) / (c2 - c3);
          return [t, 1];
        case 3:
          t = (thr - c0) / (c3 - c0);
          return [0, t];
        default:
          return null;
      }
    };

    type Segment = { x1: number; y1: number; x2: number; y2: number };
    type Point = { x: number; y: number };

    const buildChains = (segments: Segment[]): Point[][] => {
      const adj = new Map<string, Array<{ segIdx: number; isStart: boolean }>>();
      const addAdj = (key: string, segIdx: number, isStart: boolean) => {
        const list = adj.get(key) ?? [];
        list.push({ segIdx, isStart });
        adj.set(key, list);
      };

      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const k1 = `${Math.round(s.x1 * 2)},${Math.round(s.y1 * 2)}`;
        const k2 = `${Math.round(s.x2 * 2)},${Math.round(s.y2 * 2)}`;
        addAdj(k1, i, true);
        addAdj(k2, i, false);
      }

      const used = new Uint8Array(segments.length);
      const chains: Point[][] = [];

      for (let si = 0; si < segments.length; si++) {
        if (used[si]) continue;
        used[si] = 1;
        const s = segments[si];
        const chain: Point[] = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];

        for (let pass = 0; pass < 2; pass++) {
          let going = true;
          while (going) {
            going = false;
            const tip = pass === 0 ? chain[chain.length - 1] : chain[0];
            const key = `${Math.round(tip.x * 2)},${Math.round(tip.y * 2)}`;
            const neighbors = adj.get(key) ?? [];
            for (const { segIdx, isStart } of neighbors) {
              if (used[segIdx]) continue;
              used[segIdx] = 1;
              const ns = segments[segIdx];
              const nx = isStart ? ns.x2 : ns.x1;
              const ny = isStart ? ns.y2 : ns.y1;
              if (pass === 0) chain.push({ x: nx, y: ny });
              else chain.unshift({ x: nx, y: ny });
              going = true;
              break;
            }
          }
        }

        if (chain.length > 2) chains.push(chain);
      }

      return chains;
    };

    const toRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    };

    const drawWaves = () => {
      const themeConfig = WAVE_THEME_CONFIGS[theme as Exclude<AppBackgroundTheme, 'contour-drift'>];
      drawBaseGradient();
      drawGrid();
      drawDots();
      for (const wave of waves) wave.draw();
      drawNoise(themeConfig.noiseAlpha);
      drawVignette(themeConfig.vignetteAlpha);
      time += 0.3;
      rafRef.current = requestAnimationFrame(drawWaves);
    };

    const drawContourDrift = () => {
      const NUM_CONTOURS = 24;
      const CELL = 6;
      const SCALE = 0.0015;
      const SPEED = 0.00011;
      time += SPEED;

      ctx.fillStyle = presetConfig.contourFillColor;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
      glow.addColorStop(0, presetConfig.contourGlowColor);
      glow.addColorStop(1, 'rgba(2,4,14,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const cols = Math.ceil(w / CELL) + 2;
      const rows = Math.ceil(h / CELL) + 2;
      const field = new Float32Array(cols * rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          field[r * cols + c] = fbm(c * CELL * SCALE, r * CELL * SCALE, time);
        }
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let ci = 0; ci < NUM_CONTOURS; ci++) {
        const thr = -0.9 + (ci / (NUM_CONTOURS - 1)) * 1.8;
        const contourT = ci / (NUM_CONTOURS - 1);
        const alpha = 0.42 + 0.38 * Math.sin(contourT * Math.PI);
        const lineWidth = 1.1 + 0.6 * Math.sin(contourT * Math.PI);
        const [colA, colB] = presetConfig.contourLinePair;

        const rawSegs: Segment[] = [];
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols - 1; c++) {
            const v0 = field[r * cols + c];
            const v1 = field[r * cols + c + 1];
            const v2 = field[(r + 1) * cols + c + 1];
            const v3 = field[(r + 1) * cols + c];
            const corners: [number, number, number, number] = [v0, v1, v2, v3];
            const mask = (v0 > thr ? 8 : 0) | (v1 > thr ? 4 : 0) | (v2 > thr ? 2 : 0) | (v3 > thr ? 1 : 0);
            const px = c * CELL;
            const py = r * CELL;

            for (const [edgeA, edgeB] of marchingTable[mask]) {
              const pA = edgePoint(corners, edgeA, thr);
              const pB = edgePoint(corners, edgeB, thr);
              if (!pA || !pB) continue;

              const x1 = px + pA[0] * CELL;
              const y1 = py + pA[1] * CELL;
              const x2 = px + pB[0] * CELL;
              const y2 = py + pB[1] * CELL;
              if (!isFinite(x1 + y1 + x2 + y2)) continue;
              rawSegs.push({ x1, y1, x2, y2 });
            }
          }
        }

        const chains = buildChains(rawSegs);
        ctx.lineWidth = lineWidth;

        for (const chain of chains) {
          let minX = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (const pt of chain) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }

          const dx = maxX - minX;
          const dy = maxY - minY;
          const grad = dx >= dy ? ctx.createLinearGradient(minX, 0, maxX, 0) : ctx.createLinearGradient(0, minY, 0, maxY);
          grad.addColorStop(0, toRgba(colA, alpha * 0.35));
          grad.addColorStop(0.3, toRgba(colA, alpha));
          grad.addColorStop(0.7, toRgba(colB, alpha));
          grad.addColorStop(1, toRgba(colB, alpha * 0.35));

          ctx.beginPath();
          ctx.moveTo(chain[0].x, chain[0].y);
          for (let i = 1; i < chain.length; i++) ctx.lineTo(chain[i].x, chain[i].y);
          ctx.strokeStyle = grad;
          ctx.stroke();
        }
      }

      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.58);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(3,6,18,0.65)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(drawContourDrift);
    };

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    let observer: ResizeObserver | null = null;
    if (!fixed && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resize());
      observer.observe(canvas);
    }

    resize();
    if (theme === 'contour-drift') drawContourDrift();
    else drawWaves();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      if (fixed) document.body.style.background = prevBg;
    };
  }, [theme, preset, fixed]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? (fixed ? 'fixed inset-0 -z-10 block' : 'block h-full w-full')}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
