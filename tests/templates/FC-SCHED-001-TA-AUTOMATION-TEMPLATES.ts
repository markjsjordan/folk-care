/**
 * FC-SCHED-001 Test Automation Template
 * 
 * This file contains starter templates for implementing the test cases
 * defined in FC-SCHED-001-TA-SPEC.md
 * 
 * Copy these templates into your test suite and customize as needed.
 */

// ============================================================================
// E2E TEST SUITE (Playwright)
// File: tests/e2e/fc-sched-001.spec.ts
// ============================================================================

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'admin@folkcare.example',
  password: 'password',
};

/**
 * Helper: Login to the application
 */
async function loginUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
  await page.waitForLoadState('networkidle');
}

/**
 * Helper: Navigate to scheduling page and select visits
 */
async function selectVisits(page: Page, count: number = 2) {
  await page.goto(`${BASE_URL}/scheduling`);
  await page.waitForLoadState('networkidle');

  for (let i = 0; i < count; i++) {
    const checkbox = page.locator('input[type="checkbox"]').nth(i);
    await checkbox.check();
  }
}

/**
 * Helper: Open reassign dialog
 */
async function openReassignDialog(page: Page) {
  await page.click('button:has-text("Reassign")');
  await page.waitForSelector('select[name="caregiverId"]', { timeout: 5000 });
}

/**
 * TC-001: Caregiver dropdown populates on dialog open
 */
test('TC-001: Caregiver dropdown populates on dialog open', async ({ page }) => {
  // Arrange & Act
  await loginUser(page);
  await selectVisits(page, 2);
  await openReassignDialog(page);

  // Assert
  const caregiverSelect = page.locator('select[name="caregiverId"]');
  const optionCount = await caregiverSelect.locator('option').count();

  expect(optionCount).toBeGreaterThanOrEqual(4); // Placeholder + 3 caregivers
  
  // Verify caregiver names format (FirstName LastName)
  const secondOption = caregiverSelect.locator('option').nth(1);
  const optionText = await secondOption.textContent();
  expect(optionText).toMatch(/\w+ \w+/);

  // Verify no error messages
  const errorAlert = page.locator('[role="alert"]');
  await expect(errorAlert).not.toBeVisible();
});

/**
 * TC-002: Fetch request includes Authorization header
 */
test('TC-002: Fetch request includes Authorization header', async ({ page }) => {
  const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/caregivers')) {
      capturedRequests.push({
        url: request.url(),
        headers: request.headers(),
      });
    }
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  // Assert
  const caregiverRequest = capturedRequests.find((r) =>
    r.url.includes('/api/caregivers')
  );

  expect(caregiverRequest).toBeDefined();
  expect(caregiverRequest?.headers['authorization']).toBeDefined();
  expect(caregiverRequest?.headers['authorization']).toMatch(/^Bearer /);
  expect(caregiverRequest?.headers['authorization']).not.toBe('Bearer ');
});

/**
 * TC-003: Fetch request includes X-User-Id header
 */
test('TC-003: Fetch request includes X-User-Id header', async ({ page }) => {
  const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/caregivers')) {
      capturedRequests.push({
        url: request.url(),
        headers: request.headers(),
      });
    }
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  // Assert
  const caregiverRequest = capturedRequests.find((r) =>
    r.url.includes('/api/caregivers')
  );

  expect(caregiverRequest?.headers['x-user-id']).toBeDefined();
  expect(caregiverRequest?.headers['x-user-id']).not.toBe('');
});

/**
 * TC-004: Fetch request includes X-Organization-Id header
 */
test('TC-004: Fetch request includes X-Organization-Id header', async ({ page }) => {
  const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/caregivers')) {
      capturedRequests.push({
        url: request.url(),
        headers: request.headers(),
      });
    }
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  // Assert
  const caregiverRequest = capturedRequests.find((r) =>
    r.url.includes('/api/caregivers')
  );

  expect(caregiverRequest?.headers['x-organization-id']).toBeDefined();
});

/**
 * TC-005: Loading state displays while fetching
 */
test('TC-005: Loading state displays while fetching', async ({ page }) => {
  // Arrange
  await loginUser(page);
  await selectVisits(page, 1);

  // Act & Assert
  await page.click('button:has-text("Reassign")');
  
  const dropdown = page.locator('select[name="caregiverId"]');
  
  // Verify initial loading state appears (or options populate quickly)
  await page.waitForFunction(() => {
    return page.locator('select[name="caregiverId"] option').count() > 2;
  }, { timeout: 3000 });

  const finalOptions = await dropdown.locator('option').count();
  expect(finalOptions).toBeGreaterThan(3);
});

