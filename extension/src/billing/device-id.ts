// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
// Async storage-area adapter matching the subset of chrome.storage.{sync,local}
// we use. Tests inject in-memory stubs with this same shape; the real
// background/popup code wraps chrome.storage.sync/local's callback API to
// match it (see background.ts for the wrapper).
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(obj: Record<string, unknown>): Promise<void>;
}

export interface DeviceIdStores {
  sync: StorageArea;
  local: StorageArea;
}

const KEY = "device_id";

function generateId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (should not occur
  // in MV3 service workers, but keeps this function total).
  return "dev-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * Get-or-create the per-install device id.
 * Read order: storage.sync -> storage.local (migration) -> generate.
 * A freshly generated or migrated id is persisted to BOTH areas so sync
 * and local converge and future reads hit the fast sync path.
 */
export async function getDeviceId(stores: DeviceIdStores): Promise<string> {
  const { sync, local } = stores;

  const fromSync = (await sync.get(KEY))[KEY] as string | undefined;
  if (fromSync) {
    // Converge DOWNWARD too. This path used to return here, which made the
    // contract above false in one direction: an id present in sync but absent
    // from local stayed absent forever.
    //
    // Two ways to land in that state. A user signs into Chrome on a new machine
    // and sync delivers the id before anything writes local. Or an init is
    // interrupted between the two writes below — the window is small (sync.set
    // measures 2-27ms here) but it is real, and it is what made the e2e billing
    // specs fail roughly one run in three with "device_id not written".
    //
    // It matters beyond the tests because THE LOCAL COPY IS THE DURABLE ONE.
    // chrome.storage.sync can be switched off by the user or by enterprise
    // policy, and if it is, a sync-only id disappears: both reads miss, a fresh
    // id is generated, and because entitlements are keyed by device id the
    // customer silently loses Pro until they restore by email.
    //
    // Best-effort: a failure here must not deny the caller an id it already
    // has. Worst case we retry the write on the next call.
    if (!(await local.get(KEY))[KEY]) {
      try {
        await local.set({ [KEY]: fromSync });
      } catch {
        /* keep the id; retry next call */
      }
    }
    return fromSync;
  }

  const fromLocal = (await local.get(KEY))[KEY] as string | undefined;
  if (fromLocal) {
    await sync.set({ [KEY]: fromLocal });
    return fromLocal;
  }

  const id = generateId();
  await sync.set({ [KEY]: id });
  await local.set({ [KEY]: id });
  return id;
}
