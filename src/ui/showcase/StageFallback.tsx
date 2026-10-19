import { publicUrl } from './env';
import styles from './page.module.css';

/** Stage slot before the 3D chunk arrives, or for good without WebGL: the Blender stack render. */
export function StageFallback({ loading }: { loading: boolean }) {
  return (
    <div className={styles.fallback}>
      <img
        src={publicUrl('showcase/plates/_stack.webp')}
        alt="Booster B-09 and ship S-21 stacked on launch mount OLM-1 beside catch tower TOWER-1"
        width={720}
        height={720}
        fetchPriority="high"
      />
      {loading ? <p className={styles.fallbackNote}>[ Loading live model ]</p> : null}
    </div>
  );
}
