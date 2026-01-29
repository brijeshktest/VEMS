"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken } from "../../lib/api.js";

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
      } catch (err) {
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
      setMessage("Admin user created. Please login.");
      setSeed({ name: "", email: "", password: "" });
      setSeedAvailable(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Vendor and Expense Management System</h1>
        <p>Use your admin/accountant credentials to access the system.</p>
      </div>

      {error ? <div className="card">{error}</div> : null}
      {message ? <div className="card">{message}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <h3>Sign in</h3>
          <form className="grid" onSubmit={onLogin}>
            <input
              className="input"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <button className="btn" type="submit">
              Login
            </button>
          </form>
        </div>

        {seedAvailable ? (
          <div className="card">
            <h3>Seed First Admin</h3>
            <p>Use once on a fresh database to create the first admin.</p>
            <form className="grid" onSubmit={onSeed}>
              <input
                className="input"
                placeholder="Name"
                value={seed.name}
                onChange={(e) => setSeed({ ...seed, name: e.target.value })}
                required
              />
              <input
                className="input"
                placeholder="Email"
                type="email"
                value={seed.email}
                onChange={(e) => setSeed({ ...seed, email: e.target.value })}
                required
              />
              <input
                className="input"
                placeholder="Password"
                type="password"
                value={seed.password}
                onChange={(e) => setSeed({ ...seed, password: e.target.value })}
                required
              />
              <button className="btn btn-secondary" type="submit">
                Create Admin
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
