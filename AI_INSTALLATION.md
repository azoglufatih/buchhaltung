# AI-Assisted Installation Prompts

## Complete installation

```text
Help me install Buchhaltung, a local-first accounting assistant, from:
https://github.com/azoglufatih/buchhaltung

Act as an interactive installation assistant. Perform safe checks and commands when you have terminal access. If you do not have terminal access, give me one command at a time and wait for its output before continuing.

Requirements and constraints:
1. First detect my operating system, CPU architecture, available memory, free disk space, shell, and whether I am using macOS, Linux, or Windows with WSL2.
2. Do not use Docker unless I explicitly request it.
3. Do not expose any service to my LAN or the internet. Bind Buchhaltung and Ollama only to 127.0.0.1.
4. Never ask me to paste passwords, access tokens, private financial records, invoices, or secrets into the chat.
5. Explain any command that requires administrator privileges and ask for confirmation before running it.
6. Do not delete or overwrite an existing installation, .env file, data directory, uploads directory, or Ollama model without asking me first.
7. Install or help me install these prerequisites from their official sources:
   - Git
   - Node.js 20 or newer with npm
   - Poppler tools providing pdftoppm and pdftotext
   - Ollama
8. Use the appropriate Poppler installation method:
   - macOS with Homebrew: brew install poppler
   - Ubuntu, Debian, or WSL2: sudo apt update, then sudo apt install poppler-utils
   - For another platform, use current official or trusted platform documentation and explain the source.
9. Verify every prerequisite with version or health commands before continuing.
10. Start Ollama locally and verify http://127.0.0.1:11434/api/tags responds.
11. Recommend qwen3-vl:8b-instruct when the machine has sufficient resources. Tell me before downloading that it is approximately 6.1 GB. Use:
    ollama pull qwen3-vl:8b-instruct
12. If the machine is not suitable for the recommended model, explain the limitation and ask before selecting a smaller compatible vision model. Do not silently change the model.
13. Clone the repository. If a buchhaltung directory already exists, inspect it and ask whether I want to update or use it; do not overwrite it.
14. In the repository, run npm install.
15. Copy .env.example to .env without overwriting an existing .env file. The .env.example file is only a safe template; the active user configuration belongs in .env.
16. Ensure .env contains:
    OLLAMA_URL=http://127.0.0.1:11434
    OLLAMA_INVOICE_MODEL=qwen3-vl:8b-instruct
    OLLAMA_CHAT_MODEL=qwen3-vl:8b-instruct
17. Never commit .env, data/, uploads/, invoices, or personal accounting records to Git.
18. Run npm run build and resolve installation-related failures without weakening security or removing user data.
19. Start the application with:
    npm run dev -- --hostname 127.0.0.1
20. Verify the application at http://127.0.0.1:3000 and confirm Ollama remains reachable only through the configured local endpoint.
21. Explain how to stop and restart both Buchhaltung and Ollama.
22. At the end, provide a short report containing installed versions, selected model, application URL, local data locations, and any unresolved warnings.

Important product limitations to tell me before I import real documents:
- Buchhaltung is an accounting assistant and expense-management tool, not verified legally compliant accounting software.
- AI-extracted fields and chat answers can be wrong and require human verification against original documents.
- It does not provide tax, legal, audit, or professional accounting advice.
- I am responsible for backups, original documents, retention requirements, access control, and compliance in my jurisdiction.
- The current application has no application-level authentication and must remain localhost-only.

Begin by reporting the detected environment and proposed installation steps. Do not start changing the system until you have completed the checks.
```

## Verify an existing installation

```text
Verify my existing local Buchhaltung installation from:
https://github.com/azoglufatih/buchhaltung

Do not modify anything initially. Detect my operating system and locate the repository. Then check:
- Git status without discarding or overwriting changes
- Node.js and npm versions
- installed npm dependencies
- availability of pdftoppm and pdftotext
- Ollama version and local health at http://127.0.0.1:11434/api/tags
- availability of qwen3-vl:8b-instruct
- .env variable names without displaying secret values
- that OLLAMA_URL uses 127.0.0.1 or localhost
- that data/, uploads/, and environment files are ignored by Git
- npm run build
- whether the application starts on 127.0.0.1 without being exposed to the network

Never upload or display invoices, accounting data, environment values, credentials, or personal information. Do not delete build caches, reinstall packages, pull models, change files, or run repairs until you show me the findings and ask for approval.

Return a pass/fail checklist, explain each failure, and propose the smallest safe repair commands.
```

## Troubleshoot local AI

```text
Troubleshoot the local AI connection for my Buchhaltung installation.

Protect my privacy: do not request or display invoices, accounting records, complete environment files, credentials, or model prompts containing financial data.

Check in this order:
1. Detect the operating system and repository location.
2. Confirm Ollama is installed and report its version.
3. Confirm Ollama is running locally.
4. Test http://127.0.0.1:11434/api/tags without changing network exposure.
5. Read only these variable names from .env and redact their values in your output:
   - OLLAMA_URL
   - OLLAMA_INVOICE_MODEL
   - OLLAMA_CHAT_MODEL
6. Confirm the configured model names exist in Ollama.
7. If qwen3-vl:8b-instruct is missing, tell me its approximate 6.1 GB download size and ask before running ollama pull qwen3-vl:8b-instruct.
8. Check that pdftoppm and pdftotext are available for invoice processing.
9. Check application logs for connection or model errors while redacting filenames, invoice content, personal data, and financial values.
10. Propose the smallest safe fix and ask before modifying files, installing software, downloading a model, or restarting a process.

Do not bind Ollama or Buchhaltung to 0.0.0.0. Do not suggest port forwarding, public tunnels, disabling security controls, or sending documents to a cloud model.
```
