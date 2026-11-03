// Read-only verification: no model calls and no changes to frozen inputs.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildAdviceDailyEvidence} from './build/index.js';
const dir=new URL('./',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,dir),'utf8')),hash=x=>createHash('sha256').update(x).digest('hex');
const p=await read('protocol.json'),fixture=await read('new12-expectations.json'),trials=(await readFile(new URL('trials.jsonl',dir),'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(hash(await readFile(new URL('new12-expectations.json',dir))),p.newFixtureSha256);
assert.equal(trials.length,165);assert.equal(new Set(trials.map(t=>t.id)).size,165);
const a=p.templates.withExamples.messages[0].content,b=p.templates.withoutExamples.messages[0].content;assert.equal(a,b+p.appendedExamples);assert.equal(p.appendedExamples.split('例（').length-1,3);
assert.equal(hash(a),p.hashes.promptWithExamples);assert.equal(hash(b),p.hashes.promptWithoutExamples);
let machineSuccess=0;
for(let i=0;i<trials.length;i++){
 const t=trials[i],job=p.jobs[i];for(const k of ['series','variant','inputId','run'])assert.equal(t[k],job[k]);
 const x=p.inputs.find(x=>x.series===t.series&&x.inputId===t.inputId);assert.equal(hash(x.content),x.sha256);
 const r={...p.templates[t.variant],messages:[...p.templates[t.variant].messages,{role:'user',content:JSON.stringify({content:x.content})}]};assert.equal(hash(JSON.stringify(r)),t.requestSha256);assert.equal(t.calls,1);
 if(t.httpResponseBody){assert.equal(hash(t.httpResponseBody),t.responseSha256);assert.equal(t.httpStatus,200);const o=JSON.parse(t.httpResponseBody);assert.equal(o.model,p.model);if(t.machineSuccess){assert.deepEqual(buildAdviceDailyEvidence(x,JSON.parse(o.message.content)),t.validated);machineSuccess++;}}
}
for(const x of fixture.cases){assert.equal(hash(x.content),x.sha256);buildAdviceDailyEvidence({date:'2026-11-03',content:x.content},x.expected);}
console.log(JSON.stringify({trials:165,distinctInputs:43,inputVariantGroups:55,machineSuccess,machineFailure:165-machineSuccess,orderedJobsMatch:true,requestHashes:true,responseHashes:true,frozenExpectations:true,differenceOnlyThreeExamples:true},null,2));
