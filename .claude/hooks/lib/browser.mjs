// The browser limits of design (.claude/rules/modes.md) as a table of tool calls: what an agent's
// browser tool may do on its own, what needs the user, and what design never does.
//
// A hook sees a tool's name and arguments, not the page: it cannot tell a link from a submit button
// or a login field from a search box. A call that only reads is allowed, a call that design never
// makes is refused, and a call whose effect depends on the page is asked, so the user is the check
// for what the arguments do not show.

const PLAYWRIGHT = /^mcp__[\w-]*playwright[\w-]*__browser_(\w+)$/i;
const CHROME = /^mcp__claude-in-chrome__(\w+)$/;

const READ = 'reads the page or the browser and changes nothing';
const ACTS =
  'acts on the page, and the arguments do not show whether that submits or changes data. In design ' +
  'a browser navigates and reads, and types only into the login of the pack (`login_path` in ' +
  'apps/<pack>/app.json); follow a link by navigating to its href. Allow it only if it does neither';
const RUNS_CODE =
  'runs code in the page, which can do anything a click or a request can. Allow it only if the code ' +
  'reads (computed styles, attributes) and sends nothing';
const UPLOADS =
  'sends a file to the page. Design submits nothing; a spec run uploads with data it creates';

// Keys that move focus or the view without activating anything: reading the keyboard order is design.
const MOVING_KEYS = new Set([
  'tab',
  'shift+tab',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'up',
  'down',
  'left',
  'right',
  'pageup',
  'pagedown',
  'home',
  'end',
  'escape',
  'esc',
]);

const allowed = (why) => ({ decision: 'allow', reason: why });
const asked = (why) => ({ decision: 'ask', reason: why });
const refused = (why) => ({ decision: 'deny', reason: why });

/** True when every key of a key press (one, or several separated by spaces) only moves. */
export function onlyMoves(keys) {
  const presses = String(keys ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    presses.length > 0 &&
    presses.every((key) => MOVING_KEYS.has(key.toLowerCase().replace(/[_-]/g, '')))
  );
}

/**
 * A navigation target: allowed for `about:blank`, history moves and the origins qa-config names;
 * asked otherwise, since a page outside them may be production or another system.
 */
function target(url, origins) {
  const value = String(url ?? '').trim();
  if (value === '' || value === 'about:blank' || value === 'back' || value === 'forward') {
    return allowed('stays in the browser history or on a blank page');
  }
  let origin;
  try {
    origin = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`).origin;
  } catch {
    return asked(`opens "${value}", which does not parse as a URL`);
  }
  if (origins.has(origin)) return allowed(`opens ${origin}, a base URL qa-config names`);
  return asked(
    `opens ${origin}, which no environment in qa-config names; testing is limited to those ` +
      'environments and never production',
  );
}

const PLAYWRIGHT_READS = new Set([
  'snapshot',
  'take_screenshot',
  'console_messages',
  'network_requests',
  'network_request',
  'find',
  'wait_for',
  'hover',
  'resize',
  'emulate_media',
  'navigate_back',
  'close',
]);
const PLAYWRIGHT_ACTS = new Set(['click', 'type', 'fill_form', 'select_option', 'drag', 'drop']);

function playwright(action, input, origins) {
  if (PLAYWRIGHT_READS.has(action)) return allowed(READ);
  if (action === 'navigate') return target(input?.url, origins);
  if (action === 'tabs')
    return input?.action === 'new' ? target(input?.url, origins) : allowed(READ);
  if (action === 'press_key') return onlyMoves(input?.key) ? allowed('moves focus') : asked(ACTS);
  if (action === 'handle_dialog') {
    return input?.accept === false ? allowed('dismisses a dialog') : asked(ACTS);
  }
  if (PLAYWRIGHT_ACTS.has(action)) return asked(ACTS);
  if (action === 'evaluate' || action === 'run_code_unsafe') return asked(RUNS_CODE);
  if (action === 'file_upload') return refused(UPLOADS);
  return null;
}

const CHROME_READS = new Set([
  'tabs_context_mcp',
  'tabs_create_mcp',
  'tabs_close_mcp',
  'read_page',
  'get_page_text',
  'find',
  'read_console_messages',
  'read_network_requests',
  'resize_window',
  'gif_creator',
  'list_connected_browsers',
  'select_browser',
  'switch_browser',
]);
const COMPUTER_READS = new Set(['screenshot', 'zoom', 'scroll', 'scroll_to', 'hover', 'wait']);

function chrome(tool, input, origins) {
  if (CHROME_READS.has(tool)) return allowed(READ);
  if (tool === 'navigate') return target(input?.url, origins);
  if (tool === 'computer') {
    if (COMPUTER_READS.has(input?.action)) return allowed(READ);
    if (input?.action === 'key')
      return onlyMoves(input?.text) ? allowed('moves focus') : asked(ACTS);
    return asked(ACTS);
  }
  if (tool === 'form_input') return asked(ACTS);
  if (tool === 'javascript_tool') return asked(RUNS_CODE);
  if (tool === 'file_upload' || tool === 'upload_image') return refused(UPLOADS);
  if (tool === 'browser_batch') return batch(input?.actions, origins);
  return null;
}

const RANK = { allow: 0, ask: 1, deny: 2 };

/** A batch is as strict as its strictest step; a step that cannot be read is asked. */
function batch(actions, origins) {
  if (!Array.isArray(actions) || actions.length === 0) return asked('has no steps it can read');
  let strictest = allowed(READ);
  for (const [index, step] of actions.entries()) {
    const name = typeof step?.name === 'string' ? step.name : '';
    const verdict =
      name === 'browser_batch' ? null : (chrome(name, step?.input, origins) ?? unknown(name));
    const found = verdict ?? asked(`step ${index + 1} cannot be read`);
    if (RANK[found.decision] > RANK[strictest.decision]) {
      strictest = { ...found, reason: `(step ${index + 1}, ${name}) ${found.reason}` };
    }
  }
  return strictest;
}

function unknown(tool) {
  return asked(
    `is a browser tool browser-guard does not know, so it cannot tell whether "${tool}" only reads`,
  );
}

/**
 * The verdict on one tool call: null for a tool that is not an agent browser tool, otherwise
 * `{ decision: 'allow' | 'ask' | 'deny', reason }`, the reason completing "the call ...".
 * @param {string} toolName
 * @param {object} input
 * @param {Set<string>} origins the origins qa-config names (configuredOrigins)
 */
export function browserVerdict(toolName, input, origins) {
  const name = String(toolName ?? '');
  const inPlaywright = PLAYWRIGHT.exec(name);
  if (inPlaywright) return playwright(inPlaywright[1], input, origins) ?? unknown(inPlaywright[1]);
  const inChrome = CHROME.exec(name);
  if (inChrome) return chrome(inChrome[1], input, origins) ?? unknown(inChrome[1]);
  return null;
}
