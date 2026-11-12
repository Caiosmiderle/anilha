/**
 * Writes the agent function's instructions and tools from src/agent.
 * Run after changing src/agent/prompt.ts or tools.ts: npx tsx scripts/agente-config.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AGENT_CONFIG_PATH, agentConfigSource } from '../src/agent/config';

mkdirSync(dirname(AGENT_CONFIG_PATH), { recursive: true });
writeFileSync(AGENT_CONFIG_PATH, agentConfigSource());
console.log(AGENT_CONFIG_PATH);
