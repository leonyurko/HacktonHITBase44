# Restart Time Agent — User Workflows

**Purpose:** End-to-end user journeys describing what actually happens, in plain language, from the user's perspective. Use this when evaluating UX choices, designing test scenarios, or onboarding new contributors.

**Companion to:** `docs/superpowers/specs/2026-04-27-restart-time-management-agent-design.md` (PRD), `docs/system-design.md` (technical).

---

## Personas

We design for these archetypes, derived from Restart's userbase:

**1. Yoni — recently discharged, 26**
Lost his lower leg in October 7. Three months out of acute rehab. Has good days and bad. Mornings are the hardest — especially Mondays. Speaks Hebrew. Diagnosed PTSD; previously had ADHD but never on medication. Lives at his parents' for now. Wants to feel competent again.

**2. Rivka — long-term, 41**
Combat medic. PTSD diagnosed 2014, in active treatment. Has held down a job, but executive function for personal tasks (paying bills, calling friends, errands) collapses on bad weeks. Comfortable in both Hebrew and English. Has tried multiple ADHD apps; quit them all because of streak shame.

**3. Avi — newly engaged, 23**
TBI from a vehicle accident. Memory and time perception affected. Speaks Hebrew. Lives with parents. Mom is the de facto "executive function" — Avi wants to do more for himself but gets overwhelmed.

These personas inform every workflow. If a workflow would frustrate Yoni on a Monday, it's wrong.

---

## Workflow A — First-time onboarding

**Goal:** Get the user from "never used this" to "ready to plan their day" in under 90 seconds, with zero typing of personal info.

```
1. User lands on app URL
   └─ Sees: "Restart Time" logo, one-line tagline ("a calmer way to plan your day"),
            email field, "send me a link" button.
            Language toggle (HE / EN) in top corner.
            Selected language defaults to browser locale.

2. User enters email, taps button
   └─ Magic link sent via Supabase Auth.
            UI shows: "check your email — we sent a link" (no email shown back).
            No password creation, no profile form.

3. User clicks link in email
   └─ Browser opens app, Supabase session established.
            App lands on the Mode Picker screen.

4. Mode Picker is greeted with:
            "Hi.  /  היי."  (one word, no exclamation, no name yet)
            Two big buttons: "Plan my day" / "I need help right now"
            Below: empty state message — "no plan yet. let's start with the first one."
            Bottom-right grounding button visible.

5. User taps "Plan my day" — first-ever planning session begins.
```

**No onboarding tutorial. No tour overlays. No "5 things to know first" cards.** The first planning conversation IS the onboarding.

---

## Workflow B — Daily planning conversation (returning user, 5th day)

**Persona:** Yoni. Hebrew. Has 2 carryovers from Monday (`call sister`, `walk 10 min`).

```
Monday 09:30  ─────────────────────────────────────────────────────────────

Yoni opens app. Mode Picker shows:
  "Yesterday's open:  call sister, walk 10 min"
  Progress card: "75 / 100 — First Light. this month: 4 days here."

Yoni taps "Plan my day."

[ planning_flow → state: greet ]

Agent (HE, voice + text):
  "טוב לראות אותך. בוא נראה איך היום."
  ("good to see you. let's see how today goes.")

Yoni: (speaks)  "כן בוא"  ("yeah let's")

[ state: review_carryover, item: call sister ]

Agent: "אמרת ביום שני שתתקשר לאחות. קרה?"
       ("you said monday you'd call your sister. happened?")

Yoni: "לא הצלחתי. תזיז את זה למחר?"
      ("couldn't manage. push it to tomorrow?")

Agent: "הבנתי. נדחה."
       ("got it. deferring.")
[ side effect: tasks.deferred_to = tomorrow, task_events row written ]

[ state: review_carryover, item: walk 10 min ]

Agent: "וההליכה? עשית?"
       ("and the walk? did it?")

Yoni: "כן, בערב."
      ("yes, in the evening.")

Agent: "יפה."
       ("nice.")
[ side effect: tasks.state = 'done', task_events written, +10 points
   awarded for small task, +5 for carryover bonus, +5 for app_open_day,
   surprise multiplier roll → ×1 this time ]

[ state: propose_today ]

Agent: "מה רוצה לעשות היום?"
       ("what do you want to do today?")

Yoni: "להתקלח. ולהוציא את הכלב."
      ("shower. and walk the dog.")

Agent: "להתקלח. רוצה שאוסיף?"
       ("shower. want me to add it?")

Yoni: "כן"

Agent: "ולהוציא את הכלב. גם להוסיף?"

Yoni: "כן"

Agent: "עוד משהו?"
       ("anything else?")

Yoni: "לא, מספיק להיום."
      ("no, that's enough for today.")

[ state: confirm ]

Agent: "אז להיום: להתקלח, להוציא את הכלב, ולהתקשר לאחות.
        שלושה דברים. מספיק."
       ("so for today: shower, walk the dog, call your sister.
         three things. enough.")

Yoni: "כן"

[ state: close ]

Agent: "טוב. כל הזמן בעולם."  ("good. take your time.")
[ summary written, session ended, +15 planning_session points ]

UI returns to Mode Picker.
Today's tasks now show.
Progress: "110 / 100 — Steady Step!"  ← level up
[ level-up screen fades in, single sentence in agent voice,
   tap to dismiss ]
```

