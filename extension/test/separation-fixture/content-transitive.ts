// TEST-ONLY poisoned content entry. It imports `helper`, which imports the
// fake ui-kit — so ui-kit is a TRANSITIVE module of this content chunk. The
// guard must still catch it. Not part of the real extension bundle.
import { helper } from "./helper";
export const run = (): string => helper();
