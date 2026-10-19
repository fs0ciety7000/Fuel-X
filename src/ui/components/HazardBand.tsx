import { cx } from './cx';
import styles from './HazardBand.module.css';

/** §6.31 danger mass: 4 px hazard stripes (wide = 8 px). Decorative; the word + glyph carry the meaning. */
export function HazardBand({
  orientation = 'vertical',
  wide = false,
  className,
}: {
  orientation?: 'vertical' | 'horizontal';
  wide?: boolean;
  className?: string | undefined;
}) {
  return <span aria-hidden="true" className={cx(styles.band, styles[orientation], wide && styles.wide, className)} />;
}
