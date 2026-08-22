export function formatPrice(priceMinor: number | null | undefined, currency: string): string {
  if (priceMinor == null) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(priceMinor / 100);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(priceMinor / 100);
  }
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}
