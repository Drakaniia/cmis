// biome-ignore-all lint/suspicious/noEmptyBlockStatements: polyfill stubs intentionally empty
import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia; sonner (Toaster) needs it in component tests.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
}

// jsdom / Base UI compat: PointerEvent missing or not constructable in some jsdom versions
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.PointerEvent !== "function") {
    w.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  }
  const proto = window.HTMLElement.prototype as unknown as Record<
    string,
    unknown
  >;
  if (typeof proto.hasPointerCapture !== "function") {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== "function") {
    proto.setPointerCapture = () => undefined;
  }
  if (typeof proto.releasePointerCapture !== "function") {
    proto.releasePointerCapture = () => undefined;
  }
  if (typeof window.ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver =
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  }
}
