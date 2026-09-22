"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cmis/ui/components/card";
import { cn } from "@cmis/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { densitySpring } from "@/lib/motion";

/**
 * Apple §12 — Reports widgets are card materials, not just bordered boxes.
 * Density-aware padding; reduced-motion handled via CSS.
 */
export function WidgetCard({
  action,
  children,
  className,
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  subtitle?: string;
  title: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("min-w-0", className)}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      transition={reduceMotion ? { duration: 0 } : densitySpring}
    >
      <Card className="flex h-full flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="min-w-0">
            <CardTitle className="truncate font-semibold text-[13px] tracking-[-0.01em]">
              {title}
            </CardTitle>
            {subtitle ? (
              <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground leading-[1.4]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="flex h-[160px] animate-pulse items-end gap-1.5">
      <div className="h-[40%] w-full rounded-sm bg-muted" />
      <div className="h-[70%] w-full rounded-sm bg-muted" />
      <div className="h-[55%] w-full rounded-sm bg-muted" />
      <div className="h-[85%] w-full rounded-sm bg-muted" />
      <div className="h-[60%] w-full rounded-sm bg-muted" />
    </div>
  );
}

export function EmptyWidget({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-10 text-center">
      <p className="max-w-[22ch] text-muted-foreground text-sm leading-relaxed">
        {message}
      </p>
    </div>
  );
}
