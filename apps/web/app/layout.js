import { Manrope, Work_Sans } from "next/font/google";
import "./globals.css";
import PwaRegister from "../components/PwaRegister.js";
import PwaInstallPrompt from "../components/PwaInstallPrompt.js";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap"
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap"
});

export const metadata = {
  title: "Shroom Agritech LLP — Vendor & Expense Management",
  description: "Shroom Agritech LLP — vendor, materials, and expense tracking",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Shroom Agritech",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }]
  }
};

export const viewport = {
  themeColor: "#724c1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${workSans.variable} ${manrope.variable}`}>
      <body className={`${workSans.className} min-w-0 overflow-x-hidden antialiased`}>
        <div className="app-shell flex min-h-dvh w-full min-w-0 max-w-[100vw] flex-col">
          {children}
          <PwaRegister />
          <PwaInstallPrompt />
        </div>
      </body>
    </html>
  );
}
