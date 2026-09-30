import os
import anthropic
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise ValueError("ANTHROPIC_API_KEY is missing. Add it to .env")

client = anthropic.Anthropic(api_key=api_key)

BUDGET = 5.00
used_cost = 0.0
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

print("Claude Real-Time Usage Monitor")
print(f"Budget: ${BUDGET:.2f}")
print(f"Model: {MODEL}")
print("Type 'exit' to stop.")

while True:
    prompt = input("\nYou: ").strip()

    if prompt.lower() == "exit":
        break
    if not prompt:
        continue

    if used_cost >= BUDGET:
        print("Budget exhausted. Request not sent.")
        break

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        answer = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens

        # Demo pricing; verify current Anthropic pricing before billing use.
        input_cost = (input_tokens / 1_000_000) * 3
        output_cost = (output_tokens / 1_000_000) * 15
        request_cost = input_cost + output_cost

        used_cost += request_cost
        remaining = max(BUDGET - used_cost, 0)

        print("\nClaude:", answer)
        print("\n----- Usage -----")
        print("Input tokens :", input_tokens)
        print("Output tokens:", output_tokens)
        print("Total tokens :", input_tokens + output_tokens)
        print("Request cost : $", round(request_cost, 6))
        print("Used budget  : $", round(used_cost, 6))
        print("Remaining    : $", round(remaining, 6))

    except Exception as error:
        print("\nRequest failed:", error)
