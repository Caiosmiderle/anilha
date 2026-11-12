/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Theme = { choice: 'light' | 'dark' | null; systemDark: boolean };
type Rule = { selector: string; declarations: Record<string, string> };
type Color = [number, number, number, number];
const css = [
  '../../../design/harbor-ui/tokens.css',
  '../../../design/harbor-ui/components.css',
  '../../../design/harbor-ui/extensions.css',
  '../app.css',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');

// Read the shipped styles in import order, including both dark-theme paths.
// This deliberately handles only the selectors/media used by these tokens;
// browser layout, forced colors and keyboard behavior need separate review.
function rulesFor(theme: Theme, source = css): Rule[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]+;/g, '');
  const rules: Rule[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open < 0) break;
    const selector = clean.slice(cursor, open).trim();
    let end = open + 1;
    let depth = 1;
    while (depth && end < clean.length) {
      if (clean[end] === '{') depth++;
      if (clean[end] === '}') depth--;
      end++;
    }
    const body = clean.slice(open + 1, end - 1);
    if (selector === '@media (prefers-color-scheme: dark)' && theme.systemDark) {
      rules.push(...rulesFor(theme, body));
    } else if (!selector.startsWith('@')) {
      const declarations = Object.fromEntries(
        [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)(?:;|$)/g)].map((m) => [m[1]!, m[2]!.trim()]),
      );
      for (const part of selector.split(',')) {
        rules.push({ selector: part.trim(), declarations });
      }
    }
    cursor = end;
  }
  return rules;
}

function styles(theme: Theme) {
  const rules = rulesFor(theme);
  const tokens: Record<string, string> = {};
  for (const rule of rules) {
    if (
      rule.selector === ':root' ||
      (rule.selector === ":root[data-theme='dark']" && theme.choice === 'dark') ||
      (rule.selector === ":root:not([data-theme='light'])" && theme.choice !== 'light')
    ) {
      Object.assign(tokens, rule.declarations);
    }
  }
  const resolve = (value: string): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, token: string) => {
      if (!tokens[token]) throw new Error(`Token ausente: ${token}`);
      return resolve(tokens[token]);
    });
  const declaration = (selector: string, property: string): string => {
    const value = rules
      .filter((rule) => rule.selector === selector && property in rule.declarations)
      .at(-1)?.declarations[property];
    if (!value) throw new Error(`Declaração ausente: ${selector} / ${property}`);
    return resolve(value);
  };
  return { token: (name: string) => resolve(`var(${name})`), declaration };
}

function color(value: string): Color {
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
      1,
    ];
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1]!.split(',').map(Number);
    return [r!, g!, b!, a];
  }
  throw new Error(`Cor não suportada: ${value}`);
}

function luminance(rgb: number[]): number {
  const linear = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrast(foreground: Color, background: Color): number {
  const composed = foreground
    .slice(0, 3)
    .map((c, i) => c * foreground[3] + background[i]! * (1 - foreground[3]));
  const a = luminance(composed);
  const b = luminance(background.slice(0, 3));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function brightness(c: Color, factor: number): Color {
  return [
    Math.min(255, c[0] * factor),
    Math.min(255, c[1] * factor),
    Math.min(255, c[2] * factor),
    c[3],
  ];
}

const themes: [string, Theme][] = [
  ['claro explícito', { choice: 'light', systemDark: false }],
  ['claro explícito com sistema escuro', { choice: 'light', systemDark: true }],
  ['claro automático', { choice: null, systemDark: false }],
  ['escuro explícito', { choice: 'dark', systemDark: false }],
  ['escuro automático', { choice: null, systemDark: true }],
];

describe('contraste WCAG dos tokens finais do Harbor (UX-05 e UX-16)', () => {
  it('calcula luminância sRGB e composição alfa sem arredondar o limite', () => {
    expect(contrast(color('#000000'), color('#ffffff'))).toBe(21);
    expect(contrast(color('#777777'), color('#ffffff'))).toBeCloseTo(4.4781, 4);
    expect(contrast(color('rgba(0, 0, 0, 0.5)'), color('#ffffff'))).toBeCloseTo(3.9767, 4);
  });

  describe.each(themes)('%s', (_, theme) => {
    const { token, declaration } = styles(theme);

    it('texto primário passa 4,5:1 no gradiente inteiro e no hover', () => {
      const foreground = color(declaration('.hb-btn-primary', 'color'));
      const background = declaration('.hb-btn-primary', 'background');
      const stops = background.match(/#[\da-f]{6}|rgba?\([^)]+\)/gi)!.map(color);
      expect(stops).toHaveLength(2);
      const hover = declaration('.hb-btn-primary:hover', 'filter').match(
        /^brightness\(([\d.]+)\)$/,
      );
      expect(hover).not.toBeNull();
      for (const factor of [1, Number(hover![1])]) {
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          const bg = stops[0]!.map((c, i) => c * (1 - t) + stops[1]![i]! * t) as Color;
          const ratio = contrast(brightness(foreground, factor), brightness(bg, factor));
          expect(ratio, `gradiente ${step}%, brilho ${factor}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it('texto da confirmação destrutiva passa 4,5:1', () => {
      expect(
        contrast(
          color(declaration('.hb-btn-danger', 'color')),
          color(declaration('.hb-btn-danger', 'background')),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('foco realmente usado passa 3:1 nos fundos do app', () => {
      for (const [selector, property] of [
        [':focus-visible', 'box-shadow'],
        ['.hb-btn:focus-visible', 'box-shadow'],
        ['.hb-input:focus', 'box-shadow'],
        ['.hb-selectwrap select:focus', 'box-shadow'],
      ]) {
        const shadow = declaration(selector!, property!);
        const ring = color(shadow.match(/#[\da-f]{6}|rgba?\([^)]+\)/i)![0]);
        for (const background of [
          '--bg-page',
          '--bg-surface',
          '--bg-subtle',
          '--brand-50',
          '--pastel-butter',
        ]) {
          expect(
            contrast(ring, color(token(background))),
            `${selector} sobre ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('trilho desligado passa 3:1 contra o fundo e o polegar', () => {
      const track = color(declaration('.hb-switch', 'background'));
      for (const background of ['--bg-page', '--bg-surface', '--bg-subtle']) {
        expect(contrast(track, color(token(background))), background).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrast(track, color(declaration('.hb-switch::after', 'background'))),
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
