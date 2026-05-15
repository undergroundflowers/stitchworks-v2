export { WorkstationSprite } from './workstations';
export { WorkerSprite } from './workers';
export type { WorkerSpriteStyle } from './workers';
export {
  ProductSprite,
  PRODUCT_KINDS,
  PRODUCT_LABELS,
  PRODUCT_GROUPS,
  type ProductKind,
} from './products';

/** Loose-typed product sprite used by the asset library so user-authored
 *  product kinds (string ids) can still be rendered by piggy-backing on a
 *  built-in sprite. The Asset Library converts custom kinds to their
 *  `baseSprite` before calling this. */
export type ProductSpriteKindHint = string;
