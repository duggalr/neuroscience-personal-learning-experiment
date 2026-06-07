# Neuro — Future Wishlist

A running list of things to add to deepen the learning experience. Not committed work, just
the backlog of ideas. Grouped roughly by theme. Rahul's original asks are marked ★.

## Generative, on-the-fly visual learning

- ★ **Diagrams generated on the fly in the chat.** When a concept is spatial or structural
  (a neuron, a circuit, a signaling pathway), have the tutor emit a diagram inline. Options:
  Mermaid (flowcharts/graphs, cheap and text-based), SVG the model draws directly, or a small
  set of parameterized diagram templates the model fills in. Start with Mermaid for
  circuits/pathways since it renders client-side with no extra infra.
- ★ **Interactive simulations generated on the fly in the chat.** e.g. a slider-driven
  Hodgkin-Huxley spike, an integrate-and-fire neuron, a synapse with adjustable weights, a
  diffusion/ion-gradient toy. The model emits a tiny self-contained spec (params + which
  prebuilt sim) or sandboxed JS that renders in an iframe. Huge for intuition on dynamics.
- ★ **Manim short animated videos generated on the fly in the chat.** The model writes a
  Manim scene, a backend worker renders it to mp4, and it streams into the lesson. Best for
  processes that unfold over time (action potential propagation, saltatory conduction, LTP).
  Heaviest lift (render farm / queue), so likely last — but the highest "wow" for hard
  dynamic concepts.

## Adaptivity & mastery (building on what exists)

- **Per-concept difficulty ramp.** Difficulty already scales to recent scores globally; make it
  per-concept too, so acing a concept escalates *its* re-quizzes specifically.
- **Confidence calibration.** Ask "how sure are you?" before revealing answers; surface where
  Rahul is confidently wrong (the most valuable thing to fix).
- **Adaptive next-beat depth.** If quiz/Q&A shows a concept landed, let the tutor compress;
  if it didn't, auto-expand with another angle or analogy before moving on.
- **Misconception library.** Track recurring wrong-answer patterns per topic and have the tutor
  pre-empt them in future lessons.

## Retention & review

- ~~Spaced-review home surface~~ **DONE.** Home now has a "Due for review" section (cards for
  any concept whose review date arrived, at any mastery level), a lightweight 3-question review
  mode that reschedules, expanding intervals (1/3/7/16/35/75/150d, perfect skips a rung), and a
  daily streak. Future polish: a dedicated review-only page, per-card "next due" dates.
- **Cumulative / cross-concept quizzes.** Periodic mixed quizzes that connect ideas across days
  (e.g. levels-of-analysis applied to synaptic transmission).
- **Reactive mascot.** Neo (the neuron) reacts to lesson state today (idle/thinking/happy/sad).
  Extend: celebrate streak milestones, react to quiz scores, idle animations, speech bubbles
  with nudges ("2 reviews due").
- **Cloze deletion notes.** Auto-generate fill-in-the-blank cards from evergreen notes for fast
  active recall.

## Knowledge map & notes

- **Concept mastery overlay on the Concepts view.** Color/score each concept topic by how well
  Rahul has done on its underlying material.
- **Note ↔ concept linking surfaced in lessons.** While learning, show "you have 3 notes related
  to this" with quick links.
- **Let the learner edit/merge notes by hand**, not just accept librarian proposals.
- **Cross-concept note enrichment.** Observed: the librarian currently creates fresh atomic
  notes per concept (0 notes sourced from >1 conversation as of Day 1-2). As coverage grows, it
  should prefer *refining/linking* existing notes across concepts over always adding new ones,
  so a Day 3 lesson deepens a Day 1 note instead of duplicating it. Revisit once more days exist.
- **Show "N notes from this concept" in the lesson** (small strip on the final beat / header
  chip) so the auto-generated notes are visible where the learning happens. Deferred for now.

## Tutor depth

- **Paper-reading mode.** Paste a real paper (or arXiv/PubMed link); the tutor walks it at the
  right level, tying it back to the foundations covered so far. (Directly serves the stated goal.)
- **"Explain at level N" toggle.** Same concept re-explained at molecular / cellular / circuit /
  behavioral level on demand — reinforces the levels-of-analysis backbone.
- **Voice mode** for hands-free Q&A while reading.

## Quality of life

- **Streak / progress richness on home** beyond the day ring (time studied, concepts this week).
- **Export** a concept's notes + conversation to Markdown/PDF.
- **Search across all notes and conversations.**
- **Keyboard navigation** for the deck (←/→ between beats, Enter to continue).
