"""Optional local anonymous acoustic proposals; audio is never uploaded.

No overlap detection, word alignment, identity recognition or accuracy calibration.
Install the optional dependencies described in docs/local-speaker-proposals.md.
"""
import argparse, collections, hashlib, importlib.metadata, json, math, os, subprocess, time
from pathlib import Path
import numpy as np
import torch
from scipy.spatial.distance import pdist
from scipy.cluster.hierarchy import linkage, cut_tree
from sklearn.metrics import silhouette_score
from speechbrain.inference.speaker import EncoderClassifier
from silero_vad import load_silero_vad, get_speech_timestamps
import silero_vad

RATE=16000
PARAMS={'windowSeconds':3.0,'windowStepSeconds':1.5,'minimumEmbeddingSeconds':1.3,
        'minimumAssignedWindowSeconds':1.8,'minimumFitWindowSeconds':2.5,
        'minimumCentroidMargin':0.065,'maximumCentroidCosineDistance':0.48,
        'minimumTurnCoverage':0.60,'minimumDominantTurnShare':0.92,
        'minimumTurnResolvedSeconds':0.60,'maximumOtherSpeakerSeconds':0.20,
        'minimumCandidateClusterFraction':0.012,'minimumCandidateClusterSeconds':18.0,
        'minimumSelectedSilhouette':0.18,'singleClusterMeanDistanceThreshold':0.12,
        'candidateClusterCounts':[2,3,4,5,6,7,8],'silhouetteSampleMaximum':1500,
        'vadThreshold':0.5,'vadMinimumSpeechMilliseconds':250,
        'vadMinimumSilenceMilliseconds':250,'vadSpeechPaddingMilliseconds':0,
        'threads':4,'batchSize':16,'randomSeed':1042026}

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        while b:=f.read(8*1024*1024):h.update(b)
    return h.hexdigest()

def save(path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
    path.chmod(0o600)

def progress(stage,**kw):
    print(json.dumps({'stage':stage,**kw}),flush=True)

def decoded_recording(audio,root,recording_hash,maximum_seconds):
    """Only completed, bounded decodes may become reusable acoustic evidence."""
    wavepath=root/'mono-16khz.f32';metadata=root/'decode-integrity.json'
    if wavepath.exists():
        if not metadata.exists():raise ValueError('Decoded cache has no completeness evidence. Use a new output directory.')
        info=json.loads(metadata.read_text());size=wavepath.stat().st_size
        if (info.get('complete') is not True or info.get('recordingSha256')!=recording_hash
            or info.get('sampleRate')!=RATE or size%4 or size!=info.get('bytes')
            or size/(4*RATE)!=info.get('durationSeconds') or sha(wavepath)!=info.get('waveSha256')):
            raise ValueError('Decoded cache completeness/integrity check failed. Use a new output directory.')
        if info['durationSeconds']>maximum_seconds:raise ValueError('Recording exceeds the selected duration bound.')
        return wavepath,info
    if any((root/name).exists() for name in ['embeddings.npz','vad-runs.json','embedding-windows.json']):
        raise ValueError('Acoustic cache has no complete decoded recording. Use a new output directory.')
    temporary=root/'decode-pending.f32'
    try:
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(audio),'-vn','-t',str(maximum_seconds+1),'-ac','1','-ar',str(RATE),'-f','f32le',str(temporary)],check=True)
        size=temporary.stat().st_size;duration=size/(4*RATE)
        if not size or size%4:raise ValueError('Decoded recording is empty or incomplete.')
        if duration>maximum_seconds:raise ValueError('Recording exceeds the selected duration bound; partial decoded audio is discarded.')
        info={'complete':True,'recordingSha256':recording_hash,'sampleRate':RATE,'bytes':size,
              'durationSeconds':duration,'waveSha256':sha(temporary),'decodeLimitSeconds':maximum_seconds+1}
        temporary.chmod(0o600);temporary.replace(wavepath);save(metadata,info)
        return wavepath,info
    finally:
        temporary.unlink(missing_ok=True)

