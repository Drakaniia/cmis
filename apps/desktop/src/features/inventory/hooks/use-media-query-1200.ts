import { useEffect, useState } from "react";

export function useMediaQuery1200(): boolean {
  const [isWide, setIsWide] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia("(min-width: 1200px)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1200px)");
    const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mql.addEventListener("change", onChange);
    setIsWide(mql.matches);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return isWide;
}

/** CMIS-UI-03 §6 — 900px breakpoint: SKU hidden, minimap 6 buckets, actions ⋯ */
export function useMediaQuery900(): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia("(min-width: 900px)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 900px)");
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return matches;
}
