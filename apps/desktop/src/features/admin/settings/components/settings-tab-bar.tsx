import { motion } from "motion/react";
import { useCallback } from "react";

import { sheetSpring } from "@/lib/motion";
import type { SettingsTabId } from "../types";
import { SETTINGS_TABS } from "../types";

function SettingsTabButton({
  onSelect,
  selected,
  tab,
}: {
  onSelect: (id: SettingsTabId) => void;
  selected: boolean;
  tab: (typeof SETTINGS_TABS)[number];
}) {
  const handleClick = useCallback(() => {
    onSelect(tab.id);
  }, [onSelect, tab.id]);

  return (
    <button
      aria-controls={`settings-panel-${tab.id}`}
      aria-selected={selected}
      className={`press-feedback relative shrink-0 snap-start rounded-t-md px-3 py-1.5 text-[12px] leading-tight tracking-[-0.01em] transition-colors ${
        selected
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground"
      }`}
      id={`settings-tab-${tab.id}`}
      onClick={handleClick}
      role="tab"
      type="button"
    >
      {tab.label}
      {selected ? (
        <motion.span
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
          layoutId="settings-tab-underline"
          transition={sheetSpring}
        />
      ) : null}
    </button>
  );
}

/**
 * CMIS-UI-09 §2.2 — sticky tab bar under the header.
 *
 * At 800px the six tabs can't fit, so the strip scrolls horizontally with
 * `snap-x` (board H-scroll familiarity, 05) instead of collapsing into a nested
 * sidebar. The active underline springs `1.0/0.30` on switch and content
 * cross-fades — tabs are wayfinding, not spatial travel (00 §3).
 */
export function SettingsTabBar({
  active,
  onSelect,
}: {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
}) {
  return (
    <div className="shrink-0 border-border/50 border-b bg-card">
      <div
        aria-label="Settings sections"
        className="scrollbar-none flex snap-x snap-mandatory items-center gap-1 overflow-x-auto overscroll-x-contain px-2"
        role="tablist"
      >
        {SETTINGS_TABS.map((tab) => (
          <SettingsTabButton
            key={tab.id}
            onSelect={onSelect}
            selected={tab.id === active}
            tab={tab}
          />
        ))}
      </div>
    </div>
  );
}
