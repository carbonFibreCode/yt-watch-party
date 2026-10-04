import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

/**
 * Player quality-of-life (plan §15): fullscreen that follows the device orientation and keeps
 * approvals usable, keyboard shortcuts, audio preferences and the scrubber preview.
 */
test.describe.configure({ timeout: 120_000 });

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ';
const SYNC_TIMEOUT_MS = 20_000;

const player = (page: Page): Locator => page.getByTestId('player');
const frame = (page: Page): Locator => page.getByTestId('player-frame');
const controlBar = (page: Page): Locator => page.getByTestId('control-bar');
const row = (page: Page, name: string): Locator => page.getByTestId(`participant-${name}`);
const isFullscreen = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.fullscreenElement !== null);

/** Seconds shown in the control bar's "m:ss / m:ss" (current position). */
const shownSeconds = async (page: Page): Promise<number> => {
  const text =
    (await controlBar(page)
      .getByText(/^\d+:\d\d \/ /)
      .textContent()) ?? '';
  const [current = ''] = text.split(' / ');
  return current.split(':').reduce((total, part) => total * 60 + Number(part), 0);
};

const newPerson = async (browser: Browser, init?: (context: BrowserContext) => Promise<void>) => {
  const context = await browser.newContext();
  await init?.(context);
  return context.newPage();
};

/** A fresh room with the host's video cued; returns the host page. */
const createRoom = async (browser: Browser, init?: (context: BrowserContext) => Promise<void>) => {
  const host = await newPerson(browser, init);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill(VIDEO);
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(row(host, 'Hana')).toBeVisible();
  await expect(player(host)).toHaveAttribute('data-player-state', 'cued', { timeout: SYNC_TIMEOUT_MS });
  return host;
};

const join = async (browser: Browser, url: string, name: string): Promise<Page> => {
  const page = await newPerson(browser);
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(row(page, name)).toBeVisible();
  return page;
};

const makeViewer = async (host: Page, name: string): Promise<void> => {
  await host.getByRole('button', { name: `Actions for ${name}` }).click();
  await host.getByRole('menuitem', { name: 'Make viewer' }).click();
  await expect(row(host, name).getByText('Viewer')).toBeVisible();
};

/** Moves keyboard focus to the page body so shortcuts reach the document. */
const focusPage = async (page: Page): Promise<void> => {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
};

/** Marks the YouTube iframe so a later check can prove it was never recreated (no reload). */
const tagIframe = (page: Page): Promise<void> =>
  page.evaluate(() => {
    (window as unknown as { __iframe?: Element | null }).__iframe = document.querySelector(
      '[data-testid="player"] iframe',
    );
  });
const sameIframe = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const tagged = (window as unknown as { __iframe?: Element | null }).__iframe;
    return (
      tagged !== null &&
      tagged !== undefined &&
      tagged === document.querySelector('[data-testid="player"] iframe')
    );
  });

/** Every corner of the element is inside the viewport (nothing cut off), once it stops moving. */
const expectInsideViewport = async (page: Page, locator: Locator): Promise<void> => {
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const viewport = page.viewportSize();
      if (box === null || viewport === null) {
        return 'not rendered';
      }
      const inside =
        box.x >= -0.5 &&
        box.y >= -0.5 &&
        box.x + box.width <= viewport.width + 0.5 &&
        box.y + box.height <= viewport.height + 0.5;
      return inside ? 'inside' : `outside: ${JSON.stringify(box)} in ${JSON.stringify(viewport)}`;
    })
    .toBe('inside');
};

/** The element is what a click at its center would hit (not covered by the fullscreen player). */
const expectOnTop = async (locator: Locator): Promise<void> => {
  await expect
    .poll(() =>
      locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit !== null && (el === hit || el.contains(hit))) {
          return 'on top';
        }
        return `covered by ${hit === null ? 'nothing' : `${hit.tagName}.${hit.className}`} at ${JSON.stringify(r)}`;
      }),
    )
    .toBe('on top');
};

/** Pretend the browser has no Fullscreen API (like iPhone Safari), before the app loads. */
const withoutFullscreenApi = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    for (const key of ['fullscreenEnabled', 'webkitFullscreenEnabled']) {
      Object.defineProperty(Document.prototype, key, { configurable: true, get: () => false });
    }
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
  });
};

