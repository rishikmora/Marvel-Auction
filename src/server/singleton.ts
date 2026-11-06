/**
 * Process-wide singletons.
 *
 * The custom server loads src/server/* directly through tsx, while Next.js bundles the
 * same modules again for its route handlers. Both bundles run inside one Node process but
 * have separate module registries, so a plain `export const store = new Store()` would
 * produce two independent instances — and the REST API would never see the live rooms or
 * the archives written by the socket layer.
 *
 * Anchoring on globalThis gives both bundles the same object. (This is the same pattern
 * used to share a database client across Next's dev-mode module reloads.)
 */
const KEY = Symbol.for('marvel-auction.singletons');

type Registry = { [KEY]?: Map<string, unknown> };

export function singleton<T>(name: string, factory: () => T): T {
  const registry = globalThis as Registry;
  const map = (registry[KEY] ??= new Map<string, unknown>());
  if (!map.has(name)) map.set(name, factory());
  return map.get(name) as T;
}
