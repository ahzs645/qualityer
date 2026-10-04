import {applyOperation,validateState,uid} from '../domain.mjs';
import {syntheticDemo} from './synthetic-demo.mjs';
const key='research-weave-pages-v1';
function read(){const saved=localStorage.getItem(key);return saved?JSON.parse(saved):{projects:[{id:'synthetic',role:'owner',revision:0,state:syntheticDemo()}],events:{}};}
function save(db){localStorage.setItem(key,JSON.stringify(db));}
export async function demoApi(path,options={}){const db=read(),method=options.method||'GET',body=options.body||{};
 if(path==='/me')return {user:{id:'demo-researcher',email:'local-demo'},seedOwner:false,demoAvailable:false,aiConfigured:false,audioConfigured:false,embeddingConfigured:false};
 if(path==='/projects'&&method==='GET')return db.projects.map(p=>({id:p.id,name:p.state.name,revision:p.revision}));
 if(path==='/projects'&&method==='POST'){if(body.demo||body.example||body.calibration)throw Error('Private interview examples are available only in the authenticated research app.');const state=body.state||syntheticDemo();if(body.name)state.name=body.name;validateState(state);const p={id:uid(),revision:0,role:'owner',state};db.projects.unshift(p);save(db);return {id:p.id};}
 const m=path.match(/^\/projects\/([^/]+)(?:\/(.*))?$/);if(!m)throw Error('This feature requires the private serverless research app.');
 const p=db.projects.find(p=>p.id===m[1]);if(!p)throw Error('Demo project missing.');const tail=(m[2]||'').split('?')[0],params=new URLSearchParams(path.split('?')[1]||'');
 if(!tail&&method==='GET')return structuredClone(p);
 if(tail==='operate'&&method==='POST'){if(body.revision!==p.revision)throw Object.assign(Error('The local project changed. Refresh before saving.'),{status:409});p.state=applyOperation(p.state,body.operation,'demo-researcher','owner');p.revision++;db.events[p.id]??=[];db.events[p.id].unshift({id:uid(),actor:'demo-researcher',action:body.operation.type,created_at:new Date().toISOString(),detail:JSON.stringify({operation:body.operation})});save(db);return structuredClone(p);}
 if(tail==='connections'&&method==='GET')return {};
 if(tail==='members'&&method==='GET')return {ownerId:'demo-researcher',members:[]};
 if(tail==='private-notes'){db.notes??={};db.notes[p.id]??=[];if(method==='GET')return structuredClone(db.notes[p.id]);const n={...body,id:body.id||uid(),revision:(body.revision||0)+1,updated_at:new Date().toISOString()};const i=db.notes[p.id].findIndex(x=>x.id===n.id);if(i>=0)db.notes[p.id][i]=n;else db.notes[p.id].push(n);save(db);return n;}
 if(tail==='events'&&method==='GET'){const all=(db.events[p.id]||[]).filter(e=>(!params.get('actor')||e.actor.includes(params.get('actor')))&&(!params.get('action')||e.action.includes(params.get('action')))&&(!params.get('from')||e.created_at>=params.get('from'))&&(!params.get('to')||e.created_at<params.get('to')+'T23:59:59.999Z'));return params.get('paginated')?{events:all.slice(Number(params.get('offset')||0),Number(params.get('offset')||0)+100),total:all.length}:all;}
 if(['jobs','backups'].includes(tail)&&method==='GET')return params.get('paginated')==='true'?{records:[],total:0,offset:Number(params.get('offset')||0)}:[];
 throw Error('Team sharing, recording storage, AI services and server backups require the private serverless app. This Pages demo stores edits in this browser; export your project to keep a copy.');
}
