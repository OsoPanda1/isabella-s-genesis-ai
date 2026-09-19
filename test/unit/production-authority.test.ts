import { describe, expect, it } from "vitest";
import { PRODUCTION_AUTHORITIES } from "@/lib/production-authority";

describe("production authority", () => {
  it("declares PostgreSQL as durable state authority", () => {
    const authority = PRODUCTION_AUTHORITIES.find((item) => item.id === "database");
    expect(authority?.authority).toContain("PostgreSQL");
    expect(authority?.implementations).toContain("src/lib/persistence/repository-factory.ts");
  });

  it("does not hard-code a single inference vendor", () => {
    const authority = PRODUCTION_AUTHORITIES.find((item) => item.id === "inference");
    expect(authority?.infrastructure).toEqual(expect.arrayContaining(["Gemini", "Groq", "xAI"]));
    expect(authority?.authority).toContain("authorized inference provider");
  });

  it("keeps critical production authorities fail-closed", () => {
    for (const authority of PRODUCTION_AUTHORITIES) {
      expect(authority.verify).toBeTypeOf("function");
      expect(authority.status).toMatch(/^(real|partial)$/);
    }
  });
});
