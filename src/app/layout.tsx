import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/layout/app-providers";
import "./globals.css";

const beViet = Be_Vietnam_Pro({
  variable: "--font-vn",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UEH Registration Portal",
  description: "Cổng đăng ký học phần thông minh tích hợp phòng chờ FIFO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${beViet.variable} ${mono.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
