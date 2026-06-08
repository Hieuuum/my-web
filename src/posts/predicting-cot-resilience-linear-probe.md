---
title: "Predicting Chain-of-Thought Resilience with a Linear Probe"
date: "2026-02-04"
excerpt: "I tried to predict chain-of-thought resilience with a linear probe instead of resampling a model 20 times. It half-worked — and the way it half-worked is the interesting part."
---

## TL;DR

- **The problem:** Measuring which chain-of-thought sentences are "load-bearing" (a metric called *thought resilience*) needs ~20 model completions per sentence — too slow to use live.
- **The idea:** Test whether resilience is already encoded in the model's activations, so a single forward pass + a linear probe could replace the 20 completions (a 20× speedup).
- **The result:** On clear-cut cases the probe hits ~75% accuracy on average (peaking ~79% at Layer 13), but on the full distribution it drops to ~63% — close to guessing. The signal is real but not yet good enough to replace resampling.
- **The interesting part:** Accuracy is *worst* at the input layer and rises toward the middle of the network. If the probe were just reading surface features like hedging words, the earliest layers should do best — so this is a hint (not proof) that it's reading something the model actually computes.
- **What I'd fix:** I never ran a bag-of-words baseline to rule out surface features, and I probed *resilience* (how stubborn a thought is) when *counterfactual importance* (how much it drives the answer) is the more useful safety signal.
- **Next step:** Steer the model along the learned resilience direction and see if its reasoning changes — the test of whether the direction is causal, not just correlated.

---

When a reasoning model writes out a chain-of-thought, not every sentence carries the same weight. Some steps are doing real work; others are filler the model would happily replace with something else if you let it try again. A recent line of work from Macar et al. makes this precise with a metric called **thought resilience**: take a sentence, delete everything after it, let the model continue from that point, and see how often a semantically similar sentence comes back. Do that twenty times and count the reappearances. A sentence that keeps showing up is resilient. One that rarely does is fragile.

The catch is in that word *twenty*. Scoring a single sentence means generating twenty completions. Scoring a whole reasoning trace means doing that for every sentence in it. It's a great research tool and a terrible live diagnostic — far too slow to run while a model is actually thinking.

So I asked a simple question: **is resilience already sitting in the model's activations?** If the model "knows" a sentence is load-bearing at the moment it writes it, maybe that information is encoded in the residual stream and I could read it off with a cheap linear probe — one forward pass instead of twenty completions. A 20× speedup, if it works.

This post is about how that turned out. Short version: the signal is real but not strong enough to deploy, and the *shape* of the result taught me more than the headline number did.

## Setting it up

I used Qwen3-4B on math reasoning prompts from OpenMathInstruct-1. (I started on GSM8K and abandoned it — almost every sentence scored near-maximally resilient, so there was nothing to classify. A dead pilot is still a useful pilot.)

The pipeline was straightforward:

- Generate reasoning traces, split them into ~7,000 sentences.
- Score each sentence's resilience by the resampling method above (the expensive part).
- Pull the residual-stream activation for each sentence from all 36 layers using TransformerLens.
- Train a linear probe per layer to predict resilient vs. fragile from the activation.

One detail I'd flag for anyone doing this: split your train/test sets **by prompt**, not by sentence. Sentences from the same trace are correlated, so if they leak across the split your test accuracy is fiction. I used `GroupShuffleSplit` so every prompt lands entirely on one side.

## What happened

On the clear-cut cases — the sentences that are *very* resilient or *very* fragile — the probe hit about **75% test accuracy on average across layers, peaking near 79% at Layer 13.** That's a real signal. Resilience is, at least partly, linearly readable from a single forward pass.

But on the **full distribution**, including the ambiguous middle, accuracy fell to about **63%** — close to just guessing the majority class. So the probe can tell a clearly load-bearing thought from a clearly throwaway one, but it struggles with everything in between, which is most sentences. That gap is the whole story of whether this is useful, and right now it isn't useful enough to replace resampling.

The qualitative side was reassuring, though. When I projected sentences onto the direction the probe learned, the extremes lined up with intuition. The least resilient sentences were hedges and second-guessing:

> *"Wait, but just to make sure there's no trick or anything…"*
> *"But maybe the question is a trick question?"*

The most resilient were concrete computation — actual arithmetic, problem setup, final answers. That matches what the Thought Anchors paper found: the uncertainty-management steps are the ones that don't really move the outcome.

## The part I didn't expect

Here's what I keep thinking about. The probe worked about equally well at almost every layer — but not *quite* equally. Accuracy was lowest at Layer 0, the representation closest to the raw input tokens (69%), and rose to a peak in the middle of the network before flattening out.

Why does that matter? Because the obvious objection to this whole experiment is: *maybe your probe isn't reading "resilience" at all — maybe it's just reading surface features like hedging words and sentence length.* "Wait, maybe…" is lexically distinct from "3 × 4 = 12," and a classifier can latch onto that without understanding anything deep.

If that were the whole story, you'd expect the *earliest* layers to do best, since surface lexical information is most available right at the input. Instead the worst layer is the input-adjacent one, and the signal *builds* as the model processes the sentence. That's not proof — but it's a hint that the probe is picking up something the model computes, not just word identity.

It's a hint, not a verdict, and I want to be honest about that distinction.

## What I'd do differently

Two things stand out in hindsight.

**I should have run a dumb baseline.** The single cleanest way to test the surface-feature worry is to train a probe on *only* word counts and sentence length — no activations at all — and see how close it gets to 75%. If a bag-of-words baseline matches the real probe, most of my signal was lexical. I argued my way around this with the layer curve, but a five-minute baseline would have settled it directly. I didn't run it. Lesson logged.

**I probed the wrong metric, arguably.** Resilience measures how *stubborn* a thought is — how hard it is to remove. But that's not the same as how much it *causally drives the final answer*, which is a separate metric (counterfactual importance) in the same body of work. A sentence can be stubborn because the context overdetermines it, without actually steering the outcome. For safety, the causal one is what you'd really want to detect cheaply. I picked resilience because it had a clean, self-contained scoring algorithm I could replicate — the tractable choice, not necessarily the most useful one.

## Where it leaves things

I'm treating this as a feasibility study, not a result. It says: *resilience is partly linearly encoded, enough to be worth chasing, not enough to use yet.* The honest framing of the speedup is more modest than "20× faster" — at best, for now, the probe could flag likely-fragile sentences for targeted resampling, cutting the number of completions you need rather than eliminating them.

The experiment I actually want to run next is **steering**: add or subtract the resilience direction in the residual stream and see if the model's later reasoning changes. If it does, the direction isn't just correlated with resilience — it's part of how the model produces it. That's the line between "interesting probe" and "a lever you can pull," and it's where I think this gets genuinely useful.

The repo is [here](https://github.com/Hieuuum/linear-cot). It's a feasibility study with rough edges; the limitations section is long on purpose.