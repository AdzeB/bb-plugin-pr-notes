export function createReadCache<T>(maxAgeMs: number, limit = 40) {
  const values = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, { token: object; promise: Promise<T> }>();
  const peek = (key: string) => values.get(key)?.value;
  const fresh = (key: string) => (values.get(key)?.expiresAt ?? 0) > Date.now();
  const set = (key: string, value: T) => {
    if (values.size >= limit && !values.has(key))
      values.delete(values.keys().next().value ?? "");
    values.set(key, { value, expiresAt: Date.now() + maxAgeMs });
  };
  const clear = () => {
    values.clear();
    pending.clear();
  };
  const remove = (prefix: string) => {
    for (const key of values.keys())
      if (key.startsWith(prefix)) values.delete(key);
    for (const key of pending.keys())
      if (key.startsWith(prefix)) pending.delete(key);
  };
  const read = async (
    key: string,
    loader: () => Promise<T>,
    force = false,
  ): Promise<T> => {
    const entry = values.get(key);
    if (!force && entry && fresh(key)) return entry.value;
    const existing = pending.get(key);
    if (existing) return existing.promise;
    const token = {};
    const promise = loader().then((value) => {
      if (pending.get(key)?.token === token) set(key, value);
      return value;
    });
    pending.set(key, { token, promise });
    try {
      return await promise;
    } finally {
      if (pending.get(key)?.token === token) pending.delete(key);
    }
  };
  return { peek, fresh, set, clear, remove, read };
}
