/**
 * Builds the three kinetic films (desktop ad, mobile ad, landing) from storyboard.mjs.
 * Each film is a plain HyperFrames project: index.html mounts one sub-composition per
 * scene, every timed element written out in the HTML. Edit the storyboard and run
 * `node build.mjs`; edits made by hand in a film's files are lost on the next build.
 *
 * Screens are the app's own captures (marketing/capture/screens), used as they are: the
 * camera moves over them, nothing is redrawn. Coordinates are in screenshot pixels
 * (1170 x 2532, a 390 x 844 phone at 3x).
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { films } from './storyboard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(HERE, '../../capture/screens');
const SFX = join(HERE, '../youtube/assets/sfx');
const LOGO = join(HERE, '../youtube/assets/logo.svg');
const SHOT_W = 1170;
const SFX_LEN = { tick: 0.09, pop: 0.17 }; // ffprobe of the kit's files
const SHOT_H = 2532;

const INK = '#141413';
const GSAP = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n) => Math.round(n * 1000) / 1000;

/** Words as spans; words inside `accent` (a phrase) get the accent colour. */
function words(text, accent, cls) {
  const acc = new Set((accent ?? '').split(' ').filter(Boolean));
  return text
    .split(' ')
    .map((w) => `<span class="wd ${cls}${acc.has(w) ? ' acc' : ''}">${esc(w)}</span>`)
    .join(' ');
}

/** Line entrances, varied across a film (motion.md "Titles"). */
function enter(sel, style, t) {
  if (style === 'ink')
    return `tl.fromTo(${sel}, { opacity: 1, color: '#c9c9c6' }, { color: (i, el) => (el.classList.contains('acc') ? 'var(--accent)' : '${INK}'), duration: 0.12, stagger: 0.08, ease: 'none' }, ${t});`;
  if (style === 'line')
    return `tl.fromTo(${sel}, { opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.18, ease: 'power4.out' }, ${t});`;
  // blur per word (default)
  return `tl.fromTo(${sel}, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.14, stagger: 0.07, ease: 'power3.out' }, ${t});`;
}
const leave = (sel, t) =>
  `tl.to(${sel}, { opacity: 0, filter: 'blur(8px)', duration: 0.15, stagger: 0.03, ease: 'power2.in' }, ${t});`;

/** Camera state -> transform that puts screenshot point (cx, cy) at the focus point. */
function camXY(fmt, k) {
  const s = r(k.s * (fmt.zoom ?? 1));
  return { x: r(fmt.focus[0] - k.cx * s), y: r(fmt.focus[1] - k.cy * s), scale: s };
}

