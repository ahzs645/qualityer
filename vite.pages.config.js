import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({base:process.env.PAGES_BASE_PATH||'/',plugins:[react(),{name:'pages-index',enforce:'post',generateBundle(_,bundle){const html=bundle['pages/index.html'];if(html){delete bundle['pages/index.html'];html.fileName='index.html';bundle['index.html']=html;}}}],build:{outDir:'dist/pages',emptyOutDir:true,rollupOptions:{input:resolve('pages/index.html')}}});
