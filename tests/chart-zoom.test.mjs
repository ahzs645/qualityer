import test from 'node:test';
import assert from 'node:assert/strict';
import {parseViewBox,formatViewBox,clampView,zoomView,panView,zoomLevel,inertSvg,interactiveChartHtml,MAX_ZOOM} from '../src/chart-zoom.mjs';
const base={x:0,y:0,w:800,h:400};
test('view boxes parse and format',()=>{assert.deepEqual(parseViewBox('0 0 800 400'),base);assert.equal(parseViewBox('0 0 0 10'),null);assert.equal(parseViewBox(null),null);assert.equal(formatViewBox({x:1.23456,y:0,w:10,h:5}),'1.235 0 10 5');});
test('zoom keeps the anchor point fixed and the aspect ratio',()=>{
 const v=zoomView(base,null,2,{x:200,y:100});assert.equal(v.w,400);assert.equal(v.h,200);
 // the anchor keeps its relative position: (200-0)/800 === (200-v.x)/400
 assert.ok(Math.abs((200-v.x)/v.w-200/800)<1e-9);assert.equal(zoomLevel(base,v),2);
});
test('zoom is limited between 1x and the maximum and stays inside the chart',()=>{
 let v=null;for(let i=0;i<30;i++)v=zoomView(base,v,2);assert.equal(zoomLevel(base,v),MAX_ZOOM);
 v=zoomView(base,v,1/1000);assert.deepEqual(v,base);
 const corner=zoomView(base,null,4,{x:800,y:400});assert.ok(corner.x+corner.w<=800+1e-9&&corner.y+corner.h<=400+1e-9);
});
test('pan is clamped to the chart bounds',()=>{const v=zoomView(base,null,2);assert.deepEqual(panView(base,v,-5000,-5000),{x:0,y:0,w:400,h:200});assert.deepEqual(panView(base,v,5000,5000),{x:400,y:200,w:400,h:200});assert.deepEqual(clampView(base,{x:-1,y:-1,w:9999,h:1}),base);});
test('exported HTML is inert apart from its own script and escapes text',()=>{
 const svg='<svg viewBox="0 0 10 10" onclick="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect onmouseover="x()"/></a><foreignObject><div>x</div></foreignObject><title>A &amp; B</title></svg>';
 const clean=inertSvg(svg);assert.doesNotMatch(clean,/onclick|onmouseover|<script|javascript:|foreignObject/i);
 const html=interactiveChartHtml({title:'<Theme> map',caption:'scope "x"',svg,rows:[['Code','Count'],['<b>One</b>',3]]});
 assert.match(html,/<title>&lt;Theme&gt; map<\/title>/);assert.match(html,/scope &quot;x&quot;/);assert.match(html,/&lt;b&gt;One&lt;\/b&gt;/);
 assert.equal((html.match(/<script>/g)||[]).length,1);assert.doesNotMatch(html,/alert\(/);assert.doesNotMatch(html,/https?:\/\/(?!www\.w3\.org)/);
});