test.describe('fullscreen', () => {
  test('F and the button enter real fullscreen without reloading the video; F and Esc leave', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });
    await tagIframe(host);

    await focusPage(host);
    await host.keyboard.press('f');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'true');
    await expect.poll(() => isFullscreen(host)).toBe(true);
    await expect(controlBar(host)).toHaveAttribute('data-variant', 'overlay');
    await expectInsideViewport(host, controlBar(host));
    expect(await sameIframe(host)).toBe(true);
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing');
    // No page scrolling behind the fullscreen player.
    expect(await host.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await host.keyboard.press('f');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
    await expect.poll(() => isFullscreen(host)).toBe(false);
    await expect(controlBar(host)).toHaveAttribute('data-variant', 'docked');
    expect(await host.evaluate(() => document.body.style.overflow)).toBe('');

    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => isFullscreen(host)).toBe(true);
    await host.keyboard.press('Escape');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
    await expect.poll(() => isFullscreen(host)).toBe(false);

    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await host.getByRole('button', { name: 'Exit full screen' }).click();
    await expect.poll(() => isFullscreen(host)).toBe(false);
    expect(await sameIframe(host)).toBe(true);
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing');
  });

  test('the browser leaving fullscreen on its own (system gesture) brings the page back', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => isFullscreen(host)).toBe(true);
    await host.evaluate(() => document.exitFullscreen());
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
    await expect(controlBar(host)).toHaveAttribute('data-variant', 'docked');
  });

  test('follows the device orientation: portrait → landscape → portrait, nothing cut off', async ({
    browser,
  }) => {
    // Chrome cannot resize a window in real fullscreen, so rotate the viewport-filling layout
    // (the same CSS that real fullscreen uses).
    const host = await createRoom(browser, withoutFullscreenApi);
    await host.setViewportSize({ width: 390, height: 844 });
    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect(frame(host)).toHaveAttribute('data-immersive', 'true');

    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await host.setViewportSize(size);
      await expect.poll(async () => (await frame(host).boundingBox())?.width).toBeCloseTo(size.width, 0);
      const frameBox = await frame(host).boundingBox();
      expect(frameBox?.height).toBeCloseTo(size.height, 0);
      await expectInsideViewport(host, controlBar(host));
      await expectInsideViewport(host, host.getByRole('button', { name: 'Exit full screen' }));
      // The video area spans the full width and takes (almost) all the height.
      const surface = await player(host).boundingBox();
      expect(surface?.width).toBeCloseTo(size.width, 0);
      expect(surface?.height).toBeGreaterThan(size.height * 0.9);
      expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    expect(
      await host.evaluate(() => (screen.orientation as ScreenOrientation | undefined)?.type ?? 'unknown'),
    ).not.toBe('locked');
  });

  test('without a Fullscreen API (iPhone) the player fills the viewport; Esc closes a dialog before leaving', async ({
    browser,
  }) => {
    const host = await createRoom(browser, withoutFullscreenApi);
    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect(frame(host)).toHaveAttribute('data-immersive', 'true');
    expect(await isFullscreen(host)).toBe(false);
    const viewport = host.viewportSize();
    const box = await frame(host).boundingBox();
    expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0);
    expect(box?.height).toBeCloseTo(viewport?.height ?? 0, 0);

    await focusPage(host);
    await host.keyboard.press('?');
    await expect(host.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await host.keyboard.press('Escape');
    await expect(host.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await expect(frame(host)).toHaveAttribute('data-immersive', 'true');
    await host.keyboard.press('Escape');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
  });
});

