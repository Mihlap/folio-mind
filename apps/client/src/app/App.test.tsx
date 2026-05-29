import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '@folio-mind/store';
import { App } from './App';

describe('App', () => {
  it('renders landing', () => {
    const store = createAppStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText(/понимают контекст/i)).toBeInTheDocument();
  });
});
