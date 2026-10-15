import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from '../../contexts/ThemeContext';
import {api} from '../../lib/api-client';
import ProjectTypes from '../ProjectTypes';

jest.mock('../../lib/api-client',()=>({api:{projectTypes:{getHierarchy:jest.fn(),list:jest.fn()}}}));

it('renders the canonical hierarchy response and shows each child once when expanded',async()=>{
  const child={id:'child-audit',name:'Child Audit',description:'Child',color_code:'#000000',is_parent:false,parent_id:'parent-audit',children:[]};
  const parent={id:'parent-audit',name:'Parent Audit',description:'Parent',color_code:'#000000',is_parent:true,children:[child]};
  (api.projectTypes.getHierarchy as jest.Mock).mockResolvedValue({data:{success:true,data:[parent]}});
  const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<ThemeProvider><MemoryRouter initialEntries={['/projects?tab=types&view=hierarchy']}><QueryClientProvider client={query}><ProjectTypes/></QueryClientProvider></MemoryRouter></ThemeProvider>);
  const row=(await screen.findByText('Parent Audit')).closest('.project-type-row')!;
  expect(screen.queryByText('Child Audit')).not.toBeInTheDocument();
  fireEvent.click(row.querySelector('.expand-toggle')!);
  expect(await screen.findByText('Child Audit')).toBeInTheDocument();
  expect(screen.getAllByText('Child Audit')).toHaveLength(1);
  fireEvent.click(screen.getByText('Parent Audit').closest('.project-type-row')!.querySelector('.expand-toggle')!);
  expect(screen.queryByText('Child Audit')).not.toBeInTheDocument();
});