**Notes for the design team:**
- The carryover that didn't happen (`call sister`) was deferred without shame, with one acknowledgment. Yoni's mood was not interrogated.
- Carryover that did happen got "יפה" — short, warm, no exuberance. Trauma users find loud praise ironic.
- The agent never said "you got 25 points!" — points moved silently.
- Level-up was shown but not celebrated with sound or animation.
- The whole conversation took ~80 seconds.

---

## Workflow C — On-demand "I'm stuck" mid-day

**Persona:** Rivka. English. It's 14:30. She has 3 open tasks but hasn't done any.

```
Rivka opens app. Mode Picker.
She taps "I need help right now."

[ on_demand session starts ]

Composer is dual-mode (text field + mic + voice button).
Empty thread.

Rivka types: "I've been on the couch for 4 hours. I should be working."

[ Call 1: reply generation ]

  RAG fires:
    - strategies corpus, top-3 (cosine over user message)
      → chunks about "gentle restart", "lowering the bar", "permission slips"
    - restart corpus: narrative trigger matched? "should be working" → no triggers
    - user_history: user said "I" but no past-reference cue → no retrieval

  Prompt assembled with techniques in <known_techniques>.
  Streamed reply (English):

  Agent (text, no voice since she typed):
    "couch for 4 hours doesn't undo anything.
     what's the smallest version of one of those tasks?"

[ Call 2: extractor ]

  No task changes in this exchange. Returns {}.
  No SSE 'extracted' event.

Rivka types: "i was supposed to email my landlord about the leak"

[ next turn ]
[ Call 1 ]

  RAG: strategies corpus → "starter sentences", "draft don't perfect"
  Prompt assembled.

  Agent:
    "open the email. one sentence: 'leak in the bathroom, when can someone come?'
     send. that's the whole task."

[ Call 2: extractor ]

  Returns:
    {
      "add": [
        { "title": "email landlord re: leak",
          "size": "tiny",
          "description": "one sentence — when can someone come?" }
      ],
      "note": "user is in low-engagement state, may need follow-up"
    }

  Server writes:
    - tasks row (title, size=tiny, description, created_in_session)
    - task_events row (event_type='created', delta_json)

  SSE: event: extracted → frontend invalidates task list, new task appears

Rivka: (5 minutes later) "ok i sent it"

[ next turn ]
[ Call 1 ]
  Agent: "good. now you've done one thing today."

[ Call 2: extractor ]
  Returns:
    {
      "complete": [
        { "task_match": "email landlord re: leak" }
      ]
    }

  Server:
    - resolves task by title fuzzy match against open tasks for this user
    - tasks.state = 'done', completed_at = now()
    - task_events row (event_type='completed')
    - point_events: +5 for tiny task, surprise multiplier roll → ×3 hit!
      → 15 points
    - SSE: extracted

UI silently updates: 1 task is now ✓; subtle progress card increment; no popup.

Rivka closes the app.
```

