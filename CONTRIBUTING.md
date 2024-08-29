# Contributing to BarnieBot

Thank you for your interest in contributing to BarnieBot! We welcome contributions from the community to help improve and enhance the bot. Whether you have ideas for new features, bug fixes, or other improvements, we appreciate your help in making BarnieBot even better. Keep in mind that BarnieBot is not fully completed yet, but it is in a working state.

## Getting Started

To get started with contributing to BarnieBot, please follow these steps:

1. Fork the BarnieBot repository to your own GitHub account.
2. Clone the forked repository to your local machine.
3. Install the necessary dependencies by running `npm install --location=global typescript @types/node` and `npm install` in the project directory. We suggest using `ts-node` to run the bot before compiling it so you can test it faster. Keep in mind that there is an issue that makes some features to cause the bot to crash, we recommend you to never remove the `global.ReadbleStream = require('web-streams-polyfill').ReadableStream;` line in the `index.ts` file.
4. Remove the comment header from the `index.ts` file and replace it with the content in the `based.txt` file.
5. Make your changes to the codebase, following the existing code style and conventions.
6. Test your changes thoroughly to ensure they work as expected.
7. Commit your changes and push them to your forked repository.
8. Submit a pull request to the main BarnieBot repository for review.

## Code Guidelines

When contributing to BarnieBot, please adhere to the following guidelines:

- Follow the existing code style and formatting conventions.
- Write clear and concise commit messages.
- Document any new features or changes in the codebase.
- Test your changes thoroughly before submitting a pull request.
- Ensure that your code does not introduce any new bugs or issues.

## Issue Reporting

If you encounter any bugs, issues, or have suggestions for improvements, please open an issue on the BarnieBot GitHub repository. Provide as much detail as possible to help us understand and address the problem. We appreciate your feedback and will work to resolve any reported issues promptly.

## Code of Conduct

Please note that BarnieBot has a Code of Conduct that all contributors are expected to follow. By participating in this project, you agree to abide by its terms. The Code of Conduct can be found in the CODE_OF_CONDUCT.md file.

We appreciate your contributions to BarnieBot and look forward to working with you! If you have any questions or need assistance, please reach out to us via email at barniecorps@gmail.com