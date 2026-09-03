# AI Mock Interview

A standalone practice-interview web app: pick a role and difficulty, answer three
AI-generated questions out loud, get per-answer AI feedback and a final report.

## Technology

- TanStack Start (React 19 + Vite) — the platform's app framework
- Tailwind CSS v4 design tokens (`src/styles.css`)
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) — in-browser face detection
- Browser MediaDevices + MediaRecorder — camera preview and temporary audio capture
- Lovable AI Gateway (server-side) — question generation, answer evaluation,
  final report (`google/gemini-3.7-flash`) and speech-to-text
  (`openai/gpt-4o-mini-transcribe`)

## Project structure

```
src/
  routes/
    index.tsx                        # interview state machine (setup → interview → analysis → report)
    api/public/transcribe.ts         # POST speech-to-text endpoint (multipart audio → transcript)
  components/interview/
    ui.tsx                           # shared UI primitives (button, card, pills, score bars)
    SetupScreen.tsx                  # role/difficulty selection + requirements
    InterviewScreen.tsx              # question, timer, controls, transcript, warnings
    CameraPanel.tsx                  # live webcam preview + camera/face/engagement status
    AnalysisScreen.tsx               # per-answer scores and feedback
    ReportScreen.tsx                 # final report and interview metrics
  lib/interview/
    config.ts                        # roles, difficulty, timing/threshold constants, types, scoring
    ai.server.ts                     # server-only AI service layer (chat JSON + transcription)
    interview.functions.ts           # server functions: questions, evaluation, report
    api.ts                           # client → transcription endpoint
  lib/media/
    useCamera.ts                     # webcam stream lifecycle
    useRecorder.ts                   # temporary microphone capture
    useFaceMonitor.ts                # face presence, face count, camera engagement, warnings
```

## How it works

1. **Setup** — choose role and difficulty; the app explains requirements and privacy.
2. **Start** — camera permission is requested, then three questions are generated
   server-side. The interview does not start unless exactly three questions are returned.
3. **Answer** — START ANSWER begins a 10-minute countdown and microphone capture.
   STOP ANSWER (or timer expiry) ends capture and sends the clip for transcription.
4. **Review** — the transcript is displayed; SUBMIT ANSWER sends question + transcript
   + role + difficulty for evaluation.
5. **Analysis** — six category scores (0–100), strengths, improvements, and a better answer.
6. **Report** — after three answers a final report is generated.

While the interview runs, the webcam feed is analysed locally for face presence,
multiple faces, and approximate head orientation ("Camera Engagement"). Warnings appear
after a 3-second grace period with an 8-second cooldown and are purely informational —
they never fail, stop, or auto-submit anything.

## Scoring

- **Answer score** = average of the six category scores.
- **Overall score** = average of the three answer scores.
- **Category score in the report** = average of that category across the three answers.

Scores are computed deterministically in `interview.functions.ts`; the model only supplies
the raw category values and written feedback.

## Configuration / secrets

The only secret is `LOVABLE_API_KEY`, provisioned by the platform and read exclusively
inside server handlers (`src/lib/interview/ai.server.ts`). No key exists in client code,
and no `VITE_` variable is used for AI access. To swap providers or models, change the
constants at the top of `ai.server.ts` — nothing else needs to change.

## Running

`npm run dev` (or the platform preview) — no additional configuration required.
Camera and microphone permissions must be granted in the browser; the app must be served
over HTTPS or localhost for those APIs to work.

## Privacy

- The webcam feed is displayed and analysed **in the browser only**. No frames, no video,
  and no recordings leave the device or are stored.
- Audio exists temporarily in memory, is uploaded once for transcription, and is released
  immediately after the transcript returns. Nothing is written to disk or a database.
- AI evaluation receives only text: question, transcript, role, difficulty.
- There is no database, no accounts, and no persistence — state lives in the page session.

## Known limitations

- Camera engagement is an approximation from face landmark geometry, not eye tracking.
  Glasses, lighting, and off-centre camera placement affect it.
- Face detection needs to download the MediaPipe model from a CDN on first use; if it
  fails, the app shows "Face detection unavailable" and the interview continues.
- Transcription accuracy depends on microphone quality and background noise.
- Long answers are limited to a 25 MB audio upload.
- Refreshing the page discards the interview (by design — nothing is stored).
- No development/mock AI mode is included: the real AI service is wired and working.
