---
title: "Predicting Chain-of-Thought Resilience with a Linear Probe"
date: "2026-05-18"
---

## TL;DR

- Macar et al.[^1] introduced thought resilience, a metric for how persistent a chain-of-thought (CoT) sentence is. It works by removing the sentence, resampling, then re-removing it wherever it reappears, until no semantically similar sentence comes back. The score is the number of interventions, or the number of times the sentence was removed.
- I wanted to test whether resilience is linearly encoded in the model's residual activations, so that a single forward pass through a linear probe could predict it instead of running ~20 completions.
- I did not replicate Macar's resilience, but measured a related yet distinct quantity. Macar's resilience is a property of a multi-step intervention chain, where each step changes the model's activations. That makes it a poor fit for a probe, which reads one activation from one fixed state. What I actually measured is a simpler, fixed-prefix metric I'll call thought reappearance. For each run, it fixes the preceding sentences, resamples the current one 20 times, and adds 1 each time at least one resample exceeds 0.75 cosine similarity threshold with the original. 
- On clear-cut cases the probe hits ~75% accuracy on average (peaking around 79% at Layer 13), but on the full distribution it drops to ~63%, close to guessing. The signal is real, just not good enough yet to replace resampling.
- Accuracy is the worst at the input layer and rises toward the middle of the network, which might be weak evidence that the probe reads a computed feature rather than surface word patterns.
- Macar et al.[^1] also introduced Counterfactual Importance++, which measures how much a CoT causally drives the final output. That's arguably the metric worth predicting cheaply, and I'd like to explore it next.
- My next steps would be to run a bag-of-words baseline to test for surface features, perform a test on a subset to see if my reappearance metric correlates with Macar's actual resilience, and steer the model along the learned direction to test whether it's causal.

---

## Introduction

Macar et al.[^1] observed that when a reasoning model writes out a CoT, the sentences are not equally important. Some genuinely shape the final answer, while others are ad-hoc explanations the model would swap or skip on a rerun. Telling these apart is useful for understanding how a model reasons, and eventually for deciding which parts of a CoT you can trust as reflecting real computation.

Their paper makes this precise with thought resilience. The idea is to interpret a reasoning model not as producing one CoT, but as defining a distribution over many possible ones. To score a sentence S_i, you truncate the chain just before it and let the model continue from that prefix. If a semantically similar sentence comes back, you remove the CoT starting from the closest match and resample again. You repeat until no similar sentence reappears, and the resilience score is the number of interventions it took. More resilient sentences will have higher scores, and vice versa.

I wanted to know whether thought resilience is linearly encoded in a model's residual activations: whether the model "knows," at the moment it writes a sentence, that the sentence has high importance. If it does, a cheap linear probe over one forward pass could approximate a metric that otherwise costs ~20 completions per sentence.

### What I actually measured (and the mistake behind it)

I initially set out to replicate Macar's resilience and only later realized I'd measured something different. Their metric is sequential because each intervention removes the sentence and resamples, and each step is scored on a different prefix, the one where the sentence in previous version was suppressed. The resilience score is therefore dependent on a chain of interventions across changing activations, not of any single model state.

That's a bad target for a linear probe. A probe reads one activation vector from one fixed prefix. There is no single moment where "survived 4 sequential suppression" lives in the residual stream, because steps 2–4 happen in states the model hasn't reached yet when I measure the score. The target and input don't line up.

What I actually measured is a fixed-prefix variant I'll call thought reappearance. I hold the preceding sentences constant, resample the current sentence 20 times independently, and count how often a resampled sentence clears 0.75 cosine similarity with the original. Every example is scored from the same original prefix, which is the right kind of target for a single-activation probe. It's also easy to parallelize, since the 20 resamples are independent rather than a serial loop.

A skeptic might ask: why not recover the sequential metric for probing by labeling each state along the chain? One resilience run on sentence A produces a sequence of intervention points: A at position i, its reappearance A′ at position j, A″ at position k, dying after 4 steps. Instead of one label per run, collect four examples (A→4, A′→3, A″→2, A‴→1), each paired with the activation at its own position. More data per expensive run, and each example is single-state again.

This introduces a confound. Each successive intervention has a high chance of sitting at a later position in the CoT, so its prefix will be longer, and the descending label (4, 3, 2, 1) naturally ends up correlated with increasing prefix length. A probe could predict the count just by reading the prefix length from the activations, which isn't what we want. The later examples are also off-policy, since states 2–4 only exist because I forcibly suppressed the natural continuation, so they're contexts the model would rarely visit on its own. A probe might not lean on the length of a prefix, but the relabeling scheme creates the confound. However, fixed-prefix reappearance avoids it because every example comes from the same original prefix with no length drift tied to the label. That's why I prefer the fixed-prefix version.

