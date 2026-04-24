"use client";

import PageHeader from "../../../../components/PageHeader.js";
import PlantNetworkHub from "../../../../components/PlantNetworkHub.js";

export default function PlantNetworkPage() {
  return (
    <div className="page-stack page-stack--admin-plant-network w-full min-w-0 max-w-full">
      <PageHeader
        eyebrow="Super Admin"
        title="Plant network"
        description="Manage tenants, set the default plant for your login session, onboard sites, and impersonate users. Your day-to-day dashboard lives under Dashboard when a plant is selected (or set as default)."
      />
      <PlantNetworkHub hidePageHeader />
    </div>
  );
}
