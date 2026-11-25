import test from 'node:test';
import assert from 'node:assert/strict';
import {STOPWORD_LANGUAGES,stopwordSet,normalizeWord} from '../src/stopwords.mjs';
import {words} from '../src/analysis-domain.mjs';

test('every offered language has a non-trivial lower-case stop list except none',()=>{
 for(const [code] of STOPWORD_LANGUAGES){const set=stopwordSet(code);if(code==='none'){assert.equal(set.size,0);continue;}
  assert.ok(set.size>=60,code+' has '+set.size);for(const w of set)assert.equal(w,normalizeWord(w),code+':'+w);}
});
test('stop lists drop grammatical words but keep content words, including curly apostrophes',()=>{
 const doc=(text)=>({id:'d',text,reviewFlags:[]});
 const terms=(text,language)=>words({},[doc(text)],{language}).map(r=>r.term).sort();
 assert.deepEqual(terms('We don’t trust the funding model',"en"),['funding','model','trust']);
 assert.deepEqual(terms('Die Forschung und die Gemeinschaft',"de"),['forschung','gemeinschaft']);
 assert.deepEqual(terms('la comunità e la ricerca',"it"),['comunità','ricerca']);
 assert.deepEqual(terms('это наше исследование',"ru"),['исследование']);
 assert.ok(terms('the the funding','none').includes('the'));
 assert.deepEqual(terms('Funding funding model','en',{}),['funding','model']);
});
test('custom words are added to the built-in list',()=>{
 assert.deepEqual(words({},[{id:'d',text:'Northern health research',reviewFlags:[]}],{language:'en',custom:'northern, health'}).map(r=>r.term),['research']);
});
