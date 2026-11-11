import { useNavigate } from 'react-router-dom';
import { SW_COLORS } from '../design/tokens';
import { Icon, QueueingReference, ViewTitle } from '../components';

/**
 * Help — the one place the queueing-theory reference lives.
 *
 * The sheet used to be appended to the bottom of both the Queue Lab and the
 * station detail page: the same two-screen table twice, under whatever the
 * user had actually come to look at. It is reference, not result, so it gets
 * its own tab and the working surfaces end where their own content ends.
 *
 * Same title bar as the Builder and Resources — back button, then the view
 * title — so the page reads as one more tab of the same app.
 */
export function HelpPage() {
  const navigate = useNavigate();
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: SW_COLORS.paperDeep }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: SW_COLORS.paper, borderBottom: `1px solid ${SW_COLORS.line}` }}>
        <button
          onClick={() => navigate(-1)}
          title="Back"
          aria-label="Back"
          style={{
            width: 30,
            height: 30,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.line}`,
            borderRadius: 6,
            color: SW_COLORS.muted,
            cursor: 'pointer',
          }}
        >
          <Icon name="back" />
        </button>
        <ViewTitle title="Queueing-theory reference" />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <QueueingReference />
      </div>
    </div>
  );
}
