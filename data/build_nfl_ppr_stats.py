#!/usr/bin/env python3
"""Build a five-season NFL PPR workbook (QB / RB / WR / TE, top 100 each).

Primary stats come from nflverse player season summaries (includes
fantasy_points_ppr). Extra families: weekly PPR consistency, snap counts,
PFR advanced receiving/rushing/passing, ESPN QBR, and player bio/draft.
"""

from __future__ import annotations

import io
import time
from pathlib import Path

import pandas as pd
import requests
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.workbook import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo

DATA = Path(__file__).resolve().parent
CACHE = Path("/tmp/nflverse-cache")
CACHE.mkdir(parents=True, exist_ok=True)

SEASONS = [2021, 2022, 2023, 2024, 2025]
PPR_POSITIONS = ["QB", "RB", "WR", "TE"]
POS_MAP = {"FB": "RB", "HB": "RB", "TB": "RB", "WB": "WR", "FL": "WR"}
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; nfl-ppr-workbook/1.0)"}
NAVY = "013369"
GOLD = "D50A0A"


def fetch(url: str) -> bytes:
    dest = CACHE / url.split("/")[-1]
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.read_bytes()
    last = None
    for attempt in range(6):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=90)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
            return resp.content
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"download failed {url}: {last}")


def read_parquet(url: str) -> pd.DataFrame:
    return pd.read_parquet(io.BytesIO(fetch(url)))


def prefix_cols(df: pd.DataFrame, prefix: str, keep: set[str]) -> pd.DataFrame:
    out = df.copy()
    out.columns = [c if c in keep else f"{prefix}{c}" for c in out.columns]
    return out


def season_snaps(year: int) -> pd.DataFrame:
    df = read_parquet(f"{BASE}/snap_counts/snap_counts_{year}.parquet")
    df = df[df["game_type"].astype(str).str.upper().eq("REG")].copy()
    g = df.groupby("pfr_player_id", as_index=False).agg(
        snap_games=("week", "nunique"),
        offense_snaps=("offense_snaps", "sum"),
        defense_snaps=("defense_snaps", "sum"),
        st_snaps=("st_snaps", "sum"),
        offense_snap_pct=("offense_pct", "mean"),
        defense_snap_pct=("defense_pct", "mean"),
        st_snap_pct=("st_pct", "mean"),
    )
    return g


def weekly_ppr(year: int) -> pd.DataFrame:
    df = read_parquet(f"{BASE}/stats_player/stats_player_week_{year}.parquet")
    df = df[df["season_type"].astype(str).str.upper().eq("REG")].copy()
    ppr = pd.to_numeric(df["fantasy_points_ppr"], errors="coerce").fillna(0)
    df = df.assign(_ppr=ppr)
    g = df.groupby("player_id", as_index=False).agg(
        weekly_games=("week", "nunique"),
        ppr_avg=("_ppr", "mean"),
        ppr_std=("_ppr", "std"),
        ppr_median=("_ppr", "median"),
        ppr_best_week=("_ppr", "max"),
        ppr_worst_week=("_ppr", "min"),
        weeks_10plus_ppr=("_ppr", lambda s: int((s >= 10).sum())),
        weeks_15plus_ppr=("_ppr", lambda s: int((s >= 15).sum())),
        weeks_20plus_ppr=("_ppr", lambda s: int((s >= 20).sum())),
        weeks_25plus_ppr=("_ppr", lambda s: int((s >= 25).sum())),
    )
    return g


def pfr_year(df: pd.DataFrame, year: int) -> pd.DataFrame:
    if "season" not in df.columns:
        return df
    return df[df["season"] == year].copy()


def load_players() -> pd.DataFrame:
    p = read_parquet(f"{BASE}/players/players.parquet")
    keep = [
        "gsis_id",
        "pfr_id",
        "espn_id",
        "display_name",
        "birth_date",
        "height",
        "weight",
        "college_name",
        "draft_year",
        "draft_round",
        "draft_pick",
        "draft_team",
        "rookie_season",
        "years_of_experience",
    ]
    return p[[c for c in keep if c in p.columns]].drop_duplicates("gsis_id")


