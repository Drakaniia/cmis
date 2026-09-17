import { describe, expect, it } from "vitest";

import { buildDispensingCsv } from "./export-dispensing";
import {
  buildDispensingRows,
  type DispensingItemSource,
  type DispensingRecordSource,
  type DispensingRequestSource,
} from "./rows";
import { batchLabel, hasBatch, NO_BATCH_LABEL } from "./types";

/**
 * The log has to tell a quick deduction from a queued hand-over: both can read
 * "Walk-in", and a deduction of an item with no batch rows carries an empty
 * batch. These cases pin the join down, including what happens when the request
 * a record points at is gone.
 */

function record(overrides: Partial<DispensingRecordSource> = {}) {
  return {
    at: "2026-09-17T09:00:00.000Z",
    batch: "B-4412",
    id: 1,
    qty: 3,
    request_id: "REQ-2026-0001",
    staff: "Nurse Ada",
    ...overrides,
  } satisfies DispensingRecordSource;
}

function request(overrides: Partial<DispensingRequestSource> = {}) {
  return {
    id: "REQ-2026-0001",
    medicine: "Paracetamol 500 mg",
    requestor_id: "STU-2024-0831",
    requestor_name: "Maria Santos",
    source: "queue",
    ...overrides,
  } satisfies DispensingRequestSource;
}

const ITEMS: DispensingItemSource[] = [
  { display_name: "Paracetamol 500 mg", name: "Paracetamol", sku: "SKU-1" },
];

describe("buildDispensingRows", () => {
  it("names a queued hand-over's requestor, batch and SKU", () => {
    const [row] = buildDispensingRows([record()], [request()], ITEMS);

    expect(row).toMatchObject({
      batch: "B-4412",
      branch: "Local",
      id: "DSP-000001",
      medicine: "Paracetamol 500 mg",
      medicineSku: "SKU-1",
      qty: 3,
      requestLink: "REQ-2026-0001",
      requestor: "Maria Santos",
      requestorId: "STU-2024-0831",
      source: "queue",
      staff: "Nurse Ada",
      status: "dispensed",
    });
  });

  it("marks a quick deduction, whose requestor is anonymous by construction", () => {
    const [row] = buildDispensingRows(
      [record({ batch: "", qty: 2 })],
      [
        request({
          requestor_id: "",
          requestor_name: "",
          source: "quick-deduct",
        }),
      ],
      ITEMS
    );

    expect(row?.source).toBe("quick-deduct");
    expect(row?.requestor).toBe("Walk-in");
    expect(row?.requestorId).toBe("");
    // An empty batch is a recorded absence, not a blank cell.
    expect(row?.batch).toBe("");
    expect(hasBatch(row ?? { batch: "" })).toBe(false);
    expect(batchLabel(row ?? { batch: "" })).toBe(NO_BATCH_LABEL);
  });

  it("keeps a row whose request is gone, so the movement is never dropped", () => {
    const [row] = buildDispensingRows(
      [record({ request_id: "REQ-2026-9999" })],
      [request()],
      ITEMS
    );

    expect(row?.requestLink).toBeNull();
    expect(row?.medicine).toBe("");
    expect(row?.requestor).toBe("Walk-in");
    // Unknown provenance reads as the default, never as a quick deduction.
    expect(row?.source).toBe("queue");
  });

  it("reads an unknown stored source as a queued request", () => {
    const [row] = buildDispensingRows(
      [record()],
      [request({ source: "something-else" })],
      ITEMS
    );
    expect(row?.source).toBe("queue");
  });

  it("falls back to the bare name when no display name is stored", () => {
    const [row] = buildDispensingRows(
      [record()],
      [request({ medicine: "Paracetamol" })],
      [{ display_name: "", name: "Paracetamol", sku: "SKU-9" }]
    );
    expect(row?.medicineSku).toBe("SKU-9");
  });

  it("orders the log newest first", () => {
    const rows = buildDispensingRows(
      [
        record({ at: "2026-09-15T09:00:00.000Z", id: 1 }),
        record({ at: "2026-09-17T09:00:00.000Z", id: 2 }),
      ],
      [request()],
      ITEMS
    );
    expect(rows.map((row) => row.id)).toEqual(["DSP-000002", "DSP-000001"]);
  });
});

describe("buildDispensingCsv", () => {
  it("exports the source, so the audit artifact keeps the distinction", () => {
    const rows = buildDispensingRows(
      [record({ batch: "", qty: 2 })],
      [request({ requestor_name: "", source: "quick-deduct" })],
      ITEMS
    );

    const [header, line] = buildDispensingCsv(rows).split("\n");
    expect(header).toContain('"Source"');
    expect(line).toContain('"Quick deduct"');
    // The batch-less case exports as an empty cell, not as a placeholder.
    expect(line).toContain('""');
  });
});
