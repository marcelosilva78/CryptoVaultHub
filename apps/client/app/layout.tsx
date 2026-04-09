import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { ClientAuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CryptoVaultHub — Client Portal",
  description: "CryptoVaultHub client management portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-display bg-surface-page text-text-primary min-h-screen antialiased">
        <Providers>
          <ThemeProvider>
            <ClientAuthProvider>
              <Sidebar />
              <Header />
              <main className="ml-sidebar-w mt-header-h p-content-p min-h-[calc(100vh-56px)] animate-fade-in">
                {children}
              </main>
            </ClientAuthProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
