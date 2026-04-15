import { formatIndianRupee } from "./formatIndianRupee.js";
import { buildLetterheadForPdf } from "./invoiceLetterhead.js";

function safe(v) {
  const s = String(v ?? "").trim();
  return s || "—";
}

function displayCustomer(row) {
  const n = String(row.customerName || row.buyerName || "").trim();
  return n || "—";
}

function categoryLabel(cat) {
  if (cat === "compost") return "Compost";
  return "Mushrooms";
}

function invoiceFileBase(sale) {
  const inv = String(sale.invoiceNumber || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  if (inv) return `Sales-invoice-${inv}`;
  const id = sale._id ? String(sale._id) : "invoice";
  return `Sales-invoice-${id}`;
}

function measureImageFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: Math.max(1, img.naturalWidth || img.width || 1),
        height: Math.max(1, img.naturalHeight || img.height || 1)
      });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function fitLogoToBox(imgW, imgH, boxW, boxH) {
  const iw = Number(imgW) || 1;
  const ih = Number(imgH) || 1;
  const scale = Math.min(boxW / iw, boxH / ih, 1);
  return { w: iw * scale, h: ih * scale };
}

/** @returns {Promise<{ dataUrl: string, format: string, imgW: number, imgH: number } | null>} */
async function loadLogoForPdf(logoUrl) {
  if (!logoUrl || typeof window === "undefined") return null;
  try {
    const res = await fetch(logoUrl, { mode: "cors", cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = (blob.type || "").toLowerCase();
    if (mime.includes("svg")) return null;
    let format = "PNG";
    if (mime.includes("jpeg") || mime.includes("jpg")) format = "JPEG";
    else if (mime.includes("webp")) format = "WEBP";
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
    const { width, height } = await measureImageFromDataUrl(dataUrl);
    return { dataUrl, format, imgW: width, imgH: height };
  } catch {
    return null;
  }
}

/** jsPDF: y is baseline. Approx. vertical centre of one line in [top, top+h]. */
function baselineVCenter(boxTop, boxH, fontSize) {
  return boxTop + boxH / 2 + fontSize * 0.28;
}

/** First baseline for a block of `lines` lines at `lineH` spacing, block centred in [top, top+h]. */
function baselineBlockVCenter(boxTop, boxH, lineCount, lineH, fontSize) {
  if (lineCount <= 0) return baselineVCenter(boxTop, boxH, fontSize);
  const blockH = lineCount * lineH;
  const offsetTop = (boxH - blockH) / 2;
  return boxTop + offsetTop + fontSize * 0.72;
}

/**
 * Build and trigger download of a printable sales invoice PDF (client-side).
 * @param {Record<string, unknown>} sale — API sale document (flat fields)
 * @param {Record<string, unknown> | null | undefined} letterheadApi — JSON from GET /settings/invoice-letterhead (optional)
 */
export async function downloadSaleInvoicePdf(sale, letterheadApi) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const brand = buildLetterheadForPdf(letterheadApi);
  let logo = brand.logoUrl ? await loadLogoForPdf(brand.logoUrl) : null;
  if (!logo && typeof window !== "undefined") {
    logo = await loadLogoForPdf(`${window.location.origin}/icon-192.png`);
  }

  const accent = [114, 76, 31];
  const ink = [32, 30, 28];
  const muted = [82, 78, 74];
  const headerFill = [253, 251, 248];
  const headerBorder = [214, 200, 182];
  const bandFill = [114, 76, 31];
  const billBg = [248, 245, 241];
  const tableHeadBg = [238, 230, 220];
  const logoMatBorder = [228, 218, 206];

  const LOGO_BOX_W = 76;
  const LOGO_BOX_H = 64;
  const headerPad = 16;
  const left = margin;
  const right = pageW - margin;
  const innerW = right - left;
  const headerTop = margin;
  const hasLogoImage = Boolean(logo);
  const textXStart = left + headerPad + (hasLogoImage ? LOGO_BOX_W + 18 : 0);
  const textMaxW = Math.max(80, right - headerPad - textXStart);

  const cardInnerTop = headerTop;
  const blockTop = cardInnerTop + headerPad + 13;

  let curY = blockTop;
  const nameH = (() => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const lines = doc.splitTextToSize(brand.legalName, textMaxW);
    return lines.length * 17 + 2;
  })();
  curY += nameH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let addrH = 0;
  for (const line of brand.addressLines) {
    const wrapped = doc.splitTextToSize(line, textMaxW);
    addrH += wrapped.length * 12;
  }
  curY += addrH + (brand.addressLines.length ? 6 : 0);

  const contact = [];
  if (brand.phone) contact.push(`Tel: ${brand.phone}`);
  if (brand.gstin) contact.push(`Company GSTIN: ${brand.gstin}`);
  if (brand.website) contact.push(`Web: ${brand.website}`);
  if (brand.email) contact.push(`Email: ${brand.email}`);
  doc.setFontSize(8.5);
  let contactH = 0;
  for (const c of contact) {
    const wrapped = doc.splitTextToSize(c, textMaxW);
    contactH += wrapped.length * 11.5;
  }
  curY += contactH + (contact.length ? headerPad : 10);

  const logoBottom = cardInnerTop + headerPad + LOGO_BOX_H + headerPad;
  const headerBottom = Math.max(curY, logoBottom) + 8;

  doc.setFillColor(...headerFill);
  doc.roundedRect(left, cardInnerTop, innerW, headerBottom - cardInnerTop, 5, 5, "F");
  doc.setDrawColor(...headerBorder);
  doc.setLineWidth(0.45);
  doc.roundedRect(left, cardInnerTop, innerW, headerBottom - cardInnerTop, 5, 5, "S");

  if (hasLogoImage && logo) {
    const matTop = cardInnerTop + headerPad - 1;
    const matLeft = left + headerPad - 1;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...logoMatBorder);
    doc.setLineWidth(0.35);
    doc.roundedRect(matLeft, matTop, LOGO_BOX_W + 2, LOGO_BOX_H + 2, 4, 4, "FD");
    const { w, h } = fitLogoToBox(logo.imgW, logo.imgH, LOGO_BOX_W, LOGO_BOX_H);
    const lx = left + headerPad + (LOGO_BOX_W - w) / 2;
    const ly = matTop + 1 + (LOGO_BOX_H - h) / 2;
    try {
      doc.addImage(logo.dataUrl, logo.format, lx, ly, w, h, undefined, "FAST");
    } catch {
      // ignore
    }
  }

  curY = blockTop;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const nameLines = doc.splitTextToSize(brand.legalName, textMaxW);
  for (const nl of nameLines) {
    doc.text(nl, textXStart, curY);
    curY += 17;
  }
  curY += 3;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  for (const line of brand.addressLines) {
    const wrapped = doc.splitTextToSize(line, textMaxW);
    for (const w of wrapped) {
      doc.text(w, textXStart, curY);
      curY += 12;
    }
  }
  if (brand.addressLines.length) curY += 4;

  doc.setFontSize(8.5);
  for (const c of contact) {
    const wrapped = doc.splitTextToSize(c, textMaxW);
    for (const w of wrapped) {
      doc.text(w, textXStart, curY);
      curY += 11.5;
    }
  }

  let y = headerBottom + 18;

  const sold = sale.soldAt
    ? new Date(sale.soldAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "—";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const invNo = safe(sale.invoiceNumber);
  const metaLine = `Invoice no. ${invNo}  ·  Date: ${sold}`;
  const metaLines = doc.splitTextToSize(metaLine, innerW - headerPad * 2);
  const titleLead = 13;
  const gapTitleMeta = 4;
  const metaLineH = 10;
  const stackH = titleLead + gapTitleMeta + metaLines.length * metaLineH;
  const bandPad = 9;
  const bandH = stackH + bandPad * 2;

  const bandTop = y;
  doc.setFillColor(...bandFill);
  doc.roundedRect(left, bandTop, innerW, bandH, 4, 4, "F");

  const stackTop = bandTop + (bandH - stackH) / 2;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const titleBase = stackTop + 12 * 0.72;
  doc.text("SALES INVOICE", left + headerPad, titleBase);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 250, 245);
  let metaY = stackTop + titleLead + gapTitleMeta + 8.5 * 0.72;
  for (const ml of metaLines) {
    doc.text(ml, left + headerPad, metaY);
    metaY += metaLineH;
  }
  y = bandTop + bandH + 14;

  const addr = String(sale.customerAddress ?? "").trim();
  const billRows = [
    ["Customer", displayCustomer(sale)],
    ...(addr ? [["Address", addr]] : []),
    ["Contact", safe(sale.buyerContact)],
    ["GSTIN", safe(sale.gstin)],
    ["PAN", safe(sale.pan)],
    ["Aadhaar", safe(sale.aadhaar)]
  ];
  const colLabel = left + headerPad;
  const colVal = left + headerPad + 92;
  const billValMaxW = right - colVal - headerPad;
  const rowLineH = 11;
  const rowGap = 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const billTitleBlock = 14;
  let bodyH = billTitleBlock;
  for (const [, val] of billRows) {
    const chunks = doc.splitTextToSize(val, billValMaxW);
    const n = Math.max(1, chunks.length);
    bodyH += n * rowLineH + rowGap;
  }
  bodyH -= rowGap;
  const billPadT = 9;
  const billPadB = 9;
  const billCardH = billPadT + bodyH + billPadB;
  const billCardTop = y - billPadT;

  doc.setFillColor(...billBg);
  doc.setDrawColor(...headerBorder);
  doc.setLineWidth(0.35);
  doc.roundedRect(left, billCardTop, innerW, billCardH, 5, 5, "FD");
  doc.setFillColor(...accent);
  doc.rect(left, billCardTop, 4, billCardH, "F");

  const billContentTop = billCardTop + billPadT + Math.max(0, (billCardH - billPadT - billPadB - bodyH) / 2);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  let rowY = billContentTop + 10.5 * 0.72;
  doc.text("Bill to", colLabel, rowY);

  rowY += billTitleBlock;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const [lab, val] of billRows) {
    doc.setTextColor(...muted);
    doc.text(`${lab}`, colLabel, rowY);
    doc.setTextColor(...ink);
    const chunks = doc.splitTextToSize(val, billValMaxW);
    doc.text(chunks[0] || "—", colVal, rowY);
    let valY = rowY;
    for (let i = 1; i < chunks.length; i++) {
      valY += rowLineH;
      doc.text(chunks[i], colVal, valY);
    }
    rowY = valY + rowLineH + rowGap;
  }
  y = billCardTop + billCardH + 12;

  const padInner = 12;
  const xDescL = left + padInner;
  const xQty = left + innerW * 0.56;
  const xUnit = left + innerW * 0.66;
  const xAmtR = right - padInner;
  const descMaxW = Math.max(100, xQty - xDescL - 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text("Line items", xDescL, y);
  y += 12;

  const tableHeadH = 20;
  const tableTop = y;
  doc.setFillColor(...tableHeadBg);
  doc.setDrawColor(...headerBorder);
  doc.roundedRect(left, tableTop, innerW, tableHeadH, 3, 3, "FD");
  doc.setTextColor(...ink);
  doc.setFontSize(9);
  const headBase = baselineVCenter(tableTop, tableHeadH, 9);
  doc.text("Description", xDescL, headBase);
  doc.text("Qty", xQty, headBase);
  doc.text("Unit", xUnit, headBase);
  doc.text("Amount", xAmtR, headBase, { align: "right" });
  y = tableTop + tableHeadH;
  y += 8;

  const desc = `${categoryLabel(sale.productCategory)} — ${safe(sale.productName)}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  const descLineH = 11.5;
  const descLines = doc.splitTextToSize(desc, descMaxW);
  const descLineCount = descLines.length;
  const numsFont = 9;
  const numsLineH = 11;
  const rowPad = 8;
  const contentH = Math.max(descLineCount * descLineH, numsLineH);
  const rowH = contentH + rowPad * 2;
  const rowTop = y;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...headerBorder);
  doc.setLineWidth(0.35);
  doc.roundedRect(left, rowTop, innerW, rowH, 3, 3, "FD");

  const descFirstBase = baselineBlockVCenter(rowTop, rowH, descLineCount, descLineH, 9);
  let dy = descFirstBase;
  for (const dl of descLines) {
    doc.text(dl, xDescL, dy);
    dy += descLineH;
  }

  doc.setFont("helvetica", "normal");
  const numsY = baselineVCenter(rowTop, rowH, numsFont);
  doc.text(String(sale.quantity ?? "—"), xQty, numsY);
  doc.text(safe(sale.unit), xUnit, numsY);
  const lineSubNum = Number(sale.lineSubTotal);
  const hasLineSub = Number.isFinite(lineSubNum) && lineSubNum > 0;
  const discType = String(sale.discountType || "none");
  const taxAmtNum = Number(sale.taxAmount) || 0;
  const tp = Number(sale.taxPercent) || 0;
  const afterDisc = Math.max(0, Number(sale.totalAmount) - taxAmtNum);
  const lineDisplayAmount = hasLineSub ? lineSubNum : Number(sale.totalAmount) || 0;
  doc.setFont("helvetica", "bold");
  doc.text(formatIndianRupee(lineDisplayAmount), xAmtR, numsY, { align: "right" });
  doc.setFont("helvetica", "normal");
  y = rowTop + rowH + 10;

  doc.setTextColor(...muted);
  doc.setFontSize(9);
  doc.text(`Payment mode: ${safe(sale.paymentMode)}`, xDescL, y);
  y += 16;

  if (hasLineSub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const sumLeft = xDescL;
    const sumRight = xAmtR;
    const sumLine = 11;
    doc.setTextColor(...muted);
    doc.text("Line subtotal (excl. GST)", sumLeft, y);
    doc.setTextColor(...ink);
    doc.text(formatIndianRupee(lineSubNum), sumRight, y, { align: "right" });
    y += sumLine;
    if (discType !== "none" && Number(sale.discountValue) > 0) {
      const dv = Number(sale.discountValue) || 0;
      const discRupees = Math.max(0, lineSubNum - afterDisc);
      const lab = discType === "percent" ? `Discount (${Math.min(100, dv)}%)` : "Discount (flat)";
      doc.setTextColor(...muted);
      doc.text(lab, sumLeft, y);
      doc.setTextColor(...ink);
      doc.text(formatIndianRupee(discRupees), sumRight, y, { align: "right" });
      y += sumLine;
    }
    doc.setTextColor(...muted);
    doc.text("Taxable / after discount", sumLeft, y);
    doc.setTextColor(...ink);
    doc.text(formatIndianRupee(afterDisc), sumRight, y, { align: "right" });
    y += sumLine;
    if (taxAmtNum > 0 || tp > 0) {
      doc.setTextColor(...muted);
      doc.text(`GST (${tp}%)`, sumLeft, y);
      doc.setTextColor(...ink);
      doc.text(formatIndianRupee(taxAmtNum), sumRight, y, { align: "right" });
      y += sumLine + 4;
    } else {
      y += 4;
    }
  }

  const totalBoxH = 32;
  const totalTop = y;
  doc.setFillColor(252, 248, 243);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.55);
  doc.roundedRect(left, totalTop, innerW, totalBoxH, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...accent);
  const totBase = baselineVCenter(totalTop, totalBoxH, 12);
  doc.setFontSize(11);
  doc.text("Total payable", xDescL, totBase);
  doc.setFontSize(12);
  doc.text(formatIndianRupee(sale.totalAmount), xAmtR, totBase, { align: "right" });
  y = totalTop + totalBoxH + 14;

  const notes = String(sale.notes ?? "").trim();
  if (notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text("Notes", xDescL, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    const noteLines = doc.splitTextToSize(notes, maxW);
    for (const nl of noteLines) {
      if (y > pageH - margin - 36) {
        doc.addPage();
        y = margin + 12;
      }
      doc.text(nl, xDescL, y);
      y += 11.5;
    }
    y += 8;
  }

  if (y > pageH - margin - 40) {
    doc.addPage();
    y = margin + 12;
  }
  doc.setDrawColor(...headerBorder);
  doc.setLineWidth(0.4);
  doc.line(left + 20, pageH - margin - 22, right - 20, pageH - margin - 22);
  doc.setFillColor(...accent);
  doc.circle(left + 12, pageH - margin - 22, 2, "F");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(132, 126, 118);
  doc.text(
    "Computer-generated invoice for your records. Authorised signatory not required unless stamped by the company.",
    xDescL,
    pageH - margin - 11,
    { maxWidth: maxW }
  );

  doc.save(`${invoiceFileBase(sale)}.pdf`);
}
