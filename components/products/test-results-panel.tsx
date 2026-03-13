'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, FlaskConical, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBodyScrollLock } from '@/lib/hooks/use-body-scroll-lock';
import type { BatchData } from '@/lib/coa-data';

function generatePdfHtml(batch: BatchData, qrDataUrl: string) {
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
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 0.75in; size: letter; } }
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
    <div><div class="brand">REVALIN</div><div class="brand-sub">Trusted Testing Program</div></div>
    <div class="doc-title">Certificate of Analysis<span>Task #${batch.taskNumber}</span></div>
  </div>
  <div class="product-name">${batch.product}</div>
  <div class="task-id">Sample: ${batch.sample}</div>
  <div class="section">
    <div class="section-title">Testing Details</div>
    <div class="meta-grid">
      <div class="meta-item"><label>Testing Ordered</label><p>${batch.testingOrdered}</p></div>
      <div class="meta-item"><label>Sample Received</label><p>${batch.sampleReceived}</p></div>
      <div class="meta-item"><label>Analysis Date</label><p>${batch.analysisDate}</p></div>
      <div class="meta-item"><label>Manufacturer</label><p>${batch.manufacturer}</p></div>
      ${batch.batch ? `<div class="meta-item"><label>Batch</label><p>${batch.batch}</p></div>` : ''}
      <div class="meta-item"><label>Laboratory</label><p>Janoshik Analytical</p></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Test Requested</div>
    <p style="font-size:13px;color:#555;">${batch.testRequested}</p>
  </div>
  <div class="section">
    <div class="section-title">Results</div>
    <table class="results-table">
      <thead><tr><th>Compound</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${resultsRows}${commentsRow}</tbody>
    </table>
    ${batch.purity ? `<div class="purity-banner"><span class="purity-label">Purity</span><span class="purity-value">${batch.purity}%</span></div>` : ''}
  </div>
  <div class="verify-section">
    <div class="verify-info">
      <p>Independently verified via Janoshik Analytical</p>
      <a href="${batch.verifyUrl}" target="_blank">${batch.verifyUrl}</a>
      <div class="verify-key">Key: ${batch.verificationKey}</div>
    </div>
    <div class="qr-container"><img src="${qrDataUrl}" alt="Verification QR Code" /></div>
  </div>
  <div class="footer">
    <span>Revalin Trusted &mdash; Third-Party Batch Testing</span>
    <span>Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
  </div>
</body>
</html>`;
}

function BatchCard({
  batch,
  index,
}: {
  batch: BatchData;
  index: number;
}) {
  const handleDownloadPdf = useCallback(() => {
    const svgEl = document.getElementById(`panel-qr-${batch.id}`);
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="rounded-md bg-background p-4 flex flex-col gap-3"
    >
      {/* Header with purity */}
      <div className="flex justify-between items-baseline">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Task #{batch.taskNumber}
          </p>
          <p className="text-base font-semibold mt-0.5">{batch.product}</p>
        </div>
        {batch.purity && (
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums leading-none">{batch.purity}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Purity</p>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="flex flex-col gap-1 py-2 border-y border-border/50">
        {batch.results.map((result) => (
          <div key={result.compound} className="flex justify-between items-baseline text-sm">
            <span className="text-muted-foreground">{result.compound}</span>
            <span className="font-mono font-medium tabular-nums">{result.amount}</span>
          </div>
        ))}
        {batch.comments && (
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-muted-foreground">{batch.comments.split(':')[0]}</span>
            <span className="font-mono font-medium tabular-nums">
              {batch.comments.split(':')[1]?.trim()}
            </span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Analyzed</p>
          <p className="text-xs">{batch.analysisDate}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lab</p>
          <p className="text-xs">Janoshik Analytical</p>
        </div>
        {batch.batch && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Batch</p>
            <p className="text-xs font-mono">{batch.batch}</p>
          </div>
        )}
      </div>

      {/* QR + actions */}
      <div className="flex items-end justify-between pt-2 border-t border-border/50">
        <div className="flex flex-col gap-1.5">
          <a
            href={batch.verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Verify on Janoshik
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
          className="block rounded bg-white p-1.5 shrink-0"
        >
          <QRCodeSVG
            id={`panel-qr-${batch.id}`}
            value={batch.verifyUrl}
            size={56}
            bgColor="transparent"
            fgColor="#0B2E2F"
            level="M"
          />
        </a>
      </div>
    </motion.div>
  );
}

export function TestResultsTrigger({ batches }: { batches: BatchData[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen]);

  if (batches.length === 0) return null;

  const topPurity = batches.find((b) => b.purity)?.purity;

  return (
    <>
      {/* Trigger row */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-between w-full gap-3 px-3 py-2.5 rounded-md bg-muted/60 hover:bg-muted transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[#0B2E2F] shrink-0">
            <FlaskConical className="w-4 h-4 text-[#F4F1EA]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium leading-tight">Third-Party Tested</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {batches.length} test{batches.length > 1 ? 's' : ''} by Janoshik Analytical
              {topPurity && <> &middot; {topPurity}% purity</>}
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
          View
        </span>
      </button>

      {/* Panel overlay — portalled to body to escape stacking contexts */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="fixed inset-0 z-[100] bg-foreground/30"
                  onClick={() => setIsOpen(false)}
                  aria-hidden="true"
                />

                {/* Desktop: left slide-out panel */}
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="fixed top-0 bottom-0 left-0 z-[100] hidden md:flex w-[480px] p-modal-sides"
                >
                  <div className="flex flex-col w-full rounded bg-muted overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-baseline px-4 pt-4 pb-3">
                      <div>
                        <p className="text-xl font-semibold">Test Results</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Independent third-party analysis by Janoshik Analytical
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Close test results"
                        onClick={() => setIsOpen(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Scrollable batch cards */}
                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
                      {batches.map((batch, i) => (
                        <BatchCard key={batch.id} batch={batch} index={i} />
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-border/50">
                      <a
                        href="/coa"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View all Certificates of Analysis &rarr;
                      </a>
                    </div>
                  </div>
                </motion.div>

                {/* Mobile: bottom drawer */}
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="fixed inset-x-0 bottom-0 z-[100] md:hidden"
                  style={{ maxHeight: '85vh' }}
                >
                  <div className="flex flex-col bg-muted rounded-t-xl overflow-hidden" style={{ maxHeight: '85vh' }}>
                    {/* Drag handle */}
                    <div className="flex justify-center pt-3 pb-1">
                      <div className="w-10 h-1 rounded-full bg-border" />
                    </div>

                    {/* Header */}
                    <div className="flex justify-between items-baseline px-4 pb-3">
                      <div>
                        <p className="text-lg font-semibold">Test Results</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Janoshik Analytical
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Close test results"
                        onClick={() => setIsOpen(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Scrollable batch cards */}
                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
                      {batches.map((batch, i) => (
                        <BatchCard key={batch.id} batch={batch} index={i} />
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-border/50 pb-[env(safe-area-inset-bottom,12px)]">
                      <a
                        href="/coa"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View all Certificates of Analysis &rarr;
                      </a>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
