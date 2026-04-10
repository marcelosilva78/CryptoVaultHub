"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { ImpersonationProvider } from "@/lib/impersonation-context";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <ImpersonationProvider>
      <Sidebar />
      <Header />
      <div className="ml-sidebar-w mt-header-h">
        <ImpersonationBanner />
        <main className="p-content-p min-h-[calc(100vh-56px)] bg-surface-page">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </ImpersonationProvider>
  );
}
