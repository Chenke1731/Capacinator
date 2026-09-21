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