**Notes:**
- The agent never said "good job!" — said "good. now you've done one thing today." Acknowledges, doesn't celebrate.
- The agent gave one concrete action ("open email, write one sentence, send"). Not a list.
- Task was created from conversation, not user input form. The user never typed into a "title" field.
- Surprise multiplier 3x just happened — Rivka has no idea, but her points jumped. ADHD dopamine → variable rewards.

---

## Workflow D — Bad day (no progress, no shame)

**Persona:** Yoni. Tuesday morning. Did 0 of yesterday's 3 tasks.

```
Mode Picker shows: "Yesterday's open: shower, walk the dog, call sister"
                   "this month: 5 days here"

Yoni taps "Plan my day."

[ greet ]
Agent: "היום חדש."  ("new day.")  — no reference to yesterday's failures yet.

Yoni: "לא עשיתי כלום אתמול. לא רוצה לדבר על זה."
      ("did nothing yesterday. don't want to talk about it.")

Agent: "בסדר. נמשיך."
       ("okay. let's move on.")

[ state: review_carryover, item: shower ]
Agent: "מה לגבי המקלחת?"
       ("what about the shower?")

Yoni: "תוריד. הכל. תוריד הכל מאתמול."
      ("drop. everything. drop all of yesterday.")

Agent: "הורדתי."
       ("done.")
[ side effect: all 3 carryovers get state='dropped', task_events rows ]

[ state: propose_today, but Yoni hasn't said anything yet ]
Agent: "מה רוצה היום?"
       ("what do you want today?")

Yoni: "כלום."

Agent: "בסדר. גם זה תכנית."  ("okay. that's also a plan.")

[ state: confirm — no tasks, just acknowledgment ]
Agent: "אם תרצה לחזור — אני כאן."
       ("if you want to come back — i'm here.")

[ state: close ]
+15 planning_session points awarded for showing up.
+5 app_open_day.
Session summary: "showed up. dropped all carryovers. no plan today."

Yoni closes app.
```

**Critical UX validation:** Yoni earned 20 points for opening the app on a bad day. He lost zero. There is no streak counter to see. There is no "you missed 3 tasks" notification. The agent did not interrogate the bad day. **This is the test.**

---

## Workflow E — Reminders (post-MVP, but design contract)

**Persona:** Avi. Hebrew. Has set up his planning routine.

```
During Monday morning planning:

Yoni adds task: "להתקשר לרופא" (call doctor)
Agent: "תרצה תזכורת שקטה לפני זה?"
       ("want a quiet nudge before this?")

Yoni: "כן בעשר."

Agent: "טוב, אתן לך טפיחה ב-10."
       ("okay, i'll give you a tap at 10.")

[ side effect: reminder created
   task_id, scheduled_at = today 10:00,
   delivery_channel = 'webpush',
   body_override = "אמרת שתתקשר לרופא"
   (you said you'd call the doctor) ]

10:00 arrives.
Quiet hours? No (10:00 > 09:00). Digest mode? No. Dispatch.

Browser push notification appears (silent, no sound, no badge):
  Title: "Restart Time"
  Body: "אמרת שתתקשר לרופא"

Yoni taps it. App opens to today's task list with the task highlighted.
```

**Notes:**
- The agent generated the body in Yoni's own style ("you SAID you'd call"). Not "REMINDER: CALL DOCTOR."
- No sound, no badge.
- If 10:00 had been inside quiet hours, the reminder would have been delayed automatically.
- If digest mode was on, it would have collapsed into the morning notification at 09:00.

---

## Workflow F — Calendar sync (post-MVP, but design contract)

**Persona:** Rivka. English. Has connected Google Calendar.

```
On-demand session.
Rivka: "i need to do laundry today and finish the slides for Wednesday."

[ Call 1 reply ]
Agent reads her calendar via /calendar/events.
Sees: Tuesday 14:00-15:00 "Coffee with M".

Agent:
  "okay, two things.
   you have coffee at 2 — laundry before or after?"

Rivka: "before. 11."

[ Call 2 extractor ]
Returns:
  {
    "add": [
      { "title": "laundry",        "size": "small", "soft_when": "11:00" },
      { "title": "finish Wed slides", "size": "medium" }
    ]
  }

Server creates tasks. Then:

Agent: "want me to block 30 min on your calendar for laundry?"

Rivka: "yes please"

[ Call 1 next turn — minimal, just confirmation ]
Agent: "done. 11:00 to 11:30 on your calendar."

[ Call 2: no task changes ]
[ Side effect: calendar_event_id populated on task ]
[ POST to Google Calendar API:
  events.insert {
    summary: "laundry",
    start: { dateTime: today 11:00 },
    end:   { dateTime: today 11:30 },
    description: "from Restart Time"
  } ]

Rivka closes app.
```

