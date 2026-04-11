import Nav from "../../components/Nav.js";
import AuthGate from "../../components/AuthGate.js";

export default function ProtectedLayout({ children }) {
  return (
    <>
      <Nav />
      <AuthGate>
        <main className="main-surface saas-main w-full min-w-0 max-w-full flex-1">
          <div className="container saas-container w-full min-w-0 max-w-full">{children}</div>
        </main>
      </AuthGate>
    </>
  );
}
