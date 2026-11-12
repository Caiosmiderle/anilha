import base from './playwright.config';

// Same local tests/build; only replace the tsx loader when it cannot start.
export default {
  ...base,
  webServer: (base.webServer as { command: string }[]).map((server, index) =>
    index === 0
      ? { ...server, command: 'node scripts/local-api-node.mjs --port 54329 --seed' }
      : server,
  ),
};
