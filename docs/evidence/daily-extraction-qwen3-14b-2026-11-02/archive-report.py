# coding: utf-8
from pathlib import Path
import json,hashlib,shutil,statistics,subprocess
r=Path('/private/tmp/mental-auto-qwen3-compare.zmbgyfyp');repo=Path('/Users/kei/projects/mental-auto');out=repo/'docs/evidence/daily-extraction-qwen3-14b-2026-11-02'
load=lambda p:json.loads(p.read_text());h=lambda b:hashlib.sha256(b).hexdigest()
b=load(r/'baseline.json');env=load(r/'environment.json');final=load(r/'final-environment.json');smoke=load(r/'initial-smoke/environment.json');oldEval=load(repo/'docs/evidence/daily-extraction-scope-eval-2026-11-02/content-evaluation.json')
assert load(r/'completion.json')['newTrials']==62
assert 'presence_penalty' in load(r/'baseline-show-current.json')['parameters']
for p,v in load(r/'hashes.json').items():assert h((r/p if p.startswith('build/') else repo/p).read_bytes())==v
issues={'A-2026-10-01':'挨拶した行動と返事が聞こえなかった観察を一つのobservationにまとめた。原文の情報と否定・推測は残るが、行動の分類が失われる。', 'D-2026-10-01':'全文の引用範囲は保持したが、本人が何度も思い返した思考行動をobservationとした。actionの定義に反する。', 'mixed-statements':'ベルを押した行動と音が聞こえなかった観察を一つのobservationにまとめた。否定は残るが行動の分類が失われる。'}
notes={'A-2026-10-02':'受けた出来事をobservationとして保持。','A-2026-10-03':'自己評価を保持。末尾句点の除外のみで意味は維持。','D-2026-10-02':'対象・時間・程度・述語を一緒に引用しaction。以前の分断を解消。','D-2026-10-03':'全文wish。希望の対象を実行済みactionへ切り出さない。','thought-action':'昨夜・対象・一時間・実行済み行動を全文actionとして保持。','wish-scope':'希望の範囲全体をwishとして保持。','plan':'明日の朝を含む予定全文をwishとして保持。','nonperformance':'昨日は・否定・述語を全文observationとして保持。','inference-scope':'推測がかかる出来事全体をinferenceとして保持。','negated-inference':'否定された推測の範囲を全文inferenceとして保持。','performed-and-wish':'昨日の実行済み行動と明日の希望を分離。句点の除外のみ。','short-action':'短い実行済み行動をactionとして保持。'}
a={'environment':env,'finalEnvironment':final,'baseline':'../daily-extraction-scope-eval-2026-11-02/records.json','hashes':load(r/'hashes.json'),'reuseVerification':load(r/'reuse-verification.json'),'expectations':load(r/'expectations.json'),'inputs':[]};rows=[];groups=[];times=[];oldtimes=[]
for x in b['inputs']:
 key=x['inputId'];reqs=[];trials=[];raws=[];parsed=[]
 for run in range(1,4):
  d=r/'trials'/f'{key}-{run}';body=(d/'request-body.txt').read_bytes();req=json.loads(body);old=json.loads(x['requestBody']);assert dict(req,model=old['model'])==old
  assert h(x['content'].encode())==x['sha256'];reqs.append(body);raw=(d/'http-response-body.txt').read_bytes();outer=json.loads(raw);model=(d/'model-content.txt').read_text();assert outer['message']['content']==model;meta=load(d/'http-response.json');assert meta['sha256']==h(raw)
  res=load(d/'result.json');success=res['machineSuccess'];validated=load(d/'validated.json') if (d/'validated.json').exists() else None
  assert json.loads(model)==[{k:v for k,v in q.items() if k in ['quote','kind']} for q in validated]
  t={'id':d.name,'requestBody':body.decode(),'requestSha256':h(body),'httpResponseBody':raw.decode(),'httpResponse':meta,'modelContent':model,'modelContentSha256':h(model.encode()),'validated':validated,'result':res,'reusedSmoke':key=='D-2026-10-03' and run==1};trials.append(t);raws.append(model);parsed.append(json.loads(model));times.append(res['elapsedMs']/1000)
  rows.append({'trialId':d.name,'series':x['series'],'inputId':key,'machineSuccess':success,'contentVerdict':'problem' if key in issues else 'meets-criteria','reason':issues.get(key) or notes.get(key) or '時間・対象と実行済み行動をactionとして維持。','provisional':True,'evaluator':'Codex'})
 for t in x['trials']:oldtimes.append(t['result']['elapsedMs']/1000)
 assert len(set(reqs))==1
 oldProblem=any(t['inputId']==key and t['contentVerdict']=='problem' for t in oldEval['trials']);newProblem=key in issues
 change='improved' if oldProblem and not newProblem else 'regressed' if newProblem and not oldProblem else 'maintained'
 g={'inputId':key,'series':x['series'],'rawUnique':len(set(raws)),'parsedUnique':len(set(json.dumps(v,sort_keys=True,ensure_ascii=False) for v in parsed)),'semanticUniqueProvisional':len(set(json.dumps(v,sort_keys=True,ensure_ascii=False) for v in parsed)),'previousProblem':oldProblem,'currentProblem':newProblem,'change':change,'previousRepresentative':json.loads(x['trials'][0]['modelContent']),'representative':parsed[0],'reason':rows[-1]['reason']};groups.append(g)
 a['inputs'].append({k:x[k] for k in ['case','date','series','inputId','content','sha256']}|{'expected':x.get('expected'),'requestBody':reqs[0].decode(),'promptSha256':h(req['messages'][0]['content'].encode()),'schemaSha256':h(json.dumps(req['format'],ensure_ascii=False,separators=(',',':')).encode()),'trials':trials})
