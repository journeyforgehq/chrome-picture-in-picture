/// <reference types="chrome" />
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "../ui-kit";
import { PopupView } from "./PopupView";
import { getDeviceId, createEntitlement, checkoutUrl, config } from "../billing";
import { PLANS } from "../billing/plans";
import { chromeSyncLocalStores, chromeLocalStore } from "../billing/chrome-storage";
import type { Tier, Plan, PaidStatus } from "../contract";

export function Popup() {
  const [tier, setTier] = useState<Tier>("free");
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [status, setStatus] = useState<PaidStatus | undefined>(undefined);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const id = await getDeviceId(chromeSyncLocalStores());
      if (cancelled) return;
      setDeviceId(id);

      const entitlement = createEntitlement({
        endpoint: config.BACKEND_BASE_URL,
        deviceId: id,
        store: chromeLocalStore(),
        fetchImpl: (url, init) => fetch(url, init),
        devPro: config.DEV_PRO,
      });

      // Seed from the last-known cached record so a returning Pro user doesn't
      // flash "Free"/locked before the network resolves.
      const cached = await entitlement.getCached();
      if (cancelled) return;
      if (cached) {
        setTier(cached.tier);
        setPlan(cached.plan);
        setStatus(cached.status);
      }

      const refreshedTier = await entitlement.refresh();
      if (cancelled) return;
      setTier(refreshedTier);
      const fresh = await entitlement.getCached();
      if (cancelled) return;
      setPlan(fresh?.plan);
      setStatus(fresh?.status);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <PopupView
        tier={tier}
        plan={plan}
        status={status}
        paywallOpen={paywallOpen}
        onOpenPaywall={() => setPaywallOpen(true)}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={handleCheckout}
        plans={PLANS}
      />
    </ThemeProvider>
  );
}
