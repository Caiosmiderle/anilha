import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { LogoMark } from '../../../../src/ui/brand';
import { CLAMP, expoIn, expoOut, harborSpring, inOut } from '../anim';
import { TYPE, useBeat, useVideo } from '../layout';
import { Eyebrow, Kinetic } from '../text/Kinetic';
import { impactBeat, type Span } from '../timeline';
import { soloScreenRadius, worldAt } from '../three/director';
import { IMPACT_X, PAD } from '../three/World';
import {
  AmigosScreen,
  ConstanciaScreen,
  FocusScreen,
  HojeScreen,
  RecordeScreen,
  SessionScreen,
} from '../ui/screens';
import { InstallSteps, HomeScreen } from '../ui/install';
import { marksFor, UI_SCENES } from './marks';

/* ------------------------------------------------------------------ Ato 1: o ferro */

export function IronText({ span, hasEscuro }: { span: Span; hasEscuro: boolean }) {
  const { at } = useBeat();
  const { layout, formato } = useVideo();
  const m = marksFor(span.id, span.beats);
  const w = (m.words ?? []).map(at);
  const exit = at(span.beats - 0.45);
  const pos: CSSProperties =
    formato === '9:16'
      ? { left: layout.text.x, top: 1460, width: layout.text.width }
      : { left: layout.text.x, top: 640, width: 1200 };
  if (span.id === 'escuro') {
    return (
      <Kinetic
        kind="display"
        parts={[
          { text: 'O ferro', at: w[0] ?? 0 },
          { text: '\né pesado.', at: w[1] ?? 0 },
        ]}
        exit={exit}
        style={pos}
      />
    );
  }
  if (span.id === 'carga') {
    return (
      <Kinetic
        kind="display"
        parts={[
          { text: 'Carga.', at: w[0] ?? 0 },
          { text: '\nRepetição.', at: w[1] ?? 0 },
          { text: '\nDescanso.', at: w[2] ?? 0 },
        ]}
        muted={[1, 2]}
        exit={exit}
        style={{ ...pos, top: formato === '9:16' ? 1040 : 420 }}
      />
    );
  }
  // Puxada: no corte curto, sem a cena do ferro parado, a frase do ferro vem antes, com a
  // anilha ainda no chão; a segunda entra rápido quando ela sai do quadro e fica até a queda.
  const words = ['O', ' registro', ' não', ' precisa', ' ser.'];
  const release = at(span.beats - 1.2);
  if (!hasEscuro) {
    const half = Math.min(2, Math.floor(span.beats / 2) - 0.5);
    return (
      <>
        <Kinetic
          kind="display"
          parts={[
            { text: 'O ferro', at: at(0.25) },
            { text: ' é pesado.', at: at(0.75) },
          ]}
          exit={at(half)}
          style={pos}
        />
        <Kinetic
          kind="display"
          parts={words.map((text, i) => ({ text: i === 2 ? '\nnão' : text, at: at(half + 0.25 + i * 0.125) }))}
          exit={release}
          style={pos}
        />
      </>
    );
  }
  return (
    <Kinetic
      kind="display"
      parts={words.map((text, i) => ({ text: i === 2 ? '\nnão' : text, at: w[i] ?? 0 }))}
      exit={release}
      style={pos}
    />
  );
}

/* ------------------------------------------------------------------ O impacto */

/** Onde o centro da barra toca o chão, na tela, no quadro do impacto. */
function useImpactPoint(): { x: number; y: number } {
  const { spans, formato, bpm, layout } = useVideo();
  return useMemo(() => {
    const s = worldAt(impactBeat(spans) + 0.0001, spans, formato, bpm);
    // O canvas tem PAD px a mais em cada lado (ver World.tsx).
    const cw = layout.W + 2 * PAD;
    const ch = layout.H + 2 * PAD;
    const cam = new THREE.PerspectiveCamera(s.cam.fov, cw / ch, 0.02, 60);
    cam.position.set(...s.cam.pos);
    cam.lookAt(...s.cam.target);
    cam.updateMatrixWorld();
    const p = new THREE.Vector3(IMPACT_X, 0, 0).project(cam);
    return { x: ((p.x + 1) / 2) * cw - PAD, y: ((1 - p.y) / 2) * ch - PAD };
  }, [spans, formato, bpm, layout]);
}

