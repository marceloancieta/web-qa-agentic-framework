// Design-token checks: whether a component is drawn with the values of the pack's design system
// (`apps/<pack>/design-tokens.json`). The file follows the Design Tokens Community Group format,
// in a subset: groups, tokens with `$value` and `$type` (a group's `$type` passes to its tokens),
// `$description`, and aliases written `{group.token}`. Types: color, dimension, fontFamily,
// fontWeight, duration and number; a colour is CSS colour text, a dimension or a duration CSS
// text or `{ value, unit }`.
//
// A token and the computed style are compared the way the browser draws them, not as text: a
// colour as the pixel it paints (oklch, hex and rgb of one colour are the same pixel), anything
// else as the computed value the browser gives the token's value on a probe element beside the
// component (`0.8125rem` and `13px` are the same size, `bold` and `700` the same weight).

import { readFileSync } from 'node:fs';
import type { Locator } from '@playwright/test';

export type TokenType = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'number';
const TYPES: readonly TokenType[] = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'number',
];

export interface DesignToken {
  /** The token's path, its groups and its name joined with dots: `color.action.primary`. */
  name: string;
  type: TokenType;
  /** The value as CSS text, aliases resolved. */
  css: string;
}

export type DesignTokens = ReadonlyMap<string, DesignToken>;

/** A property of a component whose computed value is not its token's. */
export interface TokenMismatch {
  property: string;
  token: string;
  /** The token's value, as CSS text. */
  expected: string;
  /** The computed value of the property on the component. */
  actual: string;
}

const ALIAS = /^\{([^{}]+)\}$/;
const NAME_PART = /^[^.{}$][^.{}]*$/;
const UNIT = /^[a-z%]+$/i;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One family as CSS writes it: quoted when it is not a single identifier. */
function familyCss(family: string): string {
  return /^[a-z-]+$/i.test(family) ? family : `"${family.replace(/"/g, '\\"')}"`;
}

/** The CSS text of a literal `$value` of `type`, or a problem. */
function cssOf(type: TokenType, value: unknown): { css: string } | { problem: string } {
  if ((type === 'dimension' || type === 'duration') && isObject(value)) {
    const { value: number, unit } = value;
    if (typeof number !== 'number' || typeof unit !== 'string' || !UNIT.test(unit))
      return { problem: 'a { value, unit } with a number and a unit' };
    return { css: `${number}${unit}` };
  }
  if (type === 'fontFamily' && Array.isArray(value)) {
    if (value.length === 0 || !value.every((family) => typeof family === 'string' && family))
      return { problem: 'a list of family names' };
    return { css: (value as string[]).map(familyCss).join(', ') };
  }
  if ((type === 'fontWeight' || type === 'number') && typeof value === 'number')
    return { css: String(value) };
  if (typeof value === 'string' && value.trim()) return { css: value.trim() };
  return { problem: `a ${type} value` };
}

/**
 * The tokens of a design-tokens document, aliases resolved; throws with every problem it finds,
 * naming the token and `source`.
 */
export function parseDesignTokens(document: unknown, source = 'design-tokens.json'): DesignTokens {
  const problems: string[] = [];
  const declared = new Map<string, { type?: TokenType; value: unknown }>();

  const walk = (group: Raw, path: string[], inherited?: TokenType) => {
    const groupType = group.$type ?? inherited;
    for (const [key, child] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      const name = [...path, key].join('.');
      if (!NAME_PART.test(key)) {
        problems.push(`"${name}" has a name with a dot, a brace or a leading $`);
        continue;
      }
      if (!isObject(child)) {
        problems.push(`"${name}" is neither a group nor a token`);
        continue;
      }
      const type = child.$type ?? groupType;
      if (type !== undefined && !TYPES.includes(type as TokenType)) {
        problems.push(`"${name}" has $type "${String(type)}", not one of ${TYPES.join(', ')}`);
        continue;
      }
      if ('$value' in child) declared.set(name, { type: type as TokenType, value: child.$value });
      else walk(child, [...path, key], type as TokenType | undefined);
    }
  };
  if (!isObject(document)) throw new Error(`${source}: the document is not a JSON object.`);
  walk(document, []);

  const tokens = new Map<string, DesignToken>();
  const resolve = (name: string, chain: string[]): DesignToken | undefined => {
    const done = tokens.get(name);
    if (done) return done;
    const entry = declared.get(name);
    if (!entry) return undefined;
    if (chain.includes(name)) {
      problems.push(`"${chain[0]}" refers to itself through ${[...chain, name].join(' -> ')}`);
      return undefined;
    }
    const alias = typeof entry.value === 'string' ? ALIAS.exec(entry.value.trim()) : null;
    if (alias) {
      const target = resolve(alias[1]!, [...chain, name]);
      if (!target) {
        if (!declared.has(alias[1]!))
          problems.push(`"${name}" refers to "${alias[1]}", which is not a token`);
        return undefined;
      }
      if (entry.type && entry.type !== target.type) {
        problems.push(
          `"${name}" is a ${entry.type} but refers to the ${target.type} "${target.name}"`,
        );
        return undefined;
      }
      const token = { name, type: target.type, css: target.css };
      tokens.set(name, token);
      return token;
    }
    if (!entry.type) {
      problems.push(`"${name}" has no $type, on it or on a group around it`);
      return undefined;
    }
    const css = cssOf(entry.type, entry.value);
    if ('problem' in css) {
      problems.push(`"${name}" must have as $value ${css.problem}`);
      return undefined;
    }
    const token = { name, type: entry.type, css: css.css };
    tokens.set(name, token);
    return token;
  };
  for (const name of declared.keys()) resolve(name, []);

  if (problems.length > 0) throw new Error(`${source}: ${[...new Set(problems)].join('; ')}.`);
  if (tokens.size === 0) throw new Error(`${source}: it declares no token.`);
  return tokens;
}

