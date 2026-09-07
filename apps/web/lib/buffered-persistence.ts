/** A bounded trailing write that can be synchronously flushed before navigation or send. */
export function createBufferedPersistence<T>(
  write: (value: T) => void,
  delay = 250,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const value = pending;
    pending = undefined;
    if (value) write(value.value);
  }
  return {
    schedule(value: T) {
      pending = { value };
      // A continuous typing session is saved at least once per delay.
      timer ??= setTimeout(flush, delay);
    },
    flush,
  };
}
