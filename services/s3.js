const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const S3Config = require('../models/S3Config');

let s3Client = null;
let currentBucket = null;

// Initialize S3 client from database config
async function initS3Client() {
  try {
    const config = await S3Config.getActiveConfig();
    if (!config) {
      console.log('No S3 configuration found. Please configure via admin panel.');
      s3Client = null;
      currentBucket = null;
      return false;
    }

    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey
      },
      forcePathStyle: config.forcePathStyle
    });

    currentBucket = config.bucket;
    console.log(`S3 client initialized with bucket: ${currentBucket}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize S3 client:', error);
    s3Client = null;
    currentBucket = null;
    return false;
  }
}

// Get S3 client
function getS3Client() {
  return s3Client;
}

// Get current bucket
function getBucket() {
  return currentBucket;
}

// Check if S3 is configured
function isS3Configured() {
  return s3Client !== null && currentBucket !== null;
}

// Upload file to S3
async function uploadFile(key, body, contentType, onProgress) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: currentBucket,
      Key: key,
      Body: body,
      ContentType: contentType
    }
  });

  if (onProgress) {
    upload.on('httpUploadProgress', onProgress);
  }

  return await upload.done();
}

// Get presigned upload URL
async function getUploadUrl(key, contentType, expiresIn = 3600) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: currentBucket,
    Key: key,
    ContentType: contentType
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

// Download file from S3 (get signed URL)
async function getDownloadUrl(key, expiresIn = 3600) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: currentBucket,
    Key: key
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

// Get file stream from S3
async function getFileStream(key) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: currentBucket,
    Key: key
  });

  const response = await s3Client.send(command);
  return response.Body;
}

// Delete file from S3
async function deleteFile(key) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const command = new DeleteObjectCommand({
    Bucket: currentBucket,
    Key: key
  });

  return await s3Client.send(command);
}

// Check if file exists
async function fileExists(key) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: currentBucket,
      Key: key
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

// List all objects under a prefix
async function listObjects(prefix) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const objects = [];
  let continuationToken;

  do {
    const command = new ListObjectsV2Command({
      Bucket: currentBucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });
    const response = await s3Client.send(command);
    if (response.Contents) {
      objects.push(...response.Contents);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

// Copy an object to a new key
async function copyObject(sourceKey, destKey) {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured');
  }

  const command = new CopyObjectCommand({
    Bucket: currentBucket,
    CopySource: `${currentBucket}/${sourceKey}`,
    Key: destKey
  });

  return await s3Client.send(command);
}

// Delete all objects under a prefix
async function deletePrefix(prefix) {
  const objects = await listObjects(prefix);
  for (const obj of objects) {
    await deleteFile(obj.Key);
  }
  return objects.length;
}

module.exports = {
  initS3Client,
  getS3Client,
  getBucket,
  isS3Configured,
  uploadFile,
  getUploadUrl,
  getDownloadUrl,
  getFileStream,
  deleteFile,
  fileExists,
  listObjects,
  copyObject,
  deletePrefix
};
