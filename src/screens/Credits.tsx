import { mediaCredits } from '../content/howto';
import { Widget } from '../ui/primitives';

/**
 * Créditos e licenças: where each piece of the app comes from. Media of the exercises
 * lists every source in use with author and license; the rest is fixed.
 */
const SOFTWARE: [string, string, string][] = [
  ['React e React DOM', 'MIT', 'https://react.dev'],
  ['React Router', 'MIT', 'https://reactrouter.com'],
  ['Dexie', 'Apache 2.0', 'https://dexie.org'],
  ['Supabase JS', 'MIT', 'https://supabase.com'],
  ['Lucide (ícones)', 'ISC', 'https://lucide.dev'],
  ['Workbox', 'MIT', 'https://developer.chrome.com/docs/workbox'],
];

export default function Credits() {
  const media = mediaCredits();
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Créditos e licenças</h1>
          <p className="page-sub">De onde vem cada parte do Anilha.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <Widget title="Imagens dos exercícios">
            {media.length ? (
              <dl className="data-list">
                {media.map((m) => (
                  <div key={`${m.fonte}|${m.licenca}`} className="data-item">
                    <dt>{m.fonte}</dt>
                    <dd>
                      {m.atribuicao ? (
                        <>
                          <a
                            className="hb-btn-link"
                            href={m.origem ?? m.licencaUrl}
                            target="_blank"
                            rel="noopener"
                          >
                            {m.atribuicao}
                          </a>
                          .{' '}
                        </>
                      ) : null}
                      {m.autor}.{' '}
                      <a className="hb-btn-link" href={m.licencaUrl} target="_blank" rel="noopener">
                        {m.licenca}
                      </a>
                      . {m.exercises} {m.exercises === 1 ? 'exercício' : 'exercícios'}.
                      {m.origem ? (
                        <>
                          {' '}
                          <a className="hb-btn-link" href={m.origem} target="_blank" rel="noopener">
                            Página da fonte
                          </a>
                        </>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="t-regular t-muted" style={{ margin: 0 }}>
                Ainda não há imagens de outras fontes no app. Quando houver, cada fonte aparece aqui
                com autor e licença.
              </p>
            )}
            <p className="t-caption" style={{ margin: 'var(--space-3) 0 0' }}>
              As imagens ficam no armazenamento do próprio Anilha, copiadas com a licença que a
              fonte permite; nada é carregado do site de terceiros.
            </p>
          </Widget>

          <Widget title="Dicas e vídeos">
            <div className="stack-sm">
              <p className="t-regular" style={{ margin: 0 }}>
                As dicas e os erros comuns de cada exercício foram escritos pela equipe do Anilha.
              </p>
              <p className="t-regular" style={{ margin: 0 }}>
                Os vídeos são do YouTube, de cada canal, escolhidos um a um. O player só carrega
                quando você toca e usa o modo de privacidade do YouTube (youtube-nocookie).
              </p>
            </div>
          </Widget>
        </div>

        <div className="stack">
          <Widget title="Software">
            <dl className="data-list">
              {SOFTWARE.map(([name, license, url]) => (
                <div key={name} className="data-item">
                  <dt>{name}</dt>
                  <dd>
                    Licença {license}.{' '}
                    <a className="hb-btn-link" href={url} target="_blank" rel="noopener">
                      Site
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </Widget>
        </div>
      </div>
    </>
  );
}
