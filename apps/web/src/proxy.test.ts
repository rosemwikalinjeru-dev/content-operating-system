import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy auth-code fallback", () => {
  it("forwards a stray auth code on the home page to the callback", async () => {
    const res = await proxy(new NextRequest("https://contentos.example/?code=abc123&other=x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://contentos.example/auth/callback?code=abc123");
  });

  it("leaves the real callback alone", async () => {
    const res = await proxy(new NextRequest("https://contentos.example/auth/callback?code=abc123"));
    expect(res.headers.get("location")).toBeNull();
  });
});
