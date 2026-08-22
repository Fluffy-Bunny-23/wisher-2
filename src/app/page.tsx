"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const { loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace("/dashboard");
    }
  }, [loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  );
}
