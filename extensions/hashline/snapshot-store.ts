// hl_read 快照的 LRU 存储：超过上限淘汰最久未使用项，防长会话编辑大量文件时内存无界增长。
export interface Snapshot {
  content: string;
  tag: string;
}

export class SnapshotStore {
  private readonly map = new Map<string, Snapshot>();

  constructor(private readonly max = 50) {}

  get(path: string): Snapshot | undefined {
    const v = this.map.get(path);
    if (v) {
      // 访问即刷新为最近使用（删后重插到尾部）。
      this.map.delete(path);
      this.map.set(path, v);
    }
    return v;
  }

  set(path: string, snap: Snapshot): void {
    if (this.map.has(path)) this.map.delete(path);
    this.map.set(path, snap);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
