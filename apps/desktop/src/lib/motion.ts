/**
 * CMIS-UI-00 §3 Motion presets — Full Fluid
 * Apple Design §4 Behavior over animation — springs with damping/response.
 * Mapping: bounce 0 = damping 1.0 critically damped (no overshoot), bounce 0.2 = damping ~0.8
 * Motion `duration` approximates Apple `response` (seconds to settle).
 * All springs: interruptible, retarget from presentation value, compositor-only props.
 */

export const chromeSpring = {
  bounce: 0,
  duration: 0.35,
  type: "spring" as const,
} satisfies Record<string, unknown>;

export const sheetSpring = {
  bounce: 0,
  duration: 0.3,
  type: "spring" as const,
} satisfies Record<string, unknown>;

export const densitySpring = {
  bounce: 0,
  duration: 0.25,
  type: "spring" as const,
} satisfies Record<string, unknown>;

export const toastSpring = {
  bounce: 0,
  duration: 0.3,
  type: "spring" as const,
} satisfies Record<string, unknown>;

export function flickSpring(hasVelocity: boolean) {
  return {
    bounce: hasVelocity ? 0.2 : 0,
    duration: 0.3,
    type: "spring" as const,
  };
}

/** CMIS-UI-05 §4.3 — press/select feedback that follows the pointer down. */
export const dragSpring = {
  bounce: 0,
  duration: 0.25,
  type: "spring" as const,
} satisfies Record<string, unknown>;

/** CMIS-UI-05 §4.1 — movement before a pointerdown becomes a drag (Apple §10). */
export const dragHysteresisPx = 10;

/** CMIS-UI-05 §4.1 — below this release velocity, snap by position, not momentum. */
export const snapVelocityPxPerSec = 80;

/**
 * Apple §5 — release velocity in px/s from a short pointer history.
 * Uses the most recent sample against the oldest still in the window, and
 * refuses to trust sub-frame deltas (they divide by a near-zero dt).
 */
export function velocityFromHistory(
  history: { t: number; x: number; y: number }[],
  minDtMs = 8
): { x: number; y: number } {
  const last = history.at(-1);
  const first = history.at(0);
  if (!(last && first) || history.length < 2) {
    return { x: 0, y: 0 };
  }
  const dt = last.t - first.t;
  if (dt < minDtMs) {
    return { x: 0, y: 0 };
  }
  const scale = 1000 / dt;
  return { x: (last.x - first.x) * scale, y: (last.y - first.y) * scale };
}

/**
 * Insertion index for a pointer position — the count of siblings whose
 * midpoint the pointer has passed (CMIS-UI-05 §4.1 drop indicator).
 */
export function dropIndexFor(
  siblings: { height: number; top: number }[],
  pointerY: number
): number {
  let index = 0;
  for (const sibling of siblings) {
    if (pointerY > sibling.top + sibling.height / 2) {
      index += 1;
    }
  }
  return index;
}

/**
 * Apple §6 / CMIS-UI-05 §4.1 — pick the destination column from where the
 * gesture is *going*: a slow release snaps to the column under the pointer,
 * a flick resolves against the momentum-projected endpoint. Ties break in the
 * direction of travel, so a flick between two columns commits as intended.
 */
export function resolveTargetColumn<T extends string>(
  columns: { id: T; rect: { left: number; right: number } }[],
  pointerX: number,
  velocityX: number,
  threshold = snapVelocityPxPerSec
): T | null {
  if (columns.length === 0) {
    return null;
  }
  const byPosition = (x: number): T | null => {
    let best: { distance: number; id: T } | null = null;
    for (const column of columns) {
      const center = (column.rect.left + column.rect.right) / 2;
      const contains = x >= column.rect.left && x <= column.rect.right;
      const distance = contains ? 0 : Math.abs(x - center);
      if (!best || distance < best.distance) {
        best = { distance, id: column.id };
      }
    }
    return best?.id ?? null;
  };

  if (Math.abs(velocityX) < threshold) {
    return byPosition(pointerX);
  }

  const projected = pointerX + project(velocityX);
  const nearest = byPosition(projected);
  if (nearest) {
    return nearest;
  }

  // Between two equidistant columns — travel direction decides.
  const ordered = [...columns].sort((a, b) => a.rect.left - b.rect.left);
  if (velocityX > 0) {
    for (const column of ordered) {
      if (column.rect.left > projected) {
        return column.id;
      }
    }
    return ordered.at(-1)?.id ?? null;
  }
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].rect.right < projected) {
      return ordered[i].id;
    }
  }
  return ordered[0].id;
}

/** Apple §6 projection — exponential decay, d≈0.998 */
export function project(
  velocityPxPerSec: number,
  decelerationRate = 0.998
): number {
  return (
    ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate)
  );
}

export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/** Materialize enter variants for frosted surfaces §12 */
export const materializeEnter = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
  exit: { filter: "blur(4px)", opacity: 0, scale: 0.98 },
  initial: { filter: "blur(4px)", opacity: 0, scale: 0.98 },
};

export const paletteSpring = sheetSpring;

/**
 * §14 Reduced motion — materializeEnter without spring/blur/scale.
 * When prefers-reduced-motion is active, surfaces appear instantly
 * at full opacity without the frosted-scale entrance.
 */
export const materializeEnterReduced = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
  exit: { opacity: 0 },
  initial: { opacity: 0 },
};

export const branchCrossfadeMs = 150;
