<div align="center">

# 🎓 AI-Powered Home Tuition Management System

**An intelligent automation platform that transforms home tutoring through AI, voice commands, and real-time analytics**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![n8n](https://img.shields.io/badge/n8n-Workflow%20Automation-EA4B71?style=flat&logo=n8n&logoColor=white)](https://n8n.io)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![Supabase](https://img.shields.io/badge/Supabase-Vector%20DB-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20AI-000000?style=flat)](https://ollama.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[View Demo](#demo) · [Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Commands](#commands)

</div>

---

## What is this?

A complete AI-powered management platform built for home tutors. Instead of managing students through notebooks and WhatsApp messages, tutors simply speak or type naturally — the system handles everything automatically.

The tutor says **"Mark Ali as absent today"** and the system records attendance, updates percentages, and alerts the parent. The tutor says **"Generate report for Ali"** and a personalised PDF progress report lands in the parent's inbox. Students ask questions in a dedicated channel and get curriculum-aligned AI tutoring from their actual textbooks.

---

## Features

### Core Management
- **Student registration** — register students with a single natural language message
- **Attendance tracking** — mark present, absent, or late. Auto-calculates percentages
- **Fee management** — track payments with JazzCash transaction IDs, auto-generate receipts
- **Homework management** — assign, track, and update homework status per student

### AI Intelligence
- **Natural language interface** — no fixed commands. Type or speak naturally in English or Urdu
- **Bilingual support** — full Urdu language support with automatic language detection
- **Voice commands** — send voice notes in Discord, system transcribes and acts on them
- **AI intent router** — Ollama LLM reads every message and routes to the correct workflow

### Student Features
- **AI homework tutor** — students ask subject questions, get curriculum-aligned answers
- **Practice quiz generator** — quizzes generated from uploaded textbook PDFs via RAG
- **Personalised quizzes** — auto-graded, delivered via Discord DM for privacy

### Automated Reports
- **Weekly learning gap detector** — identifies which subjects each student struggles with
- **Attendance pattern analyser** — detects absence patterns (always absent on Fridays, etc.)
- **Fee default predictor** — flags students likely to miss payment before it happens
- **Monthly progress reports** — AI-written reports delivered as Google Docs to parents

### Automation (runs without tutor input)
- **Monthly fee creation** — auto-creates fee records on the 1st of every month
- **Fee reminders** — DMs parents about pending fees on the 25th of every month
- **Homework reminders** — DMs students 24 hours before homework is due
- **Attendance alerts** — alerts tutor when any student falls below 75% attendance

### RAG Knowledge Base
- **PDF upload** — drop curriculum PDFs in a dedicated Discord channel
- **Semantic search** — student questions search actual textbook content
- **Grade filtering** — Grade 8 students get Grade 8 questions from Grade 8 material
- **Always expandable** — upload new PDFs anytime for new students or subjects

---

## Architecture

```
Discord User (Tutor/Student/Parent)
         ↓
    bot.js (Node.js)
    ├── Voice transcription (Whisper)
    ├── Intent detection (Ollama llama3.2:1b)
    └── Channel routing
         ↓
    n8n Workflows (15 automated workflows)
    ├── Core: AI Router, Parent Portal
    ├── Automation: Fee reminders, Attendance alerts
    ├── AI: Gap detector, Report generator
    └── Student: Tutor, Quiz generator/grader
         ↓
    ┌─────────────────────────────────┐
    │  Google Sheets  │  Supabase     │
    │  (Database)     │  (Vector DB)  │
    └─────────────────────────────────┘
         ↓
    Ollama (Local AI — completely free)
    ├── llama3.2:1b (intent detection)
    └── nomic-embed-text (RAG embeddings)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Bot interface | Discord.js | Communication layer |
| Automation | n8n Community Edition | 15 interconnected workflows |
| Database | Google Sheets | Student, fee, attendance, homework data |
| Vector database | Supabase (pgvector) | Curriculum PDF storage for RAG |
| Local AI | Ollama (llama3.2:1b) | Intent detection, NLP, report generation |
| Embeddings | nomic-embed-text | RAG semantic search |
| Speech-to-text | OpenAI Whisper (local) | Voice command transcription |
| Reports | Google Docs API | AI-generated progress reports |

**Total monthly cost: PKR 0** — all services are free or self-hosted.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- n8n (via `npx n8n` or Docker)
- Ollama with `llama3.2:1b` and `nomic-embed-text` models
- Discord bot token
- Google Cloud project (Sheets + Docs APIs enabled)
- Supabase project (free tier)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-tuition-management-system.git
cd ai-tuition-management-system/discord-bot

# Install Node dependencies
npm install

# Install Python dependencies
pip install openai-whisper

# Copy environment template
cp .env.example .env
# Edit .env with your actual credentials

# Start n8n
npx n8n

# Import workflows
# In n8n: Settings → Import workflow → select each JSON from n8n-workflows/

# Start the bot
node bot.js
```

### Google Sheets Setup

Create a spreadsheet called **Tuition Management System** with these tabs:

| Tab | Columns |
|---|---|
| Students | StudentID, Name, Grade, ParentName, ParentPhone, ParentDiscordID, FeeAmount, EnrollmentDate, Status |
| Attendance | Date, StudentName, Status, Notes |
| Fees | StudentID, StudentName, Month, AmountDue, AmountPaid, DueDate, PaidDate, Status, TransactionID |
| Homework | HomeworkID, StudentID, StudentName, Subject, Description, AssignedDate, DueDate, Status |
| Quizzes | QuizID, StudentName, Subject, Questions, CorrectAnswers, StudentAnswers, Score, Status, CreatedAt |

---

## Discord Server Structure

```
TUTOR
├── #tutor-commands     ← all tutor commands and voice messages
└── #curriculum         ← drop PDF textbooks here to add to knowledge base

STUDENTS
├── #homework-help      ← ask AI tutor questions, request practice quizzes
├── #assignments        ← bot posts homework reminders
└── #quizzes            ← quiz results appear here

PARENTS
├── #fee-status         ← check fees, view child progress
└── #announcements      ← bot posts updates

PRIVATE
└── #bot-logs           ← execution log of all bot activity
```

---

## Commands

All commands support natural language — no rigid syntax required.

### Tutor Commands (`#tutor-commands`)

| What you say | What happens |
|---|---|
| `Add student Ali class 8 father Ahmed 03001234567 fee 5000` | Registers student, creates fee record |
| `Mark Ali absent today` | Records attendance, notifies parent |
| `Ali paid his fees transaction JZ-2026-12345` | Updates fee status, generates receipt |
| `What is Ali's fee balance` | Returns fee information |
| `Assign Ali maths homework solve exercise 5 by Friday` | Creates homework record |
| `Show Ali's homework` | Lists all assigned homework |
| `Mark Ali's maths homework as submitted` | Updates homework status |
| `Generate report Ali` | Creates Google Doc progress report |
| `علی آج غیر حاضر ہے` | Full Urdu support — marks Ali absent |
| 🎤 Voice note: "Mark Sara present today" | Transcribed and processed automatically |

### Student Commands (`#homework-help`)

| What you say | What happens |
|---|---|
| `Explain fractions to me` | AI tutor answers from curriculum PDFs |
| `I don't understand exercise 3` | Step-by-step explanation |
| `Quiz me on science` | 5 curriculum-aligned questions sent via DM |
| `Quiz me on chapter 5 maths` | Topic-specific quiz from uploaded textbook |

### Parent Commands (`#fee-status`)

| What you say | What happens |
|---|---|
| `How is Ali doing?` | Full summary of attendance, fees, homework |
| `What is Ali's fee balance?` | Current fee status |
| `Does Ali have any pending homework?` | Homework list |
| `علی کی حاضری کیا ہے؟` | Urdu — returns attendance information |

---

## Automated Schedules

| Schedule | What runs |
|---|---|
| 1st of every month, 7am | Creates fee records for all active students |
| 20th of every month, 9am | Fee default predictor — flags at-risk parents |
| 25th of every month, 9am | Sends fee reminders to parents via Discord DM |
| Every day, 8am | Homework due reminders to students |
| Every day, 6pm | Attendance threshold alert (below 75%) |
| Every Sunday, 7pm | Learning gap detector report |
| Every Sunday, 8pm | Attendance pattern analyser report |
| Every Sunday, 8pm | Weekly student performance summary |

---

## Adding Curriculum PDFs

To add textbooks to the AI knowledge base:

1. Go to `#curriculum` in Discord
2. Type `grade:8 subject:Maths` in the message
3. Attach the PDF file
4. Send

The system automatically extracts text, generates embeddings, and stores them in Supabase. Students' questions and quizzes will now draw from this material. Upload as many PDFs as needed — the knowledge base grows with your curriculum.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
DISCORD_TOKEN=        # Discord Developer Portal → Bot → Token
SUPABASE_URL=         # Supabase → Settings → API → Project URL
SUPABASE_KEY=         # Supabase → Settings → API → anon/public key
N8N_BASE_URL=         # http://localhost:5678 (local) or Railway URL (deployed)
WHISPER_CACHE_DIR=    # Directory to store Whisper model files
```

---
## n8n Workflow Credentials

The workflow JSON files in `n8n-workflows/` have all API keys and tokens 
replaced with placeholder values. After importing workflows into n8n, 
you must re-enter your credentials in:

- Settings → Credentials → add your Google Sheets OAuth2 credentials
- Any HTTP Request node that calls Discord API: replace 
  `YOUR_DISCORD_BOT_TOKEN_HERE` with your actual bot token
- Any HTTP Request node that calls Groq: replace 
  `YOUR_GROQ_KEY_HERE` with your actual Groq key

## n8n Workflows

Import all workflows from the `n8n-workflows/` folder. The workflows are organised into categories:

| Category | Workflows |
|---|---|
| `core/` | AI Router (main entry point), Parent Portal |
| `automation/` | Fee reminders, Attendance alerts, Homework reminders, Monthly fee creation |
| `ai/` | Learning gap detector, Fee default predictor, Attendance pattern analyser, Progress report generator |
| `student/` | AI tutor, Quiz generator, Quiz grader, PDF upload RAG, RAG query |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ideas for extensions:
- WhatsApp integration (Twilio Business API)
- Mobile app (React Native)
- Multi-tutor support with separate student pools
- Payment gateway integration (JazzCash API)
- SMS notifications via Twilio

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Built With

This project demonstrates production-level integration of:
- Workflow automation (n8n)
- Large language models (Ollama, local inference)
- Retrieval-augmented generation (Supabase pgvector)
- Speech recognition (OpenAI Whisper, local)
- Event-driven architecture
- Multi-channel bot development
- Bilingual NLP (English + Urdu)

<div align="center">

Made for home tutors everywhere

</div>
