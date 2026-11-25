// The mail a case's application sent, read from a mail catcher the test controls (FUT-07, ADR 0014).
// The application under test sends every email to the catcher qa-config names for the pack
// (`mail_catcher`), which delivers nothing onwards; a case reads the messages sent to an address it
// created, such as a staff member's, and follows a link in one as the person would.
//
// Two limits keep the reading to mail the test owns:
// - Only addresses on a reserved domain (RFC 2606 and RFC 6761: `.test`, `.example`, `.invalid`,
//   `.localhost`, `example.com`, `example.net`, `example.org`) can be read, so a case never reads
//   what a real person was sent, even from a catcher that holds it.
// - The values a link carries in its query (a reset or confirmation token) are secrets of the run:
//   `onSecret` hears each one, and the core fixture remembers them for the redaction reporter.
//
// Mailpit's HTTP API is the one provider (`/api/v1/search`, `/api/v1/message/<id>`).

import type { MailCatcherConfig } from './config';

/** A message as a case reads it. */
export interface MailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** Every http and https link of the message, from the HTML's `href`s and the text, in order. */
  links: string[];
}

/** One message of a search, before its body is read. */
export interface MailSummary {
  id: string;
  to: string[];
  subject: string;
}

export interface MailCatcherOptions {
  /** Hears every query value of every link a read message holds, for the run's redaction. */
  onSecret?: (value: string) => void;
  /** How long `waitForMessage` waits by default. Default: 15 s. */
  timeoutMs?: number;
  /** How often `waitForMessage` asks the catcher again. Default: 250 ms. */
  intervalMs?: number;
  /** The HTTP client; the tests give a fake one. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);

/** Whether `address` is on a domain reserved for tests and documentation, never a real person's. */
export function isReservedAddress(address: string): boolean {
  const match = /^[^@\s]+@([^@\s]+)$/.exec(address.trim());
  if (!match) return false;
  const domain = match[1]!.toLowerCase().replace(/\.$/, '');
  const labels = domain.split('.');
  const tld = labels[labels.length - 1]!;
  const registered = labels.slice(-2).join('.');
  return RESERVED_TLDS.has(tld) || RESERVED_DOMAINS.has(registered);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
};

/** Decodes each entity once, in one pass, so `&amp;#39;` stays `&#39;` and is not unescaped twice. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X'))
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** The http and https links of a message: the HTML's `href`s, then the text's, without repeats. */
export function linksIn(message: { text: string; html: string }): string[] {
  const fromHtml = [...message.html.matchAll(/href\s*=\s*(["'])(.*?)\1/gi)].map((match) =>
    decodeEntities(match[2]!.trim()),
  );
  const fromText = [...message.text.matchAll(/https?:\/\/[^\s<>"'()]+/g)].map((match) =>
    match[0].replace(/[.,;:!?]+$/, ''),
  );
  return [...new Set([...fromHtml, ...fromText].filter((link) => /^https?:\/\//i.test(link)))];
}

/** The values a link carries in its query: the tokens a reset or confirmation link holds. */
export function queryValues(link: string): string[] {
  try {
    return [...new URL(link).searchParams.values()].filter(Boolean);
  } catch {
    return [];
  }
}

/** A link without its query, to name it in a message without its token. */
function withoutQuery(link: string): string {
  try {
    const url = new URL(link);
    return `${url.origin}${url.pathname}${url.search ? '?…' : ''}`;
  } catch {
    return '(not a URL)';
  }
}

/**
 * The one link of `message` whose address matches `pattern`. Fails when none or several do, naming
 * the links without their queries, so no token reaches the error.
 */
export function linkMatching(message: MailMessage, pattern: RegExp): string {
  const found = message.links.filter((link) => pattern.test(link));
  if (found.length === 1) return found[0]!;
  const seen = message.links.map(withoutQuery).join(', ') || 'none';
  throw new Error(
    `The message "${message.subject}" has ${found.length} links that match ${pattern}; ` +
      `its links: ${seen}.`,
  );
}

interface MailpitAddress {
  Address: string;
  Name?: string;
}

interface MailpitSummary {
  ID: string;
  To?: MailpitAddress[] | null;
  Subject: string;
}

interface MailpitMessage extends MailpitSummary {
  From?: MailpitAddress | null;
  Text?: string;
  HTML?: string;
}

/** The mail catcher of a pack in one environment. */
export class MailCatcher {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly onSecret: (value: string) => void;
  private readonly timeoutMs: number;
  private readonly intervalMs: number;

  constructor(config: MailCatcherConfig, options: MailCatcherOptions = {}) {
    if (config.provider !== 'mailpit') {
      throw new Error(
        `mail-catcher: provider "${String(config.provider)}" is not known; use mailpit.`,
      );
    }
    this.baseUrl = config.base_url.replace(/\/+$/, '');
    this.fetch = options.fetch ?? fetch;
    this.onSecret = options.onSecret ?? (() => {});
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.intervalMs = options.intervalMs ?? 250;
  }

  private async get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new Error(
        `mail-catcher: the mail catcher at ${this.baseUrl} did not answer ` +
          `(${(error as Error).message}). Is it running? For the local Spree: npm run spree:up.`,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new Error(
        `mail-catcher: GET ${this.baseUrl}${path.split('?')[0]} answered ${response.status}.`,
      );
    }
    return (await response.json()) as T;
  }

  private static checkAddress(address: string): void {
    if (!isReservedAddress(address)) {
      throw new Error(
        `mail-catcher: "${address}" is not on a reserved domain (.test, example.com and the like). ` +
          'A case reads only the mail of an address it created.',
      );
    }
  }

  /** The messages sent to `address`, newest first; empty when there are none. */
  async messagesTo(address: string): Promise<MailSummary[]> {
    MailCatcher.checkAddress(address);
    const query = encodeURIComponent(`to:"${address}"`);
    const found = await this.get<{ messages?: MailpitSummary[] | null }>(
      `/api/v1/search?query=${query}&limit=50`,
    );
    const wanted = address.toLowerCase();
    // The catcher's search matches parts of addresses; keep the messages sent to this one exactly.
    return (found.messages ?? [])
      .map((message) => ({
        id: message.ID,
        to: (message.To ?? []).map((to) => to.Address),
        subject: message.Subject,
      }))
      .filter((message) => message.to.some((to) => to.toLowerCase() === wanted));
  }

  /** One message with its body and links. Its links' query values go to `onSecret`. */
  async read(id: string): Promise<MailMessage> {
    const message = await this.get<MailpitMessage>(`/api/v1/message/${encodeURIComponent(id)}`);
    const body = { text: message.Text ?? '', html: message.HTML ?? '' };
    const links = linksIn(body);
    for (const link of links) for (const value of queryValues(link)) this.onSecret(value);
    return {
      id: message.ID,
      from: message.From?.Address ?? '',
      to: (message.To ?? []).map((to) => to.Address),
      subject: message.Subject,
      ...body,
      links,
    };
  }

  /**
   * The newest message to `address` whose subject matches `subject` (any subject when omitted),
   * waiting until it arrives: the application sends mail from a background job, after the request
   * that asked for it has answered. `except` names messages already seen (their ids, from
   * `messagesTo` before the action), so a second message of the same kind is waited for rather than
   * the first one found again. Fails after the timeout, saying what did arrive.
   */
  async waitForMessage(
    address: string,
    options: { subject?: RegExp; except?: readonly string[]; timeoutMs?: number } = {},
  ): Promise<MailMessage> {
    const deadline = Date.now() + (options.timeoutMs ?? this.timeoutMs);
    const seen = new Set(options.except ?? []);
    for (;;) {
      const messages = await this.messagesTo(address);
      const match = messages.find(
        (message) =>
          !seen.has(message.id) && (!options.subject || options.subject.test(message.subject)),
      );
      if (match) return this.read(match.id);
      if (Date.now() >= deadline) {
        const subjects = messages.map((message) => `"${message.subject}"`).join(', ') || 'none';
        throw new Error(
          `mail-catcher: no message to ${address}` +
            (options.subject ? ` with a subject matching ${options.subject}` : '') +
            ` arrived in ${options.timeoutMs ?? this.timeoutMs} ms; messages to it: ${subjects}.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
  }
}
