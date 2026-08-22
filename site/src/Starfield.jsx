import { useEffect, useState } from "react";
import styles from "./Starfield.module.css";

// x%, y%, size px, opacity, bright (0|1)
const STARS = [
  [5, 4, 1, 0.55, 0], [13, 11, 1.5, 0.7, 1], [21, 7, 1, 0.45, 0], [29, 16, 1, 0.5, 0],
  [37, 5, 1.5, 0.65, 1], [45, 13, 1, 0.4, 0], [53, 9, 1, 0.55, 0], [61, 18, 1.5, 0.75, 1],
  [69, 6, 1, 0.45, 0], [77, 14, 1, 0.5, 0], [85, 10, 1.5, 0.6, 1], [93, 20, 1, 0.4, 0],
  [8, 28, 1, 0.45, 0], [17, 34, 1.5, 0.65, 1], [26, 25, 1, 0.5, 0], [34, 38, 1, 0.4, 0],
  [42, 31, 1.5, 0.7, 1], [50, 42, 1, 0.45, 0], [58, 27, 1, 0.55, 0], [66, 36, 1.5, 0.6, 1],
  [74, 30, 1, 0.4, 0], [82, 44, 1, 0.5, 0], [90, 33, 1.5, 0.65, 1], [97, 48, 1, 0.35, 0],
  [4, 52, 1, 0.45, 0], [12, 58, 1.5, 0.6, 1], [20, 49, 1, 0.5, 0], [28, 63, 1, 0.4, 0],
  [36, 55, 1.5, 0.7, 1], [44, 68, 1, 0.45, 0], [52, 51, 1, 0.55, 0], [60, 61, 1.5, 0.65, 1],
  [68, 54, 1, 0.4, 0], [76, 72, 1, 0.5, 0], [84, 58, 1.5, 0.6, 1], [92, 66, 1, 0.45, 0],
  [7, 78, 1, 0.4, 0], [15, 85, 1.5, 0.65, 1], [23, 74, 1, 0.5, 0], [31, 88, 1, 0.45, 0],
  [39, 79, 1.5, 0.7, 1], [47, 92, 1, 0.4, 0], [55, 83, 1, 0.55, 0], [63, 95, 1.5, 0.6, 1],
  [71, 86, 1, 0.45, 0], [79, 76, 1, 0.5, 0], [87, 90, 1.5, 0.65, 1], [95, 82, 1, 0.4, 0],
  [10, 42, 1, 0.35, 0], [33, 19, 1, 0.4, 0], [56, 47, 1.5, 0.55, 1], [78, 22, 1, 0.45, 0],
  [19, 67, 1, 0.4, 0], [48, 74, 1, 0.35, 0], [64, 12, 1.5, 0.6, 1], [88, 52, 1, 0.45, 0],
  [3, 23, 1, 0.35, 0], [41, 57, 1, 0.4, 0], [72, 41, 1.5, 0.55, 1], [16, 91, 1, 0.35, 0],
];

function Stars({ stars, offset }) {
  return (
    <>
      {[0, 100, 200].map((shift) =>
        stars.map(([x, y, size, opacity, bright], i) => (
          <span
            key={`${shift}-${i}`}
            className={bright ? styles.starBright : styles.star}
            style={{
              left: `${x}%`,
              top: `${y + shift}%`,
              width: size,
              height: size,
              opacity: opacity * (shift === 0 ? 1 : shift === 100 ? 0.75 : 0.55),
            }}
          />
        ))
      )}
    </>
  );
}

export default function Starfield() {
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScroll(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const dim = STARS.filter((s) => !s[4]);
  const bright = STARS.filter((s) => s[4]);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.layer} style={{ transform: `translate3d(0, ${-scroll * 0.1}px, 0)` }}>
        <Stars stars={dim} offset={0} />
      </div>
      <div className={styles.layer} style={{ transform: `translate3d(0, ${-scroll * 0.24}px, 0)` }}>
        <Stars stars={bright} offset={0} />
      </div>
    </div>
  );
}
