const mongoose = require("mongoose")

const teacherSchema = new mongoose.Schema({
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
        default: "Teacher"
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin',
        required: true,
    },
    teachSubjects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'subject'
    }],
    teachSclass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sclass',
        required: true,
    },
    // Adding support for multiple classes
    teachClasses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sclass'
    }],
    attendance: [{
        date: {
            type: Date,
            required: true
        },
        presentCount: {
            type: String,
        },
        absentCount: {
            type: String,
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model("teacher", teacherSchema)