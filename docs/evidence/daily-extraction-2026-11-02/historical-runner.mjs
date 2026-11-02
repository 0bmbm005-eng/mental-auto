import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildOllamaDailyExtractionRequest,createOllamaDailyExtractionProvider,ADVICE_DAILY_EXTRACTION_JSON_SCHEMA} from './build/index.js';
const root='/tmp/mental-auto-daily-check.oNKLOU', repo='/Users/kei/projects/mental-auto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const save=async(p,v)=>writeFile(`${root}/${p}`,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const endpoint='http://127.0.0.1:11434/api/chat', model='qwen3.5:9b';
async function metadata(){return {commit:git('rev-parse','HEAD'),status:git('status','-sb'),node:process.version,platform:process.platform,arch:process.arch,version:await (await fetch('http://127.0.0.1:11434/api/version')).json(),tags:await (await fetch('http://127.0.0.1:11434/api/tags')).json()};}
if(process.argv[2]==='dry-run'){
 await mkdir(`${root}/dummy-records`,{recursive:true});
 const log={date:'2026-10-01',content:'ダミーで散歩した。'};
 const request=buildOllamaDailyExtractionRequest(log,model,false);
 const body=JSON.stringify({message:{content:JSON.stringify([{quote:log.content,kind:'action'}])}});
 const mock=async(url,opts)=>{
  assert.equal(opts.body,JSON.stringify(request));
  await save('dummy-records/request-body.txt',opts.body);
  await save('dummy-records/http-response-body.txt',body);
  await save('dummy-records/model-content.txt',JSON.parse(body).message.content);
  return new Response(body);
 };
 const result=await createOllamaDailyExtractionProvider(model,endpoint,mock)(log,false);
 await save('dummy-records/validated.json',result);
 assert.deepEqual(JSON.parse(await readFile(`${root}/dummy-records/validated.json`,'utf8')),result);
 assert.equal(await readFile(`${root}/dummy-records/request-body.txt`,'utf8'),JSON.stringify(request));
 assert.equal(await readFile(`${root}/dummy-records/http-response-body.txt`,'utf8'),body);
 assert.deepEqual(JSON.parse(await readFile(`${root}/dummy-records/model-content.txt`,'utf8')),[{quote:log.content,kind:'action'}]);
 await save('dummy-records/check.json',{passed:true,networkCalls:0,result});
 console.log('dummy recording/readback/provider validation passed; no network');
}else if(process.argv[2]==='prepare'){
 const env=await metadata();
 assert(env.tags.models.some(m=>m.name===model));
 await save('environment.json',{...env,os:execFileSync('sw_vers',[],{encoding:'utf8'}),hardware:'Apple M4, 10 CPU cores, 32 GB',endpoint,model,sanitize:false,seed:'unspecified'});
 const files=['AGENTS.md','README.md','src/index.ts','src/safe-share.ts','test/index.test.ts','docs/design.md','docs/tasks.md','docs/advice-quality-check.md'];
 const hashes={};for(const f of files) hashes[f]=hash(await readFile(`${repo}/${f}`));await save('source-hashes.json',hashes);
 const doc=await readFile(`${repo}/docs/advice-quality-check.md`,'utf8');
 const cases=[...doc.matchAll(/`([ABCD])\/logs\/(2026-10-0[123])\.md`\n\n```md\n([\s\S]*?)```/g)].map(m=>({case:m[1],date:m[2],content:m[3]}));assert.equal(cases.length,12);
 for(const log of cases){await mkdir(`${root}/inputs/${log.case}`,{recursive:true});await save(`inputs/${log.case}/${log.date}.md`,log.content);log.sha256=hash(log.content);}
 await save('inputs.json',cases);await save('package.json',{type:'module'});
 console.log(JSON.stringify({prepared:cases.length,root,environment:env}));
}else{
 const env=await metadata();
 const previous=JSON.parse(await readFile(`${root}/environment.json`,'utf8'));
 assert.equal(env.commit,previous.commit);assert.equal(env.status,previous.status);
 assert.equal(env.node,previous.node);assert.deepEqual(env.version,previous.version);
 assert.equal(env.tags.models.find(m=>m.name===model)?.digest,previous.tags.models.find(m=>m.name===model)?.digest);
 await save(process.argv[2]==='first'?'resume-environment-first.json':'resume-environment-rest.json',env);
 await mkdir(`${root}/trials`,{recursive:true});
 const start=process.argv[2]==='first'?0:1,end=process.argv[2]==='first'?1:36;
 const cases=JSON.parse(await readFile(`${root}/inputs.json`,'utf8'));
 const sourceHashes=JSON.parse(await readFile(`${root}/source-hashes.json`,'utf8'));
 const doc=await readFile(`${repo}/docs/advice-quality-check.md`,'utf8');
 const extracted=[...doc.matchAll(/`([ABCD])\/logs\/(2026-10-0[123])\.md`\n\n```md\n([\s\S]*?)```/g)].map(m=>({case:m[1],date:m[2],content:m[3]}));
 assert.equal(extracted.length,12);
 for(let i=0;i<12;i++){
  assert.deepEqual(extracted[i],{case:cases[i].case,date:cases[i].date,content:cases[i].content});
  assert.equal(hash(cases[i].content),cases[i].sha256);
  assert.equal(await readFile(`${root}/inputs/${cases[i].case}/${cases[i].date}.md`,'utf8'),cases[i].content);
 }
 for(let n=start;n<end;n++){
  for(const [f,h] of Object.entries(sourceHashes))assert.equal(hash(await readFile(`${repo}/${f}`)),h);
  const item=cases[Math.floor(n/3)],run=n%3+1,id=`${item.case}-${item.date}-${run}${n===0?'-retry1':''}`;
  const log=Object.freeze({date:item.date,content:await readFile(`${root}/inputs/${item.case}/${item.date}.md`,'utf8')});assert.equal(hash(log.content),item.sha256);
  await mkdir(`${root}/trials/${id}`);const base=`trials/${id}`;
  const req=buildOllamaDailyExtractionRequest(log,model,false);
  assert.deepEqual(JSON.parse(req.messages[1].content),{content:log.content});assert.deepEqual(req.format,ADVICE_DAILY_EXTRACTION_JSON_SCHEMA);
  assert.deepEqual(req.options,{temperature:0});assert.equal(req.think,false);assert.equal(req.stream,false);assert.equal(req.messages.length,2);
  await save(`${base}/request-preview.json`,req);
  let stage='harness',calls=0,transportFailure=false,httpStatus=null;
  const observedFetch=async(url,options)=>{
   calls++;assert.equal(calls,1);assert.equal(url,endpoint);assert.equal(options.body,JSON.stringify(req));
   await save(`${base}/request-body.txt`,options.body);await save(`${base}/request-http.json`,{url,method:options.method,headers:options.headers,sha256:hash(options.body)});
   stage='transport';let response;
   try{response=await fetch(url,options);}catch(e){transportFailure=true;throw e;}
   stage='capture';httpStatus=response.status;
   const bytes=Buffer.from(await response.arrayBuffer());await save(`${base}/http-response-body.txt`,bytes.toString('utf8'));
   await save(`${base}/http-response.json`,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers),sha256:hash(bytes)});
   try{const outer=JSON.parse(bytes.toString('utf8'));if(typeof outer.message?.content==='string')await save(`${base}/model-content.txt`,outer.message.content);}catch(e){if(e.code)throw e;}
   stage='provider-validation';return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  const started=new Date().toISOString(),t=performance.now();let result,error=null,stop=false;
  try{result=await createOllamaDailyExtractionProvider(model,endpoint,observedFetch)(log,false);await save(`${base}/validated.json`,result);assert.equal(calls,1);}
  catch(e){error={name:e.name,message:e.message,stack:e.stack,cause:e.cause?{name:e.cause.name,message:e.cause.message}:null,stage};stop=transportFailure||stage==='harness'||stage==='capture';await save(`${base}/error.json`,error);}
  assert.equal(hash(log.content),item.sha256);
  await save(`${base}/result.json`,{id,ordinal:n+1,started,finished:new Date().toISOString(),elapsedMs:performance.now()-t,httpStatus,success:!error,error,stop});
  console.log(JSON.stringify({id,ordinal:n+1,success:!error,error:error?.message,stop}));
  if(stop)process.exit(2);
 }
 await save(start===0?'first-complete.json':'final-environment.json',await metadata());
}
