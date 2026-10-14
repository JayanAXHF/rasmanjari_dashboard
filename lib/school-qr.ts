export type SchoolCredentials = { schoolCode: string; password: string }

/** Parse the exact credential text emitted by generate-school-cards.py. */
export function parseSchoolQr(payload: string): SchoolCredentials | null {
  const match = /^School ID: ([A-Z0-9_-]{2,32})\r?\nPassword: ([^\r\n]*)$/u.exec(payload)
  if (!match) return null
  const password = match[2]
  if (password.length < 12 || password.length > 256 || /\p{C}/u.test(password)) return null
  return { schoolCode: match[1], password }
}
