import multer from "multer";
import path from "path";
import fs from "fs";
import { config } from "../../config/config.js";

// ✅ Always resolves to project root, regardless of where this file lives
const baseUploadsDir = path.join(process.cwd(), "uploads");

// Ensure base uploads directory exists
if (!fs.existsSync(baseUploadsDir)) {
    fs.mkdirSync(baseUploadsDir, { recursive: true });
}

const createStorage = (folderName = "users") => {
    return multer.diskStorage({
        destination: function (req, file, cb) {
            const uploadsDir = path.join(baseUploadsDir, folderName);
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            cb(null, uploadsDir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const ext = path.extname(file.originalname);
            const nameWithoutExt = path.basename(file.originalname, ext);
            const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, "_");
            cb(null, sanitizedName + "-" + uniqueSuffix + ext);
        },
    });
};

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
    }
};

// Get base URL from config
const getBaseUrl = () => {
    return config.BACKEND_URL || `http://localhost:${config.PORT || 5000}`;
};

// Single image upload (supports donation, user avatar, etc.)
export const uploadSingleImage = (fieldName = "image", folderName = "users") => {
    const upload = multer({
        storage: createStorage(folderName),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
        fileFilter,
    });

    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
            if (req.file) {
                const baseUrl = getBaseUrl();
                const fileUrl = `${baseUrl}/uploads/${folderName}/${req.file.filename}`;

                // Set the field in req.body
                req.body[fieldName] = fileUrl;

                // Also set in a separate location for easier access
                if (folderName === 'donations') {
                    req.donationImage = fileUrl;
                }
            }
            next();
        });
    };
};

// Multiple images upload (for products gallery, etc.)
export const uploadMultipleImages = (
    fieldName = "gallery",
    folderName = "products",
    maxCount = 10
) => {
    return (req, res, next) => {
        const upload = multer({
            storage: createStorage(folderName),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
            fileFilter,
        }).array(fieldName, maxCount);

        upload(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({
                        success: false,
                        message: "File too large. Maximum size is 10MB",
                    });
                }
                if (err.code === "LIMIT_UNEXPECTED_FILE") {
                    return res.status(400).json({
                        success: false,
                        message: `Too many files. Maximum is ${maxCount}`,
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            } else if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            }

            // Process uploaded files
            if (req.files && req.files.length > 0) {
                const baseUrl = getBaseUrl();
                req.body[fieldName] = req.files.map(
                    (file) => `${baseUrl}/uploads/${folderName}/${file.filename}`
                );
            }

            next();
        });
    };
};

// Flexible upload that can handle both single and multiple files
export const uploadFlexible = (fieldName, folderName, options = {}) => {
    const { single = true, maxCount = 10 } = options;

    if (single) {
        return uploadSingleImage(fieldName, folderName);
    } else {
        return uploadMultipleImages(fieldName, folderName, maxCount);
    }
};

// Donation specific upload with automatic field mapping
export const uploadDonationImage = (fieldName = "image", folderName = "donations") => {
    const upload = multer({
        storage: createStorage(folderName),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter,
    });

    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }

            // Handle image upload for donation
            if (req.file) {
                const baseUrl = getBaseUrl();
                const imageUrl = `${baseUrl}/uploads/${folderName}/${req.file.filename}`;

                // Check if body has donationData as string (form-data)
                if (req.body.donationData && typeof req.body.donationData === 'string') {
                    try {
                        const donationData = JSON.parse(req.body.donationData);
                        donationData.image = imageUrl;
                        req.body.donationData = JSON.stringify(donationData);
                    } catch (e) {
                        // If parsing fails, create new donationData
                        req.body.donationData = JSON.stringify({ image: imageUrl });
                    }
                } else if (req.body.donationData && typeof req.body.donationData === 'object') {
                    // donationData is already an object
                    req.body.donationData.image = imageUrl;
                } else {
                    // No donationData, create it
                    req.body.donationData = { image: imageUrl };
                }

                // Also store in body for direct access
                req.body[fieldName] = imageUrl;
            }

            next();
        });
    };
};
// In upload/index.js - Add this new function
export const uploadDonationWithNestedImage = (folderName = "donations") => {
    const upload = multer({
        storage: createStorage(folderName),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter,
    });

    return (req, res, next) => {
        // Use any() to accept all fields, then manually process
        upload.any()(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }

            // Look for file in any field that contains 'image'
            const imageFile = req.files?.find(f => f.fieldname === 'image' || f.fieldname === 'donationData[image]');

            if (imageFile) {
                const baseUrl = config.BACKEND_URL || `http://localhost:${config.PORT || 5000}`;
                const imageUrl = `${baseUrl}/uploads/${folderName}/${imageFile.filename}`;

                // Parse donationData if it exists
                if (req.body.donationData && typeof req.body.donationData === 'string') {
                    try {
                        const donationData = JSON.parse(req.body.donationData);
                        donationData.image = imageUrl;
                        req.body.donationData = donationData;
                    } catch (e) {
                        req.body.donationData = { image: imageUrl };
                    }
                } else if (req.body.donationData) {
                    req.body.donationData.image = imageUrl;
                } else {
                    // Build donationData from flattened fields
                    req.body.donationData = {
                        donorType: req.body['donationData[donorType]'],
                        name: req.body['donationData[name]'],
                        phone: req.body['donationData[phone]'],
                        email: req.body['donationData[email]'],
                        amount: req.body['donationData[amount]'],
                        description: req.body['donationData[description]'],
                        location: req.body['donationData[location]'],
                        benefit: req.body['donationData[benefit]'],
                        image: imageUrl
                    };

                    // Clean up flattened fields from body
                    Object.keys(req.body).forEach(key => {
                        if (key.startsWith('donationData[')) {
                            delete req.body[key];
                        }
                    });
                }
            }

            next();
        });
    };
};