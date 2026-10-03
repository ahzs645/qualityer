import React,{lazy,Suspense} from 'react';
import {createFileRoute,ClientOnly} from '@tanstack/react-router';
const Workspace=lazy(()=>import('../app.jsx'));
export const Route=createFileRoute('/')({component:WorkspaceRoute});
function WorkspaceRoute(){return <ClientOnly fallback={<p className="callout">Opening your research workspace…</p>}><Suspense fallback={<p className="callout">Loading Research Weave…</p>}><Workspace/></Suspense></ClientOnly>}
