/**
 * Shared "is this stream still supposed to be running" guard + start/stop
 * wrapper, used by every `stream-*` feature (traffic/memory/connections/
 * logs) instead of each reimplementing it slightly differently.
 *
 * Before this existed, only `useLogsStream` guarded against a data event
 * arriving just after `stop` was called (its module-level `isStreaming`
 * flag) — the other three could still push a frame into already-cleared
 * state if one was in flight when `stop(true)` ran. `start()` is also
 * idempotent here (a second call while already active is a no-op), which
 * matters because more than one caller now legitimately asks a stream to
 * start: the global daemon/visibility listeners that actually own its
 * lifecycle, *and* a page's own mount effect as a defensive catch-up (see
 * `Logs`/`Connections` pages) — without idempotency the latter would just
 * re-invoke the backend command harmlessly, but with it there's no
 * ambiguity that only the first call actually does anything.
 */
export function createStreamGuard(commands: {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}) {
  let active = false;

  return {
    /** Whether a just-arrived data event should actually be applied. */
    isActive: () => active,

    async start() {
      if (active) return;
      active = true;
      await commands.start();
    },

    /** Always calls the backend stop command and, if given, `onStopped`
     * (typically "clear the store") — unconditionally, same as before this
     * guard existed, so `stop(true)` still works as an explicit "reset to
     * blank state" even when called from somewhere that never itself
     * called `start()` (e.g. hiding the window while a stream failed to
     * start in the first place). Only `isActive()` — what gates whether an
     * in-flight data event still gets applied — is affected by `start`/
     * `stop` pairing. */
    async stop(onStopped?: () => void) {
      active = false;
      await commands.stop();
      onStopped?.();
    },

    /** Force `isActive()` to `false` without calling the stop command —
     * for when the *backend* reports the stream is no longer usable
     * (logs' "disabled"/"error" status) rather than us asking it to stop.
     * Calling the stop command in that case would be redundant at best. */
    forceInactive() {
      active = false;
    },
  };
}
