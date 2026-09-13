import type { DispensingRow } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = Date.now();

let seq = 0;
function make(
  overrides: Partial<DispensingRow> & {
    medicine: string;
    medicineSku: string;
    batch: string;
  },
  ago: number
): DispensingRow {
  seq += 1;
  return {
    branch: "Main Clinic",
    dispensedAt: new Date(NOW - ago).toISOString(),
    id: `DSP-${String(2000 + seq).padStart(4, "0")}`,
    qty: 2,
    requestLink: null,
    requestor: "Maria S.",
    requestorId: "V-184",
    staff: "J. Cruz",
    status: "dispensed",
    ...overrides,
  };
}

export const mockDispensingRows: DispensingRow[] = [
  make(
    {
      batch: "B-2026-04",
      branch: "Main Clinic",
      medicine: "Paracetamol 500mg",
      medicineSku: "PAR-500",
      qty: 2,
      requestLink: "REQ-2026-0141",
      requestor: "Maria S.",
      requestorId: "V-184",
      staff: "J. Cruz",
    },
    22 * MINUTE
  ),
  make(
    {
      batch: "B-2025-11",
      branch: "Main Clinic",
      medicine: "Amoxicillin 250mg",
      medicineSku: "AMX-250",
      qty: 10,
      requestLink: null,
      requestor: "John D.",
      requestorId: "V-201",
      staff: "Joy Nurse",
    },
    1 * HOUR + 15 * MINUTE
  ),
  make(
    {
      batch: "C-118",
      branch: "North Clinic",
      medicine: "Cetirizine 10mg",
      medicineSku: "CTZ-10",
      qty: 6,
      requestLink: "REQ-2026-0146",
      requestor: "Ana P.",
      requestorId: "V-192",
      staff: "M. Reyes",
    },
    3 * HOUR
  ),
  make(
    {
      batch: "A-2041",
      branch: "Main Clinic",
      medicine: "Amoxicillin 500mg",
      medicineSku: "AMX-500",
      qty: 8,
      requestLink: "REQ-2026-0132",
      requestor: "R. Santos",
      requestorId: "V-176",
      staff: "A. Lim",
    },
    28 * HOUR
  ),
  make(
    {
      batch: "L-330",
      branch: "Main Clinic",
      medicine: "Loperamide 2mg",
      medicineSku: "LOP-2",
      qty: 6,
      requestLink: "REQ-2026-0119",
      requestor: "K. Tan",
      requestorId: "V-160",
      staff: "J. Cruz",
    },
    6 * DAY
  ),
  make(
    {
      batch: "V-51",
      branch: "South Annex",
      medicine: "Vitamin B Complex",
      medicineSku: "VIT-B",
      qty: 20,
      requestLink: "REQ-2026-0094",
      requestor: "L. Garcia",
      requestorId: "V-148",
      staff: "A. Lim",
    },
    16 * DAY
  ),
  make(
    {
      batch: "S-99",
      branch: "North Clinic",
      medicine: "Salbutamol Inhaler",
      medicineSku: "SAL-INH",
      qty: 1,
      requestLink: "REQ-2026-0128",
      requestor: "P. Mendoza",
      requestorId: "V-211",
      staff: "M. Reyes",
      status: "denied",
    },
    2 * DAY + HOUR
  ),
  make(
    {
      batch: "M-440",
      branch: "Main Clinic",
      medicine: "Metformin 500mg",
      medicineSku: "MET-500",
      qty: 30,
      requestLink: null,
      requestor: "E. Cruz",
      requestorId: "V-195",
      staff: "Joy Nurse",
    },
    11 * DAY
  ),
  make(
    {
      batch: "O-112",
      branch: "Main Clinic",
      medicine: "ORS Sachet",
      medicineSku: "ORS-1",
      qty: 5,
      requestLink: "REQ-2026-0108",
      requestor: "D. Aquino",
      requestorId: "V-170",
      staff: "J. Cruz",
    },
    4 * DAY
  ),
  make(
    {
      batch: "G-77",
      branch: "South Annex",
      medicine: "Gauze Pads 10x10",
      medicineSku: "GAU-10",
      qty: 15,
      requestLink: null,
      requestor: "F. Ramos",
      requestorId: "V-220",
      staff: "M. Reyes",
    },
    9 * DAY
  ),
  make(
    {
      batch: "P-889",
      branch: "North Clinic",
      medicine: "Paracetamol 250mg",
      medicineSku: "PAR-250",
      qty: 4,
      requestLink: "REQ-2026-0101",
      requestor: "G. Villanueva",
      requestorId: "V-205",
      staff: "A. Lim",
    },
    13 * DAY
  ),
  make(
    {
      batch: "IB-22",
      branch: "Main Clinic",
      medicine: "Ibuprofen 400mg",
      medicineSku: "IBU-400",
      qty: 12,
      requestLink: "REQ-2026-0088",
      requestor: "S. Bautista",
      requestorId: "V-188",
      staff: "Joy Nurse",
    },
    21 * DAY
  ),
];
