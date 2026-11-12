import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ThreeCanvas } from '@remotion/three';
import { useDelayRender } from 'remotion';
import { ToneMappingMode, type DepthOfFieldEffect, type EffectComposer as EffectComposerImpl } from 'postprocessing';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { expoOut } from '../anim';
import { token } from '../harbor';
import { concrete, knurl, paintedPlate, type PaintedTextures } from './textures';
import { PLATE_R, type WorldState } from './director';

/**
 * O mundo físico, como foto de produto: estúdio claro, luz de janela e de softbox (painéis
 * procedurais, sem imagem de fora), sombra de contato, oclusão de ambiente e profundidade de
 * campo de lente. Ferro, luz e fundo saem da paleta do Harbor: a tinta da anilha é `--ink`,
 * o metal gasto das letras é `--ink-muted`, o estúdio é `--bg-warm` antes do impacto e
 * `--bg-page` depois, o chão é `--bg-subtle` e a onda de choque é `--brand-500`.
 */

interface Palette {
  paint: THREE.Color;
  bare: THREE.Color;
  steel: THREE.Color;
  warm: THREE.Color;
  page: THREE.Color;
  floor: THREE.Color;
  shadow: THREE.Color;
  brand: THREE.Color;
}

function palette(): Palette {
  const c = (n: `--${string}`) => new THREE.Color(token(n));
  return {
    paint: c('--ink'),
    bare: c('--ink-muted'),
    steel: c('--line-strong'),
    warm: c('--bg-warm'),
    page: c('--bg-page'),
    floor: c('--bg-subtle'),
    shadow: c('--ink-strong'),
    brand: c('--brand-500'),
  };
}

/* ------------------------------------------------------------------ geometria */

/** Arco de pontos (raio, altura) para cantos arredondados do perfil. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 6): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/**
 * Anilha olímpica de ferro fundido (450 mm, 54 mm de espessura): aro com borda arredondada,
 * face rebaixada onde vão as letras, cubo saliente e furo de 51 mm com chanfro. Torneada em
 * volta do eixo e virada para o eixo da barra (X). UV plana nas duas faces, sem espelhar.
 */
export function plateGeometry(): THREE.BufferGeometry {
  const R = PLATE_R;
  const top: [number, number][] = [
    [R, 0],
    [R, 0.014],
    ...arc(R - 0.011, 0.014, 0.011, 0, Math.PI / 2),
    [0.2, 0.025],
    ...arc(0.2, 0.019, 0.006, Math.PI / 2, Math.PI),
    [0.191, 0.016],
    ...arc(0.186, 0.017, 0.005, -0.2, -Math.PI / 2 - 0.3, 4),
    [0.176, 0.012],
    [0.074, 0.012],
    ...arc(0.074, 0.017, 0.005, -Math.PI / 2, -Math.PI + 0.3, 4),
    [0.066, 0.02],
    ...arc(0.06, 0.02, 0.006, 0, Math.PI / 2),
    [0.031, 0.026],
    [0.0275, 0.0245],
    [0.0255, 0.021],
  ];
  const bottom = [...top].reverse().map(([r, y]) => [r, -y] as [number, number]);
  const profile = [...bottom, ...top.slice(1)].map(([r, y]) => new THREE.Vector2(r, y));
  profile.push(new THREE.Vector2(0.0255, -0.021));
  const g = new THREE.LatheGeometry(profile, 160);
  g.rotateZ(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const s = x >= 0 ? -1 : 1;
    uv[i * 2] = (s * z) / (2 * R) + 0.5;
    uv[i * 2 + 1] = y / (2 * R) + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Peça torneada ao longo de X (luva, colar, presilha) com quinas suavizadas. */
export function turned(radius: number, length: number, bevel: number): THREE.BufferGeometry {
  const p = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(radius - bevel, 0),
    ...arc(radius - bevel, bevel, bevel, -Math.PI / 2, 0, 4).map(([r, y]) => new THREE.Vector2(r, y)),
    new THREE.Vector2(radius, length - bevel),
    ...arc(radius - bevel, length - bevel, bevel, 0, Math.PI / 2, 4).map(([r, y]) => new THREE.Vector2(r, y)),
    new THREE.Vector2(0.0001, length),
  ];
  return new THREE.LatheGeometry(p, 96).rotateZ(-Math.PI / 2).translate(-length / 2, 0, 0);
}

/* ------------------------------------------------------------------ objetos */

function Plate({
  geo,
  mat,
  position,
  rotation,
}: {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return <mesh geometry={geo} material={mat} position={position} rotation={rotation ?? [0, 0, 0]} castShadow receiveShadow />;
}

export function plateMaterial(t: PaintedTextures): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: t.map,
    bumpMap: t.bump,
    bumpScale: 3.2,
    roughness: 1,
    roughnessMap: t.rough,
    metalness: 1,
    metalnessMap: t.metal,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
  });
}

