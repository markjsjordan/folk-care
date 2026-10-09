import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitFilters } from '../VisitFilters';

describe('VisitFilters', () => {
  it('renders filter trigger button and displays active count badge', () => {
    const handleFiltersChange = vi.fn();
    render(
      <VisitFilters
        filters={{ status: ['SCHEDULED'] }}
        onFiltersChange={handleFiltersChange}
        activeCount={1}
      />
    );

    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('opens popup when clicked and toggles status selection', () => {
    const handleFiltersChange = vi.fn();
    render(
      <VisitFilters
        filters={{}}
        onFiltersChange={handleFiltersChange}
        activeCount={0}
      />
    );

    const filterButton = screen.getByRole('button', { name: /filters/i });
    fireEvent.click(filterButton);

    expect(screen.getByText('Filter Visits')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();

    const scheduledButton = screen.getByRole('button', { name: /scheduled/i });
    fireEvent.click(scheduledButton);

    expect(handleFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['SCHEDULED'],
      })
    );
  });
});
