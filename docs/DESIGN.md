# Design log

## Product decisions (agreed)

| Decision | Choice |
|---|---|
| Efficacy score | 50% habit completion + 50% plan completion (falls back to whichever exists) |
| Unfinished plans | Can be carried forward; still requires a reason; "moved N×" counter |
| Day cutoff | 2 am |
| Streaks | Strict — every habit, every day |
| Platform | Mobile-first web app (PWA) first; native app later |
| Storage | Local on device for v1 |

## Core loop

1. **Habits** — fixed daily non-negotiables, each with an optional trigger ("After I…") and tiny version.
2. **Plans** — today's / tomorrow's intentions. Max 3 must-dos recommended.
3. **Close the loop** — tick (done) or cross (missed + reason). Score updates live.
4. **Evening** (7 pm → 2 am) — prompt to plan tomorrow; tiny habit versions surface.
5. **Next day** — any unresolved items from previous days appear in "Close the loop".

## Behavioural science behind each feature

| Feature | Principle | Source |
|---|---|---|
| "After I…, I will…" habit triggers | Implementation intentions | Gollwitzer & Sheeran (2006), meta-analysis of 94 studies |
| Tiny version for hard days | Behaviour = motivation × ability × prompt; shrink the behaviour | Fogg, *Tiny Habits* (2019) |
| Plan tomorrow tonight | Writing a to-do list before bed reduced time to fall asleep | Scullin et al. (2018), *J. Exp. Psychology: General* |
| Plan tomorrow tonight | Making a plan for unfinished goals reduces intrusive thoughts | Masicampo & Baumeister (2011) |
| Max 3 must-dos + overplanning warning | Planning fallacy | Kahneman & Tversky (1979); Buehler, Griffin & Ross (1994) |
| Rings + "N left — you're close" copy | Goal-gradient effect | Hull (1932); Kivetz, Urminsky & Zheng (2006) |
| Celebrations on completion | Immediate positive emotion wires habits | Fogg, *Tiny Habits* |
| Small wins visible every day | Progress principle | Amabile & Kramer (2011) |
| Required reason for misses + non-judgmental tone | Self-compassion increases motivation to improve after failure | Breines & Chen (2012) |
| "Next time, I will…" after a miss | Coping planning | Sniehotta, Scholz & Schwarzer (2005) |
| Consistency heatmap | "Don't break the chain" visual commitment | Popular practice (Seinfeld method) |
| Monday / 1st-of-month banner | Fresh-start effect | Dai, Milkman & Riis (2014) |
| Habit formation expectations | Median ~66 days to automaticity | Lally et al. (2010) |

Note: the user chose **strict streaks**. Research (Lally et al., 2010) suggests single misses don't harm long-term habit formation, so the app keeps the tone supportive and offers tiny versions to protect the streak.

## Visual language

- Minimal, premium: near-black (#0A0A0C) dark theme, warm off-white light theme.
- Accent per domain: Habits = mint, Plans = iris, Misses = coral, Streak = gold.
- Inter variable font, tight tracking on large numerals, tabular figures.
- Spring physics for all motion; respects `prefers-reduced-motion`.
- Bottom glass tab bar, bottom sheets with drag handle, swipe gestures on rows.

## Roadmap ideas

- Push reminders (habit trigger times, evening planning nudge) via Web Push.
- Cloud sync + accounts, then a native app (React Native / Expo can reuse the logic in `src/lib`).
- Weekly review screen (Sunday): wins, top miss reasons, one experiment for next week.
- Export / import data.
