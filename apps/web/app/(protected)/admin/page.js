"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, apiFetchForm, API_URL } from "../../../lib/api.js";
import PageHeader from "../../../components/PageHeader.js";

const modules = [
  "dashboard",
  "vendors",
  "materials",
  "vouchers",
  "reports",
  "rooms",
  "roomStages",
  "roomActivities",
  "tunnelBunkerOps",
  "roles",
  "users"
];
const actions = ["view", "create", "edit", "delete"];

function emptyPermissions() {
  const perms = {};
  modules.forEach((moduleKey) => {
    perms[moduleKey] = { view: false, create: false, edit: false, delete: false };
  });
  return perms;
}

function normalizePermissions(input = {}) {
  const perms = emptyPermissions();
  modules.forEach((moduleKey) => {
    const modulePerms = input[moduleKey] || {};
    actions.forEach((action) => {
      perms[moduleKey][action] = Boolean(modulePerms[action]);
    });
  });
  return perms;
}

export default function AdminPage() {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [changeLogs, setChangeLogs] = useState([]);
  const [logFilter, setLogFilter] = useState({ entityType: "", entityId: "" });
  const [openLogIds, setOpenLogIds] = useState([]);

  const [roleForm, setRoleForm] = useState({ name: "", description: "", permissions: emptyPermissions() });
  const [editingRoleId, setEditingRoleId] = useState(null);

  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", roleIds: [] });
  const [editingUserId, setEditingUserId] = useState(null);
  const logoInputRef = useRef(null);
  const [brandingTs, setBrandingTs] = useState(null);

  const roleLookup = useMemo(() => {
    const lookup = {};
    roles.forEach((role) => {
      lookup[role._id] = role.name;
    });
    return lookup;
  }, [roles]);

  async function load() {
    try {
      const [roleData, userData] = await Promise.all([apiFetch("/roles"), apiFetch("/users")]);
      setRoles(roleData);
      setUsers(userData);
      await loadChangeLogs();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadChangeLogs() {
    const params = new URLSearchParams();
    if (logFilter.entityType.trim()) params.set("entityType", logFilter.entityType.trim());
    if (logFilter.entityId.trim()) params.set("entityId", logFilter.entityId.trim());
    const query = params.toString();
    const data = await apiFetch(`/change-logs${query ? `?${query}` : ""}`);
    setChangeLogs(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function applyLogFilter(event) {
    event.preventDefault();
    setError("");
    try {
      await loadChangeLogs();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleLogDetails(logId) {
    setOpenLogIds((prev) => (prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]));
  }

  async function refreshBranding() {
    try {
      const res = await fetch(`${API_URL}/settings/branding`);
      const data = await res.json().catch(() => ({}));
      if (data?.hasLogo && typeof data.updatedAt === "number") {
        setBrandingTs(data.updatedAt);
      } else {
        setBrandingTs(null);
      }
    } catch {
      setBrandingTs(null);
    }
  }

  useEffect(() => {
    refreshBranding();
  }, []);

  async function uploadLogo(event) {
    event.preventDefault();
    const file = logoInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image file first.");
      return;
    }
    setError("");
    try {
      const fd = new FormData();
      fd.append("logo", file);
      await apiFetchForm("/settings/logo", fd);
      if (logoInputRef.current) logoInputRef.current.value = "";
      await refreshBranding();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLogo() {
    setError("");
    try {
      await apiFetch("/settings/logo", { method: "DELETE" });
      setBrandingTs(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("vems-branding-updated"));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function updatePermission(moduleKey, action, value) {
    setRoleForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleKey]: { ...prev.permissions[moduleKey], [action]: value }
      }
    }));
  }

  async function saveRole(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        name: roleForm.name,
        description: roleForm.description,
        permissions: roleForm.permissions
      };
      if (editingRoleId) {
        await apiFetch(`/roles/${editingRoleId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/roles", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setRoleForm({ name: "", description: "", permissions: emptyPermissions() });
      setEditingRoleId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditRole(role) {
    setEditingRoleId(role._id);
    setRoleForm({
      name: role.name || "",
      description: role.description || "",
      permissions: normalizePermissions(role.permissions || {})
    });
  }

  async function deleteRole(roleId) {
    setError("");
    try {
      await apiFetch(`/roles/${roleId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        name: userForm.name,
        email: userForm.email,
        roleIds: userForm.roleIds
      };
      if (!editingUserId) {
        payload.password = userForm.password;
      } else if (userForm.password) {
        payload.password = userForm.password;
      }
      if (editingUserId) {
        await apiFetch(`/users/${editingUserId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setUserForm({ name: "", email: "", password: "", roleIds: [] });
      setEditingUserId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditUser(user) {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      roleIds: user.roleIds || []
    });
  }

  async function deleteUser(userId) {
    setError("");
    try {
      await apiFetch(`/users/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleUserRole(roleId) {
    setUserForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId]
    }));
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administration"
        title="Admin console"
        description="Define custom roles, map module permissions, and manage who can sign in. Configure growing infrastructure from the shortcuts below."
      />

      <div className="card">
        <h3 className="panel-title">Growing operations</h3>
        <p className="page-lead" style={{ marginBottom: 16 }}>
          Rooms and stages are managed in dedicated screens for clearer workflows.
        </p>
        <div className="grid grid-2">
          <Link className="btn btn-secondary" href="/admin/rooms">
            Growing rooms
          </Link>
          <Link className="btn btn-secondary" href="/admin/stages">
            Room stages
          </Link>
          <Link className="btn btn-secondary" href="/admin/tunnel-bunker">
            Tunnel &amp; bunker settings
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Organization logo</h3>
        <p className="page-lead" style={{ marginBottom: 16 }}>
          Upload a square or wide logo (PNG, JPEG, SVG, or WebP, max 2&nbsp;MB). It appears in the application header for all users.
        </p>
        {brandingTs ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Current logo</p>
            <img
              src={`${API_URL}/settings/logo?t=${brandingTs}`}
              alt="Organization logo"
              style={{ maxHeight: 64, maxWidth: 200, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </div>
        ) : null}
        <form className="grid grid-2" onSubmit={uploadLogo} style={{ alignItems: "end" }}>
          <div>
            <label htmlFor="admin-logo-file">Logo file</label>
            <input
              id="admin-logo-file"
              ref={logoInputRef}
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button className="btn" type="submit">
              Upload logo
            </button>
            {brandingTs ? (
              <button className="btn btn-secondary" type="button" onClick={() => void removeLogo()}>
                Remove logo
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">{editingRoleId ? "Edit role" : "Create role"}</h3>
          <form className="grid" onSubmit={saveRole}>
            <input
              className="input"
              placeholder="Role name"
              value={roleForm.name}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              className="input"
              placeholder="Description"
              value={roleForm.description}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <div className="panel-inset">
              <h4>Module permissions</h4>
              <div className="table-wrap">
                <table className="table">
                <thead>
                  <tr>
                    <th>Module</th>
                    {actions.map((action) => (
                      <th key={action}>{action}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((moduleKey) => (
                    <tr key={moduleKey}>
                      <td>{moduleKey}</td>
                      {actions.map((action) => (
                        <td key={`${moduleKey}-${action}`}>
                          <input
                            type="checkbox"
                            checked={roleForm.permissions[moduleKey]?.[action]}
                            onChange={(e) => updatePermission(moduleKey, action, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <button className="btn" type="submit">
              {editingRoleId ? "Update Role" : "Save Role"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="panel-title">Roles</h3>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role._id}>
                  <td>{role.name}</td>
                  <td>{role.description || "-"}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => startEditRole(role)}>
                      Edit
                    </button>{" "}
                    <button className="btn btn-secondary" type="button" onClick={() => deleteRole(role._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="panel-title">{editingUserId ? "Edit user" : "Create user"}</h3>
          <form className="grid" onSubmit={saveUser}>
            <input
              className="input"
              placeholder="Full name"
              value={userForm.name}
              onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              className="input"
              placeholder="Email"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <input
              className="input"
              placeholder={editingUserId ? "New password (optional)" : "Password"}
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
              required={!editingUserId}
            />
            <div className="panel-inset">
              <h4>Assign roles</h4>
              <div className="grid grid-2">
                {roles.map((role) => (
                  <label key={role._id}>
                    <input
                      type="checkbox"
                      checked={userForm.roleIds.includes(role._id)}
                      onChange={() => toggleUserRole(role._id)}
                    />{" "}
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn" type="submit">
              {editingUserId ? "Update User" : "Create User"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="panel-title">Users</h3>
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{(user.roleIds || []).map((id) => roleLookup[id]).filter(Boolean).join(", ") || "-"}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => startEditUser(user)}>
                      Edit
                    </button>{" "}
                    <button className="btn btn-secondary" type="button" onClick={() => deleteUser(user.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="panel-title">Record change log</h3>
        <form className="grid grid-3" onSubmit={applyLogFilter} style={{ marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Entity type (vendor, material, voucher, room...)"
            value={logFilter.entityType}
            onChange={(e) => setLogFilter((prev) => ({ ...prev, entityType: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Entity ID (optional)"
            value={logFilter.entityId}
            onChange={(e) => setLogFilter((prev) => ({ ...prev, entityId: e.target.value }))}
          />
          <button className="btn btn-secondary" type="submit">
            Refresh log
          </button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Changed by</th>
                <th>Record ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {changeLogs.map((row) => (
                <Fragment key={row._id}>
                  <tr>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.entityType}</td>
                    <td>{row.action}</td>
                    <td>{row.changedByName || "-"}</td>
                    <td>{row.entityId}</td>
                    <td>
                      <button className="btn btn-secondary btn-tiny" type="button" onClick={() => toggleLogDetails(row._id)}>
                        {openLogIds.includes(row._id) ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {openLogIds.includes(row._id) ? (
                    <tr key={`${row._id}-details`}>
                      <td colSpan={6}>
                        <div className="grid grid-2" style={{ gap: 10 }}>
                          <div className="panel-inset">
                            <h4 style={{ marginTop: 0 }}>Before</h4>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
                              {JSON.stringify(row.before, null, 2) || "null"}
                            </pre>
                          </div>
                          <div className="panel-inset">
                            <h4 style={{ marginTop: 0 }}>After</h4>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
                              {JSON.stringify(row.after, null, 2) || "null"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!changeLogs.length ? (
                <tr>
                  <td colSpan={6}>No log entries found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
