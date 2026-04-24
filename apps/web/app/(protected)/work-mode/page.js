"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getActiveCompanyId } from "../../../lib/api.js";
import { setWorkMode } from "../../../lib/workMode.js";
import PageHeader from "../../../components/PageHeader.js";
import {
  hasExpenseAreaAccess,
  canAccessTunnelOps,
  canAccessRoomOps,
  canViewModule,
  isPermissionsAll,
  isPlatformAdminRole
} from "../../../lib/modulePermissions.js";

export default function WorkModePage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowExpense, setAllowExpense] = useState(false);
  const [allowRoomOps, setAllowRoomOps] = useState(false);
  const [allowTunnelOps, setAllowTunnelOps] = useState(false);
  const [allowPlantOps, setAllowPlantOps] = useState(false);
  const [allowSales, setAllowSales] = useState(false);
  const [allowContributions, setAllowContributions] = useState(false);
  const [allowAdminModule, setAllowAdminModule] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [meData, permData] = await Promise.all([apiFetch("/auth/me"), apiFetch("/auth/permissions")]);
        if (meData?.user?.role === "super_admin" && !getActiveCompanyId()) {
          router.replace("/admin/plant-network");
          return;
        }
        const admin = isPlatformAdminRole(meData.user?.role);
        const p = permData.permissions;
        const plantK =
          Array.isArray(permData.plantModuleKeys) && permData.plantModuleKeys.length > 0
            ? permData.plantModuleKeys
            : null;
        setIsAdmin(admin);
        setAllowAdminModule(!plantK || ["admin", "roles", "users"].some((k) => plantK.includes(k)));
        if (admin || isPermissionsAll(p)) {
          setAllowExpense(hasExpenseAreaAccess(p, plantK));
          setAllowRoomOps(canAccessRoomOps(p, plantK));
          setAllowTunnelOps(canAccessTunnelOps(p, plantK));
          setAllowPlantOps(
            canViewModule(p, "plantOperations", plantK) ||
              canViewModule(p, "growingRoomOps", plantK) ||
              Boolean(p?.plantOperations?.edit || p?.growingRoomOps?.edit)
          );
          setAllowSales(canViewModule(p, "sales", plantK) || Boolean(p?.sales?.edit));
          setAllowContributions(canViewModule(p, "contributions", plantK) || Boolean(p?.contributions?.edit));
          return;
        }
        setAllowExpense(hasExpenseAreaAccess(p, plantK));
        setAllowRoomOps(canAccessRoomOps(p, plantK));
        setAllowTunnelOps(canAccessTunnelOps(p, plantK));
        setAllowPlantOps(
          canViewModule(p, "plantOperations", plantK) ||
            canViewModule(p, "growingRoomOps", plantK) ||
            Boolean(p?.plantOperations?.edit || p?.growingRoomOps?.edit)
        );
        setAllowSales(canViewModule(p, "sales", plantK) || Boolean(p?.sales?.edit));
        setAllowContributions(canViewModule(p, "contributions", plantK) || Boolean(p?.contributions?.edit));
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [router]);

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

      <div className="grid grid-3" style={{ alignItems: "stretch", gap: "16px" }}>
        {allowExpense ? (
          <button
            className="card stat-card mode-card mode-card--expense"
            type="button"
            onClick={() => chooseMode("expense")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Expense</span>
            <span className="stat-hint">Vendors, materials, vouchers, and reports</span>
          </button>
        ) : null}
        {allowSales ? (
          <button
            className="card stat-card mode-card mode-card--sales"
            type="button"
            onClick={() => chooseMode("sales")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Sales</span>
            <span className="stat-hint">Sales invoices for mushrooms and compost</span>
          </button>
        ) : null}
        {allowContributions ? (
          <button
            className="card stat-card mode-card mode-card--contributions"
            type="button"
            onClick={() => chooseMode("contributions")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Contribution</span>
            <span className="stat-hint">Track contributions: primary recipient and transfer mode on every record</span>
          </button>
        ) : null}
        {allowRoomOps ? (
          <button
            className="card stat-card mode-card mode-card--room"
            type="button"
            onClick={() => chooseMode("room")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Room operations</span>
            <span className="stat-hint">Room stage and activity operations summary</span>
          </button>
        ) : null}
        {allowTunnelOps ? (
          <button
            className="card stat-card mode-card mode-card--tunnel"
            type="button"
            onClick={() => chooseMode("tunnel")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Tunnel &amp; Bunker Ops</span>
            <span className="stat-hint">Bunkers, one tunnel per batch, then growing rooms; movement alerts</span>
          </button>
        ) : null}
        {allowPlantOps ? (
          <button
            className="card stat-card mode-card mode-card--plant"
            type="button"
            onClick={() => chooseMode("plant")}
          >
            <span className="stat-value" style={{ fontSize: 22 }}>Plant Operations</span>
            <span className="stat-hint">
              Compost lifecycle, lagoon/bunker/tunnel allocation, raw materials, and growing room crop cycles
            </span>
          </button>
        ) : null}
        {isAdmin && allowAdminModule ? (
          <button className="card stat-card mode-card mode-card--admin" type="button" onClick={() => chooseMode("admin")}>
            <span className="stat-value" style={{ fontSize: 22 }}>Admin</span>
            <span className="stat-hint">Admin console and related controls</span>
          </button>
        ) : null}
      </div>

      {!isAdmin &&
      !allowExpense &&
      !allowSales &&
      !allowContributions &&
      !allowRoomOps &&
      !allowTunnelOps &&
      !allowPlantOps ? (
        <p className="page-lead" style={{ marginTop: 16 }}>
          No work areas are available for your account. Ask an administrator to assign roles under{" "}
          <strong>Admin → Users</strong> so you receive access to the modules you need.
        </p>
      ) : null}
    </div>
  );
}
