import type { SettingsState } from "./types";

export const mockSettings: SettingsState = {
  alerts: {
    expiryWindowDays: 30,
    globalLowStock: 15,
    overrides: [
      {
        global: 15,
        id: "inv-001",
        itemName: "Paracetamol 500mg",
        override: 24,
      },
      {
        global: 15,
        id: "inv-003",
        itemName: "Amoxicillin 500mg",
        override: 30,
      },
      {
        global: 15,
        id: "inv-007",
        itemName: "Salbutamol Inhaler",
        override: null,
      },
      { global: 15, id: "inv-011", itemName: "Loperamide 2mg", override: 20 },
      { global: 15, id: "inv-014", itemName: "ORS Sachet", override: null },
    ],
  },
  backup: {
    lastBackupAt: "2026-09-12T03:00:00",
    nextRun: "2026-09-13T02:00:00",
    path: "%APPDATA%/com.buksu.cmis/backups",
    schedule: "daily",
  },
  categories: [
    { id: "cat-1", itemCount: 148, name: "Analgesic" },
    { id: "cat-2", itemCount: 96, name: "Antibiotic" },
    { id: "cat-3", itemCount: 74, name: "Antihistamine" },
    { id: "cat-4", itemCount: 58, name: "Supplies" },
    { id: "cat-5", itemCount: 0, name: "Vaccine" },
  ],
  general: {
    appName: "CMIS — BukSU Clinic",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12-hour",
  },
  suppliers: [
    {
      contact: "sales@medisource.ph",
      id: "sup-1",
      leadTimeDays: 3,
      name: "MediSource Philippines",
    },
    {
      contact: "orders@healthlink.ph",
      id: "sup-2",
      leadTimeDays: 7,
      name: "HealthLink Distributors",
    },
    {
      contact: "buksu.pharmacy@buksu.edu.ph",
      id: "sup-3",
      leadTimeDays: 1,
      name: "University Pharmacy",
    },
  ],
};
