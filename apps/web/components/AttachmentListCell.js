"use client";

import { downloadAttachment } from "../lib/api.js";

/**
 * @param {{ _id: string }} entity — vendor or voucher with Mongo id
 * @param {"vendor" | "voucher"} kind
 */
export default function AttachmentListCell({ entity, kind }) {
  const list = entity.attachments || [];
  const id = entity._id?.toString?.() ?? entity._id;
  if (!list.length) {
    return <span className="cell-muted">—</span>;
  }
  const prefix = kind === "vendor" ? `/vendors/${id}/attachments/download` : `/vouchers/${id}/attachments/download`;

  return (
    <ul className="attachment-list-cell">
      {list.map((att) => (
        <li key={att._id?.toString?.() || att.storedName}>
          <button
            type="button"
            className="link-btn link-btn--table"
            title={att.originalName}
            onClick={() => downloadAttachment(`${prefix}/${att.storedName}`)}
          >
            <span className="attachment-list-cell__name">{att.originalName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
