import { Button } from "@cmis/ui/components/button";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { type ChangeEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { ConfirmModal } from "../../components/confirm-modal";
import type { Category } from "../types";
import { CrudModal } from "./crud-modal";
import { SettingsCard } from "./settings-card";

function CategoryRow({
  category,
  onEdit,
  onRequestDelete,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onRequestDelete: (category: Category) => void;
}) {
  const handleEdit = useCallback(() => {
    onEdit(category);
  }, [onEdit, category]);
  const handleDelete = useCallback(() => {
    onRequestDelete(category);
  }, [onRequestDelete, category]);

  return (
    <div className="grid grid-cols-[1.6fr_0.8fr_auto] items-center gap-2 border-border/50 border-b px-3 py-2 last:border-b-0">
      <span className="truncate font-medium text-sm">{category.name}</span>
      <span className="text-caption text-muted-foreground">
        {category.itemCount}
      </span>
      <span className="flex justify-end gap-1">
        <button
          aria-label={`Edit ${category.name}`}
          className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={handleEdit}
          type="button"
        >
          <Pencil aria-hidden className="size-3.5" />
        </button>
        <button
          aria-label={`Delete ${category.name}`}
          className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={handleDelete}
          type="button"
        >
          <Trash2 aria-hidden className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

export function CategoriesTab({
  categories,
  onAdd,
  onUpdate,
  onRemove,
}: {
  categories: Category[];
  onAdd: (category: Category) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Category>) => void;
}) {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const query = search.trim().toLowerCase();
  const rows = categories.filter((category) =>
    category.name.toLowerCase().includes(query)
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((category: Category) => {
    setEditing(category);
    setFormOpen(true);
  }, []);

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
    },
    []
  );

  const clearSearch = useCallback(() => setSearch(""), []);

  const requestDelete = useCallback((category: Category) => {
    if (category.itemCount > 0) {
      toast.error(`Cannot delete ${category.name}`, {
        description: `Reassign its ${category.itemCount} items first.`,
      });
      return;
    }
    setPendingDelete(category);
  }, []);

  const handleSubmit = useCallback(
    (values: Record<string, string>) => {
      const name = values.name.trim();
      if (editing) {
        onUpdate(editing.id, { name });
        toast.success("Category updated", { description: name });
      } else {
        onAdd({ id: `cat-${Date.now()}`, itemCount: 0, name });
        toast.success("Category added", { description: name });
      }
    },
    [editing, onAdd, onUpdate]
  );

  const handleConfirmDelete = useCallback(() => {
    if (pendingDelete) {
      onRemove(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
    }
    setPendingDelete(null);
  }, [pendingDelete, onRemove]);

  const handleDeleteDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingDelete(null);
    }
  }, []);

  return (
    <>
      <SettingsCard
        actions={
          <Button className="press-feedback" onClick={openCreate} size="sm">
            <Plus aria-hidden className="size-3.5" />
            Add Category
          </Button>
        }
        description="Deletion is blocked while items still reference the category."
        title="Categories"
      >
        <div className="relative mb-3 flex items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 size-4 text-muted-foreground"
          />
          <input
            aria-label="Search categories"
            className="h-8 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            onChange={handleSearchChange}
            placeholder="Search categories…"
            value={search}
          />
          {search ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={clearSearch}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-md border border-border/60">
          <div className="grid grid-cols-[1.6fr_0.8fr_auto] items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5 font-medium text-caption text-muted-foreground">
            <span>Name</span>
            <span>Items</span>
            <span className="w-16 text-right">Actions</span>
          </div>
          {rows.map((category) => (
            <CategoryRow
              category={category}
              key={category.id}
              onEdit={openEdit}
              onRequestDelete={requestDelete}
            />
          ))}
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-caption text-muted-foreground">
              No categories match “{search}”.
            </p>
          ) : null}
        </div>
      </SettingsCard>

      <CrudModal
        fields={[{ key: "name", label: "Name", required: true }]}
        initial={editing ? { name: editing.name } : { name: "" }}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        open={formOpen}
        title={editing ? `Edit ${editing.name}` : "Add category"}
      />

      <ConfirmModal
        confirmLabel="Delete category"
        description={`Delete ${pendingDelete?.name}? This cannot be undone.`}
        destructive
        onConfirm={handleConfirmDelete}
        onOpenChange={handleDeleteDialogChange}
        open={pendingDelete !== null}
        title="Delete category?"
      />
    </>
  );
}
