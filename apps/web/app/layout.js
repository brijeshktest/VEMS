import "./globals.css";
import Nav from "../components/Nav.js";
import AuthGate from "../components/AuthGate.js";
import PwaRegister from "../components/PwaRegister.js";

export const metadata = {
  title: "Vendor and Expense Management System",
  description: "Vendor, materials, and expense tracking",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <AuthGate>
          <main>
            <div className="container">{children}</div>
          </main>
        </AuthGate>
        <PwaRegister />
      </body>
    </html>
  );
}
