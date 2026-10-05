import test from 'node:test';
import assert from 'node:assert/strict';
import {svgDimensions,cappedScale,pngSize,sizedSvgMarkup,withCaption,wrapCaption,inlineStyleText,INLINE_STYLE_PROPERTIES,MAX_CANVAS_SIDE,MAX_CANVAS_AREA} from '../src/image-export.mjs';
import {coverageSVG} from '../src/coverage-profile.mjs';

test('Chart dimensions come from absolute width/height, then the viewBox, then the browser default',()=>{
  assert.deepEqual(svgDimensions('<svg xmlns="http://www.w3.org/2000/svg" width="640px" height="480" viewBox="0 0 10 10"/>'),{width:640,height:480});
  assert.deepEqual(svgDimensions('<?xml version="1.0"?><svg viewBox="0 0 1100 194" role="img"><rect/></svg>'),{width:1100,height:194});
  assert.deepEqual(svgDimensions("<svg viewBox='-20,-10, 540 270' width='100%' height='100%'></svg>"),{width:540,height:270});
  assert.deepEqual(svgDimensions('<svg width="300" viewBox="0 0 600 200"></svg>'),{width:300,height:100});
  assert.deepEqual(svgDimensions('<svg aria-label="a > b" height="50" viewBox="0 0 600 200"></svg>'),{width:150,height:50});
  assert.deepEqual(svgDimensions('<svg viewBox="0 0 0 10"></svg>'),{width:300,height:150});
  assert.deepEqual(svgDimensions('<svg stroke-width="9" width="20em" height="10em"></svg>'),{width:300,height:150});
  assert.throws(()=>svgDimensions('<div></div>'),/No <svg>/);
});

test('PNG scale is capped by canvas side and area limits without exceeding the request',()=>{
  assert.equal(cappedScale(1000,500,2),2);
  assert.equal(cappedScale(10000,100,2),1.638);
  assert.equal(cappedScale(100,40000,3),0.409);
  const area=cappedScale(4000,4000,4);assert.ok(4000*area*4000*area<=MAX_CANVAS_AREA);assert.equal(area,1.024);
  assert.equal(cappedScale(500,500,2,{maxSide:600}),1.2);
  assert.equal(cappedScale(500,500,0),1);
  assert.throws(()=>cappedScale(0,10),/no measurable size/);
  const size=pngSize('<svg viewBox="0 0 1100 9000"></svg>');assert.ok(size.reduced);assert.ok(size.width<=MAX_CANVAS_SIDE&&size.height<=MAX_CANVAS_SIDE&&size.width*size.height<=MAX_CANVAS_AREA);
  assert.deepEqual(pngSize('<svg viewBox="0 0 540 540"></svg>'),{width:1080,height:1080,scale:2,reduced:false});
});

test('Sizing for rasterizing rewrites only the root tag and preserves XML escaping byte-for-byte',()=>{
  const body='<title>Codes &amp; themes &lt;draft&gt;</title><text stroke-width="2" font-size="12">&quot;Quote&quot; &#x2014; R&amp;D</text>';
  const out=sizedSvgMarkup(`<svg viewBox="0 0 200 100" width="100%" aria-label="a &gt; b">${body}</svg>`);
  assert.equal(out,`<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" aria-label="a &gt; b">${body}</svg>`);
  assert.equal(sizedSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 2"/>',{width:8,height:4}),'<svg width="8" height="4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 2"/>');
});

test('Captions are wrapped, escaped and kept in desc; the existing coverage SVG keeps its escaped provenance',()=>{
  assert.deepEqual(wrapCaption('alpha beta gamma delta',11),['alpha beta','gamma delta']);
  assert.equal(wrapCaption('x '.repeat(100),3,2).length,2);
  const svg=withCaption('<svg viewBox="0 0 700 300"><text>A &amp; B</text></svg>','Study <Pilot> & "Team" · filters {"coder":"R&D"}'),dims=svgDimensions(svg);
  assert.equal(dims.width,700);assert.ok(dims.height>300);
  assert.match(svg,/<desc>Study &lt;Pilot&gt; &amp; &quot;Team&quot; · filters \{&quot;coder&quot;:&quot;R&amp;D&quot;\}<\/desc>/);
  assert.match(svg,/<text>A &amp; B<\/text>/);assert.doesNotMatch(svg,/<Pilot>|R&D/);
  assert.equal(withCaption('<svg viewBox="0 0 10 10"></svg>',''),'<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
  const profile={method:'Union & <method>',filters:{text:'"a"'},codeRows:[{name:'Code <1> & co',cells:[{sourceName:'S&P',coveredCodepoints:1,eligibleCodepoints:2,applications:1,coveragePercent:50}]}]};
  const coverage=coverageSVG(profile,{scope:'Scope <x>'}),sized=sizedSvgMarkup(coverage);
  assert.equal(sized.slice(sized.indexOf('>')),coverage.slice(coverage.indexOf('>')));assert.match(sized,/Code &lt;1&gt; &amp; co · S&amp;P/);assert.deepEqual(svgDimensions(coverage),{width:1100,height:194});
});

test('Inlined computed styles keep paint and font properties and drop defaults',()=>{
  for(const p of ['fill','stroke','stroke-width','font-family','font-size','font-weight','text-anchor'])assert.ok(INLINE_STYLE_PROPERTIES.includes(p));
  const computed={fill:'rgb(68, 126, 150)',stroke:'none','stroke-width':'2px','fill-opacity':'1',opacity:'0.5',display:'inline','font-family':'Inter, sans-serif','font-size':'12px','text-anchor':'middle','font-style':'normal'},get=p=>computed[p]??'';
  assert.equal(inlineStyleText('text',get),'fill:rgb(68, 126, 150);stroke:none;stroke-width:2px;opacity:0.5;font-family:Inter, sans-serif;font-size:12px;text-anchor:middle');
  assert.equal(inlineStyleText('rect',get),'fill:rgb(68, 126, 150);stroke:none;stroke-width:2px;opacity:0.5');
  assert.equal(inlineStyleText('g',p=>p==='display'?'none':''),'display:none');
});
