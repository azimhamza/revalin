export function normalizeShieldClimbAddressIn(addressIn: string) {
  const trimmed = addressIn.trim();

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}
