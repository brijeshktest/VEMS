"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api.js";
import { setWorkMode } from "../../../lib/workMode.js";
import PageHeader from "../../../components/PageHeader.js";

export default function WorkModePage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowRoomOps, setAllowRoomOps] = useState(false);
  const [allowTunnelOps, setAllowTunnelOps] = useState(false);
  const [allowSales, setAllowSales] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [meData, permData] = await Promise.all([apiFetch("/auth/me"), apiFetch("/auth/permissions")]);
        const admin = meData.user?.role === "admin";
        setIsAdmin(admin);
        if (admin || permData.permissions === "all") {
          setAllowRoomOps(true);
          setAllowTunnelOps(true);
          setAllowSales(true);
          return;
        }
        const canRoomStages = Boolean(permData.permissions?.roomStages?.view || permData.permissions?.roomStages?.edit);
        const canRoomActivities = Boolean(
          permData.permissions?.roomActivities?.view || permData.permissions?.roomActivities?.edit
        );
        const canTunnelOps = Boolean(permData.permissions?.tunnelBunkerOps?.view || permData.permissions?.tunnelBunkerOps?.edit);
        const canSales = Boolean(permData.permissions?.sales?.view || permData.permissions?.sales?.edit);
        setAllowRoomOps(canRoomStages || canRoomActivities);
        setAllowTunnelOps(canTunnelOps);
        setAllowSales(canSales);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  function chooseMode(mode) {
    setWorkMode(mode);
    router.push("/dashboard");
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Choose your work area"
        description="Select what you want to work on now. You can switch this anytime from the header."
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid grid-3">
        <button
          className="card stat-card mode-card mode-card--expense"
          type="button"
          onClick={() => chooseMode("expense")}
        >
          <span className="stat-label">Mode</span>
          <span className="stat-value" style={{ fontSize: 22 }}>Expense management</span>
          <span className="stat-hint">Vendors, materials, vouchers, and reports</span>
        </button>
        <button
          className="card stat-card mode-card mode-card--sales"
          type="button"
          disabled={!allowSales}
          onClick={() => chooseMode("sales")}
        >
          <span className="stat-label">Mode</span>
          <span className="stat-value" style={{ fontSize: 22 }}>Sales management</span>
          <span className="stat-hint">Sales invoices for mushrooms and compost</span>
        </button>
        <button
          className="card stat-card mode-card mode-card--room"
          type="button"
          disabled={!allowRoomOps}
          onClick={() => chooseMode("room")}
        >
          <span className="stat-label">Mode</span>
          <span className="stat-value" style={{ fontSize: 22 }}>Room operations</span>
          <span className="stat-hint">Room stage and activity operations summary</span>
        </button>
        <button
          className="card stat-card mode-card mode-card--tunnel"
          type="button"
          disabled={!allowTunnelOps}
          onClick={() => chooseMode("tunnel")}
        >
          <span className="stat-label">Mode</span>
          <span className="stat-value" style={{ fontSize: 22 }}>Tunnel &amp; Bunker Ops</span>
          <span className="stat-hint">Bunkers, one tunnel per batch, then growing rooms; movement alerts</span>
        </button>
        {isAdmin ? (
          <button className="card stat-card mode-card mode-card--admin" type="button" onClick={() => chooseMode("admin")}>
            <span className="stat-label">Mode</span>
            <span className="stat-value" style={{ fontSize: 22 }}>Admin</span>
            <span className="stat-hint">Admin console and related controls</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
