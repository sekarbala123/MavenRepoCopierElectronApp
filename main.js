const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const xml2js = require('xml2js');

const dbPath = path.join(app.getPath('userData'), 'artifacts.db');

let mainWindow;
let isListing = false;
let currentRequest = null;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  initDb();
});
let db;
function initDb() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Could not connect to database', err);
    } else {
      console.log('Connected to database');
      db.run(`CREATE TABLE IF NOT EXISTS artifacts (
        groupId TEXT,
        artifactId TEXT,
        version TEXT,
        lastUpdated INTEGER,
        PRIMARY KEY (groupId, artifactId, version)
      )`, (err) => {
        if (err) {
          console.error('Could not create table', err);
        } else {
          console.log('Artifacts table ensured');
        } 
      });
    }
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
// IPC Handlers
ipcMain.on('start-listing', async (event, { url, username, apiKey, repository }) => {
  try {
    // Use AQL to list artifacts
    console.log(`Attempting AQL request to: ${url}/artifactory/api/search/aql`);
    const aqlQuery = `items.find({"repo": "${repository}"})`; // AQL query to find items in a specific repo
    const response = await axios.post(`${url}/artifactory/api/search/aql`, aqlQuery, {
      auth: {
        username: username,
        password: apiKey,
      },
      headers: {
        'Content-Type': 'text/plain' // AQL queries are sent as plain text
      }
    });
    // Artifactory AQL results are typically in response.data.results
    event.sender.send('listing-update', { status: 'completed', artifacts: response.data.results });
  } catch (error) {
    console.error('Error fetching artifacts:', error.message);
    if (error.response) {
      console.error('Artifactory error response:', error.response.data);
    }
    event.sender.send('listing-update', { status: 'error', message: error.message });
  }
});

ipcMain.on('stop-listing', (event) => {
  if (currentRequest) {
    currentRequest.cancel();
    currentRequest = null;
  }
  isListing = false;
  console.log('Main process: Listing stopped.');
  event.sender.send('listing-update', { status: 'stopped' });
});

ipcMain.on('resume-listing', (event, { url, username, apiKey }) => {
  // For simplicity, resume will restart the listing. In a real app, you'd manage pagination state.
  console.log('Main process: Resuming listing...');
  ipcMain.emit('start-listing', event, { url, username, apiKey });
});

ipcMain.on('fetch-and-save-artifacts', async (event, { artifactoryUrl, username, apiKey, repository }) => {
  try {
    console.log(`Fetching and saving artifacts for repository: ${repository}`);
    const aqlQuery = `items.find({"repo": "${repository}"})`;

    const response = await axios.post(`${artifactoryUrl}/artifactory/api/search/aql`, aqlQuery, {
      auth: {
        username: username,
        password: apiKey,
      },
      headers: {
        'Content-Type': 'text/plain'
      }
    });

    const artifacts = response.data.results;
    console.log(`Found ${artifacts.length} artifacts in repository ${repository}`);

    db.serialize(() => {
      const stmt = db.prepare("INSERT OR REPLACE INTO artifacts (groupId, artifactId, version, lastUpdated) VALUES (?, ?, ?, ?)");
      artifacts.forEach(artifact => {
        // Extract groupId, artifactId, version from the path
        // Example path: com/example/my-artifact/1.0.0/my-artifact-1.0.0.jar
        const pathParts = artifact.path.split('/');
        let groupId = '';
        let artifactId = '';
        let version = '';

        if (pathParts.length >= 3) {
          // Assuming path structure: groupId/artifactId/version
          version = pathParts[pathParts.length - 1];
          artifactId = pathParts[pathParts.length - 2];
          groupId = pathParts.slice(0, pathParts.length - 2).join('.');
        }

        // Use artifact.updated for lastUpdated, convert to timestamp
        const lastUpdated = new Date(artifact.updated).getTime();

        if (groupId && artifactId && version) {
          stmt.run(groupId, artifactId, version, lastUpdated);
        }
      });
      stmt.finalize();
    });

    event.reply('fetch-and-save-artifacts-response', { success: true, message: `Successfully fetched and saved ${artifacts.length} artifacts from ${repository}.` });
  } catch (error) {
    console.error('Error fetching and saving artifacts:', error);
    event.reply('fetch-and-save-artifacts-response', { success: false, message: error.message });
  }
});

ipcMain.on('get-paginated-artifacts', (event, { page, limit }) => {
  const offset = (page - 1) * limit;
  db.all(`SELECT * FROM artifacts LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
    if (err) {
      event.reply('get-paginated-artifacts-response', { success: false, message: err.message });
      return;
    }
    db.get(`SELECT COUNT(*) as count FROM artifacts`, (err, result) => {
      if (err) {
        event.reply('get-paginated-artifacts-response', { success: false, message: err.message });
        return;
      }
      event.reply('get-paginated-artifacts-response', {
        success: true,
        artifacts: rows,
        total: result.count,
        page,
        limit
      });
    });
  });
});

ipcMain.on('get-repositories', async (event, { artifactoryUrl, username, apiKey }) => {
  try {
    const response = await axios.get(`${artifactoryUrl}/artifactory/api/repositories`, {
      auth: {
        username: username,
        password: apiKey,
      },
    });
    const repositories = response.data.map(repo => repo.key);
    event.reply('get-repositories-response', { success: true, repositories });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    event.reply('get-repositories-response', { success: false, message: error.message });
  }
});