**Notes:**
- Calendar event was created **only** after explicit user yes. The agent asked.
- The agent used calendar context ("coffee at 2") without ever explaining it had calendar access. It just *behaved* informed.

---

## Workflow G — Grounding hatch

**Trigger:** Any state, any time, any user.

```
User is mid-conversation. Agent just said something. User feels overwhelmed.

User taps the small ◐ icon in the corner.

[ NO LLM CALL. NO STATE CHANGE. ]

Screen fades to a calmer presentation:
  Top:    "take a moment."

  Center (one item at a time, fade-in):
            "notice 3 things you can see."
            (8 second pause)
            "2 you can hear."
            (8 second pause)
            "1 you can feel."

  Bottom: "i'm still here when you're ready."
          [ when ready button ]

User taps "when ready" — returns to exact spot in conversation.

Session was paused but not closed.
```

**Notes:**
- Static content. No AI. Cannot fail. Always available.
- Translated equivalents in Hebrew with idiomatic phrasing.
- 8-second pauses are forced — user cannot skip. (They can leave.)
- Counts as a non-event in `point_events` — invisible to the gamification layer.

---

## Workflow H — Ephemeral session

**Trigger:** User starts on-demand mode and toggles "don't save" before sending the first message.

```
Composer has a small toggle: 🔒 don't save this session.
User flips it on.

[ on_demand session starts with sessions.ephemeral = true ]

User has the conversation. Agent behaves identically.
Audio is recorded as usual (ephemeral != "no recording").

Tasks created during the session DO persist.
Messages and audio are flagged ephemeral.

When user closes session:
  DELETE FROM messages WHERE session_id = ?
  DELETE FROM rag_chunks (skipped — ephemeral never ingested)
  Storage: delete all audio files at user-audio/{user_id}/{session_id}/
  Sessions row remains with summary='[ephemeral]', no transcript.
```

**Notes:**
- Privacy-first. The user's plan survives; their words don't.
- Useful for sessions about specific people, sensitive content, etc.

---

## Edge cases & expected behaviors

| Situation | Expected behavior |
|---|---|
| User speaks but mic captures only background noise | STT returns near-empty text; UI says "didn't catch that — try again?" |
| User starts speaking, then puts phone down without releasing button | After 60 seconds, recording auto-stops, prompts "still there?" |
| LLM stream stalls mid-reply | After 10s no tokens, abort, show what we have + "let me try again — go on." |
| User has 50+ open tasks accumulated | Mode picker only shows "open from yesterday" (last day), never the full backlog. Hidden via filter. |
| User asks "how many points do I have" | Agent answers honestly, briefly. Does not gamify the answer. |
| User asks "did I do better this week than last" | Agent gently declines comparison — "we don't measure it that way here." |
| User in distress | Agent responds with empathy; grounding hatch is always one tap away. No automatic crisis flow. |
| Network drops mid-turn | UI freezes the last frame, calm message: "let's wait a moment." Auto-reconnect on signal restore. |

---

## What this app is NOT

For team alignment, what this app intentionally is *not*:

- **Not a therapist.** No CBT exercises, no cognitive distortions, no mood tracking, no "how does that make you feel" prompts.
- **Not a productivity coach.** No "you should be doing more," no efficiency framing.
- **Not a diary.** Sessions are not journaling unless the user makes them so.
- **Not a friend.** The agent is a peer for *this specific job* — planning the day. No off-topic chat about hobbies, weather, news.
- **Not a gamified habit tracker.** Points are a quiet aesthetic detail, not the value prop.

If a team member proposes a feature that would push the app into any of these categories, send them back to this doc.
