'use client';

type LinkAffiliateResult = {
  linked: boolean;
  affiliateCode?: string;
};

const DEFAULT_LINK_AFFILIATE_TIMEOUT_MS = 1500;

export async function linkAffiliateWithTimeout(
  timeoutMs = DEFAULT_LINK_AFFILIATE_TIMEOUT_MS,
): Promise<LinkAffiliateResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/api/auth/link-affiliate', {
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { linked: false };
    }

    const data = (await response.json()) as LinkAffiliateResult;
    return {
      linked: Boolean(data.linked),
      affiliateCode: data.affiliateCode,
    };
  } catch {
    return { linked: false };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
