# The court in the age of AI
Practical guide | 10 October 2026

## 1. The court in the age of AI
A short guide for judges and court clerks. Research, review submissions and carry sources into your work with CourtOS.

## 2. Start with the task
What should improve in the court’s work?

### A concrete question
Not every task needs AI. Start with a difficulty: where is the decisive allegation? Which exhibit supports it? What does the other party say? Which legal question remains open? A good tool reduces the work of finding material and makes these questions easier to check.

### Rethink the process
Richard Susskind asks how people gain access to justice and distinguishes faster existing processes from a different organisation of work. James Allsop stresses judicial power, its human purpose and the limits of performance measures alone. [1, 2, 3]

### Our test
For CourtOS, we draw this design principle: every material assertion should lead to a source passage that can be checked. Uncertainty and disagreement must remain visible. This is our proposal, not evidence that the tool improves justice.

## 3. Judgment remains human
AI offers a draft. The court answers for its reasons.

### The legal framework
Article 29 of the Swiss Federal Constitution protects fair proceedings, the right to be heard and a reasonable time. Article 29a generally guarantees access to a court. Article 30 requires a tribunal established by law, competent, independent and impartial; Article 191c binds judicial authorities solely to the law when exercising their judicial functions. [4]

### Reasons, not just fluent writing
Reasons must disclose the decisive considerations and allow an effective challenge to the decision. A fluent AI response does not by itself do that. [5]

### A single judge or a panel
We propose the same discipline for both: check sources, preserve objections and assign responsibility. Each member of a three- or five-judge panel needs room to form an assessment. Early discussion remains possible. The pilot does not provide dedicated deliberation or voting functions.

## 4. Where the data goes
Here, “local” means the CourtOS server in Germany.

### Three separate routes
- Your PDFs and Gemma 4: storage and model processing on the Switchboard server at Hetzner in Germany. Not on your computer.
- OpenCaseLaw: the search terms you expressly submit go to the public search service, which uses external AI. Your library and Word document are not sent with them.
- Claude Opus 5.5: the frontier review sends your approved text to Anthropic, after a full preview and your confirmation.

### The connection
Cloudflare handles access and web traffic, including displayed content. Green indicates Gemma and violet indicates the external review; the provider and location also appear in words.

### The present pilot
Use public decisions, non-confidential literature you are entitled to use, or fictional test documents. No real case files or confidential material. Signing in is not institutional approval. There is no automatic anonymisation.

## 5. Find a source. Continue your work.
The reference should follow you to where you write.

### Open
In the browser: https://sandbox.swisslaw.io/research. Sign in with your email address and the code you receive. In Word, open the installed CourtOS add-in. Research requires neither a project nor a chat.

### Search public sources
Choose OpenCaseLaw. Enter a decision reference or a few public search terms, and choose a language if needed. Results are limited. No result does not establish that no relevant decision exists. Keep confidential names and facts out of this field.

### Take a passage with you
Open the decision and check the original. Select a short passage, confirm the selection, then copy text and source or insert them into Word. The text-search link attempts to find the passage in the original. It does not certify an official paragraph number; a link to the whole document is not a pinpoint reference.

### Use a larger window
Open the browser from Word and continue under the same account. Then return the research state to Word. If the two states differ, choose which to keep. A handoff lasts two hours; it starts no new search and makes no automatic change to your document.

### Check citation details
“Citations” opens Citecheck separately. CourtOS sends it no text. Read the original decision to assess whether it supports your statement.

## 6. Add your own sources
The library complements case law with the material you select.

### Upload
Add PDFs under “Library”. A clear filename with author, title and edition helps identify them later. CourtOS stores a copy on the server; it does not read a local case folder directly. The interface shows upload limits.

### Search
In research, choose “Your sources” and the documents you need. This search uses no AI. A result shows the passage, version and PDF page. Unreadable scans or partial indexing can leave gaps.

### Keep the reference
Open the page and read the context. Copy or insert the passage with filename, version, page and protected source link. The link opens the stored version for the authorised account; it grants no access to anyone else.

### Separate wording from meaning
A verbatim match can still be incomplete or irrelevant to the legal question. Check what the source supports. The PDF page is not necessarily the printed page number.

## 7. Review submissions
Bring allegations and evidence together in a list you can check.

