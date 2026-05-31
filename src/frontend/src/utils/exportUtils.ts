// ─── CSV Export ──────────────────────────────────────────────────────────────

/**
 * Exports data as a CSV file download.
 *
 * @param filename - Suggested download filename (e.g. "positions.csv").
 * @param headers  - Column header labels.
 * @param rows     - Data rows; each inner array maps to a column.
 */
export function exportCSV(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  try {
    const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escapeCell).join(","),
      ...rows.map((row) => row.map(escapeCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[exportCSV] Failed to export CSV:", err);
  }
}

// ─── PDF Generation via print window ─────────────────────────────────────────

export interface PDFSection {
  title: string;
  rows: { label: string; value: string }[];
}

export interface PDFReportOptions {
  title: string;
  date: string;
  walletAddress: string;
  sections: PDFSection[];
  tableHeaders?: string[];
  tableRows?: string[][];
  summary?: { label: string; value: string }[];
}

/**
 * Opens a print-ready dark-themed HTML report in a new window.
 *
 * @param opts - Report configuration (title, date, wallet, sections, etc.).
 */
export function exportPDF(opts: PDFReportOptions): void {
  const summaryHtml = opts.summary
    ? opts.summary
        .map(
          (s) =>
            `<div class="summary-item"><span class="summary-label">${s.label}</span><span class="summary-value">${s.value}</span></div>`,
        )
        .join("")
    : "";

  const sectionsHtml = opts.sections
    .map(
      (section) =>
        `<div class="section">
          <h3 class="section-title">${section.title}</h3>
          <table class="data-table">
            <tbody>
              ${section.rows.map((r) => `<tr><td class="dt-label">${r.label}</td><td class="dt-value">${r.value}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>`,
    )
    .join("");

  const tableHtml =
    opts.tableHeaders && opts.tableRows
      ? `<div class="section">
          <h3 class="section-title">Data Table</h3>
          <table class="main-table">
            <thead>
              <tr>${opts.tableHeaders.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${opts.tableRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${opts.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #e2e8f0; font-size: 11px; }
    .page { max-width: 760px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3b82f6; padding-bottom: 14px; margin-bottom: 20px; }
    .logo { font-size: 20px; font-weight: 800; color: #60a5fa; letter-spacing: -0.5px; }
    .logo span { color: #a78bfa; }
    .meta { text-align: right; font-size: 10px; color: #94a3b8; }
    .meta strong { color: #e2e8f0; font-size: 11px; }
    .meta .date { font-size: 11px; font-weight: 600; color: #60a5fa; margin-bottom: 2px; }
    .wallet { font-size: 9px; font-family: monospace; color: #94a3b8; word-break: break-all; max-width: 260px; text-align: right; }
    .summary-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
    .summary-item { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; }
    .summary-label { display: block; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .summary-value { display: block; font-size: 15px; font-weight: 700; color: #60a5fa; font-family: 'Courier New', monospace; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #1e293b; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table td { padding: 5px 8px; border-bottom: 1px solid #1e293b; }
    .dt-label { color: #94a3b8; width: 40%; }
    .dt-value { color: #e2e8f0; font-family: 'Courier New', monospace; font-weight: 600; }
    .main-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    .main-table th { background: #1e293b; color: #94a3b8; padding: 6px 8px; text-align: left; border-bottom: 1px solid #334155; font-weight: 600; text-transform: uppercase; font-size: 8px; letter-spacing: 0.5px; }
    .main-table td { padding: 5px 8px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-family: 'Courier New', monospace; }
    .main-table tr:hover td { background: #1e293b; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #1e293b; text-align: center; font-size: 9px; color: #475569; }
    @media print {
      body { background: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="logo">DeFi Pool <span>Analytics</span></div>
        <div style="font-size: 10px; color: #64748b; margin-top: 3px;">Comprehensive Position Report</div>
      </div>
      <div class="meta">
        <div class="date">${opts.date}</div>
        <div>Wallet Address:</div>
        <div class="wallet">${opts.walletAddress}</div>
      </div>
    </div>

    ${summaryHtml ? `<div class="summary-bar">${summaryHtml}</div>` : ""}
    ${sectionsHtml}
    ${tableHtml}

    <div class="footer">Generated by DeFi Pool Analytics &bull; caffeine.ai &bull; ${opts.date}</div>
  </div>
</body>
</html>`;

  try {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      console.warn(
        "[exportPDF] Popup was blocked — allow pop-ups for this site.",
      );
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch (printErr) {
        console.error("[exportPDF] window.print() failed:", printErr);
      }
    }, 600);
  } catch (err) {
    console.error("[exportPDF] Failed to open print window:", err);
  }
}