def build_season(year: int, players: pd.DataFrame, pfr_rec, pfr_rush, pfr_pass, qbr) -> pd.DataFrame:
    print(f"  season {year}")
    stats = read_parquet(f"{BASE}/stats_player/stats_player_reg_{year}.parquet")
    stats["ppr_position"] = stats["position"].replace(POS_MAP)
    stats = stats[stats["ppr_position"].isin(PPR_POSITIONS)].copy()
    stats["fantasy_points_ppr"] = pd.to_numeric(stats["fantasy_points_ppr"], errors="coerce")
    stats["games"] = pd.to_numeric(stats["games"], errors="coerce")
    stats["ppr_per_game"] = stats["fantasy_points_ppr"] / stats["games"].replace(0, pd.NA)
    stats["standard_to_ppr_gap"] = stats["fantasy_points_ppr"] - pd.to_numeric(
        stats["fantasy_points"], errors="coerce"
    )

    playoff = read_parquet(f"{BASE}/stats_player/stats_player_post_{year}.parquet")
    playoff = playoff.rename(columns={c: f"playoff_{c}" for c in playoff.columns if c != "player_id"})
    playoff = playoff.drop_duplicates("player_id")
    stats = stats.merge(playoff, on="player_id", how="left")

    snaps = season_snaps(year)
    stats = stats.merge(players, left_on="player_id", right_on="gsis_id", how="left")
    stats = stats.merge(snaps, left_on="pfr_id", right_on="pfr_player_id", how="left")
    stats["ppr_per_offense_snap"] = stats["fantasy_points_ppr"] / pd.to_numeric(
        stats["offense_snaps"], errors="coerce"
    ).replace(0, pd.NA)

    rec = prefix_cols(pfr_year(pfr_rec, year), "pfr_rec_", {"pfr_id"})
    rush = prefix_cols(pfr_year(pfr_rush, year), "pfr_rush_", {"pfr_id"})
    pas = prefix_cols(pfr_year(pfr_pass, year), "pfr_pass_", {"pfr_id"})
    for extra, key in ((rec, "pfr_id"), (rush, "pfr_id"), (pas, "pfr_id")):
        extra = extra.drop_duplicates(key)
        extra = extra.loc[:, ~extra.columns.duplicated()]
        stats = stats.merge(extra, on=key, how="left")

    q = qbr[(qbr["season"] == year) & (qbr["season_type"].astype(str).eq("Regular"))].copy()
    q = prefix_cols(q, "qbr_", {"player_id"})
    q = q.rename(columns={"player_id": "espn_id_join"})
    q["espn_id_join"] = pd.to_numeric(q["espn_id_join"], errors="coerce")
    stats["espn_id"] = pd.to_numeric(stats["espn_id"], errors="coerce")
    q = q.drop_duplicates("espn_id_join")
    stats = stats.merge(q, left_on="espn_id", right_on="espn_id_join", how="left")

    cons = weekly_ppr(year)
    stats = stats.merge(cons, on="player_id", how="left")

    stats["position_ppr_rank"] = stats.groupby("ppr_position")["fantasy_points_ppr"].rank(
        method="min", ascending=False
    )
    parts = []
    for pos in PPR_POSITIONS:
        chunk = (
            stats[stats["ppr_position"] == pos]
            .sort_values(["fantasy_points_ppr", "player_display_name"], ascending=[False, True])
            .head(100)
        )
        print(f"    {pos}: {len(chunk)}")
        parts.append(chunk)
    out = pd.concat(parts, ignore_index=True)

    drop = [c for c in out.columns if c.endswith("_x") or c.endswith("_y") or c in {"espn_id_join", "pfr_player_id"}]
    out = out.drop(columns=drop, errors="ignore")
    out = out.loc[:, ~out.columns.duplicated()]

    front = [
        c
        for c in [
            "season",
            "player_display_name",
            "player_name",
            "player_id",
            "recent_team",
            "ppr_position",
            "position",
            "position_ppr_rank",
            "games",
            "fantasy_points_ppr",
            "ppr_per_game",
            "fantasy_points",
            "standard_to_ppr_gap",
            "receptions",
            "targets",
            "receiving_yards",
            "receiving_tds",
            "target_share",
            "air_yards_share",
            "wopr",
            "carries",
            "rushing_yards",
            "rushing_tds",
            "completions",
            "attempts",
            "passing_yards",
            "passing_tds",
            "passing_interceptions",
            "offense_snaps",
            "offense_snap_pct",
            "ppr_per_offense_snap",
            "ppr_avg",
            "ppr_std",
            "ppr_best_week",
            "weeks_20plus_ppr",
        ]
        if c in out.columns
    ]
    rest = [c for c in out.columns if c not in front]
    out = out[front + rest]
    return out


