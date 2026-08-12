---
title: "Building an agent harness from scratch"
date: "2026-08-01"
---

What is an agent harness? LLMs can't interact with an environment on its own. They only receive inputs and return outputs in text. Agents, on the other hand, are capable of making changes to its environment, such as editing code, booking flight tickets, etc. In layman's terms, an agent harness helps LLMs become agents. It is the runtime around the model that provides tools, state, termination, recovery, etc. for the model to act in an environment.

To deeply understand agent harnesses, we should start from the basics. Building an agent harness from scratch would help a lot with understanding what's going under the hood. I'll implement this in Python using OpenAI API in this blog.

We first need a class responsible for storing the entire conversation history and calling a model. Let's call it the `Agent` class.

```python
from openai import OpenAI

client = OpenAI()

class Agent:
    def __init__(self, system_prompt):
        self.messages = [
            {"role": "system", "content": system_prompt}
        ]

    def __call__(self, message):
        self.messages.append({"role": "user", "content": message})
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=self.messages,
        )
        result = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": result})
        return result
```

We'll also define some basic functions, link them with their names in a dict so we can look them up later.

```python
def get_price(item):
    prices = {
        "notebook": 7,
        "pen": 3,
        "backpack": 25,
    }
    return prices.get(item.lower())


def calculator(expression):
    return eval(expression)  # Toy example only; avoid unrestricted eval in real systems.


known_actions = {
    "get_price": get_price,
    "calculator": calculator,
}
```

## ReAct

