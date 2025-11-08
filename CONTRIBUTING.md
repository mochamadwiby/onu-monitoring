# Contributing to ONU Monitoring System

First off, thank you for considering contributing to ONU Monitoring System!

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible using our bug report template.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Create an issue using the feature request template and provide the following information:

- Use a clear and descriptive title
- Provide a detailed description of the suggested enhancement
- Explain why this enhancement would be useful

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/onu-monitoring.git

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm test

# Start development server
npm run dev
```