def build_windows(runs):
    windows=[]
    for ri,run in enumerate(runs):
        a,b=run['start'],run['end'];length=b-a
        if length<PARAMS['minimumEmbeddingSeconds']*RATE:continue
        if length<=PARAMS['windowSeconds']*RATE:positions=[(a,b)]
        else:
            starts=list(range(a,b-int(PARAMS['windowSeconds']*RATE)+1,int(PARAMS['windowStepSeconds']*RATE)))
            tail=b-int(PARAMS['windowSeconds']*RATE)
            if tail-starts[-1]>=int(.25*RATE):starts.append(tail)
            positions=[(x,x+int(PARAMS['windowSeconds']*RATE)) for x in starts]
        for a,b in positions:windows.append({'vadRun':ri,'startSample':a,'endSample':b,'timeStart':a/RATE,'timeEnd':b/RATE,'durationSeconds':(b-a)/RATE})
    return windows

def clustering(emb,windows):
    fit_idx=np.array([i for i,w in enumerate(windows) if w['durationSeconds']>=PARAMS['minimumFitWindowSeconds']])
    if len(fit_idx)<25:raise RuntimeError('Too few sufficiently long speech windows for credible whole-recording clustering.')
    x=emb[fit_idx];dist=pdist(x,metric='cosine');tree=linkage(dist,method='average')
    diagnostics=[];alternatives={};eligible=[]
    mean_distance=float(dist.mean())
    for k in PARAMS['candidateClusterCounts']:
        if k>=len(x):continue
        labels=cut_tree(tree,n_clusters=k).reshape(-1)
        counts=np.bincount(labels,minlength=k)
        durations=np.array([sum(windows[int(fit_idx[i])]['durationSeconds'] for i in np.where(labels==j)[0]) for j in range(k)])
        sil=float(silhouette_score(x,labels,metric='cosine',sample_size=min(PARAMS['silhouetteSampleMaximum'],len(x)),random_state=PARAMS['randomSeed']))
        centers=np.stack([x[labels==j].mean(axis=0) for j in range(k)]);centers/=np.maximum(np.linalg.norm(centers,axis=1,keepdims=True),1e-9)
        cosine=1-emb@centers.T;pred=cosine.argmin(axis=1)
        order=sorted(range(k),key=lambda j:next((windows[i]['timeStart'] for i in range(len(windows)) if pred[i]==j),math.inf))
        remap={old:new for new,old in enumerate(order)}
        ordered_centers=centers[order];all_labels=np.array([remap[int(j)] for j in pred])
        material=(counts/counts.sum()>=PARAMS['minimumCandidateClusterFraction']) & (durations>=PARAMS['minimumCandidateClusterSeconds'])
        reasons=[]
        if material.sum()<2:reasons.append('fewer than two material-supported acoustic clusters')
        row={'k':k,'silhouetteCosine':sil,'sampleCount':int(len(x)),'clusterFitWindowCounts':counts.tolist(),
             'clusterFitWindowSecondsOverlapping':durations.tolist(),'eligible':not reasons,'reasons':reasons,
             'materialSupportedClusters':int(material.sum()),'smallOrLowSupportClusters':int((~material).sum()),
             'clusterMaterialSupportInStableLabelOrder':[bool(material[j]) for j in order],
             'note':'Overlapping window durations are diagnostics, not unique speech duration; silhouette is not speaker-count accuracy.'}
        diagnostics.append(row)
        alternatives[str(k)]={'windowLabels':[f'Speaker {int(j)+1}' for j in all_labels],
                               'centroids':ordered_centers.tolist(),'selectionDiagnostic':row,
                               'fitHierarchyLabels':[remap[int(j)] for j in labels]}
        if not reasons:eligible.append(row)
    if not eligible:
        chosen=max(diagnostics,key=lambda d:d['silhouetteCosine']);selection_reliable=False
    else:
        chosen=max(eligible,key=lambda d:d['silhouetteCosine']);selection_reliable=chosen['silhouetteCosine']>=PARAMS['minimumSelectedSilhouette']
    selected_k=chosen['k']
    if mean_distance<PARAMS['singleClusterMeanDistanceThreshold']:
        selected_k=1;selection_reliable=False
        center=emb[fit_idx].mean(axis=0);center/=np.linalg.norm(center)
        centers=center[None,:];labels=np.zeros(len(emb),dtype=int)
        fit_labels=np.zeros(len(fit_idx),dtype=int)
    else:
        alt=alternatives[str(selected_k)];centers=np.array(alt['centroids']);labels=np.array([int(s.split()[-1])-1 for s in alt['windowLabels']]);fit_labels=np.array(alt['fitHierarchyLabels'])
    cosine=1-emb@centers.T
    nearest=cosine.min(axis=1)
    margin=np.sort(cosine,axis=1)[:,1]-np.sort(cosine,axis=1)[:,0] if selected_k>1 else np.zeros(len(emb))
    disagree={int(fit_idx[i]) for i in range(len(fit_idx)) if labels[int(fit_idx[i])]!=fit_labels[i]}
    accepted=[]
    for i,w in enumerate(windows):
        reasons=[]
        if not selection_reliable:reasons.append('cluster-count separation not reliable under documented heuristic')
        if selected_k>1 and not chosen['clusterMaterialSupportInStableLabelOrder'][int(labels[i])]:reasons.append('small/low-support acoustic candidate withheld; human voice not established')
        if w['durationSeconds']<PARAMS['minimumAssignedWindowSeconds']:reasons.append('short window')
        if margin[i]<PARAMS['minimumCentroidMargin']:reasons.append('small uncalibrated centroid margin; possible boundary/mixed/noisy speech')
        if nearest[i]>PARAMS['maximumCentroidCosineDistance']:reasons.append('far from selected acoustic centroid')
        if i in disagree:reasons.append('hierarchical and centroid assignments disagree')
        accepted.append(not reasons)
        w.update({'candidateSpeaker':f'Speaker {int(labels[i])+1}','speaker':'Unassigned' if reasons else f'Speaker {int(labels[i])+1}',
                  'centroidCosineDistance':float(nearest[i]),'centroidMargin':float(margin[i]),
                  'diagnosticMeaning':'Relative cosine-separation diagnostic, not a calibrated confidence probability',
                  'reviewReasons':reasons,'reviewRequired':True})
    return windows,{'selectedK':selected_k,'selectionReliableUnderHeuristic':selection_reliable,
                    'selectionRule':'Highest cosine silhouette among hypotheses with at least two material-supported clusters. Small/low-support candidates are retained but individually withheld. Apply low-separation and single-cluster safeguards; heuristic, not validated count accuracy.',
                    'policyVersion':2,'policyRevisionReason':'Initial all-or-nothing gate let one tiny acoustic cluster veto otherwise material-supported separated clusters. Version 2 withholds the tiny candidate locally while retaining count uncertainty and all local checks.',
                    'meanPairwiseFitCosineDistance':mean_distance,'selectedDiagnostic':chosen,
                    'candidateDiagnostics':diagnostics,'fitWindowIndices':fit_idx.tolist(),
                    'alternativeClusteringsPath':'alternative-clusterings.json','anonymity':'Labels stable only within this recording/run; no cross-recording identity match.'}, alternatives