def write_df(ws, df: pd.DataFrame, table_name: str) -> None:
    for r_idx, row in enumerate(dataframe_to_rows(df, index=False, header=True), 1):
        for c_idx, value in enumerate(row, 1):
            if isinstance(value, float) and pd.isna(value):
                value = None
            ws.cell(r_idx, c_idx, value)
    n_rows, n_cols = len(df), len(df.columns)
    header_fill = PatternFill("solid", fgColor=NAVY)
    header_font = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
    thin = Border(
        left=Side(style="thin", color="D0D7DE"),
        right=Side(style="thin", color="D0D7DE"),
        top=Side(style="thin", color="D0D7DE"),
        bottom=Side(style="thin", color="D0D7DE"),
    )
    alt = PatternFill("solid", fgColor="F4F7FB")
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"
    for r in range(2, min(n_rows + 2, 8)):
        for c in range(1, n_cols + 1):
            ws.cell(r, c).border = thin
    # stripe only first 200 rows of styling for speed; autofilter covers all
    for r in range(2, n_rows + 2):
        if r % 2 == 0:
            for c in range(1, min(n_cols + 1, 40)):
                ws.cell(r, c).fill = alt
    ref = f"A1:{get_column_letter(n_cols)}{n_rows + 1}"
    ws.auto_filter.ref = ref
    table = Table(displayName=table_name, ref=ref)
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showRowStripes=True, showColumnStripes=False
    )
    try:
        ws.add_table(table)
    except Exception:
        pass
    for i, col in enumerate(df.columns, 1):
        ws.column_dimensions[get_column_letter(i)].width = max(10, min(len(str(col)) + 2, 28))


def add_readme(wb: Workbook, frames: dict[int, pd.DataFrame]) -> None:
    ws = wb.create_sheet("README", 0)
    lines = [
        ["NFL PPR player statistics — last five complete seasons"],
        [],
        ["Scoring", "PPR (1 point per reception). fantasy_points_ppr is the ranking stat."],
        ["Positions", "QB, RB, WR, TE — top 100 at each position by PPR (fewer than 100 QBs some years)"],
        ["Years", "2021–2025 regular season. 2026 is underway and omitted as incomplete."],
        ["Source", "nflverse (same underlying data as Pro Football Reference / nflfastR)"],
        [],
        ["How to analyze in Google Sheets"],
        ["Pivot", "All_seasons → Insert → Pivot table. Rows: player_display_name. Columns: season. Values: fantasy_points_ppr."],
        ["Filter", "On a year tab filter ppr_position = WR, sort fantasy_points_ppr."],
        ["Volume vs efficiency", "Chart target_share vs ppr_per_game, or offense_snap_pct vs receptions."],
        ["Consistency", "ppr_std, weeks_20plus_ppr, ppr_best_week — boom/bust"],
        [],
        ["Column groups"],
        ["fantasy_points_ppr / ppr_per_game", "Season PPR and per-game PPR"],
        ["standard_to_ppr_gap", "Receptions (the PPR bump vs standard)"],
        ["passing / rushing / receiving", "Box + EPA, CPOE, air yards, WOPR, RACR"],
        ["snap_*", "Regular-season snap counts and percentages"],
        ["weekly / ppr_avg / weeks_Nplus", "Week-to-week PPR consistency"],
        ["pfr_rec_ / pfr_rush_ / pfr_pass_", "PFR advanced: YAC, ADOT, drops, pressure, bad throws"],
        ["qbr_*", "ESPN total QBR (quarterbacks)"],
        ["playoff_*", "Postseason counting stats and PPR"],
        ["bio / draft_*", "Height, weight, college, draft capital"],
    ]
    for year, df in frames.items():
        lines.append([str(year), f"{len(df)} players", f"{len(df.columns)} columns"])
    for r, row in enumerate(lines, 1):
        for c, val in enumerate(row, 1):
            ws.cell(r, c, val)
            if r == 1:
                ws.cell(r, c).font = Font(bold=True, size=16, color=NAVY)
            elif c == 1:
                ws.cell(r, c).font = Font(bold=True)
    ws.column_dimensions["A"].width = 32
    ws.column_dimensions["B"].width = 100


