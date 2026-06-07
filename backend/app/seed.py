"""One-time curriculum seed, derived from syllabus.md.

Each day's bullets ARE its concepts. Day titles are the short UI forms (matching the
already-approved frontend); concept titles are the full syllabus bullets. IDs follow
the stable scheme the frontend expects: day-NN and c-DD-II.
"""

from .db import get_conn

# (day number, short title, week number, week title, [concept bullets])
CURRICULUM = [
    (1, "Levels of analysis", 1, "Neurons and signaling", [
        "Molecules, cells, circuits, systems, behavior, disorders",
        "Why neuroscience is hard but structured",
        "Why this matters for reading papers",
    ]),
    (2, "Neurons and glia", 1, "Neurons and signaling", [
        "Neuron structure",
        "Dendrites, soma, axon, synapse",
        "Major types of glia",
        "Why glia matter beyond “support cells”",
    ]),
    (3, "Membrane potential", 1, "Neurons and signaling", [
        "Resting membrane potential",
        "Ion gradients",
        "Selective permeability",
        "Why voltage matters in neurons",
    ]),
    (4, "Ion channels and pumps", 1, "Neurons and signaling", [
        "Sodium, potassium, calcium, chloride",
        "Sodium-potassium pump",
        "Ion channels as gates",
        "Why molecular mechanisms shape brain activity",
    ]),
    (5, "Action potentials", 1, "Neurons and signaling", [
        "Depolarization",
        "Repolarization",
        "Threshold",
        "Refractory period",
        "Why action potentials are all-or-none signals",
    ]),
    (6, "Synapses and transmission", 1, "Neurons and signaling", [
        "Presynaptic and postsynaptic neurons",
        "Neurotransmitter release",
        "Receptors",
        "Chemical vs electrical synapses",
    ]),
    (7, "Week 1 review", 1, "Neurons and signaling", [
        "Explain neuron signaling from memory",
        "Review weak concepts",
        "Mini cumulative quiz",
    ]),
    (8, "Excitatory vs inhibitory", 2, "Circuits and brain organization", [
        "EPSPs and IPSPs at a high level",
        "Excitation and inhibition",
        "E/I balance",
        "Why this matters for epilepsy and neurodevelopmental disorders",
    ]),
    (9, "Neurotransmitter systems", 2, "Circuits and brain organization", [
        "Glutamate",
        "GABA",
        "Dopamine",
        "Serotonin",
        "Acetylcholine",
        "Why neurotransmitters are not just “happy chemicals”",
    ]),
    (10, "Neural circuits", 2, "Circuits and brain organization", [
        "Local circuits",
        "Long-range projections",
        "Feedforward and feedback loops",
        "Circuit dysfunction",
    ]),
    (11, "Neuroplasticity", 2, "Circuits and brain organization", [
        "Synaptic plasticity",
        "Hebbian learning",
        "Strengthening and weakening connections",
        "Why learning physically changes the brain",
    ]),
    (12, "Nervous system structure", 2, "Circuits and brain organization", [
        "CNS vs PNS",
        "Brain, spinal cord, nerves",
        "Gray matter and white matter",
        "Why anatomy helps interpret research",
    ]),
    (13, "Major brain regions", 2, "Circuits and brain organization", [
        "Cortex",
        "Thalamus",
        "Hippocampus",
        "Amygdala",
        "Basal ganglia",
        "Cerebellum",
        "Brainstem",
    ]),
    (14, "Week 2 review", 2, "Circuits and brain organization", [
        "Cumulative quiz",
        "Explain synapse to circuit to brain region",
        "Update weak concepts",
    ]),
    (15, "Brain development", 3, "Development, cognition, disorders", [
        "Neurogenesis",
        "Migration",
        "Differentiation",
        "Synapse formation",
        "Developmental timing",
    ]),
    (16, "Critical periods", 3, "Development, cognition, disorders", [
        "Why timing matters",
        "Experience-dependent development",
        "Sensitive periods",
        "Relevance to neurodevelopmental disorders",
    ]),
    (17, "Learning and memory", 3, "Development, cognition, disorders", [
        "Encoding, consolidation, retrieval",
        "Hippocampus and cortex",
        "Short-term vs long-term memory",
        "Why memory is not one thing",
    ]),
    (18, "Attention and executive function", 3, "Development, cognition, disorders", [
        "Attention as selection and control",
        "Prefrontal cortex at a high level",
        "Working memory",
        "Cognitive control",
    ]),
    (19, "Genetics, proteins, and the brain", 3, "Development, cognition, disorders", [
        "Genes and proteins",
        "Gene expression",
        "Mutations",
        "Loss-of-function / gain-of-function at a high level",
        "Why genetic diagnosis matters in ID",
    ]),
    (20, "Intellectual disability and NDDs", 3, "Development, cognition, disorders", [
        "What intellectual disability means clinically",
        "Syndromic vs non-syndromic ID",
        "Developmental mechanisms",
        "Why many papers connect genes, synapses, circuits, and behavior",
    ]),
    (21, "Week 3 review", 3, "Development, cognition, disorders", [
        "Cumulative quiz",
        "Explain gene to protein to synapse to cognition pathway",
        "Identify weak points",
    ]),
    (22, "MRI and fMRI", 4, "Methods, papers, BCI", [
        "Structural MRI",
        "Functional MRI",
        "BOLD signal",
        "What fMRI measures and does not measure",
    ]),
    (23, "EEG and seizures", 4, "Methods, papers, BCI", [
        "Electrical activity",
        "Brain rhythms",
        "Seizures at a high level",
        "Why EEG is useful",
        "Connection to BCI",
    ]),
    (24, "Animal and cell models", 4, "Methods, papers, BCI", [
        "Why models are used",
        "Mouse models",
        "Cell culture",
        "iPSCs",
        "Organoids",
        "Limits of models",
    ]),
    (25, "BCI basics", 4, "Methods, papers, BCI", [
        "Recording brain signals",
        "Decoding intent",
        "Invasive vs non-invasive BCI",
        "Communication support",
        "ML relevance",
    ]),
    (26, "Reading a neuroscience paper", 4, "Methods, papers, BCI", [
        "Abstract, introduction, methods, results, figures, discussion",
        "How to identify the actual claim",
    ]),
    (27, "Guided paper reading", 4, "Methods, papers, BCI", [
        "Pick one beginner-relevant abstract (ID, epilepsy, neurodevelopment, genetics, or BCI)",
        "Break down every major term",
        "Identify background, method, result, and claim",
    ]),
    (28, "Final review and next plan", 4, "Methods, papers, BCI", [
        "Cumulative review",
        "What is now understood",
        "What remains weak",
        "Next 4-week path",
    ]),
]


def seed_if_empty() -> None:
    conn = get_conn()
    try:
        if conn.execute("SELECT COUNT(*) AS n FROM day").fetchone()["n"] > 0:
            return
        with conn:
            for number, title, week, week_title, concepts in CURRICULUM:
                day_id = f"day-{number:02d}"
                conn.execute(
                    "INSERT INTO day(id, number, title, week_number, week_title) VALUES (?,?,?,?,?)",
                    (day_id, number, title, week, week_title),
                )
                for i, concept_title in enumerate(concepts, start=1):
                    conn.execute(
                        "INSERT INTO concept(id, day_id, idx, title) VALUES (?,?,?,?)",
                        (f"c-{number:02d}-{i:02d}", day_id, i, concept_title),
                    )
    finally:
        conn.close()