def intervals(runs,windows):
    grouped=collections.defaultdict(list)
    for i,w in enumerate(windows):grouped[w['vadRun']].append((i,w))
    out=[]
    for ri,run in enumerate(runs):
        group=grouped.get(ri,[])
        if not group:
            out.append({'id':f'vad-{ri}-short','speaker':'Unassigned','timeStart':run['start']/RATE,'timeEnd':run['end']/RATE,
                        'windowId':None,'reason':'Speech run too short for embedding','centroidMargin':None,'reviewRequired':True})
            continue
        centers=[(w['timeStart']+w['timeEnd'])/2 for _,w in group]
        edges=[run['start']/RATE]+[(centers[i]+centers[i+1])/2 for i in range(len(centers)-1)]+[run['end']/RATE]
        for i,(wi,w) in enumerate(group):
            out.append({'id':f'vad-{ri}-cell-{i}','speaker':w['speaker'],'candidateSpeaker':w['candidateSpeaker'],
                        'timeStart':edges[i],'timeEnd':edges[i+1],'windowId':wi,
                        'reason':'; '.join(w['reviewReasons']) or 'Provisional anonymous acoustic cluster; researcher listening review required',
                        'centroidMargin':w['centroidMargin'],'centroidCosineDistance':w['centroidCosineDistance'],'reviewRequired':True})
    for i,iv in enumerate(out):
        assert iv['timeEnd']>iv['timeStart']
        if i:assert iv['timeStart']>=out[i-1]['timeEnd']-1e-6
    return out

