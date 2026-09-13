"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";

function ThemeOption({
  icon,
  value,
  isActive,
  onClick,
}: {
  icon: JSX.Element;
  value: string;
  isActive?: boolean;
  onClick: (value: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      aria-checked={isActive}
      aria-label={`Switch to ${value} theme`}
      className="relative flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color] hover:text-foreground data-[active=true]:text-foreground [&_svg]:size-4"
      data-active={isActive}
      onClick={() => onClick(value)}
      role="radio"
    >
      {icon}{" "}
      {isActive && (
        <motion.span
          className="absolute inset-0 rounded-full border"
          layoutId="theme-option"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { bounce: 0.3, duration: 0.6, type: "spring" }
          }
        />
      )}
    </button>
  );
}

const THEME_OPTIONS = [
  {
    icon: <Monitor className="size-4" />,
    value: "system",
  },
  {
    icon: <Sun className="size-4" />,
    value: "light",
  },
  {
    icon: <Moon className="size-4" />,
    value: "dark",
  },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!isMounted) {
    return <div className="flex h-8 w-24" />;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="inset-ring-1 inset-ring-border inline-flex items-center overflow-clip rounded-full bg-background"
      initial={{ opacity: 0 }}
      key={String(isMounted)}
      role="radiogroup"
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
    >
      {THEME_OPTIONS.map((option) => (
        <ThemeOption
          icon={option.icon}
          isActive={theme === option.value}
          key={option.value}
          onClick={setTheme}
          value={option.value}
        />
      ))}
    </motion.div>
  );
}
