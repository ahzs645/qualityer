import test from 'node:test';
import assert from 'node:assert/strict';
import {splitBoxes} from '../src/hierarchy-layout.mjs';
test('split boxes keep areas proportional, stay inside the parent and avoid slivers',()=>{
 const weights=[5,3,2,1,1,1,1,1,1,1,1,1],box={x:0,y:0,width:1000,height:500},boxes=splitBoxes(weights,box),total=weights.reduce((a,b)=>a+b,0);
 assert.equal(boxes.length,weights.length);
 boxes.forEach((b,i)=>{assert.ok(Math.abs(b.width*b.height-500000*weights[i]/total)<1e-6);assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1000+1e-9&&b.y+b.height<=500+1e-9);assert.ok(Math.max(b.width/b.height,b.height/b.width)<4);});
 assert.deepEqual(splitBoxes([],box),[]);assert.deepEqual(splitBoxes([7],box),[box]);
});
