// Motion a page keeps when the user asked for less (`prefers-reduced-motion: reduce`). A case
// emulates the preference with Playwright (`test.use({ reducedMotion: 'reduce' })` or
// `page.emulateMedia({ reducedMotion: 'reduce' })`) and reads what still moves.
//
// Only movement counts, as WCAG 2.3.3 (Animation from Interactions) understands motion: a
// transition or an animation that moves, turns, scales or resizes something. A change of colour,
// opacity, shadow or blur is not motion and is not reported, so a page that turns its slides into
// fades passes. Smoothness is not measured: frame timing in a test browser says nothing reliable.

import type { Locator, Page } from '@playwright/test';

export interface Motion {
  /** `transition`: declared on the element, it moves it whenever the property changes.
   * `animation`: running now. */
  kind: 'transition' | 'animation';
  /** The element, as `tag#id.class`. */
  element: string;
  /** The properties that move: those of the transition, or those the animation's keyframes set. */
  properties: string[];
  /** The animation's name (`animation-name` for a CSS animation); empty for a transition. */
  name: string;
  durationMs: number;
  /** How many times it runs; `Infinity` for one that never stops. */
  iterations: number;
}

/** CSS properties whose change moves, turns, scales or resizes something. */
const MOVING =
  '^(all|transform|translate|rotate|scale|perspective|offset(-.*)?|top|right|bottom|left|inset(-.*)?|margin(-.*)?|width|height|(min|max)-(width|height)|(block|inline)-size|background-position(-.*)?|object-position)$';

interface ReadOptions {
  moving: string;
  scope: 'element' | 'subtree' | 'document';
  /** Every running animation, whatever it sets, and no declared transition. */
  everyAnimation?: boolean;
}

/** Runs in the page: the motion of the element (and below it) or of the whole document. */
function readMotion(root: Element | null, { moving, scope, everyAnimation = false }: ReadOptions) {
  const movingProperty = new RegExp(moving);
  const describe = (element: Element) =>
    element.tagName.toLowerCase() +
    (element.id ? `#${element.id}` : '') +
    [...element.classList]
      .slice(0, 3)
      .map((name) => `.${name}`)
      .join('');
  const ms = (time: string) => {
    const value = parseFloat(time);
    return time.trim().endsWith('ms') ? value : value * 1_000;
  };
  const kebab = (property: string) => property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const found: {
    kind: 'transition' | 'animation';
    element: string;
    properties: string[];
    name: string;
    durationMs: number;
    iterations: number;
  }[] = [];

  const elements =
    scope === 'document' || everyAnimation
      ? []
      : scope === 'subtree' && root
        ? [root, ...root.querySelectorAll('*')]
        : root
          ? [root]
          : [];
  for (const element of elements) {
    // The element, and its ::before and ::after when they draw something: a pseudo-element can
    // slide on its own (an underline, a ripple).
    for (const pseudo of [null, '::before', '::after'] as const) {
      const style = getComputedStyle(element, pseudo);
      if (pseudo && ['none', 'normal'].includes(style.content)) continue;
      const properties = style.transitionProperty.split(',').map((p) => p.trim());
      const durations = style.transitionDuration.split(',');
      const moving = properties
        .map((property, index) => ({
          property,
          duration: ms(durations[index % durations.length]!),
        }))
        .filter(({ property, duration }) => duration > 0 && movingProperty.test(property));
      if (moving.length > 0) {
        found.push({
          kind: 'transition',
          element: describe(element) + (pseudo ?? ''),
          properties: moving.map(({ property }) => property),
          name: '',
          durationMs: Math.max(...moving.map(({ duration }) => duration)),
          iterations: 1,
        });
      }
    }
  }

  const animations =
    scope === 'document'
      ? document.getAnimations()
      : (root?.getAnimations({ subtree: scope === 'subtree' }) ?? []);
  for (const animation of animations) {
    if (animation.playState !== 'running' || !(animation.effect instanceof KeyframeEffect))
      continue;
    // A transition that is running is reported once, from its declaration above.
    if (scope !== 'document' && 'transitionProperty' in animation) continue;
    const properties = [
      ...new Set(
        animation.effect
          .getKeyframes()
          .flatMap((frame) => Object.keys(frame))
          .filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))
          .map(kebab),
      ),
    ].filter((property) => everyAnimation || movingProperty.test(property));
    const timing = animation.effect.getComputedTiming();
    const duration = typeof timing.duration === 'number' ? timing.duration : 0;
    if (!everyAnimation && (properties.length === 0 || duration <= 0)) continue;
    const target = animation.effect.target;
    found.push({
      kind: 'animation',
      element: target ? describe(target) : '',
      properties,
      name: 'animationName' in animation ? String(animation.animationName) : animation.id,
      durationMs: duration,
      iterations: timing.iterations ?? 1,
    });
  }
  return found;
}

/**
 * The motion of the element `locator` points to, and of everything inside it with
 * `{ subtree: true }`: the transitions it declares on properties that move it, and the animations
 * running on it that move something. Empty when nothing would move.
 */
export async function motionOf(
  locator: Locator,
  { subtree = false }: { subtree?: boolean } = {},
): Promise<Motion[]> {
  return locator.evaluate(readMotion, {
    moving: MOVING,
    scope: subtree ? 'subtree' : 'element',
  } satisfies ReadOptions);
}

/**
 * Every animation running on the element `locator` points to, and inside it with
 * `{ subtree: true }`, whatever it animates: a pulse of opacity is listed too, which `motionOf`
 * leaves out because it is not motion. For a case about animations that should stop, such as a
 * loading placeholder's pulse under reduced motion.
 */
export async function animationsOf(
  locator: Locator,
  { subtree = false }: { subtree?: boolean } = {},
): Promise<Motion[]> {
  return locator.evaluate(readMotion, {
    moving: MOVING,
    scope: subtree ? 'subtree' : 'element',
    everyAnimation: true,
  } satisfies ReadOptions);
}

/**
 * The animations running anywhere on the page that move something, such as a toast that slides
 * in or a skeleton that sweeps. Declared transitions are not listed: they move only when a
 * property changes, which `motionOf` reads on the element that changes.
 */
export async function pageMotion(page: Page): Promise<Motion[]> {
  return page.locator('html').evaluate(readMotion, {
    moving: MOVING,
    scope: 'document',
  } satisfies ReadOptions);
}
