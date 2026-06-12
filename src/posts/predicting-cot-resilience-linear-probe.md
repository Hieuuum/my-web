---
title: "Predicting Chain-of-Thought Resilience with a Linear Probe"
date: "2026-05-18"
---

## TL;DR

- Macar et al.[^1] introduced **thought resilience**, a metric for how persistent a chain-of-thought (CoT) sentence is. It works by repeatedly intervening: removing the sentence, resampling, then re-removing it wherever it reappears, until no semantically similar sentence comes back. The score is the number of interventions a sentence survives.
- I wanted to test whether resilience is **linearly encoded in the model's residual activations**, so that a single forward pass through a linear probe could predict it instead of running ~20 completions.
- I have to admit a mistake up front. Macar's resilience is a property of a multi-step intervention chain, where each step changes the model's activations. That makes it a poor fit for a probe, which reads one activation from one fixed state. What I actually measured is a simpler, fixed-prefix metric I'll call **thought reappearance**: fix the preceding sentences, resample the current one 20 times, and add 1 each time at least one resample clears 0.75 cosine similarity with the original. So I did not replicate Macar's resilience. I measured a related but distinct quantity.
- On clear-cut cases the probe hits ~75% accuracy on average (peaking around 79% at Layer 13), but on the full distribution it drops to ~63%, close to guessing. The signal is real, just not good enough yet to replace resampling.
- Accuracy is worst at the input layer and rises toward the middle of the network, which is weak evidence that the probe reads a computed feature rather than surface word patterns.
- Macar et al.[^1] also introduced Counterfactual Importance++, which measures how much a CoT *causally drives* the final output. That's arguably the metric worth predicting cheaply, and I'd like to explore it next.
- Next steps: run a bag-of-words baseline to test for surface features; correlate my reappearance metric against Macar's actual resilience on a subset to see whether the distinction even matters; and steer the model along the learned direction to test whether it's causal.

---

## Introduction

Macar et al.[^1] observed that when a reasoning model writes out a CoT, the sentences are not equally important. Some genuinely shape the final answer; others are ad-hoc explanations the model would happily swap or skip on a rerun. Telling these apart is useful for understanding how a model reasons, and eventually for deciding which parts of a CoT you can trust as reflecting real computation.

Their paper makes this precise with **thought resilience**. The idea is to interpret a reasoning model not as producing one CoT, but as defining a distribution over many possible ones. To score a sentence S_i, you truncate the chain just before it and let the model continue from that prefix. If a semantically similar sentence comes back, you remove the CoT starting from the closest match and resample again. You repeat until no similar sentence reappears, and the resilience score is the number of interventions it took. A sentence that keeps returning is resilient; one that rarely returns is fragile.

I wanted to know whether thought resilience is **linearly encoded in a model's residual activations**: whether the model "knows," at the moment it writes a sentence, that the sentence is load-bearing. If it does, a cheap linear probe over one forward pass could approximate a metric that otherwise costs ~20 completions per sentence. That's a roughly 20× speedup, and the difference between an offline analysis tool and a live diagnostic.

### What I actually measured (and the mistake behind it)

Here's the honest part. I set out to replicate Macar's resilience and only later realized I'd measured something different. Their metric is sequential: each intervention removes the sentence and resamples, and each step is scored on a *different* prefix, the one where the previous version was suppressed. The resilience score is therefore a property of a whole chain of interventions across *changing* activations, not of any single model state.

That's a bad target for a linear probe. A probe reads one activation vector from one fixed prefix. There is no single moment where "survived 4 sequential suppressions" lives in the residual stream, because steps 2–4 happen in states the model hasn't reached yet when I take my reading. Target and input don't line up.

What I actually measured is a fixed-prefix variant I'll call **thought reappearance**: I hold the preceding sentences constant, resample the current sentence 20 independent times, and count how often a resampled sentence clears 0.75 cosine similarity with the original. Every example is scored from the *same* original prefix (exactly one model state), which is the right kind of target for a single-activation probe. It's also trivially parallelizable, since the 20 resamples are independent rather than a serial loop.

