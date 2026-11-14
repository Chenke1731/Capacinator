/**
 * S6/§9 R3 守卫：撤销 toast 必须支持悬停/聚焦暂停计时。
 * 依据 @radix-ui/react-toast 内建 pause（pointermove/focusin → 暂停，
 * pointerleave → 恢复）。2026-11-14 页面审计曾误报“无暂停”——本用例把
 * 该能力钉死：替换掉 Radix Root 或破坏事件接线时必须红。
 */
import React, { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { toast } from '../../../hooks/use-toast';
import { Toaster } from '../toaster';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openToast(title: string, duration: number) {
  const { container } = render(<Toaster />);
  await act(async () => {
    toast({ title, duration });
  });
  const text = await screen.findByText(title);
  const item = text.closest('[data-state]') as HTMLElement;
  expect(item).toBeTruthy();
  expect(item.getAttribute('data-state')).toBe('open');
  return { container, item };
}

describe('toast 悬停/聚焦暂停（设计 §9 R3）', () => {
  test('悬停（pointermove）期间不自动关闭，离开后关闭', async () => {
    const { item } = await openToast('悬停暂停A', 300);
    await sleep(120);
    fireEvent.pointerMove(item);
    await sleep(700);
    expect(item.getAttribute('data-state')).toBe('open');
    // pointerleave 不冒泡：按 Radix 实际接线派发到 viewport（timer 宿主）
    // Radix 的 pause/resume 接在 Provider wrapper（viewport 的父节点）上
    const radixWrapper = (item.parentElement as HTMLElement).parentElement as HTMLElement;
    radixWrapper.dispatchEvent(new MouseEvent('pointerleave'));
    await sleep(600);
    expect(item.getAttribute('data-state')).not.toBe('open');
  }, 10000);

  test('聚焦 toast 同样暂停计时，失焦后关闭', async () => {
    const { item } = await openToast('聚焦暂停B', 250);
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await sleep(800);
    expect(item.getAttribute('data-state')).toBe('open');
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fireEvent.pointerLeave(item);
    await sleep(600);
    expect(item.getAttribute('data-state')).not.toBe('open');
  }, 10000);
});
