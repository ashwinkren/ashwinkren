#!/usr/bin/env python3
"""Scrape Basketball-Reference season stat tables into a 5-year workbook.

Source: https://www.basketball-reference.com/leagues/NBA_{year}_{stat}.html
Left-side filters scraped for each season: Totals, Per Game, Per 36, Per 100 Poss,
Advanced, Play-by-Play, Shooting, Adjusted Shooting (regular season + playoffs).

Each sheet is one NBA season. Each row is one player (season-total line for
traded players). Top 100 at each of PG/SG/SF/PF/C by regular-season minutes.
"""

from __future__ import annotations

import re
import time
from io import StringIO
from typing import Iterable

import pandas as pd
import requests
from bs4 import BeautifulSoup, Comment
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.workbook import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo

BASE = "https://www.basketball-reference.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.basketball-reference.com/",
}

# Ending calendar year of the NBA season. 2026 = 2025-26.
SEASONS = [2022, 2023, 2024, 2025, 2026]
SEASON_LABEL = {y: f"{y-1}-{str(y)[2:]}" for y in SEASONS}

PAGES = [
    ("totals", "totals"),
    ("per_game", "per_game"),
    ("per_minute", "per_36"),
    ("per_poss", "per_100"),
    ("advanced", "advanced"),
    ("play-by-play", "pbp"),
    ("shooting", "shooting"),
    ("adj_shooting", "adj_shooting"),
]

IDENTITY_KEEP = [
    "player_id",
    "player",
    "player_url",
    "season",
    "season_end_year",
    "age",
    "team",
    "listed_pos",
    "primary_position",
    "position_minutes_rank",
    "qualified_positions",
]

MULTI_TEAM_RE = re.compile(r"^\d+TM$")
PLAYER_HREF_RE = re.compile(r"/players/[a-z]/([a-z0-9]+)\.html", re.I)
POS_ORDER = ["PG", "SG", "SF", "PF", "C"]


def fetch(url: str, retries: int = 6) -> str:
    delay = 3.5
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60)
            if resp.status_code == 429:
                wait = 20 + attempt * 10
                print(f"  429 {url} — sleeping {wait}s")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return resp.text
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            wait = delay * (attempt + 1)
            print(f"  retry {attempt + 1}/{retries} {url}: {exc} (sleep {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}: {last_err}")


def iter_tables(html: str) -> Iterable[tuple[str | None, BeautifulSoup]]:
    soup = BeautifulSoup(html, "lxml")
    for table in soup.select("table"):
        yield table.get("id"), table
    for comment in soup.find_all(string=lambda x: isinstance(x, Comment)):
        if "<table" not in comment:
            continue
        chunk = BeautifulSoup(comment, "lxml")
        for table in chunk.select("table"):
            yield table.get("id"), table


def flatten_columns(columns) -> list[str]:
    out: list[str] = []
    if getattr(columns, "nlevels", 1) == 1:
        return [str(c).strip() for c in columns]
    for col in columns:
        parts = []
        for part in col:
            text = str(part).strip()
            if not text or text.startswith("Unnamed"):
                continue
            parts.append(text)
        # drop duplicated last parts
        cleaned: list[str] = []
        for part in parts:
            if not cleaned or cleaned[-1] != part:
                cleaned.append(part)
        name = "_".join(cleaned) if cleaned else "col"
        out.append(name)
    return out


