"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import type { JSX } from "react";

function ThemeOption({
  icon,
  value,
  isActive,
  onSelect,
}: {
  icon: JSX.Element;
  value: string;
  isActive: boolean;
  onSelect: (value: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-[color] hover:text-foreground has-[:checked]:text-foreground has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring [&_svg]:size-4">
      <input
        aria-label={`Switch to ${value} theme`}
        checked={isActive}
        className="sr-only"
        name="theme"
        onChange={() => onSelect(value)}
        type="radio"
        value={value}
      />
      {icon}{" "}
      {isActive ? (
        <motion.span
          className="absolute inset-0 rounded-full border"
          layoutId="theme-option"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { bounce: 0.3, duration: 0.6, type: "spring" }
          }
        />
      ) : null}
    </label>
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

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="inset-ring-1 inset-ring-border inline-flex items-center overflow-clip rounded-full bg-background"
      initial={{ opacity: 0 }}
      key="theme-switcher"
      role="radiogroup"
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
    >
      {THEME_OPTIONS.map((option) => (
        <ThemeOption
          icon={option.icon}
          isActive={theme === option.value}
          key={option.value}
          onSelect={setTheme}
          value={option.value}
        />
      ))}
    </motion.div>
  );
}
