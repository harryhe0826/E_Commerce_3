import "@/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";

export const metadata: Metadata = {
	title: "ITGen E-Commerce - AI 电商素材生成",
	description: "AI 驱动的电商视频素材生成工具",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="zh-CN" className={`${geist.variable}`}>
			<body className="bg-zinc-950 text-zinc-100 antialiased">
				{children}
				<Toaster position="top-center" richColors />
			</body>
		</html>
	);
}
