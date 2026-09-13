export type SortDirection = "asc" | "desc";

export function sortAria(
  isActive: boolean,
  dir: SortDirection
): "ascending" | "descending" | "none" {
  if (!isActive) {
    return "none";
  }
  return dir === "asc" ? "ascending" : "descending";
}