In conclusion, this is not Macar's resilience, but a simpler measure of "given this fixed context, how probable is this thought." I think it's the better-posed quantity for probing, but I haven't verified that the two metrics correlate, so every result below should be read as pertaining to reappearance, not resilience.

## Experiment

The experiment had five stages.

**Dataset Selection.** In my first attempt using GSM8K[^4], almost every sentence scored ≥17 out of 20, which is very high. This was clearly a bad dataset because of the low variance in scores. I needed harder problems for reasoning to show variance, so I switched to OpenMathInstruct-1[^3], giving me a more varied score distribution.

**Generate traces.** I took 35 prompts from OpenMathInstruct-1[^3] and generated 5 completions each with Qwen3-4B[^6] (temperature 0.6, top-p 0.9), giving 175 reasoning chains. Splitting on punctuation produced roughly 7,000 sentences, about 40 per chain.

**Score reappearance.** For each sentence, I rebuilt the prefix, which contains the question plus all reasoning up to but not including that sentence. Then I generated a fresh continuation, and compared each new sentence to the original using cosine similarity from the `all-MiniLM-L6-v2`[^7] embedding model. If any new sentence cleared a 0.75 similarity threshold, the sentence scored a hit. Twenty resamples gave a 0–20 score.

**Extract activations.** Using TransformerLens[^5], I hooked Qwen3-4B's residual stream and, for each sentence, ran a single forward pass over its prefix and grabbed the last-token activation from all 36 layers. That gave 36 matrices of shape (7,000, 2560).

**Train the probes.** Each layer was independently standardized, reduced to 200 PCA components, then fit an L2-regularized logistic regression. Sentences were labeled resilient if they scored ≥5/20. I also built a stricter set of extreme cases (scores 0–3 versus 18–20) to see how cleanly the probe separates the obvious examples.

I split train and test by prompt, not by sentence, making every prompt land on one side of the split. Sentences from the same trace are correlated, so if they leak across the split, test accuracy might be inflated and useless. 

## Results

On the extreme cases, the probe reached about 75% test accuracy averaged across layers, peaking at 79% at Layer 13 with ≈ 0.793 AUC. So reappearance might be linearly readable from a single forward pass, which was an encouraging result. However, once the ambiguous middle scores 4–17 was included, accuracy fell to about 63%, which isn't surprising considering it was trained on extreme cases. 

![Train and test accuracy across all 36 layers of Qwen3-4B](/img/posts/predicting-cot-resilience-linear-probe/layer_acc.png)

Checking the learned direction by projecting sentences onto the probe's direction shows that the least resilient sentences were hedges and second-guessing:
- *"Wait, but just to make sure there's no trick or anything…"*
- *"But maybe the question is a trick question?"*

On the other hand, the most resilient were concrete computation, such as arithmetic, problem setup, and final answers. This lines up with the Thought Anchors work[^2], which found that uncertainty-management steps are the least influential on the final answer. The correlation between true reappearance score and projection onto the direction was r ≈ 0.42, moderate but enough to suggest the direction captures an ordinal property, not just a binary split.

Accuracy was lowest at Layer 0, then rose to a peak in the middle of the network before fluctuating towards the end. Why does that shape matter? The probe might not be reading reappearance, but surface features like hedging vocabulary ("Wait, maybe…") and sentence length. However, if that was the case, the earliest layers should do the best, because lexical information is mostly available in the input. Instead the first layer is the worst, and the signal builds as the model processes the sentence, peaking in the middle third, where transformers tend to carry their most semantically rich representations. That suggests that the probe might be reading something from the model's computations rather than surface features.

The other notable thing is how fluctuating the curve is once you're past the early layers. Unlike refusal[^8], which prior work localizes to a narrow set of middle-layer features, this signal appears smeared across the whole network. That fits the intuition that it's a higher-order property, one that depends on the accumulated state of the entire preceding chain rather than a single localized decision.

## Limitations

