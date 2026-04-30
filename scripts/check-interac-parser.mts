type ParsedInteracEmail = {
  message?: string | null;
  amount?: string | null;
  amountValue?: number | null;
  currency?: string | null;
  sentFrom?: string | null;
  bankReference?: string | null;
  transferDate?: string | null;
};

function normalizeEmailBody(value: string) {
  return value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|td|th|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAmount(value?: string | null) {
  if (!value) return null;
  const amountMatch = value.match(/\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?:\(?\s*CAD\s*\)?)?/i);
  const cleaned = (amountMatch?.[1] || value).replace(/,/g, '').replace(/[^\d.]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLabel(text: string, label: string, nextLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = nextLabels
    .map((nextLabel) => nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `(?:^|\\n|\\s{2,})\\s*${escapedLabel}\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n|\\s{2,}|\\s)+(?:${next})\\s*:?|$)`,
    'i',
  );
  const match = text.match(pattern);
  return match?.[1]?.trim().replace(/\n+/g, ' ') || null;
}

function parseInteracEmail(args: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): ParsedInteracEmail {
  const baseText = normalizeEmailBody([args.text, args.html ? stripHtml(args.html) : null]
    .filter(Boolean)
    .join('\n'));

  const labels = ['Message', 'Date', 'Reference Number', 'Sent From', 'Amount', 'FAQ'];
  const labelPattern = new RegExp(`\\s+(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'gi');
  const text = baseText.replace(labelPattern, '\n$1:');
  const message = extractLabel(text, 'Message', labels.filter((label) => label !== 'Message'));
  const transferDate = extractLabel(text, 'Date', labels.filter((label) => label !== 'Date'));
  const bankReference = extractLabel(text, 'Reference Number', labels.filter((label) => label !== 'Reference Number'));
  const sentFrom = extractLabel(text, 'Sent From', labels.filter((label) => label !== 'Sent From'));
  const amountField = extractLabel(text, 'Amount', labels.filter((label) => label !== 'Amount'));
  const subjectAmount = args.subject?.match(/received\s+\$?([\d,]+(?:\.\d{2})?)/i)?.[1] || null;
  const amountValue = parseAmount(amountField || subjectAmount);
  const currency = amountField?.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase() || 'CAD';

  return {
    message,
    transferDate,
    bankReference,
    sentFrom,
    amount: amountField || subjectAmount,
    amountValue,
    currency,
  };
}

const subject = "Interac e-Transfer: You've received $400.00 from Azim Ismail Hamza and it has been automatically deposited.";
const text = `Hi ROBERT CHANNA,
Funds Deposited!
$400.00
Your funds have been automatically deposited into your account at TD Canada Trust at rob33channa@gmail.com.

Transfer Details

Message:

RVL-7F3K-92Q

Date:

April 24, 2026

Reference Number:

CA6eTUZS

Sent From:

Azim Ismail Hamza

Amount:

$400.00 (CAD)

FAQ`;

const sameLineText = `Transfer Details Message: RVL-7F3K-92Q Date: April 24, 2026 Reference Number: CA6eTUZS Sent From: Azim Ismail Hamza Amount: $400.00 (CAD) FAQ`;

const expected = {
  message: 'RVL-7F3K-92Q',
  transferDate: 'April 24, 2026',
  bankReference: 'CA6eTUZS',
  sentFrom: 'Azim Ismail Hamza',
  amountValue: 400,
  currency: 'CAD',
};

function check(name: string, parsed: ParsedInteracEmail) {
  const failures = Object.entries(expected).filter(([key, value]) => {
    return parsed[key as keyof ParsedInteracEmail] !== value;
  });
  const ok = failures.length === 0;
  console.log(`<output name="${name}" result="${ok ? 'yes' : 'no'}">${JSON.stringify(parsed)}</output>`);
  if (!ok) {
    process.exitCode = 1;
  }
}

check('interac-multiline-template', parseInteracEmail({ subject, text }));
check('interac-same-line-template', parseInteracEmail({ subject, text: sameLineText }));
