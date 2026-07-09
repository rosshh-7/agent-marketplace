import React, { useEffect, useRef } from 'react';

/**
 * Canvas constellation behind the hero: drifting "agent" nodes, linked when
 * near each other, with bright signal pulses travelling along the links —
 * a living picture of agents talking to agents. Pure canvas, no deps.
 *
 * It idles when the tab is hidden, caps node count by area, and under
 * prefers-reduced-motion paints a single static frame.
 */
export default function NeuralBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LINK_DIST = 150;

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
    }
    interface Pulse {
      from: Node;
      to: Node;
      t: number;
      speed: number;
    }

    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.floor((width * height) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
      }));
      pulses = [];
    }

    function drawFrame(animate: boolean) {
      ctx!.clearRect(0, 0, width, height);

      if (animate) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -10) n.x = width + 10;
          if (n.x > width + 10) n.x = -10;
          if (n.y < -10) n.y = height + 10;
          if (n.y > height + 10) n.y = -10;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.16;
          ctx!.strokeStyle = `rgba(129, 140, 248, ${alpha.toFixed(3)})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }

      for (const n of nodes) {
        ctx!.fillStyle = 'rgba(165, 180, 252, 0.55)';
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!animate) return;

      // Occasionally fire a signal along a currently-existing link.
      if (pulses.length < 6 && Math.random() < 0.04 && nodes.length > 1) {
        const from = nodes[Math.floor(Math.random() * nodes.length)];
        const near = nodes.filter((n) => {
          if (n === from) return false;
          const dx = n.x - from.x;
          const dy = n.y - from.y;
          return dx * dx + dy * dy < LINK_DIST * LINK_DIST;
        });
        if (near.length > 0) {
          pulses.push({
            from,
            to: near[Math.floor(Math.random() * near.length)],
            t: 0,
            speed: 0.008 + Math.random() * 0.012,
          });
        }
      }

      pulses = pulses.filter((p) => p.t <= 1);
      for (const p of pulses) {
        p.t += p.speed;
        const t = Math.min(p.t, 1);
        const x = p.from.x + (p.to.x - p.from.x) * t;
        const y = p.from.y + (p.to.y - p.from.y) * t;
        const fade = Math.sin(Math.PI * t);
        ctx!.fillStyle = `rgba(34, 211, 238, ${(0.9 * fade).toFixed(3)})`;
        ctx!.shadowColor = 'rgba(34, 211, 238, 0.8)';
        ctx!.shadowBlur = 8;
        ctx!.beginPath();
        ctx!.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }
    }

    function loop() {
      drawFrame(true);
      raf = requestAnimationFrame(loop);
    }

    resize();
    if (reduceMotion) {
      drawFrame(false);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduceMotion) raf = requestAnimationFrame(loop);
    };
    const onResize = () => {
      resize();
      if (reduceMotion) drawFrame(false);
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="hero-canvas" aria-hidden="true" />;
}
