import os
import asyncio
from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig

async def main():
    comment = os.getenv("COMMENT_BODY", "")
    issue_num = os.getenv("ISSUE_NUMBER")

    # Configure the agent with file edit capabilities
    config = LocalAgentConfig(
        system_instructions=(
            "You are an expert Node.js developer agent running in GitHub Actions. "
            "You can read files, make precise code edits, run local tests, "
            "and propose fixes based on the user's issue comment."
        ),
        capabilities=CapabilitiesConfig() # Grants file-writing & shell execution tools
    )

    async with Agent(config) as agent:
        prompt = f"The user requested: '{comment}' for Issue #{issue_num}. Analyze the codebase and make necessary fixes."
        response = await agent.chat(prompt)
        print(await response.text())

        # Here you can commit the changes, open a PR, or post a comment back to the Issue

if __name__ == "__main__":
    asyncio.run(main())