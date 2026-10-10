import Link from "next/link"

export default function GuidelinesPage() {
  return (
    <main className="mx-auto min-h-svh max-w-3xl px-6 py-16">
      <Link className="text-sm underline" href="/">← Portal home</Link>
      <div className="typeset typeset-docs mt-8 max-w-[37em]">
        <h1>Competition guidelines</h1>
        <h2>Guidelines</h2>
        <ul>
          <li>AI tools such as Canva AI, Adobe Express, Microsoft Designer, Pixlr AI, Magic Studio, Photoshop or Photopea may be used.</li>
          <li>Final layering should be done using Photoshop or Photopea.</li>
          <li>PNG/JPEG files must be submitted.</li>
          <li>Offensive, inappropriate, culturally insensitive, or misleading content will lead to disqualification.</li>
          <li>The results for the qualifying round will be announced on Saturday, 10th Oct 2026.</li>
          <li>
            All entries must be submitted through the Google Form Link:{" "}
            <a className="underline" href="https://forms.gle/yzqtgw1HPurnY1wSA">
              https://forms.gle/yzqtgw1HPurnY1wSA
            </a>
          </li>
          <li>Participants must bring their devices for the Final Round on the day of the competition.</li>
          <li>The artwork must convey clearly identifiable elements and a meaningful Panchatantra story/message.</li>
          <li>The decision of the judges shall be final and binding.</li>
        </ul>
        <h2>Judgement Criteria</h2>
        <ul>
          <li>Creativity</li>
          <li>Moral Message Conveyed</li>
          <li>Originality</li>
          <li>Visual Appeal</li>
        </ul>
        <h2>Need help?</h2>
        <p>Contact the competition organiser if you have a genuine submission mistake. Administrators can reset a submission after review.</p>
      </div>
    </main>
  )
}
