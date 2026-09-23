/**
 * 进程内 TTL 缓存：给重查询接口加短缓存，避免每次请求都扫大表。
 * 单进程使用（PM2 fork 模式），重启即清；带容量上限与惰性过期清理。
 */
type Entry = { at: number; value: unknown };

export class TtlCache {
  private map = new Map<string, Entry>();
  constructor(
    private ttlMs: number,
    private maxSize = 200,
  ) {}

  get<T>(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set(key: string, value: unknown) {
    if (this.map.size >= this.maxSize) {
      // 满了先清过期；还满就删最旧的一批
      const now = Date.now();
      for (const [k, v] of this.map) if (now - v.at > this.ttlMs) this.map.delete(k);
      if (this.map.size >= this.maxSize) {
        const oldest = [...this.map.entries()].sort((a, b) => a[1].at - b[1].at);
        for (const [k] of oldest.slice(0, Math.ceil(this.maxSize / 4))) this.map.delete(k);
      }
    }
    this.map.set(key, { at: Date.now(), value });
  }

  /** 命中则直接返回，否则执行 loader 并写入缓存 */
  async wrap<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    this.set(key, value);
    return value;
  }
}
