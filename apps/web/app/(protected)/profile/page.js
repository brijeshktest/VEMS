"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";

function profileInitials(name, email) {
  const n = (name || "").trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || "").trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const initials = useMemo(() => profileInitials(name, email), [name, email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const data = await apiFetch("/auth/me");
        if (!cancelled && data?.user) {
          const n = typeof data.user.name === "string" ? data.user.name : "";
          const e = typeof data.user.email === "string" ? data.user.email : "";
          setName(n);
          setInitialName(n);
          setEmail(e);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const nameTrim = name.trim();
    const nameChanged = nameTrim !== initialName.trim();
    const pwd = newPassword.trim();
    const wantPassword = pwd.length > 0 || currentPassword.length > 0;

    if (!nameChanged && !wantPassword) {
      setError("Change your name or enter a new password to save.");
      return;
    }
    if (wantPassword) {
      if (pwd.length < 8) {
        setError("New password must be at least 8 characters.");
        return;
      }
      if (pwd !== confirmPassword.trim()) {
        setError("New password and confirmation do not match.");
        return;
      }
      if (!currentPassword) {
        setError("Enter your current password to set a new one.");
        return;
      }
    }

    const body = {};
    if (nameChanged) body.name = nameTrim;
    if (wantPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = pwd;
    }

    setSaving(true);
    try {
      const data = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      if (data?.token) setToken(data.token);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-user-updated"));
      }
      setInitialName(nameTrim);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Account"
        title="User profile"
        description="Update the name shown in the app and change your sign-in password."
      >
        <Link href="/dashboard" className="btn btn-ghost">
          ← Dashboard
        </Link>
      </PageHeader>

      <div className="profile-page">
        <div className="profile-page__feedback">
          {error ? <div className="alert alert-error">{error}</div> : null}
          {message ? <div className="alert alert-success">{message}</div> : null}
        </div>

        <div className="card profile-page-card">
          <div className="profile-page-card__inner">
            {loading ? (
              <div className="profile-page-loading" aria-busy="true" aria-live="polite">
                <div className="profile-page-loading__avatar" />
                <div className="profile-page-loading__lines">
                  <div className="profile-page-loading__line profile-page-loading__line--short" />
                  <div className="profile-page-loading__line" />
                  <div className="profile-page-loading__line" />
                </div>
                <p className="profile-page-loading__text">Loading your profile…</p>
              </div>
            ) : (
              <form className="profile-page-form" onSubmit={onSubmit}>
                <div className="profile-page-hero">
                  <div className="profile-page-avatar" aria-hidden="true">
                    {initials}
                  </div>
                  <p className="profile-page-hero__label">Signed in as</p>
                  <p className="profile-page-hero__name">{(name || "").trim() || "Your account"}</p>
                  {email ? <p className="profile-page-hero__email">{email}</p> : null}
                </div>

                <section className="profile-page-section" aria-labelledby="profile-account-heading">
                  <h2 id="profile-account-heading" className="profile-page-section__title">
                    Account details
                  </h2>
                  <div className="profile-field">
                    <label htmlFor="profile-email">Email</label>
                    <input
                      id="profile-email"
                      className="input"
                      type="email"
                      value={email}
                      readOnly
                      aria-readonly="true"
                    />
                    <p className="profile-field-hint">Sign-in email cannot be changed here.</p>
                  </div>
                  <div className="profile-field">
                    <label htmlFor="profile-name">Display name</label>
                    <input
                      id="profile-name"
                      className="input"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(ev) => setName(ev.target.value)}
                      required
                    />
                    <p className="profile-field-hint">Shown in the header and across the workspace.</p>
                  </div>
                </section>

                <section className="profile-page-section" aria-labelledby="profile-password-heading">
                  <h2 id="profile-password-heading" className="profile-page-section__title">
                    Password
                  </h2>
                  <div className="panel-inset panel-inset--strong profile-page-password-panel">
                    <p className="profile-password-hint">
                      Leave all password fields blank to keep your current password. To change it, fill in{" "}
                      <strong>current</strong>, <strong>new</strong>, and <strong>confirm</strong>.
                    </p>
                    <div className="profile-field">
                      <label htmlFor="profile-current-pw">Current password</label>
                      <input
                        id="profile-current-pw"
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(ev) => setCurrentPassword(ev.target.value)}
                      />
                    </div>
                    <div className="profile-field">
                      <label htmlFor="profile-new-pw">New password</label>
                      <input
                        id="profile-new-pw"
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(ev) => setNewPassword(ev.target.value)}
                      />
                    </div>
                    <div className="profile-field">
                      <label htmlFor="profile-confirm-pw">Confirm new password</label>
                      <input
                        id="profile-confirm-pw"
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(ev) => setConfirmPassword(ev.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <div className="profile-page-actions">
                  <button className="btn" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => router.back()}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