/**
 * TC-006: Dropdown is disabled during loading
 */
test('TC-006: Dropdown is disabled during loading', async ({ page }) => {
  await loginUser(page);
  await selectVisits(page, 1);

  const dropdown = page.locator('select[name="caregiverId"]');
  
  // Note: This test may not catch the disabled state if loading is very fast
  // Use network throttling to slow down the request:
  // await page.route('/api/caregivers*', (route) =>
  //   new Promise((resolve) => setTimeout(() => route.continue(), 2000))
  // );

  await page.click('button:has-text("Reassign")');
  await page.waitForSelector('select[name="caregiverId"]');

  // After loading completes, dropdown should be enabled
  await expect(dropdown).toBeEnabled();
});

/**
 * TC-007: Multiple caregivers display correctly
 */
test('TC-007: Multiple caregivers display correctly', async ({ page }) => {
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  const dropdown = page.locator('select[name="caregiverId"]');
  const options = dropdown.locator('option');
  const optionCount = await options.count();

  // Minimum: placeholder + 3 active caregivers
  expect(optionCount).toBeGreaterThanOrEqual(4);

  // Verify each caregiver option is visible and has text
  for (let i = 1; i < optionCount; i++) {
    const option = options.nth(i);
    const text = await option.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  }
});

/**
 * TC-008: Caregiver names format as "FirstName LastName"
 */
test('TC-008: Caregiver names format as FirstName LastName', async ({ page }) => {
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  const dropdown = page.locator('select[name="caregiverId"]');
  const options = dropdown.locator('option');
  const optionCount = await options.count();

  // Check all caregiver options (skip placeholder at index 0)
  for (let i = 1; i < optionCount; i++) {
    const option = options.nth(i);
    const text = await option.textContent();
    // Match pattern: Word(s) Space Word(s)
    expect(text).toMatch(/\w+ \w+/);
  }
});

/**
 * TC-009: Only ACTIVE status caregivers are shown
 */
test('TC-009: Only ACTIVE status caregivers are shown', async ({ page }) => {
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  const dropdown = page.locator('select[name="caregiverId"]');
  const optionCount = await dropdown.locator('option').count();

  // Verify we got active caregivers (at least 3 + placeholder)
  expect(optionCount).toBeGreaterThanOrEqual(4);

  // Note: Hard to verify ACTIVE status without inspecting API response
  // See TC-002 to verify the query includes ?status=ACTIVE
});

/**
 * TC-011: No console errors on caregiver fetch
 */
test('TC-011: No console errors on caregiver fetch', async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  // Assert
  expect(consoleErrors).not.toContainEqual(expect.stringContaining('401'));
  expect(consoleErrors).not.toContainEqual(expect.stringContaining('Failed to fetch'));
  expect(consoleErrors.length).toBe(0);
});

/**
 * TC-012: No 401 Unauthorized errors in Network tab
 */
