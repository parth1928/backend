// JWT utility example
const jwt = require('jsonwebtoken');

// Example function to create a JWT (can be moved to a utils file or used in controllers)
function createJWT(payload) {
    const secret = process.env.JWT_SECRET || 'defaultsecret';
    return jwt.sign(payload, secret, { expiresIn: '1h' });
}

const express = require("express")
const compression = require("compression")
const cors = require("cors")
const mongoose = require("mongoose")
const dotenv = require("dotenv")
const app = express()
const Routes = require("./routes/route.js")

const PORT = process.env.PORT || 5000

dotenv.config();

app.use(compression())
app.use(express.json({ limit: '10mb' }))

// Request logging middleware for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url} | Origin: ${req.headers.origin || 'No origin'} | Content-Type: ${req.headers['content-type'] || 'No content-type'}`);
    next();
});

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        console.log('CORS request from origin:', origin);
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://192.168.1.128:3000',  // Allow your local IP
            'https://bejewelled-sunburst-042cd0.netlify.app',
            'https://68754ae3af77a70008c8a8c6--bejewelled-sunburst-042cd0.netlify.app'
        ];

        // Check if the origin is allowed
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('netlify.app')) {
            callback(null, true);
        } else {
            console.log('Origin not allowed by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Pre-flight requests
app.options('*', cors(corsOptions));

mongoose
    .connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => {
        console.log('Connected to MongoDB successfully');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
    })

app.use('/', Routes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`MongoDB connection: ${process.env.MONGO_URL ? 'Configured' : 'Not configured'}`);
    console.log(`CORS allowed origins: http://localhost:3000, http://192.168.1.128:3000, and domains ending with netlify.app`);
    console.log(`Auth routes: /AdminLogin, /StudentLogin, /TeacherLogin, /CoordinatorLogin`);
})