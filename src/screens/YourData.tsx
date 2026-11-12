import { Download, FileSpreadsheet, MessageSquare, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../app/account';
import { useExerciseMap, useRoutineItems, useRoutines, useToday } from '../data/hooks';
import { exportJson, exportRunsCsv, exportSetsCsv, importFile } from '../data/exportImport';
import { fichasFileName, fichasFor, fichasXlsx } from '../lib/fichasSheet';
import { savedMessage, saveFile } from '../lib/files';
import { useToast } from '../ui/overlays';
import { Button, Widget } from '../ui/primitives';
import { DeleteAccountSheet } from './parts/DeleteAccountSheet';

/**
 * Seus dados: what the app keeps, what for, and the ways to take it out or erase it, in
 * plain words. Legal bases are left to the policy, under legal review.
 */
const KEPT: [string, string][] = [
  [
    'Conexão com o CRUNNING',
    'Resumos feitos e planejados para coordenar corrida e força. Revogar não apaga o histórico recebido.',
  ],
  ['E-mail', 'Para entrar na conta e responder o que você pedir.'],
  [
    'Nome e sobrenome',
    'O app chama você pelo primeiro nome; o nome completo aparece para amigos, grupos e convites.',
  ],
  [
    'Respostas do plano',
    'Objetivo, foco, nível, dias, tempo, local e divisão: montam e ajustam o seu plano.',
  ],
  ['Faixa de idade', 'Ajusta o começo do plano. A data de nascimento não é pedida.'],
  ['Gênero, se você informar', 'Só um ajuste pequeno de volume. Pode ficar em branco.'],
  [
    'Treinos e corridas',
    'Séries, cargas, repetições, notas e corridas: o seu histórico e a progressão.',
  ],
  [
    'Dados de saúde, só com a sua permissão',
    'Peso, medidas, dores e articulações a poupar. Desligar a permissão apaga esses dados.',
  ],
  ['Amigos e grupos', 'Quem você adicionou e o que escolheu mostrar a eles.'],
  ['Lembretes', 'O horário e o endereço técnico do aparelho, para os avisos que você ligou.'],
  ['O que você aceitou', 'Quando aceitou os termos e a permissão de saúde, e em qual versão.'],
  ['Erros do app', 'A mensagem técnica do erro e a tela, para corrigir falhas.'],
];

export default function YourData() {
  const { email } = useAccount();
  const today = useToday();
  const routines = useRoutines();
  const routineItems = useRoutineItems();
  const exMap = useExerciseMap();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const stamp = today.replace(/-/g, '');

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Seus dados</h1>
          <p className="page-sub">O que o Anilha guarda, para quê, e como levar ou apagar.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <Widget title="O que guardamos e por quê">
            <dl className="data-list">
              {KEPT.map(([what, why]) => (
                <div key={what} className="data-item">
                  <dt>{what}</dt>
                  <dd>{why}</dd>
                </div>
              ))}
            </dl>
          </Widget>
          <Widget title="O que não pedimos">
            <p className="t-regular" style={{ margin: 0 }}>
              Data de nascimento, documento, telefone, endereço e localização. Nada é vendido nem
              usado para anúncio.
            </p>
          </Widget>
        </div>

        <div className="stack">
          <Widget title="Levar seus dados" sub="Tudo seu: leve para onde quiser">
            <div className="stack-sm">
              <Button
                variant="outline"
                icon={Download}
                onClick={async () => saveFile(await exportJson(email), `anilha-${stamp}.json`)}
              >
                Exportar tudo (JSON)
              </Button>
              {/* Montada dentro do toque, sem esperar nada: o iPhone só abre o menu assim. */}
              <Button
                variant="outline"
                icon={FileSpreadsheet}
                disabled={exMap.size === 0}
                onClick={async () => {
                  const fichas = fichasFor(routines, routineItems);
                  if (!fichas.length) {
                    toast.show('Nenhum treino com exercícios para exportar');
                    return;
                  }
                  const msg = savedMessage(
                    await saveFile(fichasXlsx(fichas, exMap, today), fichasFileName(fichas, today)),
                  );
                  if (msg) toast.show(msg);
                }}
              >
                Exportar fichas (planilha)
              </Button>
              <Button
                variant="outline"
                icon={Download}
                onClick={async () => saveFile(await exportSetsCsv(), `anilha-series-${stamp}.csv`)}
              >
                Exportar séries (CSV)
              </Button>
              <Button
                variant="outline"
                icon={Download}
                onClick={async () =>
                  saveFile(await exportRunsCsv(), `anilha-corridas-${stamp}.csv`)
                }
              >
                Exportar corridas (CSV)
              </Button>
              <Button variant="outline" icon={Upload} onClick={() => fileRef.current?.click()}>
                Importar arquivo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hb-sr"
                aria-label="Arquivo para importar"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const r = await importFile(file);
                    toast.show(
                      r.kind === 'corridas'
                        ? `${r.rows} ${r.rows === 1 ? 'corrida importada' : 'corridas importadas'}`
                        : r.kind === 'series'
                          ? `${r.rows} ${r.rows === 1 ? 'série importada' : 'séries importadas'}`
                          : `${r.rows} registros importados`,
                    );
                  } catch (err) {
                    toast.show((err as Error).message || 'Arquivo não reconhecido', {
                      error: true,
                    });
                  }
                }}
              />
              <span className="t-caption">
                JSON do Anilha, CSV de séries ou CSV de corridas. Importar duas vezes não duplica.
              </span>
            </div>
          </Widget>

          <Widget title="Corrigir, pedir ou apagar">
            <div className="stack-sm">
              <Link to="/voce/treino" className="hb-btn hb-btn-outline">
                <Pencil size={18} aria-hidden="true" />
                Corrigir respostas do plano
              </Link>
              <Link to="/mensagens" className="hb-btn hb-btn-outline">
                <MessageSquare size={18} aria-hidden="true" />
                Pedir algo sobre seus dados
              </Link>
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Apagar conta e dados
              </Button>
              <span className="t-caption">
                Apagar tira tudo deste aparelho e do servidor, e não tem volta. Exporte antes se
                quiser guardar.
              </span>
            </div>
          </Widget>

          <p className="t-caption" style={{ margin: 0 }}>
            Texto completo, com prazos e com quem os dados são compartilhados, na{' '}
            <a className="hb-btn-link" href="/privacidade/" target="_blank" rel="noopener">
              Política de privacidade
            </a>
            .
          </p>
        </div>
      </div>

      <DeleteAccountSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </>
  );
}
