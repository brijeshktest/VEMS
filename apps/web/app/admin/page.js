"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const modules = [
  "dashboard",
  "vendors",
  "materials",
  "vouchers",
  "reports",
  "rooms",
  "roomStages",
  "roomActivities",
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

  const [roleForm, setRoleForm] = useState({ name: "", description: "", permissions: emptyPermissions() });
  const [editingRoleId, setEditingRoleId] = useState(null);

  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", roleIds: [] });
  const [editingUserId, setEditingUserId] = useState(null);

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
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <h1>Admin Console</h1>
        <p>Create roles, define module permissions, and manage user access.</p>
      </div>

      <div className="card">
        <h3>Growing Rooms</h3>
        <p>Manage growing rooms, stages, and activity schedules.</p>
        <div className="grid grid-2">
          <a className="btn btn-secondary" href="/admin/rooms">
            Open Growing Rooms
          </a>
          <a className="btn btn-secondary" href="/admin/stages">
            Open Stages
          </a>
        </div>
      </div>

      {error ? <div className="card">{error}</div> : null}

      <div className="grid grid-2">
        <div className="card">
          <h3>{editingRoleId ? "Edit Role" : "Create Role"}</h3>
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
            <div className="card">
              <h4>Module Permissions</h4>
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
            <button className="btn" type="submit">
              {editingRoleId ? "Update Role" : "Save Role"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Roles</h3>
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

      <div className="grid grid-2">
        <div className="card">
          <h3>{editingUserId ? "Edit User" : "Create User"}</h3>
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
            <div className="card">
              <h4>Assign Roles</h4>
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
          <h3>Users</h3>
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
  );
}
