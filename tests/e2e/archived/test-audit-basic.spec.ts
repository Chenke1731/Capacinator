import { test, expect } from '@playwright/test';

test.describe('Basic Audit Test', () => {
  test('audit endpoints should be accessible', async ({ request }) => {
    const baseURL = 'http://localhost:3110';
    
    // Test audit stats
    const statsResponse = await request.get(`${baseURL}/api/audit/stats`);
    expect(statsResponse.ok()).toBeTruthy();
    const stats = await statsResponse.json();
    expect(stats).toHaveProperty('success', true);
    expect(stats).toHaveProperty('data');
    
    // Test audit summary by table
    const summaryResponse = await request.get(`${baseURL}/api/audit/summary/by-table`);
    expect(summaryResponse.ok()).toBeTruthy();
    const summary = await summaryResponse.json();
    expect(summary).toBeDefined();
    
    // Test audit timeline
    const timelineResponse = await request.get(`${baseURL}/api/audit/timeline`);
    expect(timelineResponse.ok()).toBeTruthy();
    const timeline = await timelineResponse.json();
    expect(Array.isArray(timeline)).toBeTruthy();
    
    // Test user activity
    const activityResponse = await request.get(`${baseURL}/api/audit/users/activity`);
    expect(activityResponse.ok()).toBeTruthy();
    const activity = await activityResponse.json();
    // User activity returns an object with user IDs as keys
    expect(typeof activity).toBe('object');
  });
});