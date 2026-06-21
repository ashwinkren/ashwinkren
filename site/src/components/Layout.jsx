import { Outlet, NavLink } from "react-router-dom";
import styles from "./Layout.module.css";

export default function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.logo}>
          <span className={styles.logoMark}>AK</span>
          <span className={styles.logoText}>ashwin kren</span>
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? styles.active : "")}>
            Home
          </NavLink>
          <NavLink to="/scrollmap" className={({ isActive }) => (isActive ? styles.active : "")}>
            ScrollMap
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Ashwin Kren</span>
        <a href="https://ashwinkren.com/scrollmap">ashwinkren.com/scrollmap</a>
      </footer>
    </div>
  );
}
