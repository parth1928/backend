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
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'https://bejewelled-sunburst-042cd0.netlify.app',
            'https://68754ae3af77a70008c8a8c6--bejewelled-sunburst-042cd0.netlify.app'
        ];

        // Check if the origin is allowed
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('netlify.app')) {
            callback(null, true);
        } else {
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
    .then(console.log("Connected to MongoDB"))
    .catch((err) => console.log("NOT CONNECTED TO NETWORK", err))

app.use('/', Routes);

app.listen(PORT, () => {
    console.log(`Server started at port no. ${PORT}`)
})