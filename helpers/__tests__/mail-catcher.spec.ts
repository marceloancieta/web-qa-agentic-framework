import { expect, test } from '@playwright/test';
import {
  isReservedAddress,
  linkMatching,
  linksIn,
  MailCatcher,
  queryValues,
} from '../mail-catcher';

const CONFIG = { provider: 'mailpit' as const, base_url: 'http://catcher.test:8025/' };

interface Stored {
  ID: string;
  To: { Address: string }[];
  Subject: string;
  From?: { Address: string };
  Text?: string;
  HTML?: string;
}

/**
 * A fake Mailpit over `messages`, newest first, as the real one answers. `arrivals` adds a message
 * after that many searches, the way a background job's mail shows up after the request. `calls`
 * keeps the paths asked for.
 */
function fakeCatcher(messages: Stored[], arrivals: { after: number; message: Stored }[] = []) {
  const calls: string[] = [];
  let searches = 0;
  const fake = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/api/v1/search') {
      searches += 1;
      for (const arrival of arrivals.filter((entry) => entry.after === searches)) {
        messages.unshift(arrival.message);
      }
      // Like Mailpit, the search ignores case and matches part of an address, so the caller must
      // filter.
      const query = url.searchParams.get('query') ?? '';
      const wanted = (/^to:"(.*)"$/.exec(query)?.[1] ?? '').toLowerCase();
      const found = messages.filter((message) =>
        message.To.some((to) => to.Address.toLowerCase().includes(wanted)),
      );
      return json({ messages: found.map(({ ID, To, Subject }) => ({ ID, To, Subject })) });
    }
    const id = /^\/api\/v1\/message\/(.+)$/.exec(url.pathname)?.[1];
    const message = messages.find((entry) => entry.ID === id);
    return message ? json(message) : json({ error: 'not found' }, 404);
  }) as typeof fetch;
  return { fake, calls };
}

// A token-shaped value made at run time, as a reset link would carry it.
const token = () => `t${Date.now().toString(36)}${'x'.repeat(20)}`;

test('reserved domains only: .test, .example, .invalid, .localhost and the example domains', () => {
  for (const address of [
    'staff-1@example.test',
    'a@shop.example',
    'a@x.invalid',
    'a@host.localhost',
    'a@example.com',
    'a@mail.example.org',
    'A@EXAMPLE.NET',
  ]) {
    expect(isReservedAddress(address), address).toBe(true);
  }
  for (const address of [
    'a@gmail.com',
    'a@example.com.evil.io',
    'a@notexample.com',
    'a@test.io',
    'example.test',
    'a@b@example.test',
    '',
  ]) {
    expect(isReservedAddress(address), address).toBe(false);
  }
});

test('links come from the hrefs and the text, decoded, once each, http and https only', () => {
  const html =
    '<a href="https://shop.test/reset?token=a&amp;x=1">Reset</a> <a href=\'mailto:x@y.test\'>m</a>' +
    '<a href="/relative">r</a><a href="http://shop.test/other">o</a>';
  const text = 'Reset: https://shop.test/reset?token=a&x=1.\nOr (http://shop.test/third), thanks';
  expect(linksIn({ html, text })).toEqual([
    'https://shop.test/reset?token=a&x=1',
    'http://shop.test/other',
    'http://shop.test/third',
  ]);
  expect(linksIn({ html: '', text: '' })).toEqual([]);
});

test('query values are what a link carries; a link without a query carries none', () => {
  expect(queryValues('https://shop.test/r?token=abc&empty=&n=2')).toEqual(['abc', '2']);
  expect(queryValues('https://shop.test/r')).toEqual([]);
  expect(queryValues('not a url')).toEqual([]);
});

