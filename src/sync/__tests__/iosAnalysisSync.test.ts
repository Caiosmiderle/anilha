import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { analysisSyncArtifacts } from '../../../scripts/ios-analysis-sync-source';

it('vetores nativos usam syncAnalyses, syncPayload, mergePulled e reviewVersion reais', async () => {
  const f = await analysisSyncArtifacts();
  expect(JSON.parse(readFileSync('ios/AnilhaCore/Tests/AnilhaCoreTests/Fixtures/analysis-sync.json', 'utf8'))).toEqual(f);
  expect(f.runs[0]!.pushes[0]!.items).toHaveLength(2);
  expect(f.runs[1]!.pushes).toEqual([]);
  expect(f.runs[2]!.expected.find((e) => e.key.startsWith('analysis:'))!.value).toMatchObject({ status: 'proposed' });
  expect(f.runs[4]!.expected.find((e) => e.key.startsWith('analysis:'))!.value).toEqual({ status: 'refused' });
  expect(JSON.parse(f.wireReview.version)).toEqual([f.nativeReview.version.routine, f.nativeReview.version.items]);
});
