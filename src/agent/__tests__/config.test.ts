import { describe, expect, it } from 'vitest';
import onServer from '../../../supabase/functions/agente/config.ts?raw';
import { agentConfigSource } from '../config';

describe('função do agente', () => {
  it('as instruções e ferramentas do servidor são as de src/agent (rode scripts/agente-config.ts)', () => {
    expect(onServer).toBe(agentConfigSource());
  });
});
