import { motion, useReducedMotion } from "motion/react";
import { Loader } from "@/components/motion/loader";

interface AppSplashProps {
  visible: boolean;
}

export function AppSplash({ visible }: AppSplashProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      animate={
        visible
          ? { opacity: 1, pointerEvents: "auto" as const }
          : { opacity: 0, pointerEvents: "none" as const }
      }
      aria-hidden={!visible}
      aria-label="Loading CMIS"
      className="fixed inset-0 z-[9999] flex select-none flex-col items-center justify-center overflow-hidden bg-background"
      data-testid="app-splash"
      initial={false}
      role="status"
      // Apple §14 — reduced-transparency fallback: already solid bg, no blur to drop
      // Apple §14 — reduced-motion: cross-fade only (no scale/blur)
      style={{
        // Ensure splash paints over Tauri's transparent titlebar area too
        paddingTop: "env(titlebar-area-height, 0px)",
      }}
      transition={
        reduceMotion
          ? { duration: 0.2, ease: "easeOut" }
          : visible
            ? { duration: 0.35, ease: [0.22, 0.68, 0, 1] }
            : { duration: 0.45, ease: [0.22, 0.68, 0, 1] }
      }
    >
      {/* Subtle canvas tint — matches page-canvas hierarchy without being translucent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "color-mix(in oklch, var(--background) 92%, var(--muted))",
        }}
      />

      {/* Center stack — spatial consistency: single vertical column, centered anchor */}
      <motion.div
        animate={
          reduceMotion
            ? { opacity: 1 }
            : visible
              ? { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }
              : { filter: "blur(6px)", opacity: 0, scale: 0.98, y: 8 }
        }
        className="relative flex flex-col items-center gap-7 px-6 text-center"
        initial={false}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : {
                delay: visible ? 0.08 : 0,
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }
        }
      >
        {/* ── Logo mark — Apple dark-theme card style (like earlier splash) — bigger + spring — will also be used in sidebar ── */}
        <motion.div
          animate={
            reduceMotion
              ? { opacity: 1 }
              : visible
                ? { filter: "blur(0px)", opacity: 1, scale: 1 }
                : { filter: "blur(4px)", opacity: 0, scale: 0.96 }
          }
          aria-hidden
          className="flex items-center justify-center"
          initial={
            reduceMotion
              ? { opacity: 1 }
              : { filter: "blur(8px)", opacity: 0, scale: 0.9 }
          }
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 22,
            boxShadow:
              "0 1px 3px oklch(0 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.1)",
            height: 96,
            overflow: "hidden",
            padding: 12,
            width: 96,
          }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : {
                  bounce: 0,
                  duration: 0.7,
                  type: "spring",
                }
          }
        >
          <img
            alt="CMIS logo"
            className="h-full w-full object-contain dark:hidden"
            draggable={false}
            height={72}
            src="/cmis-dark-transparent.png"
            width={72}
          />
          <img
            alt="CMIS logo"
            className="hidden h-full w-full object-contain dark:block"
            draggable={false}
            height={72}
            src="/cmis-white-transparent.png"
            width={72}
          />
        </motion.div>

        {/* ── Title block — Apple §15 typography: tighten as size grows ── */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="font-bold font-sans text-foreground"
            style={{
              fontOpticalSizing: "auto",
              fontSize: "clamp(1.9rem, 4vw, 2.4rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            CMIS
          </h1>
          <p
            className="max-w-[28ch] text-balance text-muted-foreground"
            style={{
              fontSize: "0.8125rem",
              letterSpacing: "0.01em",
              lineHeight: 1.45,
            }}
          >
            Clinic Medicine Inventory System
          </p>
        </div>

        {/* ── Helix loader — two-tone: foreground + muted-foreground (theme-aware, never bg-matching) + apple spring ── */}
        <motion.div
          animate={
            reduceMotion
              ? { opacity: 1 }
              : visible
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 4 }
          }
          className="flex flex-col items-center gap-4 pt-1"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
          style={
            {
              // --helix-a = front (foreground white/black), --helix-b = back (muted grey)
              "--helix-a": "var(--foreground)",
              "--helix-b": "var(--muted-foreground)",
            } as React.CSSProperties
          }
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : {
                  bounce: 0,
                  delay: visible ? 0.18 : 0,
                  duration: 0.6,
                  type: "spring",
                }
          }
        >
          <Loader
            aria-label="Loading"
            className="text-foreground"
            size={52}
            speed={0.88}
            variant="helix"
          />
          <span
            className="text-muted-foreground"
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Loading workspace
          </span>
        </motion.div>
      </motion.div>

      {/* ── Footer — version + subtle hint, anchored to bottom for wayfinding ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-6 pb-[max(20px,env(safe-area-inset-bottom,0px))]">
        <span
          className="text-muted-foreground/60"
          style={{ fontSize: "0.6875rem", letterSpacing: "0.04em" }}
        >
          Preparing database &amp; inventory
        </span>
        <span aria-hidden className="h-px w-12 rounded-full bg-border/60" />
      </div>
    </motion.div>
  );
}