**I measured the wrong metric twice.** First, as explained in the introduction, I measured fixed-prefix reappearance, not Macar's sequential resilience. I believe reappearance is better for probing, but I haven't shown the two correlate, so these results don't transfer to resilience without that check. Second, even resilience isn't the metric most worth predicting because it measures how stubborn a thought is, while Counterfactual Importance++ in the same paper[^1] measures how much a sentence causally drives the final answer. A sentence can be stubborn without steering the outcome because the surrounding context forces it. I chose reappearance for the tractability of its scoring, not because it's the most useful target.

**I didn't run the baseline.** The cleanest test of the surface-feature worry is a probe trained on only word counts and sentence length, no activations. If a bag-of-words baseline matches 75%, then the probe was reading lexical features instead of the model's activations.

**Scale and domain.** The experiment was only performed on Qwen3-4B with 35 math prompts, so it might not generalize to other models or domains. The deterministic computation and well-defined intermediate states in math may make the property easier to encode than elsewhere.

**Correlational, not causal.** I show the property is linearly decodable, not that the model causally uses the direction. Without intervening on the residual stream, I can't rule out the probability that the probe uses correlated surface features.

**Unablated threshold.** I didn't ablate the 0.75 cosine threshold, which shapes the label distribution. Varying this threshold changes the distribution of resilience score, affecting the number of resilient and non-resilient sentences. This might also affect the train/test accuracy and layer curve. I will run more experiments to verify this.

## Next steps

In rough order of how much they'd change my confidence:

1. **Correlate reappearance with Macar's actual resilience** on a small subset (~50 sentences). If they correlate at r > 0.8, the metric distinction is academic and the results stand in for resilience. If they don't, that's itself a finding. This is the cheapest thing that resolves the central caveat, so it goes first.
2. **Run the lexical-only baseline** (word counts + sentence length) to quantify how much of the signal is surface.
3. **Probe Counterfactual Importance++**, the metric that more directly tracks causal influence on the output, and the one a safety-relevant tool would actually want.
4. **Steer along the learned direction**: add or subtract it in the residual stream and watch whether later reasoning changes. A positive result is the line between an interesting probe and a lever you can actually pull.
5. **Scale and transfer**: 500–1,000 prompts across MATH, MMLU-Pro, and HumanEval to close the train–test gap, plus identical probes on other models (e.g. LLaMA-3-8B, Mistral-7B) to test whether the direction is general or specific to Qwen.

## Where this leaves things

Reappearance is partly linearly encoded: enough to be worth chasing, not enough to deploy. The 20× speedup that motivated the study doesn't hold yet, since at 63% full-distribution accuracy the probe can't replace resampling. The most defensible near-term framing is narrower: flag *likely-fragile* sentences for targeted resampling, which reduces completions rather than eliminating them. And the headline caveat is the one I'd most want a reader to leave with. I measured a fixed-prefix proxy, not the metric I set out to replicate, and closing that gap is the first thing I'll do next.

The code is [here](https://github.com/Hieuuum/linear-cot). It's a feasibility study with rough edges, and the limitations section is long on purpose.

## References
[^1]: U. Macar, P. C. Bogdan, S. Rajamanoharan, and N. Nanda. Thought Branches: Interpreting LLM Reasoning Requires Resampling. arXiv:2510.27484, 2025. https://arxiv.org/abs/2510.27484
[^2]: P. C. Bogdan, U. Macar, N. Nanda, and A. Conmy. Thought Anchors: Which LLM Reasoning Steps Matter? arXiv:2506.19143, 2025. https://arxiv.org/abs/2506.19143
[^3]: S. Toshniwal, I. Moshkov, S. Narenthiran, D. Gitman, F. Jia, and I. Gitman. OpenMathInstruct-1: A 1.8 Million Math Instruction Tuning Dataset. arXiv:2402.10176, 2024. https://arxiv.org/abs/2402.10176
[^4]: K. Cobbe, V. Kosaraju, M. Bavarian, et al. Training Verifiers to Solve Math Word Problems. arXiv:2110.14168, 2021. https://arxiv.org/abs/2110.14168
[^5]: N. Nanda and J. Bloom. TransformerLens. 2022. https://github.com/TransformerLensOrg/TransformerLens
[^6]: A. Yang, et al. (Qwen Team). Qwen3 Technical Report. arXiv:2505.09388, 2025. https://arxiv.org/abs/2505.09388
[^7]: N. Reimers and I. Gurevych. Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. arXiv:1908.10084, 2019. https://arxiv.org/abs/1908.10084
[^8]: A. Arditi, O. Obeso, A. Syed, D. Paleka, N. Panickssery, W. Gurnee, and N. Nanda. Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717, 2024. https://arxiv.org/abs/2406.11717