/**
 * A onda de choque: um anel da cor de ação corre a partir do ponto do impacto e o círculo
 * de dentro já é o fundo do Harbor. Quando ele cobre a tela, o 3D por trás vira estúdio
 * claro, e o fundo se abre devagar para mostrar o ferro desfocado atrás da interface.
 */
export function Shockwave() {
  const { f, fps, at } = useBeat();
  const { layout } = useVideo();
  const c = useImpactPoint();
  // O galpão aparece por 0,1 s depois da pancada (poeira, tremor, lente abrindo); então o
  // anel corre.
  const t = f / fps - 0.1;
  const maxR = Math.hypot(Math.max(c.x, layout.W - c.x), Math.max(c.y, layout.H - c.y)) + 60;
  const k = t <= 0 ? 0 : 1 - (1 - Math.min(1, t / 0.45)) ** 3;
  const r = maxR * k;
  const cover = interpolate(f, [at(1.4), at(2.6)], [1, 0], { ...CLAMP, easing: inOut });
  if (cover <= 0) return null;
  const stroke = interpolate(t, [0, 0.45], [26, 3], CLAMP);
  if (t <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: cover }}>
      <svg width={layout.W} height={layout.H} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={c.x} cy={c.y} r={Math.max(0, r)} fill="var(--bg-page)" />
        {t < 0.55 ? (
          <>
            <circle cx={c.x} cy={c.y} r={r + stroke / 2} fill="none" stroke="var(--brand-500)" strokeWidth={stroke} />
            <circle
              cx={c.x}
              cy={c.y}
              r={Math.max(0, r * 0.82)}
              fill="none"
              stroke="var(--brand-300)"
              strokeWidth={stroke * 0.5}
              opacity={1 - t / 0.55}
            />
          </>
        ) : null}
      </svg>
    </AbsoluteFill>
  );
}

/**
 * O peso vira número: "20 kg × 8" bate grande no centro e voa até os campos Carga e
 * Repetições da tela do treino, onde os números do app assumem.
 */
