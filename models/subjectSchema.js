const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
    subName: {
        type: String,
        required: true,
    },
    subCode: {
        type: String,
        required: true,
    },
    sessions: {
        type: String,
        required: true,
    },
    isLab: {
        type: Boolean,
        default: false,
    },
    batches: [
        {
            batchName: String,
            students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'student' }]
        }
    ],
    sclassName: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'sclass',
        required: true,
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'admin'
    },
    teachers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'teacher'
    }]
}, { timestamps: true });

module.exports = mongoose.model("subject", subjectSchema);