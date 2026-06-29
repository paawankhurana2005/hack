"""ReLoop dynamic-pricing ML package (spec 014).

Two moving parts, one job each, NO reinforcement learning:

  XGBoost            — looks at the tabular feature vector and predicts, per price
                       arm, the expected reward. Static once trained; gets smarter
                       only when retrained on more data (~every 500 real transactions).
  Contextual bandit  — looks at XGBoost's predictions and adds exploration (Thompson
                       sampling): occasionally tries a non-optimal arm to gather data
                       in case XGBoost is wrong. A statistician, not an RL agent.

The "learning loop" is supervised learning over a growing dataset: every reprice
decision + its outcome becomes one training row, and periodic retrains compound the
knowledge. Honest, stable, defensible.
"""

__version__ = "0.1.0"
