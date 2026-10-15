import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ThemeProvider} from '../contexts/ThemeContext';
import {ProjectDemandChart} from '../components/ProjectDemandChart';
import {PersonAllocationChart} from '../components/PersonAllocationChart';
import {CHART_COLORS} from '../components/reports/chartConfig';
import {BarChart,Bar,XAxis,YAxis,Tooltip,Legend,ResponsiveContainer} from 'recharts';
import {queryKeys} from '../lib/queryKeys';

// Nonempty controlled query data for actual components, with no server writes.
export async function mountChartAudit(mode:'demand'|'person'|'report-palette') {
  // PersonDetails supplies the legacy geometry stylesheet. Demand-chart direct
  // URLs supply their own color stylesheet and must pass without that parent.
  if(mode!=='demand')await import('../components/Charts.css');
  const host=document.createElement('div');host.id='chart-color-audit';
  host.style.cssText='position:fixed;inset:65px 20px 20px 270px;z-index:1100;background:hsl(var(--card));color:var(--text-primary);padding:20px;overflow:auto';document.body.append(host);
  const query=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}}),project='audit-color-project',person='audit-color-person';
  const phase={id:'phase-audit',phase_id:'phase-audit',phase_name:'设计',start_date:'2026-09-01',end_date:'2026-12-31',phase_order:1};
  const roles=Array.from({length:8},(_,i)=>({role_name:`角色 ${i+1}`,role_id:`role-${i+1}`,phase_id:phase.id,phase_name:phase.phase_name,start_date:phase.start_date,end_date:phase.end_date,demand_fte:(i+1)/10,demand_hours:120+i*10,allocation_percentage:10+i*2}));
  query.setQueryData(queryKeys.demands.project(project),{phases:[phase],demands:roles});
  query.setQueryData(queryKeys.projects.assignments(project),{data:roles.map(r=>({...r,allocation_percentage:12}))});
  query.setQueryData(queryKeys.projectPhases.byProject(project),{data:[phase]});
  query.setQueryData(queryKeys.projectPhases.dependencies(project),{data:[]});
  query.setQueryData(queryKeys.phases.templates(),[]);
  query.setQueryData(queryKeys.people.timeline(person),{timeline:{assignments:Array.from({length:10},(_,i)=>({project_name:`项目 ${i+1}`,start_date:phase.start_date,end_date:phase.end_date,allocation_percentage:8+i})),availability_overrides:[]}});
  query.setQueryData(queryKeys.people.utilizationTimeline(person,undefined,undefined),{timeline:['2026-09','2026-10','2026-11','2026-12'].map(month=>({month,utilization:100}))});
  const colors=Object.values(CHART_COLORS).flat(),data=[Object.fromEntries([['name','调色板'],...colors.map((_,i)=>[`series-${i}`,i+1])])];
  createRoot(host).render(<ThemeProvider><MemoryRouter><QueryClientProvider client={query}>
    {mode==='demand'?<ProjectDemandChart projectId={project} projectName="非空需求颜色验收"/>:mode==='person'?<PersonAllocationChart personId={person} personName="非空分配颜色验收"/>:<div className="chart-container" style={{height:600}}><h2>Report configuration × Recharts integration</h2><ResponsiveContainer width="100%" height={500}><BarChart data={data}><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/>{colors.map((color,i)=><Bar key={i} name={`系列 ${i+1}`} dataKey={`series-${i}`} fill={color} isAnimationActive={false}/>)}</BarChart></ResponsiveContainer></div>}
  </QueryClientProvider></MemoryRouter></ThemeProvider>);
}
