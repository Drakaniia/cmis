"use client";

import { cn } from "@cmis/ui/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** `""` means "no value typed yet" — the parent decides what that blocks. */
export type QuantityStepperValue = number | "";

const NON_DIGIT_PATTERN = /\D/g;

/** Hold-to-repeat: short delay, then fast ticks (Apple stepper convention). */
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 70;

const PAGE_STEP = 10;

const INPUT_CLASS =
  "h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed";

const BUTTON_CLASS =
  "press-feedback flex h-1/2 w-6 min-h-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40";

export interface QuantityStepperProps {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Marks the field red without owning the message. */
  invalid?: boolean;
  max?: number;
  min?: number;
  onChange: (next: QuantityStepperValue) => void;
  placeholder?: string;
  step?: number;
  /** Numbers and digit-only strings both work, so existing string state fits. */
  value: number | string;
}

function toText(value: number | string): string {
  if (typeof value === "string") {
    return value;
  }
  return Number.isFinite(value) ? String(value) : "";
}

function parseText(text: string): QuantityStepperValue {
  const digits = text.replace(NON_DIGIT_PATTERN, "");
  return digits === "" ? "" : Number(digits);
}

export function QuantityStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder = "0",
  disabled = false,
  invalid = false,
  id,
  className,
  "aria-label": ariaLabel,
}: QuantityStepperProps) {
  const [text, setText] = useState(() => toText(value));
  const textRef = useRef(text);
  /** Set when this component produced the value, so echoes don't reset typing. */
  const emittedRef = useRef<QuantityStepperValue | null>(null);
  const holdRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);

  // Adopt values set by the parent (modal reopen, form reset, clamping).
  useEffect(() => {
    if (emittedRef.current === value) {
      return;
    }
    const next = toText(value);
    textRef.current = next;
    setText(next);
  }, [value]);

  const emit = useCallback(
    (next: QuantityStepperValue) => {
      const nextText = next === "" ? "" : String(next);
      textRef.current = nextText;
      emittedRef.current = next;
      setText(nextText);
      onChange(next);
    },
    [onChange]
  );

  const clamp = useCallback(
    (next: number): number => {
      let result = next;
      if (min !== undefined && result < min) {
        result = min;
      }
      if (max !== undefined && result > max) {
        result = max;
      }
      return result;
    },
    [max, min]
  );

  // Reads the ref, never the render value: hold-to-repeat would otherwise
  // re-apply the delta to a stale base and stick.
  const bump = useCallback(
    (delta: number) => {
      const current = parseText(textRef.current);
      if (current === "") {
        emit(clamp(min ?? Math.max(0, delta)));
        return;
      }
      emit(clamp(current + delta));
    },
    [clamp, emit, min]
  );

  const stopRepeat = useCallback(() => {
    if (holdRef.current !== null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  const currentValue = parseText(text);
  const upDisabled = disabled || (max !== undefined && currentValue === max);
  const downDisabled = disabled || (min !== undefined && currentValue === min);

  const startRepeat = useCallback(
    (delta: number) => {
      stopRepeat();
      holdRef.current = window.setTimeout(() => {
        repeatRef.current = window.setInterval(
          () => bump(delta),
          HOLD_INTERVAL_MS
        );
      }, HOLD_DELAY_MS);
    },
    [bump, stopRepeat]
  );

  const handlePointerDown = useCallback(
    (delta: number) => (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }
      bump(delta);
      startRepeat(delta);
    },
    [bump, startRepeat]
  );

  // Keyboard activation lands here (Enter/Space); mouse already stepped on
  // pointerdown, so the click itself must not step again.
  const handleButtonKeyDown = useCallback(
    (delta: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      bump(delta);
    },
    [bump]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value.replace(NON_DIGIT_PATTERN, "");
      textRef.current = raw;
      const parsed = parseText(raw);
      emittedRef.current = parsed;
      setText(raw);
      onChange(parsed);
    },
    [onChange]
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const deltas: Record<string, number> = {
        ArrowDown: -step,
        ArrowUp: step,
        PageDown: -PAGE_STEP * step,
        PageUp: PAGE_STEP * step,
      };
      const delta = deltas[event.key];
      if (delta !== undefined) {
        event.preventDefault();
        bump(delta);
        return;
      }
      // Home/End jump to the bounds, like a native number input.
      if (event.key === "Home") {
        event.preventDefault();
        emit(clamp(min ?? 0));
        return;
      }
      if (event.key === "End" && max !== undefined) {
        event.preventDefault();
        emit(clamp(max));
      }
    },
    [bump, clamp, emit, max, min, step]
  );

  const handleBlur = useCallback(() => {
    const current = parseText(textRef.current);
    if (current === "") {
      return;
    }
    const next = clamp(current);
    if (String(next) !== textRef.current) {
      emit(next);
    }
  }, [clamp, emit]);

  const handlePointerDownUp = handlePointerDown(step);
  const handlePointerDownDown = handlePointerDown(-step);
  const handleKeyDownUp = handleButtonKeyDown(step);
  const handleKeyDownDown = handleButtonKeyDown(-step);

  return (
    <div
      className={cn(
        "flex h-8 w-full items-stretch overflow-hidden rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
        invalid && "border-destructive",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      data-slot="quantity-stepper"
    >
      <input
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={currentValue === "" ? undefined : currentValue}
        autoComplete="off"
        className={cn(INPUT_CLASS, "[appearance:textfield]")}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        onBlur={handleBlur}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        role="spinbutton"
        type="text"
        value={text}
      />
      <div className="flex shrink-0 flex-col border-input border-l">
        <button
          aria-label="Increase quantity"
          className={cn(BUTTON_CLASS, "border-border/50 border-b")}
          disabled={upDisabled}
          onKeyDown={handleKeyDownUp}
          onPointerCancel={stopRepeat}
          onPointerDown={handlePointerDownUp}
          onPointerLeave={stopRepeat}
          onPointerUp={stopRepeat}
          tabIndex={-1}
          type="button"
        >
          <ChevronUp aria-hidden className="size-3.5" />
        </button>
        <button
          aria-label="Decrease quantity"
          className={BUTTON_CLASS}
          disabled={downDisabled}
          onKeyDown={handleKeyDownDown}
          onPointerCancel={stopRepeat}
          onPointerDown={handlePointerDownDown}
          onPointerLeave={stopRepeat}
          onPointerUp={stopRepeat}
          tabIndex={-1}
          type="button"
        >
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