assert len(times)==63 and len(groups)==21
series={}
for s in ['existing','additional']:
 rr=[t for t in rows if t['series']==s];gg=[g for g in groups if g['series']==s];series[s]={'distinctInputs':len(gg),'trials':len(rr),'machineSuccess':sum(t['machineSuccess'] for t in rr),'machineFailure':sum(not t['machineSuccess'] for t in rr),'contentMeetsCriteria':sum(t['contentVerdict']=='meets-criteria' for t in rr),'contentProblemTrials':sum(t['contentVerdict']=='problem' for t in rr),'contentProblemDistinctInputs':sum(g['currentProblem'] for g in gg),'rawIdenticalThreeRunGroups':sum(g['rawUnique']==1 for g in gg)}
mem=load(r/'memory-samples.json');sm=load(r/'initial-smoke/memory-samples.json')
def memsummary(samples):
 rss=[]
 for s in samples:
  for line in s['processes'].splitlines():
   if 'llama-server' in line:rss.append(int(line.split()[1]))
 return {'sampleCount':len(samples),'swapUsedZeroAtAllSamples':all('used = 0.00M' in s['swap'] for s in samples),'runnerMaxObservedRssKiB':max(rss)}
def timing(v):return {'sumSeconds':sum(v),'medianSeconds':statistics.median(v),'minSeconds':min(v),'maxSeconds':max(v)}
newtimes=[t['result']['elapsedMs']/1000 for x in a['inputs'] for t in x['trials'] if not t['reusedSmoke']]
summary={'series':series,'groups':groups,'timing63':timing(times),'timingNew62':timing(newtimes),'baselineTiming63':timing(oldtimes),'memoryNew62':memsummary(mem),'memoryInitialSmoke':memsummary(sm),'effectiveModelPs':final['ps'],'distinctImproved':sum(g['change']=='improved' for g in groups),'distinctRegressed':sum(g['change']=='regressed' for g in groups),'distinctMaintained':sum(g['change']=='maintained' for g in groups),'provisionalContentAssessment':True}
a['summary']=summary
(r/'records.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n');(r/'content-evaluation.json').write_text(json.dumps({'provisional':True,'expectationsChanged':False,'series':series,'trials':rows},ensure_ascii=False,indent=2)+'\n');(r/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
out.mkdir(parents=True)
for name in ['initial-smoke','snapshot','build','trials']:shutil.copytree(r/name,out/name)
for name in ['records.json','content-evaluation.json','summary.json','environment.json','final-environment.json','hashes.json','expectations.json','reuse-verification.json','baseline-local-model-metadata.json','baseline-show-current.json','metadata-only.mjs','memory-samples.json','status-before.txt','worktree.diff','preparation-note.json','completion.json','run.mjs','archive-report.py']:
 shutil.copy2(r/name,out/name)
print(json.dumps({k:v for k,v in summary.items() if k not in ['groups','effectiveModelPs']},ensure_ascii=False,indent=2))
