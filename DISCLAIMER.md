# Legal and Operational Disclaimer

## Purpose of the project

Buchhaltung is an open-source, local-first accounting assistant and expense-management tool. It helps users organize expense information, store documents, extract suggested invoice fields with a local AI model, and ask questions about locally stored records.

Buchhaltung is not represented or warranted to be:

- legally compliant accounting or bookkeeping software;
- a certified accounting, tax, audit, document-management, or archival system;
- a replacement for an accountant, tax adviser, lawyer, auditor, or other qualified professional;
- suitable as the sole system of record for statutory books, tax filings, audits, or legally required document retention; or
- approved, certified, endorsed, or accepted by any tax authority, regulator, court, professional body, or standards organization.

## No professional advice

The software, its source code, documentation, calculations, extracted fields, classifications, summaries, and AI-generated answers are provided for general organizational and informational purposes. They do not constitute accounting, tax, legal, audit, investment, or other professional advice.

Users must obtain advice from appropriately qualified professionals for their specific circumstances and jurisdiction.

## Human verification is required

AI models and deterministic extraction routines can misread, omit, invent, or incorrectly classify information. Errors can include invoice numbers, dates, supplier names, tax rates, currencies, net and gross values, recurring-payment classifications, line items, and accounting categories.

Users must compare every material result with the complete original source document before using it. AI output must never be treated as conclusive evidence or an authoritative accounting entry.

## User responsibility and jurisdiction

The user is solely responsible for determining which legal, accounting, tax, retention, audit, invoicing, and data-protection requirements apply. Requirements differ by country, business form, transaction, tax regime, industry, and retention period, and they may change over time.

The user remains responsible for, among other things:

- complete, accurate, timely, and orderly records;
- correct tax treatment, tax rates, classifications, declarations, and payments;
- legally sufficient invoices, supporting evidence, and reconciliation;
- retention of original records for the required period;
- authenticity of origin, integrity of content, legibility, and reproducibility of electronic documents where required;
- required audit trails, change histories, approvals, controls, exports, and access for examinations;
- checking current official requirements and professional guidance; and
- deciding whether the application is appropriate for any intended use.

Nothing in the repository guarantees compliance with Austrian BAO or UGB requirements, EU rules, generally accepted accounting principles, or requirements in any other jurisdiction.

## Records, retention, and document integrity

Saving a PDF or extracted value does not establish that a record is authentic, complete, unchanged, legally admissible, or preserved in a legally sufficient format.

The application does not currently provide immutable or write-once storage, cryptographic timestamping, qualified electronic signatures, formal version histories, certified archival controls, guaranteed migration, or guaranteed long-term readability. Records can be changed or deleted through the application, API, or local filesystem.

Users must retain original documents and any additional evidence required by applicable law. They must independently implement appropriate retention, preservation, export, and deletion procedures.

## Backups and availability

Data and uploaded files are stored locally. Local storage alone is not a backup. Hardware failure, filesystem corruption, software defects, accidental deletion, malware, theft, model errors, or user action can cause permanent loss or alteration.

Users are responsible for creating encrypted backups, keeping appropriate off-device copies, testing restoration, monitoring storage capacity, and ensuring records remain available throughout applicable retention periods. The project provides no service-level, durability, recovery-time, or availability guarantee.

## Privacy and confidentiality

Financial documents may contain confidential information and personal data. Local operation can reduce external data transfers, but it does not by itself guarantee confidentiality, security, or legal compliance.

Users are responsible for determining whether they have a lawful basis and appropriate authority to process each document. They must apply any required notices, access restrictions, retention limits, deletion procedures, processor agreements, security measures, and data-subject rights processes.

The configured `OLLAMA_URL` determines where invoice images, extracted document context, and chat context are processed. The default loopback address is local to the computer. If a user configures a remote or third-party endpoint, data may leave the computer and become subject to that provider's security, privacy, and contractual terms.

## Security

The current application is intended for a trusted, single-user computer and loopback-only access. It does not provide application-level authentication or authorization. It must not be exposed to a local network or the public internet without an independently designed and reviewed security layer.

Users are responsible for operating-system accounts, file permissions, disk and backup encryption, network configuration, endpoint security, patching, physical security, incident response, and secure deletion.

## Third-party components

Ollama, AI models, Poppler, Node.js, npm packages, and other third-party components are separate projects governed by their own licenses, security policies, privacy characteristics, and warranty terms. They are not bundled with this repository. Users are responsible for reviewing and accepting those terms and for evaluating model suitability, accuracy, hardware requirements, and provenance.

## No warranty and limitation under the license

The software is distributed under the MIT License and is provided "as is," without warranty. The complete warranty disclaimer and limitation of liability are stated in [LICENSE](LICENSE). If applicable law does not permit a particular exclusion or limitation, that exclusion or limitation applies only to the maximum extent permitted by law.

## Before business use

Before using Buchhaltung for business records, users should perform their own technical, security, privacy, legal, and accounting assessment; test the complete workflow with non-production data; establish human review; implement tested backups; and confirm the intended workflow with qualified advisers where appropriate.
