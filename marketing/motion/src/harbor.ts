// O Harbor UI vem direto do app: tokens, componentes e extensões entram pelo app.css, que
// importa design/harbor-ui. Nada de cor ou fonte copiada à mão no vídeo.
import '../../../src/styles/app.css';
import './motion.css';

if (typeof document !== 'undefined') {
  // O tema claro do Harbor, mesmo que o sistema do render esteja no escuro.
  document.documentElement.dataset.theme = 'light';
}

const cache = new Map<string, string>();

/** Valor de um token do Harbor, lido do CSS carregado. Token ausente é erro, não palpite. */
export function token(name: `--${string}`): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) throw new Error(`Token do Harbor ausente: ${name}`);
  cache.set(name, v);
  return v;
}

export { HARBOR } from './harborMotion';
