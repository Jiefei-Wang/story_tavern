/**
 * Concurrency limiter that limits active asynchronous tasks per key (e.g. backendId).
 */
export class ConcurrencyLimiter {
  private activeCount: Map<string, number> = new Map();
  private queues: Map<string, Array<() => void>> = new Map();

  /**
   * Executes an async task while respecting the concurrency limit for the specified key.
   */
  async run<T>(
    key: string,
    limit: number,
    task: () => Promise<T>
  ): Promise<T> {
    const effectiveLimit = Math.max(1, limit);

    // Wait until concurrency is below limit
    await this.acquire(key, effectiveLimit);
    try {
      return await task();
    } finally {
      this.release(key);
    }
  }

  private acquire(key: string, limit: number): Promise<void> {
    const current = this.activeCount.get(key) || 0;
    if (current < limit) {
      this.activeCount.set(key, current + 1);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let queue = this.queues.get(key);
      if (!queue) {
        queue = [];
        this.queues.set(key, queue);
      }
      queue.push(resolve);
    });
  }

  private release(key: string): void {
    const current = this.activeCount.get(key) || 0;
    const queue = this.queues.get(key);

    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      // Do not decrement active count because the next task immediately occupies the slot
      next();
    } else {
      this.activeCount.set(key, Math.max(0, current - 1));
    }
  }
}

export const globalConcurrencyLimiter = new ConcurrencyLimiter();
