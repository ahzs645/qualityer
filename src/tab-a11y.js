// Gives every `.tabs` button bar tab semantics (role, aria-selected, roving tabindex, arrow keys)
// without touching each page: the visual `.active` class stays the single source of truth.
export function enhanceTabs(root=document){
  for(const bar of root.querySelectorAll('.tabs')){
    const buttons=[...bar.querySelectorAll(':scope > button')];
    if(!buttons.length)continue;
    bar.setAttribute('role','tablist');
    const active=buttons.find(b=>b.classList.contains('active'))||buttons[0];
    for(const b of buttons){
      b.setAttribute('role','tab');
      const on=b===active;
      b.setAttribute('aria-selected',on?'true':'false');
      b.tabIndex=on?0:-1;
    }
  }
}
export function installTabKeys(root=document){
  const key=e=>{
    const tab=e.target.closest?.('.tabs > [role=tab]');
    if(!tab||!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
    const tabs=[...tab.parentElement.querySelectorAll(':scope > [role=tab]')],i=tabs.indexOf(tab);
    const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    e.preventDefault();tabs[next].focus();tabs[next].click();
  };
  root.addEventListener('keydown',key);
  const observer=new MutationObserver(()=>enhanceTabs(root));
  observer.observe(root.body||root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  enhanceTabs(root);
  return ()=>{root.removeEventListener('keydown',key);observer.disconnect();};
}
