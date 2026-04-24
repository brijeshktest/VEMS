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
  const [role, setRole] = useState("");
  /** When JWT is a plant user but Super Admin is in `superAdminSelf`, form edits the real super account. */
  const [editingSuperWhileImpersonating, setEditingSuperWhileImpersonating] = useState(false);
  const [plantSessionEmail, setPlantSessionEmail] = useState("");

  const initials = useMemo(() => profileInitials(name, email), [name, email]);

  const backHref =
    editingSuperWhileImpersonating || role !== "super_admin" ? "/dashboard" : "/admin/plant-network";
  const backLabel =
    editingSuperWhileImpersonating || role !== "super_admin" ? "← Dashboard" : "← Plant network";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const data = await apiFetch("/auth/me");
        if (cancelled || !data?.user) return;
        const sa =
          data.superAdminSelf && typeof data.superAdminSelf === "object"
            ? {
                name: typeof data.superAdminSelf.name === "string" ? data.superAdminSelf.name : "",
                email: typeof data.superAdminSelf.email === "string" ? data.superAdminSelf.email : ""
              }
            : null;
        if (sa && (sa.name || sa.email)) {
          setEditingSuperWhileImpersonating(true);
          setName(sa.name);
          setInitialName(sa.name);
          setEmail(sa.email);
          setPlantSessionEmail(typeof data.user.email === "string" ? data.user.email : "");
          setRole(typeof data.user.role === "string" ? data.user.role : "");
        } else {
          setEditingSuperWhileImpersonating(false);
          setPlantSessionEmail("");
          const n = typeof data.user.name === "string" ? data.user.name : "";
          const e = typeof data.user.email === "string" ? data.user.email : "";
          setName(n);
          setInitialName(n);
          setEmail(e);
          setRole(typeof data.user.role === "string" ? data.user.role : "");
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
      const path = editingSuperWhileImpersonating ? "/auth/profile/super" : "/auth/profile";
      const data = await apiFetch(path, {
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
        title={editingSuperWhileImpersonating ? "Super Administrator profile" : "User profile"}
        description={
          editingSuperWhileImpersonating
            ? `Your real Super Admin sign-in identity. Current password is your Super Admin password. You are still working in the plant as ${plantSessionEmail || "the current user"}.`
            : role === "super_admin"
              ? "Platform super administrator — update your display name and password the same way as other users."
              : "Update the name shown in the app and change your sign-in password."
        }
      >
        <Link href={backHref} className="btn btn-ghost">
          {backLabel}
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
                  <p className="profile-page-hero__label">
                    {editingSuperWhileImpersonating ? "Super Administrator" : "Signed in as"}
                  </p>
                  <p className="profile-page-hero__name">{(name || "").trim() || "Your account"}</p>
                  {email ? <p className="profile-page-hero__email">{email}</p> : null}
                  {editingSuperWhileImpersonating && plantSessionEmail ? (
                    <p className="profile-field-hint" style={{ marginTop: 10, maxWidth: "36rem" }}>
                      Plant session: <strong>{plantSessionEmail}</strong> (unchanged here).
                    </p>
                  ) : null}
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
