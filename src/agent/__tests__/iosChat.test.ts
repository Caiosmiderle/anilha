import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chatArtifacts, chatCases } from '../../../scripts/ios-chat-source';

describe('chat nativo: especificação executada pelo PWA', () => {
  it('mantém os vetores de ferramentas, contexto e escrita gerados das funções reais', async () => {
    const fixture = JSON.parse(readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/chat.json', 'utf8'));
    expect(fixture).toEqual(await chatArtifacts());
    expect(fixture.tools).toHaveLength(25);
    expect(fixture.contexts).toHaveLength(12);
    expect(fixture.applications.length).toBeGreaterThan(9);
    expect(fixture.tools.find((v: { name: string }) => v.name === 'teto').expected.proposal.risks[0].text).toContain('acima de');
  });
  it('envia articulações apenas com consentimento e exclui notas locais', () => {
    const { contexts } = chatCases();
    for (const c of contexts) {
      expect(c.text.includes('Articulações a poupar: joelho.')).toBe(c.expected.health);
      expect(c.text).not.toContain('local-note-canary');
      expect(c.text).not.toContain('fiction-chat');
    }
    expect(contexts.filter(c => c.expected.returnMode)).toHaveLength(3);
  });
  it('captura proposta local no demo nativo e abre a tela pela aba Hoje', () => {
    const hoje = readFileSync('ios/App/Telas/HojeView.swift', 'utf8');
    expect(hoje).toContain('ChatWalterView(conta: conta)');
    expect(hoje).not.toContain('Site.url("/plano/pedir")');
    const demo = readFileSync('ios/App/Demo/ModoDemo.swift', 'utf8');
    expect(demo).toContain('case "chat": ChatWalterView');
    expect(readFileSync('ios/scripts/capture-screenshots.sh', 'utf8')).toContain('revisao chat historico');
    const source = readFileSync('ios/App/Servicos/ContaStore.swift', 'utf8');
    expect(source).toContain('AgentChat.execute("editar_ficha", input: chatInput');
    expect(readFileSync('ios/project.yml', 'utf8')).toMatch(/MARKETING_VERSION: "0\.(1[2-9]|[2-9]\d)\./);
  });
});
