import type { StepDetailsState } from "./types";

/** Apple Design §6: field shake — 4px spring, damping 0.6 / response 0.25s */
export const shakeVariants = {
  idle: { x: 0 },
  shake: {
    transition: { damping: 0.6, duration: 0.25, type: "spring" as const },
    x: [0, -4, 4, -3, 3, -1, 1, 0],
  },
};

export const FIELD_CLASS =
  "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

export const SELECT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

/** §9 — `pack_size` is capped at 40 characters, mirroring the template rule. */
export const PACK_SIZE_MAX_LENGTH = 40;

export const EMPTY_DETAILS: StepDetailsState = {
  category: "",
  form: "",
  name: "",
  packSize: "",
  strengthUnit: "",
  strengthValue: "",
};
