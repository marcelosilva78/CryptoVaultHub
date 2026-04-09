import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import "./globals.css";

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
      <body className="font-display bg-cvh-bg-primary text-cvh-text-primary min-h-screen antialiased">
        <Sidebar />
        <Header />
        <main className="ml-[220px] mt-[54px] p-[22px] min-h-[calc(100vh-54px)] animate-fade-up">
          {children}
        </main>
      </body>
    </html>
  );
}
