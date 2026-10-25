import { expect, test } from '@playwright/test';
import { caseIdentity, caseIdFromTitle, issueUrl } from '../case-meta';

const app = { name: 'juice-shop', version: '20.3.0' };

test('the identity is pack, version and case id; a title without an id has none', () => {
  expect(caseIdFromTitle('TC-LOGIN-03 Back after logout shows no data @regression')).toBe(
    'TC-LOGIN-03',
  );
  expect(caseIdentity(app, 'TC-LOGIN-03 Back after logout')).toBe('juice-shop-20.3.0-TC-LOGIN-03');
  expect(caseIdentity(app, 'the home page opens @smoke')).toBeNull();
  expect(caseIdFromTitle('see TC-LOGIN-03 for details')).toBeNull();
});

test('a known gap links to its issue, and a key that is not one is refused', () => {
  const tracker = { keyPattern: 'LOCAL-\\d+', issueUrl: 'docs/tracker/local/issues.json#{key}' };
  expect(issueUrl(tracker, 'LOCAL-12')).toBe('docs/tracker/local/issues.json#LOCAL-12');
  expect(() => issueUrl(tracker, 'LOCAL-12a')).toThrow(/not a key matching tracker.key_pattern/);
  expect(() => issueUrl({ keyPattern: null, issueUrl: null }, 'LOCAL-1')).toThrow(
    /is a note, not a known gap/,
  );
  expect(
    issueUrl({ keyPattern: '#\\d+', issueUrl: 'https://github.com/o/r/issues/{key}' }, '#7'),
  ).toBe('https://github.com/o/r/issues/7');
});
