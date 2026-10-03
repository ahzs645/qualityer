import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCodebookCSV,previewCodebookCSV,exportCodebookCSV} from '../src/codebook-csv.mjs';
test('CSV preserves quoted newlines, commas, escaped quotes, BOM and CRLF',()=>{
  const result=previewCodebookCSV('\uFEFFtag,description\r\n"Access, care","first\nsecond ""quote"""\r\n');
  assert.deepEqual(result.errors,[]);assert.equal(result.codes[0].name,'Access, care');assert.equal(result.codes[0].description,'first\nsecond "quote"');
});
test('paths are literal by default; explicit hierarchy produces parent-first IDs',()=>{
  const text='path,description\nAccess/Transport,Child\nAccess,Parent';
  assert.equal(previewCodebookCSV(text).codes[0].name,'Access/Transport');
  const nested=previewCodebookCSV(text,{codes:[]},{separator:'/'});
  assert.equal(nested.codes[0].name,'Access');assert.equal(nested.codes[0].description,'Parent');assert.equal(nested.codes[1].parentId,nested.codes[0].id);
});
test('inferred parents are non-codable; explicit parent rows keep their description',()=>{
  const p=previewCodebookCSV('tag,description\nA/B/C,leaf',{codes:[]},{separator:'/'});
  assert.deepEqual(p.codes.map(c=>c.codable),[false,false,true]);assert.equal(p.codes[2].parentId,p.codes[1].id);
});
test('existing ancestors are reused without rewriting definitions',()=>{
  const state={codes:[{id:'existing',name:'A',description:'Old'}]};
  const p=previewCodebookCSV('tag,description\nA/B,leaf\nA,New',state,{separator:'/'});
  assert.equal(p.codes.length,1);assert.equal(p.codes[0].parentId,'existing');assert.match(p.warnings.join(' '),/retained/);assert.equal(state.codes[0].description,'Old');
});
test('duplicate identical paths collapse; conflicts and ambiguous headers reject',()=>{
  assert.equal(previewCodebookCSV('tag,description\nA,one\nA,one').codes.length,1);
  assert.equal(previewCodebookCSV('tag,description\nA,one\nA,two').errors.length,1);
  assert.throws(()=>previewCodebookCSV('tag,name\nA,B'),/exactly one/);
  assert.throws(()=>parseCodebookCSV('tag\n"unclosed'),/Unclosed/);
  assert.throws(()=>parseCodebookCSV('tag\n"closed"garbage'),/Unexpected/);
});
test('empty paths and ambiguous existing definitions never silently merge',()=>{
  assert.equal(previewCodebookCSV('tag,description\n,empty').errors.length,1);
  assert.equal(previewCodebookCSV('tag\nA//B',{codes:[]},{separator:'/'}).errors.length,1);
  assert.equal(previewCodebookCSV('tag\nA',{codes:[{id:'1',name:'A'},{id:'2',name:'A'}]}).errors.length,1);
});
test('Taguette-compatible export/import retains Unicode paths/descriptions and active counts',()=>{
  const state={codes:[{id:'a',name:'Health',description:'"Definition"'},{id:'b',name:'Équité',description:'two\nlines',parentId:'a'}],codings:[{id:'1',codeId:'b',documentId:'d'},{id:'2',codeId:'b',documentId:'d',deletedAt:'date'}]};
  const text=exportCodebookCSV(state),rows=parseCodebookCSV(text);
  assert.deepEqual(rows[2],['Health/Équité','two\nlines','1','1']);
  const p=previewCodebookCSV(text,{codes:[]},{separator:'/'});assert.deepEqual(p.errors,[]);assert.equal(p.codes[1].description,'two\nlines');assert.equal(p.codes[1].parentId,p.codes[0].id);
});
test('unsafe structural ambiguity is rejected and formula neutralization is opt-in',()=>{
  assert.throws(()=>exportCodebookCSV({codes:[{id:'a',name:'A/B'}]}),/separator/);
  const state={codes:[{id:'a',name:'=1+1',description:'@formula'}]};
  assert.equal(parseCodebookCSV(exportCodebookCSV(state))[1][0],'=1+1');
  assert.equal(parseCodebookCSV(exportCodebookCSV(state,{spreadsheetSafe:true}))[1][0],"'=1+1");
});