test('linkMatching gives the one match and never names a token when it fails', () => {
  const secret = token();
  const message = {
    id: '1',
    from: 'store@example.test',
    to: ['a@example.test'],
    subject: 'Reset your password',
    text: '',
    html: '',
    links: [`http://shop.test/dashboard/reset-password?token=${secret}`, 'http://shop.test/help'],
  };
  expect(linkMatching(message, /reset-password/)).toBe(message.links[0]);
  const none = () => linkMatching(message, /confirm/);
  expect(none).toThrow(/has 0 links that match \/confirm\//);
  expect(none).toThrow(/reset-password\?…, http:\/\/shop\.test\/help/);
  expect(none).not.toThrow(new RegExp(secret));
  expect(() => linkMatching(message, /shop\.test/)).toThrow(/has 2 links/);
});

test('messagesTo keeps the messages sent to that exact address, and refuses a real one', async () => {
  const { fake, calls } = fakeCatcher([
    { ID: '3', To: [{ Address: 'staff-10@example.test' }], Subject: 'Other' },
    { ID: '2', To: [{ Address: 'Staff-1@example.test' }], Subject: 'Reset your password' },
  ]);
  const catcher = new MailCatcher(CONFIG, { fetch: fake });
  expect(await catcher.messagesTo('staff-1@example.test')).toEqual([
    { id: '2', to: ['Staff-1@example.test'], subject: 'Reset your password' },
  ]);
  expect(calls[0]).toBe('/api/v1/search?query=to%3A%22staff-1%40example.test%22&limit=50');
  expect(await catcher.messagesTo('nobody@example.test')).toEqual([]);
  await expect(catcher.messagesTo('someone@gmail.com')).rejects.toThrow(/not on a reserved domain/);
  expect(calls).toHaveLength(2);
});

test('waitForMessage waits for a mail sent later, reads it and hands its tokens over', async () => {
  const secret = token();
  const { fake } = fakeCatcher(
    [{ ID: '1', To: [{ Address: 'staff-2@example.test' }], Subject: 'Welcome' }],
    [
      {
        after: 3,
        message: {
          ID: '9',
          To: [{ Address: 'staff-2@example.test' }],
          From: { Address: 'store@example.test' },
          Subject: 'Reset your password',
          Text: `Open http://shop.test/dashboard/reset-password?token=${secret}`,
          HTML: `<a href="http://shop.test/dashboard/reset-password?token=${secret}">Reset</a>`,
        },
      },
    ],
  );
  const heard: string[] = [];
  const catcher = new MailCatcher(CONFIG, {
    fetch: fake,
    intervalMs: 1,
    onSecret: (value) => heard.push(value),
  });
  const message = await catcher.waitForMessage('staff-2@example.test', { subject: /reset/i });
  expect(message).toMatchObject({
    id: '9',
    from: 'store@example.test',
    to: ['staff-2@example.test'],
    subject: 'Reset your password',
    links: [`http://shop.test/dashboard/reset-password?token=${secret}`],
  });
  expect(heard).toEqual([secret]);
});

test('waitForMessage skips the messages already seen and waits for the next one', async () => {
  const reset = (ID: string) => ({
    ID,
    To: [{ Address: 'staff-4@example.test' }],
    Subject: 'Reset your password',
    Text: `http://shop.test/reset?token=${ID}${'x'.repeat(10)}`,
  });
  const { fake } = fakeCatcher([reset('1')], [{ after: 2, message: reset('2') }]);
  const catcher = new MailCatcher(CONFIG, { fetch: fake, intervalMs: 1 });
  const before = (await catcher.messagesTo('staff-4@example.test')).map((message) => message.id);
  expect(before).toEqual(['1']);
  const next = await catcher.waitForMessage('staff-4@example.test', {
    subject: /reset/i,
    except: before,
  });
  expect(next.id).toBe('2');
  // Without `except`, the newest one is found at once.
  expect((await catcher.waitForMessage('staff-4@example.test', { subject: /reset/i })).id).toBe(
    '2',
  );
});

test('waitForMessage fails after its timeout, saying what did arrive', async () => {
  const { fake } = fakeCatcher([
    { ID: '1', To: [{ Address: 'staff-3@example.test' }], Subject: 'Welcome' },
  ]);
  const catcher = new MailCatcher(CONFIG, { fetch: fake, intervalMs: 1 });
  await expect(
    catcher.waitForMessage('staff-3@example.test', { subject: /reset/i, timeoutMs: 20 }),
  ).rejects.toThrow(
    /no message to staff-3@example\.test with a subject matching \/reset\/i arrived in 20 ms; messages to it: "Welcome"/,
  );
});

test('a catcher that is down or answers an error is named, with what to check', async () => {
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await expect(
    new MailCatcher(CONFIG, { fetch: down }).messagesTo('a@example.test'),
  ).rejects.toThrow(
    /mail catcher at http:\/\/catcher\.test:8025 did not answer \(fetch failed\)\. Is it running\?/,
  );
  const failing = (async () => new Response('', { status: 503 })) as typeof fetch;
  await expect(new MailCatcher(CONFIG, { fetch: failing }).read('7')).rejects.toThrow(
    /GET http:\/\/catcher\.test:8025\/api\/v1\/message\/7 answered 503/,
  );
  expect(
    () => new MailCatcher({ provider: 'other' as 'mailpit', base_url: 'http://x.test' }),
  ).toThrow(/provider "other" is not known/);
});
