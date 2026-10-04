import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFileType} from '../src/media-file.mjs';
test('Drive interview MIME variants and unknown browser types resolve to supported containers',()=>{
 assert.equal(mediaFileType({name:'Sarah.m4a',type:'audio/x-m4a'}),'audio/mp4');
 assert.equal(mediaFileType({name:'Margot.qta',type:'audio/x-quicktime'}),'audio/quicktime');
 assert.equal(mediaFileType({name:'Margot.QTA',type:''}),'audio/quicktime');
 assert.equal(mediaFileType({name:'Sarah.m4a',type:'application/octet-stream'}),'audio/mp4');
 assert.equal(mediaFileType({name:'unsafe.m4a',type:'text/html'}),'text/html');
 assert.equal(mediaFileType({name:'unknown.bin',type:''}),'');
});
