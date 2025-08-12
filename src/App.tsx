import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Form, Button, Table, Row, Col, Alert, Pagination, FormSelect } from 'react-bootstrap';

declare global {
  interface Window {
    electron: {
      send: (channel: string, data: any) => void;
      receive: (channel: string, func: (...args: any[]) => void) => () => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
  }
}

function App() {
  const [artifactoryUrl, setArtifactoryUrl] = useState('');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [groupId, setGroupId] = useState(''); // New state
  const [artifactId, setArtifactId] = useState(''); // New state
  const [artifacts, setArtifacts] = useState<any[]>([]); // This might become redundant later
  const [isListing, setIsListing] = useState(false); // This might become redundant later
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [repositories, setRepositories] = useState<string[]>([]); // New state for repositories
  const [selectedRepository, setSelectedRepository] = useState(''); // New state for selected repository

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalArtifacts, setTotalArtifacts] = useState(0);
  const [paginatedArtifacts, setPaginatedArtifacts] = useState<any[]>([]);

  useEffect(() => {
    const handleListingUpdate = (data: any) => {
      if (data.status === 'completed') {
        setIsListing(false);
        setStatusMessage('Artifact listing completed.');
        setError('');
      } else if (data.status === 'stopped') {
        setIsListing(false);
        setStatusMessage('Artifact listing stopped.');
        setError('');
      } else if (data.status === 'error') {
        setIsListing(false);
        setError(`Error: ${data.message}`);
        setStatusMessage('');
      }
    };

    const handlePaginatedArtifactsResponse = (response: any) => {
      if (response.success) {
        setPaginatedArtifacts(response.artifacts);
        setTotalArtifacts(response.total);
        setError('');
      } else {
        setError(`Error fetching paginated artifacts: ${response.message}`);
      }
    };

    const handleFetchAndSaveArtifactsResponse = (response: any) => {
      if (response.success) {
        setStatusMessage(response.message);
        window.electron.send('get-paginated-artifacts', { page: currentPage, limit: itemsPerPage });
      } else {
        setError(`Error fetching and saving: ${response.message}`);
      }
    };

    const handleGetRepositoriesResponse = (response: any) => {
      if (response.success) {
        setRepositories(response.repositories);
        if (response.repositories.length > 0) {
          setSelectedRepository(response.repositories[0]);
        }
      } else {
        setError(`Error fetching repositories: ${response.message}`);
      }
    };

    const cleanupListingUpdate = window.electron.receive('listing-update', handleListingUpdate);
    const cleanupPaginatedArtifactsResponse = window.electron.receive('get-paginated-artifacts-response', handlePaginatedArtifactsResponse);
    const cleanupFetchAndSaveArtifactsResponse = window.electron.receive('fetch-and-save-artifacts-response', handleFetchAndSaveArtifactsResponse);
    const cleanupGetRepositoriesResponse = window.electron.receive('get-repositories-response', handleGetRepositoriesResponse);

    // Initial load and whenever pagination states change
    window.electron.send('get-paginated-artifacts', { page: currentPage, limit: itemsPerPage });

    return () => {
      cleanupListingUpdate();
      cleanupPaginatedArtifactsResponse();
      cleanupFetchAndSaveArtifactsResponse();
      cleanupGetRepositoriesResponse();
    };
  }, [currentPage, itemsPerPage]);

  // Helper function to sanitize URL
  const sanitizeUrl = (url: string): string => {
    let sanitized = url.trim();
    // Remove trailing slash
    if (sanitized.endsWith('/')) {
      sanitized = sanitized.slice(0, -1);
    }
    // Remove leading slash (if it's not part of http(s)://)
    if (sanitized.startsWith('/') && !sanitized.startsWith('http')) {
      sanitized = sanitized.slice(1);
    }
    return sanitized;
  };

  const handleConnect = () => {
    if (artifactoryUrl && username && apiKey) {
      window.electron.send('get-repositories', { artifactoryUrl: sanitizeUrl(artifactoryUrl), username, apiKey });
    }
  };

  // Removed handleStop, handleResume as they are replaced by new functionality
  // Removed filteredArtifacts as pagination is now handled by backend

  return (
    <Container className="mt-4">
      <h1 className="mb-4">JFrog Artifactory Artifact Lister</h1>

      {error && <Alert variant="danger">{error}</Alert>}
      {statusMessage && <Alert variant="info">{statusMessage}</Alert>}

      <Form className="mb-4">
        <Row>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>Artifactory URL</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter Artifactory URL"
                value={artifactoryUrl}
                onChange={(e) => setArtifactoryUrl(e.target.value)}
                disabled={isListing}
              />
            </Form.Group>
          </Col>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isListing}
              />
            </Form.Group>
          </Col>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>API Key / Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter API Key or Password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isListing}
              />
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>Select Repository</Form.Label>
              <Form.Select
                value={selectedRepository}
                onChange={(e) => setSelectedRepository(e.target.value)}
                disabled={repositories.length === 0}
              >
                {repositories.length === 0 && <option>No repositories found</option>}
                {repositories.map(repo => (
                  <option key={repo} value={repo}>{repo}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>Group ID</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter Group ID (e.g., com.example)"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label>Artifact ID</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter Artifact ID (e.g., my-artifact)"
                value={artifactId}
                onChange={(e) => setArtifactId(e.target.value)}
              />
            </Form.Group>
          </Col>
        </Row>
        <Row className="mb-3">
          <Col>
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={!artifactoryUrl || !username || !apiKey}
            >
              Connect and Fetch Repositories
            </Button>
            <Button
              variant="success"
              onClick={() => window.electron.send('fetch-and-save-artifacts', { artifactoryUrl: sanitizeUrl(artifactoryUrl), username, apiKey, repository: selectedRepository })}
              disabled={!artifactoryUrl || !username || !apiKey || !selectedRepository}
              className="ms-2"
            >
              Load Repository Details
            </Button>
          </Col>
        </Row>
      </Form>

      

      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>Group ID</th>
            <th>Artifact ID</th>
            <th>Version</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {paginatedArtifacts.length > 0 ? (
            paginatedArtifacts.map((artifact, index) => (
              <tr key={`${artifact.groupId}-${artifact.artifactId}-${artifact.version}-${index}`}>
                <td>{artifact.groupId}</td>
                <td>{artifact.artifactId}</td>
                <td>{artifact.version}</td>
                <td>{new Date(artifact.lastUpdated).toLocaleString()}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="text-center">No artifacts found in local database.</td>
            </tr>
          )}
        </tbody>
      </Table>

      <div className="d-flex justify-content-center">
        <Pagination>
          <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} />
          {[...Array(Math.ceil(totalArtifacts / itemsPerPage))].map((_, index) => (
            <Pagination.Item
              key={index + 1}
              active={index + 1 === currentPage}
              onClick={() => setCurrentPage(index + 1)}
            >
              {index + 1}
            </Pagination.Item>
          ))}
          <Pagination.Next onClick={() => setCurrentPage(prev => prev + 1)} disabled={currentPage === Math.ceil(totalArtifacts / itemsPerPage)} />
        </Pagination>
      </div>
    </Container>
  );
}

export default App;
