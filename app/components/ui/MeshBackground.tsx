"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; phase: number;
}

export function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const count = Math.floor((rect.width * rect.height) / 14000);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r:  Math.random() * 1.6 + 0.6,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    resize();
    window.addEventListener("resize", resize);
    canvas.parentElement?.addEventListener("mousemove", onMouse);
    canvas.parentElement?.addEventListener("mouseleave", onLeave);

    const draw = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dxm = p.x - mouse.x, dym = p.y - mouse.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < 140 && dm > 0) { p.x += (dxm / dm) * 0.6; p.y += (dym / dm) * 0.6; }
      }

      // connections
      const maxDist = 130;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < maxDist) {
            const alpha = (1 - d / maxDist) * 0.45;
            ctx.strokeStyle = `oklch(0.84 0.18 145 / ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }

      // particles
      for (const p of particles) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.002 + p.phase);
        ctx.fillStyle = `oklch(0.84 0.18 145 / ${0.4 + twinkle * 0.6})`;
        ctx.shadowColor = "oklch(0.84 0.18 145 / 0.8)";
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;

      // traveling data packets
      const ps = 0.0006;
      for (let i = 0; i < 6; i++) {
        const seed = i * 1.7;
        const idxA = Math.floor(((Math.sin(t * ps + seed) + 1) / 2) * particles.length);
        const idxB = (idxA + 1 + i) % particles.length;
        const a = particles[idxA], b = particles[idxB];
        if (!a || !b) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < maxDist * 1.5) {
          const phase = ((t * ps * 8 + seed * 100) % 1);
          ctx.fillStyle = "oklch(0.92 0.18 145 / 0.95)";
          ctx.shadowColor = "oklch(0.84 0.18 145 / 1)";
          ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * phase, a.y + (b.y - a.y) * phase, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.parentElement?.removeEventListener("mousemove", onMouse);
      canvas.parentElement?.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", pointerEvents: "auto" }} />
    </div>
  );
}
