import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { analyzeCreatorContent, buildAnalytics, generateDemoReport } from "../lib/analytics.js";
import {
  addMoodEntry,
  createSyncId,
  fetchSyncedReport,
  getMoodEntries,
  getStoredReport,
  getSyncId,
  parseImportFile,
  saveReport,
  setSyncId,
} from "../lib/storage.js";
import styles from "./ScrollMap.module.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "consumption", label: "Consumption" },
  { id: "focus", label: "Focus" },
  { id: "recommendations", label: "Recommendations" },
  { id: "wellness", label: "Wellness" },
  { id: "parenting", label: "Parenting" },
  { id: "creator", label: "Creator Research" },
];

function Stat({ label, value, sub }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

function BarChart({ items, valueKey = "count", labelKey = "category" }) {
  const max = Math.max(...items.map((i) => i[valueKey] || 0), 1);
  return (
    <div className={styles.barChart}>
      {items.map((item) => (
        <div key={item[labelKey]} className={styles.barRow}>
          <span className={styles.barLabel}>{String(item[labelKey]).replace(/-/g, " ")}</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${((item[valueKey] || 0) / max) * 100}%` }} />
          </div>
          <span className={styles.barValue}>{item[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function HourHeatmap({ hours }) {
  const max = Math.max(...hours.map((h) => h.count), 1);
  return (
    <div className={styles.heatmap}>
      {hours.map((h) => (
        <div
          key={h.hour}
          className={styles.heatCell}
          title={`${h.hour}:00 — ${h.count} reels${h.avgSatisfaction != null ? `, ${Math.round(h.avgSatisfaction * 100)}% sat` : ""}`}
          style={{ opacity: 0.15 + (h.count / max) * 0.85 }}
        >
          <span>{h.hour}</span>
        </div>
      ))}
    </div>
  );
}

function FocusTimer({ minutes, difficulty, onComplete }) {
  const [seconds, setSeconds] = useState(minutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSeconds(minutes * 60);
    setRunning(false);
  }, [minutes]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [running, seconds]);

  useEffect(() => {
    if (seconds === 0 && running) {
      setRunning(false);
      onComplete?.();
    }
  }, [seconds, running, onComplete]);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <div className={styles.timer}>
      <div className={`${styles.timerRing} ${styles[`diff_${difficulty}`]}`}>
        <span className={styles.timerDisplay}>
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </div>
      <div className={styles.timerActions}>
        <button type="button" className={styles.btnPrimary} onClick={() => setRunning(!running)}>
          {running ? "Pause" : seconds === 0 ? "Restart" : "Start focus"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => { setSeconds(minutes * 60); setRunning(false); }}>
          Reset
        </button>
      </div>
    </div>
  );
}

export default function ScrollMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "overview";
  const [report, setReport] = useState(() => getStoredReport());
  const [syncId, setSyncIdState] = useState(() => getSyncId() || createSyncId());
  const [syncStatus, setSyncStatus] = useState("idle");
  const [mood, setMood] = useState(3);
  const [moodEntries, setMoodEntries] = useState(() => getMoodEntries());
  const [importError, setImportError] = useState("");
  const [focusDone, setFocusDone] = useState(false);

  const analytics = useMemo(
    () => (report ? buildAnalytics(report, { moodEntries }) : null),
    [report, moodEntries]
  );

  const loadDemo = useCallback(() => {
    const demo = generateDemoReport();
    saveReport(demo);
    setReport(demo);
    setSyncIdState(createSyncId());
  }, []);

  const refreshSync = useCallback(async () => {
    if (!syncId) return;
    setSyncStatus("syncing");
    try {
      const synced = await fetchSyncedReport(syncId);
      if (synced?.reels?.length) {
        saveReport(synced);
        setReport(synced);
        setSyncStatus("live");
      } else {
        setSyncStatus(report ? "local" : "waiting");
      }
    } catch {
      setSyncStatus("offline");
    }
  }, [syncId, report]);

  useEffect(() => {
    setSyncId(syncId);
  }, [syncId]);

  useEffect(() => {
    refreshSync();
    const interval = setInterval(refreshSync, 15000);
    return () => clearInterval(interval);
  }, [refreshSync]);

  useEffect(() => {
    if (!report) loadDemo();
  }, [report, loadDemo]);

  const onImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseImportFile(reader.result);
        saveReport(parsed);
        setReport(parsed);
        setImportError("");
      } catch (err) {
        setImportError(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const setTab = (id) => {
    setSearchParams(id === "overview" ? {} : { tab: id });
  };

  const saveMood = () => {
    const entries = addMoodEntry(mood);
    setMoodEntries([...entries]);
  };

  if (!analytics) {
    return (
      <div className={styles.empty}>
        <h1>ScrollMap</h1>
        <p>Import your Reel Mirror export or load demo data to get started.</p>
        <button type="button" className={styles.btnPrimary} onClick={loadDemo}>
          Load demo data
        </button>
      </div>
    );
  }

  const { consumptionSummary, focus, wellness, recommendations, parenting, categories, hours, creators, reels } = analytics;

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1>ScrollMap</h1>
          <p>Live consumption analytics</p>
        </div>
        <nav className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? styles.tabActive : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className={styles.syncPanel}>
          <label className={styles.syncLabel}>Sync ID</label>
          <code className={styles.syncId}>{syncId}</code>
          <p className={styles.syncHint}>Paste this in the Reel Mirror extension to push live data.</p>
          <span className={`${styles.syncBadge} ${styles[`sync_${syncStatus}`]}`}>
            {syncStatus === "live" ? "● Live" : syncStatus === "syncing" ? "↻ Syncing" : syncStatus === "offline" ? "○ Offline" : "◐ Waiting"}
          </span>
          <label className={styles.fileBtn}>
            Import JSON
            <input type="file" accept=".json" hidden onChange={onImport} />
          </label>
          {importError && <p className={styles.error}>{importError}</p>}
        </div>
      </aside>

      <div className={styles.content}>
        {tab === "overview" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Overview</h2>
              <p className={styles.updated}>Updated {new Date(analytics.exportedAt).toLocaleString()}</p>
            </header>
            <div className={styles.statGrid}>
              <Stat label="Reels tracked" value={consumptionSummary.totalReels} />
              <Stat label="Watch time" value={`${consumptionSummary.totalDwellMin}m`} />
              <Stat
                label="Avg satisfaction"
                value={consumptionSummary.avgSatisfaction != null ? `${Math.round(consumptionSummary.avgSatisfaction * 100)}%` : "—"}
              />
              <Stat label="Engagement" value={`${consumptionSummary.engagementRate}%`} />
            </div>
            <div className={styles.twoCol}>
              <section className={styles.panel}>
                <h3>Category breakdown</h3>
                <BarChart items={categories.slice(0, 8)} />
              </section>
              <section className={styles.panel}>
                <h3>Time of day</h3>
                <HourHeatmap hours={hours} />
              </section>
            </div>
            <section className={styles.insightBanner}>
              <strong>Focus hint:</strong> {focus.message}
            </section>
          </>
        )}

        {tab === "consumption" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Consumption patterns</h2>
              <p>How you scroll — compulsion vs. intention, category mix, timing.</p>
            </header>
            <div className={styles.statGrid}>
              <Stat label="Top category" value={consumptionSummary.topCategory?.replace(/-/g, " ") || "—"} />
              <Stat label="Best satisfaction" value={consumptionSummary.bestCategory?.replace(/-/g, " ") || "—"} />
              <Stat label="Brainrot share" value={`${consumptionSummary.brainrotShare}%`} sub="of reels" />
              <Stat label="Compulsive scrolls" value={`${consumptionSummary.compulsionRate}%`} sub="last hour signal" />
            </div>
            <div className={styles.twoCol}>
              <section className={styles.panel}>
                <h3>Category × satisfaction</h3>
                <div className={styles.table}>
                  <div className={styles.tableHead}>
                    <span>Category</span><span>Count</span><span>Min</span><span>Sat</span>
                  </div>
                  {categories.map((c) => (
                    <div key={c.category} className={styles.tableRow}>
                      <span>{c.category.replace(/-/g, " ")}</span>
                      <span>{c.count}</span>
                      <span>{c.dwellMinutes}m</span>
                      <span>{c.avgSatisfaction != null ? `${Math.round(c.avgSatisfaction * 100)}%` : "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className={styles.panel}>
                <h3>Recent reels</h3>
                <ul className={styles.reelList}>
                  {reels.slice(0, 12).map((r) => (
                    <li key={r.id}>
                      <span className={styles.reelCat}>{r.category}</span>
                      <span className={styles.reelCap}>{r.caption?.slice(0, 60) || r.username}</span>
                      <span className={styles.reelScore}>
                        {r.satisfactionScore != null ? `${Math.round(r.satisfactionScore * 100)}%` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

        {tab === "focus" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Focus & mental warmup</h2>
              <p>Consumption-aware Pomodoro — your pre-work scrolling predicts session difficulty.</p>
            </header>
            <section className={styles.panel}>
              <p className={styles.focusMsg}>{focus.message}</p>
              <div className={styles.focusMeta}>
                <span>Last hour brainrot: {focus.brainrotMinutes}m</span>
                <span>High-sat content: {focus.highSatMinutes}m</span>
                <span>Difficulty: {focus.difficulty}</span>
              </div>
              <FocusTimer
                minutes={focus.suggestedMinutes}
                difficulty={focus.difficulty}
                onComplete={() => setFocusDone(true)}
              />
              {focusDone && <p className={styles.focusDone}>Session complete — log how it felt in Wellness.</p>}
            </section>
            <section className={styles.panel}>
              <h3>What we correlate</h3>
              <ul className={styles.bulletList}>
                <li>High-satisfaction content before work → longer suggested focus blocks</li>
                <li>Brainrot + fast scrolling → shorter 15 min blocks recommended</li>
                <li>Compulsion ratio from scroll velocity and dwell time</li>
              </ul>
            </section>
          </>
        )}

        {tab === "recommendations" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Your recommendation engine</h2>
              <p>Optimized for your satisfaction — not platform engagement.</p>
            </header>
            <div className={styles.recGrid}>
              {recommendations.length ? (
                recommendations.map((rec, i) => (
                  <article key={i} className={styles.recCard}>
                    <span className={styles.recType}>{rec.type}</span>
                    <p>{rec.text}</p>
                  </article>
                ))
              ) : (
                <p className={styles.muted}>Scroll more reels to build personalized recommendations.</p>
              )}
            </div>
            <section className={styles.panel}>
              <h3>Top creators for you</h3>
              <div className={styles.table}>
                <div className={styles.tableHead}>
                  <span>Creator</span><span>Reels</span><span>Avg sat</span>
                </div>
                {creators.slice(0, 8).map((c) => (
                  <div key={c.username} className={styles.tableRow}>
                    <span>@{c.username}</span>
                    <span>{c.count}</span>
                    <span>{c.avgSatisfaction != null ? `${Math.round(c.avgSatisfaction * 100)}%` : "—"}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "wellness" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Digital wellness score</h2>
              <p>Quality of your media relationship — not just screen time quantity.</p>
            </header>
            <div className={styles.wellnessHero}>
              <div className={styles.wellnessScore}>
                <span className={styles.wellnessNumber}>{wellness.score ?? "—"}</span>
                <span className={styles.wellnessLabel}>weekly score</span>
              </div>
              <div className={styles.wellnessBreakdown}>
                {Object.entries(wellness.breakdown || {}).map(([k, v]) => (
                  <div key={k} className={styles.wellnessBar}>
                    <span>{k}</span>
                    <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${v}%` }} /></div>
                    <span>{v}%</span>
                  </div>
                ))}
              </div>
            </div>
            <section className={styles.panel}>
              <h3>14-day satisfaction trend</h3>
              <div className={styles.trendChart}>
                {(wellness.trend || []).map((d) => (
                  <div key={d.date} className={styles.trendBar} title={`${d.date}: ${d.avgSat}%`}>
                    <div style={{ height: `${d.avgSat}%` }} />
                    <span>{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.panel}>
              <h3>Log mood</h3>
              <p className={styles.muted}>Optional — feeds into your wellness score over time.</p>
              <div className={styles.moodRow}>
                <input type="range" min="1" max="5" value={mood} onChange={(e) => setMood(+e.target.value)} />
                <span>{["😞", "😕", "😐", "🙂", "😊"][mood - 1]}</span>
                <button type="button" className={styles.btnPrimary} onClick={saveMood}>Save</button>
              </div>
            </section>
          </>
        )}

        {tab === "parenting" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Parenting insights</h2>
              <p>Content breakdown without exposing specific posts — conversation starters, not surveillance.</p>
            </header>
            <p className={styles.privacyNote}>{parenting.privacyNote}</p>
            {parenting.alerts.map((a, i) => (
              <div key={i} className={`${styles.alert} ${styles[`alert_${a.level}`]}`}>{a.text}</div>
            ))}
            <div className={styles.statGrid}>
              <Stat label="Late-night share" value={`${parenting.lateNightShare}%`} />
              <Stat label="Late-night satisfaction" value={parenting.avgLateSat != null ? `${parenting.avgLateSat}%` : "—"} />
            </div>
            <section className={styles.panel}>
              <h3>Category mix (anonymous)</h3>
              <BarChart items={parenting.categoryMix.map((c) => ({ category: c.label, count: c.share }))} />
            </section>
          </>
        )}

        {tab === "creator" && (
          <>
            <header className={styles.sectionHeader}>
              <h2>Creator research</h2>
              <p>Satisfaction signals from willing viewers — focus group data, not vanity metrics.</p>
            </header>
            <CreatorPanel reels={reels} />
          </>
        )}
      </div>
    </div>
  );
}

