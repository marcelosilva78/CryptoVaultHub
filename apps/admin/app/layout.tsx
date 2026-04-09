import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

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
          <ThemeProvider>
            <AuthProvider>
              <Sidebar />
              <Header />
              <main className="ml-sidebar-w mt-header-h p-content-p min-h-[calc(100vh-56px)] bg-surface-page">
                <div className="animate-fade-in">{children}</div>
              </main>
            </AuthProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
