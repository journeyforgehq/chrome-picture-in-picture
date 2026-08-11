/// <reference types="chrome" />
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "../ui-kit";
import { OptionsView } from "./OptionsView";
import { getDeviceId, createEntitlement, checkoutUrl, config } from "../billing";
import { PLANS } from "../billing/plans";
import type { RestoreResult } from "../billing";
import { chromeSyncLocalStores, chromeLocalStore } from "../billing/chrome-storage";
import { getSettings, setSettings, DEFAULT_SETTINGS, type PipSettings } from "../pip/state";
import type { Tier, Plan, PaidStatus } from "../contract";

/** The optional grant that "Support embedded players" is a front-end for.
 *  Declared in manifest.json under optional_host_permissions — NOT permissions. */
const ALL_URLS: chrome.permissions.Permissions = { origins: ["<all_urls>"] };

/** Chrome's own shortcut editor. Only reachable via chrome.tabs.create — see
 *  handleOpenShortcuts. */
const SHORTCUTS_URL = "chrome://extensions/shortcuts";

/** Public repository, linked from the footer. Deliberately not a config token:
 *  it is a property of this codebase, not of the deployment environment, and
 *  billing/config.ts is CORE-vendored (edits there are recorded drift).
 *
 *  This was `__ORG__` until 2026-08-10 — the project's deliberately UGLY
 *  placeholder convention, because a plausible-looking invented org would
 *  survive review by looking finished and then 404 for every real user who
 *  clicked it. The org is now known, so the token is gone and the submission
 *  gate in test/options/options.test.tsx that guarded it is UN-SKIPPED: it
 *  reads the BUILT bundle, so it also catches the token being reintroduced
 *  anywhere else in the options entry. */
const SOURCE_URL = "https://github.com/journeyforgehq/picture-in-picture";

export function Options() {
  const [tier, setTier] = useState<Tier>("free");
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [status, setStatus] = useState<PaidStatus | undefined>(undefined);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [entitlement, setEntitlement] = useState<ReturnType<typeof createEntitlement> | null>(null);
  const [settings, setSettingsState] = useState<PipSettings>(DEFAULT_SETTINGS);
  const [siteAccessDenied, setSiteAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stored = await getSettings();
      if (cancelled) return;
      setSettingsState(stored);

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

      // Seed from the last-known cached record so a returning Pro user doesn't
      // flash "Free"/locked before the network resolves.
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

  /* ==========================================================================
   * THIS FUNCTION MUST STAY SYNCHRONOUS DOWN TO THE PERMISSIONS CALL.
   *
   * chrome.permissions.request() rejects with
   *   "This function must be called during a user gesture"
   * unless it is reached from the click's own synchronous call stack. One
   * `await` anywhere above it — reading settings first, "just" checking
   * permissions.contains() — is enough to break it, and the failure surfaces
   * only in a real browser: Chrome's confirmation bubble is out-of-process and
   * unreachable by Playwright, so the promise simply never settles under
   * automation and this path can never be end-to-end tested. It is covered by
   * a synchronous-dispatch unit test in test/options/options.test.tsx and by
   * manual QA — not by e2e.
   * ========================================================================*/
  function handleSettingChange<K extends keyof PipSettings>(key: K, value: PipSettings[K]) {
    if (key === "embeddedPlayers") {
      if (value) {
        chrome.permissions.request(ALL_URLS).then((granted) => {
          if (!granted) {
            // Not an error state: page videos still work. Say so, leave it off.
            setSiteAccessDenied(true);
            return;
          }
          setSiteAccessDenied(false);
          void persist({ embeddedPlayers: true });
        });
        return;
      }
      setSiteAccessDenied(false);
      chrome.permissions.remove(ALL_URLS).then(() => {
        void persist({ embeddedPlayers: false });
      });
      return;
    }

    void persist({ [key]: value } as Pick<PipSettings, K>);
  }

  async function persist(patch: Partial<PipSettings>) {
    const next = await setSettings(patch);
    setSettingsState(next);
  }

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

  /* Chrome blocks renderer-initiated navigation to chrome:// URLs, and an
   * extension page is NOT exempt: <a href="chrome://extensions/shortcuts">
   * silently does nothing when clicked. chrome.tabs.create() is the supported
   * route and needs no "tabs" permission — that one gates tab querying and
   * reading tab URLs, not creating a tab. Mirrors handleCheckout's fallback so
   * the gallery and any non-extension host degrade instead of throwing. */
  function handleOpenShortcuts() {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: SHORTCUTS_URL });
    } else {
      window.open(SHORTCUTS_URL, "_blank");
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
        settings={settings}
        onSettingChange={handleSettingChange}
        onOpenShortcuts={handleOpenShortcuts}
        restoreResult={restoreResult}
        restoring={restoring}
        onRestore={handleRestore}
        onOpenPaywall={() => setPaywallOpen(true)}
        paywallOpen={paywallOpen}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={handleCheckout}
        plans={PLANS}
        sourceUrl={SOURCE_URL}
        siteAccessDenied={siteAccessDenied}
      />
    </ThemeProvider>
  );
}
