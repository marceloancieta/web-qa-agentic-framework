// The pinned Playwright image of the container lanes. Screenshots are only comparable when they are
// rendered by the same browser build with the same fonts, so the visual lane runs in one image,
// pinned by digest in docker/compose.yml, whose version must be the @playwright/test version of
// the repository (an older or newer image renders with a different browser).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Set inside the image by the compose service; the lanes refuse to run without it. */
export const IN_IMAGE_ENV = 'QA_IN_PLAYWRIGHT_IMAGE';

const IMAGE =
  /image:\s*(mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-[a-z]+@sha256:[0-9a-f]{64})/;

/** The Playwright image the compose file pins: `{ ref, version }`, or null when it pins none. */
export function pinnedImage(composeText) {
  const match = IMAGE.exec(composeText);
  return match ? { ref: match[1], version: match[2] } : null;
}

/** Why the pinned image cannot be used with this repository, or null when it can. */
export function imageProblem(root) {
  const image = pinnedImage(readFileSync(join(root, 'docker', 'compose.yml'), 'utf8'));
  if (!image) {
    return 'docker/compose.yml pins no Playwright image as mcr.microsoft.com/playwright:v<version>-<os>@sha256:<digest>.';
  }
  const installed = JSON.parse(
    readFileSync(join(root, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8'),
  ).version;
  if (image.version !== installed) {
    return `the pinned Playwright image is v${image.version} but @playwright/test is ${installed}; pin the image of the same version.`;
  }
  return null;
}

/** Whether this process runs inside the pinned image (the compose service sets the variable). */
export function inPinnedImage(env = process.env) {
  return env[IN_IMAGE_ENV] === '1';
}

/**
 * The base URL a container reaches a host address through: `localhost` and `127.0.0.1` become
 * `host.docker.internal`, which the compose service maps to the host. Other hosts are unchanged.
 */
export function containerUrl(url) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) return url;
  parsed.hostname = 'host.docker.internal';
  return parsed.toString().replace(/\/$/, '');
}
