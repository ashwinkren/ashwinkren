#!/usr/bin/env python3
"""Rebuild the NBA stats workbook from CSVs with analysis-friendly tabs.

Year tabs stay the grain the user asked for. Extra tabs make Google Sheets
Explore / Pivot Tables / charts immediately useful.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from openpyxl.chart import BarChart, Reference, ScatterChart, Series
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.workbook import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo

DATA = Path(__file__).resolve().parent
SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
NAVY = "1D428A"
RED = "C8102E"

CORE = [
    "season",
    "player",
    "team",
    "primary_position",
    "age",
    "g",
    "gs",
    "mp",
    "totals_pts",
    "totals_trb",
    "totals_ast",
    "totals_stl",
    "totals_blk",
    "totals_tov",
    "totals_fgpct",
    "totals_3ppct",
    "totals_ftpct",
    "per_game_pts",
    "per_game_trb",
    "per_game_ast",
    "per_game_stl",
    "per_game_blk",
    "advanced_per",
    "advanced_tspct",
    "advanced_usgpct",
    "advanced_ws",
    "advanced_bpm",
    "advanced_vorp",
    "advanced_ows",
    "advanced_dws",
]


def load_frames() -> dict[str, pd.DataFrame]:
    frames = {}
    for label in SEASONS:
        path = DATA / f"nba_player_stats_{label.replace('-', '_')}.csv"
        df = pd.read_csv(path)
        frames[label] = df
    return frames


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
    for r in range(2, n_rows + 2):
        for c in range(1, n_cols + 1):
            cell = ws.cell(r, c)
            cell.border = thin
            cell.alignment = Alignment(vertical="center")
            if r % 2 == 0:
                cell.fill = alt
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
    for col_cells in ws.columns:
        letter = get_column_letter(col_cells[0].column)
        longest = 0
        for cell in col_cells[:60]:
            val = "" if cell.value is None else str(cell.value)
            longest = max(longest, min(len(val), 36))
        ws.column_dimensions[letter].width = max(10, longest + 2)


def add_readme(wb: Workbook, frames: dict[str, pd.DataFrame]) -> None:
    ws = wb.create_sheet("README", 0)
    lines = [
        ["NBA player statistics — last five seasons (Google Sheets ready)"],
        [],
        ["How to analyze"],
        ["Pivot tables", "Use the All_seasons tab → Insert → Pivot table. Rows: player or primary_position. Values: advanced_vorp, totals_pts, advanced_per."],
        ["Charts", "The Dashboard tab already has scoring and VORP charts. Or select any two columns on a year tab and Insert → Chart."],
        ["Google Explore", "Open this file in Google Sheets, click Explore (bottom right), and ask e.g. “top 10 PER at center in 2024-25”."],
        ["Filter", "Every year tab has a filter row. Filter primary_position = PG, sort advanced_vorp descending."],
        [],
        ["Tabs"],
        ["Dashboard", "Leaders, position averages, and starter charts"],
        ["All_seasons", "All 2,500 player-seasons stacked — best grain for pivots and year-over-year"],
        ["2021-22 … 2025-26", "One tab per season, 500 players (top 100 at each position), 423 stats"],
        [],
        ["Source", "Basketball-Reference season pages (totals, per game, per 36, per 100, advanced, play-by-play, shooting, adj shooting, plus playoffs)"],
        ["Row grain", "One row per player per season (TOT/2TM line if traded)"],
        ["Who is included", "Top 100 at PG, SG, SF, PF, C by regular-season minutes"],
    ]
    for label, df in frames.items():
        lines.append([label, f"{len(df)} players", f"{len(df.columns)} columns"])
    for r, row in enumerate(lines, 1):
        for c, val in enumerate(row, 1):
            ws.cell(r, c, val)
            if r == 1:
                ws.cell(r, c).font = Font(bold=True, size=16, color=NAVY)
            elif c == 1:
                ws.cell(r, c).font = Font(bold=True)
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 110
    ws.column_dimensions["C"].width = 22


def add_dashboard(wb: Workbook, combined: pd.DataFrame) -> None:
    ws = wb.create_sheet("Dashboard", 1)
    title = ws.cell(1, 1, "NBA last five years — leaders and position snapshot")
    title.font = Font(bold=True, size=18, color=NAVY)
    ws.merge_cells("A1:H1")
    ws.cell(2, 1, "Use year tabs for the full 423-stat rows. Use All_seasons for pivots. Charts sit on the right of this tab.")
    ws["A2"].font = Font(italic=True, color="555555")
    ws.merge_cells("A2:H2")

    scoring = (
        combined.sort_values("totals_pts", ascending=False)
        .groupby("season", sort=False)
        .head(8)[
            [
                "season",
                "player",
                "team",
                "primary_position",
                "totals_pts",
                "per_game_pts",
                "advanced_per",
                "advanced_vorp",
            ]
        ]
        .reset_index(drop=True)
    )
    vorp = (
        combined.sort_values("advanced_vorp", ascending=False)
        .groupby("season", sort=False)
        .head(8)[
            [
                "season",
                "player",
                "team",
                "primary_position",
                "advanced_vorp",
                "advanced_bpm",
                "advanced_per",
                "totals_pts",
            ]
        ]
        .reset_index(drop=True)
    )
    pos = (
        combined.groupby(["season", "primary_position"], as_index=False)
        .agg(
            players=("player", "count"),
            pts_per_game=("per_game_pts", "mean"),
            reb_per_game=("per_game_trb", "mean"),
            ast_per_game=("per_game_ast", "mean"),
            per=("advanced_per", "mean"),
            usg=("advanced_usgpct", "mean"),
            vorp=("advanced_vorp", "mean"),
        )
        .round(2)
    )
    chart_pts = (
        combined.sort_values("totals_pts", ascending=False)
        .groupby("season", sort=False)
        .first()
        .reset_index()[["season", "player", "totals_pts", "advanced_vorp", "advanced_per"]]
    )

    ws.cell(4, 1, "Scoring leaders (top 8 per season)").font = Font(bold=True, size=13, color=RED)
    start = 5
    for r_idx, row in enumerate(dataframe_to_rows(scoring, index=False, header=True), start):
        for c_idx, value in enumerate(row, 1):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == start:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    vorp_start = start + len(scoring) + 3
    ws.cell(vorp_start - 1, 1, "Value leaders — VORP (top 8 per season)").font = Font(
        bold=True, size=13, color=RED
    )
    for r_idx, row in enumerate(dataframe_to_rows(vorp, index=False, header=True), vorp_start):
        for c_idx, value in enumerate(row, 1):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == vorp_start:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    pos_start = vorp_start + len(vorp) + 3
    ws.cell(pos_start - 1, 1, "Position averages by season").font = Font(
        bold=True, size=13, color=RED
    )
    for r_idx, row in enumerate(dataframe_to_rows(pos, index=False, header=True), pos_start):
        for c_idx, value in enumerate(row, 1):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == pos_start:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    # Compact chart source on the far right so bar charts have clean categories
    ws.cell(4, 10, "Season scoring champion").font = Font(bold=True, color=NAVY)
    for r_idx, row in enumerate(dataframe_to_rows(chart_pts, index=False, header=True), 5):
        for c_idx, value in enumerate(row, 10):
            ws.cell(r_idx, c_idx, None if isinstance(value, float) and pd.isna(value) else value)
            if r_idx == 5:
                ws.cell(r_idx, c_idx).font = Font(bold=True, color="FFFFFF")
                ws.cell(r_idx, c_idx).fill = PatternFill("solid", fgColor=NAVY)

    bar = BarChart()
    bar.type = "col"
    bar.title = "Scoring champion — total points"
    bar.y_axis.title = "Points"
    data = Reference(ws, min_col=12, min_row=5, max_row=10)
    cats = Reference(ws, min_col=10, min_row=6, max_row=10)
    bar.add_data(data, titles_from_data=True)
    bar.set_categories(cats)
    bar.shape = 4
    bar.legend = None
    bar.dataLabels = DataLabelList()
    bar.dataLabels.showVal = True
    bar.style = 10
    bar.width = 15
    bar.height = 8
    ws.add_chart(bar, "P4")

    bar2 = BarChart()
    bar2.type = "col"
    bar2.title = "Scoring champion — VORP"
    bar2.y_axis.title = "VORP"
    data2 = Reference(ws, min_col=13, min_row=5, max_row=10)
    bar2.add_data(data2, titles_from_data=True)
    bar2.set_categories(cats)
    bar2.shape = 4
    bar2.legend = None
    bar2.style = 12
    bar2.width = 15
    bar2.height = 8
    ws.add_chart(bar2, "P20")

    # Scatter: VORP vs PER for 2024-25 top minutes PGs+Cs sample
    sample = combined[combined["season"] == "2024-25"].nlargest(40, "mp")[
        ["player", "advanced_per", "advanced_vorp"]
    ]
    ws.cell(4, 16, "2024-25 high-minute PER vs VORP").font = Font(bold=True, color=NAVY)
    # put scatter data starting at row 32 col 10 to avoid overlap with champion table
    ws.cell(32, 10, "player")
    ws.cell(32, 11, "PER")
    ws.cell(32, 12, "VORP")
    for i, rec in enumerate(sample.itertuples(index=False), 33):
        ws.cell(i, 10, rec.player)
        ws.cell(i, 11, rec.advanced_per)
        ws.cell(i, 12, rec.advanced_vorp)
    scatter = ScatterChart()
    scatter.title = "2024-25 — PER vs VORP (40 highest-minute players)"
    scatter.x_axis.title = "PER"
    scatter.y_axis.title = "VORP"
    xvalues = Reference(ws, min_col=11, min_row=33, max_row=32 + len(sample))
    yvalues = Reference(ws, min_col=12, min_row=32, max_row=32 + len(sample))
    series = Series(yvalues, xvalues, title="Players")
    scatter.series.append(series)
    scatter.style = 10
    scatter.width = 15
    scatter.height = 10
    scatter.legend = None
    ws.add_chart(scatter, "P36")

    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 26
    ws.column_dimensions["C"].width = 10
    for letter in "DEFGHIJ":
        ws.column_dimensions[letter].width = 16
    ws.column_dimensions["J"].width = 28
    ws.row_dimensions[1].height = 24


def core_view(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in CORE if c in df.columns]
    extra = [c for c in df.columns if c not in cols]
    # Keep identity + core first, then the rest of the 423 stats
    identity = [c for c in df.columns if c not in extra or c in cols]
    return df[cols + [c for c in df.columns if c not in cols]]


def main() -> None:
    frames = load_frames()
    combined = pd.concat(frames.values(), ignore_index=True)
    combined_core_first = core_view(combined)

    wb = Workbook()
    wb.remove(wb.active)
    add_readme(wb, frames)
    add_dashboard(wb, combined)

    ws_all = wb.create_sheet("All_seasons")
    write_df(ws_all, combined_core_first, "T_All_seasons")

    for label, df in frames.items():
        ws = wb.create_sheet(label)
        write_df(ws, core_view(df), f"T_S{label.replace('-', '_')}")

    path = DATA / "nba_player_stats_last_five_years.xlsx"
    wb.save(path)
    print("wrote", path, "sheets=", wb.sheetnames, "all_rows=", len(combined))


if __name__ == "__main__":
    main()
