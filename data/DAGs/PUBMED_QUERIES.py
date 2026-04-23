# 1. Core Strength Training
Q_BASE_STRENGTH = """
(
  "Resistance Training"[MeSH] OR
  "Weight Lifting"[MeSH] OR
  "Exercise"[MeSH] OR
  "strength training" OR
  "resistance training" OR
  "weight training"
)
"""


# 2. Muscle Growth / Hypertrophy
Q_HYPERTROPHY = """
(
  "Muscle Hypertrophy"[MeSH] OR
  hypertrophy OR
  "muscle growth" OR
  "muscle thickness" OR
  "cross-sectional area" OR
  "lean mass"
)
AND
(
  "Resistance Training"[MeSH] OR
  "strength training" OR
  "weight training"
)
"""


# 3. EMG / Muscle Activation
Q_EMG = """
(
  "Electromyography"[MeSH] OR
  electromyography OR
  EMG OR
  "muscle activation"
)
AND
(
  "Resistance Training"[MeSH] OR
  exercise OR
  "weight training"
)
"""


# 4. Biomechanics
Q_BIOMECHANICS = """
(
  biomechanics OR
  kinematics OR
  kinetics OR
  "range of motion" OR
  "joint angle"
)
AND
(
  exercise OR
  "resistance training"
)
"""


# 5. Fat Loss / Body Composition
Q_FAT_LOSS = """
(
  "Weight Loss"[MeSH] OR
  "Body Composition"[MeSH] OR
  "fat loss" OR
  "fat mass" OR
  adiposity OR
  "body fat"
)
AND
(
  exercise OR
  "resistance training" OR
  diet
)
"""


# 6. Nutrition for Muscle Growth
Q_NUTRITION_MUSCLE = """
(
  "Diet"[MeSH] OR
  "Nutrition"[MeSH] OR
  "protein intake" OR
  "dietary protein" OR
  "energy intake" OR
  calories OR
  macronutrients
)
AND
(
  "muscle hypertrophy" OR
  "muscle growth" OR
  "lean mass"
)
"""


# 7. Nutrition for Fat Loss
Q_NUTRITION_FAT_LOSS = """
(
  "Diet"[MeSH] OR
  nutrition OR
  "caloric deficit" OR
  calories OR
  "energy restriction"
)
AND
(
  "weight loss" OR
  "fat loss" OR
  "body fat"
)
"""


# 8. Strength + Hypertrophy
Q_STRENGTH_HYPERTROPHY = """
(
  "Resistance Training"[MeSH] OR
  "strength training" OR
  "weight training"
)
AND
(
  hypertrophy OR
  "muscle growth" OR
  "lean mass"
)
"""


# 9. Muscle Groups
Q_MUSCLE_GROUPS = """
(
  biceps OR "biceps brachii" OR
  triceps OR "triceps brachii" OR
  quadriceps OR quads OR
  hamstrings OR
  "latissimus dorsi" OR back OR
  pectoralis OR chest OR
  deltoid OR shoulder OR
  glutes OR "gluteus maximus"
)
AND
(
  exercise OR
  "resistance training"
)
"""


# 10. Exercise Comparisons
Q_EXERCISE_COMPARISON = """
(
  exercise OR
  "resistance training"
)
AND
(
  comparison OR
  vs OR
  versus OR
  "different exercises" OR
  "exercise variation"
)
AND
(
  EMG OR
  hypertrophy OR
  "muscle activation"
)
"""


# 11. Injury / Rehab
Q_INJURY_REHAB = """
(
  "Wounds and Injuries"[MeSH] OR
  injury OR
  injuries OR
  rehabilitation OR
  "physical therapy"
)
AND
(
  exercise OR
  "resistance training"
)
"""


# 12. Joint-Specific Injury
Q_JOINT_INJURY = """
(
  knee OR shoulder OR hip OR elbow OR "lower back"
)
AND
(
  injury OR rehabilitation
)
AND
(
  exercise OR
  "strength training"
)
"""


# 13. PCOS
Q_PCOS = """
(
  "Polycystic Ovary Syndrome"[MeSH] OR
  PCOS
)
AND
(
  diet OR
  nutrition OR
  exercise OR
  "weight loss"
)
"""


# 14. Endometriosis
Q_ENDOMETRIOSIS = """
(
  "Endometriosis"[MeSH] OR
  endometriosis
)
AND
(
  diet OR
  nutrition OR
  exercise OR
  inflammation
)
"""


# 15. General Health
Q_GENERAL_HEALTH = """
(
  exercise OR
  "physical activity" OR
  "resistance training"
)
AND
(
  health OR
  "mental health" OR
  wellbeing OR
  "quality of life"
)
"""


# 16. Cardio / HIIT
Q_CARDIO = """
(
  HIIT OR
  "high intensity interval training" OR
  cardio OR
  aerobic
)
AND
(
  "fat loss" OR
  "cardiovascular fitness" OR
  VO2 OR
  endurance
)
"""


# 17. Strength vs Hypertrophy Protocols
Q_STRENGTH_VS_HYPERTROPHY = """
(
  "resistance training"
)
AND
(
  strength OR
  hypertrophy
)
AND
(
  "training program" OR
  protocol OR
  volume OR
  intensity
)
"""

'''
pubmed docs indicate search queries should be seperated and made with tags such as [MeSH] for semantic intent, and [tiab] for keyword matching
'''

QUERIES = [
    Q_BASE_STRENGTH,
    Q_HYPERTROPHY,
    Q_EMG,
    Q_BIOMECHANICS,
    Q_FAT_LOSS,
    Q_NUTRITION_MUSCLE,
    Q_NUTRITION_FAT_LOSS,
    Q_STRENGTH_HYPERTROPHY,
    Q_MUSCLE_GROUPS,
    Q_EXERCISE_COMPARISON,
    Q_INJURY_REHAB,
    Q_JOINT_INJURY,
    Q_PCOS,
    Q_ENDOMETRIOSIS,
    Q_GENERAL_HEALTH,
    Q_CARDIO,
    Q_STRENGTH_VS_HYPERTROPHY
]