def slug(name: str) -> str:
    name = name.replace("%", "pct").replace("+", "plus").replace("/", "_")
    name = name.replace(" ", "_").replace("-", "_")
    name = re.sub(r"[^A-Za-z0-9_]+", "", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name.lower() or "col"


def parse_stat_table(table, prefix: str) -> pd.DataFrame:
    html = str(table)
    df = pd.read_html(StringIO(html), flavor="lxml")[0]
    df.columns = flatten_columns(df.columns)

    # Player IDs from anchors, aligned to pandas rows (header rows included).
    soup = BeautifulSoup(html, "lxml")
    body_rows = soup.select("tbody tr")
    player_ids: list[str | None] = []
    player_urls: list[str | None] = []
    for tr in body_rows:
        classes = set(tr.get("class") or [])
        if classes & {"thead", "over_header"}:
            player_ids.append(None)
            player_urls.append(None)
            continue
        cell = tr.select_one("[data-append-csv]")
        anchor = tr.select_one('[data-stat="name_display"] a, [data-stat="player"] a, td a[href*="/players/"]')
        pid = cell.get("data-append-csv") if cell else None
        href = anchor.get("href") if anchor else None
        if not pid and href:
            match = PLAYER_HREF_RE.search(href)
            pid = match.group(1) if match else None
        player_ids.append(pid)
        player_urls.append((BASE + href) if href else None)

    # pandas read_html of a table uses thead + tbody. Filter later.
    # Align IDs to tbody-only frame if pandas included only tbody data rows.
    # read_html typically returns header from thead and data from tbody including
    # repeated header rows.
    if len(player_ids) == len(df):
        df.insert(0, "player_id", player_ids)
        df.insert(1, "player_url", player_urls)
    elif len(player_ids) < len(df):
        # extra header row from thead counted in df
        pad = [None] * (len(df) - len(player_ids))
        df.insert(0, "player_id", pad + player_ids)
        df.insert(1, "player_url", pad + player_urls)
    else:
        df.insert(0, "player_id", player_ids[: len(df)])
        df.insert(1, "player_url", player_urls[: len(df)])

    # Drop repeated header rows and blank rows.
    player_col = next((c for c in df.columns if c.lower() in {"player", "player_name"}), None)
    if player_col:
        df = df[df[player_col].notna()]
        df = df[df[player_col].astype(str).str.lower() != "player"]
        df = df[df[player_col].astype(str).str.lower() != "player_name"]

    df = df[df["player_id"].notna()].copy()

    rename = {}
    for col in df.columns:
        if col in {"player_id", "player_url"}:
            continue
        key = slug(col)
        if key in {"rk", "rank"}:
            rename[col] = f"{prefix}_rk"
        elif key == "player":
            rename[col] = "player"
        elif key == "age":
            rename[col] = "age"
        elif key in {"team", "tm"}:
            rename[col] = "team"
        elif key == "pos":
            rename[col] = "listed_pos"
        elif key in {"g", "gs", "mp"} and prefix in {
            "totals",
            "playoffs_totals",
            "per_game",
            "playoffs_per_game",
        }:
            # keep raw identity-ish counting stats only from totals later;
            # still prefix per-game minutes etc.
            if prefix.startswith("playoffs_"):
                rename[col] = f"{prefix}_{key}"
            elif prefix == "totals":
                rename[col] = key
            else:
                rename[col] = f"{prefix}_{key}"
        else:
            rename[col] = f"{prefix}_{key}"
    df = df.rename(columns=rename)

    # Drop leftover rank-like unnamed columns
    drop = [c for c in df.columns if c.endswith("_unnamed") or c.endswith("_col")]
    df = df.drop(columns=drop, errors="ignore")
    return df


def collapse_traded(df: pd.DataFrame) -> pd.DataFrame:
    """Prefer the combined TOT / 2TM / 3TM row for traded players."""
    if df.empty or "player_id" not in df.columns:
        return df
    if "team" not in df.columns:
        return df.drop_duplicates("player_id")

    rows = []
    for _, group in df.groupby("player_id", dropna=False, sort=False):
        teams = group["team"].astype(str).str.upper()
        multi = group[teams.eq("TOT") | teams.str.match(MULTI_TEAM_RE)]
        if not multi.empty:
            rows.append(multi.iloc[[0]])
            continue
        if "mp" in group.columns:
            mp = pd.to_numeric(group["mp"], errors="coerce")
            rows.append(group.loc[[mp.idxmax()]])
        else:
            rows.append(group.iloc[[0]])
    return pd.concat(rows, ignore_index=True)


def primary_pos_from_row(row: pd.Series) -> str:
    pct_map = {
        "PG": "pbp_position_estimate_pgpct",
        "SG": "pbp_position_estimate_sgpct",
        "SF": "pbp_position_estimate_sfpct",
        "PF": "pbp_position_estimate_pfpct",
        "C": "pbp_position_estimate_cpct",
    }
    best_pos = None
    best_val = -1.0
    for pos, col in pct_map.items():
        if col in row.index:
            val = pd.to_numeric(pd.Series([row[col]]), errors="coerce").iloc[0]
            if pd.notna(val) and val > best_val:
                best_val = val
                best_pos = pos
    if best_pos:
        return best_pos
    listed = str(row.get("listed_pos") or "")
    token = re.split(r"[-/, ]+", listed.upper())[0]
    aliases = {"G": "SG", "F": "SF", "GUARD": "SG", "FORWARD": "SF", "CENTER": "C"}
    token = aliases.get(token, token)
    return token if token in POS_ORDER else "SF"


def numericize(df: pd.DataFrame) -> pd.DataFrame:
    skip = {
        "player_id",
        "player",
        "player_url",
        "season",
        "team",
        "listed_pos",
        "primary_position",
        "qualified_positions",
    }
    for col in df.columns:
        if col in skip:
            continue
        coerced = pd.to_numeric(df[col], errors="coerce")
        if coerced.notna().mean() >= 0.5:
            df[col] = coerced
    return df


def scrape_season(year: int) -> pd.DataFrame:
    label = SEASON_LABEL[year]
    print(f"\n=== Season {label} ===")
    merged: pd.DataFrame | None = None

    for slug_path, prefix in PAGES:
        url = f"{BASE}/leagues/NBA_{year}_{slug_path}.html"
        print(f"  fetching {url}")
        html = fetch(url)
        tables = list(iter_tables(html))
        rs_table = None
        po_table = None
        for tid, table in tables:
            tid = tid or ""
            if tid.endswith("_post") or "_post" in tid:
                po_table = table
            elif "stats" in tid or tid in {
                "per_poss",
                "advanced",
                "shooting",
                "adj_shooting",
                "pbp_stats",
                "totals_stats",
                "per_game_stats",
                "per_minute_stats",
            }:
                # regular season table (not awards, not conference)
                if "playoff" in tid:
                    po_table = table
                else:
                    rs_table = table
        if rs_table is None:
            # fallback: first non-post table
            for tid, table in tables:
                if tid and not str(tid).endswith("_post"):
                    rs_table = table
                    break
        if rs_table is None:
            raise RuntimeError(f"No regular-season table on {url}")

        rs = collapse_traded(parse_stat_table(rs_table, prefix))
        if po_table is not None:
            po = collapse_traded(parse_stat_table(po_table, f"playoffs_{prefix}"))
            rs = rs.merge(po, on="player_id", how="left", suffixes=("", "_duppo"))
            drop_dups = [c for c in rs.columns if c.endswith("_duppo")]
            rs = rs.drop(columns=drop_dups)

        if merged is None:
            merged = rs
        else:
            keep_id = ["player_id"]
            extra = [c for c in rs.columns if c not in merged.columns or c in keep_id]
            # always merge new prefixed stats; skip overlapping identity
            overlap_identity = {
                "player",
                "player_url",
                "age",
                "team",
                "listed_pos",
                "g",
                "gs",
                "mp",
            }
            cols = ["player_id"] + [
                c for c in rs.columns if c not in overlap_identity and c != "player_id"
            ]
            merged = merged.merge(rs[cols].drop_duplicates("player_id"), on="player_id", how="outer")
        time.sleep(3.2)

    assert merged is not None
    merged = collapse_traded(merged)

    merged["season"] = label
    merged["season_end_year"] = year
    merged["primary_position"] = merged.apply(primary_pos_from_row, axis=1)
    merged["mp"] = pd.to_numeric(merged.get("mp"), errors="coerce")
    merged["g"] = pd.to_numeric(merged.get("g"), errors="coerce")

    # Rank within primary position by minutes; also record any listed-pos qualification.
    merged["position_minutes_rank"] = (
        merged.groupby("primary_position")["mp"].rank(method="min", ascending=False)
    )
    merged["qualified_positions"] = merged["primary_position"]

    keep_parts = []
    for pos in POS_ORDER:
        part = (
            merged[merged["primary_position"] == pos]
            .sort_values(["mp", "player"], ascending=[False, True])
            .head(100)
        )
        keep_parts.append(part)
        print(f"  {pos}: kept {len(part)} / {int((merged['primary_position']==pos).sum())} players")
    out = pd.concat(keep_parts, ignore_index=True)

    # Stable column order: identity first, then remaining stats alphabetically by prefix group
    identity = [c for c in IDENTITY_KEEP if c in out.columns]
    rest = [c for c in out.columns if c not in identity]
    # group rest by prefix
    prefix_order = [
        "g",
        "gs",
        "mp",
        "totals_",
        "per_game_",
        "per_36_",
        "per_100_",
        "advanced_",
        "pbp_",
        "shooting_",
        "adj_shooting_",
        "playoffs_",
    ]

    def rest_key(name: str) -> tuple:
        for i, p in enumerate(prefix_order):
            if name == p.rstrip("_") or name.startswith(p):
                return (i, name)
        return (len(prefix_order), name)

    rest_sorted = sorted(rest, key=rest_key)
    out = out[identity + rest_sorted]
    out = numericize(out)
    out = out.sort_values(["primary_position", "position_minutes_rank", "player"]).reset_index(
        drop=True
    )
    print(f"  sheet rows={len(out)} cols={len(out.columns)}")
    return out


def autosize(ws) -> None:
    for col_cells in ws.columns:
        letter = get_column_letter(col_cells[0].column)
        longest = 0
        for cell in col_cells[:80]:
            val = "" if cell.value is None else str(cell.value)
            longest = max(longest, min(len(val), 42))
        ws.column_dimensions[letter].width = max(10, longest + 2)


def style_sheet(ws, n_rows: int, n_cols: int) -> None:
    header_fill = PatternFill("solid", fgColor="1D428A")
    header_font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    thin = Border(
        left=Side(style="thin", color="D0D7DE"),
        right=Side(style="thin", color="D0D7DE"),
        top=Side(style="thin", color="D0D7DE"),
        bottom=Side(style="thin", color="D0D7DE"),
    )
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    alt = PatternFill("solid", fgColor="F4F7FB")
    for r in range(2, n_rows + 2):
        if r % 2 == 0:
            for c in range(1, n_cols + 1):
                ws.cell(r, c).fill = alt
        for c in range(1, n_cols + 1):
            ws.cell(r, c).border = thin
            ws.cell(r, c).alignment = Alignment(vertical="center")
    ws.auto_filter.ref = f"A1:{get_column_letter(n_cols)}{n_rows + 1}"
    # Table for nicer Excel UX (Excel table names cannot start with a number)
    safe = "S" + ws.title.replace("-", "_")
    table = Table(displayName=f"T_{safe}", ref=f"A1:{get_column_letter(n_cols)}{n_rows + 1}")
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showRowStripes=True, showColumnStripes=False
    )
    try:
        ws.add_table(table)
    except Exception:
        pass
    autosize(ws)


