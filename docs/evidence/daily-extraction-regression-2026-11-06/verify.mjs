// Offline, read-only verification of saved artifacts. No model calls.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const dir = new URL('./', import.meta.url);
const root = new URL('../../../', dir);
const read = async url => JSON.parse(await readFile(url, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = await read(new URL('manifest-sha256.json', dir));
const files = ['protocol.json', 'response-1.json', 'response-2.json', 'response-3.json', 'response-4.json', 'results.json', 'verify.mjs'];
assert.deepEqual(Object.keys(manifest).sort(), files.sort());
for (const [file, expected] of Object.entries(manifest)) {
  assert.equal(hash(await readFile(new URL(file, dir))), expected, file);
}
const p = await read(new URL('protocol.json', dir));
assert.equal(p.derivedFromSanitizedSource, true);
assert.match(p.sourceProtocolSha256, /^[a-f0-9]{64}$/);
assert.equal(p.model, 'qwen3:14b-q4_K_M');
assert.equal(p.think, false);
assert.equal(p.temperature, 0);
assert.equal(p.executionCount, 4);
assert.equal(p.runsPerInput, 1);
assert.equal(p.ollamaVersion, '0.40.14');
assert.equal(p.baselineOllamaVersion, '0.40.13');
for (const [key, path] of Object.entries(p.references)) {
  assert.equal(hash(await readFile(new URL(path, root))), p.referenceSha256[key], key);
}
const { buildAdviceDailyEvidence, buildOllamaDailyExtractionRequest } = await import(new URL(p.references.validator, root));
const baseline = await read(new URL(p.references.baselineProtocol, root));
const revised = await read(new URL(p.references.revisedProtocol, root));
const trials = (await readFile(new URL(p.references.baselineTrials, root), 'utf8')).trim().split('\n').map(JSON.parse);
const results = await read(new URL('results.json', dir));
assert.equal(results.calls, 4);
assert.equal(results.results.length, 4);
assert.equal(p.inputs.length, 4);
assert.equal(new Set(p.inputs.map(x => x.inputId)).size, 4);
let matchedBaselineResponses = 0;
for (const [index, input] of p.inputs.entries()) {
  const original = baseline.inputs.find(x => x.inputId === input.inputId);
  assert(original);
  for (const key of ['date', 'content', 'sha256']) assert.equal(input[key], original[key]);
  assert.deepEqual(input.expected, original.expected);
  assert.equal(hash(input.content), input.sha256);
  assert(!revised.inputs.some(x => x.content === input.content));
  const request = buildOllamaDailyExtractionRequest(input, p.model);
  assert.equal(hash(JSON.stringify(request)), input.requestSha256);
  assert.equal(request.messages[0].content, revised.templates.revised.messages[0].content);
  const response = await read(new URL(input.responseFile, dir));
  assert.equal(response.model, p.model);
  assert.equal(response.done, true);
  const extracted = JSON.parse(response.message.content);
  const validated = buildAdviceDailyEvidence(input, extracted);
  assert(validated.every(x => x.date === input.date));
  assert.deepEqual(extracted, input.expected);
  const result = results.results[index];
  assert.equal(result.inputId, input.inputId);
  assert.equal(result.content, input.content);
  assert.equal(result.calls, 1);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.machinePass, true);
  assert.equal(result.semanticPass, true);
  assert.equal(result.classification, '維持');
  assert.deepEqual(validated, result.validated);
  const previous = trials.filter(x => x.inputId === input.inputId && x.variant === p.baselineVariant);
  assert.equal(previous.length, 3);
  for (const trial of previous) {
    assert.equal(trial.machineSuccess, true);
    assert.equal(hash(trial.httpResponseBody), trial.responseSha256);
    const oldResponse = JSON.parse(trial.httpResponseBody);
    assert.deepEqual(buildAdviceDailyEvidence(input, JSON.parse(oldResponse.message.content)), trial.validated);
    assert.deepEqual(validated, trial.validated);
    matchedBaselineResponses++;
  }
}
console.log(JSON.stringify({ trials: 4, machinePass: 4, maintained: 4, improved: 0, regressed: 0, incomparable: 0, matchedBaselineResponses, manifestFiles: files.length, offline: true }, null, 2));
// sourceProtocolSha256 records provenance; its preimage is intentionally not retained here.
