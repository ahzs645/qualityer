import {createRequire} from 'node:module';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),root=path.resolve(process.env.RESEARCH_OCR_ASSET_ROOT||'public/ocr/tesseract-7-v1');
await mkdir(root,{recursive:true});
const files={
 'worker.min.js':require.resolve('tesseract.js/dist/worker.min.js'),
 'tesseract-core-lstm.wasm.js':require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js'),
 'eng.traineddata.gz':require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
};
for(const [name,source]of Object.entries(files))await copyFile(source,path.join(root,name));
await writeFile(path.join(root,'NOTICE.txt'),'Locally hosted OCR assets: Tesseract.js 7.0.0 (Apache-2.0), tesseract.js-core 6.1.2 (Apache-2.0), English Tesseract 4 LSTM integer trained data from @tesseract.js-data/eng 1.0.0 (package declared MIT; upstream Tesseract trained data Apache-2.0). See https://github.com/naptha/tesseract.js and https://github.com/tesseract-ocr/tessdata_best. No interview data is included.\n');
await copyFile(require.resolve('tesseract.js/LICENSE.md'),path.join(root,'LICENSE-tesseract-js.txt'));
await copyFile(require.resolve('tesseract.js-core/LICENSE'),path.join(root,'LICENSE-tesseract-core.txt'));
console.log('Prepared local OCR worker, WebAssembly core and English trained data.');
