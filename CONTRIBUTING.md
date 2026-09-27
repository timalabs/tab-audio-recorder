# Contributing to Tab Audio Recorder

Thank you for your interest in contributing! Tab Audio Recorder is an open-source, privacy-first browser extension designed for simplicity, performance, and transparency.

---

## Code of Conduct
We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please be respectful and constructive in all discussions, pull requests, and issue reports.

---

## Development Workflow

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Google Chrome** (or Chromium-based browser) and/or **Mozilla Firefox**

### 2. Setup
Clone the repository and install dependencies:
```bash
git clone https://github.com/timalabs/tab-audio-recorder.git
cd tab-audio-recorder
npm install
```

### 3. Local Development
To launch the Vite development server for the popup UI:
```bash
npm run dev
```

### 4. Building Unpacked Extensions
Build targets individually or simultaneously:
```bash
# Build both Chrome and Firefox
npm run build

# Build specific browser
npm run build:chrome
npm run build:firefox
```

Output directories:
- `dist/chrome/`: Ready to load in Chrome (`chrome://extensions/`)
- `dist/firefox/`: Ready to load in Firefox (`about:debugging#/runtime/this-firefox`)

---

## Code Quality Standards

Before submitting a pull request, ensure all checks pass:

1. **Type Checking**:
   ```bash
   npm run typecheck
   ```
2. **Linting**:
   ```bash
   npm run lint
   ```
3. **Unit Tests**:
   ```bash
   npm run test
   ```

---

## Submitting Pull Requests
1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Follow existing architectural conventions (keep platform-specific code in `src/platform/`).
3. Add unit tests in `tests/` for any new utility, parser, or state transition.
4. Verify that manual testing scenarios in [TESTING.md](TESTING.md) pass.
5. Submit a pull request with a descriptive summary of changes.
