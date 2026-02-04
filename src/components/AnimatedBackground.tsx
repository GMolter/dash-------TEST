import { useEffect, useRef } from 'react';

// Canvas background adapted from the HTML you provided.
// - Fixed, full-screen canvas
// - Subtle gradient + drifting dots + grid + waves + grain + vignette
// - DPR capped for performance
export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Match the snippet: lock overflow + base background.
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#05050a';

    let w = 0;
    let h = 0;
    let dpr = 1;
    let time = 0;

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

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
        img.data[i + 3] = 18; // alpha baked in
      }
      noiseCtx.putImageData(img, 0, 0);
    }

    function resize() {
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      w = Math.floor(window.innerWidth);
      h = Math.floor(window.innerHeight);

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      // Scale drawing coords back to CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      initDots();
      buildNoise();
      initWaves();
      waves.forEach((wave) => wave.onResize());
    }

    function drawBaseGradient() {
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#05050a');
      bg.addColorStop(0.35, '#070814');
      bg.addColorStop(0.7, '#060610');
      bg.addColorStop(1, '#04040a');
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
      spot.addColorStop(0, 'rgba(120,140,255,0.10)');
      spot.addColorStop(0.35, 'rgba(90,120,255,0.05)');
      spot.addColorStop(1, 'rgba(0,0,0,0)');
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
      ctx.strokeStyle = 'rgba(120,140,255,0.35)';
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
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
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

        ctx.fillStyle = `rgba(190,205,255,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawNoise() {
      if (!noiseCanvas) return;
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.12;
      const pattern = ctx.createPattern(noiseCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    function drawVignette() {
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
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    class Wave {
      index: number;
      amp: number;
      freq: number;
      speed: number;
      yBase: number;
      opacity: number;
      hue: number;

      constructor(index: number) {
        this.index = index;
        this.amp = 70 + index * 18;
        this.freq = 0.0028 - index * 0.00018;
        this.speed = 0.018 + index * 0.004;
        this.yBase = 0;
        this.opacity = 0.13 - index * 0.015;
        this.hue = 228 - index * 10;
      }

      onResize() {
        this.yBase = h * 0.3 + this.index * 62;
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

        // Fill body
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

        // Glow line
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsla(${this.hue}, 85%, 65%, ${this.opacity * 2.2})`;
        ctx.strokeStyle = `hsla(${this.hue}, 85%, 65%, ${this.opacity * 2.0})`;

        ctx.beginPath();
        ctx.moveTo(0, this.yBase);
        for (let x = 0; x <= w; x += 6) ctx.lineTo(x, this.yAt(x));
        ctx.stroke();

        // Crisp line
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `hsla(${this.hue + 8}, 90%, 78%, ${this.opacity * 1.4})`;
        ctx.stroke();

        ctx.restore();
      }
    }

    const waves: Wave[] = [];

    function initWaves() {
      waves.length = 0;
      for (let i = 0; i < 6; i++) {
        const wave = new Wave(i);
        wave.onResize();
        waves.push(wave);
      }
    }

    function animate() {
      drawBaseGradient();
      drawGrid();
      drawDots();
      for (const wave of waves) wave.draw();
      drawNoise();
      drawVignette();

      time += 0.3;
      rafRef.current = requestAnimationFrame(animate);
    }

    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    resize();
    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 block"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
