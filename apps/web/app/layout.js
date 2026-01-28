import "./globals.css";
import Nav from "../components/Nav.js";
import AuthGate from "../components/AuthGate.js";

export const metadata = {
  title: "Vendor & Expense Management",
  description: "Vendor, materials, and expense tracking"
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
      </body>
    </html>
  );
}
