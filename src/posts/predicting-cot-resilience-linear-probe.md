---
title: "Predicting Chain-of-Thought Resilience with a Linear Probe"
date: "2026-05-18"
excerpt: "Measuring which reasoning steps matter usually takes 20 model completions per sentence. I tried to read it off the activations in one forward pass. Here's the whole journey — including where it didn't work."
---

## TL;DR

- **The problem:** Measuring how chain-of-thought sentences are likely to appear (a metric called *thought resilience*) needs at least 20 model completions per sentence, which is to expensive.
- **The idea:** Test whether resilience is already encoded in the model's activations, so a single forward pass through a linear probe could replace the 20 completions, massively speeding up the process.
- **The result:** On clear-cut cases the probe hits ~75% accuracy on average (peaking ~79% at Layer 13), but on the full distribution it drops to ~63%, close to guessing. The signal is real but not yet good enough to replace resampling.
- **The interesting part:** Accuracy is worst at the input layer and rises toward the middle of the network. This means the probe might be catching on some linear feature of the model instead of searching for surface word patterns.
- **The honest caveats:** I never ran a bag-of-words baseline to rule out surface features, and I probed *resilience* (how stubborn a thought is) when *counterfactual importance* (how much it drives the answer) is the more useful signal.
- **Next step:** Steer the model along the learned resilience direction and see if its reasoning changes — the test of whether the direction is causal, not just correlated.

---

## The question that started it

When a reasoning model writes out a chain-of-thought, the sentences are not equally important. Some genuinely shape the final answer; others are scaffolding the model would happily swap for something else if it ran again. Telling these apart is useful — for understanding how a model reasons, and eventually for deciding which parts of a chain-of-thought you can trust as reflecting real computation.

Macar et al. made this precise with a metric called **thought resilience**. The idea is to interpret a reasoning model not as producing one chain-of-thought, but as defining a *distribution* over many possible ones. To measure how committed the model is to a given sentence, you truncate the chain just before that sentence, let the model continue from that prefix, and check whether a semantically similar sentence comes back. Do it twenty times and count the reappearances. A sentence that keeps returning is resilient — the model insists on it. One that rarely returns is fragile.

The catch is in that word *twenty*. Scoring one sentence costs twenty completions; scoring a whole trace costs that for every sentence in it. It is a powerful analysis tool and a hopeless live diagnostic — far too slow to run while a model is actually thinking.

So I asked: **is resilience already sitting in the model's activations?** If the model "knows" a sentence is load-bearing the moment it writes it, that information might be encoded in the residual stream, readable with a cheap linear probe. One forward pass instead of twenty completions — a 20× speedup, if the signal is there. This post is the story of finding out.

## A false start (which was still useful)

My first attempt used GSM8K, the standard grade-school math benchmark. It failed immediately, and instructively. Almost every sentence scored near-maximally resilient — most were ≥17 out of 20. There was simply no spread to classify; the labels were nearly all the same. A probe can't learn to separate two classes when one barely exists.

The lesson was that resilience needs *harder* reasoning to show variance. On easy, near-deterministic problems the model has little room to reason differently on resampling, so everything looks resilient. I switched to OpenMathInstruct-1, which has more involved problems, and the score distribution opened up into a usable bimodal shape. A dead pilot that tells you why it died is still a useful pilot.

## Building the pipeline

With the dataset settled, the experiment had four stages.

**Generate traces.** I took 35 prompts from OpenMathInstruct-1 and generated 5 completions each with Qwen3-4B (temperature 0.6, top-*p* 0.9), giving 175 reasoning chains. Splitting on punctuation produced roughly 7,000 sentences, about 40 per chain.

