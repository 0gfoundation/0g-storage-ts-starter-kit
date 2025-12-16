import express from 'express';
import multer from 'multer';
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { ethers } from 'ethers';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Constants from environment variables
const RPC_URL = process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai/';
const INDEXER_RPC = process.env.INDEXER_RPC || 'https://indexer-storage-testnet-standard.0g.ai';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  throw new Error('Private key not found in environment variables');
}

// Initialize provider, signer and indexer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const indexer = new Indexer(INDEXER_RPC);

app.use(express.json());

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '0G Storage API',
      version: '1.0.0',
      description: 'API documentation for 0G Storage service',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/index.ts'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a file
 *     description: Upload a file to 0G Storage
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rootHash:
 *                   type: string
 *                 transactionHash:
 *                   type: string
 *       400:
 *         description: No file uploaded
 *       500:
 *         description: Server error
 */
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Create ZgFile from uploaded file
    const zgFile = await ZgFile.fromFilePath(req.file.path);
    const [tree, treeErr] = await zgFile.merkleTree();
    
    if (treeErr !== null) {
      throw new Error(`Error generating Merkle tree: ${treeErr}`);
    }

    // Upload file with new API syntax
    const [tx, uploadErr] = await indexer.upload(zgFile, RPC_URL, signer);

    if (uploadErr !== null) {
      throw new Error(`Upload error: ${uploadErr}`);
    }

    await zgFile.close();

    res.json({
      rootHash: tx.rootHash,
      transactionHash: tx.txHash
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * @swagger
 * /download/{rootHash}:
 *   get:
 *     summary: Download a file
 *     description: Download a file from 0G Storage using its root hash
 *     parameters:
 *       - in: path
 *         name: rootHash
 *         required: true
 *         schema:
 *           type: string
 *         description: The root hash of the file to download
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Server error
 */
app.get('/download/:rootHash', async (req, res) => {
  const { rootHash } = req.params;
  const outputPath = `downloads/${rootHash}`;

  try {
    const err = await indexer.download(rootHash, outputPath, true);
    
    if (err !== null) {
      throw new Error(`Download error: ${err}`);
    }

    res.download(outputPath, (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to send file' });
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
});