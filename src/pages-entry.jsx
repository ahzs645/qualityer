import React from 'react';
import {createRoot} from 'react-dom/client';
import {createRouter,createRootRoute,createRoute,RouterProvider,Outlet} from '@tanstack/react-router';
import Workspace from './app.jsx';
import './style.css';
const root=createRootRoute({component:()=> <><div className="callout demo-workspace-note" role="status">GitHub Pages demo · synthetic interview · edits stay in this browser · export to save a copy</div><Outlet/></>});
const index=createRoute({getParentRoute:()=>root,path:'/',component:Workspace});
const router=createRouter({routeTree:root.addChildren([index]),basepath:import.meta.env.BASE_URL.replace(/\/$/,'')||'/'});
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);
