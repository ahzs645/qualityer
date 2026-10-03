import {sourceByteProvenance} from './source-text-import.mjs';
export const OCR_LIMITS={bytes:16*1024*1024,pixels:12000000,pages:12,maxPageEdge:2400};
export function assertOCRInput(file){if(!file||file.size>OCR_LIMITS.bytes)throw Error('Local OCR accepts files up to 16 MiB.');if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))return 'pdf';if(/^image\/(png|jpeg|webp|bmp)$/.test(file.type))return 'image';throw Error('Local OCR supports PNG, JPEG, WebP, BMP and PDFs.');}
export async function recognizeLocalSource(file,{language='eng',onProgress=()=>{},signal}={}){
 const kind=assertOCRInput(file);if(language!=='eng')throw Error('This build bundles English OCR only. Select an English source or import corrected text.');
 let worker,pdf,bitmap,canvas,aborted=false,rejectAbort;
 const cancellation=new Promise((_,reject)=>{rejectAbort=reject;});cancellation.catch(()=>{});
 const cancellable=promise=>Promise.race([promise,cancellation]);
 const check=()=>{if(signal?.aborted||aborted)throw Error('Local OCR cancelled.');};
 const abort=()=>{aborted=true;rejectAbort(Error('Local OCR cancelled.'));if(worker)worker.terminate().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 const progress=(status,percent)=>onProgress({status,percent});
 try{
  check();const bytes=new Uint8Array(await file.arrayBuffer());
  if(kind==='pdf'){
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdfWorker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs');globalThis.pdfjsWorker=pdfWorker;
   pdf=await pdfjs.getDocument({data:bytes.slice(),useWorkerFetch:false,isEvalSupported:false}).promise;
   if(pdf.numPages>OCR_LIMITS.pages)throw Error('Local OCR is limited to 12 PDF pages per source. Split longer PDFs before import.');
  }else{bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>OCR_LIMITS.pixels)throw Error('Local OCR is limited to 12 megapixels. Resize this image before import.');}
  check();const engine=await import('tesseract.js/dist/tesseract.esm.min.js'),createWorker=engine.default?.createWorker||engine.createWorker;
  const assets=new URL((import.meta.env?.BASE_URL||'/')+'ocr/tesseract-7-v1/',location.origin).href;
  const workerReady=createWorker(language,1,{workerPath:assets+'worker.min.js',corePath:assets+'tesseract-core-lstm.wasm.js',langPath:assets,gzip:true,workerBlobURL:false,cacheMethod:'none',logger:event=>{if(!aborted)progress(event.status,Math.round((event.progress||0)*100));}});
  workerReady.then(value=>{if(aborted)value.terminate().catch(()=>{});else worker=value;}).catch(()=>{});worker=await cancellable(workerReady);
  check();await cancellable(worker.setParameters({preserve_interword_spaces:'1'}));
  let text='';const pages=[],confidence=[];
  const count=kind==='pdf'?pdf.numPages:1;
  for(let number=1;number<=count;number++){
   check();canvas=document.createElement('canvas');let width,height;
   if(kind==='pdf'){
    const page=await pdf.getPage(number),base=page.getViewport({scale:1}),scale=Math.min(2,OCR_LIMITS.maxPageEdge/Math.max(base.width,base.height)),viewport=page.getViewport({scale});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);width=base.width;height=base.height;
    if(canvas.width*canvas.height>OCR_LIMITS.pixels)throw Error('PDF page exceeds the OCR pixel limit.');
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   }else{canvas.width=bitmap.width;canvas.height=bitmap.height;width=bitmap.width;height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);}
   progress('Recognizing page '+number+' of '+count,0);const {data}=await cancellable(worker.recognize(canvas,{}, {text:true}));check();
   if(text&&!text.endsWith('\n'))text+='\n';const start=Array.from(text).length;text+=data.text;
   if(text.length>2000000)throw Error('Recognized text exceeds the two-million-unit source limit.');
   pages.push({page:number,start,end:Array.from(text).length,width,height});confidence.push({page:number,confidence:data.confidence});canvas.width=0;canvas.height=0;canvas=null;
  }
  const warnings=['OCR ran locally in your browser with the bundled English Tesseract model. No source image was sent to a processing service. Text may contain recognition errors; inspect and correct it before coding. Layout, typography and reading order are approximate.'];
  if(!text.trim())warnings.push('The OCR engine did not identify readable text. Importing an empty transcript will not create text evidence.');
  return {text,turns:[],pages:kind==='pdf'?pages:[],direction:'auto',warnings,reviewStatus:'Pending',importProvenance:await sourceByteProvenance(bytes,file,'local-ocr',{engine:'tesseract.js',engineVersion:'7.0.0',language,confidence,losses:warnings}),ocr:{engine:'tesseract.js',engineVersion:'7.0.0',language,confidence,status:'unreviewed',processedLocally:true}};
 }catch(error){if(aborted||signal?.aborted)throw Error('Local OCR cancelled.');throw error instanceof Error?error:Error(String(error));}
 finally{signal?.removeEventListener('abort',abort);if(canvas){canvas.width=0;canvas.height=0;}bitmap?.close();if(pdf)await pdf.destroy();if(worker)await worker.terminate().catch(()=>{});}
}
