import { describe, expect, it } from "vitest";
import { isOfferExpired } from "@/domain/services/matching.logic";

describe("Offer expiry", () => {
  it("marks expired when current time passes expiresAt", () => {
    const expiresAt = new Date("2026-02-17T10:00:00Z");
    const current = new Date("2026-02-17T10:00:01Z");
    expect(isOfferExpired(expiresAt, current)).toBe(true);
  });

  it("keeps active offer before expiration", () => {
    const expiresAt = new Date("2026-02-17T10:00:00Z");
    const current = new Date("2026-02-17T09:59:59Z");
    expect(isOfferExpired(expiresAt, current)).toBe(false);
  });
});
