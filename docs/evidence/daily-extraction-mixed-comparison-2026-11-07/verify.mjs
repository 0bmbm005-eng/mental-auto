// Verify the saved comparison without Ollama or the working-tree build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const dir = new URL('./', import.meta.url);
const root = new URL('../../../', dir);
const local = name => new URL(name, dir);
const read = async url => JSON.parse(await readFile(url, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = await read(local('manifest-sha256.json'));
const p = await read(local('protocol.json'));
const ref = key => new URL(p.references[key], root);
assert.deepEqual(Object.keys(p.references).sort(), Object.keys(p.referenceSha256).sort());
for (const key of Object.keys(p.references)) {
  assert.equal(hash(await readFile(ref(key))), p.referenceSha256[key], key);
}
const { added, cases, jobs } = await read(local('request-comparison.json'));
const trials = (await readFile(local('trials.jsonl'), 'utf8')).trimEnd().split('\n').map(JSON.parse);
const summary = await read(local('summary.json'));
const old = await read(ref('historicalProtocol'));
const baseline = await read(ref('baseline'));
const template = (await read(ref('currentTemplate'))).templates.revised;
const new12 = (await read(ref('fixture'))).cases;
const scope = (await read(ref('scopeFixture'))).cases;
const { buildAdviceDailyEvidence: validate } = await import(ref('validator'));
const ids = ['mixed-state', 'event-before-action', 'mixed-statements', 'multi-clause-wish',
  'nonperformance-and-state', 'inferred-own-action', 'completed-and-wish'];
const variants = ['current', 'candidate'];
const expectedJobs = ids.flatMap((id, i) => [1, 2, 3].flatMap(run =>
  ((i + run) % 2 ? variants : [...variants].reverse()).map(variant => ({ id, run, variant }))));
const responseName = ({ id, variant, run }, i) =>
  String(i + 1).padStart(2, '0') + '-' + id + '-' + variant + '-' + run + '-response.json';
const files = ['protocol.json', 'verify.mjs', 'request-comparison.json', 'trials.jsonl',
  'summary.json', 'environment-before.json', 'environment-after.json',
  ...expectedJobs.map(responseName)].sort();
assert.deepEqual(Object.keys(manifest).sort(), files);
assert.deepEqual((await readdir(dir)).sort(), [...files, 'manifest-sha256.json'].sort());
for (const file of files) assert.equal(hash(await readFile(local(file))), manifest[file], file);

assert.equal(p.head, '0f0723ca9dea16e3f736f9e3ceef984638a57c65');
assert.equal(p.branch, 'main');
assert.equal(p.endpoint, old.endpoint);
assert.equal(p.fixedInputs, ids.length);
assert.equal(p.runsPerVariant, 3);
assert.equal(p.executionCount, 42);
assert.equal(p.sanitize, false);
assert.equal(p.seedPolicy, 'omitted');
assert.deepEqual(p.generationSettings, { stream: false, think: false, options: { temperature: 0 } });
for (const key of Object.keys(p.generationSettings)) assert.deepEqual(template[key], p.generationSettings[key]);
const env = await read(local('environment-before.json'));
assert.deepEqual(await read(local('environment-after.json')), env);
assert.equal(env.version, '0.40.15');
assert.equal(env.model, template.model);
assert.equal(env.model, old.model);
assert.equal(env.digest, old.digest);
assert.equal(env.templateSha256, hash(old.environment.show.template));
assert.deepEqual(env.defaultParameters, old.environment.show.parameters.split('\n').map(x => x.trim()).filter(Boolean).sort());

assert.deepEqual(cases.map(x => x.id), ids);
assert.deepEqual(jobs, expectedJobs);
assert.equal(trials.length, p.executionCount);
assert.deepEqual(trials.map(({ id, run, variant }) => ({ id, run, variant })), expectedJobs);
assert(added.length > 0 && !added.includes('\n'));
for (const c of cases) {
  const mixed = c.id === 'mixed-statements';
  const fixed = (mixed ? scope : new12).find(x => x.id === c.id);
  const historical = old.inputs.find(x => mixed ? x.inputId === 'prior21/mixed-statements' :
    x.series === 'new12' && x.inputId === c.id);
  assert(fixed && historical);
  for (const key of ['content', 'expected', 'sha256']) assert.deepEqual(fixed[key], historical[key]);
  assert.equal(hash(fixed.content), fixed.sha256);
  assert.deepEqual(c.log, { date: historical.date, content: fixed.content });
  assert.deepEqual(c.expected, fixed.expected);
  if (fixed.allowedDifferences) assert.equal(c.allowedDifferences, fixed.allowedDifferences);
  validate(c.log, c.expected);
  assert.deepEqual(template.messages.map(x => x.role), ['system']);
  const current = { ...template, messages: [...template.messages,
    { role: 'user', content: JSON.stringify({ content: fixed.content }) }] };
  assert.deepEqual(c.requests.current, current);
  const prior = baseline.inputs.find(x => x.inputId === c.id);
  if (prior) assert.equal(hash(JSON.stringify(current)), prior.requestSha256);
  const candidate = structuredClone(current);
  const lines = candidate.messages[0].content.split('\n');
  const step3 = lines.findIndex(line => line.startsWith('3. '));
  assert(step3 >= 0 && lines[step3 + 1].startsWith('4. ') && !lines.includes(added));
  lines.splice(step3 + 1, 0, added);
  candidate.messages[0].content = lines.join('\n');
  assert.deepEqual(c.requests.candidate, candidate);
}

// Match the comparison's fixed allowance for punctuation and connective boundaries.
const normalize = items => items.map(({ quote, kind }) => ({
  quote: quote.replace(/[。、]+$/u, '').replace(/(?:ものの|ので|が)$/u, '')
    .replace(/[。、]+$/u, '').replace(/^ただ、/u, ''),
  kind,
}));
const computed = ids.map(id => ({ id, ...Object.fromEntries(variants.map(variant =>
  [variant, { http200: 0, machinePass: 0, contentPass: 0 }])) }));
for (const [i, trial] of trials.entries()) {
  const c = cases.find(x => x.id === trial.id);
  assert.equal(trial.requestSha256, hash(JSON.stringify(c.requests[trial.variant])));
  assert.equal(trial.responseFile, responseName(trial, i));
  const raw = await readFile(local(trial.responseFile));
  assert.equal(hash(raw), trial.responseSha256);
  assert.equal(trial.httpStatus, 200);
  assert.equal(trial.error, null);
  const response = JSON.parse(raw);
  assert.equal(response.model, env.model);
  assert.equal(response.done, true);
  const validated = validate(c.log, JSON.parse(response.message.content));
  assert.deepEqual(validated, trial.validated);
  assert.equal(trial.machinePass, true);
  const contentPass = isDeepStrictEqual(normalize(validated), normalize(c.expected));
  assert.equal(trial.contentPass, contentPass);
  const tally = computed.find(x => x.id === trial.id)[trial.variant];
  tally.http200++;
  tally.machinePass++;
  tally.contentPass += Number(contentPass);
}
assert.deepEqual(computed, summary);
for (const [i, row] of computed.entries()) {
  assert.equal(row.current.contentPass, i < 2 ? 0 : 3);
  assert.equal(row.candidate.contentPass, 3);
}
console.log(JSON.stringify({ trials: trials.length, machinePass: trials.length,
  contentPassByInput: computed.map(x => ({ id: x.id, current: x.current.contentPass,
    candidate: x.candidate.contentPass })), offline: true }, null, 2));
