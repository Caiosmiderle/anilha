// Offline character heuristic, never a token-count API or model request.
import { readFile } from 'node:fs/promises';
import {
  ANALYSIS_SYSTEM,
  analysisTool,
  CATALOG_IDS,
} from '../supabase/functions/analise-treino/contract.generated.ts';
const fixture = JSON.parse(
  await readFile('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/analysis.json', 'utf8'),
);
const table = await readFile('scripts/agente-avaliar.ts', 'utf8');
const price = table.split('\n').find((line) => line.includes("key: 'haiku-medio'"));
if (!price) throw new Error('Project Haiku price row missing');
const inputPrice = Number(price.match(/inp:\s*([0-9.]+)/)?.[1]);
const outputPrice = Number(price.match(/out:\s*([0-9.]+)/)?.[1]);
const small = fixture.contexts[0].expected;
const expand = (items) =>
  Array.from({ length: 8 }, (_, slot) => ({ ...items[slot % items.length], slot }));
const typical = {
  ...small,
  items: expand(small.items),
  previous: small.previous.map((p) => ({ ...p, items: expand(p.items) })),
};
for (const [scenario, context] of [
  ['fixture_2_exercises', small],
  ['estimate_8_exercises', typical],
]) {
  const characters =
    ANALYSIS_SYSTEM.length +
    JSON.stringify(analysisTool(CATALOG_IDS)).length +
    JSON.stringify(context).length;
  const estimatedInputTokens = Math.ceil(characters / 4);
  const estimatedOutputTokens = 300;
  console.log(
    JSON.stringify({
      scenario,
      characters,
      estimatedInputTokens,
      estimatedOutputTokens,
      inputUSDPerMillion: inputPrice,
      outputUSDPerMillion: outputPrice,
      estimatedUSD: (estimatedInputTokens * inputPrice + estimatedOutputTokens * outputPrice) / 1e6,
    }),
  );
}
