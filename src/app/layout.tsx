import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteIcpFooter } from "@/components/layout/SiteIcpFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leadspace.Alipay",
  description: "支付宝 P 站推广业务数据统计、展示与管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">
        {/* 对齐 hk.orblead：视口锁高，滚动交给 #app-scroll */}
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
          <SiteIcpFooter />
        </div>
      </body>
    </html>
  );
}
