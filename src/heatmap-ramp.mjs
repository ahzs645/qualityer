// One banded sequential ramp for every count/share heatmap, so the same shade means the same relative
// value across views. Banding (rather than a continuous alpha) keeps neighbouring cells distinguishable, and
// the text colour is chosen per band by measured WCAG contrast, never by guesswork.
export const RAMP=['#eef5f7','#d3e6ec','#b3d3dd','#8dbccb','#5f9fb4','#35788f','#225f75','#103f4f'];
export const DARK_INK='#14262f',LIGHT_INK='#ffffff',EMPTY='#ffffff';
function rgb(color){const c=String(color).trim();let m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);if(m){const h=m[1].length===3?m[1].replace(/./g,x=>x+x):m[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}m=/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);if(m)return m.slice(1,4).map(Number);throw Error('Unsupported colour '+color);}
export function luminance(color){return rgb(color).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
export function contrastRatio(a,b){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);}
/** Dark or white text, whichever has the higher contrast on the background. */
export function readableOn(background){return contrastRatio(background,DARK_INK)>=contrastRatio(background,LIGHT_INK)?DARK_INK:LIGHT_INK;}
/** Band 0..RAMP.length-1 for a value in (0,max]; null for zero, missing or non-finite values. */
export function heatBand(value,max){if(!Number.isFinite(value)||value<=0||!Number.isFinite(max)||max<=0)return null;return Math.min(RAMP.length-1,Math.max(0,Math.ceil(value/max*RAMP.length)-1));}
/** Inline style for a heatmap cell. Zero/missing cells stay white so absence is never shaded. */
export function heatStyle(value,max){const band=heatBand(value,max);if(band==null)return {background:EMPTY,color:DARK_INK};const background=RAMP[band];return {background,color:readableOn(background)};}
/** Legend rows: each band's value range for the given maximum. */
export function heatLegend(max,{format=v=>Number(v.toFixed(2)).toString()}={}){if(!(max>0))return [];return RAMP.map((background,i)=>({background,color:readableOn(background),from:i*max/RAMP.length,to:(i+1)*max/RAMP.length,label:format(i*max/RAMP.length)+'–'+format((i+1)*max/RAMP.length)}));}