test.describe('approvals while the host is in fullscreen', () => {
  test('the request toast shows over the fullscreen player and Approve works there', async ({ browser }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    const pat = await join(browser, host.url(), 'Pat');
    await expect(player(pat)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });

    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => isFullscreen(host)).toBe(true);

    await pat.getByRole('button', { name: 'Ask to pause' }).click();
    const toast = host.locator('[data-sonner-toast]').filter({ hasText: 'Pat wants to pause' });
    await expect(toast).toBeVisible();
    expect(await isFullscreen(host)).toBe(true);
    await expectOnTop(toast);
    await expectInsideViewport(host, toast);
    // The fullscreen bar offers the same request as a fallback.
    await expect(host.getByRole('button', { name: 'Pending requests (1)' })).toBeVisible();

    await toast.getByRole('button', { name: 'Approve' }).click();
    await expect(player(host)).toHaveAttribute('data-player-state', 'paused', { timeout: SYNC_TIMEOUT_MS });
    await expect(player(pat)).toHaveAttribute('data-player-state', 'paused', { timeout: SYNC_TIMEOUT_MS });
    expect(await isFullscreen(host)).toBe(true);
    await expect(host.getByRole('button', { name: /Pending requests/ })).toHaveCount(0);
  });

  test('a missed toast can still be handled from the fullscreen bar: approve and reject', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    const pat = await join(browser, host.url(), 'Pat');
    await host.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => isFullscreen(host)).toBe(true);

    await pat.getByRole('button', { name: 'Ask to pause' }).click();
    const pending = host.getByRole('button', { name: 'Pending requests (1)' });
    await expect(pending).toBeVisible();
    await expectOnTop(pending);
    await pending.click();
    const dialog = host.getByRole('dialog', { name: 'Pending requests' });
    await expect(dialog).toBeVisible();
    await expectOnTop(dialog.getByRole('button', { name: 'Reject' }));
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(pat.getByText('Hana declined your request.')).toBeVisible();
    await expect(dialog.getByText('No pending requests.')).toBeVisible();
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing');
    await host.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await pat.getByRole('button', { name: 'Ask to pause' }).click();
    await host.getByRole('button', { name: 'Pending requests (1)' }).click();
    await host
      .getByRole('dialog', { name: 'Pending requests' })
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect(player(pat)).toHaveAttribute('data-player-state', 'paused', { timeout: SYNC_TIMEOUT_MS });
    expect(await isFullscreen(host)).toBe(true);
  });
});

test.describe('keyboard shortcuts', () => {
  test('host shortcuts change playback for everyone; J/L/←/→/0–9/Home jump precisely', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    const sam = await join(browser, host.url(), 'Sam');
    // The length is known once the video has played; then pause so positions are exact.
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player(sam)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });
    await expect(host.getByRole('slider', { name: 'Seek' })).not.toHaveAttribute('data-disabled', '', {
      timeout: SYNC_TIMEOUT_MS,
    });
    await focusPage(host);
    await host.keyboard.press('k');
    await expect(player(sam)).toHaveAttribute('data-player-state', 'paused', { timeout: SYNC_TIMEOUT_MS });
    await host.keyboard.press('5');
    await expect.poll(() => shownSeconds(sam), { timeout: SYNC_TIMEOUT_MS }).toBeGreaterThan(90);
    const start = await shownSeconds(sam);

    await host.keyboard.press('l');
    await expect.poll(() => shownSeconds(sam)).toBe(start + 10);
    await host.keyboard.press('j');
    await host.keyboard.press('j');
    await expect.poll(() => shownSeconds(sam)).toBe(start - 10);
    await host.keyboard.press('ArrowRight');
    await expect.poll(() => shownSeconds(sam)).toBe(start - 5);
    await host.keyboard.press('ArrowLeft');
    await expect.poll(() => shownSeconds(sam)).toBe(start - 10);
    await host.keyboard.press('Home');
    await expect.poll(() => shownSeconds(sam)).toBe(0);
    await host.keyboard.press('j');
    await expect.poll(() => shownSeconds(host)).toBe(0);

    // That was 10 playback commands in a few seconds: let the server's rate limit refill.
    await host.waitForTimeout(5_000);
    await host.keyboard.press('k');
    await expect(player(sam)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });
    await host.keyboard.press('Space');
    await expect(player(sam)).toHaveAttribute('data-player-state', 'paused', { timeout: SYNC_TIMEOUT_MS });
  });

  test('participants and viewers cannot change playback by keyboard, but local keys work', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    const pat = await join(browser, host.url(), 'Pat');
    const vic = await join(browser, host.url(), 'Vic');
    await makeViewer(host, 'Vic');

    for (const page of [pat, vic]) {
      await focusPage(page);
      const before = await shownSeconds(host);
      await page.keyboard.press('k');
      await page.keyboard.press('l');
      await page.keyboard.press('9');
      await page.waitForTimeout(1_000);
      await expect(player(host)).toHaveAttribute('data-player-state', 'playing');
      expect(await shownSeconds(host)).toBeLessThan(before + 5);
      // No request was sent on their behalf either.
      await expect(host.getByText(/wants to/)).toHaveCount(0);

      await page.keyboard.press('m');
      await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
      await page.keyboard.press('m');
      await expect(page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
    }
  });

  test('keys typed in chat, and Space on a focused button, never reach the player', async ({ browser }) => {
    const host = await createRoom(browser);
    await host.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing', { timeout: SYNC_TIMEOUT_MS });

    await host.getByRole('tab', { name: /Chat/ }).click();
    const message = host.getByRole('textbox', { name: 'Message' });
    await message.click();
    await message.pressSequentially('kfm l9 ?');
    await expect(message).toHaveValue('kfm l9 ?');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
    await expect(host.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing');

    // Space presses the focused Mute button (once) instead of pausing the room.
    await host.getByRole('button', { name: 'Mute', exact: true }).focus();
    await host.keyboard.press('Space');
    await expect(host.getByRole('button', { name: 'Unmute' })).toBeVisible();
    await host.waitForTimeout(500);
    await expect(player(host)).toHaveAttribute('data-player-state', 'playing');
  });

  test('? opens the shortcuts help; it lists the table and marks staff keys for viewers', async ({
    browser,
  }) => {
    const host = await createRoom(browser);
    await focusPage(host);
    await host.keyboard.press('?');
    const dialog = host.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Jump back 10 seconds')).toBeVisible();
    await expect(dialog.getByText('Host and moderators')).toHaveCount(0);
    // Shortcuts are off while the dialog has focus.
    await host.keyboard.press('f');
    await expect(frame(host)).toHaveAttribute('data-immersive', 'false');
    await host.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    const vic = await join(browser, host.url(), 'Vic');
    await makeViewer(host, 'Vic');
    await vic.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(
      vic.getByRole('dialog', { name: 'Keyboard shortcuts' }).getByText('Host and moderators').first(),
    ).toBeVisible();
  });
});

