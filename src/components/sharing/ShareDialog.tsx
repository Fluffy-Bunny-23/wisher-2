"use client";

import { MembersPanel } from "./MembersPanel";

export function ShareDialog({
  listId,
  isOwner,
  onClose,
}: {
  listId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Share &amp; invite</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <MembersPanel listId={listId} isOwner={isOwner} />
      </div>
    </div>
  );
}
