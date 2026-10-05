import test from 'node:test';
import assert from 'node:assert/strict';
import {RAMP,heatBand,heatStyle,heatLegend,contrastRatio,readableOn,luminance} from '../src/heatmap-ramp.mjs';

test('every band has readable text at WCAG AA (4.5:1)',()=>{
 for(const c of RAMP)assert.ok(contrastRatio(c,readableOn(c))>=4.5,c+' '+contrastRatio(c,readableOn(c)).toFixed(2));
});
test('the ramp darkens monotonically so order is visible without hue',()=>{
 for(let i=1;i<RAMP.length;i++)assert.ok(luminance(RAMP[i])<luminance(RAMP[i-1]),RAMP[i]);
});
test('bands map zero to unshaded and the maximum to the darkest band',()=>{
 assert.equal(heatBand(0,10),null);assert.equal(heatBand(NaN,10),null);assert.equal(heatBand(3,0),null);
 assert.equal(heatBand(10,10),RAMP.length-1);assert.equal(heatBand(0.0001,10),0);assert.equal(heatBand(20,10),RAMP.length-1);
 assert.equal(heatStyle(0,10).background,'#ffffff');assert.equal(heatStyle(10,10).background,RAMP.at(-1));
});
test('legend covers 0 to max in equal bands',()=>{
 const l=heatLegend(8);assert.equal(l.length,RAMP.length);assert.equal(l[0].from,0);assert.equal(l.at(-1).to,8);
 assert.deepEqual(heatLegend(0),[]);
});
test('contrast handles rgb() colours',()=>{assert.ok(Math.abs(contrastRatio('rgb(0,0,0)','#fff')-21)<1e-9);});
