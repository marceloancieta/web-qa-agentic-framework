// The notes of a GitHub release are the changelog's section of its version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelease, releaseSection, tagVersion } from '../release-notes.mjs';

const CHANGELOG = `# Changelog

Header text with 0.2.0 in it.

## [0.2.0] - 2026-11-03

### Features

- **a:** two

## [0.1.0] - 2026-11-02

- **a:** one
`;

test('a section ends at the next version, and the last one at the end of the file', () => {
  assert.equal(releaseSection(CHANGELOG, '0.2.0'), '### Features\n\n- **a:** two');
  assert.equal(releaseSection(CHANGELOG, '0.1.0'), '- **a:** one');
});

test('a version with no heading has no section, whatever the text mentions', () => {
  assert.equal(releaseSection(CHANGELOG, '0.3.0'), null);
  assert.equal(releaseSection(CHANGELOG, '0.2'), null);
});

test('a section is read the same with Windows line ends', () => {
  const crlf = CHANGELOG.replace(/\n/g, '\r\n');
  assert.equal(releaseSection(crlf, '0.2.0'), '### Features\n\n- **a:** two');
});

test('a release is created on the existing tag, with the notes on the stdin of gh', () => {
  const calls = [];
  createRelease('v0.2.0', 'the notes\n', (command, args, options) => {
    calls.push({ command, args, input: options.input });
    return { status: 0 };
  });
  assert.deepEqual(calls, [
    {
      command: 'gh',
      args: 'release create v0.2.0 --verify-tag --title v0.2.0 --notes-file -'.split(' '),
      input: 'the notes\n',
    },
  ]);
});

test('a gh that fails, or does not start, fails the step', () => {
  assert.throws(() => createRelease('v0.2.0', 'n', () => ({ status: 1 })), /failed \(exit 1\)/);
  assert.throws(
    () => createRelease('v0.2.0', 'n', () => ({ error: new Error('ENOENT') })),
    /could not start: ENOENT/,
  );
});

test('only a vX.Y.Z tag has a version', () => {
  assert.equal(tagVersion('v0.2.0'), '0.2.0');
  for (const tag of ['0.2.0', 'v0.2', 'v0.2.0-rc.1', '', undefined])
    assert.equal(tagVersion(tag), null, String(tag));
});
