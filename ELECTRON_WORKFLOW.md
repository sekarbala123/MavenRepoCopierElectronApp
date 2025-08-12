# Electron Workflow and API Usage

This document provides a high-level overview of the Electron workflow, the major APIs used in this project, and how they are interconnected.

## 1. Introduction to Electron's Architecture

Electron applications have two main process types: the **Main Process** and one or more **Renderer Processes**.

### Main Process

* **What it is:** The entry point of the application (`main.js` in our case). It runs in a Node.js environment, meaning it has access to all Node.js APIs (`require`, `fs`, `path`, etc.) and can manage native desktop functionalities.
* **Responsibilities:**
* Creating and managing application windows (`BrowserWindow`).
* Handling application lifecycle events (e.g., `ready`, `window-all-closed`, `activate`).
* Performing backend tasks that you don't want to expose to the frontend, such as interacting with the file system, databases (SQLite in this project), and making network requests to external services (Artifactory).
* Listening for and responding to messages from the renderer process (IPC).

### Renderer Process

* **What it is:** The user interface of your application. It's essentially a web page running in a Chromium browser environment. In this project, it's our React application (`src/App.tsx`).
* **Responsibilities:**
* Rendering the UI.
* Handling user interactions.
* Sending messages to the main process to request backend operations (e.g., fetch data from Artifactory).
* **Limitations:** For security reasons, the renderer process does not have direct access to Node.js APIs or the file system. It communicates with the main process to perform such tasks.

### Communication: IPC (Inter-Process Communication)

The main and renderer processes communicate through IPC.
* `ipcMain` (in the main process) and `ipcRenderer` (in the renderer process) are used to send and receive messages.
* To securely expose APIs from the main process to the renderer, we use a `preload.js` script and `contextBridge`.

## 2. Key Electron APIs and Their Usage

### `app`

* **API:** `const { app } = require('electron');`
* **Usage in `main.js`:**
* `app.whenReady().then(...)`:  Waits for Electron to initialize before creating the main window.
* `app.on('window-all-closed', ...)`: Quits the application when all windows are closed (except on macOS).
* `app.on('activate', ...)`: Re-creates a window on macOS when the dock icon is clicked and no other windows are open.
* `app.getPath('userData')`: Gets the path to the user's data directory to store the SQLite database.

### `BrowserWindow`

* **API:** `const { BrowserWindow } = require('electron');`
* **Usage in `main.js`:**
* `new BrowserWindow(...)`: Creates a new application window.
* `webPreferences`:
    * `preload: path.join(__dirname, 'preload.js')`: Specifies the preload script to be executed before the renderer process is loaded. This is crucial for setting up secure communication.
    * `contextIsolation: true`: A security feature that ensures the preload script and the renderer's JavaScript run in separate contexts.
    * `nodeIntegration: false`: Disables Node.js integration in the renderer for security.
* `mainWindow.loadURL(...)`: Loads the React application (from `localhost:3000` in development or `build/index.html` in production).

### `ipcMain`

* **API:** `const { ipcMain } = require('electron');`
* **Usage in `main.js`:**
* `ipcMain.on(channel, (event, ...args) => { ... })`: Listens for messages from the renderer process on a specific `channel`.
* **Examples in this project:**
    * `ipcMain.on('start-listing', ...)`: Handles the request to start fetching artifacts from Artifactory.
    * `ipcMain.on('get-repositories', ...)`: Fetches the list of repositories.
    * `ipcMain.on('fetch-and-save-artifacts', ...)`: Fetches artifacts and saves them to the SQLite database.
    * `ipcMain.on('get-paginated-artifacts', ...)`: Retrieves paginated artifacts from the local database.
* `event.reply(channel, ...)` or `event.sender.send(channel, ...)`: Sends a message back to the renderer process that initiated the request.

### `ipcRenderer` and `contextBridge`

* **APIs:** `const { contextBridge, ipcRenderer } = require('electron');`
* **Usage in `preload.js`:**
* `contextBridge.exposeInMainWorld('electron', { ... })`: Securely exposes a custom `electron` API to the renderer process (the React app). This API is available on the `window.electron` object in the renderer.
* The exposed API provides `send` and `receive` methods that wrap `ipcRenderer.send` and `ipcRenderer.on` respectively. This prevents the renderer from having full access to the `ipcRenderer` object.
* A whitelist of valid channels is used to restrict which IPC channels can be used, enhancing security.

* **Usage in `src/App.tsx`:**
* `window.electron.send(channel, data)`: Sends a message to the main process. For example, `window.electron.send('get-repositories', { ... })`.
* `window.electron.receive(channel, callback)`: Registers a listener for messages from the main process. For example, `window.electron.receive('get-repositories-response', (response) => { ... })`.

## 3. Project-Specific Workflow

1. **Application Startup:**
    * The `electron .` command runs `main.js`.
    * The `app` object waits for the `ready` event.
    * A `BrowserWindow` is created. The `preload.js` script is loaded.
    * The main window loads the React application from `http://localhost:3000`.
    * The main process initializes the SQLite database.

2. **UI Interaction and Data Flow:**
    * The user interacts with the React UI in `App.tsx`.
    * When the user fills in the Artifactory details and clicks "Fetch Repositories", the following happens:
        1. The React component calls `window.electron.send('get-repositories', { ... })`.
        2. The `preload.js` script receives this call and uses `ipcRenderer` to send the message to the main process.
        3. In `main.js`, the `ipcMain.on('get-repositories', ...)` listener is triggered.
        4. The main process makes an API call to Artifactory using `axios`.
        5. Upon receiving the response, the main process sends the data back to the renderer using `event.reply('get-repositories-response', { ... })`.
        6. In `App.tsx`, the `window.electron.receive('get-repositories-response', ...)` listener receives the data and updates the React component's state, causing the UI to re-render with the list of repositories.

3. **Data Persistence:**
    * When the user clicks "Load Repository Details", a similar IPC flow occurs for the `fetch-and-save-artifacts` channel.
    * The main process fetches the artifact data and uses the `sqlite3` library to store it in a local database file (`artifacts.db`). This provides a local cache of the repository data.
    * The UI then fetches paginated data from this local database to display in the table, making the application more responsive and reducing the number of requests to Artifactory.
