export const RESEARCH_APPROACHES = [
 {id:'framework',name:'Framework Method',guidance:'Develop a working analytical framework, index passages, and chart summaries across sources while preserving context and contrasting accounts.',href:'https://doi.org/10.1186/1471-2288-13-117'},
 {id:'reflexive-thematic',name:'Reflexive thematic analysis',guidance:'Move recursively between familiarization, coding and theme development. Record your interpretive position. Themes are patterns of meaning; coder agreement is not a quality requirement for this approach.',href:'https://www.thematicanalysis.net/doing-reflexive-ta/'},
 {id:'codebook-thematic',name:'Codebook thematic analysis',guidance:'Use explicit working code definitions and record how they change. Decide how team discussion and review fit your research question and methodological commitments.',href:'https://doi.org/10.1080/14780887.2020.1769238'},
 {id:'other',name:'Another qualitative approach',guidance:'Name your approach and explain how coding, memos and interpretation support it. Choose the tools that fit your method; the app does not determine methodological quality.'}
];

export function studyDesignDraft(state){
 const design=state.settings?.researchDesign||{},framework=state.frameworkStudies?.[0];
 return {question:design.question??framework?.researchQuestion??'',approach:design.approach??(framework?'framework':'other'),methodName:design.methodName||'',methodRationale:design.methodRationale||'',samplingNotes:design.samplingNotes||'',researcherPosition:design.researcherPosition||'',sourceScope:design.sourceScope||''};
}

export function prepareStudyDesign(draft,previous,actor){
 if(!RESEARCH_APPROACHES.some(a=>a.id===draft.approach))throw Error('Choose a qualitative approach.');
 const fields={question:4000,methodName:200,methodRationale:8000,samplingNotes:8000,researcherPosition:8000,sourceScope:8000},design={approach:draft.approach};
 for(const [key,max] of Object.entries(fields)){if(typeof (draft[key]??'')!=='string'||(draft[key]||'').length>max)throw Error('Shorten the study '+key+' field.');design[key]=(draft[key]||'').trim();}
 if(!design.question)throw Error('Write the research question or purpose guiding this study.');
 if(design.approach==='other'&&!design.methodName)throw Error('Name your qualitative approach, or record that it is still being decided.');
 return {...design,modifiedBy:actor,modifiedAt:new Date().toISOString(),history:[...(previous?.history||[]),...(previous?[{...previous,history:undefined}]:[])]};
}
