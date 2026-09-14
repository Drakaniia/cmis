import { cn } from "@cmis/ui/lib/utils";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type IconType =
  | React.ElementType
  | React.FunctionComponent<React.SVGProps<SVGSVGElement>>;

export type TrendType = "up" | "down" | "neutral";

export interface DashboardMetricCardProps {
  /** Optional class name for the card container. */
  className?: string;
  /** Optional icon to display in the card header. */
  icon?: IconType;
  /** The descriptive title of the metric (e.g., "Total Users", "Revenue"). */
  title: string;
  /** The percentage or absolute change for the trend (e.g., "2.5%"). */
  trendChange?: string;
  /** The direction of the trend ('up', 'down', 'neutral'). */
  trendType?: TrendType;
  /** The main value of the metric (e.g., "1,234", "$5.6M", "92%"). */
  value: string;
}

const TREND_ICONS: Record<TrendType, IconType> = {
  down: ArrowDown,
  neutral: Minus,
  up: ArrowUp,
};

const TREND_COLOR_CLASSES: Record<TrendType, string> = {
  down: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
  up: "text-green-600 dark:text-green-400",
};

const TREND_LABELS: Record<TrendType, string> = {
  down: "decrease",
  neutral: "change",
  up: "increase",
};

/**
 * Apple Design §12 — Glass metric card with translucent material.
 * §15 — Optical typography: display-sized value with tight tracking,
 *         caption-sized label with slight positive tracking.
 * §1  — Press feedback via motion spring (scale 0.97 on press).
 * §4  — Hover lift via spring (scale 1.02, shadow deepens).
 * §14 — Reduced motion: no scale, just opacity cross-fade.
 */
const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  value,
  title,
  icon: IconComponent,
  trendChange,
  trendType = "neutral",
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const TrendIcon = TREND_ICONS[trendType];
  const trendColorClass = TREND_COLOR_CLASSES[trendType];

  return (
    <motion.div
      className={cn("group/card cursor-pointer", className)}
      transition={{
        bounce: 0,
        duration: 0.3,
        type: "spring",
      }}
      whileHover={reduceMotion ? undefined : { scale: 1.02, y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
    >
      {/* §12 Glass card — translucent material with backdrop blur */}
      <div
        className={cn(
          "relative flex h-full flex-col gap-3 overflow-hidden rounded-xl p-4",
          /* §12 Material: translucent surface with blur */
          "border border-border/40 bg-card/70 backdrop-blur-xl",
          /* §12 Depth: subtle shadow that deepens on hover */
          "shadow-[0_1px_3px_oklch(0_0_0/0.04),0_4px_12px_oklch(0_0_0/0.02)]",
          "transition-shadow duration-200",
          "group-hover/card:shadow-[0_2px_8px_oklch(0_0_0/0.06),0_8px_24px_oklch(0_0_0/0.04)]",
          /* §12 Bright top edge — light catching the material */
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-b before:from-white/40 before:to-transparent dark:before:from-white/10"
        )}
      >
        {/* Header: icon + label */}
        <div className="flex items-center justify-between">
          {/* §15 Caption: slight positive tracking for legibility at small size */}
          <span className="font-medium text-caption text-muted-foreground uppercase tracking-widest">
            {title}
          </span>
          {IconComponent ? (
            <IconComponent
              aria-hidden="true"
              className="size-4 text-muted-foreground/60"
            />
          ) : null}
        </div>

        {/* §15 Display value: tight tracking as size grows, optical sizing */}
        <div
          className="font-bold text-foreground tabular-nums"
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>

        {/* Trend indicator */}
        {trendChange ? (
          <p
            className={cn(
              "flex items-center gap-1 font-medium text-xs",
              trendColorClass
            )}
          >
            <TrendIcon aria-hidden="true" className="size-3" />
            {trendChange} {TREND_LABELS[trendType]}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
};

export { DashboardMetricCard };
