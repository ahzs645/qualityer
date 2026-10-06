import test from 'node:test';
import assert from 'node:assert/strict';
test('imported copies of an existing study get a distinct dated name',async()=>{
 const {distinctImportName}=await import('../src/processing-domain.mjs');
 const d=new Date('2026-10-05T12:00:00Z');
 assert.equal(distinctImportName('Study A',['Other'],d),'Study A');
 assert.equal(distinctImportName('Study A',['Study A'],d),'Study A (imported 2026-10-05)');
 assert.equal(distinctImportName('Study A',['Study A','Study A (imported 2026-10-05)'],d),'Study A (imported 2026-10-05 #2)');
});