So to be clear: this is not Macar's resilience. It's a simpler measure of "given this fixed context, how probable is this thought." I think it's the better-posed quantity for probing, but I haven't verified that the two metrics correlate, so every result below should be read as pertaining to reappearance, not resilience.

### One tempting fix that doesn't work

A skeptic might ask: why not recover the sequential metric for probing by labeling each state along the chain? One resilience run on sentence A produces a sequence of intervention points: A at position *i*, its reappearance A′ at position *j*, A″ at position *k*, dying after 4 steps. Instead of one label per run, harvest four examples (A→4, A′→3, A″→2, A‴→1), each paired with the activation at its own position. More data per expensive run, and each example is single-state again.

This introduces a confound. Each successive intervention sits at a *later* position in the CoT, so its prefix is longer, and the descending label (4, 3, 2, 1) ends up correlated with increasing prefix length almost by construction. A probe could "predict" the count just by reading prefix length out of the activation: right answer, wrong reason. The later examples are also off-policy, since states 2–4 only exist because I forcibly suppressed the natural continuation, so they're contexts the model would rarely visit on its own. I can't *prove* a probe would lean on the length shortcut (it might not), but the relabeling scheme creates the confound, while fixed-prefix reappearance avoids it: every example comes from the same original prefix with no systematic length drift tied to the label. That's part of why I prefer the fixed-prefix version.

The catch in all of this is still that word *twenty*. Scoring one sentence costs twenty completions; scoring a whole trace costs that for every sentence in it. Great as an offline tool, hopeless as a live diagnostic. So the question stands: is this signal already sitting in the activations, readable in a single pass? This post is the story of finding out.

## A false start (which was still useful)

My first attempt used GSM8K, the standard grade-school math benchmark. It failed immediately, and instructively. Almost every sentence scored near-maximally, most ≥17 out of 20. There was no spread to classify; the labels were nearly all the same, and a probe can't separate two classes when one barely exists.

The lesson: reappearance needs *harder* reasoning to show variance. On easy, near-deterministic problems the model has little room to reason differently on resampling, so everything looks resilient. I switched to OpenMathInstruct-1, which has more involved problems, and the score distribution opened up into a usable bimodal shape. A dead pilot that tells you why it died is still a useful pilot.

## Building the pipeline

With the dataset settled, the experiment had four stages.

**Generate traces.** I took 35 prompts from OpenMathInstruct-1 and generated 5 completions each with Qwen3-4B (temperature 0.6, top-*p* 0.9), giving 175 reasoning chains. Splitting on punctuation produced roughly 7,000 sentences, about 40 per chain.

