import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { parseSchoolQr } from "../lib/school-qr.ts"

test("parses the actual Python generator payload without changing credentials", () => {
  const code = "SCHOOL_01"
  const password = "  École: pass-word!  "
  const generated = spawnSync("python3", ["-c", "import runpy, sys; m = runpy.run_path('scripts/generate-school-cards.py'); sys.stdout.write(m['qr_payload'](sys.argv[1], sys.argv[2]))", code, password], { encoding: "utf8" })
  assert.equal(generated.status, 0, generated.stderr)
  assert.deepEqual(parseSchoolQr(generated.stdout), { schoolCode: code, password })
  assert.deepEqual(parseSchoolQr(generated.stdout.replace("\n", "\r\n")), { schoolCode: code, password })
})

test("supports maximum lengths and printable Unicode", () => {
  for (const password of ["p".repeat(12), "p".repeat(256), "é你好 password", "🙂".repeat(128)]) {
    assert.deepEqual(parseSchoolQr(`School ID: ${"S".repeat(32)}\nPassword: ${password}`), { schoolCode: "S".repeat(32), password })
  }
})

test("rejects unrelated, malformed, or unprintable credentials", () => {
  const valid = "School ID: SCHOOL01\nPassword: twelve-chars!"
  for (const payload of ["", "https://example.com", valid + "\n", valid + "\nSchool ID: OTHER", valid.replace("School ID:", "School:"), valid.replace("Password:", "password:"), valid.replace("SCHOOL01", "school01"), valid.replace("SCHOOL01", "S"), valid.replace("SCHOOL01", "S".repeat(33)), valid.replace("twelve-chars!", "short"), valid.replace("twelve-chars!", "x".repeat(257)), valid.replace("twelve-chars!", "password\twith-tab"), valid.replace("twelve-chars!", "password\u200bhidden"), valid.replace("\n", "\r")]) {
    assert.equal(parseSchoolQr(payload), null)
  }
})
