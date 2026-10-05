import React from 'react';
import {heatLegend} from '../heatmap-ramp.mjs';
/** Banded legend shared by every heatmap; the label says what the shade measures. */
export function HeatLegend({max,label,format,note='Unshaded cells are zero or not applicable.'}){const rows=heatLegend(max,format?{format}:undefined);if(!rows.length)return null;return <figure className="heat-legend" aria-label={'Shading legend: '+label}><figcaption>{label}</figcaption><ol>{rows.map((r,i)=><li key={i} style={{background:r.background,color:r.color}}>{r.label}</li>)}</ol><small>{note}</small></figure>;}
