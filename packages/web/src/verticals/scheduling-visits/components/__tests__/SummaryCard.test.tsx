import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { SummaryCard } from '../SummaryCard';

describe('SummaryCard', () => {
  it('renders title, count, and subtitle', () => {
    render(
      <SummaryCard
        title="Upcoming"
        count={12}
        icon={<Calendar data-testid="cal-icon" />}
        subtitle="Next 30 days"
      />
    );

    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Next 30 days')).toBeInTheDocument();
  });

  it('handles click events and shows active badge when active', () => {
    const handleClick = vi.fn();
    render(
      <SummaryCard
        title="Today"
        count={5}
        icon={<Calendar />}
        isActive={true}
        onClick={handleClick}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