test.describe('audio preferences', () => {
  test('mute and volume are remembered across reloads, per browser', async ({ browser }) => {
    const host = await createRoom(browser);
    const volume = host.getByRole('slider', { name: 'Volume' });
    await expect(volume).toHaveAttribute('aria-valuenow', '100');
    await volume.focus();
    for (let i = 0; i < 5; i += 1) {
      await host.keyboard.press('PageDown');
    }
    const level = Number(await volume.getAttribute('aria-valuenow'));
    expect(level).toBeLessThan(100);
    await focusPage(host);
    await host.keyboard.press('ArrowDown');
    await expect(volume).toHaveAttribute('aria-valuenow', String(level - 5));
    await host.keyboard.press('m');
    await expect(host.getByRole('button', { name: 'Unmute' })).toBeVisible();

    await host.reload();
    await expect(row(host, 'Hana')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Unmute' })).toBeVisible();
    // Muted shows 0 on the slider; unmuting restores the remembered level.
    await expect(volume).toHaveAttribute('aria-valuenow', '0');
    await host.getByRole('button', { name: 'Unmute' }).click();
    await expect(volume).toHaveAttribute('aria-valuenow', String(level - 5));

    // Another person's browser keeps its own defaults.
    const sam = await join(browser, host.url(), 'Sam');
    await expect(sam.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '100');
    await expect(sam.getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
  });
});

test('hovering the scrubber previews the time under the mouse', async ({ browser }) => {
  const host = await createRoom(browser);
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  const scrubber = host.getByTestId('scrubber');
  await expect(host.getByRole('slider', { name: 'Seek' })).not.toHaveAttribute('data-disabled', '', {
    timeout: SYNC_TIMEOUT_MS,
  });
  const box = await scrubber.boundingBox();
  if (box === null) {
    throw new Error('no scrubber');
  }
  await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const label = host.getByTestId('scrubber-hover-time');
  await expect(label).toBeVisible();
  const half = (await label.textContent()) ?? '';
  await host.mouse.move(box.x + 2, box.y + box.height / 2);
  await expect(label).not.toHaveText(half);
  await host.mouse.move(box.x + box.width / 2, box.y - 200);
  await expect(label).toHaveCount(0);
});

test('no accessibility violations with the shortcuts dialog open and in fullscreen', async ({ browser }) => {
  const host = await createRoom(browser);
  const audit = async () =>
    (
      await new AxeBuilder({ page: host })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe')
        .analyze()
    ).violations.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));

  await host.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(host.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  expect(await audit()).toEqual([]);
  await host.keyboard.press('Escape');

  await host.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(frame(host)).toHaveAttribute('data-immersive', 'true');
  expect(await audit()).toEqual([]);
});
