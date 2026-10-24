// Upload and download. Uploads use files built in memory, so no sample file with real content sits
// in the repository; downloads are saved under the test's output folder and read back.

import { readFile, stat } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A file to pass to `setInputFiles`, built from text or bytes. */
export function fileFrom(
  name: string,
  content: string | Buffer,
  mimeType = 'text/plain',
): FilePayload {
  return {
    name,
    mimeType,
    buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
  };
}

/** A file of `bytes` bytes, for size limits. */
export function fileOfSize(
  name: string,
  bytes: number,
  mimeType = 'application/octet-stream',
): FilePayload {
  return { name, mimeType, buffer: Buffer.alloc(bytes, 0x61) };
}

export interface Downloaded {
  name: string;
  path: string;
  size: number;
  text(): Promise<string>;
}

/** Run `trigger` (the click that starts the download) and return the saved file. */
export async function downloadFrom(
  page: Page,
  testInfo: TestInfo,
  trigger: () => Promise<void>,
): Promise<Downloaded> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const failure = await download.failure();
  if (failure) throw new Error(`The download of ${download.url()} failed: ${failure}.`);
  const name = download.suggestedFilename();
  const path = testInfo.outputPath('downloads', name);
  await download.saveAs(path);
  const { size } = await stat(path);
  return { name, path, size, text: () => readFile(path, 'utf8') };
}
