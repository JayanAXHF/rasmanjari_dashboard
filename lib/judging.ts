import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { schools, submissions, scorecards } from "@/lib/db/schema"

export async function getJudgeEntries() {
  // Explicit projection: names, filenames and status never enter client props.
  return db
    .select({
      id: submissions.id,
      username: schools.schoolCode,
      message: scorecards.message,
      originality: scorecards.originality,
      visualAppeal: scorecards.visualAppeal,
      creativity: scorecards.creativity,
    })
    .from(submissions)
    .innerJoin(schools, eq(schools.id, submissions.schoolId))
    .leftJoin(scorecards, eq(scorecards.submissionId, submissions.id))
    .orderBy(asc(schools.schoolCode))
}

export async function getJudgingResults() {
  return db
    .select({
      schoolId: schools.id,
      username: schools.schoolCode,
      name: schools.name,
      submissionId: submissions.id,
      message: scorecards.message,
      originality: scorecards.originality,
      visualAppeal: scorecards.visualAppeal,
      creativity: scorecards.creativity,
    })
    .from(schools)
    .leftJoin(submissions, eq(submissions.schoolId, schools.id))
    .leftJoin(scorecards, eq(scorecards.submissionId, submissions.id))
    .orderBy(asc(schools.schoolCode))
}
