import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { FilterBar } from "@/components/filter-bar";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CryptoVaultHub BI Dashboard",
  description: "Business Intelligence analytics for CryptoVaultHub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-gray-200 antialiased">
        <Providers>
          <Sidebar />
          <div className="ml-56 flex min-h-screen flex-col">
            <FilterBar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
