import { Component, ReactNode } from 'react';
import { tx } from '../lib/i18n';
import { track } from '../lib/beacon';

/** One corrupt entry must blank a tab, never the whole app. */
export default function withBoundary(node: ReactNode, label: string, lang?: string) {
  return (
    <Boundary label={label} lang={lang}>
      {node}
    </Boundary>
  );
}

class Boundary extends Component<{ label: string; children: ReactNode; lang?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    track('screen_error', { message: error.message.slice(0, 500), kind: 'render', label: this.props.label });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="card">
          <h3>
            {this.props.label} {tx(this.props.lang, "couldn't load")}
          </h3>
          <p className="hint" style={{ margin: '0 0 12px' }}>
            {tx(
              this.props.lang,
              'Something in this view hit bad data. Your logs are safe · try another tab, or export a backup from Settings before clearing anything.'
            )}
          </p>
          <button className="btn ghost sm" onClick={() => { track('screen_error_retry', { label: this.props.label }); this.setState({ failed: false }); }}>
            {tx(this.props.lang, 'Try again')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
