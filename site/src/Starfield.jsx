import { useEffect, useState } from "react";
import styles from "./Starfield.module.css";

// Sparse fixed stars — x/y in %, size in px, opacity 0–1
const STARS = [
  [8, 6, 1, 0.45], [22, 14, 1.5, 0.55], [38, 9, 1, 0.35], [55, 18, 1, 0.5],
  [71, 7, 1, 0.4], [88, 15, 1.5, 0.6], [94, 28, 1, 0.3], [14, 32, 1, 0.4],
  [31, 41, 1, 0.35], [48, 35, 1.5, 0.5], [63, 44, 1, 0.45], [79, 38, 1, 0.35],
  [6, 58, 1, 0.4], [26, 67, 1, 0.3], [44, 62, 1.5, 0.55], [58, 71, 1, 0.4],
  [76, 55, 1, 0.35], [91, 68, 1, 0.45], [18, 84, 1, 0.3], [37, 78, 1, 0.4],
  [52, 88, 1.5, 0.5], [69, 82, 1, 0.35], [85, 91, 1, 0.4], [96, 52, 1, 0.3],
  [11, 22, 1, 0.35], [42, 52, 1, 0.3], [67, 24, 1, 0.4], [33, 95, 1, 0.35],
];

export default function Starfield() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setOffset(window.scrollY * 0.18));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.layer} style={{ transform: `translate3d(0, ${-offset}px, 0)` }}>
        {STARS.map(([x, y, size, opacity], i) => (
          <span
            key={i}
            className={styles.star}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              opacity,
            }}
          />
        ))}
        {/* duplicate set lower for scroll coverage */}
        {STARS.map(([x, y, size, opacity], i) => (
          <span
            key={`b-${i}`}
            className={styles.star}
            style={{
              left: `${x}%`,
              top: `${y + 100}%`,
              width: size,
              height: size,
              opacity: opacity * 0.85,
            }}
          />
        ))}
      </div>
    </div>
  );
}
