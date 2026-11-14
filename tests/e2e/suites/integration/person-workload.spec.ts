/**
 * 工作台 v2 浏览器验收（§18）：默认页无常驻任务树；添加分配打开顶部大弹窗；
 * 弹窗显示真实任务表 + 迷你容量热区；跨页多选 → ghost → 调整 → 确认提交 →
 * 泳道更新；1366 无横向溢出；双主题可读。E2E 会真实创建分配，结束时用
 * “撤销创建”清理，避免污染共享 e2e 库。
 */
import { test, expect, tags } from '../../fixtures';

async function firstPerson(apiContext: any) {
  const response = await apiContext.get('/api/people?limit=50');
  const payload = await response.json();
  const people = payload?.data?.data ?? payload?.data ?? [];
  return people.find((person: any) => person.is_active !== false) ?? people[0];
}

test.describe('Person workbench v2 (dialog selection → ghost → commit)', () => {
  test(`${tags.integration} 1366 layout, dialog multi-select, ghost adjust, commit, swimlane update`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    await authenticatedPage.setViewportSize({ width: 1366, height: 768 });
    await authenticatedPage.goto(`/people/${person.id}/workload`);
    await expect(authenticatedPage.getByRole('heading', { name: /Adjust Assignments/i })).toBeVisible();
    await expect(authenticatedPage.getByTestId('pw-total')).toBeVisible();

    // §18 功能：默认页面无常驻任务树（旧 aside 选择器不再存在）
    await expect(authenticatedPage.getByRole('complementary')).toHaveCount(0);

    // 泳道可见 + 1366 无页面级横向溢出
    await expect(authenticatedPage.getByTestId('pw-gantt')).toBeVisible();
    const rootOverflow = await authenticatedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(rootOverflow.scrollWidth).toBeLessThanOrEqual(rootOverflow.innerWidth + 1);

    // G-01 守卫：bar 计算高度不得超 26px 堆叠间距（axe target-size 下限 24）；
    // 同泳道 bar 矩形零相交
    const barGeometry = await authenticatedPage.evaluate(() => {
      const bars = [...document.querySelectorAll<HTMLElement>('[data-testid="pw-gantt-bar"], [data-testid="pw-ghost-bar"]')];
      const oversized = bars.filter((bar) => bar.getBoundingClientRect().height > 26);
      const byTrack = new Map<Element, DOMRect[]>();
      for (const bar of bars) {
        const track = bar.closest('.pw-gantt-lane-track');
        if (!track) continue;
        const list = byTrack.get(track) ?? [];
        list.push(bar.getBoundingClientRect());
        byTrack.set(track, list);
      }
      const overlaps: string[] = [];
      for (const [track, rects] of byTrack) {
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            const intersects = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            if (intersects) overlaps.push((track.previousElementSibling as HTMLElement)?.textContent ?? 'lane');
          }
        }
      }
      return { barCount: bars.length, oversized: oversized.length, overlaps };
    });
    expect(barGeometry.oversized).toBe(0);
    expect(barGeometry.overlaps).toEqual([]);

    // 行级编辑入口仍可用
    const editButtons = authenticatedPage.getByRole('button', { name: 'Edit' });
    if ((await editButtons.count()) > 0) {
      await editButtons.first().click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toBeVisible();
      await authenticatedPage.locator('.pw-row-actions').getByRole('button', { name: 'Cancel' }).click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toHaveCount(0);
    }

    // §18：点“添加分配”打开顶部大弹窗，真实任务表 + 迷你热区可达
    await authenticatedPage.getByTestId('pw-add-assignment').click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByTestId('pw-mini-heat')).toBeVisible();
    await expect(dialog.getByTestId('pw-task-board')).toBeVisible({ timeout: 15000 });

    const overflowInDialog = await authenticatedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflowInDialog.scrollWidth).toBeLessThanOrEqual(overflowInDialog.innerWidth + 1);

    const checkboxes = dialog.locator('input[type="checkbox"][data-testid^="pw-select-task-"]');
    const checkboxCount = await checkboxes.count();
    test.skip(checkboxCount < 1, 'No selectable leaf tasks in e2e database');

    // 勾选两个任务（不足两个则选一个）
    await checkboxes.first().check();
    if (checkboxCount > 1) {
      await checkboxes.nth(1).check();
    }

    // 统一 fixed 日期，保证草稿可提交
    await dialog.getByLabel('Unified date mode').selectOption('fixed');
    const now = Date.now();
    const iso = (offsetDays: number) => new Date(now + offsetDays * 86400000).toISOString().slice(0, 10);
    await dialog.getByLabel('Start date').fill(iso(7));
    await dialog.getByLabel('End date').fill(iso(37));
    await dialog.getByTestId('pw-add-to-lane').click();
    await expect(dialog).toHaveCount(0);

    // §18：加入泳道后 ghost 出现在泳道；待提交条可达
    const commitBar = authenticatedPage.getByTestId('pw-commit-bar');
    await expect(commitBar).toBeVisible();
    await expect(authenticatedPage.getByTestId('pw-ghost-bar').first()).toBeVisible();

    // ghost 参数面板：调整比例后关闭
    await authenticatedPage.getByTestId('pw-ghost-bar').first().click();
    const allocationInput = authenticatedPage.getByTestId('pw-ghost-inspector').getByLabel('Allocation %');
    await expect(allocationInput).toBeVisible();
    await allocationInput.fill('25');
    await authenticatedPage.getByTestId('pw-ghost-inspector').getByRole('button', { name: 'Done' }).click();

    // §18：超载仍可确认（容量只提醒不阻断）→ 逐条提交成功后进入撤销条
    await authenticatedPage.getByTestId('pw-confirm-assign').click();
    await expect(authenticatedPage.getByTestId('pw-undo-create')).toBeVisible({ timeout: 20000 });
    // 泳道更新：ghost 消失（成功行变实心 committed bar）
    await expect(authenticatedPage.getByTestId('pw-ghost-bar')).toHaveCount(0);

    // 清理：撤销创建，避免污染共享 e2e 库
    await authenticatedPage.getByTestId('pw-undo-create').click();
    await expect(authenticatedPage.getByTestId('pw-commit-bar')).toHaveCount(0, { timeout: 20000 });

    // 泳道可折叠（§18 视觉）
    await authenticatedPage.getByTestId('pw-gantt-toggle').click();
    await expect(authenticatedPage.getByTestId('pw-gantt-heat-compact')).toBeVisible();
  });

  test(`${tags.integration} light and dark themes keep the workload page readable`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    await authenticatedPage.goto(`/people/${person.id}/workload`);
    await authenticatedPage.evaluate(() => localStorage.setItem('theme', 'light'));
    await authenticatedPage.reload();
    const heading = authenticatedPage.getByRole('heading', { name: /Adjust Assignments/i });
    await expect(heading).toBeVisible();
    const lightColor = await heading.evaluate((element) => getComputedStyle(element).color);
    expect(lightColor).not.toBe('rgba(0, 0, 0, 0)');

    await authenticatedPage.evaluate(() => localStorage.setItem('theme', 'dark'));
    await authenticatedPage.reload();
    await expect(heading).toBeVisible();
    await expect(authenticatedPage.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkColor = await heading.evaluate((element) => getComputedStyle(element).color);
    expect(darkColor).not.toBe('rgba(0, 0, 0, 0)');

    // 弹窗在暗色下同样可读（标题 + 热区）
    await authenticatedPage.getByTestId('pw-add-assignment').click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dialogTitleColor = await dialog
      .getByRole('heading', { name: /Select tasks for/i })
      .evaluate((element) => getComputedStyle(element).color);
    expect(dialogTitleColor).not.toBe('rgba(0, 0, 0, 0)');
  });
});

