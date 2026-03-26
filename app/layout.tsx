import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Internal store management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {/* 1. We removed the flex classes from the body tag here */}
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <Providers>
          {/* 2. We created a dedicated flexbox wrapper INSIDE the providers */}
          <div className="flex h-screen w-full overflow-hidden">
            <Sidebar />
            <main className="flex-1 w-full h-full overflow-y-auto p-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}