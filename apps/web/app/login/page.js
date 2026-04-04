"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken } from "../../lib/api.js";
import PageHeader from "../../components/PageHeader.js";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [seed, setSeed] = useState({ name: "", email: "", password: "" });
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
      setSeed({ name: "", email: "", password: "" });
      setSeedAvailable(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside" aria-hidden="true">
        <span className="login-accent-line" />
        <h2>Operations, expenses, and clarity in one place.</h2>
        <p>Track vendors, materials, vouchers, and reports with role-based access built for your team.</p>
      </aside>
      <div className="login-main">
        <div className="login-main-inner">
          <PageHeader
            title="Sign in"
            description="Use your credentials to access the workspace. New environment? Create the first admin once."
          />

          {error ? <div className="alert alert-error">{error}</div> : null}
          {message ? <div className="alert alert-success">{message}</div> : null}

          <div className="card">
            <h3 className="panel-title">Account</h3>
            <form className="grid" style={{ gap: 14 }} onSubmit={onLogin}>
              <div>
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="input"
                  placeholder="you@company.com"
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
              <p className="page-lead" style={{ marginBottom: 14 }}>
                Runs once on an empty database to create the initial administrator.
              </p>
              <form className="grid" style={{ gap: 14 }} onSubmit={onSeed}>
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
                    placeholder="admin@company.com"
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
