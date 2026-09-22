"use client";

// beui.dev/components/motion/loader

import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { EASE_IN_OUT } from "@/lib/ease";

export type LoaderVariant =
  | "spinner"
  | "dots"
  | "bars"
  | "dot-matrix"
  | "dither"
  | "ascii"
  | "ascii-line"
  | "ascii-braille"
  | "ascii-blocks"
  | "ascii-bounce"
  | "morph"
  | "comet"
  | "scramble"
  | "metaballs"
  | "newton"
  | "helix"
  | "percent";

// Terminal-style frame sets — the loaders CLI AI agents cycle through.
const ASCII_SETS: Record<string, string[]> = {
  ascii: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  "ascii-blocks": [
    "▁",
    "▂",
    "▃",
    "▄",
    "▅",
    "▆",
    "▇",
    "█",
    "▇",
    "▆",
    "▅",
    "▄",
    "▃",
    "▂",
  ],
  "ascii-bounce": ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  "ascii-braille": ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
  "ascii-line": ["|", "/", "-", "\\"],
};

export interface LoaderProps {
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
  /** Base square size in px. Everything scales from this. */
  size?: number;
  /** Seconds per animation cycle. */
  speed?: number;
  /** Which animation to render. */
  variant?: LoaderVariant;
}

// Reduced motion keeps a calm opacity pulse and drops every transform.
const REDUCED = {
  animate: { opacity: [1, 0.4, 1] },
  transition: {
    duration: 1.4,
    ease: EASE_IN_OUT,
    repeat: Number.POSITIVE_INFINITY,
  },
};

