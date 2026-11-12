// Weekly check of the curated YouTube videos (GitHub Action "Vídeos dos exercícios").
// YouTube oEmbed answers 200 for a video that can be embedded; 401 or 403 when it is private
// or embedding is off; 404 when it was removed. A video that stops answering 200 is marked
// in src/content/video-status.json and the app stops showing it. The file only changes when
// a video changes, so a quiet week makes no commit and no deploy. A network failure keeps
// the last known state.
import { readFileSync, writeFileSync } from 'node:fs';

// Paths can change for a test run on copies.
const HOWTO = process.env.HOWTO_PATH ?? 'src/content/howto.json';
const STATUS = process.env.STATUS_PATH ?? 'src/content/video-status.json';

const howto = JSON.parse(readFileSync(HOWTO, 'utf8'));
const before = JSON.parse(readFileSync(STATUS, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const users = new Map();
for (const [exercise, h] of Object.entries(howto)) {
  const id = (h.videoId ?? '').trim();
  if (!id) continue;
  users.set(id, [...(users.get(id) ?? []), exercise]);
}

const after = {};
const changed = [];
for (const [id, exercises] of users) {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  let ok;
  let reason;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
    );
    ok = res.ok;
    if (!ok)
      reason =
        res.status === 401 || res.status === 403
          ? 'privado ou com incorporação desligada'
          : res.status === 404
            ? 'removido ou inexistente'
            : res.status === 400
              ? 'id inválido'
              : `resposta ${res.status}`;
  } catch {
    // No network: keep what was known.
    if (before[id]) after[id] = before[id];
    continue;
  }
  const prev = before[id];
  if (prev && prev.ok === ok && (prev.reason ?? null) === (reason ?? null)) after[id] = prev;
  else {
    after[id] = { ok, since: today, ...(reason ? { reason } : {}) };
    changed.push(`${id} (${exercises.join(', ')}): ${ok ? 'voltou' : reason}`);
  }
}

const sorted = Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b)));
const text = JSON.stringify(sorted, null, 2) + '\n';
if (text !== readFileSync(STATUS, 'utf8')) writeFileSync(STATUS, text);
console.log(`${users.size} vídeos checados.`);
console.log(changed.length ? `Mudou:\n${changed.join('\n')}` : 'Nada mudou.');
