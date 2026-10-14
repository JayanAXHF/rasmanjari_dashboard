#!/usr/bin/env python3
"""Read a school CSV and emit the existing login-card base64 TSV protocol."""

import argparse
import base64
import csv
import os
import re
import secrets
import sys
import unicodedata


def read_schools(stream):
    reader = csv.reader(stream, strict=True)
    header = next(reader, [])
    header = [field.strip().lower() for field in header]
    if len(header) != 2 or set(header) != {"name", "username"}:
        raise ValueError("CSV must have exactly two headers: name,username (in either order).")
    schools = []
    seen = set()
    for row in reader:
        if not row or all(not field.strip() for field in row):
            continue
        if len(row) != 2:
            raise ValueError(f"CSV line {reader.line_num}: expected two fields. Quote names containing commas.")
        fields = dict(zip(header, row))
        name = fields["name"].strip()
        code = fields["username"].strip().upper()
        if not name or any(unicodedata.category(char).startswith("C") for char in name):
            raise ValueError(f"CSV line {reader.line_num}: a printable school name is required.")
        if not re.fullmatch(r"[A-Z0-9_-]{2,32}", code):
            raise ValueError(f"CSV line {reader.line_num}: username must be 2–32 characters: A–Z, 0–9, _ or -.")
        if code in seen:
            raise ValueError(f"CSV line {reader.line_num}: duplicate username {code}.")
        seen.add(code)
        schools.append((code, name))
    if not schools:
        raise ValueError("CSV must contain at least one school.")
    return schools


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", help="UTF-8 CSV with name,username headers")
    parser.add_argument("--credentials", required=True, help="New private output CSV for generated credentials")
    args = parser.parse_args()
    try:
        with open(args.csv, encoding="utf-8-sig", newline="") as stream:
            schools = read_schools(stream)
        # 20 characters from a 32-character alphabet: 100 bits of randomness.
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        records = [(code, name, "".join(secrets.choice(alphabet) for _ in range(20)))
                   for code, name in schools]
        fd = os.open(args.credentials, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(["name", "username", "password"])
            for code, name, password in records:
                writer.writerow([name, code, password])
        for record in records:
            print("\t".join(base64.b64encode(value.encode()).decode("ascii") for value in record))
    except (ValueError, OSError, UnicodeError, csv.Error) as error:
        print(f"School import preparation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
