---
title: "Predicting Chain-of-Thought Resilience with a Linear Probe"
date: "2026-05-18"
excerpt: "Can linear probes detect if models are committed to a CoT?"
---

## TL;DR

- Macar et al.[^1]'s *thought resilience* scores how persistently a CoT sentence reappears after being removed and resampled. I tested whether a linear probe on residual activations could predict it in one forward pass instead of ~20 completions.
- Resilience depends on a chain of interventions, each in a different model state, so no single activation can encode it. I instead measured a fixed-prefix proxy, *thought reappearance*: how often resampling from the same prefix regenerates a similar sentence (cosine > 0.75).
- The probe gets ~75% on clear-cut cases (peak ~79% at layer 13) but ~63% on the full distribution. The signal is real but not yet good enough to replace resampling.
- I'd next like to probe Counterfactual Importance++, also from Macar et al.[^1], which measures how much a sentence causally drives the final answer. It's arguably the more useful metric to predict cheaply.
- On this experiment, I'd still run a bag-of-words baseline to rule out surface features, check whether reappearance tracks Macar's actual resilience, and steer along the probe direction to test whether it's causal.

---

## Introduction

Macar et al.[^1] observed that when a reasoning model writes out a CoT, the sentences are not equally important. Some genuinely shape the final answer, while others are ad-hoc explanations the model would swap or skip on a rerun. Telling these apart is useful for understanding how a model reasons, and eventually for deciding which parts of a CoT you can trust as reflecting real computation.

Their paper makes this precise with thought resilience. The idea is to interpret a reasoning model not as producing one CoT, but as defining a distribution over many possible ones. To score a sentence S_i, you truncate the chain just before it and let the model continue from that prefix. If a semantically similar sentence comes back, you remove the CoT starting from the closest match and resample again. You repeat until no similar sentence reappears, and the resilience score is the number of interventions it took. More resilient sentences will have higher scores, and vice versa.

I wanted to know whether thought resilience is linearly encoded in a model's residual activations: whether the model "knows," at the moment it writes a sentence, that the sentence has high importance. If it does, a cheap linear probe over one forward pass could approximate a metric that otherwise costs ~20 completions per sentence.

### What I actually measured (and the mistake behind it)

I initially set out to replicate Macar's resilience and only later realized I'd measured something different. Their metric is sequential because each intervention removes the sentence and resamples, and each step is scored on a different prefix, the one where the previous version of the sentence was suppressed. The resilience score therefore depends on a chain of interventions across changing activations, not on any single model state.

That's a bad target for a linear probe. A probe reads one activation vector from one fixed prefix. There is no single moment where "survived 4 sequential suppressions" lives in the residual stream, because steps 2–4 happen in states the model hasn't reached yet when I measure the score. The target and input don't line up.

What I actually measured is a fixed-prefix variant I'll call thought reappearance. I hold the preceding sentences constant, generate 20 independent continuations from that prefix, and count how many contain a sentence that clears 0.75 cosine similarity with the original. Every example is scored from the same original prefix, which is the right kind of target for a single-activation probe. It's also easy to parallelize, since the 20 resamples are independent rather than a serial loop.

A skeptic might ask: why not keep the sequential metric and label each state along the chain? A run on sentence A that dies after 4 interventions would yield four examples (A→4, A′→3, A″→2, A‴→1), each paired with the activation at its own position. The problem is that later interventions tend to sit later in the CoT, so the descending label would correlate with increasing prefix length, and a probe could predict the count by reading length alone. Those later states are also off-policy, since they only exist because I suppressed the natural continuation. Fixed-prefix reappearance avoids both problems because every example is scored from the original prefix.

In conclusion, this is not Macar's resilience, but a simpler measure of "given this fixed context, how probable is this thought." I think it's the better-posed quantity for probing, but I haven't verified that the two metrics correlate, so every result below should be read as pertaining to reappearance, not resilience.

## Experiment

The experiment had five stages.

