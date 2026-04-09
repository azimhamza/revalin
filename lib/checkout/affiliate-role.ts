export function shouldPromoteToAffiliateRole(
  role: string | null | undefined,
) {
  const normalizedRole = role?.trim().toLowerCase() ?? "";

  return normalizedRole === "" || normalizedRole === "customer";
}
