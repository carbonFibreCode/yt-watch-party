import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

test.describe.configure({ timeout: 150_000 });

/** 19 s long, so auto-advance is quick to observe. */
const ZOO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const RICK = 'https://youtu.be/dQw4w9WgXcQ';

const person = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();

const createRoom = async (browser: Browser, video: string): Promise<Page> => {
  const host = await person(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Hana');
  await host.getByLabel(/First video/).fill(video);
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host.getByTestId('participant-Hana')).toBeVisible();
  return host;
};

const join = async (browser: Browser, url: string, name: string): Promise<Page> => {
  const page = await person(browser);
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the party' }).click();
  await expect(page.getByTestId(`participant-${name}`)).toBeVisible();
  return page;
};

const say = async (page: Page, text: string): Promise<void> => {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
};

test('chat both ways with unread badge and history after reload', async ({ browser }) => {
  const host = await createRoom(browser, RICK);
  const pat = await join(browser, host.url(), 'Pat');

  await host.getByRole('tab', { name: /Chat/ }).click();
  await say(host, 'popcorn ready?');

  // Pat is on the People tab, so the message shows up as unread.
  const patChatTab = pat.getByRole('tab', { name: /Chat/ });
  await expect(patChatTab).toContainText('1');
  await patChatTab.click();
  const patMessages = pat.getByRole('list', { name: 'Chat messages' });
  await expect(patMessages).toContainText('popcorn ready?');
  await expect(patChatTab).not.toContainText('1');
  await say(pat, 'always 🍿');

  const hostMessages = host.getByRole('list', { name: 'Chat messages' });
  await expect(hostMessages).toContainText('always 🍿');
  await expect(hostMessages).toContainText('Pat joined');

  // History is persisted: it survives a reload.
  await pat.reload();
  await pat.getByRole('tab', { name: /Chat/ }).click();
  await expect(pat.getByRole('list', { name: 'Chat messages' })).toContainText('popcorn ready?');
  await expect(pat.getByRole('list', { name: 'Chat messages' })).toContainText('always 🍿');
});

test('reactions reach everyone and mark the moment on the scrubber', async ({ browser }) => {
  const host = await createRoom(browser, RICK);
  const pat = await join(browser, host.url(), 'Pat');
  // Markers need the video's length, which the player knows once it loads.
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(pat.getByText(/ \/ \d+:\d\d$/)).toBeVisible({ timeout: 30_000 });

  await pat.getByRole('button', { name: 'React with 🔥' }).click();
  await pat.getByRole('button', { name: 'React with 🔥' }).click();
  // Once the length is known, both see a 🔥 ×2 moment marker.
  await expect(host.getByRole('button', { name: /^🔥 ×2 at \d+:\d\d$/ })).toBeVisible({ timeout: 30_000 });
  await expect(pat.getByRole('button', { name: /^🔥 ×2 at \d+:\d\d$/ })).toBeVisible();
});

test('queue: participants request, staff add, next video plays automatically', async ({ browser }) => {
  const host = await createRoom(browser, ZOO);
  const pat = await join(browser, host.url(), 'Pat');

  // Pat can only ask to queue; the host approves.
  await pat.getByRole('tab', { name: /Queue/ }).click();
  await pat.getByLabel('Link to queue').fill(RICK);
  await pat.getByRole('button', { name: 'Ask to queue' }).click();
  await expect(pat.getByText('Asked the host for a queue addition.')).toBeVisible();
  await host.getByRole('tab', { name: /Requests/ }).click();
  await host.getByTestId('request-card').getByRole('button', { name: 'Approve' }).click();

  const patQueue = pat.getByRole('list', { name: 'Queue' });
  await expect(patQueue).toContainText(/Never Gonna Give You Up/);
  await expect(patQueue).toContainText('Added by Pat');
  await expect(pat.getByRole('button', { name: /^Remove / })).toHaveCount(0);

  // The host queues another one directly, then removes it.
  await host.getByRole('tab', { name: /Queue/ }).click();
  await host.getByLabel('Link to queue').fill(ZOO);
  await host.getByRole('button', { name: 'Add to queue' }).click();
  await expect(patQueue.getByRole('listitem')).toHaveCount(2);
  await host.getByRole('button', { name: /^Remove Me at the zoo/ }).click();
  await expect(patQueue.getByRole('listitem')).toHaveCount(1);

  // The 19 s video ends and the queued one takes over for everyone.
  await host.getByRole('button', { name: 'Play', exact: true }).click();
  for (const page of [host, pat]) {
    await expect(page.getByText(/Now playing/).locator('..')).toContainText(/Never Gonna Give You Up/, {
      timeout: 60_000,
    });
  }
  await expect(patQueue).toHaveCount(0);
  await expect(pat.getByText('The queue is empty.', { exact: false })).toBeVisible();
});
