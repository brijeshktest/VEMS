"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api.js";
import PageHeader from "../../../../components/PageHeader.js";

const defaultForm = {
  bunkerCount: "3",
  tunnelCount: "2",
  bunkerIntervalDays: "2",
  tunnelIntervalDays: "10",
  autoAdvanceEnabled: false
};

export default function TunnelBunkerAdminPage() {
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const config = await apiFetch("/tunnel-bunker/config");
      setForm({
        bunkerCount: String(config.bunkerCount ?? 3),
        tunnelCount: String(config.tunnelCount ?? 2),
        bunkerIntervalDays: String(config.bunkerIntervalDays ?? 2),
        tunnelIntervalDays: String(config.tunnelIntervalDays ?? 10),
        autoAdvanceEnabled: Boolean(config.autoAdvanceEnabled)
      });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        bunkerCount: Number(form.bunkerCount),
        tunnelCount: Number(form.tunnelCount),
        bunkerIntervalDays: Number(form.bunkerIntervalDays),
        tunnelIntervalDays: Number(form.tunnelIntervalDays),
        autoAdvanceEnabled: Boolean(form.autoAdvanceEnabled)
      };
      await apiFetch("/tunnel-bunker/config", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setMessage("Tunnel & bunker settings updated.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administration"
        title="Tunnel & bunker settings"
        description="Configure bunker depth, parallel tunnel lines, dwell times, and optional auto-advance. Each batch uses one tunnel only before growing rooms."
      >
        <Link href="/admin" className="btn btn-ghost">
          ← Admin home
        </Link>
      </PageHeader>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card">
        <h3 className="panel-title">Cycle configuration</h3>
        <form className="grid grid-2" onSubmit={onSubmit}>
          <div>
            <label>Bunker count</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.bunkerCount}
              onChange={(e) => setForm((prev) => ({ ...prev, bunkerCount: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Tunnel count</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.tunnelCount}
              onChange={(e) => setForm((prev) => ({ ...prev, tunnelCount: e.target.value }))}
              required
            />
            <span className="field-hint">
              Number of parallel tunnel lines for occupancy. Each compost batch occupies one tunnel only, then moves to
              growing rooms—it never runs through a second tunnel.
            </span>
          </div>
          <div>
            <label>Days in one bunker</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.bunkerIntervalDays}
              onChange={(e) => setForm((prev) => ({ ...prev, bunkerIntervalDays: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Days in one tunnel</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={form.tunnelIntervalDays}
              onChange={(e) => setForm((prev) => ({ ...prev, tunnelIntervalDays: e.target.value }))}
              required
            />
          </div>
          <div className="form-span-all">
            <label>
              <input
                type="checkbox"
                checked={form.autoAdvanceEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, autoAdvanceEnabled: e.target.checked }))}
              />{" "}
              Auto-advance batches immediately when they become due
            </label>
          </div>
          <button className="btn" type="submit">
            Save settings
          </button>
        </form>
      </div>
    </div>
  );
}
