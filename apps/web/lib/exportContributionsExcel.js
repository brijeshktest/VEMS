import * as XLSX from "xlsx";

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Export dashboard per-person summary (same columns as the table, plus a Totals sheet).
 */
export function downloadPerPersonContributionSummaryXlsx(contributionSummary) {
  if (!contributionSummary?.members?.length) return;
  const members = contributionSummary.members;
  const rows = members.map((m) => ({
    Individual: m.name,
    Role: m.isPrimaryHolder ? "Primary account" : "Contributor",
    "Bank Contribution (Rs)": Number(m.contributionTotal) || 0,
    "Direct expense (Rs)": Number(m.expenseContributionTotal) || 0,
    "Total contribution (Rs)": Number(m.totalContribution ?? m.contributionTotal) || 0,
    "Routed to Sunil (Rs)": Number(m.routedToSunil) || 0,
    "Routed to bank from Primary (Rs)":
      m.receivedOnPaperTotal != null ? Number(m.receivedOnPaperTotal) || 0 : "",
    "Routed to bank from Primary (rows)": m.receivedOnPaperCount != null ? m.receivedOnPaperCount : ""
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Per-person summary");

  const totals = [
    {
      Field: "Bank contribution module total (Rs)",
      Value: Number(contributionSummary.totalContributions) || 0
    },
    { Field: "Contribution record count", Value: contributionSummary.entryCount ?? 0 },
    {
      Field: "Direct expense total (Rs)",
      Value: Number(contributionSummary.totalExpenseContribution) || 0
    },
    {
      Field: "Combined total (Rs)",
      Value: Number(
        contributionSummary.totalContributionCombined ?? contributionSummary.totalContributions
      ) || 0
    },
    {
      Field: "Received on paper — Sunil (Rs)",
      Value: Number(contributionSummary.receivedByPrimary?.Sunil?.totalAmount) || 0
    },
    {
      Field: "Received on paper — Shailendra (Rs)",
      Value: Number(contributionSummary.receivedByPrimary?.Shailendra?.totalAmount) || 0
    }
  ];
  const wsTotals = XLSX.utils.json_to_sheet(totals);
  XLSX.utils.book_append_sheet(wb, wsTotals, "Totals");

  XLSX.writeFile(wb, `contribution-per-person-summary-${fileStamp()}.xlsx`);
}

/**
 * Export contribution entry rows (full list from API).
 */
export function downloadContributionEntriesXlsx(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const rows = list.map((row) => ({
    Date: row.contributedAt ? new Date(row.contributedAt).toLocaleDateString("en-IN") : "",
    "Date (ISO)": row.contributedAt ? new Date(row.contributedAt).toISOString() : "",
    Contributor: row.member ?? "",
    "Amount (Rs)": Number(row.amount) || 0,
    "Received by (primary)": row.toPrimaryHolder ?? "",
    "Transfer mode": row.transferMode ?? "",
    Notes: row.notes ?? "",
    "Record ID": row._id ? String(row._id) : ""
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "All account contributions");
  XLSX.writeFile(wb, `all-account-contributions-${fileStamp()}.xlsx`);
}
