"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { compressImage, placeholderImage } from "@/lib/image";
import { useOfflineGuard } from "@/lib/useOffline";

export interface ItemFormValue {
  id?: string;
  name: string;
  url?: string;
  priceMinor?: number;
  currency: string;
  notes?: string;
  image?: string;
  priority?: "low" | "medium" | "high";
}

interface Props {
  listId: string;
  canEdit: boolean;
  initial?: ItemFormValue | null;
  onDone: () => void;
  onCancel?: () => void;
}

export function ItemForm({ listId, canEdit, initial, onDone, onCancel }: Props) {
  const toast = useToast();
  const { guard } = useOfflineGuard();
  const addItem = useMutation(api.items.addItem);
  const updateItem = useMutation(api.items.updateItem);
  const removeImage = useMutation(api.items.removeImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [price, setPrice] = useState(
    initial?.priceMinor != null ? String(initial.priceMinor) : "",
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(
    initial?.priority ?? "medium",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [image, setImage] = useState<string | undefined>(initial?.image);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setImage(dataUrl);
      setImageRemoved(false);
    } catch (err: any) {
      toast(err?.message ?? "Could not compress image", "error");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("Name is required", "error");
      return;
    }
    if (!canEdit) {
      toast("You don't have permission to edit", "error");
      return;
    }
    if (!guard()) return;
    setBusy(true);
    const trimmedPrice = price.trim();
    let priceMinor: number | undefined;
    if (trimmedPrice !== "") {
      priceMinor = Number(trimmedPrice);
      if (!Number.isFinite(priceMinor) || !Number.isInteger(priceMinor) || priceMinor < 0) {
        toast("Price must be a non-negative whole number of minor units", "error");
        setBusy(false);
        return;
      }
    }
    const payload = {
      name,
      url: url.trim() || undefined,
      priceMinor,
      currency: currency || "USD",
      notes: notes.trim() || undefined,
      image,
      priority,
    };
    try {
      if (initial?.id) {
        await updateItem({ itemId: initial.id as any, item: payload });
        if (imageRemoved) {
          await removeImage({ itemId: initial.id as any });
        }
        toast("Item updated", "success");
      } else {
        await addItem({ wishlistId: listId as any, item: payload });
        toast("Item added", "success");
      }
      onDone();
    } catch (err: any) {
      toast(err?.message ?? "Failed to save item", "error");
    } finally {
      setBusy(false);
    }
  }

  function onRemoveImage() {
    // Defer server removal until save — closing without saving must not delete.
    // Keep affordance instant by clearing preview locally.
    setImage(undefined);
    setImageRemoved(true);
    toast("Image removed — save to apply", "info");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Name" htmlFor="item-name">
        <Input
          id="item-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="URL" htmlFor="item-url">
        <Input
          id="item-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price" htmlFor="item-price">
          <Input
            id="item-price"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="minor units"
          />
        </Field>
        <Field label="Currency" htmlFor="item-currency">
          <Input
            id="item-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
          />
        </Field>
        <Field label="Priority" htmlFor="item-priority">
          <select
            id="item-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="item-notes">
        <Textarea
          id="item-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={placeholderImage(name || "W")}
            alt=""
            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
          />
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
          {image ? "Replace image" : "Add image"}
        </Button>
        {image && (
          <Button type="button" variant="ghost" onClick={onRemoveImage}>
            Remove
          </Button>
        )}
      </div>

      <div className="mt-1 flex gap-3">
        <Button type="submit" loading={busy}>
          {initial?.id ? "Save changes" : "Add item"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