**Dataset selection.** In my first attempt using GSM8K[^4], almost every sentence scored ≥17 out of 20, which left too little variance to learn from. I needed harder problems for reasoning to show variance, so I switched to OpenMathInstruct-1[^3], giving me a more varied score distribution.

**Generate traces.** I took 35 prompts from OpenMathInstruct-1[^3] and generated 5 completions each with Qwen3-4B[^6] (temperature 0.6, top-p 0.9), giving 175 reasoning chains. Splitting on punctuation produced roughly 7,000 sentences, about 40 per chain.

**Score reappearance.** For each sentence, I rebuilt the prefix, which contains the question plus all reasoning up to but not including that sentence. Then I generated 20 fresh continuations and compared each sentence in them to the original using cosine similarity from the `all-MiniLM-L6-v2`[^7] embedding model. A continuation counted as a hit if any of its sentences cleared a 0.75 similarity threshold, giving a 0–20 score.

**Extract activations.** Using TransformerLens[^5], I hooked Qwen3-4B's residual stream and, for each sentence, ran a single forward pass over its prefix and grabbed the last-token activation from all 36 layers. That gave 36 matrices of shape (7,000, 2560).

**Train the probes.** Each layer was independently standardized, reduced to 200 PCA components, then fit an L2-regularized logistic regression. I trained the probes on a strict set of extreme cases (scores 0–3 versus 18–20) to see how cleanly they separate the obvious examples. I then also evaluated them on the full distribution, where a sentence counts as high-reappearance if it scored ≥5/20.

I split train and test by prompt, not by sentence, making every prompt land on one side of the split. Sentences from the same trace are correlated, so if they leak across the split, test accuracy might be inflated and useless.

## Results

On the extreme cases, the probe reached about 75% test accuracy averaged across layers, peaking at 79% at Layer 13. So reappearance might be linearly readable from a single forward pass, which was an encouraging result. Train accuracy averaged about 83%, an ~8-point gap over test that suggests some overfitting with only 35 prompts. On the full distribution, including the ambiguous middle scores 4–17, accuracy fell to about 63%, which isn't surprising since the probe was trained only on extreme cases.

![Train and test accuracy across all 36 layers of Qwen3-4B](/images/posts/predicting-cot-resilience-linear-probe/layer_acc.png)

Checking the learned direction by projecting sentences onto the probe's direction shows that the lowest-reappearance sentences were hedges and second-guessing:
- *"Wait, but just to make sure there's no trick or anything…"*
- *"But maybe the question is a trick question?"*

On the other hand, the highest-reappearance sentences tended to be concrete arithmetic computations, problem setup, and final answers. This lines up with the Thought Anchors work[^2], which found that uncertainty-management steps are the least influential on the final answer. The correlation between true reappearance score and projection onto the direction was r ≈ 0.42, moderate but enough to suggest the direction captures an ordinal property, not just a binary split.

Test accuracy was lowest at Layer 0 (69%), rose to about 75% by Layer 2, and stayed roughly flat after that apart from a bump around Layers 13–15. I first read this shape as evidence that the probe picks up something the model computes rather than surface features like hedging vocabulary ("Wait, maybe…") or sentence length. That argument is weak. Layer 0 has had at most one attention layer to pull in context, so it should do worst no matter what the probe is reading. And the fact that Layer 0 already reaches 69% suggests a good part of the signal may be shallow. Only the bag-of-words baseline (see Limitations) can settle this.

The curve also fluctuates past the early layers, but I wouldn't read much into that. The test set comes from a small number of held-out prompts, so a swing of a few points between layers is within noise. Whether the signal is localized to a narrow set of layers, as prior work found for refusal[^8], or spread across the network needs error bars from repeated prompt splits.

## Limitations

