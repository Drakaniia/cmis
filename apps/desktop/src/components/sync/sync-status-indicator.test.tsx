import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_TABS } from "@/features/admin/settings/types";
import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
} from "@/test/sync-database";
import { SyncButton } from "./sync-button";
import { SyncSettingsPanel } from "./sync-settings";
import { SyncStatusIndicator } from "./sync-status-indicator";

/**
 * The UI layer, tested through the provider it actually runs under.
 *
 * The interesting assertions are the ones a user would make: does the title-bar
 * pill say something true, is the manual button disabled when there is nothing
 * to sync against, does the panel show the state the engine is actually in. The
 * database is real, the settings store is the only thing mocked.
 */

const harness = { current: openSyncedDatabase() };
const settingsState = {
  current: {
    enabled: true,
    endpoint: "https://cmis-sync.test",
    intervalMs: 30_000,
    lastError: null as string | null,
    lastSyncedAt: null as string | null,
    queueMaxSize: 1000,
    token: "",
  },
};

vi.mock("@/lib/db", () => ({
  getDb: () => Promise.resolve(harness.current.sync),
}));

vi.mock("@/lib/sync/sync-settings", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/sync/sync-settings")
  >("@/lib/sync/sync-settings");
  return {
    ...actual,
    loadSyncSettings: () => Promise.resolve({ ...settingsState.current }),
    saveSyncSettings: (patch: Record<string, unknown>) => {
      settingsState.current = { ...settingsState.current, ...patch } as never;
      return Promise.resolve({ ...settingsState.current });
    },
  };
});

const { SyncProvider } = await import("@/lib/sync/use-sync");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SyncProvider>{children}</SyncProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  harness.current = openSyncedDatabase();
  await flushSeedBacklog(harness.current.sync);
  settingsState.current = {
    enabled: true,
    endpoint: "https://cmis-sync.test",
    intervalMs: 30_000,
    lastError: null,
    lastSyncedAt: null,
    queueMaxSize: 1000,
    token: "",
  };
  // No request is expected: the startup sync is seconds away and the tests do
  // not advance the clock.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("unexpected network call")))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the title-bar indicator", () => {
  it("says sync is off when no endpoint is configured", async () => {
    settingsState.current = { ...settingsState.current, enabled: false };
    render(
      <Wrapper>
        <SyncStatusIndicator />
      </Wrapper>
    );
    expect(await screen.findByText("Sync off")).toBeInTheDocument();
  });

  it("says it is ready when there is nothing waiting", async () => {
    render(
      <Wrapper>
        <SyncStatusIndicator />
      </Wrapper>
    );
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("counts what is queued, so 'offline' is never silent", async () => {
    harness.current.db
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
         VALUES ('item-1', 'SKU-1', 'Paracetamol', 10, 10, ?, ?)`
      )
      .run(AFTER_SEEDS, AFTER_SEEDS);

    render(
      <Wrapper>
        <SyncStatusIndicator />
      </Wrapper>
    );
    expect(await screen.findByText("1 waiting")).toBeInTheDocument();
  });

  it("opens the settings panel from the chrome", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SyncStatusIndicator />
      </Wrapper>
    );

    await user.click(await screen.findByRole("button", { name: /Cloud sync/ }));
    expect(await screen.findByText("Cloud sync")).toBeInTheDocument();
    expect(screen.getByText("Worker endpoint")).toBeInTheDocument();
  });
});

describe("the manual sync button", () => {
  it("is disabled until an endpoint exists", async () => {
    settingsState.current = { ...settingsState.current, enabled: false };
    render(
      <Wrapper>
        <SyncButton />
      </Wrapper>
    );
    const button = await screen.findByRole("button", { name: /Sync now/ });
    expect(button).toBeDisabled();
  });

  it("is available once there is somewhere to sync to", async () => {
    render(
      <Wrapper>
        <SyncButton />
      </Wrapper>
    );
    const button = await screen.findByRole("button", { name: /Sync now/ });
    expect(button).toBeEnabled();
  });

  it("recounts what is waiting after a failed run, so the number is not stale", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <SyncStatusIndicator />
        <SyncButton />
      </Wrapper>
    );
    // The mount counts an empty database, so the pill starts at "Ready".
    expect(await screen.findByText("Ready")).toBeInTheDocument();

    // A change made after that count. A run that failed before reaching the pull
    // used to leave "waiting" frozen at the last successful count, so the panel
    // kept reporting a backlog that had already been sent.
    harness.current.db
      .prepare(
        `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
         VALUES ('item-1', 'SKU-1', 'Paracetamol', 10, 10, ?, ?)`
      )
      .run(AFTER_SEEDS, AFTER_SEEDS);

    await user.click(screen.getByRole("button", { name: /Sync now/ }));

    // The stubbed fetch rejects, so the run fails offline — and the count is
    // re-read on the way out instead of being left as it was.
    expect(await screen.findByText("Offline · 1 waiting")).toBeInTheDocument();
  });
});

describe("the settings panel", () => {
  it("shows the endpoint, the interval and the queue depth", async () => {
    render(
      <Wrapper>
        <SyncSettingsPanel />
      </Wrapper>
    );
    expect(await screen.findByText("Connection")).toBeInTheDocument();
    // The stored endpoint arrives with the settings read, not with the first
    // paint — the field is disabled until then so a save cannot clobber it.
    await waitFor(() => {
      expect(screen.getByLabelText("Worker endpoint")).toBeEnabled();
    });
    expect(screen.getByLabelText("Worker endpoint")).toHaveValue(
      "https://cmis-sync.test"
    );
    expect(screen.getByLabelText("Automatic interval")).toHaveValue("30000");
    expect(screen.getByText("Waiting to be sent")).toBeInTheDocument();
  });
});

describe("settings navigation", () => {
  it("has a Cloud Sync tab to land on", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toContain("sync");
  });
});