export function NumberFly({ span }: { span: Span }) {
  const { f, at, fps } = useBeat();
  const { layout } = useVideo();
  const m = marksFor('numero', span.beats);
  const w = (m.words ?? []).map(at);
  const land = at(m.land ?? 4);
  const flyFrom = land - Math.round(0.5 * (60 / 128) * fps);
  if (f >= land + 1 || f < (w[0] ?? 0)) return null;
  const fly = interpolate(f, [flyFrom, land], [0, 1], { ...CLAMP, easing: (x) => expoIn(x) * 0.35 + inOut(x) * 0.65 });
  // "20 kg × 8" ocupa umas 4,15 vezes o corpo da letra: cabe na largura livre do formato.
  const portrait = layout.W < layout.H;
  const big = portrait ? (layout.W * 0.9) / 4.15 : Math.min(TYPE.display.size * layout.type * 3.4, (layout.phone.x - 90) / 4.15);
  const ph = layout.phone;
  // Centro dos números nos steppers do dock (medido no render da tela do treino).
  const targets = {
    load: { x: ph.x + 95.5 * ph.zoom, y: ph.y + (ph.h - 103) * ph.zoom },
    reps: { x: ph.x + 282 * ph.zoom, y: ph.y + (ph.h - 103) * ph.zoom },
  };
  const small = 24 * ph.zoom;
  const scale = (1 - fly) + (small / big) * fly;
  // Ao lado da tela do app no 16:9; acima dela no 9:16.
  const cx = portrait ? layout.W / 2 : (layout.phone.x - 40) / 2;
  const cy = portrait ? 400 : layout.H / 2;
  const piece = (text: string, start: number, ox: number, to: { x: number; y: number } | null, muted = false) => {
    const inT = interpolate(f, [start, start + 9], [0, 1], { ...CLAMP, easing: expoOut });
    const slam = harborSpring(f, start, fps, 320);
    const x0 = cx + ox * big;
    const x = to ? x0 + (to.x - x0) * fly : x0;
    const y = to ? cy + (to.y - cy) * fly : cy;
    const fade = to ? 1 : 1 - fly;
    return (
      <span
        key={text}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `translate(-50%, -54%) scale(${scale * (1.06 - 0.06 * slam)}) translateY(${(1 - inT) * 30}%)`,
          opacity: inT * fade,
          // Peso 600, o mesmo do número do stepper: a troca no pouso não aparece.
          font: `600 ${big}px/1 var(--font-sans)`,
          letterSpacing: -0.03 * big,
          color: muted ? 'var(--ink-muted-aa)' : 'var(--ink-strong)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    );
  };
  return (
    <AbsoluteFill>
      {piece('20', w[0] ?? 0, -1.52, targets.load)}
      {piece('kg', w[1] ?? 0, -0.16, null, true)}
      {piece('×', w[2] ?? 0, 0.94, null, true)}
      {piece('8', w[2] ?? 0, 1.8, targets.reps)}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ A tela do app */

const SCENE_COPY: Partial<Record<Span['id'], { eyebrow: string; line: string }>> = {
  numero: { eyebrow: 'Registro de carga', line: 'Um toque\npor série.' },
  hoje: { eyebrow: 'Treino sugerido', line: 'O treino do dia,\njá montado.' },
  serie: { eyebrow: 'Modo foco', line: 'Subiu a barra,\nsérie feita.' },
  constancia: { eyebrow: 'Constância', line: 'Descanso\ntambém conta.' },
  recorde: { eyebrow: 'Recorde', line: 'O app percebe\no recorde.' },
  amigos: { eyebrow: 'Amigos', line: 'Constância\njunto.' },
};

/** O selo e a frase de cada cena do app, na coluna do texto. */
export function SceneText({ span }: { span: Span }) {
  const { at } = useBeat();
  const { layout, formato } = useVideo();
  const copy = SCENE_COPY[span.id];
  if (!copy) return null;
  // Cena curta (corte de 15 s): a frase entra mais rápido para ficar mais tempo inteira.
  const short = span.beats < 6;
  const step = short ? 0.125 : 0.25;
  const start = span.id === 'numero' ? (marksFor('numero', span.beats).land ?? 4) + 0.5 : short ? 0.25 : 0.5;
  const exit = at(span.beats - 0.4);
  const words = copy.line.split(/(?=[ \n])/);
  const top = formato === '9:16' ? layout.text.y : layout.text.y - 150;
  return (
    <>
      <Eyebrow text={copy.eyebrow} at={at(start)} exit={exit} style={{ left: layout.text.x, top }} />
      <Kinetic
        parts={words.map((text, i) => ({ text, at: at(start + (short ? 0.25 : 0.5) + i * step) }))}
        exit={exit}
        style={{ left: layout.text.x, top: top + (formato === '9:16' ? 76 : 70), width: layout.text.width }}
      />
    </>
  );
}

/**
 * A moldura da tela, com câmera de verdade: entra girando no espaço e trava na mola do
 * Harbor; a cada cena orbita um pouco e trava de novo; as telas trocam como no app, uma
 * empurrando a outra. Fica de pé do número até os amigos.
 */
export function PhoneTrack() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spans, layout } = useVideo();
  const ui = spans.filter((s) => UI_SCENES.includes(s.id));
  const first = ui[0];
  const last = ui[ui.length - 1];
  if (!first || !last) return null;
  const fpb = (60 * fps) / useVideo().bpm;
  const enter = first.from + Math.round((marksFor(first.id, first.beats).phoneIn ?? 0) * fpb);
  const exit = last.from + last.duration - 10;
  if (frame < enter || frame >= exit + 12) return null;

  const cur = ui.filter((s) => frame >= s.from).pop() as Span;
  const prev = ui[ui.indexOf(cur) - 1];
  const local = frame - cur.from;
  const push = cur === first ? 1 : harborSpring(local, 0, fps, 420);

  // Câmera: entrada longa, órbitas curtas alternando o lado, saída para o fundo.
  // Entra em exatamente um tempo: trava no tempo em que os números pousam.
  const inP = harborSpring(frame, enter, fps, fpb * (1000 / fps));
  const side = ui.indexOf(cur) % 2 === 0 ? 1 : -1;
  const orbit = cur === first ? 0 : 1 - harborSpring(local, 0, fps, 520);
  const outP = interpolate(frame, [exit, exit + 12], [0, 1], { ...CLAMP, easing: expoIn });
  const ry = (1 - inP) * -32 + orbit * 9 * side + outP * 24;
  const rx = (1 - inP) * 12 + orbit * -3;
  const tz = (1 - inP) * -700 + orbit * -90 - outP * 900;
  const tx = (1 - inP) * 260;
  const flat = ry === 0 && rx === 0 && tz === 0 && tx === 0;
  const ph = layout.phone;

  const screenOf = (s: Span, f: number): ReactNode => {
    const m = marksFor(s.id, s.beats);
    const at = (b: number) => Math.round(b * fpb);
    switch (s.id) {
      case 'numero':
        return <SessionScreen f={f} fps={fps} landAt={at(m.land ?? 4)} tapAt={at(m.tap ?? 6)} />;
      case 'hoje':
        return <HojeScreen f={f} tapAt={at(m.tap ?? 6)} />;
      case 'serie':
        return <FocusScreen f={f} fps={fps} tapAt={at(m.tap ?? 5)} />;
      case 'constancia':
        return <ConstanciaScreen f={f} fps={fps} litAt={at(m.reveal ?? 1)} />;
      case 'recorde':
        return <RecordeScreen f={f} fps={fps} riseAt={at(m.reveal ?? 1)} />;
      case 'amigos':
        return <AmigosScreen f={f} fps={fps} tapAt={at(m.tap ?? 3)} />;
      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ perspective: 2400, opacity: 1 - outP }}>
      <div
        style={{
          position: 'absolute',
          left: ph.x,
          top: ph.y,
          width: 390 * ph.zoom,
          height: ph.h * ph.zoom,
          transform: flat ? 'none' : `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) rotateX(${rx}deg)`,
          transformOrigin: '50% 50%',
        }}
      >
        <div className="app-frame" style={{ zoom: ph.zoom, height: ph.h, left: 0, top: 0 }}>
          {prev && push < 1 ? (
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-28 * push}%)`, filter: `brightness(${1 - 0.04 * push})` }}>
              {screenOf(prev, frame - prev.from)}
            </div>
          ) : null}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: push < 1 ? `translateX(${(1 - push) * 100}%)` : undefined,
              boxShadow: push < 1 ? 'var(--shadow-card)' : undefined,
            }}
          >
            {screenOf(cur, local)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ A marca */

/** Geometria do LogoMark (src/ui/brand.tsx), num quadro de 32. */
const RING_R = 9.5;
const RING_SWEEP = 300; // graus: o vão de 60° é o descanso planejado

/**
 * A anilha encara a câmera, o furo do centro se abre no bloco azul da marca, o aro vira o
 * anel da logo e se abre o vão do descanso. O desenho final é o LogoMark do app.
 */
export function Marca({ span }: { span: Span }) {
  const { f, at, fps } = useBeat();
  const { spans, formato, bpm, layout } = useVideo();
  const m = marksFor('marca', span.beats);
  const reveal = at(m.reveal ?? 4.5);
  const startBeat = span.startBeat + (m.reveal ?? 4.5);
  const s = worldAt(startBeat, spans, formato, bpm);
  const plateR = soloScreenRadius(s.cam, layout.H + 2 * PAD);
  const final = formato === '9:16' ? 220 : 168;
  const cx = layout.W / 2;
  const cy = formato === '9:16' ? layout.H * 0.42 : layout.H * 0.4;
  if (f < reveal) return null;

  // 1. o azul enche a face da anilha a partir do furo, dentro do aro de ferro; 2. o aro vira
  // o anel branco e abre o vão do descanso; 3. o bloco encolhe para o tamanho da marca e os
  // cantos aparecem.
  const open = interpolate(f, [reveal, reveal + 10], [0, 1], { ...CLAMP, easing: expoOut });
  const ring = interpolate(f, [reveal + 10, reveal + 15], [0, 1], { ...CLAMP, easing: inOut });
  const gap = interpolate(f, [reveal + 12, reveal + 24], [0, 1], { ...CLAMP, easing: inOut });
  const shrink = harborSpring(f, reveal + 24, fps, 560);
  // Tamanho do bloco: o meio do traço do anel (9,5 de 32) cai no meio do aro da anilha
  // (entre 190 e 225 mm do centro).
  const tileStart = (plateR * (0.2075 / 0.225) * 32) / RING_R;
  const tile = tileStart + (final - tileStart) * shrink;
  const ty = (layout.H / 2 - cy) * -shrink;
  // Recorte circular em fração do lado do bloco: do furo da anilha (25,5 de 225 mm) até o
  // aro, e do aro até os cantos enquanto encolhe.
  const holeR = ((0.0255 / 0.2075) * RING_R) / 32;
  const innerR = (RING_R - 1.5) / 32;
  const rimR = (RING_R + 1.5) / 32;
  const clip =
    (shrink > 0
      ? rimR + (Math.SQRT1_2 - rimR) * shrink
      : ring > 0
        ? innerR + (rimR - innerR) * ring
        : holeR + (innerR - holeR) * open) * 100;
  const swapToReal = f >= reveal + 24 + Math.round(0.56 * fps);
  const words = (m.words ?? []).map(at);
  const circ = 2 * Math.PI * RING_R;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: cx - tile / 2,
          top: layout.H / 2 - tile / 2 + ty,
          width: tile,
          height: tile,
        }}
      >
        {swapToReal ? (
          <div className="logo-free" style={{ width: tile, height: tile }}>
            <LogoMark size={tile} />
          </div>
        ) : (
          <svg width={tile} height={tile} viewBox="0 0 32 32" style={{ clipPath: `circle(${clip}% at 50% 50%)` }}>
            <defs>
              <linearGradient id="marca-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--brand-300)" />
                <stop offset="1" stopColor="var(--brand-500)" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill="url(#marca-g)" />
            <circle
              cx="16"
              cy="16"
              r={RING_R}
              fill="none"
              stroke="var(--ink-on-brand)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${circ * (1 - (gap * (360 - RING_SWEEP)) / 360)} ${circ}`}
              transform="rotate(-90 16 16)"
              opacity={ring}
            />
            <circle cx="16" cy="16" r={3.2 * open} fill="var(--ink-on-brand)" />
          </svg>
        )}
      </div>
      <Kinetic
        kind="display"
        parts={[
          { text: 'Do ferro', at: words[0] ?? 0 },
          { text: ' ao número.', at: (words[0] ?? 0) + at(0.5) },
        ]}
        exit={at(span.beats - 0.4)}
        style={{ left: 0, width: layout.W, textAlign: 'center', top: cy + final / 2 + (formato === '9:16' ? 90 : 60) }}
      />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ Instalar e fim */