**Score reappearance.** For each sentence, I rebuilt the prefix (the question plus all reasoning up to but not including that sentence), generated a fresh continuation, and compared each new sentence to the original using cosine similarity from the `all-MiniLM-L6-v2` embedding model. If any new sentence cleared a 0.75 similarity threshold, the sentence scored a hit. Twenty resamples gave a 0–20 score. (The 0.75 threshold is a design choice I didn't ablate, more on that later.)

**Extract activations.** Using TransformerLens, I hooked Qwen3-4B's residual stream and, for each sentence, ran a single forward pass over its prefix and grabbed the last-token activation from all 36 layers. That gave 36 matrices of shape (≈7,000, 2560).

**Train the probes.** For each layer independently: standardize, reduce to 200 PCA components, then fit an L2-regularized logistic regression. Sentences were labeled resilient if they scored ≥5/20. I also built a stricter set of *extreme* cases (scores 0–3 versus 18–20) to see how cleanly the probe separates the obvious examples.

One methodological point worth stressing: I split train and test *by prompt*, not by sentence, using `GroupShuffleSplit`. Sentences from the same trace are correlated, so if they leak across the split, test accuracy is inflated and meaningless. Every prompt lands entirely on one side of the split.

## What the probe found

On the extreme cases (clearly resilient versus clearly fragile sentences), the probe reached about 75% test accuracy averaged across layers, peaking at 79% at Layer 13 (AUC ≈ 0.793). So reappearance is, at least in part, linearly readable from a single forward pass. That was the encouraging result.

The discouraging one came from the full distribution. Once the ambiguous middle (scores 4–17) was included, which is most sentences, accuracy fell to about 63%, close to a strong majority-class baseline. So the probe can tell a clearly load-bearing thought from a clearly disposable one, but it mostly can't rank the in-between cases, and the in-between is where most real sentences live. That gap is the difference between an interesting signal and a usable tool, and right now it lands on the wrong side.

![Train and test accuracy across all 36 layers of Qwen3-4B](/img/posts/predicting-cot-resilience-linear-probe/layer_acc.png)

A check on the learned direction was reassuring. Projecting sentences onto the probe's direction, the extremes matched intuition. The least resilient sentences were hedges and second-guessing:

> *"Wait, but just to make sure there's no trick or anything…"*
> *"But maybe the question is a trick question?"*

The most resilient were concrete computation: arithmetic, problem setup, final answers. This lines up with the Thought Anchors work, which found that uncertainty-management steps are the least influential on the final answer. The correlation between true reappearance score and projection onto the direction was r ≈ 0.42, moderate but enough to suggest the direction captures an ordinal property, not just a binary split.

## The result I didn't expect

The part that stuck with me: the probe worked at roughly every layer, but not *exactly* equally. Accuracy was lowest at Layer 0, the representation closest to the raw input tokens (69%), then rose to a peak in the middle of the network before flattening out.

Why does that shape matter? The obvious objection to this whole experiment is that the probe might not be reading "reappearance" at all. It might be reading surface features like hedging vocabulary and sentence length. "Wait, maybe…" is lexically obvious, and a classifier can exploit that without understanding anything deep.

But if surface features were the whole story, the *earliest* layers should do best, because lexical information is most directly available right at the input. Instead the input-adjacent layer is the worst, and the signal *builds* as the model processes the sentence, peaking in the middle third, where transformers tend to carry their most semantically rich representations. That's not proof, but it's a real hint that the probe is reading something the model computes rather than something it could read off the surface text. The honest word is *hint*, not *verdict*.

The other notable thing is how flat the curve is once you're past the early layers. Unlike refusal, which prior work localizes to a narrow set of middle-layer features, this signal appears smeared across the whole network. That fits the intuition that it's a higher-order property, one that depends on the accumulated state of the entire preceding chain rather than a single localized decision.

## Limitations

I'm treating this as a feasibility study, not a finding. The honest constraints:

**I measured the wrong metric, twice over.** First, as explained in the introduction, I measured fixed-prefix *reappearance*, not Macar's sequential *resilience*. I believe reappearance is better-posed for probing, but I haven't shown the two correlate, so these results don't transfer to resilience without that check. Second, even resilience isn't the metric most worth predicting: it measures how *stubborn* a thought is, not how much it *causally drives* the final answer (Counterfactual Importance++ in the same paper). A sentence can be stubborn because the surrounding context overdetermines it, without steering the outcome. I chose reappearance for the tractability of its scoring, not because it's the most useful target.

**I didn't run the dumb baseline.** The cleanest test of the surface-feature worry is a probe trained on *only* word counts and sentence length, no activations. If a bag-of-words baseline matches 75%, most of my signal was lexical and the activation story collapses. The layer curve argues around this; a five-minute baseline would settle it directly. I didn't run it.

**Scale and domain.** One model (Qwen3-4B), one domain (math), 35 prompts. I don't know whether any of this generalizes to other models, to code or commonsense reasoning, or to messier domains where the signal might be harder to encode linearly. Math is also unusually clean (deterministic computation, well-defined intermediate states), which may make the property easier to encode than elsewhere.

**Correlational, not causal.** I show the property is linearly *decodable*, not that the model causally *uses* the direction. Without intervening on the residual stream, I can't rule out that the probe rides on correlated surface features.

**Unablated threshold.** The 0.75 cosine threshold shapes the label distribution and I didn't ablate it.

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