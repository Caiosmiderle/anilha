import { Check, Download } from 'lucide-react';
import { interpolate } from 'remotion';
import { Icon, Widget } from '../../../../src/ui/primitives';
import { LogoMark } from '../../../../src/ui/brand';
import { CLAMP, harborSpring } from '../anim';

/**
 * A instalação como app web, nos passos da landing (/conheca, aba iPhone com iOS 18 ou
 * anterior). Sem logo de loja e sem imitar a interface do sistema: os passos num cartão do
 * Harbor e o ícone do Anilha caindo numa tela de início neutra.
 */
const STEPS = [
  'Toque em Compartilhar, na barra do Safari.',
  'Role e toque em Adicionar à Tela de Início.',
  'Toque em Adicionar.',
];

export function InstallSteps({ f, steps }: { f: number; steps: number[] }) {
  return (
    <Widget icon={Download} pastel="sky" title="Instale o Anilha" sub="No iPhone, pelo Safari">
      <div className="hb-list" style={{ margin: '-16px -20px' }}>
        {STEPS.map((text, i) => {
          const at = steps[i] ?? 0;
          const active = f >= at && f < (steps[i + 1] ?? Infinity);
          const done = f >= (steps[i + 1] ?? Infinity);
          return (
            <div
              key={text}
              className="hb-list-row"
              style={{ background: active ? 'var(--brand-50)' : undefined, minHeight: 60 }}
            >
              <span
                className="hb-disc-sm"
                style={{
                  background: done ? 'var(--brand-deep)' : active ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                  color: done ? 'var(--ink-on-brand)' : 'var(--ink)',
                  boxShadow: active ? 'inset 0 0 0 1.5px var(--brand-500)' : undefined,
                  font: '600 15px/1 var(--font-sans)',
                }}
              >
                {done ? <Icon icon={Check} size={18} /> : i + 1}
              </span>
              <span className="hb-list-main">
                {/* O passo inteiro, sem reticências: o .hb-list-title corta numa linha. */}
                <span
                  className="hb-list-title"
                  style={{ display: 'block', whiteSpace: 'normal', overflow: 'visible', color: active ? 'var(--brand-700)' : undefined }}
                >
                  {text}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </Widget>
  );
}

/** Uma tela de início neutra: blocos sem marca, e um espaço vazio onde o Anilha cai. */
export function HomeScreen({ f, fps, dropAt }: { f: number; fps: number; dropAt: number }) {
  const drop = harborSpring(f, dropAt, fps, 520);
  const label = interpolate(f, [dropAt + 8, dropAt + 16], [0, 1], CLAMP);
  const slot = 9;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-page)', padding: '56px 26px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 22, columnGap: 18 }}>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {i === slot ? (
              f >= dropAt ? (
                <>
                  <div
                    style={{
                      transform: `translateY(${(1 - drop) * -140}px) scale(${0.7 + 0.3 * drop})`,
                      opacity: Math.min(1, drop * 3),
                      filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.08))',
                    }}
                  >
                    <div className="logo-free" style={{ width: 60, height: 60 }}>
                      <LogoMark size={60} />
                    </div>
                  </div>
                  <span className="t-caption" style={{ opacity: label, color: 'var(--ink)' }}>
                    Anilha
                  </span>
                </>
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: 14, boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' }} />
              )
            ) : (
              <>
                <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--bg-subtle)' }} />
                <div style={{ width: 36, height: 8, borderRadius: 4, background: 'var(--bg-subtle)' }} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
