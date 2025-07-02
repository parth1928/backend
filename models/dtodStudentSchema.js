const mongoose = require('mongoose');


const dtodStudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rollNum: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    sclassName: { type: mongoose.Schema.Types.ObjectId, ref: 'sclass' },
    createdAt: { type: Date, default: Date.now },
    attendance: [{
        date: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            enum: ['Present', 'Absent'],
            required: true
        },
        subName: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'subject',
            required: true
        }
    }]
});

module.exports = mongoose.model('dtod_students', dtodStudentSchema);
