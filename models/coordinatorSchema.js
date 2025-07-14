const mongoose = require("mongoose");

const coordinatorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: "Coordinator"
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin',
        required: true,
    },
    assignedClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sclass',
        required: true,
    }
}, { timestamps: true });

module.exports = mongoose.model("coordinator", coordinatorSchema);
