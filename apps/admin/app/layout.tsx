import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LayoutShell } from "@/components/layout-shell";

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
              <LayoutShell>{children}</LayoutShell>
            </AuthProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
