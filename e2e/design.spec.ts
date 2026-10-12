import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';

/**
 * NeoPOP design rules (plan §16), enforced on real pages in both themes: sharp corners, no soft
 * shadows, solid 3D edges that plunk on press, NeoPOP typography, reduced motion respected.
 * Screenshots land in test-results/design/ for a human look.
 */
test.describe.configure({ timeout: 90_000 });

type Theme = 'dark' | 'light';
const VIDEO = 'https://youtu.be/dQw4w9WgXcQ';

const themedPage = async (browser: Browser, theme: Theme, viewport = { width: 1280, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((value) => {
    window.localStorage.setItem('watchparty-theme', value);
  }, theme);
  return context.newPage();
};

/** Elements (outside the YouTube iframe) with rounded corners, except the allowed status dots. */
const roundedElements = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => !el.closest('iframe') && !el.hasAttribute('data-neo-round'))
      .filter((el) => {
        const r = getComputedStyle(el);
        return [
          r.borderTopLeftRadius,
          r.borderTopRightRadius,
          r.borderBottomLeftRadius,
          r.borderBottomRightRadius,
        ].some((v) => v !== '0px' && v !== '');
      })
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 80)}`),
  );

/** Elements with a blurred (soft) box-shadow; NeoPOP depth comes only from solid edges. */
const softShadows = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        const shadow = getComputedStyle(el).boxShadow;
        if (shadow === 'none' || shadow === '') {
          return false;
        }
        // Each shadow: "<color> <x> <y> <blur> <spread>"; a non-zero blur is a soft shadow.
        return shadow.split(/,(?![^(]*\))/).some((part) => {
          const lengths = part.match(/-?\d+(\.\d+)?px/g) ?? [];
          return lengths.length >= 3 && Number.parseFloat(lengths[2] ?? '0') > 0;
        });
      })
      .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 80)}`),
  );

const expectNeoPop = async (page: Page): Promise<void> => {
  expect(await roundedElements(page)).toEqual([]);
  expect(await softShadows(page)).toEqual([]);
};

/** The computed size of an element's 3D edge faces (::after = right face, ::before = bottom face). */
const edges = (locator: Locator) =>
  locator.evaluate((el) => {
    const right = getComputedStyle(el, '::after');
    const bottom = getComputedStyle(el, '::before');
    // A pseudo-element without content does not exist (flat element); display:none hides it.
    const absent = (s: CSSStyleDeclaration): boolean =>
      s.display === 'none' || s.content === 'none' || s.content === 'normal';
    return {
      right: absent(right) ? 'none' : right.width,
      bottom: absent(bottom) ? 'none' : bottom.height,
      rightColor: right.backgroundColor,
      bottomColor: bottom.backgroundColor,
    };
  });

