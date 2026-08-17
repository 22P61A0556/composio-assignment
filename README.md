# AI App Research Automation

## Overview
This project automates research across 100 AI and SaaS platforms, collecting integration and developer ecosystem information and generating a structured HTML report.

## Features
- Researches 100 platforms automatically
- Collects API and developer documentation data
- Detects authentication methods
- Identifies API surface (REST, GraphQL, SDK)
- Evaluates self-serve onboarding
- Detects MCP availability
- Generates analytics and insights
- Produces a searchable HTML report

## Project Structure

project-root/
├── src/
├── data/
├── output/
│   └── index.html
├── README.md
├── package.json
└── .env

## Installation

1. Clone repository
2. Install dependencies

npm install

3. Configure environment variables

Create .env

OPENAI_API_KEY=your_key_here

4. Run research

npm run research

5. Generate report

npm run build

## Output

Generated report:

output/index.html

Includes:
- Research table
- Analytics summary
- Authentication distribution
- API surface analysis
- MCP adoption analysis
- Verification results
- Key findings

## Research Methodology

The agent:
1. Discovers platforms
2. Visits documentation
3. Extracts integration information
4. Classifies platform capabilities
5. Scores confidence
6. Generates insights
7. Produces final report

## Technologies

- Node.js
- TypeScript / JavaScript
- OpenAI API
- HTML/CSS
- Research Automation Workflow

## Submission

Live Demo:
(https://22p61a0556.github.io/composio-assignment/)

Repository:
(https://github.com/22P61A0556/composio-assignment.git)
