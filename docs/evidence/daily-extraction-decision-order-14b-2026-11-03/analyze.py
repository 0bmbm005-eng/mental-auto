import json,statistics,re
from pathlib import Path
p=Path(__file__).parent
read=lambda f:json.loads((p/f).read_text())
trials=[json.loads(l) for l in (p/'trials.jsonl').read_text().splitlines()]
protocol=read('protocol.json')
old=json.loads((p.parent/'daily-extraction-qwen3-14b-2026-11-02/records.json').read_text())
problems={'A-2026-10-01':'挨拶の実行済み行動と返事の不知覚を一括observation。行動分類と分離を失う。推測・否定は保持。','D-2026-10-01':'対象・程度・述語の範囲は保持するが、実行済み思考行動をobservationと誤分類。','mixed-statements':'ベル操作と音の不知覚を一括observation。行動分類と分離を失う。否定は保持。','reception-mixed':'声かけの実行済み行動と返答の不知覚を一括observation。推測・否定と原文情報は保持。'}
def pair(q):return [{'quote':v['quote'],'kind':v['kind']} for v in q]
def stats(ts):
 a=[t['elapsedMs'] for t in ts];return {'sumMs':sum(a),'medianMs':statistics.median(a),'minMs':min(a),'maxMs':max(a)}
groups=[]
for x in protocol['inputs']:
 ts=[t for t in trials if (t['series'],t['inputId'])==(x['series'],x['inputId'])]
 bodies=[json.loads(t['httpResponseBody'])['message']['content'] for t in ts]
 quotes=[pair(t['validated']) for t in ts]
 assert len(set(bodies))==1
 key=x['inputId'];reason=problems.get(key,'分類・作用範囲・独立記述の分割・対象・時間・程度・述語を保持。句点の除外は意味範囲を損なわない場合に許容。')
 if x['series']=='new10' and key!='reception-mixed':
  normalize=lambda qs:[(q['quote'].rstrip('。'),q['kind']) for q in qs]
  assert normalize(quotes[0])==normalize(x['expected']),(key,quotes[0],x['expected'])
 comparison=None;before=None
 if x['series']=='prior21':
  prev=next(i for i in old['inputs'] if i['inputId']==key)
  before=json.loads(json.loads(prev['trials'][0]['httpResponseBody'])['message']['content'])
  # Manual semantic review: only inference-scope punctuation differs from prior output.
  assert [(q['quote'].rstrip('。'),q['kind']) for q in before]==[(q['quote'].rstrip('。'),q['kind']) for q in quotes[0]],key
  comparison='maintained'
 groups.append({'series':x['series'],'inputId':key,'distinctInputs':1,'trials':3,'machineSuccess':sum(t['machineSuccess'] for t in ts),'provisionalContentPass':key not in problems,'reason':reason,'comparisonToPrior14b':comparison,'modelContentByteIdenticalAcross3':True,'quoteKindOrderIdenticalAcross3':quotes[0]==quotes[1]==quotes[2],'representative':quotes[0],'priorRepresentative':before,'trialIds':[f"{t['series']}/{t['id']}" for t in ts],'timing':stats(ts)})
series={}
for name in ['prior21','new10']:
 gs=[g for g in groups if g['series']==name];ts=[t for t in trials if t['series']==name]
 series[name]={'distinctInputs':len(gs),'trials':len(ts),'machineSuccess':sum(t['machineSuccess'] for t in ts),'machineFailure':sum(not t['machineSuccess'] for t in ts),'provisionalContentPassTrials':sum(g['trials'] for g in gs if g['provisionalContentPass']),'provisionalContentProblemTrials':sum(g['trials'] for g in gs if not g['provisionalContentPass']),'provisionalContentProblemInputs':sum(not g['provisionalContentPass'] for g in gs),'timing':stats(ts)}
memory=read('memory-samples.json');rss=[];swaps=[]
for sample in memory:
 processes=sample.get('ollamaProcesses',sample.get('processes'))
 if isinstance(processes,str):
  for l in processes.splitlines():
   if 'ollama' in l.lower():
    cols=l.split(None,2)
    if len(cols)==3 and cols[1].isdigit():rss.append({'time':sample['time'],'rssKiB':int(cols[1]),'command':cols[2]})
 if isinstance(sample.get('swap'),str):
  m=re.search(r'used = ([\d.]+)([MGT])',sample['swap'])
  if m:swaps.append(float(m[1])*{'M':1,'G':1024,'T':1048576}[m[2]])
runner=[r for r in rss if 'runner' in r['command'].lower() or 'llama-server' in r['command'].lower()]
summary={'assessment':'Codex provisional semantic review, not human-confirmed; machine validation is separate. Existing12 uses established design criteria, not new expected arrays. Additional9 and new10 use fixed expectations.','series':series,'distinctImproved':0,'distinctRegressed':0,'distinctMaintained':21,'all31GroupsByteIdenticalAcross3':True,'timing93':stats(trials),'timingWithoutFirst':stats(trials[1:]),'memory':{'sampleCount':len(memory),'swapParsedSamples':len(swaps),'maxSwapUsedMiB':max(swaps),'maxRunnerRss':max(runner,key=lambda x:x['rssKiB']) if runner else None,'maxOllamaProcessRss':max(rss,key=lambda x:x['rssKiB']) if rss else None,'samplingErrors':sum(isinstance(v,dict) and 'error' in v for s in memory for v in s.values())},'groups':groups}
(p/'content-evaluation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='groups'},ensure_ascii=False,indent=2))
