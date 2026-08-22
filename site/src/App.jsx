import { useEffect, useState } from "react";
import { PROJECTS } from "./data/projects";
import { hashPassword, isAuthed, setAuthed, PASSWORD_HASH } from "./lib/auth";
import Starfield from "./Starfield";
import styles from "./App.module.css";

function Login({ onSuccess }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const h = await hashPassword(pw.trim());
    if (h === PASSWORD_HASH) {
      setAuthed();
      onSuccess();
    } else {
      setErr("Wrong password.");
    }
    setLoading(false);
  }

  return (
    <div className={styles.gate}>
      <form className={styles.gateCard} onSubmit={submit}>
        <p className={styles.gateEyebrow}>ashwinkren.com</p>
        <h1 className={styles.gateTitle}>Private portfolio</h1>
        <p className={styles.gateHint}>Enter the password to continue.</p>
        <input
          type="password"
          className={styles.input}
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
        {err && <p className={styles.error}>{err}</p>}
        <button type="submit" className={styles.button} disabled={loading || !pw}>
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

function ProjectCard({ project }) {
  return (
    <a className={styles.card} href={project.href} target="_blank" rel="noopener noreferrer">
      <div className={styles.cardImageWrap}>
        <img src={project.image} alt="" className={styles.cardImage} loading="lazy" />
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardCategory}>{project.category}</p>
        <h3 className={styles.cardTitle}>{project.title}</h3>
        <p className={styles.cardDescription}>{project.description}</p>
      </div>
    </a>
  );
}

function Portfolio() {
  return (
    <>
      <header className={styles.topBar}>
        <h1 className={styles.title}>Ashwin Rengarajan's Projects</h1>
        <p className={styles.subtitle}>
          Nueva 26&apos; and USC &apos;30: Behavioral Economics and Entrepreneurship
        </p>
      </header>

      <main className={styles.page}>
        <div className={styles.grid}>
          {PROJECTS.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>

        <footer className={styles.footer}>
          <a
            href="https://www.linkedin.com/in/ashwin-rengarajan-8551402b5"
            target="_blank"
            rel="noopener noreferrer"
          >
            linkedin
          </a>
          <span className={styles.footerSep}>|</span>
          <a href="mailto:ashwinkren@gmail.com">ashwinkren@gmail.com</a>
          <span className={styles.footerSep}>|</span>
          <a href="tel:+16505337880">6505337880</a>
        </footer>
      </main>
    </>
  );
}

export default function App() {
  const [authed, setAuthedState] = useState(false);

  useEffect(() => {
    setAuthedState(isAuthed());
  }, []);

  return (
    <>
      <Starfield />
      {!authed ? <Login onSuccess={() => setAuthedState(true)} /> : <Portfolio />}
    </>
  );
}