function screenScene(fmt, sc, id) {
  const imgs = sc.images
    .map(
      (src, i) =>
        `<img id="${id}-img${i}" class="shot-img" src="assets/screens/${src}.png" alt=""${i ? ' style="opacity:0"' : ''} />`,
    )
    .join('\n          ');
  const presses = (sc.presses ?? [])
    .map((p, i) => {
      const [x1, y1, x2, y2] = p.box;
      const img = sc.images[p.image ?? 0];
      return `<div id="${id}-press${i}" class="press" style="clip-path: inset(${y1}px ${SHOT_W - x2}px ${SHOT_H - y2}px ${x1}px round 48px); transform-origin: ${(x1 + x2) / 2}px ${(y1 + y2) / 2}px"><img src="assets/screens/${img}.png" alt="" /></div>`;
    })
    .join('\n        ');
  const lines = (sc.text ?? [])
    .map(
      (ln, i) =>
        `<div id="${id}-t${i}" class="line">${ln.lines.map((l) => `<span class="row">${words(l, ln.accent, `w${i}`)}</span>`).join('')}</div>`,
    )
    .join('\n      ');

  const js = [];
  const k0 = sc.cam[0];
  const s0 = camXY(fmt, k0);
  const entry = sc.enter ?? 'cut';
  if (entry === 'whip') {
    js.push(
      `tl.fromTo('#${id}-cam', { x: ${s0.x + fmt.w * 0.6}, y: ${s0.y}, scale: ${s0.scale} }, { x: ${s0.x}, duration: 0.36, ease: 'expo.out' }, 0);`,
      `tl.fromTo('#${id}-world', { filter: 'blur(18px)' }, { filter: 'blur(0px)', duration: 0.3, ease: 'power2.out' }, 0);`,
    );
  } else if (entry === 'settle') {
    const big = camXY(fmt, { ...k0, s: k0.s * 1.12 });
    js.push(
      `tl.fromTo('#${id}-cam', { x: ${big.x}, y: ${big.y}, scale: ${big.scale} }, { x: ${s0.x}, y: ${s0.y}, scale: ${s0.scale}, duration: 0.4, ease: 'expo.out' }, 0);`,
    );
  } else if (entry === 'rise') {
    js.push(
      `tl.fromTo('#${id}-cam', { x: ${s0.x}, y: ${s0.y + fmt.h * 0.7}, scale: ${s0.scale} }, { y: ${s0.y}, duration: 0.45, ease: 'expo.out' }, 0);`,
      `tl.fromTo('#${id}-world', { filter: 'blur(14px)' }, { filter: 'blur(0px)', duration: 0.35, ease: 'power2.out' }, 0);`,
    );
  } else {
    js.push(`tl.set('#${id}-cam', { x: ${s0.x}, y: ${s0.y}, scale: ${s0.scale} }, 0);`);
  }
  if (entry !== 'whip' && entry !== 'rise') js.push(`tl.set('#${id}-world', { filter: 'blur(0px)' }, 0);`);
  for (const k of sc.cam.slice(1)) {
    const s = camXY(fmt, k);
    const d = k.d ?? 0.45;
    if (k.cut) {
      js.push(`tl.set('#${id}-cam', { x: ${s.x}, y: ${s.y}, scale: ${s.scale} }, ${k.t});`);
      continue;
    }
    js.push(
      `tl.to('#${id}-cam', { x: ${s.x}, y: ${s.y}, scale: ${s.scale}, duration: ${d}, ease: '${k.ease ?? 'expo.inOut'}' }, ${k.t});`,
    );
    if (!k.through)
      js.push(
        `tl.to('#${id}-world', { filter: 'blur(${k.blur ?? 5}px)', duration: ${r(d * 0.45)}, ease: 'power2.in', yoyo: true, repeat: 1 }, ${k.t});`,
      );
  }
  for (const sw of sc.swaps ?? []) {
    sc.images.forEach((_, i) => js.push(`tl.set('#${id}-img${i}', { opacity: ${i === sw.i ? 1 : 0} }, ${sw.t});`));
  }
  (sc.presses ?? []).forEach((p, i) => {
    js.push(
      `tl.fromTo('#${id}-press${i}', { opacity: 1, scale: 1, filter: 'brightness(1)' }, { scale: 0.955, filter: 'brightness(0.86)', duration: 0.08, ease: 'power2.out' }, ${p.t});`,
      `tl.to('#${id}-press${i}', { scale: 1, filter: 'brightness(1)', duration: 0.14, ease: 'power3.out' }, ${r(p.t + 0.08)});`,
      `tl.set('#${id}-press${i}', { opacity: 0 }, ${r(p.t + 0.22)});`,
    );
  });
  (sc.text ?? []).forEach((ln, i) => {
    const sel = `'#${id}-t${i} .w${i}'`;
    js.push(`tl.set('#${id}-t${i}', { opacity: 1 }, ${ln.t});`);
    js.push(enter(sel, ln.style, ln.t));
    if (ln.out != null) js.push(leave(sel, ln.out));
  });

  return {
    css: `
    #${id}-world { position: absolute; inset: 0; }
    #${id}-cam { position: absolute; left: 0; top: 0; width: ${SHOT_W}px; height: ${SHOT_H}px; transform-origin: 0 0; }`,
    html: `
      <div id="${id}-world" data-layout-allow-overflow>
        <div id="${id}-cam">
          <div class="shot">
          ${imgs}
          </div>
        ${presses}
        </div>
      </div>
      <div class="panel"></div>
      ${lines}`,
    js,
  };
}

