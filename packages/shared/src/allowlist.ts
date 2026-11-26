/**
 * Single-owner access control. OWNER_EMAILS is a comma-separated list.
 * Fails closed: an empty or missing list allows nobody.
 */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isAllowedEmail(email: string | null | undefined, allowlist: Set<string>): boolean {
  if (!email) return false;
  return allowlist.has(email.trim().toLowerCase());
}
