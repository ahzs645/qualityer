import {comparisonScope} from './coder-comparison.mjs';
import {mediaComparisonScope} from './media-comparison.mjs';
import {restrictedSourceRanges} from './source-consent.mjs';

// Analytical views share exact text checks and current media identity/geometry
// checks. A textual restriction cannot be projected safely onto media here,
// so any pending or withheld scope excludes that source's media decisions.
export function eligibleAnalyticalCodings(state){
 const documents=(state.documents||[]).filter(d=>d.sourceRole!=='reference'&&!d.deletedAt&&d.reviewStatus!=='restricted').map(d=>({...d,reviewFlags:restrictedSourceRanges(d)}));
 const scope={...state,documents};
 const text=new Set(comparisonScope(scope).codings),mediaIds=new Set(mediaComparisonScope(scope).codings.map(c=>c.id));
 return (state.codings||[]).filter(c=>text.has(c)||!!c.kind&&!!c.id&&mediaIds.has(c.id));
}