const createRoom = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Hana');
  await page.getByLabel(/First video/).fill(VIDEO);
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByTestId('participant-Hana')).toBeVisible({ timeout: 20_000 });
};

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test('landing page follows NeoPOP: sharp, no soft shadows, NeoPOP type', async ({ browser }) => {
      const page = await themedPage(browser, theme);
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();
      await expectNeoPop(page);

      const heading = page.getByRole('heading', { level: 1 });
      expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Fraunces');
      expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
        'Manrope',
      );
      const cta = page.getByRole('button', { name: 'Create room' });
      expect(await cta.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
      await page.screenshot({ path: `test-results/design/landing-${theme}.png`, fullPage: true });
    });

    test('room, sidebar tabs, menus, dialogs and toasts follow NeoPOP', async ({ browser }) => {
      const host = await themedPage(browser, theme);
      await createRoom(host);
      const guest = await themedPage(browser, theme);
      await guest.goto(host.url());
      await guest.getByLabel('Your name').fill('Pat');
      await guest.getByRole('button', { name: 'Join the party' }).click();
      await expect(guest.getByTestId('participant-Pat')).toBeVisible({ timeout: 20_000 });
      await host.getByRole('button', { name: 'Play', exact: true }).click();
      await expectNeoPop(host);

      for (const tab of [/Chat/, /Queue/, /People/]) {
        await host.getByRole('tab', { name: tab }).click();
        await expectNeoPop(host);
      }
      // The active tab is the filled inverse block.
      const active = host.getByRole('tab', { name: /People/ });
      const canvas = await host.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
      // Polled: the colours transition when the tab becomes active.
      await expect.poll(() => active.evaluate((el) => getComputedStyle(el).color)).toBe(canvas);
      expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(canvas);

      // Request toast (with Approve/Reject), then the requests tab.
      await guest.getByRole('button', { name: 'Ask to pause' }).click();
      await expect(
        host.locator('[data-sonner-toast]').filter({ hasText: 'Pat wants to pause' }),
      ).toBeVisible();
      await expectNeoPop(host);
      await host.screenshot({ path: `test-results/design/room-${theme}.png` });
      await host.getByRole('tab', { name: /Requests/ }).click();
      await expectNeoPop(host);

      // Menus and dialogs.
      await host.getByRole('button', { name: /^Playback speed/ }).click();
      await expect(host.getByRole('menu')).toBeVisible();
      await expectNeoPop(host);
      await host.keyboard.press('Escape');
      await host.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      const dialog = host.getByRole('dialog', { name: 'Keyboard shortcuts' });
      await expect(dialog).toBeVisible();
      await expectNeoPop(host);
      // Dialogs carry 8px NeoPOP edges, not clipped by scrolling.
      expect(await edges(dialog)).toMatchObject({ right: '8px', bottom: '8px' });
      await host.screenshot({ path: `test-results/design/dialog-${theme}.png` });
      await host.keyboard.press('Escape');

      // The room code is set in the mono face.
      const code = host.getByRole('button', { name: /^[A-Z0-9]{6}$/ });
      expect(await code.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('JetBrains Mono');
    });

    test('every other surface: guest invite, sign-in, account and member menus, confirm, queue, fullscreen', async ({
      browser,
    }) => {
      const host = await themedPage(browser, theme);
      await createRoom(host);
      const guest = await themedPage(browser, theme, { width: 390, height: 844 });
      await guest.goto(host.url());
      await expect(guest.getByLabel('Your name')).toBeVisible();
      await expectNeoPop(guest);
      await guest.screenshot({ path: `test-results/design/guest-${theme}.png` });
      await guest.getByLabel('Your name').fill('Pat');
      await guest.getByRole('button', { name: 'Join the party' }).click();
      await expect(guest.getByTestId('participant-Pat')).toBeVisible({ timeout: 20_000 });

      // Queue with an item.
      await host.getByRole('tab', { name: /Queue/ }).click();
      await host.getByLabel('Link to queue').fill('https://youtu.be/jNQXAC9IVRw');
      await host.getByRole('button', { name: 'Add to queue' }).click();
      await expect(host.getByRole('list', { name: 'Queue' }).getByRole('listitem')).toHaveCount(1);
      await expectNeoPop(host);

      // Member actions menu and the confirm (alert) dialog.
      await host.getByRole('tab', { name: /People/ }).click();
      await host.getByRole('button', { name: 'Actions for Pat' }).click();
      await expect(host.getByRole('menu')).toBeVisible();
      await expectNeoPop(host);
      await host.getByRole('menuitem', { name: 'Remove from room' }).click();
      const confirm = host.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await expectNeoPop(host);
      expect(await edges(confirm)).toMatchObject({ right: '8px', bottom: '8px' });
      await host.screenshot({ path: `test-results/design/confirm-${theme}.png` });
      await host.getByRole('button', { name: 'Cancel' }).click();

      // Account menu.
      await host.getByRole('button', { name: 'Account menu' }).click();
      await expect(host.getByRole('menu')).toBeVisible();
      await expectNeoPop(host);
      await host.keyboard.press('Escape');

      // Fullscreen controls (solid band, no gradient).
      await host.getByRole('button', { name: 'Full screen', exact: true }).click();
      await expect(host.getByTestId('player-frame')).toHaveAttribute('data-immersive', 'true');
      await expectNeoPop(host);
      const band = host.getByTestId('control-bar');
      expect(await band.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
      await host.screenshot({ path: `test-results/design/fullscreen-${theme}.png` });
      await host.keyboard.press('f');

      // Sign-in dialog from the landing page.
      const visitor = await themedPage(browser, theme);
      await visitor.goto('/');
      await visitor.getByRole('button', { name: /Sign in/i }).click();
      await expect(visitor.getByRole('dialog')).toBeVisible();
      await expectNeoPop(visitor);
      await visitor.screenshot({ path: `test-results/design/sign-in-${theme}.png` });
    });

    test('elevated buttons have solid edges and plunk into them on press; flat ones do not', async ({
      browser,
    }) => {
      const page = await themedPage(browser, theme);
      await page.goto('/');
      const create = page.getByRole('button', { name: 'Create room' });
      const join = page.getByRole('button', { name: 'Join room' });
      const signIn = page.getByRole('button', { name: /Sign in/i });

      const createEdges = await edges(create);
      expect(createEdges).toMatchObject({ right: '3px', bottom: '3px' });
      // Two different shades: NeoPOP's right face is darker than the bottom face.
      expect(createEdges.rightColor).not.toBe(createEdges.bottomColor);
      expect(await edges(join)).toMatchObject({ right: '3px', bottom: '3px' });
      expect(await edges(signIn)).toMatchObject({ right: 'none' });

      // Press and hold: the face moves into its edges, which collapse; release restores it.
      await create.scrollIntoViewIfNeeded();
      const box = await create.boundingBox();
      if (box === null) {
        throw new Error('no button');
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect
        .poll(() => create.evaluate((el) => getComputedStyle(el).transform))
        .toBe('matrix(1, 0, 0, 1, 3, 3)');
      await expect.poll(async () => (await edges(create)).right).toBe('0px');
      await page.mouse.up();
      await expect.poll(() => create.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
      await expect.poll(async () => (await edges(create)).right).toBe('3px');
    });

    test('cards have 6px edges; disabled buttons are flat', async ({ browser }) => {
      const host = await themedPage(browser, theme);
      await createRoom(host);
      const sidebar = host.getByRole('complementary', { name: 'Room sidebar' }).locator('[data-slot=card]');
      expect(await edges(sidebar)).toMatchObject({ right: '6px', bottom: '6px' });
      // "Play now" is disabled until a link is typed.
      const playNow = host.getByRole('button', { name: 'Play now' });
      await expect(playNow).toBeDisabled();
      expect(await edges(playNow)).toMatchObject({ right: 'none', bottom: 'none' });
    });
  });
}

test('the shimmering CTA stops for people who prefer reduced motion', async ({ browser }) => {
  const moving = await themedPage(browser, 'dark');
  await moving.goto('/');
  const cta = moving.getByRole('button', { name: 'Create room' });
  expect(await cta.evaluate((el) => getComputedStyle(el).animationName)).toBe('neo-shimmer');

  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const still = await context.newPage();
  await still.goto('/');
  const stillCta = still.getByRole('button', { name: 'Create room' });
  expect(await stillCta.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await stillCta.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
});

test('phone layout: no horizontal scroll and nothing cut off by the 3D edges', async ({ browser }) => {
  for (const theme of ['dark', 'light'] as const) {
    const page = await themedPage(browser, theme, { width: 375, height: 812 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/design/landing-${theme}-phone.png`, fullPage: true });
  }
});
