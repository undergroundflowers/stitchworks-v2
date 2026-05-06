import { SectionHeader, Card, Tag } from '../components';
import { SW_COLORS, SW_FONTS } from '../design/tokens';

interface PageStubProps {
  kicker: string;
  title: string;
  sub: string;
  /** Source line range in STITCHWORKS.html — for traceability while porting. */
  sourceLines?: string;
}

/**
 * Placeholder shell for pages whose content has not been ported yet from
 * STITCHWORKS.html. Each stub announces what it will become and points back
 * to the source line range so we don't lose track of the porting plan.
 */
export function PageStub({ kicker, title, sub, sourceLines }: PageStubProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: SW_COLORS.paperDeep,
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <SectionHeader
          kicker={kicker}
          title={title}
          sub={sub}
          right={<Tag soft color={SW_COLORS.brand}>NOT YET PORTED</Tag>}
        />
        <Card padding={24}>
          <div
            style={{
              fontFamily: SW_FONTS.body,
              fontSize: 13,
              color: SW_COLORS.muted,
              lineHeight: 1.6,
            }}
          >
            This page is a placeholder. Its design lives in{' '}
            <code
              style={{
                background: SW_COLORS.paperDeep,
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: SW_FONTS.mono,
                fontSize: 12,
              }}
            >
              STITCHWORKS.html
            </code>
            {sourceLines && (
              <>
                {' '}
                at <strong>lines {sourceLines}</strong>
              </>
            )}{' '}
            and will be ported into{' '}
            <code
              style={{
                background: SW_COLORS.paperDeep,
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: SW_FONTS.mono,
                fontSize: 12,
              }}
            >
              src/pages/
            </code>{' '}
            as proper React + TypeScript components.
          </div>
        </Card>
      </div>
    </div>
  );
}
