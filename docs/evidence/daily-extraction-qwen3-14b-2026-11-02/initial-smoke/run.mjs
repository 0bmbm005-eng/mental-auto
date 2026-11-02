import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildOllamaDailyExtractionRequest,createOllamaDailyExtractionProvider} from './build/index.js';
const root='/private/tmp/mental-auto-qwen3-smoke.div6o0bd',repo='/Users/kei/projects/mental-auto',model='qwen3:14b-q4_K_M',endpoint='http://127.0.0.1:11434/api/chat';
const hash=x=>createHash('sha256').update(x).digest('hex');
const save=(p,x)=>writeFile(`${root}/${p}`,typeof x==='string'?x:JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const previous=JSON.parse(await readFile(`${repo}/docs/evidence/daily-extraction-scope-eval-2026-11-02/records.json`));
const input=previous.inputs.find(x=>x.case==='D'&&x.date==='2026-10-03');
const log={date:input.date,content:input.content};assert.equal(hash(log.content),input.sha256);
const request=buildOllamaDailyExtractionRequest(log,model,false),old=JSON.parse(input.requestBody);
assert.deepEqual({...request,model:old.model},old);
assert.deepEqual(request.options,{temperature:0});assert.equal(request.think,false);assert.equal(request.stream,false);
for(const [p,h] of Object.entries(JSON.parse(await readFile(`${root}/hashes.json`))))assert.equal(hash(await readFile(p)),h);
if(process.argv[2]==='prepare'){
 await save('input.json',{...log,sha256:hash(log.content),series:'existing',inputId:input.inputId});
 await save('request-preview.json',request);
 await save('request-hashes.json',{request:hash(JSON.stringify(request)),prompt:hash(request.messages[0].content),schema:hash(JSON.stringify(request.format)),baselineIdenticalExceptModel:true});
 const body=JSON.stringify({message:{content:JSON.stringify([{quote:'原因を全部洗い出して、納得するまで考えたい。',kind:'wish'}])}});
 await mkdir(`${root}/dummy`);
 const validated=await createOllamaDailyExtractionProvider(model,endpoint,async(url,opts)=>{assert.equal(opts.body,JSON.stringify(request));await save('dummy/request.txt',opts.body);await save('dummy/response.txt',body);return new Response(body);})(log,false);
 await save('dummy/validated.json',validated);assert.deepEqual(JSON.parse(await readFile(`${root}/dummy/validated.json`)),validated);
 console.log(JSON.stringify({prepared:true,input:log,settings:request.options,think:request.think,stream:request.stream,promptSha256:hash(request.messages[0].content)}));
}else if(process.argv[2]==='run'){
 const api=async(path,body)=>{const r=await fetch('http://127.0.0.1:11434/api/'+path,body?{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:undefined);assert(r.ok);return r.json();};
 const tags=await api('tags'),version=await api('version'),show=await api('show',{model});const selected=tags.models.find(x=>x.name===model);assert(selected);
 assert.equal(tags.models.find(x=>x.name==='qwen3.5:9b')?.digest,previous.environment.tags.models.find(x=>x.name==='qwen3.5:9b').digest);
 await save('environment.json',{model:selected,show,version,tags,node:process.version,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}),generation:request.options,think:false,stream:false,seed:'unspecified',sanitized:false});
 const samples=[];
 const sample=()=>{const x={time:new Date().toISOString()};for(const [name,cmd,args] of [['vm','vm_stat',[]],['swap','sysctl',['vm.swapusage']],['processes','ps',['-axo','pid,rss,comm']]])try{x[name]=execFileSync(cmd,args,{encoding:'utf8'});}catch(e){x[name]={error:e.message};}samples.push(x);};
 sample();await save('ollama-ps-before.json',await api('ps'));
 await mkdir(`${root}/trials`);const base='trials/D-2026-10-03-1';await mkdir(`${root}/${base}`);
 let calls=0,status=null,error=null,result=null;const started=new Date().toISOString(),t=performance.now();const timer=setInterval(sample,1000);
 try{result=await createOllamaDailyExtractionProvider(model,endpoint,async(url,opts)=>{
 assert.equal(++calls,1);assert.equal(opts.body,JSON.stringify(request));await save(`${base}/request-body.txt`,opts.body);await save(`${base}/request-http.json`,{url,method:opts.method,headers:opts.headers});
 const response=await fetch(url,opts);status=response.status;const bytes=Buffer.from(await response.arrayBuffer());await save(`${base}/http-response-body.txt`,bytes.toString('utf8'));await save(`${base}/http-response.json`,{status,headers:Object.fromEntries(response.headers),sha256:hash(bytes)});
 const outer=JSON.parse(bytes.toString('utf8'));if(typeof outer.message?.content==='string')await save(`${base}/model-content.txt`,outer.message.content);
 return new Response(bytes,{status:response.status,headers:response.headers});})(log,false);await save(`${base}/validated.json`,result);
 }catch(e){error={name:e.name,message:e.message,stack:e.stack};await save(`${base}/error.json`,error);}
 finally{clearInterval(timer);}
 const elapsedMs=performance.now()-t;sample();await save('memory-samples.json',samples);await save('ollama-ps-after.json',await api('ps'));await save('tags-after.json',await api('tags'));
 for(const [p,h] of Object.entries(JSON.parse(await readFile(`${root}/hashes.json`))))assert.equal(hash(await readFile(p)),h);
 await save(`${base}/result.json`,{id:'D-2026-10-03-1',modelDigest:selected.digest,started,finished:new Date().toISOString(),elapsedMs,httpStatus:status,calls,machineSuccess:!error,error,smokeTest:true,eligibleForLaterComparison:!error});
 await save('status-after.txt',execFileSync('git',['status','-sb'],{cwd:repo,encoding:'utf8'}));
 console.log(JSON.stringify({result,error,elapsedMs,root}));if(error)process.exitCode=1;
}else throw Error('prepare or run required');
