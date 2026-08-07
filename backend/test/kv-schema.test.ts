import { describe, it, expect } from "vitest";
import { paidKey, emailKey, custKey, subKey, evtKey, restoreKey, todayUTC } from "../src/billing/kv-schema";

describe("kv key builders", () => {
  it("build the unified namespace keys", () => {
    expect(paidKey("device-abcdefgh")).toBe("paid:device-abcdefgh");
    expect(custKey("cus_1")).toBe("cust:cus_1");
    expect(subKey("sub_1")).toBe("sub:sub_1");
    expect(evtKey("evt_1")).toBe("evt:evt_1");
  });

  it("lowercases the email in emailKey", () => {
    expect(emailKey("Pro@Example.COM")).toBe("email:pro@example.com");
  });

  it("restoreKey embeds a UTC yyyy-mm-dd date bucket", () => {
    const day = todayUTC(Date.UTC(2026, 6, 2, 23, 30, 0)); // 2026-07-02
    expect(day).toBe("2026-07-02");
    expect(restoreKey("device-abcdefgh", day)).toBe("restore:device-abcdefgh:2026-07-02");
  });
});
