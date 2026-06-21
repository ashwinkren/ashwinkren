import { Link } from "react-router-dom";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Personal site</p>
        <h1 className={styles.title}>
          Building tools that understand
          <em> how you actually consume</em>
        </h1>
        <p className={styles.lead}>
          I work at the intersection of behavioral data, digital wellness, and honest recommendation systems —
          not engagement-maximizing feeds, but tools aligned with your satisfaction.
        </p>
        <div className={styles.actions}>
          <Link to="/scrollmap" className={styles.primaryBtn}>
            Open ScrollMap
          </Link>
          <a href="mailto:hello@ashwinkren.com" className={styles.secondaryBtn}>
            Get in touch
          </a>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.cardTag}>Live analytics</span>
          <h2>ScrollMap</h2>
          <p>
            A companion dashboard for the Reel Mirror extension. Classification, satisfaction scores,
            consumption patterns, focus insights, and a personal digital wellness score — synced from your browser.
          </p>
          <Link to="/scrollmap" className={styles.cardLink}>
            View dashboard →
          </Link>
        </article>

        <article className={styles.card}>
          <span className={styles.cardTag}>Research</span>
          <h2>Consumption-aware productivity</h2>
          <p>
            Most focus apps ignore what you watched before you tried to work. ScrollMap correlates pre-work
            scrolling with focus quality — brainrot vs. mental warmup, quantified.
          </p>
        </article>

        <article className={styles.card}>
          <span className={styles.cardTag}>Tools</span>
          <h2>Parenting & creator research</h2>
          <p>
            Privacy-preserving family insights and satisfaction-based creator feedback — behavioral signals
            that matter, not vanity metrics.
          </p>
          <Link to="/scrollmap?tab=parenting" className={styles.cardLink}>
            Explore tools →
          </Link>
        </article>
      </section>
    </div>
  );
}
