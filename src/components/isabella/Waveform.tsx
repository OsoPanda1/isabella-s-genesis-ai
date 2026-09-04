import { useEffect, useRef } from "react";

export function Waveform({ active, height = 64 }: { active: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number>(0);
  const t = useRef(0);
  const energy = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const target = active ? 1 : 0.16;
      energy.current += (target - energy.current) * 0.06;
      t.current += active ? 0.055 : 0.016;

      const layers = [
        { color: "rgba(90,160,255,0.85)", amp: 1, freq: 0.017, width: 1.6 },
        { color: "rgba(190,150,255,0.5)", amp: 0.68, freq: 0.026, width: 1.1 },
        { color: "rgba(235,240,255,0.4)", amp: 0.42, freq: 0.038, width: 0.9 },
      ];

      layers.forEach((layer, li) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const decay = Math.sin((x / w) * Math.PI);
          const y =
            h / 2 +
            Math.sin(x * layer.freq + t.current * (1 + li * 0.35)) *
              (h / 2.6) *
              layer.amp *
              energy.current *
              decay +
            Math.sin(x * layer.freq * 2.7 - t.current * 1.4) * 3 * energy.current * decay;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.width;
        ctx.shadowBlur = 14;
        ctx.shadowColor = layer.color;
        ctx.stroke();
      });

      raf.current = requestAnimationFrame(draw);
    };

    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);

  return <canvas ref={ref} className="w-full" style={{ height }} aria-hidden="true" />;
}