/** The tokens of a pack's `design-tokens.json`. */
export function loadDesignTokens(file: string): DesignTokens {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${file}: the pack has no design-tokens file to check against.`, {
      cause: error,
    });
  }
  return parseDesignTokens(JSON.parse(text) as unknown, file);
}

/**
 * The properties of the component `locator` points to whose computed value is not the value of
 * the token they name, `{ 'background-color': 'color.action', 'border-radius': 'radius.control' }`;
 * empty when every one matches. The style is read once the component's finite transitions and
 * animations have finished, so a hover or a focus that fades in is read at its end. A token
 * `tokens` does not hold is a mistake in the case and throws.
 */
export async function tokenMismatches(
  locator: Locator,
  expected: Readonly<Record<string, string>>,
  tokens: DesignTokens,
): Promise<TokenMismatch[]> {
  const checks = Object.entries(expected).map(([property, name]) => {
    const token = tokens.get(name);
    if (!token)
      throw new Error(
        `design tokens: "${name}" (for ${property}) is not a token of the pack; it has ${[
          ...tokens.keys(),
        ].join(', ')}.`,
      );
    return { property, token: name, type: token.type, css: token.css };
  });
  const read = await locator.evaluate(async (element, list) => {
    await Promise.allSettled(
      element
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished),
    );
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    /** The pixel `color` paints over nothing when the fill style was `sentinel` before it. */
    const paint = (color: string, sentinel: string) => {
      context!.clearRect(0, 0, 1, 1);
      context!.fillStyle = sentinel;
      context!.fillStyle = color;
      context!.fillRect(0, 0, 1, 1);
      return [...context!.getImageData(0, 0, 1, 1).data];
    };
    /**
     * The pixel a colour paints over nothing, as r,g,b,a; null when it is not a colour, or when the
     * canvas ignores it (a fill style it cannot parse keeps the one before, so two different
     * sentinels before it give two different pixels).
     */
    const pixel = (color: string): number[] | null => {
      if (!context || !CSS.supports('color', color)) return null;
      const overBlack = paint(color, '#000');
      const overWhite = paint(color, '#fff');
      return overBlack.every((channel, index) => channel === overWhite[index]) ? overBlack : null;
    };
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    (element.parentElement ?? document.body).appendChild(probe);
    // Engines differ in quoting font families (Firefox gives `Geist Variable` where Chromium gives
    // `"Geist Variable"`); a family name is the same with or without its quotes.
    const tidy = (text: string) =>
      text
        .replace(/["']/g, '')
        .replace(/\s*,\s*/g, ', ')
        .trim();
    try {
      const computed = getComputedStyle(element);
      return list.map((check) => {
        const actual = computed.getPropertyValue(check.property).trim();
        if (check.type === 'color') {
          const want = pixel(check.css);
          const have = pixel(actual);
          // One step per channel covers the rounding of a colour space conversion.
          const same =
            want !== null &&
            have !== null &&
            want.every((channel, index) => Math.abs(channel - have[index]!) <= 1);
          return { ...check, actual, same };
        }
        probe.style.setProperty(check.property, check.css);
        const want = getComputedStyle(probe).getPropertyValue(check.property).trim();
        probe.style.removeProperty(check.property);
        return { ...check, actual, same: want !== '' && tidy(want) === tidy(actual) };
      });
    } finally {
      probe.remove();
    }
  }, checks);
  return read
    .filter((check) => !check.same)
    .map(({ property, token, css, actual }) => ({ property, token, expected: css, actual }));
}
