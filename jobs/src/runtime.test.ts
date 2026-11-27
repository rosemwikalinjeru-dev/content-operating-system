import { describe, expect, it } from "vitest";
import { serviceKeyProblem } from "./runtime";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".");

describe("serviceKeyProblem", () => {
  it("flags the publishable key pasted as the service key", () => {
    expect(serviceKeyProblem("sb_publishable_abc123")).toContain("publishable key");
  });

  it("flags a legacy anon JWT", () => {
    expect(serviceKeyProblem(jwt({ role: "anon", iss: "supabase" }))).toContain("anon key");
  });

  it("accepts secret keys and legacy service_role JWTs", () => {
    expect(serviceKeyProblem("sb_secret_abc123")).toBeNull();
    expect(serviceKeyProblem(jwt({ role: "service_role" }))).toBeNull();
  });

  it("does not guess about unreadable keys", () => {
    expect(serviceKeyProblem("something-else")).toBeNull();
  });
});