export function Instalar({ span }: { span: Span }) {
  const { f, at, fps } = useBeat();
  const { layout, formato } = useVideo();
  const m = marksFor('instalar', span.beats);
  const steps = (m.steps ?? []).map(at);
  const reveal = at(m.reveal ?? 4);
  const exit = at(span.beats - 0.4);
  const enter = harborSpring(f, 0, fps, 640);
  const out = interpolate(f, [exit, exit + 10], [0, 1], { ...CLAMP, easing: expoIn });
  const portrait = formato === '9:16';
  const ph = portrait ? { zoom: 2.0, x: (1080 - 780) / 2, y: 1010, h: 445 } : layout.phone;
  const w = (m.words ?? []).map(at);
  const top = portrait ? layout.text.y : layout.text.y - 290;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'var(--bg-page)', opacity: 0.86 * Math.min(1, f / 8) }} />
      <Eyebrow text="Instale" at={w[0] ?? 0} exit={exit} style={{ left: layout.text.x, top }} />
      <Kinetic
        parts={[
          { text: 'Sem loja.', at: (w[0] ?? 0) + at(0.5) },
          { text: '\nDireto do navegador.', at: (w[0] ?? 0) + at(1) },
        ]}
        exit={exit}
        style={{ left: layout.text.x, top: top + 70, width: layout.text.width }}
      />
      <div
        style={{
          position: 'absolute',
          left: layout.text.x,
          top: portrait ? 470 : top + 290,
          opacity: (1 - out) * Math.min(1, enter * 1.4),
          transform: `translateY(${(1 - enter) * 16}px)`,
        }}
      >
        <div style={{ width: 390, zoom: portrait ? 2.0 : 1.45 }}>
          <InstallSteps f={f} steps={steps} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: ph.x,
          top: ph.y,
          width: 390 * ph.zoom,
          height: ph.h * ph.zoom,
          perspective: 2400,
          opacity: 1 - out,
        }}
      >
        <div
          className="app-frame"
          style={{
            zoom: ph.zoom,
            height: ph.h,
            transform: enter < 1 ? `translateY(${(1 - enter) * 60}px) rotateX(${(1 - enter) * 14}deg)` : undefined,
          }}
        >
          <HomeScreen f={f} fps={fps} dropAt={reveal} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function Fim({ span }: { span: Span }) {
  const { f, fps, at } = useBeat();
  const { layout, formato } = useVideo();
  const m = marksFor('fim', span.beats);
  const w = (m.words ?? []).map(at);
  const pop = harborSpring(f, w[0] ?? 0, fps, 560);
  const size = formato === '9:16' ? 220 : 168;
  const cy = formato === '9:16' ? layout.H * 0.4 : layout.H * 0.36;
  return (
    <AbsoluteFill style={{ background: 'var(--bg-page)' }}>
      <div
        style={{
          position: 'absolute',
          left: layout.W / 2 - size / 2,
          top: cy - size / 2,
          transform: `scale(${0.82 + 0.18 * pop})`,
          opacity: Math.min(1, pop * 2),
        }}
      >
        <div className="logo-free" style={{ width: size, height: size }}>
          <LogoMark size={size} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: layout.W,
          textAlign: 'center',
          top: cy + size / 2 + 24,
          opacity: Math.min(1, pop * 2),
        }}
      >
        <span className="hb-wordmark" style={{ zoom: formato === '9:16' ? 4.2 : 3.6 }}>
          Anilha
        </span>
      </div>
      <Kinetic
        parts={[
          { text: 'Adicione à', at: w[1] ?? 0 },
          { text: ' Tela de Início.', at: (w[1] ?? 0) + at(0.25) },
        ]}
        style={{ left: 0, width: layout.W, textAlign: 'center', top: cy + size / 2 + (formato === '9:16' ? 220 : 170) }}
      />
    </AbsoluteFill>
  );
}