def map_turns(doc,regular):
    assignments=[]
    for turn in doc['turns']:
        a,b=turn['timeStart'],turn['timeEnd'];duration=b-a
        by=collections.defaultdict(float);margins=[];unresolved=0.
        for iv in regular:
            if iv['timeEnd']<=a:continue
            if iv['timeStart']>=b:break
            overlap=max(0.,min(b,iv['timeEnd'])-max(a,iv['timeStart']))
            if iv['speaker']=='Unassigned':unresolved+=overlap
            else:
                by[iv['speaker']]+=overlap
                if overlap>0:margins.append(iv['centroidMargin'])
        covered=sum(by.values());dominant=max(by,key=by.get) if by else None
        dom=by.get(dominant,0.)/covered if covered else 0.;coverage=min(1.,covered/duration) if duration>0 else 0.
        other=covered-by.get(dominant,0.);reasons=[]
        if duration<=0:reasons.append('nonpositive source segment duration')
        if covered<PARAMS['minimumTurnResolvedSeconds']:reasons.append('too little accepted acoustic evidence')
        if coverage<PARAMS['minimumTurnCoverage']:reasons.append('low accepted speech coverage')
        if dom<PARAMS['minimumDominantTurnShare'] or other>PARAMS['maximumOtherSpeakerSeconds']:reasons.append('different accepted acoustic clusters inside source timing; possible mixed segment')
        speaker='Unassigned' if reasons or dominant is None else dominant
        assignments.append({'turnId':turn['id'],'speaker':speaker,'dominantShare':dom,'coverage':coverage,
                            'reason':'; '.join(reasons) if reasons else 'One anonymous acoustic cluster dominates sufficiently covered source timing; machine proposal, researcher review still required',
                            'candidateSpeaker':dominant,'acousticSecondsByCluster':dict(by),
                            'unresolvedSpeechSeconds':unresolved,'sourceTimeStart':a,'sourceTimeEnd':b,
                            'sourceStart':turn['start'],'sourceEnd':turn['end'],
                            'medianCentroidMargin':float(np.median(margins)) if margins else None,
                            'sourceSpeaker':turn['speaker'],'reviewRequired':True,
                            'timingLimit':'Mapping by enclosing native ASR timing; no word alignment or verified speaker boundary.'})
    assert len(assignments)==len(doc['turns'])
    assert {x['turnId'] for x in assignments}=={x['id'] for x in doc['turns']}
    return assignments

MODEL_REPO='speechbrain/spkrec-ecapa-voxceleb'
MODEL_REVISION='0f99f2d0ebe89ac095bcc5903c4dd8f72b367286'
MODEL_FILES=['hyperparams.yaml','embedding_model.ckpt','mean_var_norm_emb.ckpt','classifier.ckpt','label_encoder.txt']
MODEL_SHA256={
    'hyperparams.yaml':'6f78854fa04ba59e761437b76a2575d3aba5e5016de3e9b69f0c9a5077fb1a41',
    'embedding_model.ckpt':'0575cb64845e6b9a10db9bcb74d5ac32b326b8dc90352671d345e2ee3d0126a2',
    'mean_var_norm_emb.ckpt':'cd70225b05b37be64fc5a95e24395d804231d43f74b2e1e5a513db7b69b34c33',
    'classifier.ckpt':'fd9e3634fe68bd0a427c95e354c0c677374f62b3f434e45b78599950d860d535',
    'label_encoder.txt':'e13c3a167bb4112685670ee896d20e2b565af16b3a4ceeaa8689fa4d22adb8b9',
}

