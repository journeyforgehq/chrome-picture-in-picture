/// <reference types="chrome" />
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "../ui-kit";
import { OptionsView } from "./OptionsView";
import { getDeviceId, createEntitlement, checkoutUrl, config } from "../billing";
import { PLANS } from "../billing/plans";
import type { RestoreResult } from "../billing";
import { chromeSyncLocalStores, chromeLocalStore } from "../billing/chrome-storage";
import type { Tier, Plan, PaidStatus } from "../contract";

export function Options() {
  const [tier, setTier] = useState<Tier>("free");
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [status, setStatus] = useState<PaidStatus | undefined>(undefined);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [entitlement, setEntitlement] = useState<ReturnType<typeof createEntitlement> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const id = await getDeviceId(chromeSyncLocalStores());
      if (cancelled) return;
      setDeviceId(id);

      const client = createEntitlement({
        endpoint: config.BACKEND_BASE_URL,
        deviceId: id,
        store: chromeLocalStore(),
        fetchImpl: (url, init) => fetch(url, init),
        devPro: config.DEV_PRO,
      });
      setEntitlement(client);

      const cached = await client.getCached();
      if (cancelled) return;
      if (cached) {
        setTier(cached.tier);
        setPlan(cached.plan);
        setStatus(cached.status);
      }

      const refreshedTier = await client.refresh();
      if (cancelled) return;
      setTier(refreshedTier);
      const fresh = await client.getCached();
      if (cancelled) return;
      setPlan(fresh?.plan);
      setStatus(fresh?.status);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRestore(email: string) {
    if (!entitlement) return;
    setRestoring(true);
    try {
      const result = await entitlement.restore(email);
      setRestoreResult(result);
      setTier(result.tier);
    } finally {
      setRestoring(false);
    }
  }

  function handleCheckout(planId: Plan) {
    const url = checkoutUrl(planId, deviceId);
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  }

  return (
    <ThemeProvider accent={config.ACCENT}>
      <OptionsView
        tier={tier}
        plan={plan}
        status={status}
        restoreResult={restoreResult}
        restoring={restoring}
        onRestore={handleRestore}
        onOpenPaywall={() => setPaywallOpen(true)}
        paywallOpen={paywallOpen}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={handleCheckout}
        plans={PLANS}
      />
    </ThemeProvider>
  );
}