function wordsScene(fmt, sc, id) {
  const phases = sc.phases ?? [{ t: 0, lines: sc.lines, bg: sc.bg, color: sc.color }];
  const html = phases
    .map(
      (p, i) =>
        `<div id="${id}-p${i}" class="flood" style="background:${p.bg}; color:${p.color ?? INK}"><div class="slam" id="${id}-s${i}">${p.lines.map((l) => `<span class="row">${words(l, p.accent, `b${i}`)}</span>`).join('')}</div></div>`,
    )
    .join('\n      ');
  const js = [];
  phases.forEach((p, i) => {
    js.push(`tl.set('#${id}-p${i}', { opacity: 1 }, ${p.t});`);
    if (i > 0) js.push(`tl.set('#${id}-p${i - 1}', { opacity: 0 }, ${p.t});`);
    // A slam: arrives large and lands dead still on the beat; rows a frame or three apart.
    js.push(
      `tl.fromTo('#${id}-s${i} .row', { scale: 1.32, opacity: 0, filter: 'blur(10px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.22, stagger: 0.1, ease: 'expo.out' }, ${p.t});`,
    );
  });
  return { css: '', html, js };
}

function hookScene(fmt, sc, id) {
  const rows = sc.lines
    .map((l, i) => `<span class="row hook-row" id="${id}-r${i}">${words(l, null, `h${i}`)}</span>`)
    .join('');
  const js = [];
  // Frame 0 is the thumbnail: the first row is already there.
  js.push(`tl.set('#${id}-r0 .h0', { opacity: 1 }, 0);`);
  sc.lines.slice(1).forEach((_, j) => {
    const i = j + 1;
    js.push(enter(`'#${id}-r${i} .h${i}'`, 'blur', r(0.25 + j * 0.3)));
  });
  js.push(
    `tl.fromTo('#${id}-strike', { scaleX: 0 }, { scaleX: 1, duration: 0.28, ease: 'expo.out' }, ${sc.strikeAt});`,
    `tl.to('#${id}-r${sc.strike} .h${sc.strike}', { color: '#85857f', duration: 0.2, ease: 'none' }, ${sc.strikeAt});`,
  );
  return {
    css: `#${id}-r${sc.strike} { position: relative; }
    #${id}-strike { position: absolute; left: -2%; right: -2%; top: 54%; height: ${fmt.hookStrike}px; background: var(--accent); transform-origin: 0 50%; border-radius: 99px; }`,
    html: `<div class="hook"><div class="hook-text">${rows.replace(`id="${id}-r${sc.strike}">`, `id="${id}-r${sc.strike}"><span id="${id}-strike"></span>`)}</div></div>`,
    js,
  };
}

function brandScene(fmt, sc, id) {
  const name = [...'Anilha'].map((c) => `<span class="ch">${c}</span>`).join('');
  const js = [
    `tl.fromTo('#${id}-mark', { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)' }, 0);`,
    `tl.fromTo('#${id}-name .ch', { opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.14, stagger: 0.05, ease: 'power3.out' }, 0.18);`,
    enter(`'#${id}-line .k'`, 'ink', 0.6),
  ];
  return {
    css: '',
    html: `<div class="brand">
        <div class="lockup"><img id="${id}-mark" class="mark" src="assets/logo.svg" alt="" /><span id="${id}-name" class="name">${name}</span></div>
        <div id="${id}-line" class="brand-line">${sc.lines.map((l) => `<span class="row">${words(l, sc.accent, 'k')}</span>`).join('')}</div>
      </div>`,
    js,
  };
}

function endScene(fmt, sc, id) {
  const js = [
    `tl.fromTo('#${id}-mark', { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)' }, 0);`,
    `tl.fromTo('#${id}-name', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.4, ease: 'expo.out' }, 0.2);`,
    enter(`'#${id}-line .e'`, 'blur', 0.55),
    `tl.fromTo('#${id}-cta', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(1.5)' }, 1.0);`,
    `tl.to('#${id}-cta', { scale: 0.95, filter: 'brightness(0.9)', duration: 0.08, ease: 'power2.out' }, 1.9);`,
    `tl.to('#${id}-cta', { scale: 1, filter: 'brightness(1)', duration: 0.16, ease: 'power3.out' }, 1.98);`,
  ];
  if (sc.note) js.push(enter(`'#${id}-note .n'`, 'line', 1.3));
  return {
    css: '',
    html: `<div class="end">
        <div class="lockup"><img id="${id}-mark" class="mark" src="assets/logo.svg" alt="" /><span id="${id}-name" class="name">Anilha</span></div>
        <div id="${id}-line" class="end-line">${sc.lines.map((l) => `<span class="row">${words(l, sc.accent, 'e')}</span>`).join('')}</div>
        <div id="${id}-cta" class="cta">${esc(sc.cta)}</div>
        ${sc.note ? `<div id="${id}-note" class="note">${words(sc.note, null, 'n')}</div>` : ''}
      </div>`,
    js,
  };
}

