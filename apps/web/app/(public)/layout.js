export default function PublicLayout({ children }) {
  return (
    <main className="main-surface saas-main login-layout-main">
      <div className="login-layout-body">{children}</div>
    </main>
  );
}
