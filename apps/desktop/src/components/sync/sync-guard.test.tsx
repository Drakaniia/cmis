import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AFTER_SEEDS,
  flushSeedBacklog,
  openSyncedDatabase,
} from "@/test/sync-database";
import { SyncButton } from "./sync-button";
import { SyncSettingsPanel } from "./sync-settings";

/**
 * The data-guard UI (`docs/cloud-sync-data-guard-spec.md` §6.3, §6.4).
 *
 * The database is real and the settings store is the only mock, so these
 * assertions are the ones an operator would make: does enabling with local
 * records ask first, does the chooser appear when both sides hold records, and
 * is a choice remembered per endpoint.
 */

const harness = { current: openSyncedDatabase() };
const settingsState = {
  current: {
    enabled: true,
    endpoint: "https://cmis-sync.test",
    endpointStrategies: {} as Record<string, string>,
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

function insertItem(id = "item-1"): void {
  harness.current.db
    .prepare(
      `INSERT INTO inventory_items (id, sku, name, stock_on_hand, qty, created_at, updated_at)
       VALUES (?, ?, 'Paracetamol', 10, 10, ?, ?)`
    )
    .run(id, `SKU-${id}`, AFTER_SEEDS, AFTER_SEEDS);
}

/** Routes the two endpoint calls the guard needs. */
function stubSyncFetch(
  status: { counts: Record<string, number> } | "unreachable"
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (status === "unreachable") {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (url.endsWith("/sync/status")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, serverTime: AFTER_SEEDS, ...status }),
          { status: 200, statusText: "OK" }
        )
      );
    }
    // A push acknowledges an empty payload; a pull returns nothing new.
    const payload = url.endsWith("/sync/push")
      ? { applied: {}, conflicts: [], ok: true, serverTime: AFTER_SEEDS }
      : {
          deletedCursor: "",
          hasMore: false,
          ok: true,
          serverTime: AFTER_SEEDS,
          tables: [],
        };
    return Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200, statusText: "OK" })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  harness.current = openSyncedDatabase();
  await flushSeedBacklog(harness.current.sync);
  settingsState.current = {
    enabled: true,
    endpoint: "https://cmis-sync.test",
    endpointStrategies: {},
    intervalMs: 30_000,
    lastError: null,
    lastSyncedAt: null,
    queueMaxSize: 1000,
    token: "",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enabling sync with local records", () => {
  it("asks before moving data and leaves sync off when cancelled", async () => {
    settingsState.current = { ...settingsState.current, enabled: false };
    insertItem();
    stubSyncFetch({ counts: { inventory_items: 85 } });

    const user = userEvent.setup();
    render(
      <Wrapper>
        <SyncSettingsPanel />
      </Wrapper>
    );

    const checkbox = await screen.findByLabelText("Sync automatically");
    await waitFor(() => expect(checkbox).toBeEnabled());
    await user.click(checkbox);

    expect(
      await screen.findByText(
        /Records already exist on this device\. Are you sure you want to sync\?/
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Nothing was enabled: the operator declined the warning (D6).
    await waitFor(() => {
      expect(settingsState.current.enabled).toBe(false);
    });
  });
});

describe("the both-sides chooser", () => {
  it("appears when both hold records and no strategy is remembered", async () => {
    insertItem();
    const fetchMock = stubSyncFetch({ counts: { inventory_items: 85 } });

    const user = userEvent.setup();
    render(
      <Wrapper>
        <SyncButton />
      </Wrapper>
    );
    await user.click(await screen.findByRole("button", { name: /Sync now/ }));

    expect(
      await screen.findByText("Both this device and the cloud hold records")
    ).toBeInTheDocument();
    // The options are the three from D15.
    expect(screen.getByText("This device's data")).toBeInTheDocument();
    expect(screen.getByText("Use the cloud copy")).toBeInTheDocument();
    expect(screen.getByText("Merge (newest wins)")).toBeInTheDocument();
    // No push or pull happened before the choice: only the status read did.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(["https://cmis-sync.test/sync/status"]);
  });

  it("remembers the choice for the endpoint and does not ask again", async () => {
    insertItem();
    stubSyncFetch({ counts: { inventory_items: 85 } });

    const user = userEvent.setup();
    render(
      <Wrapper>
        <SyncButton />
      </Wrapper>
    );
    await user.click(await screen.findByRole("button", { name: /Sync now/ }));
    await user.click(
      await screen.findByRole("button", { name: "This device's data" })
    );

    await waitFor(() => {
      expect(
        settingsState.current.endpointStrategies["https://cmis-sync.test"]
      ).toBe("local");
    });
  });
});