def add_dashboard(wb: Workbook, combined: pd.DataFrame) -> None:
    ws = wb.create_sheet("Dashboard", 1)
    ws.cell(1, 1, "NFL PPR — last five seasons").font = Font(bold=True, size=18, color=NAVY)
    ws.merge_cells("A1:H1")
    ws.cell(2, 1, "Year tabs have every stat. All_seasons is the pivot grain. Charts use PPR scoring champions.").font = Font(
        italic=True, color="555555"
    )

    leaders = (
        combined.sort_values("fantasy_points_ppr", ascending=False)
        .groupby(["season", "ppr_position"], sort=False)
        .head(5)[
            [
                "season",
                "ppr_position",
                "position_ppr_rank",
                "player_display_name",
                "recent_team",
                "fantasy_points_ppr",
                "ppr_per_game",
                "receptions",
                "targets",
                "ppr_best_week",
            ]
        ]
        .reset_index(drop=True)
    )
    pos_avg = (
        combined.groupby(["season", "ppr_position"], as_index=False)
        .agg(
            players=("player_id", "count"),
            ppr=("fantasy_points_ppr", "mean"),
            ppr_per_game=("ppr_per_game", "mean"),
            rec=("receptions", "mean"),
            tgt=("targets", "mean"),
            snaps=("offense_snaps", "mean"),
        )
        .round(2)
    )
    champs = (
        combined.sort_values("fantasy_points_ppr", ascending=False)
        .groupby("season", sort=False)
        .first()
        .reset_index()[["season", "player_display_name", "ppr_position", "fantasy_points_ppr", "receptions"]]
    )

    ws.cell(4, 1, "Top 5 PPR at each position").font = Font(bold=True, size=13, color=GOLD)
    start = 5
    for r_idx, row in enumerate(dataframe_to_rows(leaders, index=False, header=True), start):
        for c_idx, value in enumerate(row, 1):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == start:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    avg_start = start + len(leaders) + 3
    ws.cell(avg_start - 1, 1, "Position averages (top-100 pools)").font = Font(
        bold=True, size=13, color=GOLD
    )
    for r_idx, row in enumerate(dataframe_to_rows(pos_avg, index=False, header=True), avg_start):
        for c_idx, value in enumerate(row, 1):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == avg_start:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    ws.cell(4, 12, "Overall PPR scoring champion").font = Font(bold=True, color=NAVY)
    for r_idx, row in enumerate(dataframe_to_rows(champs, index=False, header=True), 5):
        for c_idx, value in enumerate(row, 12):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == 5:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    bar = BarChart()
    bar.type = "col"
    bar.title = "PPR scoring champion by season"
    bar.y_axis.title = "PPR points"
    data = Reference(ws, min_col=15, min_row=5, max_row=10)
    cats = Reference(ws, min_col=12, min_row=6, max_row=10)
    bar.add_data(data, titles_from_data=True)
    bar.set_categories(cats)
    bar.legend = None
    bar.dataLabels = DataLabelList()
    bar.dataLabels.showVal = True
    bar.width = 14
    bar.height = 8
    ws.add_chart(bar, "R4")

    for letter, width in zip("ABCDEFGHIJ", [10, 12, 12, 26, 12, 16, 14, 12, 12, 14]):
        ws.column_dimensions[letter].width = width
    ws.column_dimensions["L"].width = 12
    ws.column_dimensions["M"].width = 24


def main() -> None:
    print("loading shared tables")
    players = load_players()
    pfr_rec = read_parquet(f"{BASE}/pfr_advstats/advstats_season_rec.parquet")
    pfr_rush = read_parquet(f"{BASE}/pfr_advstats/advstats_season_rush.parquet")
    pfr_pass = read_parquet(f"{BASE}/pfr_advstats/advstats_season_pass.parquet")
    qbr = read_parquet(f"{BASE}/espn_data/qbr_season_level.parquet")

    frames: dict[int, pd.DataFrame] = {}
    for year in SEASONS:
        frames[year] = build_season(year, players, pfr_rec, pfr_rush, pfr_pass, qbr)
        csv_path = DATA / f"nfl_ppr_{year}.csv"
        frames[year].to_csv(csv_path, index=False)
        print("  wrote", csv_path, frames[year].shape)

    combined = pd.concat(frames.values(), ignore_index=True)
    wb = Workbook()
    wb.remove(wb.active)
    add_readme(wb, frames)
    add_dashboard(wb, combined)
    ws_all = wb.create_sheet("All_seasons")
    write_df(ws_all, combined, "T_All_seasons")
    for year, df in frames.items():
        ws = wb.create_sheet(str(year))
        write_df(ws, df, f"T_{year}")

    xlsx = DATA / "nfl_ppr_last_five_years.xlsx"
    wb.save(xlsx)
    print("wrote", xlsx, "sheets", wb.sheetnames, "rows", len(combined), "cols", combined.shape[1])


if __name__ == "__main__":
    main()
