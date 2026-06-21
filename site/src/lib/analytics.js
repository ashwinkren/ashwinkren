export function classifyVelocity(pxPerMs) {
  if (pxPerMs < 2) return "slow";
  if (pxPerMs <= 8) return "medium";
  return "fast";
}

export function emptyInteractions() {
  return { liked: false, saved: false, shared: false, commented: false, replayed: false };
}

export function computeSatisfaction(signals, interactions, { viewCount = 1, sessionDwellMs = 0 } = {}) {
  const ints = interactions || emptyInteractions();
  const dwell = sessionDwellMs || signals?.dwellTime || 0;
  const vel = classifyVelocity(signals?.scrollVelocityAvg || 0);
  const engaged = ints.liked || ints.saved || ints.shared || ints.commented;

  let s = 0.1;
  s += Math.min(0.25, (dwell / 12000) * 0.25);
  if (ints.liked) s += 0.18;
  if (ints.saved) s += 0.22;
  if (ints.shared) s += 0.14;
  if (ints.commented) s += 0.12;
  if (ints.replayed) s += 0.10;
  if (viewCount > 1) s += Math.min(0.15, (viewCount - 1) * 0.07);
  if (vel === "slow" && dwell > 4000) s += 0.08;
  if (vel === "fast" && !engaged && dwell < 2500) s -= 0.22;
  if (engaged) s = Math.max(s, 0.42);
  return Math.min(1, Math.max(0, +s.toFixed(3)));
}

export function normalizeReel(raw) {
  if (raw.content || raw.classification) {
    const last = raw.sessions?.[raw.sessions.length - 1];
    return {
      id: raw.id,
      platform: raw.platform || "instagram",
      capturedAt: raw.capturedAt,
      url: raw.url || "",
      username: raw.content?.username || raw.username || "",
      caption: raw.content?.caption || raw.caption || "",
      category: raw.classification?.category || raw.category || "other",
      secondaryCategory: raw.classification?.secondaryCategory || raw.secondaryCategory || "",
      sentiment: raw.classification?.sentiment || raw.sentiment || "",
      classifierSource: raw.classification?.source || raw.classifierSource || "",
      liked: !!(raw.interactions?.liked ?? raw.liked),
      saved: !!(raw.interactions?.saved ?? raw.saved),
      shared: !!(raw.interactions?.shared ?? raw.shared),
      commented: !!(raw.interactions?.commented ?? raw.commented),
      replayed: !!(raw.interactions?.replayed ?? raw.replayed),
      viewCount: raw.viewCount || 1,
      totalDwellMs: raw.totalDwellMs || raw.signals?.dwellTime || 0,
      lastSessionDwellMs: raw.signals?.lastSessionDwell || last?.dwellTime || raw.lastSessionDwellMs || 0,
      scrollVelocityAvg: raw.signals?.scrollVelocityAvg ?? raw.scrollVelocityAvg ?? 0,
      scrollVelocityPeak: raw.signals?.scrollVelocityPeak ?? raw.scrollVelocityPeak ?? 0,
      scrollSpeed: classifyVelocity(raw.signals?.scrollVelocityAvg ?? raw.scrollVelocityAvg ?? 0),
      satisfactionScore: raw.satisfactionScore ?? null,
      analysis: raw.analysis || {},
    };
  }
  return {
    ...raw,
    scrollSpeed: raw.scrollSpeed || classifyVelocity(raw.scrollVelocityAvg ?? 0),
    liked: !!raw.liked,
    saved: !!raw.saved,
    shared: !!raw.shared,
    commented: !!raw.commented,
    replayed: !!raw.replayed,
  };
}

