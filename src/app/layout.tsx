import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SWRegister } from "./sw-register";

/**
 * 字体策略：不使用 next/font/google（国内环境无法访问 fonts.gstatic.com，
 * build 时下载字体会直接失败）。改用系统字体栈，移动端体验一致且零网络依赖。
 */

export const metadata: Metadata = {
  title: "Global Sales Coach",
  description: "AI 驱动的外贸销售能力训练教练",
  manifest: "/manifest.webmanifest",
  applicationName: "Global Sales Coach",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Global Sales Coach",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
