---
title: "Building an agent harness from scratch"
date: "2026-08-11"
draft: "true"
---

What is an agent harness? LLMs can't interact with an environment on its own. They only receive inputs and return outputs in text. Agents, on the other hand, are capable of making changes to its environment, such as editing code, booking flight tickets, etc. In layman's terms, an agent harness helps LLMs become agents. It is the runtime around the model that provides tools, state, termination, recovery, etc. for the model to act in an environment.  

To deeply understand harnesses, we should start from the basics. Building an agent harness from scratch would help a lot with understanding what's going under the hood. I'll implement this in Python using OpenAI API in this blog.

We first need a class responsible for storing the entire conversation history and calling a model. Let's call it the Agent class.

We'll also define some basic functions, link them with their names in a dict so we can look them up later.

## ReAct
[ReAct](https://www.ibm.com/think/topics/react-agent) is a foundational yet simple framework that combines chain-of-thought reasoning with external tool use. In this framework, the LLM is first given instructions on format responses and available tools in the system prompt. 

When given a problem, the agent would first think through it, then suggest functions and inputs to use. The harness would parse the action, execute the tool, and return the results back to the agent through the conversation history. This is repeated until the agent knows the answer and returns it back to the user.

This minimal text-based ReAct implementation has several problems. First, there is no single source of truth. If you want to update your list of tools, you would have to edit both the dictionary storing the actions and the system prompt. Second, the model doesn't know the type of inputs and outputs to expect for each function. Sure, you can specify it, buit it would get too verbose. This leads to the last issue, in which the harness has no way of verifying whether a tool was invoked with the correct inputs or not.

## Tool
To resolve this, we need to built a Tool class that serves both the model-facing interface and the Python runtime. It provides the schema and description for the model's side, while handling validation and execution of inputs for the runtime.

Since we are not using the ReAct framework anymore, we should change the system prompt so the model doesn't get confused.

We should also update the Agent class so it can add tool calls and results to the conversation history. Don't forget to update the harness too!

## RunState
We now have a working harness! However, it's not enough. What if you want to terminate the run after some turns or tool calls?  You would needTo fix this, the harness needs to keep track of relevant information during a run. I'll create a RunState class to keep track of the current turn, number of tools called, current status, stop reason, and final answer. A separate Tracer class will keep track of the events happened during the runs: before/after a model call, before/after a tool call, errors during a run, etc.

If an error happened during a run, it would be hard to diagnose the error.

## Recovery
Notice in the code that the harness automatically stops whenever there's a tool-related error. When using Claude Code, Codex, Cursor, or other AI coding tools, have you ever seen a coding session stop just because the model failed to run a bash command? Of course not. Our harness should be able to do the same! When an error occurs, we append the error message back to the conversation history, and call the model again so it can retry.

## Verification
Lastly, the harness needs to be able to independently verify the results. It would be foolish to trust the model when it says 'Task Completed!' Since our previous examples aren't suitable for verification, I'll provide some boilerplate code for a booking agent.

## Evaluation
We need to run an evaluation in a controlled initial environment. In our case, it would be resetting the booking variable, since it might have been modified by other evaluation runs. You need to be careful in designing your evaluations and expected outcomes. For most cases, we just need to inspect the status of a booking_id. However, we also have a case that tries to cancel a non-existent flight ticket. For the run to pass, the agent should not modify the system.