function CreatorPanel({ reels }) {
  const [selectedCat, setSelectedCat] = useState("all");
  const filtered = selectedCat === "all" ? reels : reels.filter((r) => r.category === selectedCat);
  const cats = [...new Set(reels.map((r) => r.category))];
  const analysis = useMemo(
    () => analyzeCreatorContent(filtered, { title: selectedCat === "all" ? "Panel aggregate" : selectedCat }),
    [filtered, selectedCat]
  );

  return (
    <>
      <div className={styles.creatorFilters}>
        <select value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)}>
          <option value="all">All content (panel)</option>
          {cats.map((c) => (
            <option key={c} value={c}>{c.replace(/-/g, " ")}</option>
          ))}
        </select>
      </div>
      <div className={styles.statGrid}>
        <Stat label="Sample size" value={analysis.sampleSize} />
        <Stat label="Avg dwell" value={`${analysis.avgDwellSec}s`} />
        <Stat label="Avg satisfaction" value={analysis.avgSatisfaction != null ? `${Math.round(analysis.avgSatisfaction * 100)}%` : "—"} />
        <Stat label="Engagement" value={`${analysis.engagementRate}%`} />
      </div>
      <section className={styles.panel}>
        <h3>Behavioral signals</h3>
        <ul className={styles.bulletList}>
          <li>Drop-off point: {analysis.dropOffPoint || "Not enough data"}</li>
          <li>Dominant sentiment: {analysis.sentiment}</li>
          <li>Scroll velocity spikes indicate where viewers lost interest</li>
        </ul>
        <p className={styles.muted}>
          Upload flow: creators share content → panel watches with Reel Mirror → aggregated satisfaction,
          dwell, and drop-off data returned. No individual viewer data exposed.
        </p>
      </section>
    </>
  );
}
