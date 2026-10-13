import { expect, it } from 'vitest';
import { dialogHasOverflow } from '../src/composables/useDialogScroll';

function body(bottoms: number[], scrollHeight = 500, scrollTop = 0) {
  return { clientHeight: 200, scrollHeight, scrollTop, getBoundingClientRect: () => ({ top: 100 }),
    children: bottoms.map(bottom => ({ getBoundingClientRect: () => ({ bottom }) })),
  } as unknown as HTMLElement;
}
it('ignores overflow caused only by empty padding', () => {
  expect(dialogHasOverflow(body([280], 240))).toBe(false);
});
it('ignores empty or fully visible content', () => {
  expect(dialogHasOverflow(body([]))).toBe(false);
  expect(dialogHasOverflow(body([280], 200))).toBe(false);
});
it('detects real content below the viewport', () => {
  expect(dialogHasOverflow(body([280, 600]))).toBe(true);
});
it('still knows the body overflows after scrolling to the bottom', () => {
  expect(dialogHasOverflow(body([0, 300], 500, 300))).toBe(true);
});