def add_readme(wb: Workbook, frames: dict[str, pd.DataFrame]) -> None:
    ws = wb.create_sheet("README", 0)
    lines = [
        ["NBA player statistics — last five seasons"],
        [],
        ["Source", "Basketball-Reference (the left-side stat filters on each season page)"],
        ["Site", "https://www.basketball-reference.com/leagues/"],
        ["Season type", "Regular season columns unprefixed; playoff columns start with playoffs_"],
        ["Row grain", "One row per player per season (combined TOT/2TM line if traded)"],
        ["Who is included", "Top 100 players at each position (PG, SG, SF, PF, C) by regular-season minutes"],
        ["Position", "Primary position from play-by-play position estimates (fallback: listed Pos)"],
        [],
        ["Sheets"],
    ]
    for label, df in frames.items():
        lines.append([label, f"{len(df)} players", f"{len(df.columns)} columns"])
    lines += [
        [],
        ["Column groups"],
        ["identity", "player, ids, age, team, positions, ranks"],
        ["g / gs / mp", "regular-season games, starts, total minutes"],
        ["totals_*", "raw counting stats"],
        ["per_game_*", "per-game rates"],
        ["per_36_*", "per-36-minute rates"],
        ["per_100_*", "per-100-possession rates (plus ORtg/DRtg)"],
        ["advanced_*", "PER, TS%, USG%, WS, BPM, VORP, etc."],
        ["pbp_*", "on/off, bad pass TOV, shooting fouls, position estimates, +/-"],
        ["shooting_*", "shot distance mix, dunks, corner 3s, heaves"],
        ["adj_shooting_*", "league-adjusted shooting and rates"],
        ["playoffs_*", "the same families for the playoffs"],
        [],
        ["Built for", "Ashwin — one wide table of every Basketball-Reference player stat"],
    ]
    for r, row in enumerate(lines, 1):
        for c, val in enumerate(row, 1):
            ws.cell(r, c, val)
            if r == 1:
                ws.cell(r, c).font = Font(bold=True, size=16, color="1D428A")
            elif c == 1:
                ws.cell(r, c).font = Font(bold=True)
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 88
    ws.column_dimensions["C"].width = 22


def main() -> None:
    frames: dict[str, pd.DataFrame] = {}
    for year in SEASONS:
        frames[SEASON_LABEL[year]] = scrape_season(year)

    wb = Workbook()
    default = wb.active
    wb.remove(default)
    add_readme(wb, frames)
    for label, df in frames.items():
        ws = wb.create_sheet(label)
        for r_idx, row in enumerate(dataframe_to_rows(df, index=False, header=True), 1):
            for c_idx, value in enumerate(row, 1):
                if isinstance(value, float) and pd.isna(value):
                    value = None
                ws.cell(r_idx, c_idx, value)
        style_sheet(ws, len(df), len(df.columns))
        csv_path = f"/workspace/data/nba_player_stats_{label.replace('-', '_')}.csv"
        df.to_csv(csv_path, index=False)
        print("wrote", csv_path)

    xlsx_path = "/workspace/data/nba_player_stats_last_five_years.xlsx"
    wb.save(xlsx_path)
    print("wrote", xlsx_path)


if __name__ == "__main__":
    main()