const KINDS = { screen: screenScene, words: wordsScene, hook: hookScene, brand: brandScene, end: endScene };

function sceneFile(fmt, sc, id) {
  const { css, html, js } = KINDS[sc.kind](fmt, sc, id);
  return `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; background: ${sc.ground ?? fmt.ground}; font-family: 'Inter', sans-serif; color: ${INK}; --accent: #006bb3; }
    #root .row { display: block; }
    #root .acc { color: var(--accent); }
    #root .wd { display: inline-block; }
    #root .shot { position: absolute; inset: 0; border-radius: 84px; overflow: hidden; background: #fafafa; box-shadow: 0 50px 140px rgba(20, 20, 19, 0.16), 0 0 0 5px rgba(20, 20, 19, 0.06); }
    #root .shot-img { position: absolute; left: 0; top: 0; width: ${SHOT_W}px; height: ${SHOT_H}px; display: block; }
    #root .press { position: absolute; left: 0; top: 0; width: ${SHOT_W}px; height: ${SHOT_H}px; }
    #root .press img { display: block; width: ${SHOT_W}px; height: ${SHOT_H}px; }
    #root .panel { position: absolute; ${fmt.panel}; background: ${sc.ground ?? fmt.ground}; }
    #root .line { position: absolute; ${fmt.textBox}; display: flex; flex-direction: column; justify-content: center; font-size: ${fmt.lineSize}px; font-weight: 700; line-height: 1.07; letter-spacing: -0.032em; opacity: 0; }
    #root .line .wd { opacity: 0; }
    #root .flood { position: absolute; inset: 0; display: flex; align-items: center; justify-content: ${fmt.floodAlign}; padding: 0 ${fmt.floodPad}px; opacity: 0; }
    #root .slam { font-size: ${fmt.slamSize}px; font-weight: 900; line-height: 0.98; letter-spacing: -0.05em; }
    #root .slam .row { transform-origin: ${fmt.floodAlign === 'center' ? '50%' : '0%'} 60%; }
    #root .hook { position: absolute; inset: 0; display: flex; align-items: center; padding: ${fmt.hookPad}; }
    #root .hook-text { font-size: ${fmt.hookSize}px; font-weight: 700; line-height: 1.06; letter-spacing: -0.035em; }
    #root .hook-row { width: fit-content; }
    #root .hook-row .wd { opacity: 0; }
    #root .brand, #root .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: ${fmt.endPad}; }
    #root .lockup { display: flex; align-items: center; gap: ${fmt.markSize * 0.22}px; }
    #root .mark { width: ${fmt.markSize}px; height: ${fmt.markSize}px; display: block; }
    #root .name { font-size: ${fmt.markSize * 0.82}px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; display: inline-block; }
    #root .ch { display: inline-block; opacity: 0; }
    #root .brand-line, #root .end-line { margin-top: ${fmt.markSize * 0.34}px; font-size: ${fmt.brandLineSize}px; font-weight: 700; line-height: 1.12; letter-spacing: -0.028em; }
    #root .brand-line .k { color: #c9c9c6; }
    #root .end-line .e, #root .note .n { opacity: 0; }
    #root .cta { margin-top: ${fmt.markSize * 0.36}px; padding: ${fmt.ctaPad}; border-radius: ${fmt.ctaSize * 0.5}px; background: #0071bd; color: #fff; font-size: ${fmt.ctaSize}px; font-weight: 700; letter-spacing: -0.02em; box-shadow: 0 18px 40px rgba(0, 113, 189, 0.26); opacity: 0; }
    #root .note { margin-top: ${fmt.markSize * 0.24}px; font-size: ${fmt.noteSize}px; font-weight: 400; color: #55554f; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${fmt.w}" data-height="${fmt.h}">
      ${html}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${js.join('\n    ')}
    window.__timelines['${id}'] = tl;
  </script>
</template>
`;
}

/**
 * Fits a scene to the music: its length becomes a whole number of beats and every time
 * inside it (camera keys and moves, lines, swaps, taps, word phases, sounds) stretches
 * by the same ratio, so the shot keeps its shape and every cut lands on a beat.
 */
