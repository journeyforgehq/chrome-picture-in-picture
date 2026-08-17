import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  signStripeHeader,
  checkoutCompleted,
  subscriptionDeleted,
  subscriptionUpdated,
  invoicePaymentFailed,
  invoicePaid,
  chargeRefunded,
} from "../../e2e/harness/webhook";

describe("signStripeHeader", () => {
  it("produces `t=,v1=` with HMAC-SHA256 over `${t}.${payload}`", () => {
    const payload = JSON.stringify({ hello: "world" });
    const header = signStripeHeader(payload, "whsec_test", 1_700_000_000);
    const expected = createHmac("sha256", "whsec_test").update(`1700000000.${payload}`).digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });
});

describe("event builders", () => {
  it("checkoutCompleted carries client_reference_id + subscription mode", () => {
    const ev = checkoutCompleted({ deviceId: "dev-123", customerId: "cus_1", subId: "sub_1" });
    expect(ev.type).toBe("checkout.session.completed");
    expect(ev.data.object.client_reference_id).toBe("dev-123");
    expect(ev.data.object.mode).toBe("subscription");
    expect(ev.data.object.subscription).toBe("sub_1");
    expect(ev.data.object.customer).toBe("cus_1");
    expect(typeof ev.id).toBe("string");
  });

  it("subscriptionDeleted carries the customer + canceled status", () => {
    const ev = subscriptionDeleted({ customerId: "cus_1", subId: "sub_1" });
    expect(ev.type).toBe("customer.subscription.deleted");
    expect(ev.data.object.customer).toBe("cus_1");
    expect(ev.data.object.status).toBe("canceled");
  });

  it("gives each built event a unique id", () => {
    const a = checkoutCompleted({ deviceId: "d", customerId: "c", subId: "s" });
    const b = checkoutCompleted({ deviceId: "d", customerId: "c", subId: "s" });
    expect(a.id).not.toBe(b.id);
  });

  it("subscriptionUpdated carries customer, status + current_period_end", () => {
    const ev = subscriptionUpdated({ customerId: "cus_1", periodEnd: 1_800_000_000, status: "active" });
    expect(ev.type).toBe("customer.subscription.updated");
    expect(ev.data.object.customer).toBe("cus_1");
    expect(ev.data.object.status).toBe("active");
    expect(ev.data.object.current_period_end).toBe(1_800_000_000);
  });

  it("invoicePaymentFailed carries the customer", () => {
    const ev = invoicePaymentFailed({ customerId: "cus_1" });
    expect(ev.type).toBe("invoice.payment_failed");
    expect(ev.data.object.customer).toBe("cus_1");
  });

  it("invoicePaid carries the customer + lines.data[0].period.end", () => {
    const ev = invoicePaid({ customerId: "cus_1", periodEnd: 1_800_000_000 });
    expect(ev.type).toBe("invoice.paid");
    expect(ev.data.object.customer).toBe("cus_1");
    const lines = ev.data.object.lines as { data: Array<{ period: { end: number } }> };
    expect(lines.data[0].period.end).toBe(1_800_000_000);
  });

  it("chargeRefunded carries the customer", () => {
    const ev = chargeRefunded({ customerId: "cus_1" });
    expect(ev.type).toBe("charge.refunded");
    expect(ev.data.object.customer).toBe("cus_1");
    expect(ev.data.object.refunded).toBe(true);
  });

  it("accepts an explicit eventId override so the same id can be re-sent", () => {
    const a = subscriptionUpdated({ customerId: "cus_1", periodEnd: 1, status: "active", eventId: "evt_fixed" });
    const b = subscriptionUpdated({ customerId: "cus_1", periodEnd: 2, status: "active", eventId: "evt_fixed" });
    expect(a.id).toBe("evt_fixed");
    expect(b.id).toBe("evt_fixed");
  });

  it("each new builder produces a validly signed header", () => {
    for (const ev of [
      subscriptionUpdated({ customerId: "c", periodEnd: 1, status: "active" }),
      invoicePaymentFailed({ customerId: "c" }),
      invoicePaid({ customerId: "c", periodEnd: 1 }),
      chargeRefunded({ customerId: "c" }),
    ]) {
      const payload = JSON.stringify(ev);
      const header = signStripeHeader(payload, "whsec_test", 1_700_000_000);
      const expected = createHmac("sha256", "whsec_test").update(`1700000000.${payload}`).digest("hex");
      expect(header).toBe(`t=1700000000,v1=${expected}`);
    }
  });
});
