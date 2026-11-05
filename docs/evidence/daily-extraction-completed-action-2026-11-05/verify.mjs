// Read-only verification: no Ollama calls. Semantic comparison uses previously fixed tolerances.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildAdviceDailyEvidence } from './build/index.js';
const dir = new URL('./', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, dir), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const p = await read('protocol.json');
const trials = (await readFile(new URL('trials.jsonl', dir), 'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(trials.length, 24);
function normalize(items) {
  return items.map(({ quote, kind }) => {
    quote = quote.replace(/[。、]+$/u, '').replace(/(?:ものの|ので|が)$/u, '').replace(/[。、]+$/u, '').replace(/^ただ、/u, '');
    return { quote, kind };
  });
}
const groups = {};
let machineSuccess = 0;
for (const [i, trial] of trials.entries()) {
  const { inputId, variant, run } = trial;
  assert.deepEqual({ inputId, variant, run }, p.jobs[i]);
  const input = p.inputs.find(x => x.id === inputId);
  assert.equal(hash(input.content), input.sha256);
  const template = p.templates[variant];
  assert.equal(hash(template.messages[0].content), p.promptHashes[variant]);
  const request = { ...template, messages: [...template.messages, { role: 'user', content: JSON.stringify({ content: input.content }) }] };
  assert.equal(hash(JSON.stringify(request)), trial.requestSha256);
  assert.equal(hash(trial.httpResponseBody), trial.responseSha256);
  assert.equal(trial.calls, 1);
  const key = `${inputId}/${variant}`;
  groups[key] ??= { inputId, variant, machinePass: 0, semanticPass: 0, runs: [] };
  let semanticPass = false;
  if (trial.machineSuccess) {
    assert.equal(trial.httpStatus, 200);
    const outer = JSON.parse(trial.httpResponseBody);
    assert.equal(outer.model, p.model);
    const result = buildAdviceDailyEvidence(input, JSON.parse(outer.message.content));
    assert.deepEqual(result, trial.validated);
    machineSuccess++; groups[key].machinePass++;
    semanticPass = JSON.stringify(normalize(result)) === JSON.stringify(normalize(input.expected));
    if (semanticPass) groups[key].semanticPass++;
  }
  groups[key].runs.push({ run, semanticPass, actual: trial.validated?.map(({ quote, kind }) => ({ quote, kind })) });
}
const summary = { trials: trials.length, machineSuccess, machineFailure: trials.length - machineSuccess, groups: Object.values(groups), semanticNote: 'Fixed expected quote/kind/order with only pre-existing punctuation/connective tolerance; Codex provisional semantic review, not proof of generalization.' };
console.log(JSON.stringify(summary, null, 2));
// Optional explicit local report output; default verification remains read-only.
if (process.argv.includes('--save')) await writeFile(new URL('verification.json', dir), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
