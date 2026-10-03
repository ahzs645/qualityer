"""Synthetic ffmpeg and labelled model-contract doubles. These do not test inference accuracy."""
import copy,io,json,os,subprocess,sys,tempfile,unittest,wave
from pathlib import Path
from global_recording import prepare_recording,resource_limits,global_eligible,absolute_times,assign_global_speakers,global_diarization

class Frame:
    def __init__(self,rows):self.rows=rows
    def iterrows(self):return iter(enumerate(self.rows))

def audio(path,seconds=3.1):
    with wave.open(str(path),'wb') as recording:recording.setnchannels(2);recording.setsampwidth(2);recording.setframerate(8000);recording.writeframes(b'\0\0\0\0'*round(seconds*8000))

class GlobalRecordingTests(unittest.TestCase):
    def test_actual_ffmpeg_parts_cover_whole_recording(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'input.wav';audio(source);limits=resource_limits({'TRANSCRIPTION_CHUNK_SECONDS':'1'})
            result=prepare_recording(source,Path(folder)/'prepared',True,limits)
            self.assertGreater(len(result['parts']),2);self.assertEqual(result['parts'][0]['start'],0)
            self.assertAlmostEqual(result['parts'][-1]['end'],3.1,places=4)
            self.assertTrue(all(left['end']==right['start'] for left,right in zip(result['parts'],result['parts'][1:])))
    def test_global_limits_leave_transcription_only_available(self):
        limits=resource_limits({'DIARIZATION_MAX_HOURS':'0.0003','DIARIZATION_MAX_WAVEFORM_MB':'0.05','TRANSCRIPTION_CHUNK_SECONDS':'1'})
        with self.assertRaises(ValueError):global_eligible(3.1,limits)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'input.wav';audio(source)
            with self.assertRaises(ValueError):prepare_recording(source,Path(folder)/'diarization',True,limits)
            result=prepare_recording(source,Path(folder)/'transcription',False,limits);self.assertAlmostEqual(result['duration'],3.1,places=4)
        for value in ['0','-1','nan','inf','no']:
            with self.assertRaises(ValueError):resource_limits({'DIARIZATION_MAX_HOURS':value})
    def test_one_global_call_on_file_with_anonymous_hints(self):
        calls=[]
        class ContractDiarizer:
            def __init__(self,**options):calls.append(('init',options))
            def __call__(self,path,**hints):calls.append(('call',path,hints));return Frame([{'start':0,'end':1.125,'speaker':'GLOBAL_00'},{'start':.75,'end':2,'speaker':'GLOBAL_01'}])
        frame,tracks=global_diarization({'path':Path('/contract/complete.wav'),'duration':2},{'numSpeakers':2},'cpu',ContractDiarizer,'synthetic-test-token',resource_limits())
        self.assertEqual(len([call for call in calls if call[0]=='call']),1);self.assertEqual(calls[1][1],'/contract/complete.wav');self.assertEqual(calls[1][2],{'num_speakers':2})
        self.assertEqual(tracks['regular'][0]['timeStart'],0);self.assertEqual(tracks['regular'][0]['timeEnd'],1.125);self.assertEqual(tracks['scope'],'whole-recording');self.assertFalse(tracks['exclusive_available']);self.assertEqual(tracks['exclusive'],[])
    def test_absolute_assignment_preserves_zero_null_missing_fractional_bounds(self):
        local={'segments':[{'start':0,'end':.25,'text':'sample','words':[{'word':'sample','start':0,'end':.25},{'word':'unknown','start':None},{'word':'missing'}]},{'text':'untimed','start':None,'words':[{'word':'unknown','start':None,'end':None}]}]}
        global_result=absolute_times(local,1200.125);self.assertEqual(global_result['segments'][0]['start'],1200.125);self.assertEqual(global_result['segments'][0]['end'],1200.375)
        calls=[]
        class ContractAssignment:
            @staticmethod
            def assign_word_speakers(frame,result,fill_nearest):
                calls.append(copy.deepcopy(result));self.assertFalse(fill_nearest)
                for segment in result['segments']:
                    self.assertGreaterEqual(segment['start'],1200);segment['speaker']='GLOBAL_01'
                    for word in segment.get('words',[]):self.assertIsNotNone(word.get('start'));word['speaker']='GLOBAL_01'
                return result
        assigned=assign_global_speakers(ContractAssignment,Frame([]),global_result);self.assertEqual(len(calls),1);self.assertEqual(assigned['segments'][0]['speaker'],'GLOBAL_01');self.assertNotIn('speaker',assigned['segments'][0]['words'][1]);self.assertNotIn('speaker',assigned['segments'][1]);self.assertIsNone(assigned['segments'][0]['words'][1]['start']);self.assertNotIn('end',assigned['segments'][0]['words'][1]);self.assertEqual(local['segments'][0]['start'],0)
    def test_out_of_recording_global_track_is_rejected(self):
        class InvalidDiarizer:
            def __init__(self,**kwargs):pass
            def __call__(self,*args,**kwargs):return Frame([{'start':0,'end':20,'speaker':'S'}])
        with self.assertRaises(ValueError):global_diarization({'path':'contract','duration':2},{},'cpu',InvalidDiarizer,'synthetic-test-token')
    def test_inference_cli_contract_two_plus_chunks_one_global_diarizer(self):
        # This subprocess uses real ffmpeg and a visibly test-only whisperx package.
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder);source=folder/'input.wav';audio(source);package=folder/'whisperx';package.mkdir();log=folder/'contract.jsonl'
            (package/'__init__.py').write_text('''"""TEST ONLY model-contract double, no accuracy or model execution."""
import json,os,copy,wave
from .diarize import Frame
class Model:
 def transcribe(self,audio,batch_size,**kwargs):return {'language':'en','segments':[{'start':0,'end':min(.1,audio),'text':'contract fixture','words':[{'word':'timed','start':0,'end':min(.1,audio)},{'word':'untimed','start':None,'end':None}]}]}
def load_model(*args,**kwargs):return Model()
def load_audio(path):
 with wave.open(path) as wav:return wav.getnframes()/wav.getframerate()
def load_align_model(language_code,device):return ('model',{'language':language_code})
def align(segments,*args,**kwargs):return {'segments':copy.deepcopy(segments)}
def assign_word_speakers(frame,result,fill_nearest=False):
 assert fill_nearest is False
 for segment in result['segments']:
  intersections=[(min(segment['end'],row['end'])-max(segment['start'],row['start']),row['speaker']) for row in frame.rows]
  length,speaker=max(intersections)
  if length>0:
   segment['speaker']=speaker
   for word in segment.get('words',[]):word['speaker']=speaker
 return result
''')
            (package/'diarize.py').write_text('''"""TEST ONLY global diarizer double; records that one complete file was supplied."""
import json,os,wave
class Frame:
 def __init__(self,rows):self.rows=rows
 def iterrows(self):return iter(enumerate(self.rows))
class DiarizationPipeline:
 def __init__(self,**kwargs):pass
 def __call__(self,path,**kwargs):
  assert isinstance(path,str)
  with wave.open(path) as audio:duration=audio.getnframes()/audio.getframerate()
  with open(os.environ['CONTRACT_LOG'],'a') as log:log.write(json.dumps({'kind':'model-contract-double','duration':duration,'hints':kwargs})+'\\n')
  return Frame([{'start':0,'end':duration/2,'speaker':'GLOBAL_A'},{'start':duration/2,'end':duration,'speaker':'GLOBAL_B'}])
''')
            env={**os.environ,'PYTHONPATH':str(folder),'HF_TOKEN':'synthetic-test-token','TRANSCRIPTION_CHUNK_SECONDS':'1','CONTRACT_LOG':str(log),'WHISPER_DEVICE':'cpu'}
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('inference.py')),str(source),json.dumps({'diarize':True,'numSpeakers':2})],env=env,capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr);output=json.loads(result.stdout);calls=[json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual(len(calls),1);self.assertAlmostEqual(calls[0]['duration'],3.1,places=4);self.assertEqual(calls[0]['hints'],{'num_speakers':2})
            self.assertGreater(len(output['chunks']),2);self.assertEqual(output['segments'][0]['speaker'],'GLOBAL_A');self.assertEqual(output['segments'][-1]['speaker'],'GLOBAL_B');self.assertEqual(output['segments'][0]['start'],0)
            self.assertGreater(output['segments'][-1]['start'],2);self.assertTrue(all(segment['words'][1]['start'] is None for segment in output['segments']));self.assertEqual(output['speaker_tracks']['scope'],'whole-recording');self.assertFalse(output['speaker_tracks']['exclusive_available']);self.assertIn('@research-stage:diarizing',result.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
