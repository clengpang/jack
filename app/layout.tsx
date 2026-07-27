import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FRAMECHECK｜AI 视频审核工作台",
  description: "对比审核标准、审核意见与视频自动质检结果，标注超出标准的意见，并通过大模型协同生成可下载报告。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
