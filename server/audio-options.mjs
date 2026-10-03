// Reproducible job contract: count hints guide a model and never establish identity.
export function normalizeAudioOptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid transcription options.');
 const out={diarize:input.diarize===true};
 if(input.diarize!==undefined&&typeof input.diarize!=='boolean')throw Error('Diarization must be a boolean.');
 for(const key of ['numSpeakers','minSpeakers','maxSpeakers'])if(input[key]!=null&&input[key]!==''){if(!Number.isInteger(input[key])||input[key]<1||input[key]>100)throw Error('Speaker hints must be integer counts from 1 to 100.');out[key]=input[key];}
 if(out.numSpeakers!=null&&(out.minSpeakers!=null||out.maxSpeakers!=null))throw Error('Choose an exact speaker count or minimum/maximum bounds.');
 if(out.minSpeakers!=null&&out.maxSpeakers!=null&&out.minSpeakers>out.maxSpeakers)throw Error('Minimum speaker count exceeds maximum.');
 if(!out.diarize&&['numSpeakers','minSpeakers','maxSpeakers'].some(key=>out[key]!=null))throw Error('Speaker count hints require diarization.');
 if(input.language!=null&&input.language!==''){if(typeof input.language!=='string'||!/^([a-z]{2,3})(-[A-Za-z]{2,4})?$/u.test(input.language))throw Error('Use a language code such as en or fr.');out.language=input.language;}
 if(input.batchSize!=null){if(!Number.isInteger(input.batchSize)||input.batchSize<1||input.batchSize>64)throw Error('Batch size must be an integer from 1 to 64.');out.batchSize=input.batchSize;}
 return out;
}
export function audioStage(status,worker={}){
 const allowed=['queued','running','decoding','loading_model','transcribing','aligning','diarizing','validating','completed','failed','cancelled'];
 return {stage:['completed','failed','cancelled'].includes(status)?status:allowed.includes(worker.stage)?worker.stage:({submitting:'queued'}[status]||status),progress:status==='completed'?100:null};
}
