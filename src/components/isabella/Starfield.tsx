import { useEffect, useMemo, useState } from "react";

/**
 * STARFIELD ATMOSFÉRICO (src/components/isabella/Starfield.tsx)
 * -----------------------------------------------------------------
 * Aproximadamente 1.000 micro-estrellas marfil/platino con movimiento
 * sutil, semilla determinista y soporte de `prefers-reduced-motion`.
 *
 * - La semilla determinista garantiza una disposición estable entre
 *   renders/reloads (misma constelación).
 * - Rendimiento: los puntos se dibujan con divs absolutamente
 *   posicionados (sin WebGL), y el parpadeo usa CSS `animation-delay`.
 * - Accesibilidad: `aria-hidden` (puramente decorativo) y, si el usuario
 *   prefiere reducir el movimiento, se desactivan todas las animaciones.
 */

const STAR_COUNT = 1000;

/** Semilla determinista: misma constelación entre renders/reloads. */
const SEED = 0x15443a1f; // "RDM / HGO" (hash simple estable)

/** Generador congruencial lineal (LCG) para una secuencia pseudo-aleatoria estable. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface StarSpec {
  left: number;
  top: number;
  size: number;
  alpha: number;
  glowAlpha: number;
  twinkleDelay: number;
  twinkleDuration: number;
}

function buildStars(seed: number): StarSpec[] {
  const rng = makeRng(seed);
  const stars: StarSpec[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      left: rng() * 100,
      top: rng() * 100,
      size: 0.5 + rng() * 1.6,
      alpha: 0.3 + rng() * 0.65,
      glowAlpha: 0.15 + rng() * 0.5,
      twinkleDelay: rng() * 8,
      twinkleDuration: 2.5 + rng() * 6,
    });
  }
  return stars;
}

export function Starfield() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  const stars = useMemo(() => buildStars(SEED), []);

  return (
    <div className="isabella-starfield" aria-hidden="true">
      <div className="starfield-layer">
        {stars.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              ["--star-size" as string]: `${s.size}px`,
              ["--star-alpha" as string]: String(s.alpha),
              ["--star-glow-alpha" as string]: String(s.glowAlpha),
              animation: reducedMotion
                ? undefined
                : `star-twinkle ${s.twinkleDuration}s ease-in-out ${s.twinkleDelay}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes star-twinkle {
          0%, 100% { opacity: var(--star-alpha, 0.4); transform: scale(0.7); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
