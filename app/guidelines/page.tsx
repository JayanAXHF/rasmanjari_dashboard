import Link from "next/link"

export default function GuidelinesPage() {
  return (
    <main className="mx-auto min-h-svh max-w-3xl px-6 py-16">
      <Link className="text-sm underline" href="/">← Portal home</Link>
      <div className="typeset typeset-docs mt-8 max-w-[37em]">
        <h1>Competition guidelines</h1>
        <p>The organiser must replace this draft with the final competition guidelines before opening submissions.</p>
        <h2>Submission requirements</h2>
        <ul>
          <li>Each school may submit one final PNG entry.</li>
          <li>Check the prompt and file carefully before confirming; the submission is final.</li>
          <li>Use the School ID and password supplied to your school.</li>
        </ul>
        <h2>Need help?</h2>
        <p>Contact the competition organiser if you have a genuine submission mistake. Administrators can reset a submission after review.</p>
      </div>
    </main>
  )
}
