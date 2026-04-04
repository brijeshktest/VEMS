"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken } from "../../lib/api.js";

const DEFAULT_ADMIN_EMAIL = "admin@shroomagritechllp.com";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: DEFAULT_ADMIN_EMAIL, password: "" });
  const [seed, setSeed] = useState({ name: "", email: DEFAULT_ADMIN_EMAIL, password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [seedAvailable, setSeedAvailable] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    async function checkSeed() {
      try {
        const data = await apiFetch("/auth/seed-status");
        setSeedAvailable(!data.hasAdmin);
      } catch {
        setSeedAvailable(false);
      }
    }
    checkSeed();
  }, []);

  async function onLogin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setToken(data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSeed(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/auth/seed", {
        method: "POST",
        body: JSON.stringify({ ...seed, role: "admin" })
      });
      setMessage("Admin user created. Please sign in.");
      setSeed({ name: "", email: DEFAULT_ADMIN_EMAIL, password: "" });
      setSeedAvailable(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero" aria-labelledby="login-hero-title">
        <div className="login-hero-bg" aria-hidden="true" />
        <div className="login-hero-content">
          <p className="login-hero-eyebrow">Shroom Agritech LLP</p>
          <h2 id="login-hero-title">Fresh button mushrooms &amp; trusted compost</h2>
          <p className="login-hero-lead">
            We produce quality button mushrooms for the market and supply compost that supports healthy, high-yield
            crops—operations, procurement, and expenses stay organised in one workspace.
          </p>
          <ul className="login-hero-list">
            <li>Controlled growing cycles, room stages, and production visibility</li>
            <li>Vendor and material tracking aligned with mushroom and compost supply chains</li>
            <li>Vouchers, tax, and payment status for clear financial oversight</li>
          </ul>
        </div>
      </section>

      <div className="login-panel">
        <div className="login-panel-inner">
          <div>
            <h1 className="login-heading">Sign in</h1>
            <p className="login-sub">Use your Shroom Agritech credentials. New database? Create the first admin once.</p>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}
          {message ? <div className="alert alert-success">{message}</div> : null}

          <div className="card">
            <h3 className="panel-title">Account</h3>
            <form className="grid" style={{ gap: 10 }} onSubmit={onLogin}>
              <div>
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="input"
                  placeholder={DEFAULT_ADMIN_EMAIL}
                  type="email"
                  autoComplete="username"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="input"
                  placeholder="••••••••"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <button className="btn" type="submit">
                Continue
              </button>
            </form>
          </div>

          {seedAvailable ? (
            <div className="card">
              <h3 className="panel-title">First-time setup</h3>
              <p className="page-lead" style={{ marginBottom: 10 }}>
                Runs once on an empty database to create the initial administrator.
              </p>
              <form className="grid" style={{ gap: 10 }} onSubmit={onSeed}>
                <div>
                  <label htmlFor="seed-name">Name</label>
                  <input
                    id="seed-name"
                    className="input"
                    placeholder="Full name"
                    value={seed.name}
                    onChange={(e) => setSeed({ ...seed, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="seed-email">Email</label>
                  <input
                    id="seed-email"
                    className="input"
                    placeholder={DEFAULT_ADMIN_EMAIL}
                    type="email"
                    value={seed.email}
                    onChange={(e) => setSeed({ ...seed, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="seed-password">Password</label>
                  <input
                    id="seed-password"
                    className="input"
                    type="password"
                    value={seed.password}
                    onChange={(e) => setSeed({ ...seed, password: e.target.value })}
                    required
                  />
                </div>
                <button className="btn btn-secondary" type="submit">
                  Create admin
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
