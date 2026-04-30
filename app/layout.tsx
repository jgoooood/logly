import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logly — AI 커리어 관리",
  description: "하루 한 줄의 업무 기록을 성과·이력서·면접 답변으로 변환합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