function categoryBreakdown(reels) {
  const out = {};
  for (const r of reels) {
    const cat = r.category || "other";
    out[cat] = out[cat] || { count: 0, liked: 0, saved: 0, scoreSum: 0, scored: 0, dwellMs: 0 };
    const b = out[cat];
    b.count++;
    b.dwellMs += r.totalDwellMs || 0;
    if (r.liked) b.liked++;
    if (r.saved) b.saved++;
    if (r.satisfactionScore != null) {
      b.scoreSum += r.satisfactionScore;
      b.scored++;
    }
  }
  return Object.entries(out)
    .map(([category, b]) => ({
      category,
      count: b.count,
      avgSatisfaction: b.scored ? b.scoreSum / b.scored : null,
      dwellMinutes: Math.round(b.dwellMs / 60000),
      engagementRate: b.count ? Math.round(((b.liked + b.saved) / b.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function hourStats(reels) {
  return Array.from({ length: 24 }, (_, hour) => {
    const hr = reels.filter((r) => new Date(r.capturedAt).getHours() === hour);
    const scores = hr.map((r) => r.satisfactionScore).filter((s) => s != null);
    const brainrot = hr.filter((r) => r.category === "brainrot").length;
    return {
      hour,
      count: hr.length,
      avgSatisfaction: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      brainrotShare: hr.length ? brainrot / hr.length : 0,
    };
  });
}

function creatorStats(reels) {
  const map = {};
  for (const r of reels) {
    if (!r.username) continue;
    map[r.username] = map[r.username] || { username: r.username, count: 0, scoreSum: 0, scored: 0, lastSeen: r.capturedAt };
    const c = map[r.username];
    c.count++;
    if (r.satisfactionScore != null) {
      c.scoreSum += r.satisfactionScore;
      c.scored++;
    }
    if (new Date(r.capturedAt) > new Date(c.lastSeen)) c.lastSeen = r.capturedAt;
  }
  return Object.values(map)
    .map((c) => ({ ...c, avgSatisfaction: c.scored ? c.scoreSum / c.scored : null }))
    .sort((a, b) => (b.avgSatisfaction || 0) - (a.avgSatisfaction || 0));
}

function lastHourReels(reels) {
  const cutoff = Date.now() - 3600000;
  return reels.filter((r) => new Date(r.capturedAt).getTime() >= cutoff);
}

export function computeFocusInsight(reels) {
  const recent = lastHourReels(reels);
  if (!recent.length) {
    return {
      suggestedMinutes: 25,
      difficulty: "unknown",
      message: "No scrolling in the last hour — a standard 25 min focus block is a good start.",
      brainrotMinutes: 0,
      highSatMinutes: 0,
      avgRecentSat: null,
    };
  }

  const brainrotMs = recent.filter((r) => r.category === "brainrot").reduce((s, r) => s + (r.totalDwellMs || 0), 0);
  const highSatMs = recent
    .filter((r) => (r.satisfactionScore ?? 0) >= 0.65)
    .reduce((s, r) => s + (r.totalDwellMs || 0), 0);
  const scores = recent.map((r) => r.satisfactionScore).filter((s) => s != null);
  const avgRecentSat = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
  const brainrotMin = Math.round(brainrotMs / 60000);
  const highSatMin = Math.round(highSatMs / 60000);
  const fastScrolls = recent.filter((r) => r.scrollSpeed === "fast" && !(r.liked || r.saved)).length;
  const compulsionRatio = recent.length ? fastScrolls / recent.length : 0;

  let difficulty = "moderate";
  let suggestedMinutes = 25;
  let message = "";

  if (brainrotMin >= 15 || compulsionRatio > 0.5) {
    difficulty = "hard";
    suggestedMinutes = 15;
    message = `Based on your last hour (${brainrotMin} min brainrot, ${Math.round(compulsionRatio * 100)}% fast-scroll), this might be a harder focus session — try a 15 min block instead of 25.`;
  } else if (highSatMin >= 20 && avgRecentSat >= 0.6) {
    difficulty = "easy";
    suggestedMinutes = 30;
    message = `${highSatMin} min of high-satisfaction content in the last hour — your mental warmup looks good. You could push a 30 min deep work block.`;
  } else if (avgRecentSat >= 0.55) {
    difficulty = "moderate";
    suggestedMinutes = 25;
    message = "Balanced consumption in the last hour. A standard 25 min Pomodoro should work well.";
  } else {
    difficulty = "moderate";
    suggestedMinutes = 20;
    message = "Mixed signals from recent scrolling — consider a 20 min block with a short break after.";
  }

  return { suggestedMinutes, difficulty, message, brainrotMinutes: brainrotMin, highSatMinutes: highSatMin, avgRecentSat, compulsionRatio };
}

export function computeRecommendations(reels, categories) {
  const recs = [];
  const now = Date.now();
  const creators = creatorStats(reels).filter((c) => c.scored >= 2 && (c.avgSatisfaction ?? 0) >= 0.75);

  for (const cat of categories) {
    if (!cat.avgSatisfaction || cat.count < 2) continue;
    const last = reels.find((r) => r.category === cat.category);
    const daysSince = last ? Math.floor((now - new Date(last.capturedAt).getTime()) / 86400000) : 999;
    if (daysSince >= 3 && cat.avgSatisfaction >= 0.6) {
      recs.push({
        type: "category",
        priority: cat.avgSatisfaction * (daysSince / 7),
        text: `You haven't watched much ${cat.category.replace(/-/g, " ")} in ${daysSince} days — it's one of your higher-satisfaction categories (avg ${Math.round(cat.avgSatisfaction * 100)}%).`,
      });
    }
  }

  for (const c of creators.slice(0, 3)) {
    const daysSince = Math.floor((now - new Date(c.lastSeen).getTime()) / 86400000);
    recs.push({
      type: "creator",
      priority: (c.avgSatisfaction ?? 0) * 2,
      text: `@${c.username} consistently scores ${Math.round((c.avgSatisfaction ?? 0) * 100)}% satisfaction for you${daysSince <= 2 ? " — active recently" : ""}.`,
    });
  }

  const evening = reels.filter((r) => {
    const h = new Date(r.capturedAt).getHours();
    return h >= 20;
  });
  const eveningScores = evening.map((r) => r.satisfactionScore).filter((s) => s != null);
  const dayScores = reels
    .filter((r) => {
      const h = new Date(r.capturedAt).getHours();
      return h >= 8 && h < 20;
    })
    .map((r) => r.satisfactionScore)
    .filter((s) => s != null);

  if (eveningScores.length >= 5 && dayScores.length >= 5) {
    const eveAvg = eveningScores.reduce((a, b) => a + b, 0) / eveningScores.length;
    const dayAvg = dayScores.reduce((a, b) => a + b, 0) / dayScores.length;
    if (eveAvg < dayAvg - 0.08) {
      recs.push({
        type: "timing",
        priority: 0.9,
        text: `Your satisfaction tends to drop after 8pm (${Math.round(eveAvg * 100)}% vs ${Math.round(dayAvg * 100)}% daytime) — shorter sessions tonight might feel better.`,
      });
    }
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, 6);
}

export function computeWellnessScore(reels, { moodEntries = [] } = {}) {
  if (!reels.length) return { score: null, breakdown: {}, trend: [] };

  const scores = reels.map((r) => r.satisfactionScore).filter((s) => s != null);
  const avgSat = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;

  const engaged = reels.filter((r) => r.liked || r.saved || r.shared || r.commented).length;
  const engagementRate = engaged / reels.length;

  const fastCompulsive = reels.filter((r) => r.scrollSpeed === "fast" && !(r.liked || r.saved) && (r.totalDwellMs || 0) < 3000).length;
  const compulsionRate = fastCompulsive / reels.length;

  const brainrotShare = reels.filter((r) => r.category === "brainrot").length / reels.length;

  const hourSpread = new Set(reels.map((r) => new Date(r.capturedAt).getHours())).size;
  const intentionalBonus = engagementRate * 0.15 + (1 - compulsionRate) * 0.1;

  let moodBonus = 0;
  if (moodEntries.length) {
    const avgMood = moodEntries.reduce((s, m) => s + (m.value || 3), 0) / moodEntries.length;
    moodBonus = (avgMood - 3) * 0.05;
  }

  const raw =
    avgSat * 45 +
    engagementRate * 25 +
    (1 - compulsionRate) * 15 +
    (1 - Math.min(brainrotShare, 0.5) * 2) * 10 +
    (hourSpread / 24) * 5 +
    intentionalBonus * 10 +
    moodBonus * 10;

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  const breakdown = {
    satisfaction: Math.round(avgSat * 100),
    engagement: Math.round(engagementRate * 100),
    intentionality: Math.round((1 - compulsionRate) * 100),
    contentQuality: Math.round((1 - brainrotShare) * 100),
  };

  const byDay = {};
  for (const r of reels) {
    const day = r.capturedAt?.slice(0, 10);
    if (!day) continue;
    byDay[day] = byDay[day] || [];
    if (r.satisfactionScore != null) byDay[day].push(r.satisfactionScore);
  }
  const trend = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, s]) => ({
      date,
      avgSat: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 100),
    }));

  return { score, breakdown, trend, avgSat, compulsionRate, brainrotShare };
}

export function computeParentingInsights(reels) {
  const categories = categoryBreakdown(reels);
  const negativeSentiment = reels.filter((r) => r.sentiment === "negative").length;
  const lateNight = reels.filter((r) => {
    const h = new Date(r.capturedAt).getHours();
    return h >= 22 || h < 5;
  });
  const lateScores = lateNight.map((r) => r.satisfactionScore).filter((s) => s != null);
  const recentWeek = reels.filter((r) => Date.now() - new Date(r.capturedAt).getTime() < 7 * 86400000);
  const priorWeek = reels.filter((r) => {
    const t = Date.now() - new Date(r.capturedAt).getTime();
    return t >= 7 * 86400000 && t < 14 * 86400000;
  });

  const recentSat = recentWeek.map((r) => r.satisfactionScore).filter((s) => s != null);
  const priorSat = priorWeek.map((r) => r.satisfactionScore).filter((s) => s != null);
  const recentAvg = recentSat.length ? recentSat.reduce((a, b) => a + b, 0) / recentSat.length : null;
  const priorAvg = priorSat.length ? priorSat.reduce((a, b) => a + b, 0) / priorSat.length : null;

  const alerts = [];
  if (recentAvg != null && priorAvg != null && recentAvg < priorAvg - 0.12) {
    alerts.push({
      level: "warning",
      text: "Satisfaction scores dropped noticeably this week compared to last — worth a check-in conversation.",
    });
  }
  if (negativeSentiment / Math.max(reels.length, 1) > 0.25) {
    alerts.push({
      level: "warning",
      text: "Higher share of negative-sentiment content lately — behavioral signal, not specific posts.",
    });
  }
  if (lateNight.length / Math.max(reels.length, 1) > 0.2) {
    alerts.push({
      level: "info",
      text: "More late-night scrolling detected — sleep and mood often correlate with consumption timing.",
    });
  }

  return {
    categoryMix: categories.slice(0, 8).map((c) => ({
      label: c.category.replace(/-/g, " "),
      share: Math.round((c.count / reels.length) * 100),
      avgSat: c.avgSatisfaction != null ? Math.round(c.avgSatisfaction * 100) : null,
    })),
    alerts,
    lateNightShare: Math.round((lateNight.length / Math.max(reels.length, 1)) * 100),
    avgLateSat: lateScores.length ? Math.round((lateScores.reduce((a, b) => a + b, 0) / lateScores.length) * 100) : null,
    privacyNote: "Breakdown only — no specific posts or URLs shown to preserve privacy.",
  };
}

export function analyzeCreatorContent(reels, { title = "Uploaded content" } = {}) {
  if (!reels.length) {
    return {
      title,
      avgDwellSec: 0,
      avgSatisfaction: null,
      dropOffPoint: null,
      sentiment: "neutral",
      sampleSize: 0,
    };
  }

  const dwells = reels.map((r) => r.totalDwellMs || r.lastSessionDwellMs || 0);
  const scores = reels.map((r) => r.satisfactionScore).filter((s) => s != null);
  const sentiments = reels.map((r) => r.sentiment).filter(Boolean);
  const peakVel = reels.reduce((best, r) => ((r.scrollVelocityPeak ?? 0) > (best?.scrollVelocityPeak ?? 0) ? r : best), reels[0]);

  const sentimentCounts = {};
  for (const s of sentiments) sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
  const topSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  return {
    title,
    avgDwellSec: Math.round(dwells.reduce((a, b) => a + b, 0) / dwells.length / 1000),
    avgSatisfaction: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null,
    dropOffPoint: peakVel ? `${Math.round((peakVel.totalDwellMs || 0) / 1000)}s — scroll velocity spiked` : null,
    sentiment: topSentiment,
    sampleSize: reels.length,
    engagementRate: Math.round((reels.filter((r) => r.liked || r.saved).length / reels.length) * 100),
  };
}

export function buildAnalytics(report, { moodEntries = [] } = {}) {
  const rawReels = report?.reels || [];
  const reels = rawReels.map(normalizeReel);
  const categories = categoryBreakdown(reels);
  const hours = hourStats(reels);
  const creators = creatorStats(reels);
  const focus = computeFocusInsight(reels);
  const recommendations = computeRecommendations(reels, categories);
  const wellness = computeWellnessScore(reels, { moodEntries });
  const parenting = computeParentingInsights(reels);

  const totalDwellMin = Math.round(reels.reduce((s, r) => s + (r.totalDwellMs || 0), 0) / 60000);
  const scored = reels.filter((r) => r.satisfactionScore != null);
  const avgSat = scored.length ? scored.reduce((s, r) => s + r.satisfactionScore, 0) / scored.length : null;

  const consumptionSummary = {
    totalReels: reels.length,
    totalDwellMin,
    avgSatisfaction: avgSat,
    topCategory: categories[0]?.category ?? null,
    bestCategory: categories.filter((c) => c.count >= 2).sort((a, b) => (b.avgSatisfaction || 0) - (a.avgSatisfaction || 0))[0]?.category ?? null,
    engagementRate: reels.length ? Math.round((reels.filter((r) => r.liked || r.saved || r.shared || r.commented).length / reels.length) * 100) : 0,
    brainrotShare: reels.length ? Math.round((reels.filter((r) => r.category === "brainrot").length / reels.length) * 100) : 0,
    compulsionRate: Math.round((focus.compulsionRatio || 0) * 100),
  };

  return {
    exportedAt: report?.exportedAt || new Date().toISOString(),
    reels,
    categories,
    hours,
    creators: creators.slice(0, 10),
    focus,
    recommendations,
    wellness,
    parenting,
    consumptionSummary,
  };
}

export function generateDemoReport() {
  const categories = ["educational", "comedy", "fitness", "brainrot", "music-dance", "kindness", "tech", "food"];
  const users = ["fitcoach_j", "techbytes", "daily_laughs", "mindful_m", "chef_ana"];
  const now = Date.now();
  const reels = [];

  for (let i = 0; i < 48; i++) {
    const cat = categories[i % categories.length];
    const isBrainrot = cat === "brainrot";
    const dwell = isBrainrot ? 2000 + Math.random() * 4000 : 5000 + Math.random() * 15000;
    const signals = { dwellTime: dwell, scrollVelocityAvg: isBrainrot ? 10 : 3, scrollVelocityPeak: isBrainrot ? 15 : 5, lastSessionDwell: dwell };
    const interactions = {
      liked: !isBrainrot && Math.random() > 0.6,
      saved: cat === "fitness" && Math.random() > 0.7,
      shared: false,
      commented: false,
      replayed: Math.random() > 0.85,
    };
    const capturedAt = new Date(now - i * 3600000 * (0.5 + Math.random())).toISOString();
    reels.push(
      normalizeReel({
        id: `demo-${i}`,
        platform: "instagram",
        capturedAt,
        url: `https://instagram.com/reel/demo${i}`,
        content: { username: users[i % users.length], caption: `Demo reel ${i} — ${cat}` },
        classification: { category: cat, sentiment: isBrainrot ? "neutral" : "positive", source: "demo" },
        signals,
        interactions,
        viewCount: 1,
        totalDwellMs: dwell,
        satisfactionScore: computeSatisfaction(signals, interactions, { sessionDwellMs: dwell }),
      })
    );
  }

  return {
    exportedAt: new Date().toISOString(),
    periodDays: 7,
    totalReels: reels.length,
    summary: {},
    reels,
    _demo: true,
  };
}
