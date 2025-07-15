// JWT utility example
const jwt = require('jsonwebtoken');

// Example function to create a JWT (can be moved to a utils file or used in controllers)
function createJWT(payload) {
    const secret = process.env.JWT_SECRET || 'defaultsecret';
    return jwt.sign(payload, secret, { expiresIn: '1h' });
}

const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const dotenv = require("dotenv")
const app = express()
const Routes = require("./routes/route.js")

const PORT = process.env.PORT || 5000

dotenv.config();

app.use(express.json({ limit: '10mb' }))

// CORS Configuration
const corsOptions = {
    origin: ['http://localhost:3000', 'https://bejewelled-sunburst-042cd0.netlify.app', 'https://attendance-frontend.netlify.app'],
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Headers'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Pre-flight requests
app.options('*', cors(corsOptions));

// Additional headers middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'false');
    next();
});

mongoose
    .connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(console.log("Connected to MongoDB"))
    .catch((err) => console.log("NOT CONNECTED TO NETWORK", err))

app.use('/', Routes);

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.listen(PORT, () => {
    console.log(`Server started at port no. ${PORT}`)
})