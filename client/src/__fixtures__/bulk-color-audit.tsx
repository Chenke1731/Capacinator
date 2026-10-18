// Production bulk bar with controlled read-only callbacks and stable tag input.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BulkActionBar} from '../components/boards/BulkActionBar';

export function mountBulkAudit(pending = false) {
  document.querySelector('#bulk-color-audit')?.remove();
  const host = document.createElement('div');
  host.id = 'bulk-color-audit';host.className = 'projects-board';
  document.body.append(host);
  const query = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
  query.setQueryData(['iterations','list'], {data:[]});
  const unexpected = () => {throw new Error('Audit unexpectedly invoked a bulk write callback');};
  createRoot(host).render(<QueryClientProvider client={query}>
    <BulkActionBar count={3} pending={pending} onClear={() => {}} onBatchUpdate={unexpected} onBatchDelete={unexpected}
      allTags={[{id:'audit-add',name:'UI审计·添加'},{id:'audit-remove',name:'UI审计·移除'}]}
      tagsOnSelection={new Set(['audit-add','audit-remove'])}
      visibleCount={3} selectionRows={[]} visibleIds={new Set()}
      onClearHidden={() => {}} onLocate={() => {}} />
  </QueryClientProvider>);
}