**Not the metric I set out to measure.** First, as explained in the introduction, I measured fixed-prefix reappearance, not Macar's sequential resilience. I believe reappearance is better for probing, but I haven't shown the two correlate, so these results don't transfer to resilience without that check. Second, even resilience isn't the metric most worth predicting because it measures how stubborn a thought is, while Counterfactual Importance++ in the same paper[^1] measures how much a sentence causally drives the final answer. A sentence can be stubborn without steering the outcome because the surrounding context forces it. I chose reappearance for the tractability of its scoring, not because it's the most useful target.

**No baseline.** The cleanest test for the surface-feature worry is a probe trained on only word counts and sentence length, no activations. If a bag-of-words baseline matches 75%, then the probe may have been reading lexical features instead of the model's activations.

**Scale and domain.** The experiment was only performed on Qwen3-4B with 35 math prompts, so it might not generalize to other models or domains. The deterministic computation and well-defined intermediate states in math may make the property easier to encode than elsewhere.

**The probe is correlational, not causal.** I show the property is linearly decodable, not that the model causally uses the direction. Without intervening on the residual stream, I can't rule out the possibility that the probe uses correlated surface features.

**Unablated cosine threshold.** I didn't ablate the 0.75 cosine threshold, which shapes the label distribution. Varying this threshold changes the distribution of reappearance scores, affecting the number of high- and low-reappearance sentences. This might also affect the train/test accuracy and layer curve.

## Next steps

The next thing I'd like to try is probing Counterfactual Importance++, the metric that more directly tracks causal influence on the output, and the more useful one for safety-relevant tools.

For this experiment, in rough order of how much they'd change my confidence:

1. **Correlate reappearance with Macar's actual resilience** on a small subset of ~50 sentences. If they correlate at r > 0.8, the results may hold for resilience. If they don't, that in itself is a finding.
2. **Run the lexical-only baseline** (word counts + sentence length) to quantify how much of the signal is surface.
3. **Rerun the experiment with varying cosine thresholds** to see how they affect the reappearance score distribution.
4. **Steer along the learned direction** by adding or subtracting it in the residual stream and watch whether later reasoning changes.
5. **Scale and transfer**: 500–1,000 prompts across MATH, MMLU-Pro, and HumanEval to close the train–test gap and get error bars across prompt splits, plus identical probes on other models (e.g. LLaMA-3-8B, Mistral-7B, Qwen3-30B-A3B) to test whether the direction is general or specific to Qwen3-4B.

The code can be found [here](https://github.com/Hieuuum/linear-cot).

[^1]: U. Macar, P. C. Bogdan, S. Rajamanoharan, and N. Nanda. Thought Branches: Interpreting LLM Reasoning Requires Resampling. arXiv:2510.27484, 2025. https://arxiv.org/abs/2510.27484
[^2]: P. C. Bogdan, U. Macar, N. Nanda, and A. Conmy. Thought Anchors: Which LLM Reasoning Steps Matter? arXiv:2506.19143, 2025. https://arxiv.org/abs/2506.19143
[^3]: S. Toshniwal, I. Moshkov, S. Narenthiran, D. Gitman, F. Jia, and I. Gitman. OpenMathInstruct-1: A 1.8 Million Math Instruction Tuning Dataset. arXiv:2402.10176, 2024. https://arxiv.org/abs/2402.10176
[^4]: K. Cobbe, V. Kosaraju, M. Bavarian, et al. Training Verifiers to Solve Math Word Problems. arXiv:2110.14168, 2021. https://arxiv.org/abs/2110.14168
[^5]: N. Nanda and J. Bloom. TransformerLens. 2022. https://github.com/TransformerLensOrg/TransformerLens
[^6]: A. Yang, et al. (Qwen Team). Qwen3 Technical Report. arXiv:2505.09388, 2025. https://arxiv.org/abs/2505.09388
[^7]: N. Reimers and I. Gurevych. Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. arXiv:1908.10084, 2019. https://arxiv.org/abs/1908.10084
[^8]: A. Arditi, O. Obeso, A. Syed, D. Paleka, N. Panickssery, W. Gurnee, and N. Nanda. Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717, 2024. https://arxiv.org/abs/2406.11717