const BAR_HALF = 1.1;
const sag = (x: number, bend: number) => -bend * (x / BAR_HALF) ** 2;
const slope = (x: number, bend: number) => Math.atan((-2 * bend * x) / (BAR_HALF * BAR_HALF));

function Barbell({
  y,
  bend,
  plateGeo,
  plateMat,
  steel,
}: {
  y: number;
  bend: number;
  plateGeo: THREE.BufferGeometry;
  plateMat: THREE.Material;
  steel: THREE.Color;
}) {
  const mats = useMemo(() => {
    const k = knurl();
    return {
      shaft: new THREE.MeshPhysicalMaterial({ color: steel, metalness: 1, roughness: 0.34, bumpMap: k, bumpScale: 0.8 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: steel, metalness: 1, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
    };
  }, [steel]);
  const shaftGeo = useMemo(() => {
    const pts = Array.from({ length: 25 }, (_, i) => {
      const x = -0.655 + (1.31 * i) / 24;
      return new THREE.Vector3(x, sag(x, bend), 0);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.014, 20, false);
  }, [bend]);
  useLayoutEffect(() => () => shaftGeo.dispose(), [shaftGeo]);
  const parts = useMemo(
    () => ({ collar: turned(0.036, 0.03, 0.004), sleeve: turned(0.025, 0.41, 0.003), clamp: turned(0.034, 0.03, 0.005) }),
    [],
  );
  const at = (x: number): { position: [number, number, number]; rotation: [number, number, number] } => ({
    position: [x, sag(x, bend), 0],
    rotation: [0, 0, slope(x, bend)],
  });
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={shaftGeo} material={mats.shaft} castShadow />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={parts.collar} material={mats.chrome} castShadow {...at(s * 0.67)} />
          <mesh geometry={parts.sleeve} material={mats.chrome} castShadow {...at(s * 0.89)} />
          <Plate geo={plateGeo} mat={plateMat} {...at(s * 0.712)} />
          <Plate geo={plateGeo} mat={plateMat} {...at(s * 0.767)} />
          <mesh geometry={parts.clamp} material={mats.chrome} castShadow {...at(s * 0.812)} />
        </group>
      ))}
    </group>
  );
}

