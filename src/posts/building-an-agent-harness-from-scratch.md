---
title: "Building an agent harness from scratch"
date: "2026-08-11"
draft: "true"
---

What is an agent harness? LLMs can't interact with an environment on its own. They only receive inputs and return outputs in text. Agents, on the other hand, are capable of making changes to its environment, such as editing code, booking flight tickets, etc. An agent harness helps LLMs become agents.

To deeply understand harnesses, I believe we should go back to the basics and start simple. Building an agent harness from scratch would help a lot with understanding what's going under the hood.

We first need a class responsible for storing the entire conversation history and calling a model. Let's call it Agent class.

[ReAct](https://www.ibm.com/think/topics/react-agent) is a foundational yet simple framework that combines chain-of-thought reasoning with external tool use. In this framework, the LLM is first given instructions on format responses and available tools in the system prompt. When given a problem, the agent would first think through it, then suggest functions and inputs to use. The harness would parse the action, execute the tool, and return the results back to the