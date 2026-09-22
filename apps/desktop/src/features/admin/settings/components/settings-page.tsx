import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { BackupTab } from "@/features/backup/components/backup-tab";
import { branchCrossfadeMs } from "@/lib/motion";
import { useSettings } from "../hooks/use-settings";
import type { SettingsTabId } from "../types";
import { isSettingsTabId, SETTINGS_TABS } from "../types";
import { AuditTab } from "./audit-tab";
import { CategoriesTab } from "./categories-tab";
import { DataTab } from "./data-tab";
import { GeneralTab } from "./general-tab";
import { HealthTab } from "./health-tab";
import { SettingsTabBar } from "./settings-tab-bar";
import { SuppliersTab } from "./suppliers-tab";
import { ThresholdsTab } from "./thresholds-tab";
import { UpdatesTab } from "./updates-tab";

function tabFromHash(): SettingsTabId {
  if (typeof window === "undefined") {
    return "general";
  }
  const id = window.location.hash.replace("#", "");
  return isSettingsTabId(id) ? id : "general";
}

/**
 * CMIS-UI-09 §2 — System Settings.
 *
 * The tab bar is the page's wayfinding; each panel is one focused tool rather
 * than a mega-form (00 §16 Simplicity). Deep links land on a tab via the URL
 * hash so the palette and Backup card can jump straight in (§6).
 *
 * Administration tabs (Audit, Data, Health) are now embedded here instead of
 * being separate sidebar pages.
 */
export function SettingsPage() {
  const settings = useSettings();
  const [tab, setTab] = useState<SettingsTabId>(tabFromHash);
  const hash = useRouterState({ select: (state) => state.location.hash });

  // Deep links (palette, Backup card) land on their tab via the URL hash.
  useEffect(() => {
    const id = hash.replace("#", "");
    if (isSettingsTabId(id)) {
      setTab(id);
    }
  }, [hash]);

  const selectTab = useCallback((id: SettingsTabId) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const _meta = SETTINGS_TABS.find((entry) => entry.id === tab);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SettingsTabBar active={tab} onSelect={selectTab} />

      <div className="min-h-0 flex-1 overflow-auto pb-6">
        <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4">
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={tab}
              transition={{ duration: branchCrossfadeMs / 1000 }}
            >
              {tab === "general" ? (
                <GeneralTab
                  general={settings.state.general}
                  onChange={settings.updateGeneral}
                />
              ) : null}
              {tab === "thresholds" ? (
                <ThresholdsTab
                  alerts={settings.state.alerts}
                  onSetAlerts={settings.setAlerts}
                  onSetOverride={settings.setOverride}
                />
              ) : null}
              {tab === "suppliers" ? (
                <SuppliersTab
                  onAdd={settings.addSupplier}
                  onRemove={settings.removeSupplier}
                  onUpdate={settings.updateSupplier}
                  suppliers={settings.state.suppliers}
                />
              ) : null}
              {tab === "categories" ? <CategoriesTab /> : null}
              {tab === "audit" ? <AuditTab /> : null}
              {tab === "data" ? <DataTab /> : null}
              {tab === "health" ? <HealthTab /> : null}
              {tab === "backup" ? <BackupTab /> : null}
              {tab === "updates" ? <UpdatesTab /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
