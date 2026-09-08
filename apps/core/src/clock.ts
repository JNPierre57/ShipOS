export interface Clock {
  now(): number;
  later(ms: number, callback: () => void): () => void;
}
export class RealClock implements Clock {
  now() {
    return Date.now();
  }
  later(ms: number, fn: () => void) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  }
}
export class VirtualClock implements Clock {
  private time: number;
  private next = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  constructor(start = 0) {
    this.time = start;
  }
  now() {
    return this.time;
  }
  later(ms: number, fn: () => void) {
    const id = ++this.next;
    this.tasks.set(id, { at: this.time + ms, fn });
    return () => {
      this.tasks.delete(id);
    };
  }
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const entry = [...this.tasks.entries()]
        .filter(([, v]) => v.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!entry) break;
      this.time = entry[1].at;
      this.tasks.delete(entry[0]);
      entry[1].fn();
    }
    this.time = target;
  }
  get pending() {
    return this.tasks.size;
  }
}
export class ReplayClock extends VirtualClock {}