def normalize_source(payload,source_id=None):
    """Accept a canonical transcript export, one document or a project snapshot."""
    if not isinstance(payload,dict):raise ValueError('Source JSON must be an object.')
    state=payload.get('state',payload)
    if 'documents' in state:
        matches=[d for d in state['documents'] if source_id is None or d.get('id')==source_id]
        if len(matches)!=1:raise ValueError('Choose exactly one document with --source-id when supplying a project snapshot.')
        raw=matches[0]
    else:raw=payload.get('document',payload)
    meta=raw.get('source',{})
    doc={**raw,**meta,'text':raw.get('text',meta.get('text')),
         'turns':raw.get('turns',meta.get('turns')),
         'attributes':raw.get('attributes',meta.get('attributes',{})),
         'alignment':raw.get('alignment',meta.get('alignment'))}
    if not isinstance(doc.get('id'),str) or not doc['id'].strip():raise ValueError('Export the actual source ID; raw ASR segments cannot invent current app turn IDs.')
    if source_id is not None and doc['id']!=source_id:raise ValueError('Source ID does not match the requested source.')
    if type(doc.get('revision')) is not int or doc['revision']<1:raise ValueError('A current positive source revision is required.')
    if not isinstance(doc.get('text'),str):raise ValueError('Supply exact canonical text, including its original newlines.')
    if not isinstance(doc.get('mediaKey'),str) or not doc['mediaKey']:raise ValueError('Source requires its actual recording media key.')
    if not str(doc.get('mediaType','')).startswith(('audio/','video/')):raise ValueError('Source must reference audio or video media.')
    alignment=doc.get('alignment') or {}
    if alignment.get('status')!='matched' or alignment.get('recordingKey')!=doc['mediaKey']:raise ValueError('Match the current source timing to its recording before acoustic processing.')
    attributes=doc.get('attributes') or {}
    digest=attributes.get('Source SHA-256','')
    import re
    if not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):raise ValueError('Source attributes must contain the original recording Source SHA-256.')
    text_hash=hashlib.sha256(doc['text'].encode()).hexdigest()
    if raw.get('textSha256',meta.get('textSha256',text_hash))!=text_hash:raise ValueError('Declared source text hash does not match exact exported text.')
    turns=doc.get('turns')
    if not isinstance(turns,list) or not turns:raise ValueError('Export actual source turns; raw ASR segment numbers are not current source turn IDs.')
    normalized=[];ids=set()
    for t in turns:
        if not isinstance(t,dict) or not isinstance(t.get('id'),str) or not t['id'] or t['id'] in ids:raise ValueError('Source turns need unique actual identifiers.')
        ids.add(t['id'])
        if type(t.get('start')) is not int or type(t.get('end')) is not int or not 0<=t['start']<t['end']<=len(doc['text']):raise ValueError('Turn codepoint anchors must fit unchanged source text.')
        if t.get('text') is not None and t['text']!=doc['text'][t['start']:t['end']]:raise ValueError('Turn text disagrees with its canonical codepoint anchor.')
        if t.get('anchorStatus')=='needs_review' or t.get('timingStatus')=='needs_review':raise ValueError('Resolve stale source timing or anchors first.')
        if any(isinstance(t.get(k),bool) or not isinstance(t.get(k),(int,float)) or not math.isfinite(t[k]) for k in ['timeStart','timeEnd']) or not 0<=t['timeStart']<t['timeEnd']:raise ValueError('Source turns need positive finite original seconds.')
        normalized.append({**t,'speaker':t.get('speaker','Unassigned')})
    doc['turns']=normalized
    return doc

