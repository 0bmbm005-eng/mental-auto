import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildAdviceDailyEvidence} from './build/index.js';
const dir=new URL('./',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,dir),'utf8')),hash=x=>createHash('sha256').update(x).digest('hex');
const p=await read('protocol.json'),trials=(await readFile(new URL('trials.jsonl',dir),'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(trials.length,93);assert.equal(new Set(trials.map(x=>`${x.series}/${x.id}`)).size,93);
for(const x of p.inputs){assert.equal(hash(x.content),x.sha256);const group=trials.filter(t=>t.inputId===x.inputId&&t.series===x.series);assert.deepEqual(group.map(t=>t.run),[1,2,3]);for(const t of group){const request={...p.requestTemplate,messages:[...p.requestTemplate.messages,{role:'user',content:JSON.stringify({content:x.content})}]};assert.equal(hash(JSON.stringify(request)),t.requestSha256);assert.equal(hash(t.httpResponseBody),t.responseSha256);assert.equal(t.httpStatus,200);assert(t.machineSuccess);assert.equal(t.calls,1);const outer=JSON.parse(t.httpResponseBody);assert.equal(outer.model,p.model);assert.deepEqual(buildAdviceDailyEvidence(x,JSON.parse(outer.message.content)),t.validated);}}
await writeFile(new URL('readback-verification.json',dir),JSON.stringify({trials:93,distinctInputs:31,requestReconstruction:true,responseHashes:true,outerAndInnerJson:true,providerEvidenceRevalidated:true,inputHashes:true,uniqueSeriesAndTrialIds:true,exactlyThreeRunsPerInput:true},null,2)+'\n',{flag:'wx'});console.log('93 records verified');
