import { Button } from "@cmis/ui/components/button";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ConfirmModal } from "../../components/confirm-modal";
import type { Supplier } from "../types";
import { type CrudField, CrudModal } from "./crud-modal";
import { SettingsCard } from "./settings-card";

const FIELDS: CrudField[] = [
  { key: "name", label: "Name", required: true },
  { key: "contact", label: "Contact", required: true },
  {
    key: "leadTimeDays",
    label: "Lead time (days)",
    required: true,
    type: "number",
  },
];

export function SuppliersTab({
  suppliers,
  onAdd,
  onUpdate,
  onRemove,
}: {
  onAdd: (supplier: Supplier) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Supplier>) => void;
  suppliers: Supplier[];
}) {
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Supplier | null>(
    null
  );

  const query = search.trim().toLowerCase();
  const rows = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(query) ||
      supplier.contact.toLowerCase().includes(query)
  );

  return (
    <>
      <SettingsCard
        actions={
          <Button
            className="press-feedback"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            size="sm"
          >
            <Plus aria-hidden className="size-3.5" />
            Add Supplier
          </Button>
        }
        description="Lead time drives the reorder hints on Low-Stock Alerts."
        title="Suppliers"
      >
        <div className="relative mb-3 flex items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search suppliers"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or contact…"
            value={search}
          />
          {search ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setSearch("")}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-md border border-border/60">
          <div className="grid grid-cols-[1.4fr_1.4fr_0.6fr_auto] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
            <span>Name</span>
            <span>Contact</span>
            <span>Lead time</span>
            <span className="w-16 text-right">Actions</span>
          </div>
          {rows.map((supplier) => (
            <div
              className="grid grid-cols-[1.4fr_1.4fr_0.6fr_auto] items-center gap-2 border-border/50 border-b px-3 py-2 last:border-b-0"
              key={supplier.id}
            >
              <span className="truncate font-medium text-sm">
                {supplier.name}
              </span>
              <span className="truncate text-caption text-muted-foreground">
                {supplier.contact}
              </span>
              <span className="text-caption">{supplier.leadTimeDays} days</span>
              <span className="flex justify-end gap-1">
                <button
                  aria-label={`Edit ${supplier.name}`}
                  className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setEditing(supplier);
                    setFormOpen(true);
                  }}
                  type="button"
                >
                  <Pencil aria-hidden className="size-3.5" />
                </button>
                <button
                  aria-label={`Delete ${supplier.name}`}
                  className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setPendingDelete(supplier)}
                  type="button"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-caption text-muted-foreground">
              No suppliers match “{search}”.
            </p>
          ) : null}
        </div>
      </SettingsCard>

      <CrudModal
        fields={FIELDS}
        initial={
          editing
            ? {
                contact: editing.contact,
                leadTimeDays: String(editing.leadTimeDays),
                name: editing.name,
              }
            : { contact: "", leadTimeDays: "3", name: "" }
        }
        onOpenChange={setFormOpen}
        onSubmit={(values) => {
          const payload = {
            contact: values.contact.trim(),
            leadTimeDays: Number(values.leadTimeDays) || 0,
            name: values.name.trim(),
          };
          if (editing) {
            onUpdate(editing.id, payload);
            toast.success("Supplier updated", { description: payload.name });
          } else {
            onAdd({ id: `sup-${Date.now()}`, ...payload });
            toast.success("Supplier added", { description: payload.name });
          }
        }}
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : "Add supplier"}
      />

      <ConfirmModal
        confirmLabel="Delete supplier"
        description={`Delete ${pendingDelete?.name}? Existing stock keeps its recorded supplier.`}
        destructive
        onConfirm={() => {
          if (pendingDelete) {
            onRemove(pendingDelete.id);
            toast.success(`${pendingDelete.name} deleted`);
          }
          setPendingDelete(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
        title="Delete supplier?"
      />
    </>
  );
}
