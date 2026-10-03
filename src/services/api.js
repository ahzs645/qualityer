export async function api(path,options={}){
 if(import.meta.env?.MODE==='pages')return (await import('./static-demo.mjs')).demoApi(path,options);
 const response=await fetch('/api'+path,{...options,headers:options.body instanceof FormData?{}:{'Content-Type':'application/json'},body:options.body instanceof FormData?options.body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Request failed.'),{status:response.status});return data;
}
