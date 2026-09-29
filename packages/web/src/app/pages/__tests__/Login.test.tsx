/**
 * Login Page Tests
 *
 * Tests for the custom email/password login form (CustomLoginForm),
 * rendered via the Login page. Covers:
 * - Form validation (required fields, email format)
 * - Successful login and role-based dashboard routing
 * - Rate limiting error handling and countdown
 * - Client-side cooldown between submit attempts
 * - Error handling for auth failures
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Login } from '../Login';

// Mock dependencies
const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockAuthServiceLogin = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/core/hooks', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    isAuthenticated: false,
    login: mockLogin,
    logout: vi.fn(),
  }),
  useAuthService: () => ({
    login: mockAuthServiceLogin,
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

const fillAndSubmit = async (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
};

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the Marquette Home Care branding and login form', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText('Marquette Home Care')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should show a validation error when email is missing', async () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });

  it('should show a validation error when password is missing', async () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'admin@folkcare.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });

  it('should show a validation error for an invalid email format', async () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    // "foo@bar" passes the native HTML5 <input type="email"> constraint
    // (which only requires an "@") but fails the component's stricter
    // regex requiring a dot in the domain — this reaches React's validator.
    await fillAndSubmit('foo@bar', 'Password123!');

    expect(
      await screen.findByText('Please enter a valid email address')
    ).toBeInTheDocument();
    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });

  it('should successfully log in and route admin users to their dashboard', async () => {
    const mockUser = {
      userId: '123',
      name: 'Test Admin',
      email: 'admin@folkcare.example',
      organizationId: '456',
      roles: ['ADMIN'],
      permissions: ['*:*'],
    };

    mockAuthServiceLogin.mockResolvedValue({
      user: mockUser,
      token: 'test-token',
    });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'Admin123!');

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledWith({
        email: 'admin@folkcare.example',
        password: 'Admin123!', // eslint-disable-line sonarjs/no-hardcoded-passwords -- test fixture, not a real credential
      });
      expect(mockLogin).toHaveBeenCalledWith(mockUser, 'test-token');
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });
  });

  it('should route family members to the family portal', async () => {
    const mockUser = {
      userId: '123',
      name: 'Test Family',
      email: 'family@folkcare.example',
      organizationId: '456',
      roles: ['FAMILY'],
      permissions: ['family:*'],
    };

    mockAuthServiceLogin.mockResolvedValue({
      user: mockUser,
      token: 'test-token',
    });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('family@folkcare.example', 'Family123!');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/family-portal');
    });
  });

  it('should show an error banner on login failure', async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error('Invalid credentials'));

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'WrongPassword!');

    expect(await screen.findByText('Login Error')).toBeInTheDocument();
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('should handle rate limit errors with a countdown', async () => {
    const rateLimitError = new Error('Too many requests') as Error & {
      response?: { data?: { code?: string; context?: { retryAfter?: number } } };
    };
    rateLimitError.response = {
      data: {
        code: 'RATE_LIMIT_EXCEEDED',
        context: { retryAfter: 300 }, // 5 minutes
      },
    };

    mockAuthServiceLogin.mockRejectedValue(rateLimitError);

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'Admin123!');

    expect(
      await screen.findByText(/too many login attempts/i)
    ).toBeInTheDocument();
  });

  it('should prevent resubmission while a rate limit is active', async () => {
    const rateLimitError = new Error('Too many requests') as Error & {
      response?: { data?: { code?: string; context?: { retryAfter?: number } } };
    };
    rateLimitError.response = {
      data: {
        code: 'RATE_LIMIT_EXCEEDED',
        context: { retryAfter: 300 },
      },
    };

    mockAuthServiceLogin.mockRejectedValue(rateLimitError);

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'Admin123!');

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledTimes(1);
    });

    mockAuthServiceLogin.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /wait \d+s/i }));

    expect(mockAuthServiceLogin).not.toHaveBeenCalled();
  });

  it('should disable the submit button during login', async () => {
    mockAuthServiceLogin.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    // NOSONAR: fixture password for a test double, not a real credential
    await fillAndSubmit('admin@folkcare.example', 'Admin123!');

    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
  });

  it('should apply a short cooldown after a submit attempt', async () => {
    mockAuthServiceLogin.mockRejectedValue(new Error('Invalid credentials'));

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'WrongPassword!');

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalledTimes(1);
    });

    const callsBeforeRetry = mockAuthServiceLogin.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /wait \d+s/i }));

    // Cooldown should block the second click
    expect(mockAuthServiceLogin).toHaveBeenCalledTimes(callsBeforeRetry);
  });

  it('should handle non-Error exceptions gracefully', async () => {
    mockAuthServiceLogin.mockRejectedValue('String error');

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await fillAndSubmit('admin@folkcare.example', 'Admin123!');

    await waitFor(() => {
      expect(mockAuthServiceLogin).toHaveBeenCalled();
    });
  });

  it('should link to the signup page for new accounts', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    const signupLink = screen.getByRole('link', { name: /sign up here/i });
    expect(signupLink).toHaveAttribute('href', '/signup');
  });
});
