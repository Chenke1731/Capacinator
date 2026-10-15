import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ProjectTypeModal} from '../components/modals/ProjectTypeModal';
import {TagManagerDialog} from '../components/tags/TagManagerDialog';
import {Avatar, TagsCell} from '../components/boards/EditableCells';
import {queryKeys} from '../lib/queryKeys';
import {ThemeProvider} from '../contexts/ThemeContext';

// Controlled input for real presentation components; callbacks must never save.
export function mountPaletteAudit(mode: 'types' | 'tags' | 'avatars') {
  const host=document.createElement('div');host.id='palette-color-audit';host.className='projects-board';
  // Radix portals paint outside this host. A fixed opaque host would cover
  // the dialog even while its pointer-events:none lets automated clicks pass.
  host.style.cssText=mode==='avatars'?'position:fixed;inset:60px 20px 20px 270px;z-index:1100;background:var(--bg-primary);color:var(--text-primary);padding:24px;overflow:auto':'display:contents';
  document.body.append(host);
  const query=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
  const palette=['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#999999'];
  const tags=palette.map((color,index)=>({id:index+1,name:`审计标签 ${index+1}`,color,project_count:1}));
  query.setQueryData(queryKeys.tags.list(),{data:tags});
  const names: string[]=[];
  for(let n=0;names.filter(Boolean).length<8;n++){
    const name=`人员${n}`;let hash=5381;for(const c of name)hash=((hash*31)+(c.codePointAt(0)??0))>>>0;
    names[hash%8]=name;
  }
  const unexpected=()=>{throw Error('Palette audit must not invoke a save callback');};
  createRoot(host).render(<ThemeProvider><QueryClientProvider client={query}>
    {mode==='types'?<ProjectTypeModal isOpen onClose={()=>{}} onSuccess={unexpected}/>:mode==='tags'?<TagManagerDialog isOpen onClose={()=>{}}/>:<>
      <h2>真实头像与标签：八个类别及空色回退</h2>
      <div style={{display:'flex',gap:24,marginBottom:24}}>{names.map(name=><div key={name}><Avatar name={name}/><span>{name}</span></div>)}</div>
      {[...tags,{id:99,name:'空色标签',color:null}].map(tag=><div key={tag.id} style={{margin:12}}><TagsCell project={{id:`color-audit-${tag.id}`,tags:[tag]}} allTags={tags} onSaved={unexpected} onFilterByTag={()=>{}}/></div>)}
    </>}
  </QueryClientProvider></ThemeProvider>);
}
