import React from 'react';
import {createRoot} from 'react-dom/client';
import {BoardNotifications} from '../components/boards/BoardNotifications';
export function mountNotificationAudit() {
  const host=document.createElement('div');host.id='notification-color-audit';host.className='projects-board';document.body.append(host);
  createRoot(host).render(<BoardNotifications error="UI审计：保存失败，请保留草稿后重试" success="UI审计：已更新3项" />);
}
