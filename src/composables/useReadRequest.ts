import { getCurrentScope, onScopeDispose, reactive, watch } from 'vue';

export interface ReadState {
  loading: boolean;
  error: string;
  hasData: boolean;
  lastSuccessAt: number | null;
}

export function useReadRequest(context: () => unknown, timeoutMs = 15000) {
  const state = reactive<ReadState>({ loading: false, error: '', hasData: false, lastSuccessAt: null });
  let generation = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let lastContext = context();
  function sameContext(value: unknown, previous: unknown) {
    return Object.is(value, previous) || Array.isArray(value) && Array.isArray(previous)
      && value.length === previous.length && value.every((item, index) => Object.is(item, previous[index]));
  }
  function synchronizeContext(value = context()) {
    if (sameContext(value, lastContext)) return;
    lastContext = value;
    reset();
  }

  function cancel() {
    generation++;
    clearTimeout(timer);
    controller?.abort();
    state.loading = false;
  }
  function reset() {
    cancel();
    state.error = '';
    state.hasData = false;
    state.lastSuccessAt = null;
  }
  const stop = watch(context, value => synchronizeContext(value), { flush: 'sync' });
  if (getCurrentScope()) onScopeDispose(() => { disposed = true; stop(); reset(); });

  function begin() {
    // A caller's synchronous watcher may run before our context watcher.
    synchronizeContext();
    cancel();
    const current = generation;
    const abort = new AbortController();
    controller = abort;
    const requestContext = lastContext;
    const isCurrent = () => !disposed && generation === current && !abort.signal.aborted && sameContext(context(), requestContext);
    if (disposed) abort.abort();
    else {
      state.loading = true;
      timer = setTimeout(() => {
        if (!isCurrent()) return;
        cancel();
        state.error = 'Request timed out. Check the service and retry.';
      }, timeoutMs);
    }
    return {
      signal: abort.signal,
      isCurrent,
      success() {
        if (!isCurrent()) return;
        state.hasData = true;
        state.lastSuccessAt = Date.now();
        state.error = '';
      },
      fail(cause: unknown) {
        if (!isCurrent()) return;
        state.error = cause instanceof TypeError ? 'Unable to reach the service. Check the connection and retry.'
          : cause instanceof Error ? cause.message : 'Unable to load data. Check the service and retry.';
      },
      finish() {
        if (!isCurrent()) return;
        clearTimeout(timer);
        state.loading = false;
      },
    };
  }
  return { state, begin, reset, cancel };
}