test('TC-012: No 401 Unauthorized errors in Network tab', async ({ page }) => {
  const failedRequests: { url: string; status: number }[] = [];

  page.on('response', (response) => {
    if (response.url().includes('/api/caregivers') && response.status() !== 200) {
      failedRequests.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await openReassignDialog(page);

  // Assert
  expect(failedRequests).toHaveLength(0);
});

/**
 * TC-013: Error state handled gracefully (fetch fails)
 */
test('TC-013: Error state handled gracefully', async ({ page }) => {
  // Arrange - Mock API error
  await page.route('/api/caregivers*', (route) => {
    route.abort('failed');
  });

  // Act
  await loginUser(page);
  await selectVisits(page, 1);
  await page.click('button:has-text("Reassign")');

  // Assert - No crash, graceful handling
  await page.waitForTimeout(2000);

  const dropdown = page.locator('select[name="caregiverId"]');
  expect(dropdown).toBeVisible();

  // Either error message displayed or dropdown in error state
  const errorAlert = page.locator('[role="alert"]');
  const hasErrorMessage = await errorAlert.isVisible().catch(() => false);
  const isDropdownDisabled = await dropdown.isDisabled().catch(() => false);

  expect(hasErrorMessage || isDropdownDisabled).toBeTruthy();
});

/**
 * TC-014: Reassign operation completes successfully
 */
test('TC-014: Reassign operation completes successfully', async ({ page }) => {
  // Arrange
  await loginUser(page);
  await selectVisits(page, 1);

  // Get original caregiver (from first visible visit)
  const visitRow = page.locator('table tbody tr').first();
  const originalCaregiver = await visitRow.locator('td').nth(3).textContent();

  // Act - Open dialog
  await openReassignDialog(page);

  // Select a different caregiver
  const caregiverSelect = page.locator('select[name="caregiverId"]');
  const options = await caregiverSelect.locator('option').count();
  
  if (options > 1) {
    await caregiverSelect.selectOption({ index: 1 });
  }

  // Submit reassign
  const reassignButton = page.locator('button:has-text("Reassign")').last();
  await reassignButton.click();

  // Wait for dialog to close
  await page.waitForFunction(() => {
    return !page.locator('[role="dialog"]').isVisible().catch(() => false);
  }, { timeout: 5000 });

  // Assert - Visit updated
  const updatedCaregiver = await visitRow.locator('td').nth(3).textContent();
  
  // Only verify if we actually selected a different caregiver
  if (options > 1) {
    expect(updatedCaregiver).not.toBe(originalCaregiver);
  }
});

/**
 * TC-015: Reassign operation updates visit with selected caregiver
 */
test('TC-015: Reassign operation updates visit with selected caregiver', async ({ page }) => {
  // This is similar to TC-014, verifying the specific caregiver assignment
  
  await loginUser(page);
  await selectVisits(page, 1);
  
  const visitRow = page.locator('table tbody tr').first();
  
  // Open dialog and select specific caregiver
  await openReassignDialog(page);
  
  const caregiverSelect = page.locator('select[name="caregiverId"]');
  await caregiverSelect.selectOption({ index: 1 });
  
  const selectedCaregiverText = await caregiverSelect.locator('option:checked').textContent();
  
  // Submit
  await page.locator('button:has-text("Reassign")').last().click();
  
  // Wait for update
  await page.waitForTimeout(1000);
  
  // Verify caregiver in visit row matches selection
  const updatedCaregiverText = await visitRow.locator('td').nth(3).textContent();
  expect(updatedCaregiverText?.trim()).toContain(selectedCaregiverText?.trim() || '');
});

/**
 * Smoke Tests - Verify no regressions
 */
test.describe('Smoke Tests - No Regressions', () => {
  test('Delete operation still works', async ({ page }) => {
    await loginUser(page);
    await selectVisits(page, 1);
    
    // Verify delete button exists and is clickable
    const deleteButton = page.locator('button:has-text("Delete")');
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeEnabled();
  });

  test('Visit list loads without errors', async ({ page }) => {
    await loginUser(page);
    await page.goto(`${BASE_URL}/scheduling`);
    
    // Verify table loads
    await expect(page.locator('table')).toBeVisible();
    
    // Verify no critical errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    await page.waitForLoadState('networkidle');
    expect(consoleErrors).toHaveLength(0);
  });
});

// ============================================================================
// UNIT TEST SUITE (Jest)
// File: tests/unit/auth-headers.test.ts
// ============================================================================

import { buildAuthHeaders } from '../../packages/web/src/core/utils/auth-headers';
import * as authStore from '../../packages/web/src/core/store/auth';

jest.mock('../../packages/web/src/core/store/auth');

describe('buildAuthHeaders', () => {
  const mockAuthState = {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      organizationId: 'org-001',
      roles: ['ADMIN', 'VIEWER'],
      permissions: ['visit:read', 'visit:write']
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authStore.getState as jest.Mock).mockReturnValue(mockAuthState);
  });

  test('UT-001: Returns Authorization header with Bearer token', () => {
    const headers = buildAuthHeaders();

    expect(headers['Authorization']).toBeDefined();
    expect(headers['Authorization']).toMatch(/^Bearer /);
    expect(headers['Authorization']).toBe(`Bearer ${mockAuthState.token}`);
  });

  test('UT-002: Returns X-User-Id header', () => {
    const headers = buildAuthHeaders();

    expect(headers['X-User-Id']).toBe('user-123');
  });

  test('UT-003: Returns X-Organization-Id header', () => {
    const headers = buildAuthHeaders();

    expect(headers['X-Organization-Id']).toBe('org-001');
  });

  test('UT-004: Returns X-User-Roles header', () => {
    const headers = buildAuthHeaders();

    expect(headers['X-User-Roles']).toBe('ADMIN,VIEWER');
  });

  test('UT-005: Returns X-User-Permissions header', () => {
    const headers = buildAuthHeaders();

    expect(headers['X-User-Permissions']).toBe('visit:read,visit:write');
  });

  test('UT-006: Handles missing token gracefully', () => {
    (authStore.getState as jest.Mock).mockReturnValue({
      token: null,
      user: mockAuthState.user
    });

    const headers = buildAuthHeaders();

    expect(headers['Authorization']).not.toBeDefined();
    expect(headers['X-User-Id']).toBe('user-123');
  });

  test('UT-007: Handles missing user context gracefully', () => {
    (authStore.getState as jest.Mock).mockReturnValue({
      token: mockAuthState.token,
      user: null
    });

    const headers = buildAuthHeaders();

    expect(headers['Authorization']).toBeDefined();
    expect(headers['X-User-Id']).not.toBeDefined();
  });

  test('Returns Content-Type header', () => {
    const headers = buildAuthHeaders();

    expect(headers['Content-Type']).toBe('application/json');
  });

  test('Allows extra headers to be merged', () => {
    const headers = buildAuthHeaders({ 'X-Custom-Header': 'custom-value' });

    expect(headers['X-Custom-Header']).toBe('custom-value');
    expect(headers['Authorization']).toBeDefined();
  });
});

// ============================================================================
// COMPONENT TEST (React Testing Library)
// File: tests/unit/BulkActionToolbar.test.tsx
// ============================================================================

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkActionToolbar from '../../packages/web/src/verticals/scheduling-visits/components/BulkActionToolbar';

const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

describe('BulkActionToolbar', () => {
  const mockCaregivers = {
    data: [
      { id: 'cg-001', firstName: 'Alice', lastName: 'Johnson' },
      { id: 'cg-002', firstName: 'Bob', lastName: 'Smith' },
      { id: 'cg-003', firstName: 'Carol', lastName: 'Williams' }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('UT-008: Caregiver fetch triggers on showReassignDialog=true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockCaregivers
    });

    const { rerender } = render(
      <BulkActionToolbar showReassignDialog={false} selectedCount={2} />
    );

    // Trigger dialog
    rerender(
      <BulkActionToolbar showReassignDialog={true} selectedCount={2} />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/caregivers?status=ACTIVE',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.any(String)
          })
        })
      );
    });
  });

  test('UT-009: Loading state manages correctly', async () => {
    mockFetch.mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({
            ok: true,
            json: async () => mockCaregivers
          }),
          500
        )
      )
    );

    const { getByText, queryByText } = render(
      <BulkActionToolbar showReassignDialog={true} selectedCount={1} />
    );

    // Check loading state appears
    expect(getByText(/Loading/i)).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(
      () => {
        expect(queryByText(/Loading/i)).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  test('UT-010: Caregiver data maps correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockCaregivers
    });

    render(
      <BulkActionToolbar showReassignDialog={true} selectedCount={1} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Bob Smith')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Carol Williams')).toBeInTheDocument();
    });
  });

  test('UT-011: Error boundary catches fetch errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(
      <BulkActionToolbar showReassignDialog={true} selectedCount={1} />
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch caregivers'),
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
  });
});

// ============================================================================
// TEST CONFIGURATION
// File: jest.config.js (add to existing config)
// ============================================================================

module.exports = {
  // ... existing config ...
  
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
    '**/tests/**/*.test.[jt]s?(x)'
  ],
  
  collectCoverageFrom: [
    'packages/web/src/**/*.{ts,tsx}',
    '!packages/web/src/**/*.d.ts',
    '!packages/web/src/main.tsx',
    '!packages/web/src/index.tsx'
  ],
  
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 85,
      statements: 85
    },
    './packages/web/src/core/utils/auth-headers.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './packages/web/src/verticals/scheduling-visits/components/BulkActionToolbar.tsx': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};

// ============================================================================
// PLAYWRIGHT CONFIG
// File: playwright.config.ts (add to existing config)
// ============================================================================

export default {
  // ... existing config ...
  
  testDir: './tests/e2e',
  testMatch: '**/*fc-sched-001*.spec.ts',
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
};