export function Loader({
  variant = "spinner",
  size = 32,
  speed = 1,
  label = "Loading",
  className,
}: LoaderProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center text-foreground",
        className
      )}
      role="status"
    >
      {variant === "spinner" && (
        <Spinner reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "dots" && <Dots reduce={reduce} size={size} speed={speed} />}
      {variant === "bars" && <Bars reduce={reduce} size={size} speed={speed} />}
      {variant === "dot-matrix" && (
        <DotMatrix reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "dither" && (
        <Dither reduce={reduce} size={size} speed={speed} />
      )}
      {ASCII_SETS[variant] && (
        <Ascii
          frames={ASCII_SETS[variant]}
          reduce={reduce}
          size={size}
          speed={speed}
        />
      )}
      {variant === "morph" && (
        <Morph reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "comet" && (
        <Comet reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "scramble" && (
        <Scramble reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "metaballs" && (
        <Metaballs reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "newton" && (
        <Newton reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "helix" && (
        <Helix reduce={reduce} size={size} speed={speed} />
      )}
      {variant === "percent" && (
        <Percent reduce={reduce} size={size} speed={speed} />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface PartProps {
  reduce: boolean;
  size: number;
  speed: number;
}

function Spinner({ size, speed, reduce }: PartProps) {
  const stroke = Math.max(2, size * 0.09);
  const r = (size - stroke) / 2;
  return (
    <motion.svg
      animate={reduce ? REDUCED.animate : { rotate: 360 }}
      height={size}
      transition={
        reduce
          ? REDUCED.transition
          : {
              duration: speed,
              ease: "linear",
              repeat: Number.POSITIVE_INFINITY,
            }
      }
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={r}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={stroke}
      />
      <path
        d={`M ${size / 2} ${size / 2 - r} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={stroke}
      />
    </motion.svg>
  );
}

function Dots({ size, speed, reduce }: PartProps) {
  const dot = size * 0.24;
  return (
    <span className="flex items-center" style={{ gap: size * 0.14 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          animate={
            reduce
              ? { opacity: [0.4, 1, 0.4] }
              : { opacity: [0.5, 1, 0.5], y: [0, -size * 0.3, 0] }
          }
          className="rounded-full bg-current"
          key={i}
          style={{ height: dot, width: dot }}
          transition={{
            delay: i * speed * 0.16,
            duration: speed,
            ease: EASE_IN_OUT,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ))}
    </span>
  );
}

function Ascii({
  frames,
  size,
  speed,
  reduce,
}: PartProps & { frames: string[] }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    // Reduced motion slows the cycle rather than stopping it — it's a glyph
    // swap, not on-screen movement.
    const step = ((reduce ? speed * 2.5 : speed) / frames.length) * 1000;
    const id = setInterval(
      () => setFrame((f) => (f + 1) % frames.length),
      step
    );
    return () => clearInterval(id);
  }, [frames.length, speed, reduce]);

  return (
    <span
      className="font-mono tabular-nums leading-none"
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {frames[frame % frames.length]}
    </span>
  );
}

// Each shape is sampled at the same number of points and emitted as an SVG
// path with identical command structure, so framer tweens the `d` attribute
// point-to-point — a real morph, not a snap. (clip-path polygon strings don't
// interpolate reliably in framer, which left the shapes broken.)
const MORPH_POINTS = 24;

function ngonRadius(ang: number, n: number, phase = 0) {
  const seg = (2 * Math.PI) / n;
  const a = ang - phase;
  const local = (((a % seg) + seg) % seg) - seg / 2;
  return Math.cos(Math.PI / n) / Math.cos(local);
}

function morphPath(radiusAt: (ang: number) => number) {
  const parts: string[] = [];
  for (let i = 0; i < MORPH_POINTS; i++) {
    const ang = (i / MORPH_POINTS) * 2 * Math.PI - Math.PI / 2;
    const r = Math.min(1.05, radiusAt(ang));
    const x = (50 + Math.cos(ang) * 46 * r).toFixed(2);
    const y = (50 + Math.sin(ang) * 46 * r).toFixed(2);
    parts.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${parts.join(" ")} Z`;
}

const MORPH_PATHS = [
  morphPath(() => 1), // circle
  morphPath((a) => ngonRadius(a, 4, Math.PI / 4)), // square
  morphPath((a) => ngonRadius(a, 3)), // triangle
  morphPath((a) => ngonRadius(a, 6)), // hexagon
  morphPath((a) => ngonRadius(a, 4)), // diamond
];

// Each shape appears twice in a row so it fully forms and HOLDS before the
// next morph. Even keyframe spacing then alternates hold / morph segments.
const MORPH_SEQ = [...MORPH_PATHS.flatMap((p) => [p, p]), MORPH_PATHS[0]];
// Rotation and scale only change across the morph segments, staying put on the
// holds, so a settled shape sits still.
const MORPH_ROT = [0, 0, 72, 72, 144, 144, 216, 216, 288, 288, 360];
const MORPH_SCALE = [1, 1, 0.88, 0.88, 1, 1, 0.88, 0.88, 1, 1, 1];

function Morph({ size, speed, reduce }: PartProps) {
  return (
    <motion.svg
      animate={
        reduce
          ? { opacity: [1, 0.4, 1] }
          : { rotate: MORPH_ROT, scale: MORPH_SCALE }
      }
      height={size}
      role="img"
      transition={
        reduce
          ? {
              duration: 1.4,
              ease: EASE_IN_OUT,
              repeat: Number.POSITIVE_INFINITY,
            }
          : {
              duration: speed * 5,
              ease: EASE_IN_OUT,
              repeat: Number.POSITIVE_INFINITY,
            }
      }
      viewBox="0 0 100 100"
      width={size}
    >
      <title>Loading</title>
      <motion.path
        animate={reduce ? undefined : { d: MORPH_SEQ }}
        d={MORPH_PATHS[0]}
        fill="currentColor"
        transition={
          reduce
            ? undefined
            : {
                duration: speed * 5,
                ease: EASE_IN_OUT,
                repeat: Number.POSITIVE_INFINITY,
              }
        }
      />
    </motion.svg>
  );
}

const COMET_TRAIL = [0, 1, 2, 3, 4, 5];

function Comet({ size, speed, reduce }: PartProps) {
  const head = size * 0.2;
  const r = size / 2 - head / 2;
  return (
    <span className="relative" style={{ height: size, width: size }}>
      <motion.span
        animate={reduce ? REDUCED.animate : { rotate: 360 }}
        className="absolute inset-0"
        transition={
          reduce
            ? REDUCED.transition
            : {
                duration: speed,
                ease: "linear",
                repeat: Number.POSITIVE_INFINITY,
              }
        }
      >
        {COMET_TRAIL.map((i) => {
          const scale = 1 - i * 0.13;
          const sz = head * scale;
          return (
            <span
              className="absolute top-1/2 left-1/2 rounded-full bg-current"
              key={i}
              style={{
                height: sz,
                marginLeft: -sz / 2,
                marginTop: -sz / 2,
                opacity: 1 - i * 0.16,
                transform: `rotate(${-i * 15}deg) translateY(${-r}px)`,
                width: sz,
              }}
            />
          );
        })}
      </motion.span>
    </span>
  );
}

const SCRAMBLE_TARGET = "LOADING";
const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/*#@";

function Scramble({ size, speed, reduce }: PartProps) {
  const [text, setText] = useState(SCRAMBLE_TARGET);
  useEffect(() => {
    if (reduce) {
      setText(SCRAMBLE_TARGET);
      return;
    }
    let tick = 0;
    const total = SCRAMBLE_TARGET.length + 4;
    const id = setInterval(
      () => {
        const reveal = tick % total;
        let s = "";
        for (let i = 0; i < SCRAMBLE_TARGET.length; i++) {
          s +=
            i < reveal
              ? SCRAMBLE_TARGET[i]
              : SCRAMBLE_GLYPHS[
                  Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)
                ];
        }
        setText(s);
        tick++;
      },
      (speed / SCRAMBLE_TARGET.length) * 1000 * 0.55
    );
    return () => clearInterval(id);
  }, [speed, reduce]);

  return (
    <span
      className="font-medium font-mono tabular-nums tracking-[0.2em]"
      style={{ fontSize: size * 0.42 }}
    >
      {text}
    </span>
  );
}

function Metaballs({ size, speed, reduce }: PartProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg height={size} role="img" viewBox="0 0 100 100" width={size}>
      <title>Loading</title>
      <defs>
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" result="b" stdDeviation="5" />
          <feColorMatrix
            in="b"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
          />
        </filter>
      </defs>
      <g fill="currentColor" filter={`url(#${id})`}>
        <motion.circle
          animate={reduce ? { opacity: [0.4, 1, 0.4] } : { cx: [30, 70, 30] }}
          cx={reduce ? 40 : 30}
          cy="50"
          r="15"
          transition={{
            duration: speed * 1.6,
            ease: EASE_IN_OUT,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
        <motion.circle
          animate={reduce ? { opacity: [0.4, 1, 0.4] } : { cx: [70, 30, 70] }}
          cx={reduce ? 60 : 70}
          cy="50"
          r="15"
          transition={{
            duration: speed * 1.6,
            ease: EASE_IN_OUT,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      </g>
    </svg>
  );
}

const NEWTON_BALLS = [0, 1, 2, 3, 4];

function Newton({ size, speed, reduce }: PartProps) {
  const d = size * 0.2;
  const out = d * 1.1;
  // Only the end balls move: the left slides out and back on the first half,
  // then the right on the second half — the impact appears to jump the three
  // still middle balls. Pure horizontal slide, no swing, no strings.
  const moves: Record<number, { x: number[]; times: number[] }> = {
    0: { times: [0, 0.28, 0.5, 1], x: [0, -out, 0, 0] },
    4: { times: [0, 0.5, 0.78, 1], x: [0, 0, out, 0] },
  };

  return (
    <span className="flex items-center justify-center" style={{ height: d }}>
      {NEWTON_BALLS.map((i) => {
        const move = moves[i];
        return (
          <motion.span
            animate={reduce || !move ? undefined : { x: move.x }}
            className="rounded-full bg-current"
            key={i}
            style={{ height: d, width: d }}
            transition={
              reduce || !move
                ? undefined
                : {
                    duration: speed * 1.5,
                    ease: EASE_IN_OUT,
                    repeat: Number.POSITIVE_INFINITY,
                    times: move.times,
                  }
            }
          />
        );
      })}
    </span>
  );
}

function Helix({ size, speed, reduce }: PartProps) {
  const rows = 7;
  const dot = size * 0.15;
  const amp = size * 0.3;
  return (
    <span className="relative" style={{ height: size, width: size }}>
      {Array.from({ length: rows }, (_, r) => {
        const top = (r / (rows - 1)) * (size - dot);
        const delay = (r / rows) * speed;
        return (
          <span key={`row-${top}`}>
            <motion.span
              animate={
                reduce
                  ? { opacity: [0.5, 1, 0.5] }
                  : {
                      // Strand A — front strand, always theme-aware (foreground)
                      opacity: [1, 0.78, 1],
                      scale: [1, 0.68, 1],
                      x: [amp, -amp, amp],
                    }
              }
              className="absolute rounded-full"
              style={{
                background: "var(--helix-a, var(--foreground))",
                boxShadow:
                  "0 0 0 1px var(--background), 0 1px 3px oklch(0 0 0 / 0.18)",
                height: dot,
                left: size / 2 - dot / 2,
                top,
                width: dot,
              }}
              transition={{
                delay,
                duration: speed,
                ease: EASE_IN_OUT,
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
            <motion.span
              animate={
                reduce
                  ? { opacity: [0.5, 1, 0.5] }
                  : {
                      // Strand B — back strand, muted-foreground grey (never bg-matching) + brighter floor
                      opacity: [0.78, 1, 0.78],
                      scale: [0.68, 1, 0.68],
                      x: [-amp, amp, -amp],
                    }
              }
              className="absolute rounded-full"
              style={{
                background: "var(--helix-b, var(--muted-foreground))",
                boxShadow:
                  "0 0 0 1px var(--background), 0 1px 3px oklch(0 0 0 / 0.18)",
                height: dot,
                left: size / 2 - dot / 2,
                top,
                width: dot,
              }}
              transition={{
                delay,
                duration: speed,
                ease: EASE_IN_OUT,
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          </span>
        );
      })}
    </span>
  );
}

function Percent({ size, speed, reduce }: PartProps) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const dur = (reduce ? speed * 2 : speed) * 1000;
    const start = { t: 0 };
    const tickMs = 40;
    const id = setInterval(() => {
      start.t += tickMs;
      const next = Math.min(100, Math.round((start.t / dur) * 100));
      setP(next);
      if (next >= 100) {
        start.t = 0;
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [speed, reduce]);

  return (
    <span
      className="flex flex-col items-center"
      style={{ gap: size * 0.14, width: size * 1.4 }}
    >
      <span
        className="font-medium font-mono tabular-nums"
        style={{ fontSize: size * 0.42, lineHeight: 1 }}
      >
        {p}%
      </span>
      <span
        className="w-full overflow-hidden rounded-full bg-current/15"
        style={{ height: Math.max(3, size * 0.1) }}
      >
        <span
          className="block h-full rounded-full bg-current"
          style={{ width: `${p}%` }}
        />
      </span>
    </span>
  );
}

function Bars({ size, speed, reduce }: PartProps) {
  const bar = size * 0.16;
  return (
    <span
      className="flex items-center"
      style={{ gap: size * 0.1, height: size }}
    >
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          animate={
            reduce ? { opacity: [0.4, 1, 0.4] } : { scaleY: [0.3, 1, 0.3] }
          }
          className="rounded-full bg-current"
          key={i}
          style={{ height: size, originY: 1, width: bar }}
          transition={{
            delay: i * speed * 0.12,
            duration: speed,
            ease: EASE_IN_OUT,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ))}
    </span>
  );
}

function DotMatrix({ size, speed, reduce }: PartProps) {
  const n = 3;
  const gap = size * 0.14;
  const dot = (size - gap * (n - 1)) / n;
  const cells = Array.from({ length: n * n }, (_, idx) => idx);
  return (
    <span
      className="grid"
      style={{
        gap,
        gridTemplateColumns: `repeat(${n}, ${dot}px)`,
      }}
    >
      {cells.map((idx) => {
        const x = idx % n;
        const y = Math.floor(idx / n);
        // Diagonal wave: cells light in order of their distance from the corner.
        const delay = ((x + y) / (2 * (n - 1))) * speed;
        return (
          <motion.span
            animate={
              reduce
                ? { opacity: [0.3, 1, 0.3] }
                : { opacity: [0.2, 1, 0.2], scale: [0.7, 1, 0.7] }
            }
            className="rounded-full bg-current"
            key={idx}
            style={{ height: dot, width: dot }}
            transition={{
              delay,
              duration: speed,
              ease: EASE_IN_OUT,
              repeat: Number.POSITIVE_INFINITY,
            }}
          />
        );
      })}
    </span>
  );
}

// Ordered Bayer 4x4 matrix — the classic dithering threshold pattern. Cells
// light in this order, so the fill shimmers like a dissolving halftone.
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function Dither({ size, speed, reduce }: PartProps) {
  const n = 4;
  const gap = Math.max(1, size * 0.05);
  const cell = (size - gap * (n - 1)) / n;
  return (
    <span
      className="grid"
      style={{ gap, gridTemplateColumns: `repeat(${n}, ${cell}px)` }}
    >
      {BAYER_4.map((order, idx) => (
        <motion.span
          animate={
            reduce ? { opacity: [0.3, 1, 0.3] } : { opacity: [0.1, 1, 0.1] }
          }
          className="bg-current"
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed matrix cells, order never changes
          key={idx}
          style={{ height: cell, width: cell }}
          transition={{
            delay: (order / BAYER_4.length) * speed,
            duration: speed,
            ease: EASE_IN_OUT,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
      ))}
    </span>
  );
}