/** Magnésio: deriva lenta no ar e uma nuvem que sobe do chão no impacto. */
function Dust({ t, sinceImpact, amount, color }: { t: number; sinceImpact: number; amount: number; color: THREE.Color }) {
  const N = 900;
  const seed = useMemo(() => {
    const a = new Float32Array(N * 7);
    let s = 1234567;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < N; i += 1) a.set([r() * 3.4 - 1.7, r() * 1.2 + 0.02, r() * 2.6 - 1.3, r() - 0.5, r() - 0.5, r() - 0.5, r()], i * 7);
    return a;
  }, []);
  const sprite = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  const positions = useMemo(() => {
    const p = new Float32Array(N * 3);
    const burst = N * 0.6;
    for (let i = 0; i < N; i += 1) {
      const o = i * 7;
      const [x0, y0, z0, vx, vy, vz, w] = [0, 1, 2, 3, 4, 5, 6].map((k) => seed[o + k] as number) as [
        number, number, number, number, number, number, number,
      ];
      if (i < burst) {
        if (sinceImpact < 0) {
          p[i * 3 + 1] = -10;
          continue;
        }
        const side = i % 2 === 0 ? 0.74 : -0.74;
        const ang = (w * 2 - 1) * Math.PI;
        const speed = 0.9 + (vx + 0.5) * 2;
        const d = (speed * (1 - Math.exp(-3.2 * sinceImpact))) / 3.2;
        p[i * 3] = side + Math.cos(ang) * d * 0.5;
        p[i * 3 + 1] = 0.01 + ((vy + 0.5) * 0.6 * (1 - Math.exp(-2.4 * sinceImpact))) / 1.2;
        p[i * 3 + 2] = Math.sin(ang) * d;
      } else {
        const drift = t * 0.03;
        p[i * 3] = x0 + vx * drift * 2;
        p[i * 3 + 1] = 0.02 + ((((y0 + drift * (0.4 + w)) % 1.2) + 1.2) % 1.2);
        p[i * 3 + 2] = z0 + vz * drift * 2;
      }
    }
    return p;
  }, [seed, t, sinceImpact]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  const burstFade = sinceImpact >= 0 ? Math.max(0, 1 - sinceImpact / 1.4) : 0;
  return (
    <points geometry={geo}>
      <pointsMaterial
        map={sprite}
        color={color}
        size={0.004}
        sizeAttenuation
        transparent
        depthWrite={false}
        opacity={amount * (0.35 + burstFade * 0.5)}
      />
    </points>
  );
}

/** Onde a anilha da ponta toca o chão: a onda de choque nasce ali. */
export const IMPACT_X = 0.74;

