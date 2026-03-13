'use client';

import { useCallback } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Batch } from '../providers/coa-provider';

function generatePdfHtml(batch: Batch, qrDataUrl: string) {
  const resultsRows = batch.results
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e2d9;font-size:14px;color:#555;">${r.compound}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e2d9;font-size:14px;font-family:'Courier New',monospace;text-align:right;font-weight:600;">${r.amount}</td>
      </tr>`
    )
    .join('');

  const commentsRow = batch.comments
    ? `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e2d9;font-size:14px;color:#555;">${batch.comments.split(':')[0]}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e2d9;font-size:14px;font-family:'Courier New',monospace;text-align:right;font-weight:600;">${batch.comments.split(':')[1]?.trim()}</td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>COA - ${batch.product} - Task #${batch.taskNumber}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 0.75in; size: letter; }
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color:#1a1a1a; background:#fff; padding:40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:24px; border-bottom:2px solid #0B2E2F; }
    .brand { font-size:22px; font-weight:700; color:#0B2E2F; letter-spacing:-0.02em; }
    .brand-sub { font-size:11px; color:#888; margin-top:4px; letter-spacing:0.05em; text-transform:uppercase; }
    .doc-title { font-size:11px; text-align:right; color:#888; text-transform:uppercase; letter-spacing:0.1em; }
    .doc-title span { display:block; font-size:24px; color:#0B2E2F; font-weight:700; letter-spacing:-0.02em; text-transform:none; margin-top:4px; }
    .product-name { font-size:28px; font-weight:700; margin-bottom:4px; color:#0B2E2F; }
    .task-id { font-size:13px; color:#888; font-family:'Courier New',monospace; }
    .section { margin-top:28px; }
    .section-title { font-size:10px; text-transform:uppercase; letter-spacing:0.12em; color:#0B2E2F; font-weight:600; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid #e5e2d9; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px 24px; }
    .meta-item label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#999; margin-bottom:3px; }
    .meta-item p { font-size:13px; }
    .results-table { width:100%; border-collapse:collapse; margin-top:4px; }
    .results-table th { text-align:left; padding:8px 12px; font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#999; border-bottom:2px solid #0B2E2F; }
    .results-table th:last-child { text-align:right; }
    .purity-banner { margin-top:16px; padding:16px 20px; background:#f4f1ea; border-left:3px solid #0B2E2F; display:flex; justify-content:space-between; align-items:center; }
    .purity-label { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#666; }
    .purity-value { font-size:28px; font-weight:700; color:#0B2E2F; }
    .verify-section { margin-top:32px; padding-top:24px; border-top:2px solid #0B2E2F; display:flex; justify-content:space-between; align-items:flex-end; }
    .verify-info p { font-size:12px; color:#888; margin-bottom:4px; }
    .verify-info a { font-size:13px; color:#0B2E2F; word-break:break-all; }
    .verify-key { font-family:'Courier New',monospace; font-size:12px; color:#666; margin-top:6px; }
    .qr-container img { width:80px; height:80px; }
    .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e2d9; display:flex; justify-content:space-between; font-size:10px; color:#bbb; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">REVALIN</div>
      <div class="brand-sub">Trusted Testing Program</div>
    </div>
    <div class="doc-title">
      Certificate of Analysis
      <span>Task #${batch.taskNumber}</span>
    </div>
  </div>

  <div class="product-name">${batch.product}</div>
  <div class="task-id">Sample: ${batch.sample}</div>

  <div class="section">
    <div class="section-title">Testing Details</div>
    <div class="meta-grid">
      <div class="meta-item">
        <label>Testing Ordered</label>
        <p>${batch.testingOrdered}</p>
      </div>
      <div class="meta-item">
        <label>Sample Received</label>
        <p>${batch.sampleReceived}</p>
      </div>
      <div class="meta-item">
        <label>Analysis Date</label>
        <p>${batch.analysisDate}</p>
      </div>
      <div class="meta-item">
        <label>Manufacturer</label>
        <p>${batch.manufacturer}</p>
      </div>
      ${batch.batch ? `<div class="meta-item"><label>Batch</label><p>${batch.batch}</p></div>` : ''}
      <div class="meta-item">
        <label>Laboratory</label>
        <p>Janoshik Analytical</p>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Test Requested</div>
    <p style="font-size:13px;color:#555;">${batch.testRequested}</p>
  </div>

  <div class="section">
    <div class="section-title">Results</div>
    <table class="results-table">
      <thead>
        <tr>
          <th>Compound</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${resultsRows}
        ${commentsRow}
      </tbody>
    </table>
    ${
      batch.purity
        ? `<div class="purity-banner">
            <span class="purity-label">Purity</span>
            <span class="purity-value">${batch.purity}%</span>
          </div>`
        : ''
    }
  </div>

  <div class="verify-section">
    <div class="verify-info">
      <p>Independently verified via Janoshik Analytical</p>
      <a href="${batch.verifyUrl}" target="_blank">${batch.verifyUrl}</a>
      <div class="verify-key">Key: ${batch.verificationKey}</div>
    </div>
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="Verification QR Code" />
    </div>
  </div>

  <div class="footer">
    <span>Revalin Trusted &mdash; Third-Party Batch Testing</span>
    <span>Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
  </div>
</body>
</html>`;
}

export function COACard({ batch }: { batch: Batch }) {
  const hasPurity = !!batch.purity;

  const handleDownloadPdf = useCallback(() => {
    const svgEl = document.getElementById(`qr-${batch.id}`);
    let qrDataUrl = '';

    if (svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      qrDataUrl = `data:image/svg+xml;base64,${btoa(svgData)}`;
    }

    const html = generatePdfHtml(batch, qrDataUrl);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 300);
    }
  }, [batch]);

  return (
    <div className="relative w-full aspect-[3/4] md:aspect-square bg-muted group overflow-hidden">
      {/* Product image background */}
      {batch.imageUrl && (
        <div className="absolute inset-0 transition-opacity duration-300 md:group-hover:opacity-30">
          <Image
            src={batch.imageUrl}
            alt={batch.product}
            fill
            className="object-cover object-center"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        </div>
      )}

      {/* Default state — desktop only */}
      <div className="relative flex flex-col justify-end h-full p-4 transition-all duration-300 max-md:hidden group-hover:opacity-0 group-hover:-translate-y-full group-focus-within:opacity-0 group-focus-within:-translate-y-full">
        <p className="text-sm uppercase font-semibold text-balance">
          {batch.product}
        </p>
        {hasPurity ? (
          <p className="text-4xl font-semibold mt-1">{batch.purity}%</p>
        ) : (
          <p className="text-lg font-medium mt-1 text-muted-foreground">
            {batch.results.length} compound{batch.results.length > 1 ? 's' : ''} tested
          </p>
        )}
        <p className="text-xs text-muted-foreground font-mono mt-1">
          Task #{batch.taskNumber}
        </p>
      </div>

      {/* Hover overlay / always-visible on mobile */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-3 px-4 py-4 rounded-md transition-all duration-300 pointer-events-none bg-popover md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-within:translate-y-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto max-md:pointer-events-auto">
          {/* Header */}
          <div className="flex justify-between items-baseline">
            <p className="text-lg font-semibold">{batch.product}</p>
            {hasPurity && (
              <p className="text-sm font-semibold tabular-nums">{batch.purity}%</p>
            )}
          </div>

          {/* Results */}
          <div className="flex flex-col gap-1">
            {batch.results.map((result) => (
              <div key={result.compound} className="flex justify-between items-baseline text-xs">
                <span className="text-muted-foreground">{result.compound}</span>
                <span className="font-mono font-medium tabular-nums">{result.amount}</span>
              </div>
            ))}
            {batch.comments && (
              <div className="flex justify-between items-baseline text-xs">
                <span className="text-muted-foreground">{batch.comments.split(':')[0]}</span>
                <span className="font-mono font-medium tabular-nums">
                  {batch.comments.split(':')[1]?.trim()}
                </span>
              </div>
            )}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Task</p>
              <p className="font-mono text-xs">#{batch.taskNumber}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Analyzed</p>
              <p className="text-xs">{batch.analysisDate}</p>
            </div>
            {batch.batch && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Batch</p>
                <p className="font-mono text-xs">{batch.batch}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lab</p>
              <p className="text-xs">Janoshik Analytical</p>
            </div>
          </div>

          {/* QR + Verify + Download */}
          <div className="flex items-end justify-between pt-2 border-t border-border/50">
            <div className="flex flex-col gap-1.5">
              <a
                href={batch.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Verify result</span>
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground font-normal justify-start"
                onClick={handleDownloadPdf}
              >
                <Download className="w-3 h-3 mr-1.5" />
                Download PDF
              </Button>
            </div>
            <a
              href={batch.verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded bg-white p-1"
            >
              <QRCodeSVG
                id={`qr-${batch.id}`}
                value={batch.verifyUrl}
                size={48}
                bgColor="transparent"
                fgColor="#0B2E2F"
                level="M"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
