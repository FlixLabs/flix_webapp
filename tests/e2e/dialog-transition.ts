import { expect, type Locator } from '@playwright/test';

export async function closeWithoutCollapsing(dialog: Locator, label = 'Close') {
  const result = await dialog.getByRole('button', { name: label, exact: true }).evaluate(async button => {
    const overlay = button.closest('.v-dialog')!;
    const content = overlay.querySelector<HTMLElement>('.v-overlay__content')!;
    const card = content.querySelector<HTMLElement>('.v-card')!;
    const before = { width: card.offsetWidth, height: card.offsetHeight, text: card.textContent };
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const frames = [];
    for (let i = 0; i < 60; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!content.isConnected || !content.className.includes('leave-active')) break;
      frames.push({ width: card.offsetWidth, height: card.offsetHeight, text: card.textContent });
    }
    return { before, frames };
  });
  expect(result.frames.length).toBeGreaterThan(0);
  for (const frame of result.frames) expect(frame).toEqual(result.before);
  await expect(dialog).not.toBeVisible();
}
