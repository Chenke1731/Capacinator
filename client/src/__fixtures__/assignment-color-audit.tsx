import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from '../contexts/ThemeContext';
import {SmartAssignmentModal} from '../components/modals/SmartAssignmentModal';
import {queryKeys} from '../lib/queryKeys';

export function mountAssignmentAudit(mode:'overload'|'recommended'|'manual') {
  const host=document.createElement('div');host.id='assignment-color-audit';host.style.display='contents';document.body.append(host);
  const query=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}}),person='assignment-color-person',project='assignment-color-project',role='assignment-color-role';
  const dates={start_date:'2026-09-01',end_date:'2026-12-31'};
  query.setQueryData(queryKeys.people.withAssignments(person),{id:person,name:'颜色验收人员',default_availability_percentage:100,roles:[{role_id:role,is_primary:true}],assignments:mode==='overload'?[{id:'existing-a',project_id:'existing-a',project_name:'已有分配 A',role_id:role,role_name:'开发',allocation_percentage:80,...dates},{project_id:'existing-b',project_name:'缺少ID的分配',role_id:role,role_name:'开发',allocation_percentage:50,...dates}]:[]});
  query.setQueryData(queryKeys.projects.list(),{data:[{id:project,name:'待分配项目',priority:1,target_end_date:'2026-12-31'}]});
  query.setQueryData(queryKeys.roles.list(),[{id:role,name:'开发'}]);
  query.setQueryData(queryKeys.phases.list(),[]);
  query.setQueryData(queryKeys.projectAllocations.allProjects(),[{projectId:project,allocations:[{role_id:role,allocation_percentage:100}]}]);
  query.setQueryData(queryKeys.projectPhases.byProject(project),{data:[]});
  query.setQueryData(queryKeys.projects.allocations(project),[{role_id:role,allocation_percentage:100}]);
  createRoot(host).render(<ThemeProvider><QueryClientProvider client={query}><SmartAssignmentModal isOpen onClose={()=>{}} personId={person} personName="颜色验收人员" projectId={project} triggerContext={mode==='recommended'?'quick_assign':'manual_add'} actionType={mode==='overload'?'reduce_workload':undefined}/></QueryClientProvider></ThemeProvider>);
}
