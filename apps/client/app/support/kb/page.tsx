"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KbLayout } from "./components/kb-layout";
import { getFirstArticle } from "./data";

export default function KbLandingPage() {
  const router = useRouter();
  const first = getFirstArticle();

  useEffect(() => {
    if (first) {
      router.replace(`/support/kb/${first.category}/${first.slug}`);
    }
  }, [first, router]);

  return (
    <KbLayout>
      <div className="flex items-center justify-center h-full text-text-muted text-body">Carregando...</div>
    </KbLayout>
  );
}
