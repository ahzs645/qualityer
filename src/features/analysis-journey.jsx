import React from 'react';
import {ArrowRight} from 'lucide-react';
import {frameworkCellCurrent} from '../framework-method.mjs';
import './analysis-journey.css';

const STEPS=[
 {title:'Prepare sources',view:'speakers',views:['speakers','source-review','sources'],actions:[['speakers','Speaker review'],['source-review','Source review']]},
 {title:'Code accounts',view:'workspace',views:['workspace'],actions:[['workspace','Workspace']]},
 {title:'Examine interpretations',view:'continuation',views:['continuation'],actions:[['continuation','Evidence & interpretations']]},
 {title:'Compare accounts',view:'framework',views:['framework'],actions:[['framework','Framework matrix']]},
 {title:'Reflect & review',view:'memos',views:['memos','review','processing'],actions:[['memos','Memos'],['review','Researcher review'],['processing','Passage review tasks']]}
];
export function AnalysisJourney({view,onNavigate}){
 const index=STEPS.findIndex(step=>step.views.includes(view));if(index<0)return null;const current=STEPS[index];
 const options=<ol>{STEPS.map((step,i)=><li key={step.view}><button aria-current={i===index?'step':undefined} onClick={()=>onNavigate(step.view)}><span>{i+1}</span>{step.title}</button></li>)}</ol>;
 return <nav className="analysis-journey" aria-label="Five-stage study analysis"><div className="aj-desktop">{options}</div><div className="aj-mobile"><details key={index}><summary>Stage {index+1} of 5 · {current.title}</summary>{options}</details></div><div className="aj-stage-actions">{current.actions.filter(([target])=>target!==view).map(([target,label])=><button key={target} onClick={()=>onNavigate(target)}>{label}</button>)}{index<4&&<button className="aj-next" aria-label={'Next analysis stage: '+STEPS[index+1].title} onClick={()=>onNavigate(STEPS[index+1].view)}>Next stage <ArrowRight size={16}/></button>}</div></nav>;
}
export function CodingLenses(){return <details className="coding-lenses"><summary>Six prompts for descriptive coding</summary><dl>{[
 ['Experiences','What happened, and how was it experienced?'],['Actions','What did someone do, or propose doing?'],['Values','What matters to the speaker, and why?'],['Context','Under what conditions does this account make sense?'],['Constraints','What limits or complicates the activity?'],['Consequences','What followed? Separate reported outcomes from anticipated benefits.']
 ].map(([title,prompt])=><React.Fragment key={title}><dt>{title}</dt><dd>{prompt}</dd></React.Fragment>)}</dl><p>Use the prompts that fit the passage. Describe the account in codes; develop explanations and alternative readings in a memo.</p></details>;}
export function ResearcherReadiness({state,project,onNavigate}){
 const sources=state.documents.filter(d=>d.sourceRole!=='reference'),turns=sources.flatMap(d=>d.turns||[]),wording=(state.reviewTasks||[]).filter(t=>t.kind==='transcript-wording'&&!['accepted','revised','rejected'].includes(t.status)).length;
 const estimated=turns.filter(t=>t.speakerAssignment?.status==='machine-estimate').length,unknown=turns.filter(t=>!t.speaker||/^(unassigned|unknown)$/i.test(t.speaker)).length,cells=(state.frameworkCells||[]),current=cells.filter(c=>frameworkCellCurrent(state,c));
 return <section className="researcher-readiness" aria-label="Study review priorities"><h2>Checks before reporting</h2><p>Record what you checked and what remains uncertain. Saved counts describe work records.</p><div>
 <article><h3>Source wording & voices</h3><p>{wording} open wording tasks · {estimated} machine voice estimates · {unknown} unresolved segments</p><button onClick={()=>onNavigate('source-review')}>Check source wording</button><button onClick={()=>onNavigate('speakers')}>Check voices</button></article>
 {!project.access?.blind&&<article><h3>Interpretations & qualifications</h3><p>{current.filter(c=>c.status!=='reviewed').length} current chart cells without a recorded researcher review · {cells.length-current.length} need evidence review</p><button onClick={()=>onNavigate('framework')}>Review linked chart evidence</button><button onClick={()=>onNavigate('continuation')}>Revisit contrasting accounts</button></article>}
 <article><h3>Reasoning & follow-up</h3><p>Keep alternative explanations, remaining checks and the limits of the study in a memo.</p><button onClick={()=>onNavigate('memos')}>Revisit memos & journal</button><button onClick={()=>onNavigate('processing')}>Open passage review tasks</button></article>
 </div><p className="muted">Counts do not establish importance, prevalence or saturation. Agent draft checks and recorded researcher decisions retain separate attribution.</p></section>;
}
