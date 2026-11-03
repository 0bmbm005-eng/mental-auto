import json,re,statistics
from pathlib import Path
p=Path(__file__).parent
read=lambda f:json.loads((p/f).read_text())
protocol=read('protocol.json');trials=[json.loads(l) for l in (p/'trials.jsonl').read_text().splitlines()]
oldp=p.parent/'daily-extraction-decision-order-14b-2026-11-03'
old=[json.loads(l) for l in (oldp/'trials.jsonl').read_text().splitlines()]
oldjudgements=json.loads((oldp/'content-evaluation.json').read_text())['groups']
def pairs(v):return [{'quote':q['quote'],'kind':q['kind']} for q in v]
def normalized(qs):
 def quote(s):
  s=s.rstrip('。、')
  for suffix in ['ものの','ので','が']:
   if s.endswith(suffix):s=s[:-len(suffix)].rstrip('。、');break
  if s.startswith('ただ、'):s=s[len('ただ、'):]
  return s
 return [(quote(q['quote']),q['kind']) for q in qs]
def expected(x):
 if x.get('expected') is not None:return x['expected']
 if x['sourceInputId']=='A-2026-10-01':return [{'quote':'同僚に挨拶した','kind':'action'},{'quote':'返事は聞こえなかった。','kind':'observation'},{'quote':'嫌われた気がする。','kind':'inference'}]
 kind={'A-2026-10-02':'observation','A-2026-10-03':'selfEvaluation','D-2026-10-03':'wish'}.get(x['sourceInputId'],'action')
 return [{'quote':x['content'].split('\n\n',1)[1].strip(),'kind':kind}]
def timing(ts):
 a=[t['elapsedMs'] for t in ts];return {'sumMs':sum(a),'medianMs':statistics.median(a),'minMs':min(a),'maxMs':max(a)}
# Explicit semantic review decisions for any mismatch or ambiguous reference are recorded here after inspection.
manual={}
for variant in ['withoutExamples','withExamples']:
 for run in [1,2,3]:
  manual[('new12','mixed-state',variant,run)]=('problem','実行済み身体行動と知覚・状態を一括observationとし、行動の分類と独立記述の分離を失う。原文情報自体は保持。')
  manual[('new12','event-before-action',variant,run)]=('problem','先行する警告表示の出来事と本人の保存行動を一括actionとし、出来事のobservation分類と分離を失う。因果接続があっても固定期待値では独立記述を分ける。')
for run in [1,2,3]:
 manual[('new12','completed-and-wish','withoutExamples',run)]=('problem','提出済み行動をobservationと誤分類し、複数節にかかる希望を分断。前半のwish引用だけでは希望表現まで保持できない。')
 manual[('new12','completed-and-wish','withExamples',run)]=('problem','希望の範囲は一つのwishに改善したが、提出済み行動のobservation誤分類は残る。入力全体としては未合格。')
for run in [2,3]:
 manual[('new12','inferred-own-action','withoutExamples',run)]=('problem','はずだによる推測表現を引用に残しているが、inferenceではなくobservationと誤分類。1回目のみ期待どおり。')
groups=[]
for x in protocol['inputs']:
 for variant in (['withExamples'] if x['series']=='regression31' else ['withoutExamples','withExamples']):
  ts=[t for t in trials if (t['series'],t['inputId'],t['variant'])==(x['series'],x['inputId'],variant)]
  if len(ts)!=3:continue
  results=[]
  for t in ts:
   key=(x['series'],x['inputId'],variant,t['run'])
   if not t['machineSuccess']:status,reason='problem','機械検証に失敗。内容基準の充足を確認できない。'
   elif key in manual:status,reason=manual[key]
   elif normalized(pairs(t['validated']))==normalized(expected(x)):status,reason='pass','固定期待値（旧12ログは既存設計基準）の分類・分割・意味範囲・情報を保持。句点・末尾接続表現などの許容差のみ。'
   else:status,reason='review','要意味確認：固定期待配列との範囲または分類差。'
   results.append({'id':t['id'],'run':t['run'],'status':status,'reason':reason,'output':pairs(t['validated']) if t['validated'] is not None else None})
  contents=[json.loads(t['httpResponseBody'])['message']['content'] for t in ts if t.get('httpResponseBody')]
  g={'series':x['series'],'inputId':x['inputId'],'variant':variant,'runs':results,'sameModelContentAcross3':len(set(contents))==1,'sameQuoteKindOrderAcross3':len({json.dumps(r['output'],ensure_ascii=False) for r in results})==1,'timing':timing(ts)}
  if x['series']=='regression31':
   prev=next(g for g in oldjudgements if (g['series'],g['inputId'])==(x['sourceSeries'],x['sourceInputId']))
   olds=[t for t in old if (t['series'],t['inputId'])==(x['sourceSeries'],x['sourceInputId'])]
   g['previousPass']=prev['provisionalContentPass'];g['previousRepresentative']=pairs(olds[0]['validated']);g['byteEqualToPrevious']=[json.loads(t['httpResponseBody'])['message']['content'] for t in olds]==contents
  groups.append(g)
