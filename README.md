# Buchhaltung — Local Accounting Assistant

Buchhaltung is a local-first accounting assistant and expense-management application with local AI-assisted invoice extraction and accounting chat. It is not represented as legally compliant accounting software or as a replacement for a professional accountant, tax adviser, certified archive, or legally required bookkeeping system. Application data, uploaded invoices, and AI processing stay on the user's computer when Ollama is configured on the local loopback address.

No cloud AI API or paid subscription is required. Ollama, AI models, Node.js, and PDF utilities are not bundled; users install and run them separately under their respective licenses.

## Features

- Track fixed, variable, monthly, annual, and one-time expenses
- Store invoice and card-statement PDFs locally
- Extract invoice fields with a local vision-language model
- Ask questions about locally stored accounting records and documents
- Keep a local activity log for invoice processing

## Requirements

- macOS, Linux, or Windows with WSL2
- Node.js 20 or newer and npm
- [Ollama](https://ollama.com/download)
- Poppler command-line tools (`pdftoppm` and `pdftotext`)
- Approximately 6.1 GB for the recommended model download, plus enough memory to run it

The recommended model is [`qwen3-vl:8b-instruct`](https://ollama.com/library/qwen3-vl:8b-instruct). It supports the visual invoice workflow and the accounting chat. Its Ollama page currently specifies Ollama 0.12.7 or newer and identifies the model license as Apache-2.0.

## Installation

Prefer guided setup? Copy one of the prompts from [AI-Assisted Installation Prompts](AI_INSTALLATION.md) into a coding assistant that can guide or operate your terminal.

### 1. Install Node.js

Install Node.js 20 or newer from [nodejs.org](https://nodejs.org/) and verify it:

```bash
node --version
npm --version
```

### 2. Install Poppler

macOS with Homebrew:

```bash
brew install poppler
```

Ubuntu, Debian, or WSL2:

```bash
sudo apt update
sudo apt install poppler-utils
```

Verify that both required programs are available:

```bash
pdftoppm -v
pdftotext -v
```

### 3. Install and start Ollama

Download Ollama from [ollama.com/download](https://ollama.com/download). Start the Ollama application, or run its server according to the instructions for your operating system.

Check the local service:

```bash
curl http://127.0.0.1:11434/api/tags
```

### 4. Download the recommended model

```bash
ollama pull qwen3-vl:8b-instruct
```

You can test it interactively with:

```bash
ollama run qwen3-vl:8b-instruct
```

The model is downloaded by Ollama and is not part of this repository.

### 5. Install Buchhaltung

```bash
git clone https://github.com/azoglufatih/buchhaltung.git
cd buchhaltung
npm install
cp .env.example .env
```

The default `.env.example` points to the local Ollama service:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_INVOICE_MODEL=qwen3-vl:8b-instruct
OLLAMA_CHAT_MODEL=qwen3-vl:8b-instruct
```

If the user's own local LLM server is reachable at another URL or uses other Ollama-compatible model names, they should change these values in `.env`. The `.env` file is ignored by Git; `.env.example` is only the version-controlled template and must not contain secrets.

### 6. Run the application locally

```bash
npm run dev -- --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For a local production build:

```bash
npm run build
npm run start -- --hostname 127.0.0.1
```

## Local data and privacy

- Accounting data is stored in `data/`.
- Uploaded documents are stored in `uploads/`.
- Both directories are excluded from Git, except for `uploads/.gitkeep`.
- Invoice images and chat context are sent to the Ollama endpoint configured in `OLLAMA_URL`.
- With the default loopback URL, this processing remains on the same computer.

Back up `data/` and `uploads/` together. The application does not currently provide encrypted storage or an automated backup system.

## Security scope

This version is intended for a trusted, single-user computer and loopback-only access. It does not include user authentication or authorization. Do not bind it to `0.0.0.0`, expose it to a LAN, forward its port, or publish it on the internet without adding an appropriate authentication and security layer.

## Accuracy and accounting notice

This project is an accounting assistant and expense-management tool. It has not been certified or independently verified for compliance with Austrian, EU, or other accounting, tax, audit, retention, data-protection, or electronic-archiving requirements.

Important limitations:

- AI extraction and chat responses can be incomplete, misleading, or wrong. A human must verify invoice numbers, dates, vendors, tax rates, classifications, totals, and generated answers against the original documents.
- The application does not provide tax, legal, audit, or professional accounting advice. Consult a qualified professional for decisions and filings.
- Users remain responsible for correct bookkeeping, tax declarations, evidence, audit trails, retention periods, and compliance in their jurisdiction.
- Storing or scanning a document in this application does not prove its authenticity, integrity, completeness, legibility, or legal admissibility.
- The application is not a certified document archive and does not currently provide immutable records, qualified electronic signatures, tamper-evident storage, formal approval workflows, or guaranteed audit trails.
- Do not treat AI-generated fields or summaries as the authoritative record. Retain and verify the original invoices and other source documents as required by applicable law.
- Local storage is not an automatic backup. Users must create, secure, test, and retain their own backups of both `data/` and `uploads/`.
- The software provides no warranty that records will be preserved, recoverable, available, or accepted by a tax authority, court, auditor, accountant, or other third party.
- Users are responsible for access control, operating-system security, disk encryption, malware protection, and secure disposal of devices and backups containing financial or personal data.
- If documents contain personal data belonging to employees, customers, suppliers, or other people, users are responsible for determining and fulfilling their data-protection obligations.
- Laws and administrative requirements change. Documentation in this repository may become outdated and is not a substitute for current official guidance.

Read the full [legal and operational disclaimer](DISCLAIMER.md) before relying on the application for business records.

## Third-party software and models

This repository does not redistribute Ollama, Poppler, Node.js, or model weights. Each component remains subject to its own license and terms. Users who select a different model are responsible for checking that model's license and hardware requirements.

## License

Buchhaltung is available under the [MIT License](LICENSE).

Copyright 2026 Fatih Ayazoglu. Contact: fatih.ayazogl@zero2one.at.
