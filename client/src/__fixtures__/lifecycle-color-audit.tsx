// Read-only harness: mounts production banners, never substitutes their markup.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LifecycleBanner } from '../components/lifecycle/LifecycleBanner';
import { queryKeys } from '../lib/queryKeys';

export function mountLifecycleAudit() {
  const host = document.createElement('div');
  host.id = 'lifecycle-color-audit';
  host.style.cssText = 'position:fixed;inset:70px 20px 20px;z-index:2147483640;background:var(--bg-primary);color:var(--text-primary);padding:20px;overflow:auto';
  document.body.append(host);
  const query = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
  query.setQueryData(queryKeys.roles.list(), []);
  createRoot(host).render(<QueryClientProvider client={query}>
    {['pending_rat','nok','designing','backlog','scheduled','in_iteration','delivered','cancelled'].map(state =>
      <div key={state} data-lifecycle-audit={state} style={{marginBottom:16}}>
        <LifecycleBanner project={{id:`audit-${state}`, lifecycle_state:state, lifecycle_warnings:['missing_external_number'], external_number:'UI-AUDIT'}} />
      </div>
    )}
  </QueryClientProvider>);
}
