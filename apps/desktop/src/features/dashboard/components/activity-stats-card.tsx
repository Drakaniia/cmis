/**
 * CMIS-UI-01 §5 — Activity stats card.
 *
 * Displays activity metrics with an animated bar chart,
 * a primary value, and a trend indicator.
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cmis/ui/components/card";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export interface ChartDataPoint {
  currentValue: number;
  label: string;
  previousValue: number;
}

export interface ActivityStatsCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  changeDescription: string;
  changeValue: number;
  chartData: ChartDataPoint[];
  icon: React.ReactNode;
  mainValue: string;
  onActionClick?: () => void;
  primaryBarClassName?: string;
  secondaryBarClassName?: string;
  title: string;
}

function changeColorClass(changeValue: number): string {
  if (changeValue > 0) {
    return "text-green-600 dark:text-green-400";
  }
  if (changeValue < 0) {
    return "text-red-600 dark:text-red-400";
  }
  return "text-muted-foreground";
}

function ActivityStatsCard({
  className,
  title,
  icon,
  mainValue,
  changeValue,
  changeDescription,
  chartData,
  onActionClick,
  primaryBarClassName,
  secondaryBarClassName,
  ...props
}: ActivityStatsCardProps) {
  const ChangeIndicator = changeValue > 0 ? ArrowUpRight : ArrowDownRight;
  const changeColor = changeColorClass(changeValue);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.2,
        staggerChildren: 0.08,
      },
    },
  };

  const barVariants = {
    hidden: { height: "0%", opacity: 0 },
    visible: (height: number) => ({
      height: `${height}%`,
      opacity: 1,
      transition: {
        damping: 25,
        stiffness: 300,
        type: "spring" as const,
      },
    }),
  };

  return (
    <Card className={cn("h-full overflow-hidden", className)} {...props}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <CardTitle className="font-medium text-muted-foreground text-sm">
            {title}
          </CardTitle>
        </div>
        {onActionClick ? (
          <button
            aria-label="View details"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onActionClick}
            type="button"
          >
            <ArrowRight className="size-4" />
          </button>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="mb-2 font-bold text-2xl text-foreground">
          {mainValue}
        </div>
        <div
          className={cn("flex items-center font-medium text-xs", changeColor)}
        >
          <ChangeIndicator aria-hidden="true" className="mr-1 h-3 w-3" />
          <span>
            {Math.abs(changeValue)}%{" "}
            <span className="text-muted-foreground">{changeDescription}</span>
          </span>
        </div>

        {/* Bar Chart Section */}
        <div className="mt-6 h-32 w-full">
          <AnimatePresence>
            <motion.div
              animate="visible"
              className="flex h-full w-full items-end justify-between gap-2"
              initial="hidden"
              key="chart"
              variants={containerVariants}
            >
              {chartData.map((point) => (
                <div
                  className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  key={point.label}
                >
                  <div className="relative flex h-full w-full items-end justify-center gap-1.5">
                    <motion.div
                      aria-label={`Current value: ${point.currentValue}`}
                      aria-valuenow={point.currentValue}
                      className={cn(
                        "w-full rounded-sm bg-primary",
                        primaryBarClassName
                      )}
                      custom={point.currentValue}
                      role="progressbar"
                      variants={barVariants}
                    />
                    <motion.div
                      aria-label={`Previous value: ${point.previousValue}`}
                      aria-valuenow={point.previousValue}
                      className={cn(
                        "w-full rounded-sm bg-muted",
                        secondaryBarClassName
                      )}
                      custom={point.previousValue}
                      role="progressbar"
                      variants={barVariants}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {point.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}

export { ActivityStatsCard };