/**
 * Phase A（S1/S2/S6）：已提交 fixed bar 拖动 → 就地面板预填 → 单 PUT 保存 → 撤销。
 * 用 API 创建一条"已开始、未结束"的临时分配，测试结束删除，避免污染共享库。
 */
test.describe('Person workbench v2 (S1/S2/S6 committed drag + panel + undo)', () => {
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

  test(`${tags.integration} drag committed bar, save in place, undo restores dates/allocation`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const person = await firstPerson(apiContext);
    test.skip(!person, 'No people fixture in e2e database');

    const projectsBody = await (await apiContext.get('/api/projects')).json();
    const projects = projectsBody?.data?.data ?? projectsBody?.data ?? [];
    const rolesBody = await (await apiContext.get('/api/roles')).json();
    const roles = rolesBody?.data?.data ?? rolesBody?.data ?? [];
    const roleId = person.roles?.[0]?.role_id ?? roles[0]?.id;
    const project = projects[0];
    test.skip(!project || !roleId, 'No project/role fixture in e2e database');

    const originalStart = iso(-20);
    const originalEnd = iso(60);
    const createRes = await apiContext.post('/api/assignments', {
      data: {
        person_id: person.id,
        project_id: project.id,
        role_id: roleId,
        allocation_percentage: 20,
        assignment_date_mode: 'fixed',
        start_date: originalStart,
        end_date: originalEnd,
      },
    });
    expect(createRes.ok()).toBe(true);
    const created = (await createRes.json())?.data ?? {};
    const createdId = created.id as string;
    expect(createdId).toBeTruthy();

    // 页面按场景投影读取：行 id 带 `spa-` 前缀（baseline 投影包装），
    // DOM / PUT / 读回都用投影 id，清理仍用创建返回的底层 id。
    const listedBody = await (
      await apiContext.get(`/api/assignments?person_id=${person.id}&limit=200`)
    ).json();
    const listedRows = listedBody?.data?.data ?? listedBody?.data ?? [];
    const projected = listedRows.find(
      (row: any) => String(row.id).endsWith(createdId) || String(row.base_assignment_id) === createdId
    );
    const assignmentId = String(projected?.id ?? createdId);

    try {
      await authenticatedPage.goto(`/people/${person.id}/workload`);
      const bar = authenticatedPage.locator(
        `[data-testid="pw-gantt-bar"][data-assignment-id="${assignmentId}"]`
      );
      await expect(bar).toBeVisible({ timeout: 15000 });

      // 拖动整段（中心按下，避开两端缩放手柄）
      const box = await bar.boundingBox();
      expect(box).toBeTruthy();
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      await authenticatedPage.mouse.move(cx, cy);
      await authenticatedPage.mouse.down();
      await authenticatedPage.mouse.move(cx + 40, cy, { steps: 6 });

      // 拖动中即时反馈：浮动提示给出精确到日的起止（不必等松手）
      const dragTip = authenticatedPage.getByTestId('pw-gantt-drag-tip');
      await expect(dragTip).toBeVisible();
      await expect(dragTip).toContainText('→');
      const tipStart = (await dragTip.textContent())?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      expect(tipStart).toBeTruthy();
      await authenticatedPage.mouse.up();

      // 松手后不触发 click 重开：直接进入 committed 面板且预填拖动后的日期
      const panel = authenticatedPage.getByTestId('pw-committed-inspector');
      await expect(panel).toBeVisible();
      const startInput = panel.getByLabel('Start date');
      const previewStart = await startInput.inputValue();
      expect(previewStart).toBe(tipStart);
      expect(previewStart).not.toBe(originalStart);
      await expect(panel.getByLabel('End date')).not.toHaveValue(originalEnd);

      // 面板保持打开，直接进行第二次拖动：必须从"当前预览"继续，不能跳回原始日期
      const box2 = await bar.boundingBox();
      expect(box2).toBeTruthy();
      const cx2 = box2!.x + box2!.width / 2;
      const cy2 = box2!.y + box2!.height / 2;
      await authenticatedPage.mouse.move(cx2, cy2);
      await authenticatedPage.mouse.down();
      await authenticatedPage.mouse.move(cx2 + 20, cy2, { steps: 4 });
      const tip2 = authenticatedPage.getByTestId('pw-gantt-drag-tip');
      await expect(tip2).toBeVisible();
      const tip2Start = (await tip2.textContent())?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      expect(tip2Start).toBeTruthy();
      await authenticatedPage.mouse.up();
      await expect(startInput).toHaveValue(tip2Start!);
      // 第二次向右拖，开始日应比第一次预览更晚（而不是回到 originalStart）
      expect(String(tip2Start) > previewStart).toBe(true);
      const finalStart = await startInput.inputValue();

      // 面板内改比例 → 单 PUT（带快照版本）→ 关闭 + 撤销 toast
      await panel.getByLabel('Allocation %').fill('33');
      const [saveResponse] = await Promise.all([
        authenticatedPage.waitForResponse(
          (response) =>
            response.url().includes(`/api/assignments/${assignmentId}`) &&
            response.request().method() === 'PUT'
        ),
        panel.getByTestId('pw-committed-save').click(),
      ]);
      expect(saveResponse.ok()).toBe(true);
      await expect(panel).toHaveCount(0);

      const readAssignment = async () => {
        const response = await apiContext.get(`/api/assignments/${assignmentId}`);
        const body = await response.json();
        return body?.data?.data ?? body?.data ?? body;
      };
      await expect
        .poll(async () => (await readAssignment()).allocation_percentage, { timeout: 10000 })
        .toBe(33);
      const saved = await readAssignment();
      expect(saved.start_date.slice(0, 10)).toBe(finalStart);

      const undoButton = authenticatedPage.getByRole('button', { name: 'Undo', exact: true });
      await expect(undoButton).toBeVisible();
      await undoButton.click();

      await expect
        .poll(async () => (await readAssignment()).allocation_percentage, { timeout: 10000 })
        .toBe(20);
      const restored = await readAssignment();
      expect(restored.start_date.slice(0, 10)).toBe(originalStart);
      expect(restored.end_date.slice(0, 10)).toBe(originalEnd);
    } finally {
      await apiContext.delete(`/api/assignments/${createdId}`).catch(() => undefined);
    }
  });
});

