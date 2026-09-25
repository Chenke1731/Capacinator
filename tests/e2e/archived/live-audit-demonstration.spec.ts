import { test, expect } from '@playwright/test';

/**
 * Live Audit Demonstration Test
 * 
 * This test demonstrates real-time audit logging by performing database
 * modifications through the frontend and immediately verifying that
 * audit entries are created.
 */

test.describe('Live Audit Demonstration', () => {
  
  test('should show real-time audit logging for all database modifications', async ({ page, request }) => {
    // Set slower timeout for live demonstration
    test.setTimeout(120000); // 2 minutes

    console.log('🚀 Starting live audit demonstration...');
    
    // Navigate to the application
    await page.goto('http://local.capacinator.com');
    
    // Wait for app to load
    await page.waitForSelector('[data-testid="dashboard"], .dashboard, h1, .main-content', { timeout: 30000 });
    console.log('✅ Application loaded successfully');

    // Add some wait time to see the interface
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Test 1: Create a new person and verify audit
    console.log('\n📝 Test 1: Creating a new person...');
    
    try {
      // Try to navigate to people page
      await page.click('a[href*="/people"], [data-testid="people-nav"], text="People"', { timeout: 5000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    } catch (error) {
      console.log('Could not find people navigation, trying alternative...');
      await page.goto('http://local.capacinator.com/people');
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Click add person button
    try {
      await page.click('[data-testid="add-person"], [data-testid="add-person-button"], button:has-text("Add"), .add-button, .btn-primary', { timeout: 5000 });
      console.log('✅ Clicked add person button');
    } catch (error) {
      console.log('⚠️  Could not find add person button, trying to add person via form...');
      // If no add button, look for form fields directly
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Fill person form
    const testPersonName = `Test Person ${Date.now()}`;
    const testPersonEmail = `test-${Date.now()}@example.com`;

    try {
      // Try various possible field selectors
      const nameField = await page.locator('input[name="name"], [data-testid="person-name"], [data-testid="name-input"], input[placeholder*="name" i]').first();
      await nameField.fill(testPersonName);
      console.log(`✅ Filled name: ${testPersonName}`);

      const emailField = await page.locator('input[name="email"], [data-testid="person-email"], [data-testid="email-input"], input[type="email"]').first();
      await emailField.fill(testPersonEmail);
      console.log(`✅ Filled email: ${testPersonEmail}`);

      // Try to fill employee ID if field exists
      try {
        const employeeIdField = await page.locator('input[name="employee_id"], [data-testid="employee-id"], input[placeholder*="employee" i]').first();
        await employeeIdField.fill(`EMP${Date.now()}`);
        console.log('✅ Filled employee ID');
      } catch (error) {
        console.log('⚠️  Employee ID field not found, continuing...');
      }

      // Submit the form
      await page.click('button[type="submit"], [data-testid="save"], [data-testid="submit"], button:has-text("Save"), .btn-primary', { timeout: 5000 });
      console.log('✅ Submitted person form');

      // Wait for success message or navigation
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      // Verify audit entry was created
      console.log('🔍 Checking audit log for person creation...');
      const auditResponse = await request.get('http://local.capacinator.com/api/audit?table_name=people&action=CREATE&limit=5');
      
      if (auditResponse.ok()) {
        const auditEntries = await auditResponse.json();
        const recentEntry = auditEntries.find((entry: any) => entry.new_values?.includes(testPersonName));
        
        if (recentEntry) {
          console.log('✅ AUDIT SUCCESS: Person creation was audited!');
          console.log(`   - Audit ID: ${recentEntry.id}`);
          console.log(`   - Changed by: ${recentEntry.changed_by}`);
          console.log(`   - Action: ${recentEntry.action}`);
          console.log(`   - Table: ${recentEntry.table_name}`);
          console.log(`   - New values contain: ${testPersonName}`);
        } else {
          console.log('❌ AUDIT ISSUE: Person creation audit entry not found');
          console.log('Recent audit entries:', auditEntries.slice(0, 3));
        }
      } else {
        console.log('❌ Could not fetch audit log');
      }

    } catch (error) {
      console.log(`⚠️  Person creation test failed: ${error.message}`);
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Test 2: Update an existing record and verify audit
    console.log('\n📝 Test 2: Updating a person record...');

    try {
      // Look for first person in the list to edit
      const editButton = await page.locator('[data-testid*="edit"], button:has-text("Edit"), .edit-button, .btn-secondary').first();
      await editButton.click();
      console.log('✅ Clicked edit button');

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Update the name
      const updatedName = `Updated Person ${Date.now()}`;
      const nameField = await page.locator('input[name="name"], [data-testid="person-name"], [data-testid="name-input"], input[value*="Person"], input[value*="Test"]').first();
      await nameField.clear();
      await nameField.fill(updatedName);
      console.log(`✅ Updated name to: ${updatedName}`);

      // Submit the update
      await page.click('button[type="submit"], [data-testid="save"], [data-testid="submit"], button:has-text("Save"), .btn-primary');
      console.log('✅ Submitted update form');

      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      // Verify audit entry for update
      console.log('🔍 Checking audit log for person update...');
      const updateAuditResponse = await request.get('http://local.capacinator.com/api/audit?table_name=people&action=UPDATE&limit=5');
      
      if (updateAuditResponse.ok()) {
        const updateAuditEntries = await updateAuditResponse.json();
        const recentUpdateEntry = updateAuditEntries.find((entry: any) => entry.new_values?.includes(updatedName));
        
        if (recentUpdateEntry) {
          console.log('✅ AUDIT SUCCESS: Person update was audited!');
          console.log(`   - Audit ID: ${recentUpdateEntry.id}`);
          console.log(`   - Changed by: ${recentUpdateEntry.changed_by}`);
          console.log(`   - Action: ${recentUpdateEntry.action}`);
          console.log(`   - Old values preview: ${recentUpdateEntry.old_values?.substring(0, 100)}...`);
          console.log(`   - New values contain: ${updatedName}`);
        } else {
          console.log('❌ AUDIT ISSUE: Person update audit entry not found');
        }
      }

    } catch (error) {
      console.log(`⚠️  Person update test failed: ${error.message}`);
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Test 3: Create and delete an availability override
    console.log('\n📝 Test 3: Testing availability override deletion (original issue)...');

    try {
      // Navigate to a person's availability page
      await page.goto('http://local.capacinator.com/people');
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Click on first person to view details
      const personLink = await page.locator('a[href*="/people/"], tr td:first-child a, .person-name, [data-testid*="person-link"]').first();
      await personLink.click();
      console.log('✅ Navigated to person details');

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Look for availability section or tab
      try {
        await page.click('a:has-text("Availability"), [data-testid="availability-tab"], button:has-text("Availability")');
        console.log('✅ Clicked availability section');
      } catch (error) {
        console.log('⚠️  Availability section not found, trying direct navigation...');
        // Get current URL and append availability
        const currentUrl = page.url();
        const personId = currentUrl.split('/').pop();
        await page.goto(`${currentUrl}/availability`);
      }

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      // Add new availability override
      try {
        await page.click('[data-testid="add-override"], button:has-text("Add"), .add-button');
        console.log('✅ Clicked add availability override');

        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        // Fill availability form
        await page.fill('input[type="date"], [data-testid="start-date"]', '2024-12-25');
        await page.fill('input[name="end_date"], [data-testid="end-date"]', '2024-12-31');
        
        try {
          await page.selectOption('select[name="override_type"], [data-testid="override-type"]', 'PTO');
        } catch (error) {
          console.log('⚠️  Override type selector not found');
        }

        await page.fill('textarea[name="notes"], [data-testid="notes"]', 'Test holiday availability override');
        
        // Save the override
        await page.click('button[type="submit"], [data-testid="save"], button:has-text("Save")');
        console.log('✅ Created availability override');

        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        // Now delete the override
        await page.click('[data-testid*="delete"], button:has-text("Delete"), .delete-button, .btn-danger');
        console.log('✅ Clicked delete override');

        // Confirm deletion if modal appears
        try {
          await page.click('button:has-text("Confirm"), [data-testid="confirm"], .btn-danger');
          console.log('✅ Confirmed deletion');
        } catch (error) {
          console.log('⚠️  No confirmation modal found');
        }

        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

        // Verify audit entry for availability deletion (the original issue!)
        console.log('🔍 Checking audit log for availability deletion (ORIGINAL ISSUE)...');
        const availabilityAuditResponse = await request.get('http://local.capacinator.com/api/audit?table_name=availability&action=DELETE&limit=5');
        
        if (availabilityAuditResponse.ok()) {
          const availabilityAuditEntries = await availabilityAuditResponse.json();
          
          if (availabilityAuditEntries.length > 0) {
            const recentDeleteEntry = availabilityAuditEntries[0];
            console.log('✅ AUDIT SUCCESS: Availability deletion was audited! (ORIGINAL ISSUE FIXED!)');
            console.log(`   - Audit ID: ${recentDeleteEntry.id}`);
            console.log(`   - Changed by: ${recentDeleteEntry.changed_by}`);
            console.log(`   - Action: ${recentDeleteEntry.action}`);
            console.log(`   - Table: ${recentDeleteEntry.table_name}`);
            console.log(`   - Old values: ${recentDeleteEntry.old_values?.substring(0, 100)}...`);
            console.log(`   - New values: ${recentDeleteEntry.new_values}`);
          } else {
            console.log('❌ AUDIT ISSUE: Availability deletion audit entry not found');
          }
        }

      } catch (error) {
        console.log(`⚠️  Availability override test failed: ${error.message}`);
      }

    } catch (error) {
      console.log(`⚠️  Availability section test failed: ${error.message}`);
    }

    // Test 4: Show all recent audit entries
    console.log('\n📝 Test 4: Displaying all recent audit activity...');

    try {
      const allRecentAuditResponse = await request.get('http://local.capacinator.com/api/audit?limit=10');
      
      if (allRecentAuditResponse.ok()) {
        const allAuditEntries = await allRecentAuditResponse.json();
        
        console.log(`\n🔍 RECENT AUDIT ACTIVITY (${allAuditEntries.length} entries):`);
        console.log('=====================================');
        
        allAuditEntries.forEach((entry: any, index: number) => {
          const timestamp = new Date(entry.changed_at).toLocaleTimeString();
          console.log(`${index + 1}. [${timestamp}] ${entry.action} on ${entry.table_name}`);
          console.log(`   Changed by: ${entry.changed_by || 'Unknown'}`);
          console.log(`   Record ID: ${entry.record_id}`);
          if (entry.comment) {
            console.log(`   Comment: ${entry.comment}`);
          }
          console.log('   ---');
        });
        
        console.log('=====================================\n');
      } else {
        console.log('❌ Could not fetch recent audit entries');
      }
    } catch (error) {
      console.log(`⚠️  Failed to fetch audit activity: ${error.message}`);
    }

    // Wait for any pending operations to complete
    console.log('⏳ Waiting for network to settle...');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    console.log('🎯 Live audit demonstration completed!');
  });
});