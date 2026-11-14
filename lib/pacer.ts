// Spaces actions out so they never start faster than a set rate. Email providers allow only a few
// requests a second (Resend's free plan is low), and a batch of invitations would otherwise go out
// as fast as the database lets it.
//
// Each call takes the next free slot straight away (no await in between), so even calls that
// arrive together are spread out, in the order they came. Pure: the clock and the sleep are
// passed in, so a test needs no real waiting.

export type Pacer = {
  /** Resolves when it is this caller's turn to start. */
  wait(): Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPacer(
  perSecond: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = realSleep,
): Pacer {
  const gap = Math.ceil(1000 / perSecond);
  // The earliest moment the next action may start.
  let next = 0;
  return {
    wait() {
      const t = now();
      const start = Math.max(t, next);
      next = start + gap;
      return start > t ? sleep(start - t) : Promise.resolve();
    },
  };
}
