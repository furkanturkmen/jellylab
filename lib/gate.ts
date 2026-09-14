/**
 * Something callers wait on while it is under way, and walk straight past when
 * it is not.
 *
 * Built for sign-in: a call that needs a session should hold on for one that is
 * seconds from existing, rather than report that there is none. With nothing in
 * progress `wait` resolves at once, so the common case costs a microtask.
 */
export function createGate() {
  let pending: Promise<void> | null = null;

  return {
    /** Shut the gate. Returns the function that opens it again. */
    close(): () => void {
      let open!: () => void;
      const current = new Promise<void>(resolve => { open = resolve; });
      pending = current;
      return () => {
        // A later close owns the gate now, and reopening it is not this
        // caller's to do - its own waiters are released and move on to that one.
        if (pending === current) pending = null;
        open();
      };
    },

    /** Resolves once no close is outstanding. */
    async wait(): Promise<void> {
      // A loop, not one await: a second sign-in can start while the first is
      // finishing, and waking on the first would walk into the gap again.
      while (pending) await pending;
    },
  };
}
