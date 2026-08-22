"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { parseWishlistDocument } from "@/lib/importSchema";
import { compressImage } from "@/lib/image";

interface Props {
  listId?: string;
  onImported?: () => void;
  onClose?: () => void;
}

export function ImportDialog({ listId, onImported, onClose }: Props) {
  const toast = useToast();
  const importLists = useMutation(api.import.importLists);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<"new" | "existing">(listId ? "existing" : "new");
  const [dedupe, setDedupe] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doImport(json: string) {
    let doc;
    try {
      doc = parseWishlistDocument(json);
    } catch (err: any) {
      toast(err?.message ?? "Invalid document", "error");
      return;
    }
    // Compress any inline base64 images before insert so docs stay under 900KB
    for (const list of doc.lists) {
      for (const item of list.items) {
        if (item.image?.startsWith("data:image")) {
          try {
            item.image = await compressImage(item.image);
          } catch {
            // keep original if compression fails
          }
        }
      }
    }
    setBusy(true);
    try {
      const res = await importLists({
        lists: doc.lists,
        targetListId: target === "existing" && listId ? (listId as any) : undefined,
        dedupe,
      });
      toast(
        `Imported ${res.importedItems} items${res.created ? ` across ${res.created} new lists` : ""}`,
        "success",
      );
      onImported?.();
      onClose?.();
    } catch (err: any) {
      toast(err?.message ?? "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await doImport(text);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await doImport(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Import wishlists</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a Wisher JSON document here, or choose a file…"
          />
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            Choose file
          </Button>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                checked={target === "new"}
                onChange={() => setTarget("new")}
              />
              New lists
            </label>
            {listId && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="target"
                  checked={target === "existing"}
                  onChange={() => setTarget("existing")}
                />
                Into this list
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dedupe}
                onChange={(e) => setDedupe(e.target.checked)}
              />
              Deduplicate (by name + URL)
            </label>
          </div>

          <div className="mt-1 flex gap-3">
            <Button type="submit" loading={busy} disabled={!text.trim()}>
              Import
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