**Score resilience.** For each sentence, I rebuilt the prefix (the question plus all reasoning up to but not including that sentence), generated a fresh continuation, and compared each new sentence to the original using cosine similarity from the `all-MiniLM-L6-v2` embedding model. If any new sentence cleared a 0.75 similarity threshold, the sentence scored a hit. Twenty resamples gave a 0–20 score. (The 0.75 threshold is a design choice I didn't ablate — more on that later.)

**Extract activations.** Using TransformerLens, I hooked Qwen3-4B's residual stream and, for each sentence, ran a single forward pass over its prefix and grabbed the last-token activation from all 36 layers. That gave 36 matrices of shape (≈7,000, 2560).

**Train the probes.** For each layer independently: standardize, reduce to 200 PCA components, then fit an L2-regularized logistic regression. Sentences were labeled resilient if they scored ≥5/20. I also built a stricter set of *extreme* cases — scores 0–3 versus 18–20 — to see how cleanly the probe separates the obvious examples from each other.

One methodological point worth stressing: I split train and test **by prompt**, not by sentence, using `GroupShuffleSplit`. Sentences from the same trace are correlated, so if they leak across the split, test accuracy is inflated and meaningless. Every prompt lands entirely on one side of the split.

## What the probe found

On the **extreme cases** — clearly resilient versus clearly fragile sentences — the probe reached about **75% test accuracy averaged across layers**, peaking at **79% at Layer 13** (AUC ≈ 0.793). Resilience is, at least in part, linearly readable from a single forward pass. That was the encouraging result.

The discouraging one came from the **full distribution**. Once the ambiguous middle (scores 4–17) was included — which is most sentences — accuracy fell to about **63%**, close to a strong majority-class baseline. So the probe can distinguish a clearly load-bearing thought from a clearly disposable one, but it largely can't rank the in-between cases, and the in-between is where most real sentences live. That gap is the difference between "interesting signal" and "usable tool," and right now it lands on the wrong side.

![Train and test accuracy across all 36 layers of Qwen3-4B](/img/posts/predicting-cot-resilience-linear-probe/layer_acc.png)

A check on the learned direction was reassuring, though. Projecting sentences onto the probe's resilience direction, the extremes matched intuition. The least resilient sentences were hedges and second-guessing:

> *"Wait, but just to make sure there's no trick or anything…"*
> *"But maybe the question is a trick question?"*

The most resilient were concrete computation — arithmetic, problem setup, final answers. This lines up with the Thought Anchors work, which found that uncertainty-management steps are the least influential on the final answer. The correlation between true resilience score and projection onto the direction was r ≈ 0.42 — moderate, but enough to suggest the direction captures an ordinal property, not just a binary split.

## The result I didn't expect

Here is the part that stuck with me. The probe worked at roughly every layer — but not *exactly* equally. Accuracy was **lowest at Layer 0**, the representation closest to the raw input tokens (69%), then **rose to a peak in the middle of the network** before flattening out.

Why does that shape matter? Because the obvious objection to this entire experiment is that the probe might not be reading "resilience" at all — it might be reading surface features like hedging vocabulary and sentence length. "Wait, maybe…" is lexically obvious, and a classifier can exploit that without understanding anything deep.

But if surface features were the whole story, the *earliest* layers should do best, because lexical information is most directly available right at the input. Instead the input-adjacent layer is the worst, and the signal *builds* as the model processes the sentence — peaking in the middle third, where transformers tend to carry their most semantically rich representations. That is not proof, but it is a real hint that the probe is picking up something the model computes rather than something it could read off the surface text. The honest word is *hint*, not *verdict*.

The other notable thing about the curve is how flat it is once you're past the early layers. Unlike refusal, which prior work localizes to a narrow set of middle-layer features, resilience appears smeared across the whole network. That fits the intuition that resilience is a higher-order property — it depends on the accumulated state of the entire preceding chain, not on one localized decision.

## What I'd do differently

Two things stand out in hindsight, and both are worth being upfront about.

**I should have run a dumb baseline.** The cleanest way to test the surface-feature worry is to train a probe on *only* word counts and sentence length — no activations at all — and see how close it gets to 75%. If a bag-of-words baseline matches the real probe, most of my signal was lexical and the activation story collapses. I argued around this with the layer curve, but a five-minute baseline would have answered it directly. I didn't run it.

**I may have probed the wrong metric.** Resilience measures how *stubborn* a thought is — how hard it is to keep from reappearing. That is related to, but not the same as, how much a thought *causally drives the final answer*, which is a separate metric (counterfactual importance) in the same body of work. A sentence can be stubborn because the surrounding context overdetermines it, without actually steering the outcome. For most downstream uses, the causal metric is the one you'd really want to predict cheaply. I chose resilience because it had a clean, self-contained scoring algorithm to replicate — the tractable choice, not necessarily the most useful one.

## Where this leaves things

I'm treating this as a feasibility study, not a finding. The honest summary is: resilience is partly linearly encoded — enough to be worth chasing, not enough to deploy. The 20× speedup that motivated the whole thing doesn't hold yet; at 63% full-distribution accuracy the probe can't replace resampling. The most defensible near-term framing is narrower — the probe could flag *likely-fragile* sentences for targeted resampling, cutting the number of completions you need rather than eliminating them.

There are also limits I can't wave away. It's one model (Qwen3-4B), one domain (math), and a small dataset (35 prompts), so I don't know whether any of this generalizes to other models, to code or commonsense reasoning, or to messier domains where resilience might be harder to encode linearly.

The experiment I actually want to run next is **steering**: add or subtract the resilience direction in the residual stream and watch whether the model's later reasoning changes. If it does, the direction isn't merely correlated with resilience — it's part of how the model produces it. That's the line between "an interesting probe" and "a lever you can pull," and it's where I think this gets genuinely useful.

The code is [here](https://github.com/Hieuuum/linear-cot). It's a feasibility study with rough edges, and the limitations section is long on purpose.