/**
 * Phase B（S5）：项目配置面板「调整此人」→ 受守卫跳转 → 目标人员页深链定位。
 * 用 B 人员的临时分配搭桥；A 项目已有泳道。结束删除临时行。
 */
test.describe('Person workbench v2 (S5 cross-person relay)', () => {
  test(`${tags.integration} staffing adjust navigates with project/assignment deep link and locates the row`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const peopleBody = await (await apiContext.get('/api/people?limit=50')).json();
    const people = peopleBody?.data?.data ?? peopleBody?.data ?? [];
    const personA = people.find((person: any) => person.is_active !== false) ?? people[0];
    const personB = people.find((person: any) => person.id !== personA?.id && person.is_active !== false);
    test.skip(!personA || !personB, 'Need two active people in e2e database');

    const aRowsBody = await (
      await apiContext.get(`/api/assignments?person_id=${personA.id}&limit=200`)
    ).json();
    const aRows = aRowsBody?.data?.data ?? aRowsBody?.data ?? [];
    const source = aRows.find((row: any) => row.project_id);
    test.skip(!source, 'Person A has no assignment to anchor the project lane');

    const roleId = source.role_id ?? personA.roles?.[0]?.role_id;
    test.skip(!roleId, 'No role available for temp assignment');
    const today = Date.now();
    const iso = (offsetDays: number) => new Date(today + offsetDays * 86400000).toISOString().slice(0, 10);

    const createRes = await apiContext.post('/api/assignments', {
      data: {
        person_id: personB.id,
        project_id: source.project_id,
        role_id: roleId,
        allocation_percentage: 10,
        assignment_date_mode: 'fixed',
        start_date: iso(30),
        end_date: iso(60),
      },
    });
    expect(createRes.ok()).toBe(true);
    const created = (await createRes.json())?.data ?? {};
    const createdId = created.id as string;

    try {
      const bRowsBody = await (
        await apiContext.get(`/api/assignments?person_id=${personB.id}&limit=200`)
      ).json();
      const bRows = bRowsBody?.data?.data ?? bRowsBody?.data ?? [];
      const projected = bRows.find(
        (row: any) => String(row.id).endsWith(createdId) || String(row.base_assignment_id) === createdId
      );
      const projectedId = String(projected?.id ?? createdId);

      await authenticatedPage.goto(`/people/${personA.id}/workload`);
      await expect(authenticatedPage.getByTestId('pw-gantt')).toBeVisible();
      const laneLink = authenticatedPage
        .getByRole('button', { name: new RegExp(`View staffing for ${source.project_name ?? ''}`) })
        .first();
      await expect(laneLink).toBeVisible({ timeout: 15000 });
      await laneLink.click();

      const panel = authenticatedPage.getByTestId('pw-project-staffing');
      await expect(panel).toBeVisible();
      const adjust = panel.getByTestId(`pw-staffing-adjust-${personB.id}`).first();
      await expect(adjust).toBeVisible({ timeout: 15000 });
      await adjust.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`/people/${personB.id}/workload\\?project=.*&assignment=`)
      );
      const banner = authenticatedPage.getByTestId('pw-deeplink');
      await expect(banner).toContainText('From project staffing');
      await expect(banner).toContainText('Located the assignment');
      const row = authenticatedPage.locator(`tr[data-assignment-id="${projectedId}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
    } finally {
      await apiContext.delete(`/api/assignments/${createdId}`).catch(() => undefined);
    }
  });
});

/**
 * Phase B（S3/S6）：批量平移预览→应用→撤销，批量暂停/恢复。
 * 用临时人员 + 两条临时分配隔离，避免改动 seed 行；结束清理。
 */
test.describe('Person workbench v2 (S3 batch shift / status / undo)', () => {
  test(`${tags.integration} batch shift preview/apply/undo and batch pause/resume`, async ({
    authenticatedPage,
    apiContext,
  }) => {
    const rolesBody = await (await apiContext.get('/api/roles')).json();
    const roles = rolesBody?.data?.data ?? rolesBody?.data ?? [];
    const projectsBody = await (await apiContext.get('/api/projects')).json();
    const projects = projectsBody?.data?.data ?? projectsBody?.data ?? [];
    test.skip(!roles[0] || !projects[0], 'Need role/project fixtures');

    const stamp = Date.now();
    const personRes = await apiContext.post('/api/people', {
      data: {
        name: `E2E Batch ${stamp}`,
        email: `e2e-batch-${stamp}@example.com`,
        default_availability_percentage: 100,
        is_active: true,
      },
    });
    expect(personRes.ok()).toBe(true);
    const personBody = await personRes.json();
    const person = personBody?.data ?? personBody;
    expect(person?.id).toBeTruthy();

    const iso = (offsetDays: number) => new Date(stamp + offsetDays * 86400000).toISOString().slice(0, 10);
    const originalStart = iso(30);
    const originalEnd = iso(60);
    const createdIds: string[] = [];
    try {
      const duplicates = [
        { project: projects[0], offset: 0, allocation: 20 },
        { project: projects[1] ?? projects[0], offset: 10, allocation: 30 },
      ];
      for (const { project, offset, allocation } of duplicates) {
        const res = await apiContext.post('/api/assignments', {
          data: {
            person_id: person.id,
            project_id: project.id,
            role_id: roles[0].id,
            allocation_percentage: allocation,
            assignment_date_mode: 'fixed',
            start_date: iso(30 + offset),
            end_date: iso(60 + offset),
          },
        });
        expect(res.ok()).toBe(true);
        const body = await res.json();
        createdIds.push((body?.data ?? body).id);
      }

      await authenticatedPage.goto(`/people/${person.id}/workload`);
      await expect(authenticatedPage.getByTestId('pw-gantt')).toBeVisible();
      await expect(authenticatedPage.getByTestId('pw-gantt-bar')).toHaveCount(2);

      const readRows = async () => {
        const body = await (
          await apiContext.get(`/api/assignments?person_id=${person.id}&limit=200`)
        ).json();
        return (body?.data?.data ?? body?.data ?? []) as any[];
      };

      // 批量平移：预览 → 应用 → 日期 +7
      await authenticatedPage.getByTestId('pw-batch-entry').click();
      await authenticatedPage.getByTestId('pw-batch-shift-toggle').click();
      await authenticatedPage.getByLabel('Amount').fill('7');
      await authenticatedPage.getByTestId('pw-batch-shift-preview').click();
      await expect(authenticatedPage.getByTestId('pw-batch-shift-summary')).toContainText(
        'Will shift 2 row(s)'
      );
      await authenticatedPage.getByTestId('pw-batch-shift-apply').click();
      await expect(authenticatedPage.getByTestId('pw-batch-message')).toContainText(
        'Shifted 2 row(s).',
        { timeout: 15000 }
      );
      await expect
        .poll(async () => (await readRows()).map((row) => row.start_date.slice(0, 10)).sort(), {
          timeout: 15000,
        })
        .toEqual([iso(37), iso(47)].sort());

      // S6：撤销批量平移（一次操作）
      await authenticatedPage.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect
        .poll(async () => (await readRows()).map((row) => row.start_date.slice(0, 10)).sort(), {
          timeout: 15000,
        })
        .toEqual([originalStart, iso(40)].sort());

      // 批量暂停（一次统一确认）
      await authenticatedPage.getByTestId('pw-batch-pause').click();
      const pauseDialog = authenticatedPage.getByTestId('confirm-dialog');
      await expect(pauseDialog).toContainText('Pause 2 non-paused row(s)');
      await pauseDialog.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(authenticatedPage.getByTestId('pw-batch-message')).toContainText(
        'Paused 2 row(s).',
        { timeout: 15000 }
      );
      await expect
        .poll(async () => (await readRows()).every((row) => row.status === 'paused'), {
          timeout: 15000,
        })
        .toBe(true);

      // 批量恢复
      await authenticatedPage.getByTestId('pw-batch-resume').click();
      const resumeDialog = authenticatedPage.getByTestId('confirm-dialog');
      await expect(resumeDialog).toContainText('Resume 2 paused row(s)');
      await resumeDialog.getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(authenticatedPage.getByTestId('pw-batch-message')).toContainText(
        'Resumed 2 row(s).',
        { timeout: 15000 }
      );
      await expect
        .poll(async () => (await readRows()).every((row) => row.status === 'active'), {
          timeout: 15000,
        })
        .toBe(true);
    } finally {
      for (const id of createdIds) {
        await apiContext.delete(`/api/assignments/${id}`).catch(() => undefined);
      }
      await apiContext.delete(`/api/people/${person.id}`).catch(() => undefined);
    }
  });
});
