import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { AuthProvider } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CryptoVaultHub - Admin Panel",
  description: "CryptoVaultHub administrative dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthProvider>
            <Sidebar />
            <Header />
            <main className="ml-[var(--sidebar-w)] mt-[var(--header-h)] p-6 min-h-[calc(100vh-var(--header-h))]">
              <div className="animate-fade-in">{children}</div>
            </main>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
