import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskList } from '../TaskList';

const mockOnSelectClient = vi.fn();

vi.mock('../../components', () => ({
  TaskClientPicker: ({ onSelectClient }: { onSelectClient: (client: unknown) => void }) => {
    mockOnSelectClient.mockImplementation(onSelectClient);
    return (
      <div data-testid="task-client-picker">
        <button
          onClick={() =>
            onSelectClient({
              id: 'client-1',
              firstName: 'Jane',
              lastName: 'Doe',
              preferredName: undefined,
              clientNumber: 'C-001',
            })
          }
        >
          Select Jane Doe
        </button>
      </div>
    );
  },
  TaskInstanceList: ({ clientId }: { clientId?: string }) => (
    <div data-testid="task-instance-list" data-client-id={clientId ?? ''}>
      TaskInstanceList
    </div>
  ),
}));

describe('TaskList', () => {
  it('renders the client picker by default, not a task list', () => {
    render(<TaskList />);

    expect(screen.getByTestId('task-client-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('task-instance-list')).not.toBeInTheDocument();
  });

  it('shows TaskInstanceList scoped to the selected client after selection', async () => {
    const user = userEvent.setup();
    render(<TaskList />);

    await user.click(screen.getByText('Select Jane Doe'));

    const list = screen.getByTestId('task-instance-list');
    expect(list).toBeInTheDocument();
    expect(list.dataset.clientId).toBe('client-1');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('shows org-wide TaskInstanceList with no clientId when "View All Clients" is clicked', async () => {
    const user = userEvent.setup();
    render(<TaskList />);

    await user.click(screen.getByText('View All Clients'));

    const list = screen.getByTestId('task-instance-list');
    expect(list).toBeInTheDocument();
    expect(list.dataset.clientId).toBe('');
  });

  it('returns to the picker view when the back button is clicked', async () => {
    const user = userEvent.setup();
    render(<TaskList />);

    await user.click(screen.getByText('Select Jane Doe'));
    expect(screen.getByTestId('task-instance-list')).toBeInTheDocument();

    await user.click(screen.getByText('Back to client search'));

    expect(screen.getByTestId('task-client-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('task-instance-list')).not.toBeInTheDocument();
  });
});
