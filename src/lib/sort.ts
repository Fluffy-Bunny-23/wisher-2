export type SortBy = "priority" | "custom" | "created" | "price";
export type PurchaseFilter = "all" | "purchased" | "unpurchased";
export type PriorityFilter = "all" | "low" | "medium" | "high";
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export interface SortableItem {
  id: string;
  name: string;
  purchased: boolean;
  priceMinor: number | null;
  rank: number | null;
  priority?: string | null;
  createdTime: number;
}

/**
 * Sort items for display. Purchased items always sink below unpurchased items.
 * Otherwise order follows the chosen mode: priority (high first), the manual
 * custom rank, newest-first creation, or price. Ties break by most recently
 * created first.
 */
export function sortItems<T extends SortableItem>(items: T[], sortBy: SortBy): T[] {
  return [...items].sort((a, b) => {
    if (a.purchased !== b.purchased) return a.purchased ? 1 : -1;
    let cmp = 0;
    if (sortBy === "priority") {
      const pa = PRIORITY_ORDER[(a.priority ?? "medium") as keyof typeof PRIORITY_ORDER] ?? 1;
      const pb = PRIORITY_ORDER[(b.priority ?? "medium") as keyof typeof PRIORITY_ORDER] ?? 1;
      cmp = pa - pb;
    } else if (sortBy === "price") {
      const pa = a.priceMinor ?? Number.POSITIVE_INFINITY;
      const pb = b.priceMinor ?? Number.POSITIVE_INFINITY;
      cmp = pa - pb;
    } else if (sortBy === "created") {
      cmp = b.createdTime - a.createdTime;
      if (cmp !== 0) return cmp;
      return 0;
    } else {
      // custom: the manual rank
      cmp = (a.rank ?? 0) - (b.rank ?? 0);
    }
    if (cmp !== 0) return cmp;
    return b.createdTime - a.createdTime;
  });
}

export function filterItems<T extends SortableItem>(
  items: T[],
  opts: { purchased?: PurchaseFilter; priority?: PriorityFilter } = {},
): T[] {
  const purchased = opts.purchased ?? "all";
  const priority = opts.priority ?? "all";
  return items.filter((item) => {
    if (purchased === "purchased" && !item.purchased) return false;
    if (purchased === "unpurchased" && item.purchased) return false;
    if (priority !== "all" && (item.priority ?? "medium") !== priority) return false;
    return true;
  });
}
