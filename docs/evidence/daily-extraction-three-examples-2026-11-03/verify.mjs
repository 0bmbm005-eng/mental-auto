// Read-only verification. Does not call Ollama or write files.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const artifact=new URL('./frozen.json',import.meta.url);
const frozen=JSON.parse(await readFile(artifact,'utf8'));
const buildPath=process.argv[2];
assert(buildPath,'Usage: node verify.mjs /absolute/path/to/build/index.js');
const {buildOllamaDailyExtractionRequest}=await import(pathToFileURL(buildPath));
// Empty content is only for inspecting the request builder, not an evaluation case.
const r=buildOllamaDailyExtractionRequest({date:'2026-11-03',content:''},frozen.model,false);
const settings={stream:r.stream,think:r.think,options:r.options};
assert.equal(r.messages[0].content,frozen.systemPrompt);
assert.deepEqual(r.format,frozen.schema);
assert.deepEqual(settings,frozen.generationSettings);
assert.equal(r.model,frozen.model);
const hash=x=>createHash('sha256').update(x).digest('hex');
for(const [key,value] of Object.entries({systemPrompt:r.messages[0].content,schema:JSON.stringify(r.format),generationSettings:JSON.stringify(settings)}))assert.equal(hash(value),frozen.hashes[key],key);
console.log(JSON.stringify({verified:true,hashes:frozen.hashes},null,2));
