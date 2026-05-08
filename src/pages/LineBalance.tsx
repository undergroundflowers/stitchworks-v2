import { SW_COLORS } from '../design/tokens';

/**
 * Line Balance studio. The actual balancer lives in `/line-balancer.html`
 * (a self-contained tool shipped via Vite's public/). We embed it in an
 * iframe.
 */
export function LineBalancePage() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: SW_COLORS.paperDeep,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <iframe
          src="/line-balancer.html"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          title="Line Balance Studio"
        />
      </div>
    </div>
  );
}
