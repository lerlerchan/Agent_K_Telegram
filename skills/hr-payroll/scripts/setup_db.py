#!/usr/bin/env python3
"""Set up AiTraining2U HR SQLite database"""
import sqlite3, os

DB_PATH = os.path.expanduser("~/hr.db")
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.executescript("""
CREATE TABLE IF NOT EXISTS employees (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id              TEXT    UNIQUE NOT NULL,
    full_name           TEXT    NOT NULL,
    nric                TEXT,
    nationality         TEXT    DEFAULT 'Malaysian',
    address             TEXT,
    email               TEXT,
    tel                 TEXT,
    position            TEXT    NOT NULL,
    department          TEXT,
    employment_type     TEXT    NOT NULL,
    start_date          TEXT    NOT NULL,
    end_date            TEXT,
    probation_months    INTEGER DEFAULT 0,
    basic_salary        REAL,
    allowances          TEXT,
    contract_pdf        TEXT,
    signed_pdf          TEXT,
    status              TEXT    DEFAULT 'active',
    created_at          TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS emp_sequence (
    year    INTEGER PRIMARY KEY,
    last_no INTEGER NOT NULL DEFAULT 0
);
""")

# Seed 2026 — start at 0 (first employee = ATU-EMP-2026-0001)
c.execute("INSERT OR IGNORE INTO emp_sequence (year, last_no) VALUES (2026, 0)")
conn.commit()
conn.close()
print(f"HR DB created: {DB_PATH}")
