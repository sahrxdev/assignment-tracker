#!/usr/bin/env node
/**
 * Creates a ZIP file of the AssignmentTracker extension.
 * Run: node create-zip.js
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createZip() {
  console.log('Creating AssignmentTracker ZIP file...\n');

  const zip = new JSZip();
  const rootFolder = zip.folder('assignment-tracker');
  const extensionDirectories = [
    'background',
    'consent',
    'content',
    'icons',
    'lib',
    'options',
    'popup',
    'report'
  ];
  const rootFiles = ['manifest.json', 'README.md', 'PRIVACY.md'];

  function addFiles(dir, zipFolder) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        addFiles(filePath, zipFolder.folder(entry.name));
      } else if (entry.isFile()) {
        zipFolder.file(entry.name, fs.readFileSync(filePath));
      }
    }
  }

  for (const directory of extensionDirectories) {
    const directoryPath = path.join(__dirname, directory);
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Required extension directory not found: ${directory}`);
    }
    addFiles(directoryPath, rootFolder.folder(directory));
  }

  for (const file of rootFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required extension file not found: ${file}`);
    }
    rootFolder.file(file, fs.readFileSync(filePath));
  }

  console.log('Compressing files...');
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const outputPath = path.join(__dirname, 'assignment-tracker.zip');
  fs.writeFileSync(outputPath, zipBuffer);

  console.log('\nZIP file created successfully!');
  console.log(`   File: ${path.basename(outputPath)}`);
  console.log(`   Size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('\nTo install:');
  console.log('   1. Extract the ZIP file.');
  console.log('   2. Open chrome://extensions/.');
  console.log('   3. Enable "Developer mode".');
  console.log('   4. Click "Load unpacked".');
  console.log('   5. Select the extracted "assignment-tracker" folder.');
}

createZip().catch(error => {
  console.error('Error creating ZIP:', error);
  process.exitCode = 1;
});
