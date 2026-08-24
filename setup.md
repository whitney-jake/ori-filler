# Setup Guide

This guide helps new contributors install the tools needed to build and test the Form Filler extension.

## Prerequisites

You need these tools:

- **Git** — to clone the repository
- **Node.js LTS** — to run build and test scripts
- **npm** — included with Node.js, required by package.json
- **Python 3** — to serve the test page over HTTP
- **Chrome or Firefox** — to load and test the unpacked extension

## Windows Setup

### Install Git

Open PowerShell and run:

```powershell
winget install --id Git.Git -e
```

Verify the install:

```powershell
git --version
```

### Install Node.js LTS

Run:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Or download from https://nodejs.org and run the installer.

Verify the install:

```powershell
node -v
npm -v
```

### Install Python 3

Run:

```powershell
winget install --id Python.Python.3.12 -e
```

Or download from https://www.python.org and run the installer.

Verify the install:

```powershell
python --version
```

### Install Chrome and/or Firefox

For Chrome:

```powershell
winget install --id Google.Chrome -e
```

For Firefox:

```powershell
winget install --id Mozilla.Firefox -e
```

## Mac Setup

### Install Homebrew

If you do not have Homebrew, install it from https://brew.sh.

### Install Git, Node.js, and Python 3

Run:

```bash
brew install git node python3
```

Verify the installs:

```bash
git --version
node -v
npm -v
python3 --version
```

### Install Chrome and/or Firefox

Run:

```bash
brew install --cask google-chrome firefox
```

## Clone the Repository

Run:

```bash
git clone https://github.com/your-org/ori-filler.git
cd ori-filler
```

Replace the URL with the correct repository URL.

## Install Dependencies

Run:

```bash
npm install
```

## Verify the Setup

Check that everything works:

```bash
npm run typecheck
npm run test
npm run build
```

All commands should complete without errors.

## Next Steps

Read the [README.md](README.md) for:

- How to load the extension in Chrome or Firefox
- How to run the test page
- How to author profiles