summary={'assessment':'Codex暫定内容評価。機械検証とは別で、人間の確定評価ではない。期待値は変更しない。','plannedTrials':165,'completedTrials':len(trials),'distinctInputs':43,'inputVariantGroups':55,'machineSuccess':sum(t['machineSuccess'] for t in trials),'groups':groups}
(p/'content-evaluation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
for g in groups:
 print(g['series'],g['inputId'],g['variant'],[r['status'] for r in g['runs']],g['sameModelContentAcross3'])
 for r in g['runs']:
  if r['status']!='pass':print(' ',r['run'],r['output'])
if len(trials)==165:
 assert len(groups)==55
 assert all(r['status']!='review' for g in groups for r in g['runs'])
 series=[]
 for name,variant in [('regression31','withExamples'),('new12','withoutExamples'),('new12','withExamples')]:
  gs=[g for g in groups if (g['series'],g['variant'])==(name,variant)];ts=[t for t in trials if (t['series'],t['variant'])==(name,variant)]
  series.append({'series':name,'variant':variant,'distinctInputs':len(gs),'trials':len(ts),'machineSuccess':sum(t['machineSuccess'] for t in ts),'contentPassTrials':sum(r['status']=='pass' for g in gs for r in g['runs']),'contentProblemTrials':sum(r['status']=='problem' for g in gs for r in g['runs']),'contentHeldTrials':sum(r['status']=='held' for g in gs for r in g['runs']),'allThreePassInputs':sum(all(r['status']=='pass' for r in g['runs']) for g in gs),'timing':timing(ts)})
 comparisons=[]
 for x in protocol['inputs']:
  if x['series']!='new12':continue
  a=next(g for g in groups if (g['inputId'],g['variant'],g['series'])==(x['inputId'],'withoutExamples','new12'));b=next(g for g in groups if (g['inputId'],g['variant'],g['series'])==(x['inputId'],'withExamples','new12'))
  pa=all(r['status']=='pass' for r in a['runs']);pb=all(r['status']=='pass' for r in b['runs'])
  comparison='improved' if not pa and pb else 'regressed' if pa and not pb else 'maintained'
  detail='Input-level pass/fail unchanged.'
  if x['inputId']=='inferred-own-action':detail='All-three-pass criterion improved from 1/3 passing trials to 3/3; the whole-input result changed from fail to pass.'
  if x['inputId']=='completed-and-wish':comparison='partiallyImproved';detail='Wish scope restored; completed action remains observation. Both variants still fail the whole-input criteria.'
  comparisons.append({'inputId':x['inputId'],'comparison':comparison,'passBefore':pa,'passAfter':pb,'detail':detail,'modelContentByteEqual': [json.loads(t['httpResponseBody'])['message']['content'] for t in trials if (t['series'],t['inputId'],t['variant'])==('new12',x['inputId'],'withoutExamples')]==[json.loads(t['httpResponseBody'])['message']['content'] for t in trials if (t['series'],t['inputId'],t['variant'])==('new12',x['inputId'],'withExamples')]})
 summary.update({'seriesSummary':series,'timingAll165':timing(trials),'timingExcludingFirst':timing(trials[1:]),'new12Comparisons':comparisons,'all55GroupsSameModelContentAcross3':all(g['sameModelContentAcross3'] for g in groups),'all55GroupsSameQuoteKindOrderAcross3':all(g['sameQuoteKindOrderAcross3'] for g in groups),'heldInputs':[],'regressionImprovedInputs':4,'regressionRegressedInputs':0,'regressionMaintainedInputs':27})
 (p/'content-evaluation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in summary.items() if k not in ['groups','new12Comparisons']},ensure_ascii=False,indent=2))
