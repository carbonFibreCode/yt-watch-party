import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { JoinRoomForm } from './JoinRoomForm';

const renderForm = () => {
  const router = createMemoryRouter(
    [
      { path: '/', Component: JoinRoomForm },
      { path: '/r/:code', Component: () => <p>room page</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('JoinRoomForm', () => {
  it('navigates to the room for a valid code or link', async () => {
    const router = renderForm();
    await userEvent.type(screen.getByLabelText('Room code or link'), 'https://x.test/r/k7m2qx');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(await screen.findByText('room page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/r/K7M2QX');
  });

  it('explains what is wrong with invalid input, and clears the error on edit', async () => {
    renderForm();
    const input = screen.getByLabelText('Room code or link');
    await userEvent.type(input, 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(screen.getByRole('alert')).toHaveTextContent('6-character room code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