### Prepare
Open “Review submissions”. Add short fictional claims, responses and exhibits through the library. Select document versions, assign each document’s role and party, then choose the report language. To try it, open “Example matters” and choose “Import four PDFs”. The documents are reconstructed from a published judgment, not original submissions. Then check the roles and parties.

### Three tasks
- Facts and evidence: allegation, evidence and opposing position appear together. AI proposes “Supports the statement”, “Contradicts the statement”, “Inconclusive” or “Not found in selected sources”.
- Legal arguments: comparison is limited to the selected sources. Missing decisions and literature are not retrieved automatically. Research public references separately.
- Chronology: unambiguous day dates are sorted. Approximate or missing dates remain separate. Conflicting accounts keep separate entries.

### Read the result
Choose “Start partial analysis”. A report has at most twelve rows and identifies the sources, versions and pages read. Open the references. Literal matching confirms a passage, not the AI assessment or the truth of a party’s allegation.

### A partial analysis under test
AI can miss assertions even when given the full text. Oversized selections are refused; drafts with unconfirmed source passages are withheld. Check omissions and reasons yourself: this workflow’s reliability is still being tested.

## 8. Use AI for a defined task
Choose the task and only the sources it needs.

### Gemma on the CourtOS server
In the browser: the assistant can prepare a draft using selected PDFs. Sending starts the analysis. The model uses an Unsloth version and runs on server CPUs; you may have to wait. Gemma does not guarantee correct answers. Usage limits appear in the application.

### An external review
In the browser: send a short passage that is permitted to leave CourtOS to the frontier review. Edit the task and text. Check the full preview, provider and model. Attachments and the rest of the chat are not included automatically. The contents of links are not retrieved.

### Use the response
An external response can return as an editable draft. It is not sent again automatically. Check each decisive assertion against the original. A convincing answer from a second model is not an independent source check.

## 9. Test first. Then decide.
A useful pilot produces observations, not promises.

### Assess the benefit
Use a small test case with known allegations, evidence and contradictions. Count omitted and invented assertions. Check parties, amounts, dates and references. Include waiting and correction time. Compare with your usual method.

### Before real case files
The institution must settle permitted tasks, provider access, permissions, retention, deletion, operations and professional responsibility. Word for macOS has been tried with a fictional document; other versions and institutional environments need their own tests.

### What remains to be built
Direct work in a local case folder and consistent pseudonymisation across documents are future tasks. Replacement names alone do not make documents anonymous. A successful pilot replaces neither this development nor legal and technical approval.

### Open software
- [CourtOS · Source code and GNU AGPL v3.0](https://github.com/jonashertner/CourtOS)

## 10. Sources and scope
Basis for the attributed positions and legal statements; checked on 9 October 2026.

- [1. Richard Susskind · Online Courts and the Future of Justice](https://academic.oup.com/oxford-law-pro/book/41081)

Publisher’s abstract and contents, Part II. The full book was not reviewed.

- [2. Richard Susskind · Corrected oral evidence: Constitutional implications of Covid-19](https://committees.parliament.uk/oralevidence/462/html/)

Official House of Lords transcript, 3 June 2020, Question 30; context: Questions 23–24 and 29.

- [3. James Allsop · Technology and the Future of the Courts](https://www.fedcourt.gov.au/__data/assets/pdf_file/0017/55520/Allsop-CJ-20190326.pdf)

Lecture of 26 March 2019, pp. 2–4 and 11–12, published by the Federal Court of Australia.

- [4. Swiss Federal Constitution · SR 101 (German text)](https://www.fedlex.admin.ch/eli/cc/1999/404/de)

Articles 29(1)–(2), 29a, 30(1) and (3), and 191c. Version reviewed: 3 March 2024. English explanations here are summaries, not an official translation.

- [5. Swiss Federal Supreme Court · BGE 129 I 232](https://www.bger.ch/ext/eurospider/live/de/php/clir/http/index.php?lang=de&type=show_document&highlight_docid=atf://129-I-232:de)

Consideration 3.2, pp. 236–237. Only the general principle on reasons is used; the case concerned naturalisation.

### About this edition
Workflows and design principles are our proposals. They establish neither a productivity gain nor the lawfulness of a particular use of AI. Feature status: 10 October 2026. Source checking, model quality and institutional approval remain separate tasks.

