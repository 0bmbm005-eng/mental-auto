// Explicit manual replay only: 4 fixed existing inputs x 2 prompts x 3 runs. No retries.
import { readFile, writeFile, appendFile, copyFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildOllamaDailyExtractionRequest, createOllamaDailyExtractionProvider } from '../../../dist/index.js';

const dir = new URL('./', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, dir), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const save = (path, value) => writeFile(new URL(path, dir), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const fixed = await read('../daily-extraction-three-examples-2026-11-03/frozen.json');
const prior = await read('../daily-extraction-few-shot-eval-2026-11-03/protocol.json');
const fixture = await read('../daily-extraction-few-shot-eval-2026-11-03/new12-expectations.json');
const ids = ['completed-and-wish', 'multi-clause-wish', 'nonperformance-and-state', 'inferred-own-action'];
const inputs = ids.map(id => ({ ...fixture.cases.find(x => x.id === id), date: '2026-11-03' }));
const revised = buildOllamaDailyExtractionRequest({ date: '2026-11-03', content: '' }, fixed.model);
const baseline = { ...revised, messages: [{ role: 'system', content: fixed.systemPrompt }] };
revised.messages = revised.messages.slice(0, 1);
assert.deepEqual(revised.format, fixed.schema);
assert.deepEqual({ stream: revised.stream, think: revised.think, options: revised.options }, fixed.generationSettings);
for (const x of inputs) assert.equal(hash(x.content), x.sha256);
const templates = { baseline, revised };
const jobs = inputs.flatMap(x => ['baseline', 'revised'].flatMap(variant => [1, 2, 3].map(run => ({ inputId: x.id, variant, run }))));
const api = async (path, body) => {
  const r = await fetch(`http://127.0.0.1:11434/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  assert(r.ok); return r.json();
};
const environment = async () => ({ tags: await api('tags'), show: await api('show', { model: fixed.model }), version: await api('version') });
const normalizedShow = x => {
  const { parameters, modelfile, ...rest } = x;
  return { ...rest, parameters: parameters.split('\n').sort(), modelfile: modelfile.split('\n').filter(l => !l.startsWith('PARAMETER ')).join('\n'), parameterLines: modelfile.split('\n').filter(l => l.startsWith('PARAMETER ')).sort() };
};
const env = await environment();
assert.equal(env.tags.models.find(x => x.name === fixed.model)?.digest, fixed.requiredModelDigest);
// Server version may change; both prompts are rerun in the same current environment.
assert.deepEqual(normalizedShow(env.show), normalizedShow(prior.environment.show));
await save('protocol.json', { frozenAt: new Date().toISOString(), model: fixed.model, endpoint: fixed.endpoint, digest: fixed.requiredModelDigest, sanitize: false, environment: env, previousServerVersion: prior.environment.version, templates, inputs, jobs, criteria: fixture.criteria, allowedDifferences: inputs[0].allowedDifferences, promptHashes: Object.fromEntries(Object.entries(templates).map(([k, v]) => [k, hash(v.messages[0].content)])), note: 'Existing known inputs only; one revision, no tuning or retries. Semantic verdict is separate from provider validation.' });
await mkdir(new URL('build/', dir));
await writeFile(new URL('build/package.json', dir), '{"type":"module"}\n');
for (const file of ['index.js', 'safe-share.js']) await copyFile(new URL(`../../../dist/${file}`, dir), new URL(`build/${file}`, dir));
await copyFile(new URL('../../../src/index.ts', dir), new URL('source-index.ts.txt', dir));
for (const job of jobs) {
  const input = inputs.find(x => x.id === job.inputId);
  const request = { ...templates[job.variant], messages: [...templates[job.variant].messages, { role: 'user', content: JSON.stringify({ content: input.content }) }] };
  let capture = {}, validated = null, error = null, calls = 0;
  const started = new Date().toISOString(), start = performance.now();
  try {
    validated = await createOllamaDailyExtractionProvider(fixed.model, fixed.endpoint, async (url, opts) => {
      assert.equal(++calls, 1);
      assert.deepEqual(JSON.parse(opts.body), buildOllamaDailyExtractionRequest(input, fixed.model));
      const body = JSON.stringify(request);
      const r = await fetch(url, { ...opts, body });
      const bytes = Buffer.from(await r.arrayBuffer());
      capture = { requestSha256: hash(body), httpStatus: r.status, httpResponseBody: bytes.toString('utf8'), responseSha256: hash(bytes) };
      return new Response(bytes, { status: r.status, headers: r.headers });
    })(input, false);
  } catch (e) { error = { message: e.message }; }
  const record = { ...job, started, elapsedMs: performance.now() - start, calls, ...capture, validated, machineSuccess: !error, error };
  await appendFile(new URL('trials.jsonl', dir), JSON.stringify(record) + '\n');
  console.log(JSON.stringify({ ...job, machineSuccess: !error, pairs: validated?.map(({ quote, kind }) => ({ quote, kind })), error }));
  if (error && capture.httpStatus !== 200) throw Error('Transport failure; stopped without retry');
}
const final = await environment();
assert.equal(final.tags.models.find(x => x.name === fixed.model)?.digest, fixed.requiredModelDigest);
assert.deepEqual(normalizedShow(final.show), normalizedShow(env.show));
assert.deepEqual(final.version, env.version);
await save('final-environment.json', final);
