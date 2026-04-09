import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ClientAuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LayoutShell } from "@/components/layout-shell";
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
              <LayoutShell>{children}</LayoutShell>
            </ClientAuthProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
