export function randomToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("Secure random is unavailable in this runtime");
  }
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
