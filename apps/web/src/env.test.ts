import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SITE_URL: "https://contentos.vercel.app",
  OWNER_EMAILS: "Owner@Example.com",
};

describe("parseEnv", () => {
  it("accepts values pasted with surrounding whitespace", () => {
    const e = parseEnv({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: " https://abcd.supabase.co\n",
      SITE_URL: "https://contentos.vercel.app/ ",
    });
    expect(e.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
    expect(e.ownerAllowlist.has("owner@example.com")).toBe(true);
  });

  it("accepts the older NEXT_PUBLIC_SITE_URL name, preferring SITE_URL", () => {
    const { SITE_URL: _omit, ...rest } = valid;
    expect(parseEnv({ ...rest, NEXT_PUBLIC_SITE_URL: "https://old.example.com" }).SITE_URL).toBe("https://old.example.com");
    expect(parseEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "https://old.example.com" }).SITE_URL).toBe("https://contentos.vercel.app");
  });

  it("falls back to the legacy anon key name", () => {
    const { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: _omit, ...rest } = valid;
    expect(parseEnv({ ...rest, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("anon");
  });

  it("names every missing or invalid variable without echoing values", () => {
    try {
      parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "abcd.supabase.co", OWNER_EMAILS: "x" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).fields.sort()).toEqual([
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_SUPABASE_URL",
        "SITE_URL",
      ]);
      expect((err as Error).message).not.toContain("abcd");
    }
  });
});
