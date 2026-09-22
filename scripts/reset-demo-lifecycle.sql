-- 演示数据生命周期基线还原(无头测试后执行):
-- P1 客户门户改版 = in_iteration + B·26.RP4(版本分组演示), P2 = in_iteration, P3 = pending_rat
UPDATE projects SET lifecycle_state='in_iteration', iteration_label=NULL WHERE name='客户门户改版';
UPDATE projects SET lifecycle_state='in_iteration', iteration_label=NULL WHERE name='数据平台升级';
UPDATE projects SET lifecycle_state='pending_rat', external_number=NULL, iteration_label=NULL WHERE name='移动端改版';
UPDATE projects SET external_number=NULL WHERE name IN ('客户门户改版','数据平台升级'); -- 编号基线为空:演示 NO_ITERATION_NUMBER 告警由 verify 脚本回填
UPDATE projects SET product_version='B', release_version='26.RP4' WHERE name='客户门户改版';
UPDATE projects SET product_version=NULL, release_version=NULL WHERE name IN ('数据平台升级','移动端改版');
DELETE FROM project_lifecycle_events;
DELETE FROM project_pool_demands WHERE project_id IN (SELECT id FROM projects WHERE name='移动端改版');
DELETE FROM project_design_estimations WHERE project_id IN (SELECT id FROM projects WHERE name='移动端改版');

-- ═══ 迭代域演示数据(2026-09-23 板卡重构) ═══
-- MDE 人员(赵设计) — 幂等
INSERT INTO people (id, name, email, primary_person_role_id, worker_type, default_availability_percentage, default_hours_per_day, is_active, created_at, updated_at)
SELECT 'demo-mde-person-0001', '赵设计', 'mde@demo.local', (SELECT id FROM roles WHERE name='MDE'), 'FTE', 100, 8, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM people WHERE id='demo-mde-person-0001');

-- 迭代 ×3(门户项目 10/11/12 月) — 幂等重建
UPDATE projects SET iteration_id=NULL WHERE iteration_id IN ('iter-2026-10','iter-2026-11','iter-2026-12'); -- 清引用(不是删项目!)再重建迭代
DELETE FROM iterations WHERE id IN ('iter-2026-10','iter-2026-11','iter-2026-12');
INSERT INTO iterations (id, name, start_date, end_date, created_at, updated_at) VALUES
  ('iter-2026-10', '门户项目10月迭代', '2026-10-01', '2026-10-31', datetime('now'), datetime('now')),
  ('iter-2026-11', '门户项目11月迭代', '2026-11-01', '2026-11-30', datetime('now'), datetime('now')),
  ('iter-2026-12', '门户项目12月迭代', '2026-12-01', '2026-12-31', datetime('now'), datetime('now'));

-- 挂接: 子行挂 11 月(SR 派生显示);移动端改版不挂(未排池演示);旧文本标签清空
UPDATE projects SET iteration_label=NULL;
UPDATE projects SET iteration_id='iter-2026-11'
 WHERE name IN ('门户登录改造','门户首页改版','数据平台升级');
UPDATE projects SET iteration_id=NULL
 WHERE name IN ('客户门户改版','移动端改版');

-- 设计粗估分量(记录级,R1): 无存量记录,插入带分量的新记录
DELETE FROM project_design_estimations WHERE project_id IN (SELECT id FROM projects WHERE name IN ('门户登录改造','门户首页改版','数据平台升级','移动端改版'));
INSERT INTO project_design_estimations (project_id, estimated_design_pm, se_estimate_pm, mde_estimate_pm, created_at, updated_at)
SELECT p.id, 0.6, 0.2, 0.4, datetime('now'), datetime('now') FROM projects p WHERE p.name='门户登录改造';
INSERT INTO project_design_estimations (project_id, estimated_design_pm, se_estimate_pm, mde_estimate_pm, created_at, updated_at)
SELECT p.id, 0.6, 0.3, 0.3, datetime('now'), datetime('now') FROM projects p WHERE p.name='门户首页改版';
INSERT INTO project_design_estimations (project_id, estimated_design_pm, se_estimate_pm, mde_estimate_pm, created_at, updated_at)
SELECT p.id, 1.0, 0.5, 0.5, datetime('now'), datetime('now') FROM projects p WHERE p.name='数据平台升级';
INSERT INTO project_design_estimations (project_id, estimated_design_pm, se_estimate_pm, mde_estimate_pm, created_at, updated_at)
SELECT p.id, 0.4, 0.2, 0.2, datetime('now'), datetime('now') FROM projects p WHERE p.name='移动端改版';

