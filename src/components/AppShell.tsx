import { Nav } from "@/components/Nav";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Nav />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
    </ProtectedRoute>
  );
}
