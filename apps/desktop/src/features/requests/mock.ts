/**
 * CMIS-UI-05 — mock request queue.
 *
 * In-memory only (matching features/inventory). Medicine names mirror
 * `features/inventory/mock.ts` verbatim so the dispense flow can verify real
 * stock and pick a FEFO batch.
 */

import { FLOW_ORDER } from "./transitions";
import type {
  DenyReason,
  DispensingRecord,
  InternalNote,
  RequestItem,
  Requestor,
  RequestStatus,
  StatusHistoryEntry,
} from "./types";

const STAFF = "M. Reyes";

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Walks the flow order to build a plausible, monotonic status history. */
function buildHistory(
  status: RequestStatus,
  submittedAt: string,
  deniedNote?: string
): StatusHistoryEntry[] {
  const entries: StatusHistoryEntry[] = [
    { at: submittedAt, by: "Viewer", from: null, to: "pending" },
  ];

  if (status === "denied") {
    entries.push({
      at: addMinutes(submittedAt, 22),
      by: STAFF,
      from: "pending",
      ...(deniedNote ? { note: deniedNote } : {}),
      to: "denied",
    });
    return entries;
  }

  const target = FLOW_ORDER.indexOf(status);
  for (let i = 1; i <= target; i += 1) {
    entries.push({
      at: addMinutes(submittedAt, i * 14),
      by: STAFF,
      from: FLOW_ORDER[i - 1],
      to: FLOW_ORDER[i],
    });
  }
  return entries;
}

interface MockInput {
  category: string;
  deniedNote?: string;
  deniedReason?: DenyReason;
  dispensing?: Omit<DispensingRecord, "at">;
  id: string;
  medicine: string;
  minutes: number;
  notes?: InternalNote[];
  qty: number;
  reason: string;
  requestor: Requestor;
  status: RequestStatus;
  unit: string;
}

function request(input: MockInput): RequestItem {
  const submittedAt = minutesAgo(input.minutes);
  const history = buildHistory(input.status, submittedAt, input.deniedNote);
  const claimedAt = history.find((entry) => entry.to === "claimed")?.at;

  return {
    category: input.category,
    ...(input.deniedNote ? { deniedNote: input.deniedNote } : {}),
    ...(input.deniedReason ? { deniedReason: input.deniedReason } : {}),
    ...(input.dispensing && claimedAt
      ? { dispensing: { ...input.dispensing, at: claimedAt } }
      : {}),
    history,
    id: input.id,
    medicine: input.medicine,
    notes: input.notes ?? [],
    qty: input.qty,
    reason: input.reason,
    requestor: input.requestor,
    status: input.status,
    submittedAt,
    unit: input.unit,
  };
}

function person(name: string, id: string, email: string): Requestor {
  return { email, id, name };
}

const MARIA = person(
  "Maria Santos",
  "STU-2024-0831",
  "maria.santos@bukidnon.edu"
);
const CARLO = person(
  "Carlo Mendoza",
  "STU-2025-0117",
  "carlo.mendoza@bukidnon.edu"
);
const LIZA = person(
  "Liza Paredes",
  "STU-2023-0455",
  "liza.paredes@bukidnon.edu"
);
const JOHN = person(
  "John Dela Cruz",
  "STU-2024-0912",
  "john.delacruz@bukidnon.edu"
);
const ANA = person("Ana Reyes", "EMP-2021-0033", "ana.reyes@bukidnon.edu");
const BEN = person(
  "Ben Tolentino",
  "STU-2022-0790",
  "ben.tolentino@bukidnon.edu"
);
const KIM = person(
  "Kim Bautista",
  "STU-2024-0620",
  "kim.bautista@bukidnon.edu"
);