-- 分配演示(基线场景): MDE 赵设计 11 月迭代 1.2 人月 → 120% 琥珀(防爆表演示);
-- SE 韩架构 50%;开发主投入: 张前端(既有行提主) + 孙前端×门户登录 60%
UPDATE scenario_project_assignments SET is_primary=0 WHERE scenario_id='baseline-0000-0000-0000-000000000000';
UPDATE scenario_project_assignments SET is_primary=1
 WHERE scenario_id='baseline-0000-0000-0000-000000000000'
   AND person_id='5b734589-1c45-4b20-b380-2af910cd583b' -- 张前端
   AND project_id=(SELECT id FROM projects WHERE name='数据平台升级');
DELETE FROM scenario_project_assignments WHERE person_id IN ('demo-mde-person-0001','9402f10c-a3be-4198-8c7e-ab7ab04921f5')
  AND scenario_id='baseline-0000-0000-0000-000000000000';
INSERT INTO scenario_project_assignments (id, scenario_id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, change_type, is_primary, created_at, updated_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       'baseline-0000-0000-0000-000000000000', pr.id, 'demo-mde-person-0001', (SELECT id FROM roles WHERE name='MDE'), 40.0, 'fixed', '2026-11-01','2026-11-30','2026-11-01','2026-11-30','active','added',0, datetime('now'), datetime('now')
FROM projects pr WHERE pr.name='门户登录改造';
INSERT INTO scenario_project_assignments (id, scenario_id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, change_type, is_primary, created_at, updated_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       'baseline-0000-0000-0000-000000000000', pr.id, 'demo-mde-person-0001', (SELECT id FROM roles WHERE name='MDE'), 30.0, 'fixed', '2026-11-01','2026-11-30','2026-11-01','2026-11-30','active','added',0, datetime('now'), datetime('now')
FROM projects pr WHERE pr.name='门户首页改版';
INSERT INTO scenario_project_assignments (id, scenario_id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, change_type, is_primary, created_at, updated_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       'baseline-0000-0000-0000-000000000000', pr.id, 'demo-mde-person-0001', (SELECT id FROM roles WHERE name='MDE'), 50.0, 'fixed', '2026-11-01','2026-11-30','2026-11-01','2026-11-30','active','added',0, datetime('now'), datetime('now')
FROM projects pr WHERE pr.name='数据平台升级';
INSERT INTO scenario_project_assignments (id, scenario_id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, change_type, is_primary, created_at, updated_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       'baseline-0000-0000-0000-000000000000', pr.id, '9402f10c-a3be-4198-8c7e-ab7ab04921f5', (SELECT id FROM roles WHERE name='SE'), 50.0, 'fixed', '2026-10-15','2026-10-31','2026-10-15','2026-10-31','active','added',0, datetime('now'), datetime('now')
FROM projects pr WHERE pr.name='数据平台升级';
INSERT INTO scenario_project_assignments (id, scenario_id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, change_type, is_primary, created_at, updated_at)
SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),
       'baseline-0000-0000-0000-000000000000', pr.id, (SELECT id FROM people WHERE name='孙前端'), (SELECT id FROM roles WHERE name='开发'), 60.0, 'fixed', '2026-11-01','2026-11-30','2026-11-01','2026-11-30','active','added',1, datetime('now'), datetime('now')
FROM projects pr WHERE pr.name='门户登录改造';

-- ═══ 标签治理(设计 §2/评审团): 删与列重叠/零使用的字典项,保留 预留/外包,补正交示例 ═══
DELETE FROM project_tags WHERE tag_id IN (SELECT id FROM tags WHERE name IN ('紧急','Q4重点','产品线A','OBP','内部改进'));
DELETE FROM tags WHERE name IN ('紧急','Q4重点','产品线A','OBP','内部改进');
INSERT INTO tags (name, color, created_at, updated_at)
SELECT '跨团队', '#0072B2', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name='跨团队');

SELECT p.name, p.lifecycle_state, p.iteration_id, i.name AS iteration
FROM projects p LEFT JOIN iterations i ON p.iteration_id=i.id WHERE p.lifecycle_state IS NOT NULL;
SELECT i.name, COUNT(p.id) FROM iterations i LEFT JOIN projects p ON p.iteration_id=i.id GROUP BY i.name;

-- 张前端×数据平台升级 30% 基线分配防漂(退回+释放会删行, 用户实测后需恢复)
INSERT INTO scenario_project_assignments (id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, scenario_id, change_type, created_at, updated_at)
SELECT 'spa-seed-p2-front-' || (SELECT hex(randomblob(4))), (SELECT id FROM projects WHERE name='数据平台升级'), '5b734589-1c45-4b20-b380-2af910cd583b', (SELECT id FROM roles WHERE name='开发'), 30.0, 'fixed', '2026-11-01', '2026-12-15', '2026-11-01', '2026-12-15', 'active', 'baseline-0000-0000-0000-000000000000', 'added', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM scenario_project_assignments s JOIN projects p ON s.project_id=p.id WHERE s.person_id='5b734589-1c45-4b20-b380-2af910cd583b' AND p.name='数据平台升级');