function onBeats(sc, beat) {
  const d = r(Math.max(1, Math.round(sc.d / beat)) * beat);
  const k = d / sc.d;
  const t = (v) => (v == null ? v : r(v * k));
  return {
    ...sc,
    d,
    strikeAt: t(sc.strikeAt),
    cam: sc.cam?.map((c) => ({ ...c, t: t(c.t), d: t(c.d) })),
    text: sc.text?.map((l) => ({ ...l, t: t(l.t), out: t(l.out) })),
    swaps: sc.swaps?.map((w) => ({ ...w, t: t(w.t) })),
    presses: sc.presses?.map((p) => ({ ...p, t: t(p.t) })),
    phases: sc.phases?.map((p) => ({ ...p, t: t(p.t) })),
    sfx: sc.sfx?.map((x) => ({ ...x, t: t(x.t) })),
  };
}

function build(name, film) {
  const dir = join(HERE, name);
  rmSync(join(dir, 'compositions'), { recursive: true, force: true });
  mkdirSync(join(dir, 'compositions'), { recursive: true });
  mkdirSync(join(dir, 'assets/screens'), { recursive: true });
  mkdirSync(join(dir, 'assets/sfx'), { recursive: true });
  copyFileSync(LOGO, join(dir, 'assets/logo.svg'));
  const fmt = film.format;
  let t = 0;
  const hosts = [];
  const audio = [];
  const used = new Set();
  const music = film.music;
  const scenes = music ? film.scenes.map((sc) => onBeats(sc, 60 / music.bpm)) : film.scenes;
  scenes.forEach((sc, i) => {
    const id = `s${String(i + 1).padStart(2, '0')}-${sc.name}`;
    (sc.images ?? []).forEach((s) => used.add(s));
    writeFileSync(join(dir, `compositions/${id}.html`), sceneFile(fmt, sc, id));
    hosts.push(
      `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${r(t)}" data-duration="${sc.d}" data-track-index="1" data-track-kind="graphics" data-width="${fmt.w}" data-height="${fmt.h}"></div>`,
    );
    for (const s of sc.sfx ?? []) {
      // The picture leads: a sound lands one frame after it.
      audio.push({ at: r(t + s.t + 1 / 30), file: s.file });
    }
    t += sc.d;
  });
  for (const s of used) copyFileSync(join(SCREENS, `${s}.png`), join(dir, `assets/screens/${s}.png`));
  for (const f of new Set(audio.map((a) => a.file))) copyFileSync(join(SFX, `${f}.wav`), join(dir, `assets/sfx/${f}.wav`));
  const audioTags = audio
    .map(
      (a, i) =>
        `<audio id="sfx-${String(i + 1).padStart(2, '0')}" class="clip" src="assets/sfx/${a.file}.wav" data-start="${a.at}" data-track-index="${3 + (i % 2)}" data-duration="${SFX_LEN[a.file]}" data-volume="${a.file === 'pop' ? 0.55 : 0.7}"></audio>`,
    )
    .join('\n      ');
  const total = r(t);
  let musicTag = '';
  if (music) {
    mkdirSync(join(dir, 'assets/music'), { recursive: true });
    copyFileSync(join(HERE, 'music', music.file), join(dir, 'assets/music', music.file));
    musicTag = `<audio id="music" class="clip" src="assets/music/${music.file}" data-start="0" data-duration="${total}" data-media-start="${music.from}" data-track-index="2" data-volume="${music.volume}" data-fade-out="${music.fadeOut}"></audio>`;
  }
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${fmt.w}, height=${fmt.h}" />
    <title>Anilha: ${film.title}</title>
    <script src="${GSAP}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${fmt.w}px; height: ${fmt.h}px; overflow: hidden; background: #fafafa; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; }
    </style>
  </head>
  <body>
    <!-- Generated by ../build.mjs from ../storyboard.mjs: edit those, then node build.mjs. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${fmt.w}" data-height="${fmt.h}">
      ${hosts.join('\n      ')}
      ${musicTag}
      ${audioTags}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines['main'] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`,
  );
  if (!existsSync(join(dir, 'hyperframes.json')))
    copyFileSync(join(HERE, '../youtube/hyperframes.json'), join(dir, 'hyperframes.json'));
  console.log(`${name}: ${scenes.length} cenas, ${total} s${music ? `, ${r(total / (60 / music.bpm))} batidas` : ''}`);
}

for (const [name, film] of Object.entries(films)) build(name, film);