def self_test():
    """Synthetic mechanics, deliberately distinct from measured audio accuracy."""
    sample={'source':{'id':'test-source','revision':1,'mediaKey':'test-media','mediaType':'audio/wav'},
            'text':'A😀B\n','attributes':{'Source SHA-256':'0'*64},
            'alignment':{'status':'matched','recordingKey':'test-media'},
            'turns':[{'id':'test-turn','start':1,'end':2,'text':'😀','timeStart':0.,'timeEnd':1.,'speaker':'Unassigned'}]}
    assert normalize_source(sample)['text'][1:2]=='😀'
    assert normalize_source({'state':{'documents':[normalize_source(sample)]}},'test-source')['id']=='test-source'
    for bad in [{**sample,'textSha256':'f'*64},{**sample,'alignment':{'status':'unmatched'}},
                {**sample,'turns':sample['turns']*2},{'segments':[{'id':0,'start':0.,'end':1.}]}]:
        try:normalize_source(bad)
        except ValueError:pass
        else:raise AssertionError('Invalid source accepted.')
    rng=np.random.default_rng(PARAMS['randomSeed']);embeddings=[];windows=[]
    for i,cluster in enumerate([0]*100+[1]*100+[2]*2):
        vector=rng.normal(0,.003,12);vector[cluster]+=1;vector/=np.linalg.norm(vector);embeddings.append(vector)
        windows.append({'vadRun':i,'timeStart':i*4.,'timeEnd':i*4.+3.,'durationSeconds':3.})
    classified,selection,_=clustering(np.asarray(embeddings,dtype=np.float32),windows)
    assert selection['selectedK']==3 and selection['selectionReliableUnderHeuristic']
    assert all(w['speaker']=='Unassigned' for w in classified[-2:])
    assert all(w['speaker']!='Unassigned' for w in classified[:-2])
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory);audio=root/'synthetic.wav'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=3','-ar',str(RATE),str(audio)],check=True)
        recording_hash=sha(audio)
        try:decoded_recording(audio,root,recording_hash,1)
        except ValueError:pass
        else:raise AssertionError('Over-limit recording accepted.')
        assert not (root/'mono-16khz.f32').exists() and not (root/'decode-pending.f32').exists()
        wavepath,info=decoded_recording(audio,root,recording_hash,4)
        assert info['complete'] and info['durationSeconds']==3 and wavepath.stat().st_size==3*RATE*4
        assert decoded_recording(audio,root,recording_hash,4)[1]==info
        with open(wavepath,'r+b') as f:f.truncate(RATE*4)
        try:decoded_recording(audio,root,recording_hash,4)
        except ValueError:pass
        else:raise AssertionError('Partial cache accepted.')
    progress('self-test-passed',checks=['canonical-export and document normalization','Unicode codepoint anchoring',
             'wrong hash/unmatched alignment/duplicate IDs/raw ASR rejection','automatic three-cluster hypothesis with tiny candidate withheld locally',
             'over-limit decode discarded; larger-limit retry completes; partial cache rejected'],
             limit='Synthetic mechanics; not verified diarization accuracy.')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio',type=Path)
    parser.add_argument('--source-json',type=Path)
    parser.add_argument('--output-dir',type=Path)
    parser.add_argument('--self-test',action='store_true',help='Run synthetic normalization, clustering and decode-cache checks without private audio or downloads.')
    parser.add_argument('--source-id',help='Actual document ID if a project snapshot contains multiple sources.')
    parser.add_argument('--recluster',action='store_true',help='Require cached embeddings and recompute cluster diagnostics.')
    parser.add_argument('--max-audio-seconds',type=float,default=14400,help='Reject recordings beyond this bound (default four hours).')
    args=parser.parse_args()
    if args.self_test:self_test();return
    if not all([args.audio,args.source_json,args.output_dir]):parser.error('--audio, --source-json and --output-dir are required for inference.')
    if not math.isfinite(args.max_audio_seconds) or args.max_audio_seconds<=0:parser.error('Set a positive finite audio-duration bound.')
    doc=normalize_source(json.loads(args.source_json.read_text()),args.source_id)
    source_hash=sha(args.audio)
    if doc['attributes']['Source SHA-256']!=source_hash:raise ValueError('Audio bytes do not match the current source recording SHA-256.')
    root=args.output_dir.resolve();root.mkdir(parents=True,exist_ok=True);root.chmod(0o700)
    model=root/'model';model.mkdir(exist_ok=True)
    from huggingface_hub import hf_hub_download
    for name in MODEL_FILES:
        if not (model/name).is_file():hf_hub_download(MODEL_REPO,name,revision=MODEL_REVISION,token=False,local_dir=model)
    info={'repo':MODEL_REPO,'revision':MODEL_REVISION,'public':True,'gated':False}
    torch.set_num_threads(PARAMS['threads']);torch.manual_seed(PARAMS['randomSeed']);np.random.seed(PARAMS['randomSeed'])
    model_hashes={name:sha(model/name) for name in MODEL_FILES}
    if model_hashes!=MODEL_SHA256:raise ValueError('Cached/downloaded model bytes differ from the pinned public revision; refuse to load them.')
    embedding_parameters={k:PARAMS[k] for k in ['windowSeconds','windowStepSeconds','minimumEmbeddingSeconds','vadThreshold','vadMinimumSpeechMilliseconds','vadMinimumSilenceMilliseconds','vadSpeechPaddingMilliseconds']}
    expected={'recordingSha256':source_hash,'modelFileSha256':model_hashes,'embeddingParameters':embedding_parameters}
    manifest=root/'cache-integrity.json'
    if manifest.exists() and json.loads(manifest.read_text())!=expected:raise ValueError('Output cache belongs to different audio/model/parameters. Use a new output directory.')
    if not manifest.exists() and any((root/f).exists() for f in ['mono-16khz.f32','embeddings.npz','vad-runs.json']):raise ValueError('Existing acoustic cache has no integrity manifest. Use a new output directory.')
    save(manifest,expected)
    provenance={'method':'Local Silero VAD + SpeechBrain ECAPA embeddings + global average-link cosine clustering',
                'machineEstimated':True,'overlapDetection':False,'wordAlignment':False,'identityRecognition':False,'humanReviewed':False,
                'speakerEmbeddingModel':info,'modelFileSha256':model_hashes,
                'vadModel':'silero_vad/data/silero_vad.onnx; packaged ONNX opset 16, CPU',
                'vadModelSha256':sha(Path(silero_vad.__file__).parent/'data/silero_vad.onnx'),
                'dependencies':{n:importlib.metadata.version(n) for n in ['torch','torchaudio','speechbrain','silero-vad','numpy','scipy','scikit-learn','onnxruntime','huggingface-hub']},
                'parameters':PARAMS,'pipelineSha256':sha(Path(__file__)),'recordingSha256':source_hash,
                'sourceTextSha256':hashlib.sha256(doc['text'].encode()).hexdigest(),
                'privateAudioTransmission':'None; only public model weights are downloaded.',
                'validationLimit':'No reference diarization accuracy, listening verification, overlap detector, identity recognition or forced word alignment.'}
    started=time.monotonic();progress('decode-integrity')
    wavepath,decode_info=decoded_recording(args.audio,root,source_hash,args.max_audio_seconds)
    wave=np.memmap(wavepath,dtype=np.float32,mode='r');duration=len(wave)/RATE
    if max(t['timeEnd'] for t in doc['turns'])>duration+.25:raise ValueError('Source timing extends beyond the decoded recording.')
    provenance['recordingDurationSeconds']=duration
    provenance['decodedRecordingIntegrity']=decode_info
    runs_path=root/'vad-runs.json';embpath=root/'embeddings.npz';windows_path=root/'embedding-windows.json'
    if args.recluster and not all(p.exists() for p in [runs_path,embpath,windows_path]):raise ValueError('--recluster requires complete cached acoustic evidence.')
    if not runs_path.exists():
        vad=load_silero_vad(onnx=True)
        runs=get_speech_timestamps(torch.from_numpy(np.array(wave)),vad,sampling_rate=RATE,threshold=PARAMS['vadThreshold'],min_speech_duration_ms=250,min_silence_duration_ms=250,speech_pad_ms=0)
        save(runs_path,runs)
    runs=json.loads(runs_path.read_text())
    if not embpath.exists():
        windows=build_windows(runs)
        if len(windows)>12000:raise ValueError('Global clustering is bounded to 12,000 embedding windows; use a shorter recording or a dedicated scalable diarizer.')
        if not windows:raise ValueError('No sufficiently long VAD speech windows found.')
        encoder=EncoderClassifier.from_hparams(source=str(model),savedir=str(root/'loaded-model'),overrides={'pretrained_path':str(model)},run_opts={'device':'cpu'})
        embeddings=[]
        for offset in range(0,len(windows),PARAMS['batchSize']):
            batch=windows[offset:offset+PARAMS['batchSize']];samples=np.zeros((len(batch),48000),dtype=np.float32);lengths=[]
            for i,w in enumerate(batch):
                clip=wave[w['startSample']:w['endSample']];samples[i,:len(clip)]=clip;lengths.append(len(clip)/48000)
            with torch.inference_mode():emb=encoder.encode_batch(torch.from_numpy(samples),torch.tensor(lengths)).squeeze(1).cpu().numpy()
            embeddings.append(emb)
            if offset%400==0:progress('embeddings',completed=min(offset+len(batch),len(windows)),total=len(windows))
        emb=np.concatenate(embeddings).astype(np.float32);emb/=np.maximum(np.linalg.norm(emb,axis=1,keepdims=True),1e-9)
        np.savez_compressed(embpath,embeddings=emb);embpath.chmod(0o600);save(windows_path,windows)
    else:emb=np.load(embpath)['embeddings'];windows=json.loads(windows_path.read_text())
    if len(windows)>12000 or emb.shape!=(len(windows),192) or not np.isfinite(emb).all():raise ValueError('Cached embedding dimensions/material are invalid or exceed the clustering bound.')
    windows,selection,alternatives=clustering(emb,windows)
    regular=intervals(runs,windows);assignments=map_turns(doc,regular)
    speech_seconds=sum((r['end']-r['start'])/RATE for r in runs)
    accepted=sum(iv['timeEnd']-iv['timeStart'] for iv in regular if iv['speaker']!='Unassigned')
    provenance.update({'modelCountSelection':selection,'coverage':{'vadSpeechSeconds':speech_seconds,'acceptedAnonymousSpeechSeconds':accepted,
                      'acceptedFractionOfVadSpeech':accepted/speech_seconds if speech_seconds else 0.,'sourceTurnCount':len(assignments),
                      'anonymousProposedTurnCount':sum(a['speaker']!='Unassigned' for a in assignments),'unassignedTurnCount':sum(a['speaker']=='Unassigned' for a in assignments)}})
    run_id=f'local-ecapa-{source_hash[:12]}-{provenance["pipelineSha256"][:10]}'
    diarization={'sourceId':doc['id'],'recordingKey':doc['mediaKey'],'runId':run_id,'units':'seconds','regular':regular,'exclusive':[],'provenance':provenance}
    artifact={'format':'qualityer-local-anonymous-speaker-proposal','version':1,'documentId':doc['id'],'sourceRevision':doc['revision'],
              'runId':run_id,'diarization':diarization,'assignments':assignments,'modelCountSelection':selection,
              'status':'Machine acoustic proposal; researcher listening review pending','humanReviewed':False,'sourceMutated':False,
              'reviewNeeds':['Counts are acoustic hypotheses, not verified people counts; labels have no inferred names or roles.',
                             'No overlap detector or word alignment ran. Margins are not calibrated accuracy.',
                             'A dominant whole-ASR-turn proposal can still contain unresolved material; inspect exact timing and surrounding audio.',
                             'Processing permission does not establish participant publication consent.'],
              'elapsedSeconds':time.monotonic()-started}
    save(root/'speaker-proposal.json',artifact);save(root/'alternative-clusterings.json',alternatives)
    save(root/'window-diagnostics.json',windows);save(root/'pipeline-provenance.json',provenance)
    # Keep operations within the app's 2 MB application bound. Full review
    # diagnostics remain in the separate proposal and cached evidence files.
    slim={**diarization,'regular':[{k:iv[k] for k in ['id','speaker','timeStart','timeEnd']} for iv in regular]}
    operation={'type':'source.diarization.apply','data':{'id':doc['id'],'sourceRevision':doc['revision'],'diarization':slim,
               'assignments':[{k:a[k] for k in ['turnId','speaker','dominantShare','coverage','reason']} for a in assignments],
               'note':'Local whole-recording anonymous acoustic proposals. Machine estimates; researcher review pending. No verified identities, overlap detection or forced word alignment. Uncertain source segments remain Unassigned.'}}
    if len(json.dumps(operation['data'],ensure_ascii=False,separators=(',',':')).encode())>2_000_000:raise ValueError('Application exceeds the domain 2 MB bound; detailed review artifacts are retained but no apply operation is emitted.')
    save(root/'apply-operation.json',operation)
    progress('complete',**provenance['coverage'],selectedAcousticHypothesis=selection['selectedK'])

if __name__=='__main__':main()
