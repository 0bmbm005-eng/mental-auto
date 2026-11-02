import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildOllamaDailyExtractionRequest,createOllamaDailyExtractionProvider} from './build/index.js';
const root='/private/tmp/mental-auto-qwen3-compare.zmbgyfyp',repo='/Users/kei/projects/mental-auto',model='qwen3:14b-q4_K_M',endpoint='http://127.0.0.1:11434/api/chat';
const hash=x=>createHash('sha256').update(x).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(p,x)=>writeFile(`${root}/${p}`,typeof x==='string'?x:JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const previous=await read(`${root}/baseline.json`),smoke=await read(`${root}/initial-smoke/environment.json`),hashes=await read(`${root}/hashes.json`);
async function checkHashes(){for(const [p,h] of Object.entries(hashes))assert.equal(hash(await readFile(p.startsWith('build/')?`${root}/${p}`:`${repo}/${p}`)),h,p);}
await checkHashes();assert.equal(hash(await readFile(`${root}/expectations.json`)),hash(await readFile(`${repo}/test/fixtures/daily-extraction-scope-expectations.json`)));
for(const x of previous.inputs){assert.equal(hash(x.content),x.sha256);const req=buildOllamaDailyExtractionRequest({date:x.date,content:x.content},model,false),old=JSON.parse(x.requestBody);assert.deepEqual({...req,model:old.model},old);}
const reused=previous.inputs.find(x=>x.inputId==='D-2026-10-03');
const smokeRequest=JSON.parse(await readFile(`${root}/trials/D-2026-10-03-1/request-body.txt`,'utf8'));
assert.deepEqual(smokeRequest,buildOllamaDailyExtractionRequest({date:reused.date,content:reused.content},model,false));
assert.equal((await read(`${root}/trials/D-2026-10-03-1/result.json`)).modelDigest,smoke.model.digest);
const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:11434/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);assert(r.ok);return r.json();};
async function env(){return {tags:await api('tags'),show:await api('show',{model}),version:await api('version'),ps:await api('ps'),node:process.version,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};}
const e=await env();assert.equal(e.tags.models.find(x=>x.name===model).digest,smoke.model.digest);assert.deepEqual(e.version,smoke.version);assert.equal(e.node,smoke.node);assert.deepEqual(e.show,smoke.show);
assert.equal(e.tags.models.find(x=>x.name==='qwen3.5:9b').digest,previous.environment.tags.models.find(x=>x.name==='qwen3.5:9b').digest);
await save('environment.json',e);await save('reuse-verification.json',{reusedTrial:'D-2026-10-03-1',requestIdentical:true,sourceAndBuildHashesIdentical:true,modelDigest:smoke.model.digest,inputSha256:reused.sha256,prior63RequestFieldsIdenticalExceptModel:true});
const samples=[];function sample(){const s={time:new Date().toISOString()};for(const [key,cmd,args] of [['vm','vm_stat',[]],['swap','sysctl',['vm.swapusage']],['processes','ps',['-axo','pid,rss,comm']]])try{s[key]=execFileSync(cmd,args,{encoding:'utf8'});}catch(e){s[key]={error:e.message};}samples.push(s);}
sample();const timer=setInterval(sample,1000);let count=0;
try{
for(const x of previous.inputs)for(let run=1;run<=3;run++){
 if(x.inputId==='D-2026-10-03'&&run===1)continue;
 await checkHashes();const id=`${x.inputId}-${run}`,base=`trials/${id}`;await mkdir(`${root}/${base}`);
 const log={date:x.date,content:x.content},req=buildOllamaDailyExtractionRequest(log,model,false);await save(`${base}/request-preview.json`,req);
 let stage='harness',calls=0,httpStatus=null,transportFailure=false,error=null,result=null,stop=false;
 const started=new Date().toISOString(),t=performance.now();
 try{result=await createOllamaDailyExtractionProvider(model,endpoint,async(url,opts)=>{
 assert.equal(++calls,1);assert.equal(url,endpoint);assert.equal(opts.body,JSON.stringify(req));
 await save(`${base}/request-body.txt`,opts.body);await save(`${base}/request-http.json`,{url,method:opts.method,headers:opts.headers,sha256:hash(opts.body)});
 stage='transport';let response;try{response=await fetch(url,opts);}catch(e){transportFailure=true;throw e;}
 stage='capture';httpStatus=response.status;const bytes=Buffer.from(await response.arrayBuffer());await save(`${base}/http-response-body.txt`,bytes.toString('utf8'));await save(`${base}/http-response.json`,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers),sha256:hash(bytes)});
 try{const outer=JSON.parse(bytes.toString('utf8'));if(typeof outer.message?.content==='string')await save(`${base}/model-content.txt`,outer.message.content);}catch(e){if(e.code)throw e;}
 stage='provider-validation';return new Response(bytes,{status:response.status,headers:response.headers});})(log,false);await save(`${base}/validated.json`,result);
 }catch(e){error={name:e.name,message:e.message,stack:e.stack,stage};stop=transportFailure||httpStatus!==200||stage==='harness'||stage==='capture';await save(`${base}/error.json`,error);}
 const info={id,series:x.series,inputId:x.inputId,run,started,finished:new Date().toISOString(),elapsedMs:performance.now()-t,httpStatus,machineSuccess:!error,error,stop,calls,modelDigest:smoke.model.digest};await save(`${base}/result.json`,info);count++;console.log(JSON.stringify({count,id,success:!error,elapsedMs:info.elapsedMs,stop}));
 if(stop)throw Error(`Stopped after ${id}`);
}
}finally{clearInterval(timer);sample();await save('memory-samples.json',samples);await save('completion.json',{newTrials:count});}
await checkHashes();const final=await env();assert.equal(final.tags.models.find(x=>x.name===model).digest,smoke.model.digest);await save('final-environment.json',final);
console.log('completed 62 new + 1 reused');
