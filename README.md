# geoguessr-app-github

This repository contains a clone application of GeoGuessr. It includes various development utilities and a modern dependency structure.

## Features

*   GeoGuessr game functionality (implied).
*   Support for various file types (implied by `mime` dependency).

## Development Tools and Scripts

This project utilizes several custom CLI tools for development workflow, which are linked directly from `node_modules/.bin`:

*   **`mime`**: Utility for MIME type handling.
*   **`mkdirp`**: Command-line utility for creating directories recursively.
*   **`nodemon`**: Tool for automatically restarting the server during development.
*   **`nodetouch`**: Utility for file touch operations.
*   **`prebuild-install`**: Script used during the build/installation process.
*   **`rc`**: Command-line interface tool.
*   **`semver`**: Version management utility.

## Installation and Dependencies

The project relies on a modern set of dependencies managed by `package-lock.json`.

**Note on Dependencies:**
The dependency tree has been updated to include packages like `better-sqlite3`, `buffer`, `busboy`, and `chokidar`, indicating a shift towards robust file handling and database interaction.

To install dependencies:
```bash
npm install
```

## Project Structure

The project structure includes standard application files alongside development scripts located in `node_modules/.bin`.

## Contributing

(Standard contribution guidelines would go here.)