export const mockRequests: RequestItem[] = [
  request({
    category: "Analgesic",
    id: "REQ-2026-0141",
    medicine: "Paracetamol 500mg",
    minutes: 122,
    qty: 2,
    reason: "Headache after PE class.",
    requestor: MARIA,
    status: "pending",
    unit: "tabs",
  }),
  request({
    category: "Analgesic",
    id: "REQ-2026-0142",
    medicine: "Ibuprofen 400mg",
    minutes: 46,
    qty: 1,
    reason: "Menstrual cramps — needs it before afternoon lab.",
    requestor: CARLO,
    status: "pending",
    unit: "strip",
  }),
  request({
    category: "Supplement",
    id: "REQ-2026-0143",
    medicine: "ORS Sachet",
    minutes: 21,
    qty: 3,
    reason: "Dehydration after volleyball tryouts.",
    requestor: LIZA,
    status: "pending",
    unit: "packs",
  }),
  request({
    category: "Analgesic",
    id: "REQ-2026-0144",
    medicine: "Cetirizine 10mg",
    minutes: 9,
    qty: 5,
    reason: "Allergic rhinitis — sneezing through lectures.",
    requestor: JOHN,
    status: "pending",
    unit: "tabs",
  }),
  request({
    category: "Antibiotic",
    id: "REQ-2026-0138",
    medicine: "Amoxicillin 500mg",
    minutes: 92,
    notes: [
      {
        at: minutesAgo(70),
        author: "M. Reyes",
        text: "Clinic doctor confirmed prescription — 10 caps to finish the course.",
      },
    ],
    qty: 10,
    reason: "Prescribed antibiotic course, day 4 of 7.",
    requestor: ANA,
    status: "approved",
    unit: "caps",
  }),
  request({
    category: "Respiratory",
    id: "REQ-2026-0137",
    medicine: "Salbutamol Inhaler",
    minutes: 132,
    qty: 1,
    reason: "Asthma flare during exam week.",
    requestor: BEN,
    status: "approved",
    unit: "unit",
  }),
  request({
    category: "Analgesic",
    id: "REQ-2026-0135",
    medicine: "Cetirizine 10mg",
    minutes: 184,
    notes: [
      {
        at: minutesAgo(150),
        author: "M. Reyes",
        text: "Prepared at counter 2 — waiting for pickup.",
      },
    ],
    qty: 6,
    reason: "Recurring hives after lab exposure.",
    requestor: KIM,
    status: "ready",
    unit: "tabs",
  }),
  request({
    category: "Analgesic",
    id: "REQ-2026-0134",
    medicine: "Ibuprofen 400mg",
    minutes: 212,
    qty: 4,
    reason: "Post-dental extraction pain.",
    requestor: MARIA,
    status: "ready",
    unit: "tabs",
  }),
  request({
    category: "Analgesic",
    dispensing: {
      batch: "B-2026-04",
      expiry: new Date(Date.now() + 248 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      qty: 5,
      staff: "M. Reyes",
    },
    id: "REQ-2026-0130",
    medicine: "Paracetamol 500mg",
    minutes: 305,
    qty: 5,
    reason: "Fever from flu.",
    requestor: BEN,
    status: "claimed",
    unit: "tabs",
  }),
  request({
    category: "Supplement",
    dispensing: {
      batch: "B-2026-10",
      expiry: new Date(Date.now() + 200 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      qty: 2,
      staff: "J. Cruz",
    },
    id: "REQ-2026-0128",
    medicine: "Vitamin B Complex",
    minutes: 480,
    qty: 2,
    reason: "Low energy and tingling hands.",
    requestor: LIZA,
    status: "claimed",
    unit: "caps",
  }),
  request({
    category: "First Aid",
    dispensing: {
      batch: "B-2026-05",
      expiry: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      qty: 2,
      staff: "A. Lim",
    },
    id: "REQ-2026-0119",
    medicine: "Gauze Pads 10x10",
    minutes: 2 * 1440 + 40,
    qty: 2,
    reason: "Wound dressing after minor cut.",
    requestor: CARLO,
    status: "claimed",
    unit: "packs",
  }),
  request({
    category: "Antibiotic",
    deniedNote: "No Cotrimoxazole batch on hand — reorder pending.",
    deniedReason: "Out of Stock",
    id: "REQ-2026-0132",
    medicine: "Cotrimoxazole 480mg",
    minutes: 366,
    qty: 4,
    reason: "UTI symptoms — self-reported.",
    requestor: JOHN,
    status: "denied",
    unit: "tabs",
  }),
  request({
    category: "Analgesic",
    deniedNote: "Same viewer already has an approved analgesic request today.",
    deniedReason: "Duplicate Request",
    id: "REQ-2026-0131",
    medicine: "Mefenamic Acid 500mg",
    minutes: 420,
    qty: 3,
    reason: "Back pain.",
    requestor: ANA,
    status: "denied",
    unit: "tabs",
  }),
];

/** Sidebar badge parity (00 §2.2) — outstanding work for the review columns. */
export function pendingRequestCount(items: RequestItem[]): number {
  return items.filter((item) => item.status === "pending").length;
}
