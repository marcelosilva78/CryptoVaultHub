"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === "/login" || pathname === "/register";

  if (isPublicPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <Header />
      <main className="ml-sidebar-w mt-header-h p-content-p min-h-[calc(100vh-56px)] animate-fade-in">
        {children}
      </main>
    </>
  );
}
