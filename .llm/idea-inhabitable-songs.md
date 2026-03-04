# Idea Brief: Song Space — Inhabitable Songs

**Problem:** Song Space works but doesn't teach you what it responds to — new users see a webcam and hear music but don't discover the cause-and-effect relationship between their body and the song.

**Solution:** Add edge-triggered dramatic moments (stop → silence, burst → energy) on top of the existing continuous mapping, default to arc mode so every session feels like a song with a journey, and give the UI enough atmosphere that someone wants to stay.

**For whom:** Non-technical friends and family (Gary the jazz bassist, 8-and-12-year-old nieces) who open a link and need to "get it" without instructions.

**Why now:** The engine works. Readings, mappings, arc phases — all built. The gap is expressiveness and polish, not infrastructure. These building blocks (edge-triggered intents, dramatic moments) are exactly what Ralf needs, so building them here is double-duty.

## Key Design Decision: Arc Behavior

The arc is a living composition, not a gate. **The song moves on its own because the composer composed it to move.** If the user doesn't interact, the arc progresses through sections autonomously — different samples come in and out in a way that makes musical sense, and eventually the song ends.

User movement **influences** the arc:
- Sustained energy can stretch/prolong a section
- Stillness might cause an early transition or strip-down
- But the arc never stops and waits — it's always moving forward

This is the fundamental distinction: blender = "the song responds to me," arc = "I'm inside a song that's alive, and I can push and pull it."

Future possibilities: meta-loops (rewinding to previous section), user-composed arcs. Not for v1.

## Simplest Version (MVP)

- Arc as default (remove mode dropdown for new users)
- Arc progresses autonomously; movement influences pacing
- 3 hardcoded edge triggers (stillness-onset → drums drop, movement-burst → energy slam, sustained-energy → advance phase)
- Dark atmospheric dance screen (webcam fills the space, minimal chrome)
- One song, auto-plays on movement

## The Doubt

The "dramatic moment" timing might feel jarring rather than musical. Getting the threshold and response right for stop → silence is a tuning problem. Start with one trigger, nail it, then add more.

## Two Tracks

1. **Interaction model** — edge triggers, arc refinement, simplify modes
2. **Visual design** — atmospheric dance screen, inviting song picker (separate track, after interaction model is solid)

## Ralf Connection

Edge triggers here are a simplified version of Ralf's intent system (readings → intents → actions). Building blocks developed in Song Space can be transported into Ralf's configurable scene format later.

**Ready for `/plan`?** Yes
