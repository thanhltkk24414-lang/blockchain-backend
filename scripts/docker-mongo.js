#!/usr/bin/env node
/**
 * Start MongoDB in a detached Docker container and exit immediately.
 * Reuses an existing container named "mongo" if present.
 */
const { execSync } = require('child_process');

const CONTAINER_NAME = 'mongo';
const IMAGE = 'mongo:7';
const PORT = '27017:27017';

function run(cmd, options = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
}

function containerExists() {
  try {
    run(`docker inspect ${CONTAINER_NAME}`);
    return true;
  } catch {
    return false;
  }
}

function containerRunning() {
  try {
    const status = run(`docker inspect -f "{{.State.Running}}" ${CONTAINER_NAME}`);
    return status === 'true';
  } catch {
    return false;
  }
}

function main() {
  try {
    run('docker --version');
  } catch {
    console.error('❌ Docker is not installed or not in PATH.');
    console.error('   Install Docker Desktop: https://www.docker.com/products/docker-desktop/');
    process.exit(1);
  }

  if (containerExists()) {
    if (containerRunning()) {
      console.log(`✅ MongoDB container "${CONTAINER_NAME}" is already running.`);
    } else {
      run(`docker start ${CONTAINER_NAME}`);
      console.log(`✅ Started existing MongoDB container "${CONTAINER_NAME}".`);
    }
  } else {
    run(`docker run -d -p ${PORT} --name ${CONTAINER_NAME} ${IMAGE}`);
    console.log(`✅ Created and started MongoDB container "${CONTAINER_NAME}" (detached).`);
  }

  console.log('');
  console.log('Connection string for backend/.env:');
  console.log('  MONGODB_URI=mongodb://127.0.0.1:27017/freelance-platform');
  console.log('');
  console.log('Use 127.0.0.1 (not localhost) on Windows to avoid IPv6 issues.');
  console.log('Stop MongoDB later: docker stop mongo');
  console.log('Remove container:    docker rm -f mongo');
}

main();
