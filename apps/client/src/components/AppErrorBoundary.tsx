import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', this.props.label ?? 'app', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">Что-то сломалось</p>
        <p className="max-w-md text-sm text-slate-600">
          {this.state.error.message || 'Неизвестная ошибка'}
        </p>
        <button
          type="button"
          className="rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            this.setState({ error: null });
            window.location.assign('/app');
          }}
        >
          К документам
        </button>
      </div>
    );
  }
}
