-- 演示数据生命周期基线还原(无头测试后执行):
-- P1 客户门户改版 = in_iteration + B·26.RP4(版本分组演示), P2 = in_iteration, P3 = pending_rat
UPDATE projects SET lifecycle_state='in_iteration', iteration_label=NULL WHERE name='客户门户改版';
UPDATE projects SET lifecycle_state='in_iteration', iteration_label=NULL WHERE name='数据平台升级';
UPDATE projects SET lifecycle_state='pending_rat', ar_number=NULL, iteration_label=NULL WHERE name='移动端改版';
UPDATE projects SET product_version='B', release_version='26.RP4' WHERE name='客户门户改版';
UPDATE projects SET product_version=NULL, release_version=NULL WHERE name IN ('数据平台升级','移动端改版');
DELETE FROM project_lifecycle_events;
DELETE FROM project_pool_demands WHERE project_id IN (SELECT id FROM projects WHERE name='移动端改版');
DELETE FROM project_design_estimations WHERE project_id IN (SELECT id FROM projects WHERE name='移动端改版');
SELECT name, lifecycle_state, product_version, release_version FROM projects WHERE lifecycle_state IS NOT NULL;
-- 张前端×数据平台升级 30% 基线分配防漂(退回+释放会删行, 用户实测后需恢复)
INSERT INTO scenario_project_assignments (id, project_id, person_id, role_id, allocation_percentage, assignment_date_mode, start_date, end_date, computed_start_date, computed_end_date, status, scenario_id, change_type, created_at, updated_at)
SELECT 'spa-seed-p2-front-' || (SELECT hex(randomblob(4))), (SELECT id FROM projects WHERE name='数据平台升级'), '5b734589-1c45-4b20-b380-2af910cd583b', (SELECT id FROM roles WHERE name='开发'), 30.0, 'fixed', '2026-11-01', '2026-12-15', '2026-11-01', '2026-12-15', 'active', 'baseline-0000-0000-0000-000000000000', 'added', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM scenario_project_assignments s JOIN projects p ON s.project_id=p.id WHERE s.person_id='5b734589-1c45-4b20-b380-2af910cd583b' AND p.name='数据平台升级');
