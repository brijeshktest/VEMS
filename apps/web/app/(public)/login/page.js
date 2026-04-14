"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, setToken } from "../../../lib/api.js";
import { setWorkMode } from "../../../lib/workMode.js";

/* Hero: home1.png; logo: shroom.png — shroomagritech.com/images */

function IconMail({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l9 6 9-6M3 8v10h18V8"
      />
    </svg>
  );
}

function IconLock({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11z"
      />
    </svg>
  );
}

function IconEye({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

const LS_REMEMBER = "vems_remember_login";
const LS_SAVED_EMAIL = "vems_login_saved_email";

function IconEyeOff({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.7 9.7 0 0112 5c6 0 10 7 10 7a18.4 18.4 0 01-3.5 4M6.4 6.4C4.2 7.8 2 10 2 12s4 6 10 6a9.7 9.7 0 005.1-1.4"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [seed, setSeed] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [seedAvailable, setSeedAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/work-mode");
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(LS_REMEMBER) === "1") {
        const saved = localStorage.getItem(LS_SAVED_EMAIL);
        if (saved) {
          setRememberPassword(true);
          setForm((f) => ({ ...f, email: saved }));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

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
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          rememberPassword
        })
      });
      setToken(data.token);
      try {
        if (rememberPassword) {
          localStorage.setItem(LS_REMEMBER, "1");
          localStorage.setItem(LS_SAVED_EMAIL, String(form.email || "").trim());
        } else {
          localStorage.removeItem(LS_REMEMBER);
          localStorage.removeItem(LS_SAVED_EMAIL);
        }
      } catch {
        /* ignore */
      }
      setWorkMode("");
      router.push("/work-mode");
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
      <aside className="login-page__hero" aria-labelledby="login-hero-title">
        <div className="login-page__hero-media" aria-hidden>
          <Image
            src="https://shroomagritech.com/images/home1.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 52vw"
            className="login-page__hero-img"
          />
        </div>
        <div className="login-page__hero-scrim" aria-hidden />
        <div className="login-page__hero-grain" aria-hidden />
        <div className="login-page__hero-inner">
          <span className="login-page__hero-eyebrow">Shroom Agritech LLP</span>
          <h2 id="login-hero-title" className="login-page__hero-title login-type-display">
            Run operations safely—every day
          </h2>
          <p className="login-page__hero-lead">
            Vendor spend, materials, vouchers, and production workflows in one workspace. Built for teams who grow
            mushrooms and manage compost with discipline.
          </p>
          <ul className="login-page__hero-list">
            <li>
              <span className="login-page__hero-check" aria-hidden />
              <span>Traceable purchasing, tax, and payment status in real time.</span>
            </li>
            <li>
              <span className="login-page__hero-check" aria-hidden />
              <span>Room stages and tunnel movement alerts when work is due.</span>
            </li>
            <li>
              <span className="login-page__hero-check" aria-hidden />
              <span>Role-based access: expense, ops, tunnel, or admin.</span>
            </li>
          </ul>
        </div>
      </aside>

      <div className="login-page__panel">
        <div className="login-page__card login-form-surface">
          <div className="login-page__card-brand">
            <Image
              src="https://shroomagritech.com/images/shroom.png"
              alt="Shroom Agritech"
              width={280}
              height={94}
              sizes="(max-width: 1023px) 56vw, 200px"
              priority
              className="login-page__card-logo"
            />
          </div>
          <p className="login-page__card-eyebrow">Secure access</p>
          <h1 className="login-page__card-title login-type-display">Welcome back</h1>
          <p className="login-page__card-sub">Sign in with your organisation email and password.</p>

          {error ? <div className="login-page__alert login-page__alert--error">{error}</div> : null}
          {message ? <div className="login-page__alert login-page__alert--success">{message}</div> : null}

          <form onSubmit={onLogin}>
            <div className="login-page__field">
              <label htmlFor="login-email">Email</label>
              <div className="login-page__field-wrap">
                <IconMail className="login-page__field-icon" />
                <input
                  id="login-email"
                  className="input w-full transition"
                  placeholder="you@company.com"
                  type="email"
                  autoComplete="username"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="login-page__field">
              <label htmlFor="login-password">Password</label>
              <div className="login-page__field-wrap">
                <IconLock className="login-page__field-icon" />
                <input
                  id="login-password"
                  className="input w-full transition"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="login-page__toggle-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="login-page__remember">
              <label className="login-page__remember-label">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                <span>Remember password</span>
              </label>
            </div>
            <button type="submit" className="btn mt-5 w-full">
              Continue
            </button>
          </form>

          {seedAvailable ? (
            <div className="login-page__seed">
              <h2 className="login-page__seed-title login-type-display">First-time setup</h2>
              <p className="login-page__seed-desc">Create the first administrator once on an empty database.</p>
              <form onSubmit={onSeed}>
                <div className="login-page__field">
                  <label htmlFor="seed-name">Name</label>
                  <input
                    id="seed-name"
                    className="input w-full transition"
                    placeholder="Full name"
                    value={seed.name}
                    onChange={(e) => setSeed({ ...seed, name: e.target.value })}
                    required
                  />
                </div>
                <div className="login-page__field">
                  <label htmlFor="seed-email">Email</label>
                  <input
                    id="seed-email"
                    className="input w-full transition"
                    placeholder="admin@company.com"
                    type="email"
                    value={seed.email}
                    onChange={(e) => setSeed({ ...seed, email: e.target.value })}
                    required
                  />
                </div>
                <div className="login-page__field">
                  <label htmlFor="seed-password">Password</label>
                  <input
                    id="seed-password"
                    className="input w-full transition"
                    type="password"
                    value={seed.password}
                    onChange={(e) => setSeed({ ...seed, password: e.target.value })}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-secondary mt-3 w-full rounded-lg border-slate-200 py-2.5 text-sm font-semibold shadow-sm"
                >
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
