// Intermediate module: pulls ui-kit in, so the content entry below reaches
// it only TRANSITIVELY (content -> helper -> ui-kit).
import { KIT } from "./ui-kit";
export const helper = (): string => KIT;