[ReAct](https://www.ibm.com/think/topics/react-agent) is a foundational yet simple framework that combines chain-of-thought reasoning with external tool use. In this framework, the LLM is first given instructions on format responses and available tools in the system prompt.

```text
You run in a loop of Thought, Action, PAUSE, Observation.
At the end of the loop you output an Answer.

Use Action to request one of the available actions, then return PAUSE.
Observation will be the result of running that action.

Available actions:

get_price:
Action: get_price: notebook
Returns the price of an item.

calculator:
Action: calculator: 7 * 3
Evaluates a simple arithmetic expression.

When finished, output:
Answer: <answer>
```

*ReAct system prompt*

When given a problem, the agent would first think through it, then suggest functions and inputs to use. The harness would parse the action, execute the tool, and return the results back to the agent through the conversation history. This is repeated until the agent knows the answer and returns it back to the user.

```python
import re

action_re = re.compile(r"^Action: (\w+): (.*)$")

def query(question, max_turns=5):
    bot = Agent(system_prompt)
    next_prompt = question

    for _ in range(max_turns):
        result = bot(next_prompt)

        actions = [
            action_re.match(line)
            for line in result.split("\n")
            if action_re.match(line)
        ]

        if not actions:
            return result

        action, action_input = actions[0].groups()

        if action not in known_actions:
            raise ValueError(f"Unknown action: {action}")

        observation = known_actions[action](action_input)
        next_prompt = f"Observation: {observation}"
```

This minimal text-based ReAct implementation has several problems. First, there is no single source of truth. If you want to update your list of tools, you would have to edit both the dictionary storing the actions and the system prompt. Second, the model does not have a formal argument schema for each function. Sure, you can specify it, buit it would get too verbose. This leads to the last issue, in which the harness has no way of verifying whether a tool was invoked with the correct inputs or not.

## Tool

To resolve this, we need to built a `Tool` class that serves both the model-facing interface and the Python runtime. It provides the schema and description for the model's side, while handling validation and execution of inputs for the runtime.

```python
from dataclasses import dataclass
from typing import Any, Callable

PYTHON_TO_JSON_TYPE = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
}

@dataclass
class Tool:
    name: str
    description: str
    arg_types: dict[str, type]
    fn: Callable[..., Any]

    def schema(self):
        properties = {
            arg_name: {"type": PYTHON_TO_JSON_TYPE[arg_type]}
            for arg_name, arg_type in self.arg_types.items()
        }

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": list(self.arg_types),
            },
        }

    def openai_schema(self):
        return {
            "type": "function",
            "function": self.schema(),
        }

    def run(self, args):
        for arg_name, expected_type in self.arg_types.items():
            if arg_name not in args:
                raise ValueError(f"Missing required argument '{arg_name}'")
            if not isinstance(args[arg_name], expected_type):
                raise TypeError(
                    f"'{arg_name}' must be {expected_type.__name__}, "
                    f"got {type(args[arg_name]).__name__}"
                )

        for arg_name in args:
            if arg_name not in self.arg_types:
                raise ValueError(f"Unknown argument '{arg_name}'")

        return self.fn(**args)
```

```python
get_price_tool = Tool(
    name="get_price",
    description="Get the price of an item.",
    arg_types={"item": str},
    fn=get_price,
)

calculator_tool = Tool(
    name="calculator",
    description="Evaluate a simple arithmetic expression.",
    arg_types={"expression": str},
    fn=calculator,
)

tools = {
    tool.name: tool
    for tool in [get_price_tool, calculator_tool]
}
```

*Wrapping the functions as tools*

Since we are not using the ReAct framework anymore, we should change the system prompt so the model doesn't get confused.

```text
You are a helpful assistant.

Use the provided tools when needed.
Do not invent tool results.
```

*Updated system prompt*

We should also update the `Agent` class so it can add tool calls and results to the conversation history. Don't forget to update the harness too!

```python
class Agent:
    def __init__(self, system_prompt):
        self.messages = [
            {"role": "system", "content": system_prompt}
        ]

    def add_user_message(self, content):
        self.messages.append({"role": "user", "content": content})

    def add_assistant_message(self, message):
        self.messages.append(message)

    def add_tool_result(self, tool_call_id, result):
        self.messages.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": str(result),
        })

    def execute(self):
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=self.messages,
            tools=[tool.openai_schema() for tool in tools.values()],
        )
        return response.choices[0].message
```

```python
import json

def query(question, max_turns=5):
    bot = Agent(system_prompt)
    bot.add_user_message(question)

    for _ in range(max_turns):
        message = bot.execute()
        bot.add_assistant_message(message)

        if not message.tool_calls:
            return message.content

        for tool_call in message.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)

            if name not in tools:
                raise ValueError(f"Unknown tool '{name}'")

            result = tools[name].run(args)
            bot.add_tool_result(tool_call.id, result)
```

*The updated harness loop*

## RunState and Tracing

We now have a working harness! However, it's not enough. What if you want to terminate the run after a number of turns/tool calls, or diagnose when a run failed? You'd need to keep track of relevant information during a run. `RunState` will be in charge of storing the current execution state, while `Tracer` records the events preceding that current state: before/after a model call, before/after a tool call, errors during a run, etc.

```python
@dataclass
class RunState:
    turn: int = 0
    tool_calls: int = 0
    status: str = "running"
    stop_reason: str | None = None
    final_answer: str | None = None


class Tracer:
    def __init__(self):
        self.events = []

    def record(self, event):
        self.events.append(event)
```

You can now stop the run whenever it hits a terminal condition, such as reaching the maximum budgets, or easily fix a run with events recorded.

```python
tracer.record({
    "event": "model_called",
    "turn": state.turn + 1,
})

tracer.record({
    "event": "tool_called",
    "turn": state.turn,
    "tool": name,
    "args": args,
})

if state.tool_calls >= max_tool_calls:
    state.status = "stopped"
    state.stop_reason = "max_tool_calls"

    tracer.record({
        "event": "run_stopped",
        "reason": "max_tool_calls",
    })

    return state, tracer
```

## Recovery

Notice in the code that the harness automatically stops whenever there's a tool-related error. When using Claude Code, Codex, Cursor, or other AI coding tools, have you ever seen a coding session stop just because the model failed to run a bash command? Of course not. Our harness should be able to do the same! When an error occurs, we append the error message back to the conversation history, and call the model again so it can retry.

```python
try:
    state.tool_calls += 1
    result = tools[name].run(args)

except Exception as e:
    tracer.record({
        "event": "tool_error",
        "turn": state.turn,
        "tool": name,
        "args": args,
        "error_type": type(e).__name__,
        "error": str(e),
    })

    bot.add_tool_result(
        tool_call.id,
        f"Tool error: {e}. Correct the arguments and try again.",
    )

    continue
```

## Verification

Lastly, the harness needs to be able to independently verify the results. It would be foolish to trust the model reporting 'Task Completed!' Since our previous examples aren't suitable for verification, I'll provide some boilerplate code for a booking agent.

```python
bookings = {
    "B001": {
        "status": "active",
        "refundable": True,
    },
    "B002": {
        "status": "active",
        "refundable": False,
    },
}


def lookup_booking(booking_id):
    return bookings.get(booking_id)


def cancel_booking(booking_id):
    if booking_id not in bookings:
        raise ValueError("Booking not found")

    bookings[booking_id]["status"] = "cancelled"
    return bookings[booking_id]


def verify_booking_cancelled(booking_id):
    booking = bookings.get(booking_id)

    if booking is None:
        return {
            "passed": False,
            "reason": "Booking does not exist",
        }

    passed = booking["status"] == "cancelled"

    return {
        "passed": passed,
        "reason": (
            "Booking is cancelled"
            if passed
            else "Booking is still active"
        ),
    }
```

## Evaluation

Evaluation is applying verification at scale. An evaluation should be ran in a controlled initial environment. In our case, it would be resetting the booking variable, since it might have been modified by other evaluation runs. You need to be careful in designing your evaluations and expected outcomes. For most cases, we just need to inspect the status of a `booking_id`. However, we also have a case that tries to cancel a non-existent flight ticket. For the run to pass, the agent should not modify the system.

```python
import copy
from dataclasses import dataclass

@dataclass
class EvalCase:
    name: str
    prompt: str
    booking_id: str
    expected_status: str | None


def reset_bookings():
    global bookings
    bookings = {
        "B001": {"status": "active", "refundable": True},
        "B002": {"status": "active", "refundable": False},
    }


eval_cases = [
    EvalCase(
        name="cancel valid booking",
        prompt="Cancel booking B001",
        booking_id="B001",
        expected_status="cancelled",
    ),
    EvalCase(
        name="cancel existing nonrefundable booking",
        prompt="Cancel booking B002",
        booking_id="B002",
        expected_status="cancelled",
    ),
    EvalCase(
        name="cancel unknown booking",
        prompt="Cancel booking B999",
        booking_id="B999",
        expected_status=None,
    ),
]
```

```python
def evaluate_case(case):
    reset_bookings()
    before = copy.deepcopy(bookings)

    state, tracer = query(case.prompt)

    after = copy.deepcopy(bookings)

    if case.expected_status is not None:
        booking = after.get(case.booking_id)
        passed = (
            booking is not None
            and booking["status"] == case.expected_status
        )
    else:
        # Cancelling a nonexistent booking should not mutate the system.
        passed = before == after

    return {
        "name": case.name,
        "passed": passed,
        "status": after.get(case.booking_id, {}).get("status"),
        "stop_reason": state.stop_reason,
        "turns": state.turn,
        "tool_calls": state.tool_calls,
        "before": before,
        "after": after,
        "trace": tracer.events,
    }
```

*Running a single eval case*

```python
def run_evals(cases):
    return [evaluate_case(case) for case in cases]


results = run_evals(eval_cases)

for result in results:
    label = "PASS" if result["passed"] else "FAIL"
    print(
        f"{label} | {result['name']} | "
        f"turns={result['turns']} | "
        f"tools={result['tool_calls']} | "
        f"stop={result['stop_reason']}"
    )
```

*Running all eval cases*

Now you that you have a concrete understanding of an agent harness, go build one!