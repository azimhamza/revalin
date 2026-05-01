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
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
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

function normalizeCode(value?: string | null) {
  const normalized = (value || '')
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-');
  const match = normalized.match(/\bRVL\s*-\s*([A-Z0-9]{3,5})\s*-\s*([A-Z0-9]{3,5})\b/);

  if (match) {
    return `RVL-${match[1]}-${match[2]}`;
  }

  return normalized;
}

function normalizeLabel(value: string) {
  return value
    .replace(/:$/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function extractLineLabel(text: string, label: string, nextLabels: string[]) {
  const normalizedLabel = normalizeLabel(label);
  const normalizedNextLabels = new Set(nextLabels.map(normalizeLabel));
  const lines = text.split('\n').map(line => line.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    if (!line) continue;

    const [left, ...rightParts] = line.split(':');
    if (normalizeLabel(left || line) !== normalizedLabel) {
      continue;
    }

    const inlineValue = rightParts.join(':').trim();
    if (inlineValue) {
      return inlineValue;
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] || '';
      if (!nextLine) continue;

      if (normalizedNextLabels.has(normalizeLabel(nextLine))) {
        break;
      }

      return nextLine;
    }
  }

  return null;
}

function extractField(text: string, label: string, nextLabels: string[]) {
  return extractLabel(text, label, nextLabels) || extractLineLabel(text, label, nextLabels);
}

function extractMessageCode(value?: string | null) {
  const normalized = normalizeCode(value);
  return normalized.match(/\bRVL-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}\b/)?.[0] || null;
}

function extractFallbackAmount(text: string, subject?: string | null) {
  return (
    subject?.match(/(?:received|deposited)\s+\$?([\d,]+(?:\.\d{2})?)/i)?.[1] ||
    text.match(/Funds Deposited!\s*\n\s*(\$?\s*[\d,]+(?:\.\d{2})?(?:\s*\([A-Z]{3}\))?)/i)?.[1] ||
    text.match(/\$\s*[\d,]+(?:\.\d{2})?\s*(?:\([A-Z]{3}\))?/i)?.[0] ||
    null
  );
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
  const messageField = extractField(text, 'Message', labels.filter((label) => label !== 'Message'));
  const message = extractMessageCode(messageField) || extractMessageCode(`${args.subject || ''}\n${text}`);
  const transferDate = extractField(text, 'Date', labels.filter((label) => label !== 'Date'));
  const bankReference = extractField(text, 'Reference Number', labels.filter((label) => label !== 'Reference Number'));
  const sentFrom = extractField(text, 'Sent From', labels.filter((label) => label !== 'Sent From'));
  const amountField = extractField(text, 'Amount', labels.filter((label) => label !== 'Amount'));
  const subjectAmount = extractFallbackAmount(text, args.subject);
  const amountValue = parseAmount(amountField || subjectAmount);
  const currency = (amountField || subjectAmount)?.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase() || 'CAD';

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

const tdCorporateDepositText = `Hi 1001455969 ONTARIO INC.,
Funds Deposited!
$25.64
Your funds have been automatically deposited into your account at TD Canada Trust.

		
TD Canada Trust

Account ending in 3837

Transfer Details

Message:

RVL-XNPH-GWEH

Date:

April 30, 2026

Reference Number:

C1A5VxXvCCKT

Sent From:

ROBERT CHANNA

Amount:

$25.64 (CAD)`;

const expected = {
  message: 'RVL-7F3K-92Q',
  transferDate: 'April 24, 2026',
  bankReference: 'CA6eTUZS',
  sentFrom: 'Azim Ismail Hamza',
  amountValue: 400,
  currency: 'CAD',
};

const tdCorporateExpected = {
  message: 'RVL-XNPH-GWEH',
  transferDate: 'April 30, 2026',
  bankReference: 'C1A5VxXvCCKT',
  sentFrom: 'ROBERT CHANNA',
  amountValue: 25.64,
  currency: 'CAD',
};

function check(name: string, parsed: ParsedInteracEmail, expectedValues = expected) {
  const failures = Object.entries(expectedValues).filter(([key, value]) => {
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
check('td-corporate-deposit-template', parseInteracEmail({
  subject: "Interac e-Transfer: You've received $25.64 and it has been automatically deposited.",
  text: tdCorporateDepositText,
}), tdCorporateExpected);
