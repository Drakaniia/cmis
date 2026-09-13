export function chartNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
