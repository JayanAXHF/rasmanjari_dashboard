"""PDF/QR and reset orchestration checks using synthetic credentials only.

Requires requirements-school-cards-test.txt, zsh, and Poppler's pdftoppm.
No production connections or databases are used.
"""

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import re
import sqlite3
from contextlib import closing

from PIL import Image
from pypdf import PdfReader
import zxingcpp

ROOT = Path(__file__).resolve().parent.parent
GENERATOR = ROOT / "scripts/generate-school-cards.py"
PASSWORD = "synthetic-$pass`word\\123"


def encode(records):
    return "".join("\t".join(base64.b64encode(field.encode()).decode() for field in record)
                   + "\n" for record in records)


class SchoolCardsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="school-cards-test-")
        self.directory = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def generate(self, records, filename="cards.pdf"):
        output = self.directory / filename
        result = subprocess.run([sys.executable, str(GENERATOR), "--output", str(output)],
                                input=encode(records), text=True, capture_output=True)
        return output, result

    def test_pages_text_permissions_and_rendered_qr(self):
        for count in (1, 6, 7):
            with self.subTest(count=count):
                records = [(f"SCHOOL{i:02}", "École Rasmanjari High School", PASSWORD)
                           for i in range(count)]
                output, result = self.generate(records, f"cards-{count}.pdf")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output.stat().st_mode & 0o777, 0o600)
                reader = PdfReader(output)
                self.assertEqual(len(reader.pages), (count + 5) // 6)
                texts = "".join(page.extract_text() for page in reader.pages)
                for code, name, password in records:
                    self.assertIn(code, texts)
                    self.assertIn(name, texts)
                    self.assertIn(password, texts.replace("\n", ""))
                prefix = self.directory / f"render-{count}"
                subprocess.run(["pdftoppm", "-r", "200", "-png", str(output), str(prefix)],
                               check=True, capture_output=True)
                decoded = []
                for page in sorted(self.directory.glob(f"render-{count}-*.png")):
                    with Image.open(page) as image:
                        decoded.extend(code.text for code in zxingcpp.read_barcodes(image))
                self.assertCountEqual(decoded, [f"School ID: {code}\nPassword: {password}"
                                                for code, _, password in records])

    def test_long_credentials_are_preserved(self):
        password = "0123456789abcdef" * 16
        records = [("S" * 32, "A school with a longer but still printable name", password)]
        output, result = self.generate(records)
        self.assertEqual(result.returncode, 0, result.stderr)
        text = PdfReader(output).pages[0].extract_text().replace("\n", "")
        self.assertIn(password, text)
        prefix = self.directory / "long"
        subprocess.run(["pdftoppm", "-r", "200", "-png", str(output), str(prefix)],
                       check=True, capture_output=True)
        with Image.open(self.directory / "long-1.png") as image:
            decoded = zxingcpp.read_barcodes(image)
        self.assertEqual([code.text for code in decoded],
                         [f"School ID: {'S' * 32}\nPassword: {password}"])

    def test_invalid_records_and_existing_pdf(self):
        valid = ("SCHOOL01", "Test School", PASSWORD)
        invalid = [[], [valid, valid], [("bad", "Test", PASSWORD)],
                   [("SCHOOL01", "Test", "short")],
                   [("SCHOOL01", "Test", "x" * 257)],
                   [("SCHOOL01", "Test", "password-with\tcontrol")],
                   [("SCHOOL01", "Unsupported 😀", PASSWORD)],
                   [("SCHOOL01", "Very long school name " * 100, PASSWORD)]]
        for records in invalid:
            with self.subTest(records=len(records)):
                output, result = self.generate(records)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())
                self.assertNotIn(PASSWORD, result.stderr)
        output, result = self.generate([valid])
        self.assertEqual(result.returncode, 0, result.stderr)
        original = output.read_bytes()
        _, result = self.generate([valid])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output.read_bytes(), original)

    def test_malformed_protocol_and_missing_dependencies(self):
        output = self.directory / "invalid.pdf"
        for data in ("not-base64\tbad\tbad\n", "YWJj\n"):
            result = subprocess.run([sys.executable, str(GENERATOR), "--output", str(output)],
                                    input=data, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            self.assertIn("Invalid base64 school record", result.stderr)
        result = subprocess.run([sys.executable, "-S", str(GENERATOR), "--check"],
                                text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing PDF dependencies", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def reset(self, mode, duplicate=False):
        mock_dir = self.directory / mode / "bin"
        mock_dir.mkdir(parents=True)
        work = mock_dir.parent
        records = [("SCHOOL01", "Test School", PASSWORD)]
        if duplicate:
            records *= 2
        (work / "input.json").write_text(json.dumps([field for code, name, password in records
                                                   for field in (code, name, password, password)]))
        (work / "key").touch()
        gum = '''import json, os, pathlib, sys
work = pathlib.Path(os.environ["MOCK_WORK"])
args = sys.argv[1:]
if args[0] == "input":
    counter = work / "input-count"
    n = int(counter.read_text()) if counter.exists() else 0
    print(json.loads((work / "input.json").read_text())[n])
    counter.write_text(str(n + 1))
elif args[0] == "confirm":
    if "Add another school?" in args:
        n = int((work / "input-count").read_text())
        sys.exit(0 if n < len(json.loads((work / "input.json").read_text())) else 1)
    sys.exit(1 if os.environ["MOCK_MODE"] == "cancel" else 0)
else:
    print(" ".join(args))
'''
        ssh = '''import os, pathlib, sys
work = pathlib.Path(os.environ["MOCK_WORK"])
if "process.exitCode" in sys.argv[-1]:
    (work / "ssh-check-command").write_text(sys.argv[-1])
    sys.exit(1 if os.environ["MOCK_MODE"] == "preflight-failure" else 0)
assert len(list((work / "cards").glob(".school-cards.*/cards.pdf"))) == 1
(work / "ssh-reset-command").write_text(sys.argv[-1])
(work / "ssh-input").write_text(sys.stdin.read())
sys.exit(1 if os.environ["MOCK_MODE"] == "remote-failure" else 0)
'''
        for name, body in (("gum", gum), ("ssh", ssh)):
            path = mock_dir / name
            path.write_text(f"#!{sys.executable}\n" + body)
            path.chmod(0o700)
        if mode == "publish-failure":
            path = mock_dir / "mv"
            path.write_text("#!/bin/sh\nexit 1\n")
            path.chmod(0o700)
        env = {**os.environ, "PATH": f"{mock_dir}:{os.environ['PATH']}",
               "PYTHON_BIN": sys.executable, "SSH_KEY": str(work / "key"),
               "SCHOOL_CARDS_DIR": str(work / "cards"), "MOCK_WORK": str(work),
               "MOCK_MODE": mode, "DATABASE_PATH": "/local/development/app.db"}
        env.pop("RESET_DATABASE_PATH", None)
        for key in ("SCHOOL_CARDS_FONT", "SCHOOL_CARDS_BOLD_FONT", "SCHOOL_CARDS_MONO_FONT"):
            env.pop(key, None)
        result = subprocess.run(["zsh", str(ROOT / "deploy/reset-schools.sh")], env=env,
                                text=True, capture_output=True)
        return work, result, records

    def test_reset_success(self):
        work, result, records = self.reset("success")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual((work / "ssh-input").read_text(), encode(records))
        self.assertEqual(len(list((work / "cards").glob("school-cards-*.pdf"))), 1)
        self.assertEqual((work / "cards").stat().st_mode & 0o777, 0o700)
        self.assertFalse(list((work / "cards").glob(".school-cards.*")))
        self.assertNotIn(PASSWORD, result.stdout + result.stderr)
        for name in ("ssh-check-command", "ssh-reset-command"):
            command = (work / name).read_text()
            self.assertIn("DATABASE_PATH=/var/portal/data/app.db", command)
            self.assertNotIn("/local/development/app.db", command)

    def test_reset_preflight_failure_before_collecting_credentials(self):
        work, result, _ = self.reset("preflight-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((work / "input-count").exists())
        self.assertFalse((work / "ssh-input").exists())
        self.assertIn("Check RESET_DATABASE_PATH", result.stdout)

    def test_database_preflight_opens_existing_database_readonly(self):
        source = (ROOT / "deploy/reset-schools.sh").read_text()
        code = re.search(r"REMOTE_CHECK_NODE=\$\(cat <<'NODE'\n(.*?)\nNODE", source, re.S).group(1)
        database = self.directory / "app.db"
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.executescript("CREATE TABLE schools (id TEXT); CREATE TABLE audit_logs (id TEXT); INSERT INTO schools VALUES ('existing');")
        for path, success in ((str(database), True),
                              (str(self.directory / "missing.db"), False),
                              (str(self.directory / "missing-directory/app.db"), False),
                              ("relative/app.db", False)):
            result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT,
                                    env={**os.environ, "DATABASE_PATH": path},
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode == 0, success, result.stderr)
        self.assertFalse((self.directory / "missing.db").exists())
        self.assertFalse((self.directory / "missing-directory").exists())
        with closing(sqlite3.connect(database)) as connection:
            self.assertEqual(connection.execute("SELECT id FROM schools").fetchall(), [("existing",)])

    def test_reset_cancellation_and_generation_failure(self):
        for mode, duplicate in (("cancel", False), ("duplicate", True)):
            work, result, _ = self.reset(mode, duplicate)
            self.assertEqual(result.returncode == 0, mode == "cancel")
            self.assertFalse((work / "ssh-input").exists())
            self.assertFalse(list((work / "cards").iterdir()))

    def test_reset_remote_failure(self):
        work, result, _ = self.reset("remote-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((work / "ssh-input").exists())
        self.assertFalse(list((work / "cards").iterdir()))
        self.assertIn("Check the server before retrying", result.stdout)

    def test_reset_publication_failure_keeps_recoverable_pdf(self):
        work, result, _ = self.reset("publish-failure")
        self.assertNotEqual(result.returncode, 0)
        pdfs = list((work / "cards").glob(".school-cards.*/cards.pdf"))
        self.assertEqual(len(pdfs), 1)
        self.assertEqual(pdfs[0].stat().st_mode & 0o777, 0o600)
        self.assertIn("Do not repeat the reset", result.stdout)


if __name__ == "__main__":
    for executable in ("zsh", "pdftoppm", "node"):
        if not shutil.which(executable):
            sys.exit(f"Required test executable is missing: {executable}")
    unittest.main()
