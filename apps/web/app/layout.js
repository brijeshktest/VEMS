import { DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "../components/Nav.js";
import AuthGate from "../components/AuthGate.js";
import PwaRegister from "../components/PwaRegister.js";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata = {
  title: "Shroom Agritech LLP — Vendor & Expense Management",
  description: "Shroom Agritech LLP — vendor, materials, and expense tracking",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className={dmSans.className}>
        <div className="app-shell">
          <Nav />
          <AuthGate>
            <main className="main-surface">
              <div className="container">{children}</div>
            </main>
          </AuthGate>
          <PwaRegister />
        </div>
      </body>
    </html>
  );
}
