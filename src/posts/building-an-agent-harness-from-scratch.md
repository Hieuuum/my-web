---
title: "Building an agent harness from scratch"
date: "2026-08-11"
draft: "true"
---

What is an agent harness? LLMs can't interact with an environment on its own. They only receive inputs and return outputs in text. Agents, on the other hand, are capable of making changes to its environment, such as editing code, booking flight tickets, etc. An agent harness helps LLMs become agents.

To deeply understand harnesses, we should start from the basics. Building an agent harness from scratch would help a lot with understanding what's going under the hood. I'll implement this in Python using OpenAI API in this blog.

We first need a class responsible for storing the entire conversation history and calling a model. Let's call it the Agent class.

We'll also define some basic functions, link them with their names in a dict so we can look them up later.

[ReAct](https://www.ibm.com/think/topics/react-agent) is a foundational yet simple framework that combines chain-of-thought reasoning with external tool use. In this framework, the LLM is first given instructions on format responses and available tools in the system prompt. 

When given a problem, the agent would first think through it, then suggest functions and inputs to use. The harness would parse the action, execute the tool, and return the results back to the agent through the conversation history. This is repeated until the agent knows the answer and returns it back to the user.

However, the ReAct framework has three major issues. First, there is no single source of truth. If you want to update your list of tools, you would have to edit both the dictionary storing the actions and the system prompt. Second, the model doesn't know the type of inputs and outputs to expect for each function. Sure, you can specify it, buit it would get too verbose. This leads to the last issue, in which the harness has no way of verifying whether a tool was invoked with the correct inputs or not.

To resolve this, we need to built a Tool class that stores the information of each tool, verify inputs when called, and provides a structured schema to the LLM. The PYTHON_TO_JSON_TYPE dict convert a Python type to its equivalent JSON type.

Since we are not using the ReAct framework anymore, we should change the system prompt so the model doesn't get confused.

We should also update the Agent class so it can add tool calls and tool results to the conversation history. =--==Don't forget to update the harness too!

Now we have a working harness! However, it's not enough. If an error happened during a run, it would be hard to diagnose the error. To fix this, the harness needs to keep track of relevant information during a run. I'll create a RunState class to keep track of the current turn, number of tools called, current status, stop reason, and final answer. A separate Tracer class will keep track of the events happened during the runs: before/after a model call, before/after a tool call, errors during a run, etc.

Notice in the code that the harness automatically stops whenever there's a tool-related error. When using Claude Code, Codex, Cursor, or other AI coding tools, have you ever seen a coding session stop just because the model failed to run a bash command? Of course not. Our harness should be able to do the same! When an error occurs, we should append the error message back to the conversation history
