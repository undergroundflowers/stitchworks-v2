import { useNavigate } from 'react-router-dom';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';

/**
 * Line Balance studio. The actual balancer lives in `/line-balancer.html`
 * (a self-contained tool shipped via Vite's public/). We embed it in an
 * iframe and decorate with a sub-header that links back to Factory Twin and
 * forward to Live Floor — same pattern as the original SWLineBalance.
 */
export function LineBalancePage() {
  const navigate = useNavigate();
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
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid ${SW_COLORS.line}`,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: SW_RADIUS.sm,
              background: SW_COLORS.brandLite,
              color: SW_COLORS.brand,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            ⚖
          </div>
          <div>
            <div
              style={{
                fontFamily: SW_FONTS.display,
                fontSize: 16,
                color: SW_COLORS.ink,
                lineHeight: 1.1,
              }}
            >
              LINE BALANCE STUDIO
            </div>
            <div
              style={{
                fontFamily: SW_FONTS.mono,
                fontSize: 10,
                color: SW_COLORS.muted,
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginTop: 2,
              }}
            >
              UNIT 3 · 9 PRODUCTION SYSTEMS · LIVE TWIN
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/twin')}
            style={{
              background: 'transparent',
              border: `1px solid ${SW_COLORS.line}`,
              padding: '7px 12px',
              borderRadius: SW_RADIUS.sm,
              fontFamily: SW_FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              color: SW_COLORS.ink,
            }}
          >
            ← Factory Twin
          </button>
          <button
            onClick={() => navigate('/floor')}
            style={{
              background: SW_COLORS.brand,
              border: `1px solid ${SW_COLORS.brand}`,
              padding: '7px 12px',
              borderRadius: SW_RADIUS.sm,
              fontFamily: SW_FONTS.body,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            Open in Live Floor →
          </button>
        </div>
      </div>
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