/** A onda de choque no chão: dois anéis da cor de ação correndo para fora. */
function FloorRing({ t, color }: { t: number; color: THREE.Color }) {
  const geo = useMemo(() => new THREE.RingGeometry(0.975, 1, 192).rotateX(-Math.PI / 2), []);
  if (t < 0 || t > 0.6) return null;
  const k = expoOut(t / 0.6);
  const rings = [
    { r: 0.25 + 7 * k, o: 1 - t / 0.6 },
    { r: 0.2 + 4.2 * k, o: 0.5 * (1 - t / 0.6) },
  ];
  return (
    <>
      {rings.map((g, i) => (
        <mesh key={i} geometry={geo} position={[IMPACT_X, 0.002, 0]} scale={[g.r, 1, g.r]}>
          <meshBasicMaterial color={color} transparent opacity={g.o} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ cena */

function Rig({ s, pal }: { s: WorldState; pal: Palette }) {
  const { camera, scene, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...s.cam.pos);
    cam.fov = s.cam.fov;
    cam.near = 0.02;
    cam.far = 40;
    if (s.cam.shift) {
      const [sx, sy] = s.cam.shift;
      cam.setViewOffset(size.width, size.height, -sx * size.width, -sy * size.height, size.width, size.height);
    } else {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
    cam.lookAt(...s.cam.target);
    const bg = pal.page.clone().lerp(pal.warm, s.warm);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 4.5, 11);
  });
  return null;
}

/**
 * O EffectComposer só nasce num segundo render do React (estado criado num efeito) e, até
 * lá, segura o desenho normal: num quadro renderizado sozinho, nada sairia. Isto segura a
 * captura do Remotion até o composer ter os passes montados e então desenha o quadro.
 */
export function RenderWhenComposerReady({ composer, passes }: { composer: React.RefObject<EffectComposerImpl | null>; passes: number }) {
  const advance = useThree((st) => st.advance);
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    const handle = delayRender('Esperando o pós-processamento montar');
    let timer = 0;
    let done = false;
    const check = () => {
      const c = composer.current;
      if (c && c.passes.length >= passes) {
        advance(performance.now());
        done = true;
        continueRender(handle);
        return;
      }
      timer = window.setTimeout(check, 16);
    };
    check();
    return () => {
      window.clearTimeout(timer);
      if (!done) continueRender(handle);
    };
  }, [advance, composer, passes, delayRender, continueRender]);
  return null;
}

/** Foco da lente: alvo no mundo, faixa nítida em metros e tamanho do bokeh. */
function Focus({ s }: { s: WorldState }) {
  const ref = useRef<DepthOfFieldEffect>(null);
  useLayoutEffect(() => {
    const dof = ref.current;
    if (!dof) return;
    dof.target = new THREE.Vector3(...s.focus);
    dof.cocMaterial.focusRange = s.focusRange;
    dof.bokehScale = s.bokeh;
  });
  return <DepthOfField ref={ref} focusRange={s.focusRange} bokehScale={s.bokeh} resolutionScale={0.75} />;
}

function Scene({ s, t }: { s: WorldState; t: number }) {
  const pal = useMemo(palette, []);
  const tex = useMemo(() => {
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans');
    return paintedPlate(`#${pal.paint.getHexString()}`, `#${pal.bare.getHexString()}`, font);
  }, [pal]);
  const plateGeo = useMemo(plateGeometry, []);
  const plateMat = useMemo(() => plateMaterial(tex), [tex]);
  const floor = useMemo(() => concrete(42), []);
  const floorColor = pal.floor.clone().lerp(pal.warm, s.warm * 0.6);
  const composer = useRef<EffectComposerImpl | null>(null);
  return (
    <>
      <Rig s={s} pal={pal} />
      {/* Estúdio: softbox grande em cima, janela à esquerda, recorte atrás e um rebatedor. */}
      <Environment resolution={512} frames={1}>
        <Lightformer form="rect" intensity={2.2} color={pal.warm} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={4} color={pal.warm} position={[-6, 2.2, 1.5]} rotation={[0, Math.PI / 2, 0]} scale={[6, 3.5, 1]} />
        <Lightformer form="rect" intensity={1.4} color={pal.page} position={[5, 1.6, -4]} rotation={[0, -Math.PI / 3, 0]} scale={[5, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.6} color={pal.page} position={[0, 1, 6]} rotation={[0, Math.PI, 0]} scale={[8, 3, 1]} />
      </Environment>
      <directionalLight
        position={[-3.2, 4.2, 1.6]}
        intensity={1.6}
        color={pal.warm}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-radius={14}
        shadow-blurSamples={20}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.15} color={pal.page} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color={floorColor}
          map={floor.map}
          bumpMap={floor.bump}
          bumpScale={0.35}
          roughnessMap={floor.rough}
          roughness={1}
          metalness={0}
        />
      </mesh>
      <ContactShadows position={[0, 0.0015, 0]} scale={7} resolution={1024} blur={2.2} far={1.2} opacity={0.55} color={pal.shadow} />

      <Barbell y={s.barY} bend={s.bend} plateGeo={plateGeo} plateMat={plateMat} steel={pal.steel} />
      {s.solo.visible ? (
        <Plate geo={plateGeo} mat={plateMat} position={s.solo.pos} rotation={[s.solo.rot[0], s.solo.rot[1] - Math.PI / 2, s.solo.rot[2]]} />
      ) : null}
      {s.dust > 0 ? <Dust t={t} sinceImpact={s.sinceImpact} amount={s.dust} color={pal.page} /> : null}
      <FloorRing t={s.sinceImpact} color={pal.brand} />

      <EffectComposer ref={composer} multisampling={4}>
        <N8AO aoRadius={0.4} distanceFalloff={0.6} intensity={2.2} quality="high" halfRes={false} color={pal.shadow} />
        <Focus s={s} />
        <Bloom luminanceThreshold={0.92} intensity={0.12} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
      {/* Render, oclusão (N8AO) e o passe com foco, brilho e tom. */}
      <RenderWhenComposerReady composer={composer} passes={3} />
    </>
  );
}

/**
 * Margem do canvas além do quadro: o desfoque de CSS lê transparência na borda e escurecia
 * as beiradas. Com a margem, a borda borrada fica fora da tela.
 */
export const PAD = 48;

export function World({ s, t, width, height }: { s: WorldState; t: number; width: number; height: number }) {
  return (
    <ThreeCanvas
      width={width + 2 * PAD}
      height={height + 2 * PAD}
      dpr={1}
      shadows="variance"
      gl={{ antialias: false, preserveDrawingBuffer: true }}
      style={{ position: 'absolute', left: -PAD, top: -PAD, filter: s.blur > 0.1 ? `blur(${s.blur}px)` : undefined }}
    >
      <Scene s={s} t={t} />
    </ThreeCanvas>
  );
}
