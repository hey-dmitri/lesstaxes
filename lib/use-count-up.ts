'use client';

import { useEffect, useState } from 'react';

/** Fast out, slow in — the number decelerates into its final value. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Roll a number up to its value.
 *
 * The result is already computed before this runs — nothing is being waited
 * for, and the page stays interactive throughout (PROJECT.md D14). The motion
 * is presentational only.
 *
 * State is held ONLY while an animation is in flight. The rest of the time the
 * hook simply returns the real value, so live editing snaps instantly instead
 * of re-rolling on every keystroke, and a reduced-motion user never sees a
 * partial figure at all.
 *
 * `animate` is expected to be true when the component mounts and to be turned
 * off once the reveal is over.
 */
export function useCountUp(value: number, animate: boolean, durationMs = 700): number {
  // Lazy initialiser, not an effect: starting at zero on the very first render
  // avoids a single frame showing the final number before motion begins.
  const [rolled, setRolled] = useState<number | null>(() => (animate ? 0 : null));

  useEffect(() => {
    if (!animate || prefersReducedMotion()) return;

    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      // setState inside a rAF callback, not in the effect body.
      setRolled(progress < 1 ? value * easeOutCubic(progress) : null);
      if (progress < 1) frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  }, [value, animate, durationMs]);

  // Once the reveal is over, or if motion is off, always show the true value.
  return animate && rolled !== null ? rolled : value;
}
