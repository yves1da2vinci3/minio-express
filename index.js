import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { Client } from "minio";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
// Set up the storage for multer
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderName = req.query.folderName;
    const uploadPath = path.join(__dirname, `./uploads/${folderName}`);
    // Check if the directory exists, and create it if not
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename using uuid
    const uniqueFileName = `${uuidv4()}-${file.originalname.trim()}`;
    cb(null, uniqueFileName);
  },
});

console.log("minnio endpoint :", process.env.ENDPOINT)
const upload = multer({ storage });
// Initialize MinIO client
const minioClient = new Client({
  endPoint: process.env.ENDPOINT,
  port: parseInt(process.env.PORT, 10),
  useSSL: process.env.USE_SSL === "true",
  accessKey: process.env.ACCESS_KEY,
  secretKey: process.env.SECRET_KEY,
});

// Route to handle file upload
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  console.log(file);
  const folderName = req.query.folderName;

  const filePath = `./uploads/${folderName}/${req.file.filename}`;
  if (!file) {
    return res.status(400).send("No file uploaded");
  }

  try {
    // Read the uploaded file
    const fileStream = fs.createReadStream(filePath);

    // Upload the file to MinIO
    await minioClient.putObject(
      process.env.BUCKET_NAME,
      file.originalname,
      fileStream
    );

    // Delete the temporary file
    fs.unlinkSync(filePath);

    res.send("File uploaded successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// Route to download a file from MinIO
app.get("/download/:filename", async (req, res) => {
  const filename = req.params.filename;

  try {
    // Check if the file exists
    const stat = await minioClient.statObject(
      process.env.BUCKET_NAME,
      filename
    );
    if (!stat) {
      return res.status(404).send("File not found");
    }

    // Stream the file from MinIO
    const stream = await minioClient.getObject(
      process.env.BUCKET_NAME,
      filename
    );

    // Pipe the stream to the response
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=${filename}`,
    });
    stream.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});
