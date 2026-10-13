import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export function dialogHasOverflow(el: HTMLElement) {
  const bottom = el.getBoundingClientRect().top + el.clientHeight;
  const contentBottom = Math.max(...Array.from(el.children).map(child => child.getBoundingClientRect().bottom)) + el.scrollTop;
  // Padding alone must not create a scroll hint or a scrollable empty tail.
  return el.scrollHeight - el.clientHeight > 1 && contentBottom - bottom > 1;
}

export function useDialogScroll(open: () => boolean, context: () => unknown) {
  const element = ref<HTMLElement | null>(null);
  const canScroll = ref(false);
  const showScrollHint = ref(false);
  let frame = 0;
  let mutation: MutationObserver | undefined;
  let resize: ResizeObserver | undefined;
  let disposed = false;

  function update() {
    const el = element.value;
    if (!el || !open()) return;
    canScroll.value = dialogHasOverflow(el);
    showScrollHint.value = canScroll.value && el.scrollTop <= 0;
    if (!canScroll.value && el.scrollTop) el.scrollTop = 0;
  }
  function schedule() {
    if (disposed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }
  function observe() {
    mutation?.disconnect(); resize?.disconnect();
    if (!element.value) return;
    mutation?.observe(element.value, { childList: true, subtree: true, characterData: true });
    resize?.observe(element.value);
    for (const child of element.value.children) resize?.observe(child);
  }
  function refresh() { void nextTick(() => { if (!disposed) { observe(); schedule(); } }); }
  function reset() {
    if (element.value) element.value.scrollTop = 0;
    refresh();
  }
  function setElement(value: unknown) {
    const candidate = value instanceof HTMLElement ? value : (value as { $el?: unknown } | null)?.$el;
    element.value = candidate instanceof HTMLElement ? candidate : null;
  }
  watch(element, refresh, { flush: 'post' });
  watch(open, value => { if (value) void nextTick(reset); });
  watch(context, () => { if (open()) void nextTick(reset); });
  onMounted(() => {
    mutation = new MutationObserver(() => { observe(); schedule(); });
    resize = new ResizeObserver(schedule);
    window.addEventListener('resize', schedule);
    refresh();
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelAnimationFrame(frame); mutation?.disconnect(); resize?.disconnect();
    window.removeEventListener('resize', schedule);
  });
  return { element, canScroll, showScrollHint, setElement, update, refresh };
}
