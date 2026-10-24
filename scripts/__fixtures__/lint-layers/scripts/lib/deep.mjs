import { DemoClient } from '../../apps/demo/api/client'; // expect-finding: core-imports-pack
import { toolOutput } from '../apps/output';
import { readFileSync } from 'node:fs';

// A path string is not an import.
const manifest = JSON.parse(readFileSync('apps/demo/app.json', 'utf8'));
export { DemoClient, toolOutput, manifest };
