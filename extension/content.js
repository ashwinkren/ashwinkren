import { startWatcher } from "./watch.js";

if (!globalThis.__top40HandWatcher) {
  globalThis.__top40HandWatcher = true;
  startWatcher(document);
}
