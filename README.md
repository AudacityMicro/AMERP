# Setup Sheet Generator

Electron + React app for creating jobshop machining setup sheets and work instructions.

## Run The App

Double-click:

```bat
Start-App.cmd
```

This launches the built Electron app directly. It does not require a dev server.

## Development Run

From this folder, run:

```bat
Start-Dev.cmd
```

The app prompts for a data folder on first launch. Jobs, libraries, templates, and copied step images are stored as JSON and files in that selected folder.

## Build Renderer

```bat
Build-App.cmd
```

## Development Notes

- Electron main process: `electron/main.cjs`
- Secure preload API: `electron/preload.cjs`
- React app and print packet view: `src/main.jsx`
- Styling: `src/styles.css`
- Data folders created by the app: `jobs/`, `libraries/`, `templates/`, and `assets/`

This first version runs locally on Windows. Installer/portable EXE packaging is intentionally deferred.
