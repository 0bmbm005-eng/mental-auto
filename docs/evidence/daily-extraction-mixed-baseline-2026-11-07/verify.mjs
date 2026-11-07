// Offline, read-only verification of the saved six-trial baseline.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const dir = new URL('./', import.meta.url);
const root = new URL('../../../', dir);
const local = name => new URL(name, dir);
const read = async url => JSON.parse(await readFile(url, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const runs = 3;
const ids = ['mixed-state', 'event-before-action'];
const responseFiles = Array.from({ length: ids.length * runs }, (_, i) => 'response-' + (i + 1) + '.json');
const files = ['protocol.json', 'results.json', 'verify.mjs', ...responseFiles].sort();
const manifest = await read(local('manifest-sha256.json'));
assert.deepEqual((await readdir(dir)).sort(), [...files, 'manifest-sha256.json'].sort());
assert.deepEqual(Object.keys(manifest).sort(), files);
for (const file of files) assert.equal(hash(await readFile(local(file))), manifest[file], file);

const p = await read(local('protocol.json'));
const reference = key => new URL(p.references[key], root);
assert.deepEqual(Object.keys(p.references).sort(), Object.keys(p.referenceSha256).sort());
for (const key of Object.keys(p.references)) {
  assert.equal(hash(await readFile(reference(key))), p.referenceSha256[key], key);
}
const fixture = await read(reference('fixture'));
const past = await read(reference('comparisonProtocol'));
const template = (await read(reference('requestProtocol'))).templates.revised;
const { buildAdviceDailyEvidence } = await import(reference('validator'));
const pastTrials = (await readFile(reference('comparisonTrials'), 'utf8')).trim().split('\n').map(JSON.parse);
const { calls, results } = await read(local('results.json'));
assert.equal(p.head, '7ab32040ee7d89d801ef3f5f1d97bbe0fafd8a6a');
assert.equal(p.branch, 'main');
assert.equal(p.statusBefore, '## main...origin/main');
assert.equal(p.ollamaVersion, '0.40.15');
assert.equal(p.baselineOllamaVersion, past.environment.version.version);
assert.equal(p.baselineVariant, 'withExamples');
assert.equal(p.endpoint, past.endpoint);
assert.equal(p.model, past.model);
assert.equal(p.digest, past.digest);
assert.equal(p.templateSha256, hash(past.environment.show.template));
assert.deepEqual(p.defaultParameters, past.environment.show.parameters.split('\n').map(line => line.trim()).filter(Boolean).sort());
assert.deepEqual(p.modelChecks, { digest: true, template: true, parameters: true });
assert.equal(p.sanitize, false);
assert.deepEqual(p.options, { temperature: 0 });
assert.equal(p.stream, false);
assert.equal(p.think, false);
assert.deepEqual(template.messages.map(x => x.role), ['system']);
for (const key of ['model', 'stream', 'think', 'options']) assert.deepEqual(template[key], p[key]);
assert.deepEqual(template.format, past.templates[p.baselineVariant].format);
assert.equal(p.runsPerInput, runs);
assert.equal(p.executionCount, responseFiles.length);
assert.equal(calls, p.executionCount);
assert.equal(results.length, calls);
assert.deepEqual(p.inputs.map(x => x.inputId), ids);

let matched = 0;
for (const [i, input] of p.inputs.entries()) {
  const fixed = fixture.cases.find(x => x.id === input.inputId);
  const original = past.inputs.find(x => x.series === 'new12' && x.inputId === input.inputId);
  assert(fixed && original);
  for (const key of ['content', 'sha256', 'expected', 'allowedDifferences']) assert.deepEqual(fixed[key], original[key]);
  assert.equal(hash(fixed.content), input.sha256);
  assert.equal(input.sha256, fixed.sha256);
  assert.equal(input.date, original.date);
  const log = { date: input.date, content: fixed.content };
  const request = { ...template, messages: [...template.messages, { role: 'user', content: JSON.stringify({ content: log.content }) }] };
  assert.equal(hash(JSON.stringify(request)), input.requestSha256);

  for (let run = 1; run <= runs; run++) {
    const index = i * runs + run - 1;
    const result = results[index];
    assert.equal(result.inputId, input.inputId);
    assert.equal(result.run, run);
    assert.equal(result.responseFile, responseFiles[index]);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.error, null);
    const response = await read(local(result.responseFile));
    assert.equal(response.model, p.model);
    assert.equal(response.done, true);
    const content = response.message.content;
    const extracted = JSON.parse(content);
    assert.deepEqual(buildAdviceDailyEvidence(log, extracted), result.validated);
    assert.equal(result.machinePass, true);
    // This failure does not depend on the allowed punctuation or connective differences.
    assert.equal(fixed.expected.length, 2);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0].quote, fixed.content);
    assert.equal(result.semanticPass, false);
    assert.equal(result.semanticReason, 'independent-statements-merged');

    const previous = pastTrials.filter(x => x.id === ['new12', p.baselineVariant, input.inputId, run].join('/'));
    assert.equal(previous.length, 1);
    assert.equal(hash(previous[0].httpResponseBody), previous[0].responseSha256);
    assert.equal(content, JSON.parse(previous[0].httpResponseBody).message.content);
    matched++;
  }
}
console.log(JSON.stringify({ trials: calls, machinePass: calls, semanticPassByInput: Object.fromEntries(ids.map(id => [id, 0])), matchedBaselineResponses: matched, offline: true }, null, 2));
