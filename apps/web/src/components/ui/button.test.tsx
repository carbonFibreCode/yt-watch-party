import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

const classesOf = (variant: Variant): string[] => {
  render(<Button variant={variant}>Go</Button>);
  return screen.getByRole('button', { name: 'Go' }).className.split(/\s+/);
};

describe('Button (NeoPOP)', () => {
  it.each([
    ['default', 'neo-edge-primary', 'bg-primary'],
    ['secondary', 'neo-edge-secondary', 'bg-secondary'],
    ['destructive', 'neo-edge-destructive', 'bg-destructive'],
  ] as const)('%s is an elevated, pressable button with its own edge colours', (variant, edge, face) => {
    const classes = classesOf(variant);
    expect(classes).toEqual(expect.arrayContaining(['neo-elevated', 'neo-plunk', 'neo-depth-3', edge, face]));
  });

  it.each(['outline', 'ghost', 'link'] as const)('%s is flat (no 3D edges)', (variant) => {
    const classes = classesOf(variant);
    expect(classes).not.toContain('neo-elevated');
    expect(classes).not.toContain('neo-plunk');
  });

  it.each(['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const)(
    '%s follows the NeoPOP type rules: uppercase, bold, letter-spaced, no rounding or soft shadow',
    (variant) => {
      const classes = classesOf(variant);
      expect(classes).toEqual(expect.arrayContaining(['uppercase', 'font-bold']));
      expect(classes.some((c) => c.startsWith('tracking-'))).toBe(true);
      expect(classes.some((c) => c.startsWith('rounded'))).toBe(false);
      expect(classes.some((c) => c.startsWith('shadow'))).toBe(false);
    },
  );

  it('the outline button is a 2px ink border that inverts on hover', () => {
    const classes = classesOf('outline');
    expect(classes).toEqual(
      expect.arrayContaining([
        'border-2',
        'border-foreground',
        'hover:bg-foreground',
        'hover:text-background',
      ]),
    );
  });

  it('keeps extra classes from callers (e.g. the landing CTA shimmer) alongside the elevation', () => {
    render(<Button className="neo-shimmer w-full">Create room</Button>);
    const classes = screen.getByRole('button').className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['neo-shimmer', 'w-full', 'neo-elevated', 'bg-primary']));
  });

  it('a disabled button cannot be pressed (its edges are hidden by the neo-elevated utility)', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });

  it('still renders as its child with asChild (links styled as buttons)', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/">Back to home</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Back to home' });
    expect(link.className).toContain('neo-elevated');
    expect(link).toHaveAttribute('data-variant', 'secondary');
  });

  it('the accessible name is the written text, not the uppercased rendering', () => {
    render(<Button>Join the party</Button>);
    expect(screen.getByRole('button', { name: 'Join the party' })).toBeInTheDocument();
  });
});
